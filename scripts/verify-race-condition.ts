import assert from 'node:assert/strict';
import { validateHoldWindow } from '../src/lib/exchangeService';

type DocMap = Map<string, { version: number; data: Record<string, any> }>;

interface SimStore {
  users: DocMap;
  items: DocMap;
  holds: DocMap;
  meetups: DocMap;
  transactions: DocMap;
  trustHistory: Array<{ uid: string; data: Record<string, any> }>;
  nextId: number;
}

class OccConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OccConflictError';
  }
}

function createInitialStore(): SimStore {
  const users: DocMap = new Map();
  users.set('seller_01', {
    version: 1,
    data: {
      uid: 'seller_01',
      full_name: 'Nguyễn Văn Seller',
      phone_number: '0901000000',
      current_trust_score: 120,
      status: 'active',
      hold_locked_until: null,
    },
  });

  for (let i = 1; i <= 10; i++) {
    const uid = `student_${String(i).padStart(2, '0')}`;
    users.set(uid, {
      version: 1,
      data: {
        uid,
        full_name: `Sinh viên ${i}`,
        phone_number: `09010000${String(i).padStart(2, '0')}`,
        current_trust_score: 100,
        status: 'active',
        hold_locked_until: null,
      },
    });
  }

  users.set('student_low_trust', {
    version: 1,
    data: {
      uid: 'student_low_trust',
      full_name: 'Sinh viên Bị Khóa',
      phone_number: '0909999999',
      current_trust_score: 45,
      status: 'active',
      hold_locked_until: null,
    },
  });

  const items: DocMap = new Map();
  items.set('item_01', {
    version: 1,
    data: {
      id: 'item_01',
      seller_id: 'seller_01',
      seller_summary: { full_name: 'Nguyễn Văn Seller', trust_score: 120, avatar_url: '' },
      title: 'Giáo trình Cơ sở dữ liệu (Tặng 0đ)',
      price: 0,
      moderation_status: 'approved',
      item_status: 'available',
      active_hold_id: null,
    },
  });

  return {
    users,
    items,
    holds: new Map(),
    meetups: new Map(),
    transactions: new Map(),
    trustHistory: [],
    nextId: 1,
  };
}

type CollectionName = 'users' | 'items' | 'holds' | 'meetups' | 'transactions';

interface SimTx {
  get: (col: CollectionName, id: string) => Promise<Record<string, any> | null>;
  set: (col: CollectionName, id: string, data: Record<string, any>) => void;
  update: (col: CollectionName, id: string, patch: Record<string, any>) => void;
  recordTrustLog: (uid: string, data: Record<string, any>) => void;
}

/**
 * Mô phỏng cơ chế Optimistic Concurrency Control (OCC) của Firestore runTransaction:
 * Mọi lệnh đọc đều ghi nhận version; nếu có transaction khác commit trước khi commit
 * làm thay đổi version tài liệu đã đọc, transaction tự động retry và đọc lại dữ liệu mới.
 */
async function runSimulatedTransaction<T>(
  store: SimStore,
  fn: (tx: SimTx) => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const readVersions = new Map<string, number>();
    const pendingWrites: Array<() => void> = [];

    const tx: SimTx = {
      async get(col, id) {
        // Nhường microtask để các request đồng thời đọc cùng trạng thái ban đầu tại t0
        await Promise.resolve();
        const key = `${col}/${id}`;
        const entry = store[col].get(id);
        if (!readVersions.has(key)) {
          readVersions.set(key, entry ? entry.version : 0);
        }
        return entry ? structuredClone(entry.data) : null;
      },
      set(col, id, data) {
        pendingWrites.push(() => {
          const prev = store[col].get(id);
          store[col].set(id, {
            version: (prev?.version ?? 0) + 1,
            data: structuredClone(data),
          });
        });
      },
      update(col, id, patch) {
        pendingWrites.push(() => {
          const prev = store[col].get(id);
          if (!prev) throw new Error(`Document ${col}/${id} does not exist`);
          store[col].set(id, {
            version: prev.version + 1,
            data: { ...structuredClone(prev.data), ...structuredClone(patch) },
          });
        });
      },
      recordTrustLog(uid, data) {
        pendingWrites.push(() => {
          store.trustHistory.push({ uid, data: structuredClone(data) });
        });
      },
    };

    const result = await fn(tx);

    // Pha Commit nguyên tử trong JS event loop: đối chiếu toàn bộ version đã đọc
    let conflicted = false;
    for (const [key, expectedVersion] of readVersions.entries()) {
      const [col, id] = key.split('/') as [CollectionName, string];
      const currentVersion = store[col].get(id)?.version ?? 0;
      if (currentVersion !== expectedVersion) {
        conflicted = true;
        break;
      }
    }

    if (conflicted) {
      if (attempt === maxAttempts) {
        throw new OccConflictError('OCC conflict: quá số lần retry giao dịch.');
      }
      continue;
    }

    for (const apply of pendingWrites) {
      apply();
    }
    return result;
  }

  throw new OccConflictError('Transaction failed after retries.');
}

