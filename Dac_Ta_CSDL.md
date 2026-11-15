# ĐẶC TẢ CƠ SỞ DỮ LIỆU CHUẨN HÓA (FIREBASE CLOUD FIRESTORE SPECIFICATION v2.1)

**Đề tài:** HỆ THỐNG THƯ VIỆN / SÀN TRAO ĐỔI GIÁO TRÌNH & THIẾT BỊ CŨ TRONG TRƯỜNG HỌC (**UniExchange**)  
**Phiên bản:** 2.1 (Chuẩn hóa Kiến trúc Transaction ACID, Khóa OCC, Chống Write Skew & Giao dịch Đồ cũ 2 Pha)  
**Hạ tầng Cloud Firestore:** Database định danh `ai-studio-planit-c53a22dd-bec2-45c8-8ceb-d38f69c9d02b` (`FIRESTORE_NATIVE`, `ENTERPRISE`, Region `asia-east1`, `concurrencyMode: OPTIMISTIC`)

---

## 1. TỔNG QUAN KIẾN TRÚC FIREBASE

Kiến trúc hệ thống tận dụng hệ sinh thái Serverless của Google Firebase đảm bảo tốc độ phản hồi thời gian thực (Realtime), giao dịch nguyên tử chống tranh chấp (`ACID Transaction` theo mô hình `OPTIMISTIC` OCC) và chi phí đọc/ghi tối ưu:

- **Firebase Authentication:** Định danh sinh viên bằng UID duy nhất, hỗ trợ đăng nhập bằng Email trường (`@*.edu.vn`), Google OAuth và SĐT OTP; phân quyền `student` / `admin` (yêu cầu `email_verified == true` với bootstrap admin).
- **Cloud Firestore (`OPTIMISTIC` Native Mode):** Cơ sở dữ liệu NoSQL hướng tài liệu (Document-oriented), kết hợp **9 Root Collections** và **3 Subcollections**, đồng bộ dữ liệu hai chiều tức thời qua `onSnapshot`.
- **Firebase Cloud Storage:** Lưu trữ tệp ảnh chụp thực tế của giáo trình và thiết bị (`< 5MB`, `image/*`); URL ảnh nhúng trực tiếp vào mảng `image_urls` và `primary_image` của `items`.
- **Firestore `runTransaction` & Cloud Functions (Gen 2):** Xử lý nghiệp vụ giữ chỗ độc quyền `runTransaction` chống *Race Condition* & *Write Skew* (`NFR-01`), xác thực bàn giao 2 pha (`hold_secrets`), đóng băng tranh chấp (`disputed`) và kiểm soát sổ cái Điểm tín nhiệm bất biến với ID xác định (`FR-07`).
- **Dual-Trigger Auto-Release (Cloud Scheduler + Client Lazy Sweep):** Quét tự động các bản ghi `holds` ở trạng thái `active` quá hạn 24–48h (áp dụng biên độ chống lệch đồng hồ 60s ở Client) để giải phóng vật phẩm về `available`, giảm `active_holds_count` và trừ điểm uy tín (`NFR-03`).

---

## 2. SƠ ĐỒ CẤU TRÚC COLLECTIONS VÀ SUBCOLLECTIONS

