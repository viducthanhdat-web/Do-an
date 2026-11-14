import {
  collection,
  doc,
  DocumentData,
  DocumentReference,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  Transaction,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_MEETUP_LOCATIONS,
  DEFAULT_SUBJECTS,
  HoldDoc,
  toDateSafe,
  TrustEventType,
  UserProfile,
} from '../types/schema';

export interface CreateHoldInput {
  itemId: string;
  requester: UserProfile;
  holdDurationHours: 24 | 48;
  locationId: string;
  locationName: string;
  proposedTime: Date;
  note: string;
}

const LOCK_DURATION_MS = 7 * 24 * 3600 * 1000;
let isReleasingExpiredHolds = false;

/**
 * Hàm dùng chung cập nhật Điểm tín nhiệm + khóa giữ chỗ (nếu < 50đ) + ghi sổ cái bất biến trust_history
 */
function applyTrustScoreDeltaInTx(params: {
  tx: Transaction;
  userRef: DocumentReference;
  userData: DocumentData;
  delta: number;
  eventType: TrustEventType;
  referenceId: string | null;
  description: string;
  nowServer: ReturnType<typeof serverTimestamp>;
}): void {
  const { tx, userRef, userData, delta, eventType, referenceId, description, nowServer } = params;
  const currentScore = userData.current_trust_score ?? 100;
  const newBalance = Math.max(0, Math.min(200, currentScore + delta));
  const holdLockedUntil =
    newBalance < 50
      ? Timestamp.fromDate(new Date(Date.now() + LOCK_DURATION_MS))
      : delta > 0
      ? null
      : userData.hold_locked_until ?? null;

  tx.update(userRef, {
    current_trust_score: newBalance,
    hold_locked_until: holdLockedUntil,
    updated_at: nowServer,
  });

  const trustLogRef = doc(collection(db, 'users', userRef.id, 'trust_history'));
  tx.set(trustLogRef, {
    score_change: delta,
    balance_after: newBalance,
    event_type: eventType,
    reference_id: referenceId,
    description,
    created_at: nowServer,
  });
}

/**
 * FR-05 & NFR-01: Đặt giữ chỗ 24-48h & tạo lịch hẹn bằng Firestore runTransaction
 * Đảm bảo tính nguyên tử (ACID) chống Race Condition khi nhiều sinh viên bấm giữ cùng 1 giây.
 */