async function placeHoldInSim(
  store: SimStore,
  params: {
    itemId: string;
    requesterId: string;
    holdDurationHours: 24 | 48;
    proposedTime: Date;
    nowMs?: number;
  }
): Promise<{ holdId: string }> {
  const nowMs = params.nowMs ?? Date.now();
  validateHoldWindow(params.holdDurationHours, params.proposedTime, nowMs);
  const newHoldId = `hold_${String(store.nextId++).padStart(3, '0')}`;

  return await runSimulatedTransaction(store, async (tx) => {
    const [reqData, itemData] = await Promise.all([
      tx.get('users', params.requesterId),
      tx.get('items', params.itemId),
    ]);

    if (!reqData) throw new Error('Không tìm thấy hồ sơ sinh viên.');
    if (reqData.status !== 'active') throw new Error('Tài khoản đang bị tạm khóa.');
    if ((reqData.current_trust_score ?? 100) < 50) {
      throw new Error('Điểm tín nhiệm dưới 50 nên quyền đặt giữ chỗ bị khóa (FR-07).');
    }
    if (!itemData) throw new Error('Vật phẩm không tồn tại.');
    if (itemData.seller_id === params.requesterId) {
      throw new Error('Bạn không thể tự đặt giữ chỗ vật phẩm của chính mình.');
    }
    if (itemData.moderation_status !== 'approved') {
      throw new Error('Vật phẩm chưa được kiểm duyệt.');
    }
    if (itemData.item_status !== 'available' || itemData.active_hold_id !== null) {
      throw new Error('Rất tiếc! Món đồ vừa được một sinh viên khác đặt giữ chỗ trước bạn.');
    }

    await tx.get('users', itemData.seller_id);
    const expiresAt = new Date(nowMs + params.holdDurationHours * 3600 * 1000);

    tx.set('holds', newHoldId, {
      id: newHoldId,
      item_id: params.itemId,
      item_title: itemData.title,
      seller_id: itemData.seller_id,
      requester_id: params.requesterId,
      hold_start_time: new Date(nowMs),
      hold_expires_at: expiresAt,
      hold_status: 'active',
      meetup_summary: {
        meetup_id: newHoldId,
        location_id: 'thu-vien-tang-2',
        location_name: 'Bàn tròn Thư viện Tầng 2',
        proposed_time: params.proposedTime,
        status: 'proposed',
        buyer_confirmed: false,
        note: '',
      },
    });

    tx.set('meetups', newHoldId, {
      hold_id: newHoldId,
      item_id: params.itemId,
      seller_id: itemData.seller_id,
      buyer_id: params.requesterId,
      status: 'proposed',
      proposed_time: params.proposedTime,
    });

    tx.update('items', params.itemId, {
      item_status: 'held',
      active_hold_id: newHoldId,
    });

    return { holdId: newHoldId };
  });
}

async function completeHoldInSim(store: SimStore, holdId: string, actorUid: string): Promise<void> {
  await runSimulatedTransaction(store, async (tx) => {
    const holdData = await tx.get('holds', holdId);
    if (!holdData || holdData.hold_status !== 'active') {
      throw new Error('Phiên giữ chỗ này không còn hoạt động.');
    }
    if (actorUid !== holdData.seller_id) {
      throw new Error('Chỉ người đăng vật phẩm (Seller) mới có quyền xác nhận đã bàn giao hoàn tất (FR-06.1).');
    }

    const [itemData, reqData, meetupData] = await Promise.all([
      tx.get('items', holdData.item_id),
      tx.get('users', holdData.requester_id),
      tx.get('meetups', holdId),
    ]);

    tx.update('holds', holdId, { hold_status: 'converted' });
    if (itemData) {
      tx.update('items', holdData.item_id, {
        item_status: 'completed',
        active_hold_id: null,
      });
    }
    if (meetupData) {
      tx.update('meetups', holdId, { status: 'completed' });
    }

    const txId = `tx_${holdId}`;
    tx.set('transactions', txId, {
      hold_id: holdId,
      item_id: holdData.item_id,
      seller_id: holdData.seller_id,
      buyer_id: holdData.requester_id,
      current_status: 'completed',
    });

    if (reqData) {
      const nextScore = Math.min(200, (reqData.current_trust_score ?? 100) + 5);
      tx.update('users', holdData.requester_id, { current_trust_score: nextScore });
      tx.recordTrustLog(holdData.requester_id, {
        score_change: 5,
        balance_after: nextScore,
        event_type: 'COMPLETE_TX',
        reference_id: txId,
      });
    }
  });
}