```text
firestore-root
│
├── users/                              (Root Collection - Hồ sơ sinh viên, active_holds_count & Admin)
│    └── {userId}                       (Document ID == Firebase Auth UID)
│         └── trust_history/            (Subcollection - Sổ cái bất biến, ID xác định theo sự kiện)
│              └── {logId}              (INIT | COMPLETE_TX_{holdId} | CANCEL_HOLD_{holdId} | EXPIRED_HOLD_{holdId})
│
├── categories/                         (Root Collection - Danh mục vật phẩm: giao-trinh, thiet-bi...)
│    └── {categoryId}
│
├── subjects/                           (Root Collection - Danh mục học phần chính quy: INT1340...)
│    └── {subjectId}
│
├── items/                              (Root Collection - Bài đăng đồ cũ + Fencing Token version)
│    └── {itemId}
│         └── moderation_logs/          (Subcollection - Nhật ký kiểm duyệt của Admin)
│              └── {modLogId}
│
├── holds/                              (Root Collection - Phiên giữ chỗ 24-48h, giá thương lượng & tranh chấp)
│    └── {holdId}
│
├── hold_secrets/                       (Root Collection - Mã PIN 6 số bàn giao 1:1 với holds, cách ly đọc)
│    └── {holdId}                       (Chỉ requester_id được phép read; Security Rules kiểm khi hoàn tất)
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
| 7 | `current_trust_score` | Number (Int) | Có | `100` | Điểm tín nhiệm hiện tại (`0..200`, khởi tạo `100`; `< 50` bị khóa giữ chỗ). |
| 8 | `status` | String | Có | `"active"` | Trạng thái tài khoản: `'active'`, `'suspended'`, `'banned'`. |
| 9 | `active_holds_count` | Number (Int) | Có | `0` | **Bộ đếm nguyên tử chống Write Skew:** số phiên giữ chỗ đang `active` (`0..3`). |
| 10 | `hold_locked_until` | Timestamp \| null | Không | `null` | Mốc thời gian khóa quyền giữ chỗ 7 ngày khi vi phạm/điểm dưới 50. |
| 11 | `last_trust_ref_id` | String \| null | Không | `null` | Con trỏ tham chiếu `holdId` gần nhất để Security Rules đối soát qua `get()`/`getAfter()`. |
| 12 | `created_at` | Timestamp | Có | `request.time` | Thời điểm tạo tài khoản. |
| 13 | `updated_at` | Timestamp | Có | `request.time` | Thời điểm cập nhật hồ sơ gần nhất. |

### 3.2. Subcollection: `users/{userId}/trust_history`
- **Document ID (Deterministic Idempotent Key):** `INIT`, `COMPLETE_TX_{holdId}`, `CANCEL_HOLD_{holdId}`, `EXPIRED_HOLD_{holdId}` (hoặc UUID tự sinh cho `NO_SHOW` / `ADMIN_ADJUST` do Admin thực thi). Security Rules cấm ghi đè (`!exists(...)`) để chống cộng/trừ điểm kép khi `runTransaction` retry.
- **Mục đích:** Sổ cái bất biến (*Append-only Ledger* — cấm `update` và `delete`).

| STT | Tên trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả nghiệp vụ |
| :-: | :--- | :--- | :---: | :---: | :--- |
| 1 | `score_change` | Number (Int) | Có | — | Số điểm biến động thực tế đã kẹp biên (`appliedDelta = newBalance - currentScore`). |
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
| 15 | `version` | Number (Int) | Có | `1` | **Fencing Token đơn điệu:** tăng `+1` mỗi lần chuyển khóa giữ chỗ/hoàn tất để phát hiện stale update. |
| 16 | `moderation_status` | String | Có | `"pending"` | `'pending'` (Chờ duyệt), `'approved'` (Đã duyệt), `'rejected'` (Từ chối). |
| 17 | `reject_reason` | String \| null | Không | `null` | Lý do từ chối gần nhất để `Seller` biết và sửa bài. |
| 18 | `created_at` | Timestamp | Có | `request.time` | Thời điểm đăng tin. |
| 19 | `updated_at` | Timestamp | Có | `request.time` | Thời điểm cập nhật gần nhất. |

### 3.6. Subcollection: `items/{itemId}/moderation_logs`
- **Các trường:** `admin_id` (String, bắt buộc), `action` (`'approve' | 'reject' | 'hide'`, bắt buộc), `reason` (String), `created_at` (Timestamp, bắt buộc).

### 3.7. Collection: `holds` (Đã bổ sung Summary nhúng, Thương lượng giá & Đóng băng Tranh chấp)

| STT | Tên trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả nghiệp vụ |
| :-: | :--- | :--- | :---: | :---: | :--- |
| 1 | `item_id` | String | Có | — | Tham chiếu `items/{itemId}`. |
| 2 | `item_title` | String | Có | — | Tên vật phẩm nhúng. |
| 3 | `item_type` | String | Có | `"gift"` | `'gift'` (Tặng 0đ) hoặc `'sell'` (Nhượng giá tượng trưng). |
| 4 | `item_price` | Number | Có | `0` | Giá niêm yết gốc của vật phẩm tại thời điểm giữ chỗ. |
| 5 | `offered_price` | Number | Có | `0` | **Giá thương lượng đề xuất** bởi `Requester` (`0` với `gift`; `50%..100%` `item_price` với `sell`). |
| 6 | `agreed_price` | Number | Có | `0` | **Giá thỏa thuận cuối cùng** được `Seller` chốt khi `confirm` lịch hẹn (lưu vào `transactions.final_amount`). |
| 7 | `primary_image` | String | Không | `""` | Ảnh đại diện nhúng để hiển thị thẻ Lịch hẹn. |
| 8 | `seller_id` | String | Có | — | UID người đăng vật phẩm. |
| 9 | `seller_summary` | Map | Không | — | Nhúng `{ full_name, phone_number }` để liên lạc hẹn gặp. |
| 10 | `requester_id` | String | Có | — | UID người đặt giữ chỗ (`requester_id != seller_id`). |
| 11 | `requester_summary` | Map | Không | — | Nhúng `{ full_name, phone_number }` để `Seller` biết người nhận. |
| 12 | `meetup_summary` | Map | Không | — | Nhúng `{ meetup_id, location_id, location_name, proposed_time, status, buyer_confirmed, note }`. |
| 13 | `hold_start_time` | Timestamp | Có | `request.time` | Thời điểm đặt giữ chỗ. |
| 14 | `hold_expires_at` | Timestamp | Có | — | Thời điểm hết hạn (`hold_start_time` + 24h hoặc 48h). |
| 15 | `hold_status` | String | Có | `"active"` | `'active'`, `'expired'`, `'cancelled'`, `'converted'`, `'disputed'` (Đóng băng tranh chấp). |
| 16 | `version` | Number (Int) | Có | `1` | Fencing Token phiên giữ chỗ, tăng `+1` khi chuyển trạng thái cuối/tranh chấp. |
| 17 | `cancel_reason` | String \| null | Không | `null` | Lý do hủy hoặc `"Quá hạn 24-48h"`. |
| 18 | `dispute_reason` | String \| null | Không | `null` | Lý do báo cáo *No-show* hoặc đồ cũ sai mô tả (chỉ khác `null` khi `'disputed'`). |
| 19 | `disputed_by` | String \| null | Không | `null` | UID bên gửi báo cáo tranh chấp (`seller_id` hoặc `requester_id`). |
| 20 | `disputed_at` | Timestamp \| null | Không | `null` | Mốc thời gian đóng băng tranh chấp. |
| 21 | `created_at` | Timestamp | Có | `request.time` | Thời điểm tạo bản ghi. |
| 22 | `updated_at` | Timestamp | Có | `request.time` | Thời điểm chuyển trạng thái. |

### 3.8. Collection: `hold_secrets` (Cách ly Quyền đọc Mã PIN Bàn giao 1:1 với `holds`)
- **Document ID:** `{holdId}` (Khớp 1:1 với `holds/{holdId}`).
- **Cô lập Bảo mật (`firestore.rules`):** `allow read` chỉ cấp cho `resource.data.requester_id == request.auth.uid` (hoặc `isAdmin()`); `Seller` **tuyệt đối không đọc được trước** để chống hoàn tất khống. Khi `Seller` hoàn tất giao dịch, giá trị PIN nhập vào được đối chiếu ngay trong Security Rules qua `get(/databases/$(database)/documents/hold_secrets/$(holdId)).data.handover_pin`.

| STT | Tên trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả nghiệp vụ |
| :-: | :--- | :--- | :---: | :---: | :--- |
| 1 | `hold_id` | String | Có | — | Tham chiếu `holds/{holdId}`. |
| 2 | `requester_id` | String | Có | — | UID người nhận — chủ thể duy nhất được quyền đọc mã PIN. |
| 3 | `seller_id` | String | Có | — | UID người đăng — dùng đối soát phạm vi giao dịch. |
| 4 | `handover_pin` | String | Có | — | Chuỗi 6 chữ số ngẫu nhiên (`'000000'..'999999'`) đối chiếu tại điểm hẹn. |
| 5 | `created_at` | Timestamp | Có | `request.time` | Thời điểm khởi tạo cùng transaction giữ chỗ. |

### 3.9. Collection: `meetup_locations`
- **Document ID:** Slug địa điểm (`'thu-vien-trung-tam'`, `'sanh-nha-a'`, `'nha-van-hoa-sv'`, `'can-tin-trung-tam'`).
- **Các trường:** `location_name` (String), `campus` (String), `landmark_description` (String), `is_active` (Boolean).

### 3.10. Collection: `meetups` (Đã bổ sung `updated_at` & Quyền đọc Phiên quá hạn)
- **Các trường:** `hold_id` (String, 1:1 với `holds`), `item_id` (String), `seller_id` (String), `buyer_id` (String), `location_id` (String), `location_name` (String), `proposed_time` (Timestamp), `status` (`'proposed' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed'`), `note` (String), `created_at` (Timestamp), `updated_at` (Timestamp).
- **Quyền đọc mở rộng cho dọn quá hạn (`isExpiredHoldRef`):** Ngoài `buyer_id`, `seller_id` và `Admin`, Security Rules cho phép đọc `meetups/{meetupId}` khi phiên `holds/{hold_id}` tương ứng đã vượt quá `hold_expires_at <= request.time` để luồng `Client Lazy Sweep` đọc được `meetupRef` trước khi cập nhật hủy trong `runTransaction`.

