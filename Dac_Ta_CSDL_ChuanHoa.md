# ĐẶC TẢ CƠ SỞ DỮ LIỆU CHUẨN HÓA (FIREBASE CLOUD FIRESTORE SPECIFICATION v2.0)

**Đề tài:** HỆ THỐNG THƯ VIỆN / SÀN TRAO ĐỔI GIÁO TRÌNH & THIẾT BỊ CŨ TRONG TRƯỜNG HỌC (**UniExchange**)  
**Phiên bản:** 2.0 (Đã rà soát, vá 7 lỗ hổng thiết kế và đồng bộ 100% với SRS, ERD & Source Code)

---

## 1. TỔNG QUAN KIẾN TRÚC FIREBASE

Kiến trúc hệ thống tận dụng hệ sinh thái Serverless của Google Firebase đảm bảo tốc độ phản hồi thời gian thực (Realtime), giao dịch nguyên tử chống tranh chấp (`ACID Transaction`) và chi phí đọc/ghi tối ưu:

- **Firebase Authentication:** Định danh sinh viên bằng UID duy nhất, hỗ trợ đăng nhập bằng Email trường (`@*.edu.vn`), Google OAuth và SĐT OTP; phân quyền `student` / `admin`.
- **Cloud Firestore:** Cơ sở dữ liệu NoSQL hướng tài liệu (Document-oriented), kết hợp **8 Root Collections** và **3 Subcollections**, đồng bộ dữ liệu hai chiều tức thời qua `onSnapshot`.
- **Firebase Cloud Storage:** Lưu trữ tệp ảnh chụp thực tế của giáo trình và thiết bị; URL ảnh nhúng trực tiếp vào mảng `image_urls` và `primary_image` của `items`.
- **Firestore Transactions & Cloud Functions:** Xử lý nghiệp vụ giữ chỗ độc quyền `runTransaction` chống Race Condition (`NFR-01`) và kiểm soát sổ cái Điểm tín nhiệm bất biến (`FR-07`).
- **Cloud Scheduler (Cronjob 5 phút/lần):** Quét tự động các bản ghi `holds` quá hạn 24–48h để giải phóng vật phẩm về `available` và trừ điểm uy tín (`NFR-03`).

---

## 2. SƠ ĐỒ CẤU TRÚC COLLECTIONS VÀ SUBCOLLECTIONS

```text
firestore-root
│
├── users/                              (Root Collection - Hồ sơ sinh viên & Admin)
│    └── {userId}                       (Document ID == Firebase Auth UID)
│         └── trust_history/            (Subcollection - Sổ cái bất biến lịch sử điểm uy tín)
│              └── {logId}
│
├── categories/                         (Root Collection - Danh mục vật phẩm: giao-trinh, thiet-bi...)
│    └── {categoryId}
│
├── subjects/                           (Root Collection - Danh mục học phần chính quy: INT1340...)
│    └── {subjectId}
│
├── items/                              (Root Collection - Bài đăng giáo trình & thiết bị)
│    └── {itemId}
│         └── moderation_logs/          (Subcollection - Nhật ký kiểm duyệt của Admin)
│              └── {modLogId}
│
├── holds/                              (Root Collection - Phiên giữ chỗ 24-48h chống Race Condition)
│    └── {holdId}
│
├── meetup_locations/                   (Root Collection - Điểm hẹn an toàn nội khu trường học)
│    └── {locationId}
│
├── meetups/                            (Root Collection - Chi tiết lịch hẹn gặp trao đổi 1:1 với Hold)
│    └── {meetupId}
│
└── transactions/                       (Root Collection - Hợp đồng giao dịch hoàn tất mua/nhận tặng)
     └── {transactionId}
          └── status_logs/              (Subcollection - Audit Trail lịch sử trạng thái giao dịch)
               └── {logId}
```

---

## 3. ĐẶC TẢ CHI TIẾT TỪNG COLLECTION (ĐÃ CHUẨN HÓA)

### 3.1. Collection: `users`
- **Document ID:** `userId` (Trùng khớp 100% với `request.auth.uid`).

