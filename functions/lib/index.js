"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledHoldAutoRelease = exports.createHoldOrder = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
(0, v2_1.setGlobalOptions)({ region: "asia-southeast1", maxInstances: 10 });
const app = (0, app_1.initializeApp)();
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "ai-studio-planit-c53a22dd-bec2-45c8-8ceb-d38f69c9d02b";
const db = (0, firestore_1.getFirestore)(app, FIRESTORE_DATABASE_ID);
/**
 * FR-05 & NFR-01: Đặt giữ chỗ 24-48h & Tạo lịch hẹn nguyên tử chống Race Condition
 */
exports.createHoldOrder = (0, https_1.onCall)(async (request) => {
    const requesterId = request.auth?.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "Vui lòng đăng nhập bằng tài khoản sinh viên!");
    }
    const payload = (request.data && typeof request.data === "object" ? request.data : {});
    const itemId = typeof payload.itemId === "string" ? payload.itemId.trim() : "";
    if (!itemId || itemId.length > 128) {
        throw new https_1.HttpsError("invalid-argument", "Mã vật phẩm (itemId) không hợp lệ.");
    }
    const locationId = typeof payload.locationId === "string" ? payload.locationId.trim() : "";
    if (locationId.length > 128) {
        throw new https_1.HttpsError("invalid-argument", "Mã điểm hẹn (locationId) vượt quá 128 ký tự.");
    }
    const locationName = typeof payload.locationName === "string" ? payload.locationName.trim() : "";
    if (!locationName || locationName.length > 200) {
        throw new https_1.HttpsError("invalid-argument", "Tên điểm hẹn không hợp lệ (1..200 ký tự).");
    }
    const note = typeof payload.note === "string" ? payload.note.trim() : "";
    if (note.length > 500) {
        throw new https_1.HttpsError("invalid-argument", "Ghi chú không được vượt quá 500 ký tự.");
    }
    const duration = payload.holdDurationHours === 24 ? 24 : 48;
    const requestNowMs = Date.now();
    const parsedProposedDate = payload.proposedTimeIso === undefined
        ? new Date(requestNowMs + 20 * 3600 * 1000)
        : typeof payload.proposedTimeIso === "string" && payload.proposedTimeIso.trim()
            ? new Date(payload.proposedTimeIso)
            : new Date(NaN);
    if (isNaN(parsedProposedDate.getTime())) {
        throw new https_1.HttpsError("invalid-argument", "Thời gian hẹn gặp (proposedTimeIso) không hợp lệ.");
    }
    if (parsedProposedDate.getTime() <= requestNowMs) {
        throw new https_1.HttpsError("invalid-argument", "Thời gian hẹn gặp phải lớn hơn thời điểm hiện tại.");
    }
    if (parsedProposedDate.getTime() > requestNowMs + duration * 3600 * 1000) {
        throw new https_1.HttpsError("invalid-argument", `Thời gian hẹn gặp phải nằm trong khung giữ chỗ ${duration} giờ đã chọn (FR-05.2).`);
    }
    const userRef = db.collection("users").doc(requesterId);
    const itemRef = db.collection("items").doc(itemId);
    const newHoldRef = db.collection("holds").doc();
    const newMeetupRef = db.collection("meetups").doc(newHoldRef.id);
    return await db.runTransaction(async (transaction) => {
        const [requesterSnap, itemSnap] = await Promise.all([
            transaction.get(userRef),
            transaction.get(itemRef),
        ]);
        if (!requesterSnap.exists) {
            throw new https_1.HttpsError("not-found", "Không tìm thấy hồ sơ sinh viên!");
        }
        const requesterData = requesterSnap.data();
        const now = firestore_1.Timestamp.now();
        const nowMs = now.toMillis();
        if (requesterData.status !== "active") {
            throw new https_1.HttpsError("permission-denied", "Tài khoản đang bị tạm khóa!");
        }
        if ((requesterData.current_trust_score ?? 100) < 50) {
            throw new https_1.HttpsError("failed-precondition", "Điểm tín nhiệm dưới 50. Quyền đặt giữ chỗ đang bị khóa!");
        }
        if (requesterData.hold_locked_until &&
            typeof requesterData.hold_locked_until.toMillis === "function" &&
            requesterData.hold_locked_until.toMillis() > nowMs) {
            throw new https_1.HttpsError("failed-precondition", "Quyền đặt giữ chỗ đang trong thời gian tạm khóa!");
        }
        if (!itemSnap.exists) {
            throw new https_1.HttpsError("not-found", "Vật phẩm không tồn tại!");
        }
        const itemData = itemSnap.data();
        if (itemData.moderation_status !== "approved") {
            throw new https_1.HttpsError("failed-precondition", "Vật phẩm chưa được kiểm duyệt!");
        }
        if (itemData.item_status !== "available" || itemData.active_hold_id !== null) {
            throw new https_1.HttpsError("already-exists", "Món đồ vừa được sinh viên khác giữ chỗ thành công!");
        }
        if (itemData.seller_id === requesterId) {
            throw new https_1.HttpsError("invalid-argument", "Không thể tự đặt giữ chỗ vật phẩm của chính mình!");
        }
        const expiresAtMs = nowMs + duration * 3600 * 1000;
        if (parsedProposedDate.getTime() > expiresAtMs) {
            throw new https_1.HttpsError("invalid-argument", `Thời gian hẹn gặp phải nằm trong khung giữ chỗ ${duration} giờ đã chọn (FR-05.2).`);
        }
        const sellerSnap = await transaction.get(db.collection("users").doc(itemData.seller_id));
        const sellerData = sellerSnap.data() || {};
        const expiresAt = firestore_1.Timestamp.fromMillis(expiresAtMs);
        const proposedTime = firestore_1.Timestamp.fromDate(parsedProposedDate);
        transaction.set(newHoldRef, {
            item_id: itemId,
            item_title: itemData.title,
            primary_image: itemData.primary_image || "",
            seller_id: itemData.seller_id,
            seller_summary: {
                full_name: sellerData.full_name || itemData.seller_summary?.full_name || "Sinh viên",
                phone_number: sellerData.phone_number || "",
            },
            requester_id: requesterId,
            requester_summary: {
                full_name: requesterData.full_name || "Sinh viên",
                phone_number: requesterData.phone_number || "",
            },
            meetup_summary: {
                meetup_id: newMeetupRef.id,
                location_id: locationId,
                location_name: locationName,
                proposed_time: proposedTime,
                status: "proposed",
                buyer_confirmed: false,
                note,
            },
            hold_start_time: now,
            hold_expires_at: expiresAt,
            hold_status: "active",
            cancel_reason: null,
            created_at: now,
            updated_at: now,
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
            updated_at: now,
        });
        transaction.update(itemRef, {
            item_status: "held",
            active_hold_id: newHoldRef.id,
            updated_at: now,
        });
        return {
            success: true,
            holdId: newHoldRef.id,
            meetupId: newMeetupRef.id,
            expiresAt: expiresAt.toDate().toISOString(),
        };
    });
});
/**
 * FR-06, FR-07 & NFR-03: Cronjob quét mỗi 5 phút tự động mở khóa Hold quá hạn 24-48h,
 * đồng bộ trạng thái Meetup, tính chính xác balance_after và khóa quyền giữ chỗ nếu điểm < 50.
 */