### 3.11. Collection: `transactions` & Subcollection `status_logs` (Đã chuẩn hóa mốc thời gian & phương thức bàn giao)
- **`transactions`:** `item_id`, `item_title`, `hold_id`, `seller_id`, `buyer_id`, `final_amount` (`>= 0`, lấy theo `agreed_price`), `payment_method` (`'free' | 'cash' | 'bank_transfer'`), `handover_method` (`'pin_verified' | 'buyer_confirmed' | 'admin_resolved'`), `current_status` (`'pending' | 'completed' | 'disputed' | 'cancelled'`), `completed_at` (`Timestamp | null` — chỉ khác `null` khi `completed`), `created_at` (`Timestamp`), `updated_at` (`Timestamp`).
- **`transactions/{txId}/status_logs`:** `from_status` (`String | null`), `to_status` (`String`), `changed_by` (`String`), `reason` (`String`), `timestamp` (`Timestamp`).

---

## 4. ĐẶC TẢ CHI TIẾT 05 QUY TRÌNH GIAO DỊCH NGUYÊN TỬ (`Firestore runTransaction`)

Toàn bộ các quy trình bên dưới tuân thủ kỷ luật **Strict Reads-Before-Writes**: 100% lệnh `tx.get(...)` phải hoàn tất trước lệnh ghi đầu tiên; toàn bộ thay đổi trạng thái được commit nguyên tử hoặc rollback hoàn toàn khi có xung đột phiên bản (*OCC Conflict*) hay vi phạm hậu kiểm ở Security Rules (`get()` / `getAfter()`).