export async function createHoldWithTransaction(input: CreateHoldInput): Promise<{ holdId: string; expiresAt: Date }> {
  const { itemId, requester, holdDurationHours, locationId, locationName, proposedTime, note } = input;

  const requesterRef = doc(db, 'users', requester.uid);
  const itemRef = doc(db, 'items', itemId);
  const newHoldRef = doc(collection(db, 'holds'));
  const newMeetupRef = doc(collection(db, 'meetups'));

  return await runTransaction(db, async (tx) => {
    const [reqSnap, itemSnap] = await Promise.all([tx.get(requesterRef), tx.get(itemRef)]);

    if (!reqSnap.exists()) {
      throw new Error('Không tìm thấy hồ sơ sinh viên của bạn.');
    }
    const reqData = reqSnap.data();
    const trustScore = reqData.current_trust_score ?? 100;

    if (reqData.status && reqData.status !== 'active') {
      throw new Error('Tài khoản của bạn đang bị tạm ngưng quyền giao dịch.');
    }
    if (trustScore < 50) {
      throw new Error('Điểm tín nhiệm của bạn dưới 50 điểm nên quyền đặt giữ chỗ tạm thời bị khóa (FR-07).');
    }
    if (reqData.hold_locked_until && toDateSafe(reqData.hold_locked_until).getTime() > Date.now()) {
      throw new Error('Tài khoản đang trong thời gian khóa quyền giữ chỗ do vi phạm lịch hẹn.');
    }

    if (!itemSnap.exists()) {
      throw new Error('Vật phẩm không còn tồn tại trên hệ thống.');
    }
    const itemData = itemSnap.data();
    const sellerId = itemData.seller_id || itemData.sellerId;

    if (sellerId === requester.uid) {
      throw new Error('Bạn không thể tự đặt giữ chỗ vật phẩm của chính mình.');
    }
    if ((itemData.moderation_status || 'approved') !== 'approved') {
      throw new Error('Vật phẩm này chưa được Admin duyệt công khai.');
    }
    if ((itemData.item_status || itemData.status) !== 'available' || itemData.active_hold_id) {
      throw new Error('Rất tiếc! Món đồ vừa được một sinh viên khác đặt giữ chỗ trước bạn.');
    }

    const sellerRef = doc(db, 'users', sellerId);
    const sellerSnap = await tx.get(sellerRef);
    const sellerData = sellerSnap.exists() ? sellerSnap.data() : null;

    const expiresDate = new Date(Date.now() + holdDurationHours * 3600 * 1000);
    const expiresTimestamp = Timestamp.fromDate(expiresDate);
    const proposedTimestamp = Timestamp.fromDate(proposedTime);
    const nowServer = serverTimestamp();

    tx.set(newHoldRef, {
      item_id: itemId,
      item_title: itemData.title,
      primary_image: itemData.primary_image || itemData.imageUrl || '',
      seller_id: sellerId,
      seller_summary: {
        full_name: sellerData?.full_name || itemData.seller_summary?.full_name || 'Sinh viên',
        phone_number: sellerData?.phone_number || '',
      },
      requester_id: requester.uid,
      requester_summary: {
        full_name: reqData.full_name || requester.full_name,
        phone_number: reqData.phone_number || requester.phone_number || '',
      },
      meetup_summary: {
        location_id: locationId,
        location_name: locationName,
        proposed_time: proposedTimestamp,
        note: note.trim(),
      },
      hold_start_time: nowServer,
      hold_expires_at: expiresTimestamp,
      hold_status: 'active',
      cancel_reason: null,
      created_at: nowServer,
      updated_at: nowServer,
    });

    tx.set(newMeetupRef, {
      hold_id: newHoldRef.id,
      item_id: itemId,
      seller_id: sellerId,
      buyer_id: requester.uid,
      location_id: locationId,
      location_name: locationName,
      proposed_time: proposedTimestamp,
      status: 'proposed',
      note: note.trim(),
      created_at: nowServer,
      updated_at: nowServer,
    });

    tx.update(itemRef, {
      item_status: 'held',
      active_hold_id: newHoldRef.id,
      updated_at: nowServer,
    });

    return { holdId: newHoldRef.id, expiresAt: expiresDate };
  });
}

/**
 * FR-06 & FR-07: Hoàn tất giao dịch trao đổi nguyên tử (+5 Điểm tín nhiệm, tạo Transaction & StatusLog)
 */
export async function completeHoldWithTransaction(
  hold: HoldDoc,
  actorUid: string,
  paymentMethod: 'free' | 'cash' | 'bank_transfer' = 'free'
): Promise<void> {
  const holdRef = doc(db, 'holds', hold.id);
  const itemRef = doc(db, 'items', hold.item_id);
  const requesterRef = doc(db, 'users', hold.requester_id);
  const txRef = doc(collection(db, 'transactions'));
  const statusLogRef = doc(collection(db, 'transactions', txRef.id, 'status_logs'));

  await runTransaction(db, async (tx) => {
    const [holdSnap, itemSnap, reqSnap] = await Promise.all([
      tx.get(holdRef),
      tx.get(itemRef),
      tx.get(requesterRef),
    ]);

    if (!holdSnap.exists() || holdSnap.data().hold_status !== 'active') {
      throw new Error('Phiên giữ chỗ này không còn ở trạng thái đang hoạt động.');
    }

    const itemData = itemSnap.exists() ? itemSnap.data() : {};
    const finalAmount = typeof itemData.price === 'number' ? itemData.price : 0;
    const method = finalAmount === 0 ? 'free' : paymentMethod === 'free' ? 'cash' : paymentMethod;
    const nowServer = serverTimestamp();

    tx.update(holdRef, {
      hold_status: 'converted',
      updated_at: nowServer,
    });

    if (itemSnap.exists()) {
      tx.update(itemRef, {
        item_status: 'completed',
        active_hold_id: null,
        updated_at: nowServer,
      });
    }

    tx.set(txRef, {
      item_id: hold.item_id,
      item_title: hold.item_title,
      hold_id: hold.id,
      seller_id: hold.seller_id,
      buyer_id: hold.requester_id,
      final_amount: finalAmount,
      payment_method: method,
      current_status: 'completed',
      completed_at: nowServer,
      created_at: nowServer,
      updated_at: nowServer,
    });

    tx.set(statusLogRef, {
      from_status: 'pending',
      to_status: 'completed',
      changed_by: actorUid,
      reason: 'Hai bên xác nhận đã giao/nhận vật phẩm thành công tại điểm hẹn',
      timestamp: nowServer,
    });

    if (reqSnap.exists()) {
      applyTrustScoreDeltaInTx({
        tx,
        userRef: requesterRef,
        userData: reqSnap.data(),
        delta: 5,
        eventType: 'COMPLETE_TX',
        referenceId: txRef.id,
        description: `Cộng 5 điểm uy tín khi hoàn tất nhận vật phẩm: ${hold.item_title}`,
        nowServer,
      });
    }
  });
}

