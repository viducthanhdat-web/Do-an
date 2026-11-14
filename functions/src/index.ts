import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

/**
 * FR-05 & NFR-01: Đặt giữ chỗ 24-48h & Tạo lịch hẹn nguyên tử chống Race Condition
 */
export const createHoldOrder = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Vui lòng đăng nhập bằng tài khoản sinh viên!");
  }

  const requesterId = context.auth.uid;
  const {
    itemId,
    holdDurationHours = 48,
    locationId,
    locationName,
    proposedTimeIso,
    note = ""
  } = data;

  const duration = holdDurationHours === 24 ? 24 : 48;
  const userRef = db.collection("users").doc(requesterId);
  const itemRef = db.collection("items").doc(itemId);
  const newHoldRef = db.collection("holds").doc();
  const newMeetupRef = db.collection("meetups").doc();

  return await db.runTransaction(async (transaction) => {
    const [requesterSnap, itemSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(itemRef)
    ]);

    if (!requesterSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Không tìm thấy hồ sơ sinh viên!");
    }
    const requesterData = requesterSnap.data()!;
    const now = admin.firestore.Timestamp.now();

    if (requesterData.status !== "active") {
      throw new functions.https.HttpsError("permission-denied", "Tài khoản đang bị tạm khóa!");
    }
    if ((requesterData.current_trust_score ?? 100) < 50) {
      throw new functions.https.HttpsError("failed-precondition", "Điểm tín nhiệm dưới 50. Quyền đặt giữ chỗ đang bị khóa!");
    }
    if (requesterData.hold_locked_until && requesterData.hold_locked_until.toMillis() > now.toMillis()) {
      throw new functions.https.HttpsError("failed-precondition", "Quyền đặt giữ chỗ đang trong thời gian tạm khóa!");
    }

    if (!itemSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Vật phẩm không tồn tại!");
    }
    const itemData = itemSnap.data()!;

    if (itemData.moderation_status !== "approved") {
      throw new functions.https.HttpsError("failed-precondition", "Vật phẩm chưa được kiểm duyệt!");
    }
    if (itemData.item_status !== "available" || itemData.active_hold_id !== null) {
      throw new functions.https.HttpsError("already-exists", "Món đồ vừa được sinh viên khác giữ chỗ thành công!");
    }
    if (itemData.seller_id === requesterId) {
      throw new functions.https.HttpsError("invalid-argument", "Không thể tự đặt giữ chỗ vật phẩm của chính mình!");
    }

    const sellerSnap = await transaction.get(db.collection("users").doc(itemData.seller_id));
    const sellerData = sellerSnap.data() || {};

    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + duration * 3600 * 1000);
    const proposedTime = proposedTimeIso
      ? admin.firestore.Timestamp.fromDate(new Date(proposedTimeIso))
      : admin.firestore.Timestamp.fromMillis(now.toMillis() + 24 * 3600 * 1000);

    transaction.set(newHoldRef, {
      item_id: itemId,
      item_title: itemData.title,
      primary_image: itemData.primary_image || "",
      seller_id: itemData.seller_id,
      seller_summary: {
        full_name: sellerData.full_name || itemData.seller_summary?.full_name || "Sinh viên",
        phone_number: sellerData.phone_number || ""
      },
      requester_id: requesterId,
      requester_summary: {
        full_name: requesterData.full_name || "Sinh viên",
        phone_number: requesterData.phone_number || ""
      },
      meetup_summary: {
        location_id: locationId,
        location_name: locationName,
        proposed_time: proposedTime,
        note
      },
      hold_start_time: now,
      hold_expires_at: expiresAt,
      hold_status: "active",
      cancel_reason: null,
      created_at: now,
      updated_at: now
    });

    transaction.set(newMeetupRef, {
      hold_id: newHoldRef.id,
      item_id: itemId,
      seller_id: itemData.seller_id,
      buyer_id: requesterId,
      location_id: locationId,
      location_name: locationName,
      proposed_time: proposedTime,
      status: "proposed",
      note,
      created_at: now,
      updated_at: now
    });

    transaction.update(itemRef, {
      item_status: "held",
      active_hold_id: newHoldRef.id,
      updated_at: now
    });

    return {
      success: true,
      holdId: newHoldRef.id,
      meetupId: newMeetupRef.id,
      expiresAt: expiresAt.toDate().toISOString()
    };
  });
});

/**
 * FR-06, FR-07 & NFR-03: Cronjob quét mỗi 5 phút tự động mở khóa Hold quá hạn 24-48h,
 * tính chính xác balance_after và khóa quyền giữ chỗ nếu điểm < 50.
 */
export const scheduledHoldAutoRelease = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const expiredQuery = await db
      .collection("holds")
      .where("hold_status", "==", "active")
      .where("hold_expires_at", "<=", now)
      .limit(50)
      .get();

    if (expiredQuery.empty) return null;

    for (const holdDoc of expiredQuery.docs) {
      await db.runTransaction(async (tx) => {
        const freshHold = await tx.get(holdDoc.ref);
        if (!freshHold.exists || freshHold.data()?.hold_status !== "active") return;

        const holdData = freshHold.data()!;
        const itemRef = db.collection("items").doc(holdData.item_id);
        const requesterRef = db.collection("users").doc(holdData.requester_id);
        const [itemSnap, requesterSnap] = await Promise.all([
          tx.get(itemRef),
          tx.get(requesterRef)
        ]);

        const currentScore = requesterSnap.data()?.current_trust_score ?? 100;
        const newBalance = Math.max(0, currentScore - 10);
        const holdLockedUntil =
          newBalance < 50
            ? admin.firestore.Timestamp.fromMillis(now.toMillis() + 7 * 24 * 3600 * 1000)
            : requesterSnap.data()?.hold_locked_until ?? null;

        tx.update(holdDoc.ref, {
          hold_status: "expired",
          cancel_reason: "Quá hạn giữ chỗ 24-48h",
          updated_at: now
        });

        if (itemSnap.exists && itemSnap.data()?.active_hold_id === holdDoc.id) {
          tx.update(itemRef, {
            item_status: "available",
            active_hold_id: null,
            updated_at: now
          });
        }

        if (requesterSnap.exists) {
          tx.update(requesterRef, {
            current_trust_score: newBalance,
            hold_locked_until: holdLockedUntil,
            updated_at: now
          });

          const trustLogRef = requesterRef.collection("trust_history").doc();
          tx.set(trustLogRef, {
            score_change: -10,
            balance_after: newBalance,
            event_type: "EXPIRED_HOLD",
            reference_id: holdDoc.id,
            description: `Trừ 10 điểm do để quá hạn giữ chỗ 24-48h: ${holdData.item_title}`,
            created_at: now
          });
        }
      });
    }

    return null;
  });