### 4.1. Đặt Giữ Chỗ, Đề xuất Giá & Cấp Mã PIN Bàn giao (`createHoldWithTransaction` / `createHoldOrder`)
1. **Read-Set (`tx.get`):** Đọc đồng thời `users/{requesterId}`, `items/{itemId}` và (sau khi lấy `seller_id` từ `itemData`, vẫn trước mọi lệnh ghi) đọc `users/{sellerId}`.
2. **Preconditions (Điều kiện tiên quyết):**
   - `users/{requesterId}`: `status === 'active'`, `current_trust_score >= 50`, `active_holds_count < 3` (*chống Write Skew gom đồ*), và `hold_locked_until == null || hold_locked_until <= now`.
   - `items/{itemId}`: `moderation_status === 'approved'`, `item_status === 'available'`, `active_hold_id === null`, `seller_id !== requesterId`.
   - `proposed_time`: nằm trong khoảng `(now, now + 24h|48h]`; nếu `item_type === 'sell'`, `offered_price` nằm trong `[item_price * 0.5, item_price]` (`0` nếu `gift`).
3. **Write-Set (Ghi nguyên tử cùng lúc 5 tài liệu):**
   - `holds/{newHoldId}`: `hold_status = 'active'`, `version = 1`, `offered_price`, `agreed_price = offered_price`, `hold_expires_at = now + durationHours`.
   - `hold_secrets/{newHoldId}`: `hold_id = newHoldId`, `requester_id`, `seller_id`, `handover_pin` (6 chữ số ngẫu nhiên), `created_at = request.time`.
   - `meetups/{newHoldId}`: `hold_id = newHoldId`, `proposed_time`, `location_id`, `status = 'proposed'`.
   - `items/{itemId}`: `item_status = 'held'`, `active_hold_id = newHoldId`, `version = (item.version ?? 1) + 1`, `updated_at = request.time`.
   - `users/{requesterId}`: `active_holds_count = (user.active_holds_count ?? 0) + 1`, `updated_at = request.time`.