/**
 * FR-06 & FR-07: Hủy giữ chỗ (Trả sách về 'available'; nếu người nhận tự hủy thì trừ -10 điểm uy tín)
 */
export async function cancelHoldWithTransaction(
  hold: HoldDoc,
  actorUid: string,
  reason: string
): Promise<void> {
  const holdRef = doc(db, 'holds', hold.id);
  const itemRef = doc(db, 'items', hold.item_id);
  const requesterRef = doc(db, 'users', hold.requester_id);
  const penalizeRequester = actorUid === hold.requester_id;

  await runTransaction(db, async (tx) => {
    const [holdSnap, itemSnap, reqSnap] = await Promise.all([
      tx.get(holdRef),
      tx.get(itemRef),
      tx.get(requesterRef),
    ]);

    if (!holdSnap.exists() || holdSnap.data().hold_status !== 'active') {
      throw new Error('Lịch hẹn đã kết thúc hoặc đã được hủy trước đó.');
    }

    const nowServer = serverTimestamp();

    tx.update(holdRef, {
      hold_status: 'cancelled',
      cancel_reason: reason.trim() || 'Người dùng chủ động hủy lịch hẹn',
      updated_at: nowServer,
    });

    if (itemSnap.exists()) {
      tx.update(itemRef, {
        item_status: 'available',
        active_hold_id: null,
        updated_at: nowServer,
      });
    }

    if (penalizeRequester && reqSnap.exists()) {
      applyTrustScoreDeltaInTx({
        tx,
        userRef: requesterRef,
        userData: reqSnap.data(),
        delta: -10,
        eventType: 'CANCEL_HOLD',
        referenceId: hold.id,
        description: `Trừ 10 điểm do hủy giữ chỗ vật phẩm: ${hold.item_title}`,
        nowServer,
      });
    }
  });
}

/**
 * NFR-03: Bổ trợ cho Cloud Scheduler - tự động giải phóng các phiên Hold đã quá hạn 24-48h
 */
export async function releaseExpiredHoldsIfAny(): Promise<number> {
  if (isReleasingExpiredHolds) return 0;
  isReleasingExpiredHolds = true;

  try {
    const now = Timestamp.now();
    const q = query(
      collection(db, 'holds'),
      where('hold_status', '==', 'active'),
      where('hold_expires_at', '<=', now),
      limit(20)
    );

    const snap = await getDocs(q);
    let releasedCount = 0;

    for (const holdDoc of snap.docs) {
      try {
        await runTransaction(db, async (tx) => {
          const freshHold = await tx.get(holdDoc.ref);
          if (!freshHold.exists() || freshHold.data().hold_status !== 'active') return;

          const data = freshHold.data();
          const itemRef = doc(db, 'items', data.item_id);
          const reqRef = doc(db, 'users', data.requester_id);
          const [itemSnap, reqSnap] = await Promise.all([tx.get(itemRef), tx.get(reqRef)]);
          const nowServer = serverTimestamp();

          tx.update(holdDoc.ref, {
            hold_status: 'expired',
            cancel_reason: 'Tự động giải phóng do quá hạn giữ chỗ 24-48h',
            updated_at: nowServer,
          });

          if (itemSnap.exists() && itemSnap.data().active_hold_id === holdDoc.id) {
            tx.update(itemRef, {
              item_status: 'available',
              active_hold_id: null,
              updated_at: nowServer,
            });
          }

          if (reqSnap.exists()) {
            applyTrustScoreDeltaInTx({
              tx,
              userRef: reqRef,
              userData: reqSnap.data(),
              delta: -10,
              eventType: 'EXPIRED_HOLD',
              referenceId: holdDoc.id,
              description: `Trừ 10 điểm do quá hạn giữ chỗ 24-48h: ${data.item_title}`,
              nowServer,
            });
          }
        });
        releasedCount++;
      } catch {
        // Bỏ qua nếu một phiên khác vừa giải phóng xong
      }
    }
    return releasedCount;
  } finally {
    isReleasingExpiredHolds = false;
  }
}