| STT | Tên trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả nghiệp vụ |
| :-: | :--- | :--- | :---: | :---: | :--- |
| 1 | `student_id_code` | String | Có | — | Mã số sinh viên chính quy (VD: `'B21DCCN001'`). |
| 2 | `email` | String | Có | — | Email trường cấp (`@*.edu.vn`) hoặc email xác thực. |
| 3 | `full_name` | String | Có | — | Họ và tên đầy đủ của sinh viên. |
| 4 | `phone_number` | String | Có | `""` | Số điện thoại liên lạc khi gặp tại điểm hẹn. |
| 5 | `avatar_url` | String | Không | `""` | Đường dẫn ảnh đại diện. |
| 6 | `role` | String | Có | `"student"` | Phân quyền: `'student'`, `'admin'`. |
| 7 | `current_trust_score` | Number (Int) | Có | `100` | Điểm tín nhiệm hiện tại (Khởi tạo `100`; `< 50` bị khóa giữ chỗ). |
| 8 | `status` | String | Có | `"active"` | Trạng thái tài khoản: `'active'`, `'suspended'`, `'banned'`. |
| 9 | `hold_locked_until` | Timestamp \| null | Không | `null` | Mốc thời gian khóa quyền giữ chỗ khi vi phạm/điểm dưới 50. |
| 10 | `created_at` | Timestamp | Có | `request.time` | Thời điểm tạo tài khoản. |
| 11 | `updated_at` | Timestamp | Có | `request.time` | Thời điểm cập nhật hồ sơ gần nhất. |

### 3.2. Subcollection: `users/{userId}/trust_history`
- **Mục đích:** Sổ cái bất biến (*Append-only Ledger* — cấm `update` và `delete`).

| STT | Tên trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả nghiệp vụ |
| :-: | :--- | :--- | :---: | :---: | :--- |
| 1 | `score_change` | Number (Int) | Có | — | Số điểm biến động: `0` (khởi tạo), `+5`, `-10`, `-30`, hoặc điều chỉnh Admin. |
| 2 | `balance_after` | Number (Int) | **Có** | — | Điểm tích lũy ngay sau khi áp dụng biến động (đối soát sổ cái). |
| 3 | `event_type` | String | Có | — | `'INIT'`, `'COMPLETE_TX'`, `'CANCEL_HOLD'`, `'EXPIRED_HOLD'`, `'NO_SHOW'`, `'ADMIN_ADJUST'`. |
| 4 | `reference_id` | String \| null | Không | `null` | ID của `holdId` hoặc `transactionId` liên quan. |
| 5 | `description` | String | Có | — | Lý do chi tiết hiển thị minh bạch cho sinh viên. |
| 6 | `created_at` | Timestamp | Có | `request.time` | Thời điểm phát sinh biến động điểm. |

### 3.3. Collection: `categories`
- **Document ID:** Slug danh mục (`'giao-trinh'`, `'thiet-bi'`, `'tai-lieu'`, `'khac'`).
- **Các trường:** `category_name` (String, bắt buộc), `description` (String), `display_order` (Number, mặc định `1`), `is_active` (Boolean, mặc định `true`).

### 3.4. Collection: `subjects`
- **Document ID:** Mã học phần viết hoa (`'INT1340'`, `'BAS1201'`, ...).
- **Các trường:** `subject_code` (String, bắt buộc), `subject_name` (String, bắt buộc), `faculty` (String, bắt buộc), `is_active` (Boolean, mặc định `true`).

### 3.5. Collection: `items`