4. **Security Rules Postconditions (`get` / `getAfter`):** Kiểm tra chéo 2 chiều `holds/{holdId}` ↔ `items/{itemId}` (`active_hold_id == holdId`), `meetups/{holdId}`, `hold_secrets/{holdId}` và ràng buộc `0 <= active_holds_count <= 3` trong cùng commit batch.

### 4.2. Xác thực Bàn giao 2 Pha & Chốt Hợp đồng Giao dịch (`completeHoldWithTransaction`)
1. **Read-Set (`tx.get`):** Đọc đồng thời `holds/{holdId}`, `items/{itemId}`, `users/{requesterId}`, `meetups/{holdId}`, và `hold_secrets/{holdId}` (nếu hoàn tất bằng PIN).
2. **Preconditions:**
   - `hold.hold_status === 'active'` và `actorUid === hold.seller_id` (chặn tự hoàn tất một chiều bởi Buyer).
   - **Điều kiện xác thực bàn giao 2 pha:** `hold.meetup_summary.buyer_confirmed === true` HOẶC `submittedPin === holdSecret.handover_pin`.
3. **Write-Set:**
   - `holds/{holdId}`: `hold_status = 'converted'`, `version + 1`, `updated_at = request.time`.
   - `items/{itemId}`: `item_status = 'completed'`, `active_hold_id = null`, `version + 1`, `updated_at = request.time`.
   - `meetups/{holdId}`: `status = 'completed'`, `updated_at = request.time`.
   - `transactions/{txId}` + `status_logs/{logId}`: ghi `final_amount = hold.agreed_price`, `payment_method`, `handover_method` (`'pin_verified' | 'buyer_confirmed'`), `current_status = 'completed'`, `completed_at = request.time`.
   - `users/{requesterId}`: giảm `active_holds_count = Math.max(0, count - 1)`, tính `newBalance = Math.min(200, currentScore + 5)`, `appliedDelta = newBalance - currentScore`, cập nhật `last_trust_ref_id = holdId`.
   - `users/{requesterId}/trust_history/COMPLETE_TX_{holdId}`: ID xác định, `!exists(...)`, `score_change = appliedDelta`, `balance_after = newBalance`, `event_type = 'COMPLETE_TX'`.
4. **Security Rules Postconditions:** Xác minh `request.auth.uid == holdBefore.data.seller_id`, kiểm tra xác thực 2 pha qua `hold_secrets` / `buyer_confirmed`, xác minh `holdAfter`, `itemAfter` và `trust_history/COMPLETE_TX_{holdId}` qua `getAfter()`.