async function main() {
  console.log('=== UniExchange TV1 Automated Verification (WBS 4.2 / NFR-01) ===\n');
  const baseNow = Date.now();
  const validMeetup = new Date(baseNow + 12 * 3600 * 1000);

  // Scenario 1: 10 concurrent hold requests on the exact same item
  const store1 = createInitialStore();
  const concurrentRequests = Array.from({ length: 10 }, (_, idx) =>
    placeHoldInSim(store1, {
      itemId: 'item_01',
      requesterId: `student_${String(idx + 1).padStart(2, '0')}`,
      holdDurationHours: 48,
      proposedTime: validMeetup,
      nowMs: baseNow,
    })
  );

  const results = await Promise.allSettled(concurrentRequests);
  const fulfilled = results.filter((r): r is PromiseFulfilledResult<{ holdId: string }> => r.status === 'fulfilled');
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, `Expected exactly 1 winner, got ${fulfilled.length}`);
  assert.equal(rejected.length, 9, `Expected exactly 9 rejected requests, got ${rejected.length}`);

  const winnerHoldId = fulfilled[0].value.holdId;
  const itemState = store1.items.get('item_01')!.data;
  const holdState = store1.holds.get(winnerHoldId)!.data;
  assert.equal(itemState.item_status, 'held');
  assert.equal(itemState.active_hold_id, winnerHoldId);
  assert.equal(holdState.hold_status, 'active');
  assert.equal(store1.holds.size, 1);
  console.log(`[PASS] Scenario 1: Concurrent Race Condition (10 requests -> 1 winner [${winnerHoldId}], 9 rejected)`);

  // Scenario 2: Self-Reservation Block
  const store2 = createInitialStore();
  await assert.rejects(
    () =>
      placeHoldInSim(store2, {
        itemId: 'item_01',
        requesterId: 'seller_01',
        holdDurationHours: 24,
        proposedTime: validMeetup,
        nowMs: baseNow,
      }),
    /không thể tự đặt giữ chỗ/
  );
  assert.equal(store2.items.get('item_01')!.data.item_status, 'available');
  console.log('[PASS] Scenario 2: Self-Reservation Block (FR-05)');

  // Scenario 3: Trust Score Lock (< 50)
  const store3 = createInitialStore();
  await assert.rejects(
    () =>
      placeHoldInSim(store3, {
        itemId: 'item_01',
        requesterId: 'student_low_trust',
        holdDurationHours: 24,
        proposedTime: validMeetup,
        nowMs: baseNow,
      }),
    /dưới 50/
  );
  assert.equal(store3.holds.size, 0);
  console.log('[PASS] Scenario 3: Trust Score Lock < 50 (FR-07)');

  // Scenario 4: Hold Window Validation (FR-05.2)
  assert.throws(
    () => validateHoldWindow(24, new Date(baseNow + 36 * 3600 * 1000), baseNow),
    /khung giữ chỗ 24 giờ/
  );
  assert.doesNotThrow(() => validateHoldWindow(24, new Date(baseNow + 20 * 3600 * 1000), baseNow));
  console.log('[PASS] Scenario 4: Hold Window Validation (24h rejects +36h, accepts +20h)');

  // Scenario 5: Anti-Self-Completion (FR-06.1)
  const winnerUid = holdState.requester_id;
  await assert.rejects(() => completeHoldInSim(store1, winnerHoldId, winnerUid), /Chỉ người đăng vật phẩm/);
  await completeHoldInSim(store1, winnerHoldId, 'seller_01');
  assert.equal(store1.holds.get(winnerHoldId)!.data.hold_status, 'converted');
  assert.equal(store1.items.get('item_01')!.data.item_status, 'completed');
  assert.equal(store1.users.get(winnerUid)!.data.current_trust_score, 105);
  console.log('[PASS] Scenario 5: Anti-Self-Completion & Seller Finalization (+5 trust score)');

  console.log('\nALL 5 SCENARIOS PASSED.');
}

main().catch((err) => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