| STT | Tên trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả nghiệp vụ |
| :-: | :--- | :--- | :---: | :---: | :--- |
| 1 | `seller_id` | String | Có | — | UID người đăng bài -> `users/{userId}`. |
| 2 | `seller_summary` | Map | Có | — | Nhúng `{ full_name, trust_score, avatar_url }` giảm 60% Read Ops trang chủ. |
| 3 | `category_id` | String | Có | — | Slug tham chiếu `categories/{categoryId}`. |
| 4 | `subject_id` | String \| null | Không | `null` | Mã học phần tham chiếu `subjects/{subjectId}`. |
| 5 | `subject_name` | String | Không | `""` | Tên/mã môn hiển thị nhanh phục vụ tìm kiếm tức thời. |
| 6 | `title` | String | Có | — | Tiêu đề bài đăng (`1..100` ký tự). |
| 7 | `description` | String | Có | — | Mô tả chi tiết tình trạng sách/thiết bị (`<= 1000` ký tự). |
| 8 | `item_type` | String | Có | `"gift"` | `'gift'` (Tặng miễn phí 0đ) hoặc `'sell'` (Nhượng lại giá tượng trưng). |
| 9 | `price` | Number | Có | `0` | Giá chuyển nhượng VND (`>= 0`; bắt buộc `= 0` nếu `item_type == 'gift'`). |
| 10 | `condition_level` | String | Có | `"used_good"` | `'new_99'` (Mới 95–100%), `'used_good'` (Tốt 80–90%), `'used_acceptable'` (Khá 60–75%). |
| 11 | `image_urls` | Array[String] | Có | `[]` | Mảng URL hình ảnh trên Firebase Storage. |
| 12 | `primary_image` | String | Có | `""` | Ảnh đại diện chính hiển thị trên thẻ bài đăng. |
| 13 | `item_status` | String | Có | `"available"` | `'available'`, `'held'`, `'completed'`, `'hidden'`. |
| 14 | `active_hold_id` | String \| null | Không | `null` | **Khóa giữ chỗ nguyên tử:** lưu `holdId` đang có hiệu lực (`null` khi rảnh). |
| 15 | `moderation_status` | String | Có | `"pending"` | `'pending'` (Chờ duyệt), `'approved'` (Đã duyệt), `'rejected'` (Từ chối). |
| 16 | `reject_reason` | String \| null | Không | `null` | Lý do từ chối gần nhất để `Seller` biết và sửa bài. |
| 17 | `created_at` | Timestamp | Có | `request.time` | Thời điểm đăng tin. |
| 18 | `updated_at` | Timestamp | Có | `request.time` | Thời điểm cập nhật gần nhất. |

### 3.6. Subcollection: `items/{itemId}/moderation_logs`
- **Các trường:** `admin_id` (String, bắt buộc), `action` (`'approve' | 'reject' | 'hide'`, bắt buộc), `reason` (String), `created_at` (Timestamp, bắt buộc).

### 3.7. Collection: `holds` (Đã bổ sung Summary nhúng tối ưu Read Ops)

| STT | Tên trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả nghiệp vụ |
| :-: | :--- | :--- | :---: | :---: | :--- |
| 1 | `item_id` | String | Có | — | Tham chiếu `items/{itemId}`. |
| 2 | `item_title` | String | Có | — | Tên vật phẩm nhúng. |
| 3 | `primary_image` | String | Không | `""` | Ảnh đại diện nhúng để hiển thị thẻ Lịch hẹn. |
| 4 | `seller_id` | String | Có | — | UID người đăng vật phẩm. |
| 5 | `seller_summary` | Map | Không | — | Nhúng `{ full_name, phone_number }` để liên lạc hẹn gặp. |
| 6 | `requester_id` | String | Có | — | UID người đặt giữ chỗ (`requester_id != seller_id`). |
| 7 | `requester_summary` | Map | Không | — | Nhúng `{ full_name, phone_number }` để `Seller` biết người nhận. |
| 8 | `meetup_summary` | Map | Không | — | Nhúng `{ location_id, location_name, proposed_time, note }`. |
| 9 | `hold_start_time` | Timestamp | Có | `request.time` | Thời điểm đặt giữ chỗ. |
| 10 | `hold_expires_at` | Timestamp | Có | — | Thời điểm hết hạn (`hold_start_time` + 24h hoặc 48h). |
| 11 | `hold_status` | String | Có | `"active"` | `'active'`, `'expired'`, `'cancelled'`, `'converted'`. |
| 12 | `cancel_reason` | String \| null | Không | `null` | Lý do hủy hoặc `"Quá hạn 24-48h"`. |
| 13 | `created_at` | Timestamp | Có | `request.time` | Thời điểm tạo bản ghi. |
| 14 | `updated_at` | Timestamp | Có | `request.time` | Thời điểm chuyển trạng thái. |