### 4.3. Chủ động Hủy giữ chỗ & Hoàn trả Hạn mức (`cancelHoldWithTransaction`)
1. **Read-Set (`tx.get`):** Đọc đồng thời `holds/{holdId}`, `items/{itemId}`, `users/{requesterId}`, `meetups/{holdId}`.
2. **Preconditions:** `hold.hold_status === 'active'` và `actorUid` là `seller_id` hoặc `requester_id`.
3. **Write-Set:**
   - `holds/{holdId}`: `hold_status = 'cancelled'`, `cancel_reason`, `version + 1`, `updated_at = request.time`.
   - `items/{itemId}` (nếu `active_hold_id === holdId`): `item_status = 'available'`, `active_hold_id = null`, `version + 1`.
   - `meetups/{holdId}`: `status = 'cancelled'`, `updated_at = request.time`.
   - `users/{requesterId}`: giảm `active_holds_count = Math.max(0, count - 1)`. Nếu `actorUid === requester_id`: trừ `-10` điểm kẹp `[0, 200]`, tính `appliedDelta`, đặt `hold_locked_until = now + 7 ngày` nếu `newBalance < 50`, gán `last_trust_ref_id = holdId`, ghi ledger `users/{requesterId}/trust_history/CANCEL_HOLD_{holdId}`.
4. **Security Rules Postconditions:** Đồng bộ trạng thái `holds` ↔ `items` ↔ `users` qua `getAfter()` và cấm Replay trên `CANCEL_HOLD_{holdId}`.

### 4.4. Tự động Giải phóng Quá hạn với Biên độ Chống lệch Đồng hồ 60s (`releaseExpiredHoldsIfAny` / `scheduledHoldAutoRelease`)
1. **Truy vấn lọc phiên quá hạn:**
   - Tiến trình nền (*Cronjob 5 phút/lần*) truy vấn `hold_status == 'active' && hold_expires_at <= now`.
   - Luồng *Client Lazy Sweep* truy vấn với biên độ an toàn `safeCutoff = now - 60_000 ms` (`EXPIRED_HOLD_SKEW_MARGIN_MS = 60s`) để đồng hồ máy khách chạy nhanh hơn server vài giây không làm hỏng batch khi `firestore.rules` kiểm `hold_expires_at <= request.time`. Tuyệt đối không quét các phiên đang `'disputed'`.
2. **Read-Set (`tx.get` per Hold):** Đọc `holds/{holdId}`, `items/{itemId}`, `users/{requesterId}`, `meetups/{holdId}` (đọc hợp lệ nhờ `isExpiredHoldRef(hold_id)` trong `firestore.rules`).
3. **Preconditions:** `hold.hold_status === 'active'` và `hold.hold_expires_at <= request.time`.
4. **Write-Set:** `holds/{holdId}.hold_status = 'expired'`, `items/{itemId}` về `'available'` (`active_hold_id = null`, `version + 1`), `meetups/{holdId}.status = 'cancelled'`, giảm `users/{requesterId}.active_holds_count - 1`, tính `newBalance = Math.max(0, currentScore - 10)` và `appliedDelta = newBalance - currentScore` (khóa 7 ngày nếu `< 50`), cập nhật `last_trust_ref_id = holdId` và ghi ledger xác định `EXPIRED_HOLD_{holdId}`.
5. **Security Rules Postconditions:** Nhờ điều kiện `!exists(trust_history/EXPIRED_HOLD_{holdId})` và `holdBefore.hold_status == 'active'`, nếu *Cronjob* và *Client* chạy trùng vào 1 phiên cùng mili-giây, chỉ đúng 1 transaction commit thành công, giao dịch còn lại retry thấy `hold_status != 'active'` và thoát an toàn (**không bao giờ trừ kép `-20` điểm**).

### 4.5. Đóng băng Tranh chấp / Báo cáo Bùng hẹn & Phân xử Admin (`reportHoldDispute` & `resolveHoldDispute`)
1. **Báo cáo Bùng hẹn / Đồ cũ sai mô tả (`reportHoldDisputeWithTransaction`):**
   - **Read-Set:** Đọc `holds/{holdId}`, `meetups/{holdId}`.
   - **Preconditions:** `hold.hold_status === 'active'`, `actorUid` thuộc `{seller_id, requester_id}`, đã quá giờ hẹn `proposed_time` (cho *No-show*) hoặc phát hiện sai mô tả thực tế, `dispute_reason` khác rỗng (`<= 500` ký tự).
   - **Write-Set:** Chuyển `holds/{holdId}` sang `hold_status = 'disputed'`, ghi `dispute_reason`, `disputed_by`, `disputed_at = request.time`, `version + 1`. **Đóng băng trạng thái** để tiến trình Auto-Release (`4.4`) không tự động hủy và trừ `-10` điểm của bên không có lỗi.