exports.scheduledHoldAutoRelease = (0, scheduler_1.onSchedule)("every 5 minutes", async () => {
    const now = firestore_1.Timestamp.now();
    const expiredQuery = await db
        .collection("holds")
        .where("hold_status", "==", "active")
        .where("hold_expires_at", "<=", now)
        .limit(50)
        .get();
    if (expiredQuery.empty)
        return;
    for (const holdDoc of expiredQuery.docs) {
        await db.runTransaction(async (tx) => {
            const freshHold = await tx.get(holdDoc.ref);
            if (!freshHold.exists || freshHold.data()?.hold_status !== "active")
                return;
            const holdData = freshHold.data();
            const itemRef = db.collection("items").doc(holdData.item_id);
            const requesterRef = db.collection("users").doc(holdData.requester_id);
            const meetupId = typeof holdData.meetup_summary?.meetup_id === "string" && holdData.meetup_summary.meetup_id
                ? holdData.meetup_summary.meetup_id
                : holdDoc.id;
            const meetupRef = db.collection("meetups").doc(meetupId);
            // Read all documents before any writes in Firestore transactions
            const [itemSnap, requesterSnap, meetupSnap] = await Promise.all([
                tx.get(itemRef),
                tx.get(requesterRef),
                tx.get(meetupRef),
            ]);
            const currentScore = requesterSnap.data()?.current_trust_score ?? 100;
            const newBalance = Math.max(0, Math.min(200, currentScore - 10));
            const appliedDelta = newBalance === currentScore ? 0 : -10;
            const holdLockedUntil = newBalance < 50
                ? firestore_1.Timestamp.fromMillis(now.toMillis() + 7 * 24 * 3600 * 1000)
                : requesterSnap.data()?.hold_locked_until ?? null;
            tx.update(holdDoc.ref, {
                hold_status: "expired",
                cancel_reason: "Quá hạn giữ chỗ 24-48h",
                updated_at: now,
            });
            if (itemSnap.exists && itemSnap.data()?.active_hold_id === holdDoc.id) {
                tx.update(itemRef, {
                    item_status: "available",
                    active_hold_id: null,
                    updated_at: now,
                });
            }
            if (meetupSnap.exists) {
                tx.update(meetupRef, {
                    status: "cancelled",
                    updated_at: now,
                });
            }
            if (requesterSnap.exists) {
                tx.update(requesterRef, {
                    current_trust_score: newBalance,
                    hold_locked_until: holdLockedUntil,
                    updated_at: now,
                });
                const trustLogRef = requesterRef.collection("trust_history").doc();
                tx.set(trustLogRef, {
                    score_change: appliedDelta,
                    balance_after: newBalance,
                    event_type: "EXPIRED_HOLD",
                    reference_id: holdDoc.id,
                    description: `Trừ 10 điểm do để quá hạn giữ chỗ 24-48h: ${holdData.item_title}`,
                    created_at: now,
                });
            }
        });
    }
});
//# sourceMappingURL=index.js.map