### 3.8. Collection: `meetup_locations`
- **Document ID:** Slug địa điểm (`'thu-vien-trung-tam'`, `'sanh-nha-a'`, `'nha-van-hoa-sv'`, `'can-tin-trung-tam'`).
- **Các trường:** `location_name` (String), `campus` (String), `landmark_description` (String), `is_active` (Boolean).

### 3.9. Collection: `meetups` (Đã bổ sung `updated_at` & Security Rules)
- **Các trường:** `hold_id` (String, 1:1 với `holds`), `item_id` (String), `seller_id` (String), `buyer_id` (String), `location_id` (String), `location_name` (String), `proposed_time` (Timestamp), `status` (`'proposed' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed'`), `note` (String), `created_at` (Timestamp), `updated_at` (Timestamp).

### 3.10. Collection: `transactions` & Subcollection `status_logs` (Đã chuẩn hóa mốc thời gian)
- **`transactions`:** `item_id`, `item_title`, `hold_id`, `seller_id`, `buyer_id`, `final_amount` (`>= 0`), `payment_method` (`'free' | 'cash' | 'bank_transfer'`), `current_status` (`'pending' | 'completed' | 'disputed' | 'cancelled'`), `completed_at` (`Timestamp | null` — chỉ khác `null` khi `completed`), `created_at` (`Timestamp`), `updated_at` (`Timestamp`).
- **`transactions/{txId}/status_logs`:** `from_status` (`String | null`), `to_status` (`String`), `changed_by` (`String`), `reason` (`String`), `timestamp` (`Timestamp`).

---

## 4. QUY TRÌNH GIAO DỊCH NGUYÊN TỬ (`runTransaction`) ĐÃ VÁ LỖI

### 4.1. Đặt Giữ Chỗ & Tạo Lịch Hẹn Nguyên Tử (`createHoldOrder`)
1. Đọc đồng thời `users/{requesterId}` và `items/{itemId}` bên trong `db.runTransaction(...)`.
2. Kiểm tra điều kiện tiên quyết:
   - `user.status === 'active'` và `user.current_trust_score >= 50` (và `hold_locked_until == null || hold_locked_until <= now`).
   - `item.moderation_status === 'approved'`, `item.item_status === 'available'`, `item.active_hold_id === null`.
   - `item.seller_id !== requesterId`.
3. Ghi nguyên tử trong cùng Transaction:
   - Tạo `holds/{newHoldId}` với `hold_status = 'active'` và `hold_expires_at = now + durationHours`.
   - Tạo `meetups/{newMeetupId}` với `hold_id = newHoldId`, `proposed_time`, `location_id`, `status = 'proposed'`.
   - Cập nhật `items/{itemId}`: `item_status = 'held'`, `active_hold_id = newHoldId`, `updated_at = now`.

### 4.2. Tiến Trình Tự Động Giải Phóng Quá Hạn (`scheduledHoldAutoRelease`) — Đã sửa `balance_after`
Khi quét thấy bản ghi `holds` có `hold_status == 'active'` và `hold_expires_at <= now`:
1. Thực thi `db.runTransaction` cho từng phiên hết hạn để đọc chính xác `current_trust_score` hiện tại của `requester_id`.
2. Tính `newBalance = Math.max(0, currentScore - 10)` và nếu `newBalance < 50` thì gán `hold_locked_until = now + 7 ngày`.
3. Cập nhật đồng bộ:
   - `holds/{holdId}`: `hold_status = 'expired'`, `cancel_reason = 'Quá hạn giữ chỗ 24-48h'`.
   - `items/{itemId}`: `item_status = 'available'`, `active_hold_id = null`.
   - `users/{requesterId}`: `current_trust_score = newBalance`, `hold_locked_until`.
   - Thêm mới bản ghi `users/{requesterId}/trust_history/{logId}` có đầy đủ `score_change: -10`, **`balance_after: newBalance`**, `event_type: 'EXPIRED_HOLD'`.