2. **Admin Phân xử Nguyên tử (`resolveHoldDisputeByAdmin`):**
   - **Read-Set:** Đọc `holds/{holdId}`, `items/{itemId}`, `users/{violatorUid}`, `users/{requesterId}`, `meetups/{holdId}`.
   - **Preconditions:** Người gọi có `role === 'admin'` (và `email_verified === true` nếu là bootstrap admin); `hold.hold_status === 'disputed'`.
   - **Write-Set:**
     - Nếu bên vi phạm *No-show*: trừ `-30` điểm (`event_type = 'NO_SHOW'`) kèm `appliedDelta`, đặt `hold_locked_until = now + 7 ngày` nếu `< 50`, ghi `trust_history`, cập nhật `holds -> 'cancelled'` (hoặc `'expired'`), `items -> 'available'` (`active_hold_id = null`, `version + 1`), giảm `active_holds_count - 1`.
     - Nếu hai bên đã khắc phục và giao thành công: hoàn tất `holds -> 'converted'`, `items -> 'completed'`, ghi `transactions` (`handover_method = 'admin_resolved'`), giảm `active_holds_count - 1`.

---

## 5. MA TRẬN KIỂM SOÁT ĐỒNG THỜI, BẤT BIẾN SECURITY RULES & COMPOSITE INDEXES

| Loại Dị thường (*Anomaly*) | Tài liệu Khóa (`Read-Set`) | Cơ chế Đồng bộ (`Write-Set`) | Hậu kiểm `firestore.rules` | Composite Index sử dụng (`firestore.indexes.json`) |
| :--- | :--- | :--- | :--- | :--- |
| **Lost Update / Double-Booking** (`N` -> `1` Item) | `items/{itemId}` (`active_hold_id == null`, `version`) | Tạo `holds/{id}`, `meetups/{id}`, `hold_secrets/{id}`; đặt `items.item_status = 'held'`, `version + 1` | `get()` `itemBefore == 'available'`; `getAfter()` `itemAfter.active_hold_id == holdId` | `items [moderation_status ASC, item_status ASC, created_at DESC]` (lọc theo danh mục/môn/loại/tình trạng) |
| **Write Skew / Gom đồ 0đ** (`1` -> `K` Items) | `users/{requesterId}` (`active_holds_count < 3`) | Tuần tự hóa mọi giao dịch tạo Hold của 1 user trên `users/{requesterId}` (`count + 1`) | Ràng buộc `0 <= incoming().active_holds_count <= 3` đồng bộ cùng `holds` create | `holds [requester_id ASC, created_at DESC]` (hiển thị danh sách giữ chỗ của tôi) |
| **Terminal State Race** (`Complete` vs `Expire` vs `Cancel`) | `holds/{holdId}` (`hold_status == 'active'`) | Chỉ 1 nhánh chuyển `converted`/`expired`/`cancelled`/`disputed`; Client Sweep dùng biên độ `-60s` | `holdBefore.hold_status == 'active'` + `hold_expires_at <= request.time` + `isExpiredHoldRef` | `holds [hold_status ASC, hold_expires_at ASC]` (quét lô quá hạn) |
| **Counter Lost Update & Self-Farming** | `users/{requesterId}`, `hold_secrets/{holdId}` | Tính `appliedDelta = newBalance - currentScore` (`0..200`); xác thực 2 pha PIN/`buyer_confirmed` | ID sổ cái xác định `!exists(...)` + `last_trust_ref_id == holdId` + chỉ `seller_id` hoàn tất | `holds [seller_id ASC, created_at DESC]` (lịch hẹn chờ Seller giao đồ) |