/**
 * FR-03: Admin duyệt / từ chối / ẩn bài đăng & ghi vết vào Subcollection moderation_logs
 */
export async function moderateItemWithBatch(
  itemId: string,
  adminUid: string,
  action: 'approve' | 'reject' | 'hide',
  reason: string
): Promise<void> {
  const batch = writeBatch(db);
  const itemRef = doc(db, 'items', itemId);
  const logRef = doc(collection(db, 'items', itemId, 'moderation_logs'));
  const nowServer = serverTimestamp();

  if (action === 'approve') {
    batch.update(itemRef, {
      moderation_status: 'approved',
      item_status: 'available',
      reject_reason: null,
      updated_at: nowServer,
    });
  } else if (action === 'reject') {
    batch.update(itemRef, {
      moderation_status: 'rejected',
      reject_reason: reason.trim() || 'Không đạt tiêu chuẩn kiểm duyệt nội dung trường học',
      updated_at: nowServer,
    });
  } else {
    batch.update(itemRef, {
      item_status: 'hidden',
      reject_reason: reason.trim() || 'Đã ẩn bởi Quản trị viên',
      updated_at: nowServer,
    });
  }

  batch.set(logRef, {
    admin_id: adminUid,
    action,
    reason: reason.trim(),
    created_at: nowServer,
  });

  await batch.commit();
}

/**
 * FR-07: Admin xử lý No-show (-30 điểm) hoặc điều chỉnh Điểm tín nhiệm kèm ghi sổ cái trust_history
 */
export async function adjustTrustScoreByAdmin(
  targetUid: string,
  delta: number,
  eventType: 'NO_SHOW' | 'ADMIN_ADJUST',
  description: string,
  referenceId: string | null = null
): Promise<void> {
  const userRef = doc(db, 'users', targetUid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists()) throw new Error('Không tìm thấy sinh viên.');

    applyTrustScoreDeltaInTx({
      tx,
      userRef,
      userData: snap.data(),
      delta,
      eventType,
      referenceId,
      description: description.trim(),
      nowServer: serverTimestamp(),
    });
  });
}

/**
 * FR-03.3: Khởi tạo nhanh dữ liệu Danh mục, Môn học & Điểm hẹn mẫu cho Admin
 */
export async function seedDefaultMasterData(): Promise<void> {
  const batch = writeBatch(db);
  for (const c of DEFAULT_CATEGORIES) {
    batch.set(doc(db, 'categories', c.id), {
      category_name: c.category_name,
      description: c.description,
      display_order: c.display_order,
      is_active: c.is_active,
    });
  }
  for (const s of DEFAULT_SUBJECTS) {
    batch.set(doc(db, 'subjects', s.id), {
      subject_code: s.subject_code,
      subject_name: s.subject_name,
      faculty: s.faculty,
      is_active: s.is_active,
    });
  }
  for (const loc of DEFAULT_MEETUP_LOCATIONS) {
    batch.set(doc(db, 'meetup_locations', loc.id), {
      location_name: loc.location_name,
      campus: loc.campus,
      landmark_description: loc.landmark_description,
      is_active: loc.is_active,
    });
  }
  await batch.commit();
}
