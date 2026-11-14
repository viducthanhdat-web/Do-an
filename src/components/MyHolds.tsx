import React, { useEffect, useState } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/FirebaseProvider';
import {
  cancelHoldWithTransaction,
  completeHoldWithTransaction,
  confirmBuyerReceivedWithTransaction,
  confirmHoldMeetupWithTransaction,
  releaseExpiredHoldsIfAny,
  rescheduleHoldMeetupWithTransaction,
} from '../lib/exchangeService';
import {
  DEFAULT_MEETUP_LOCATIONS,
  HoldDoc,
  MeetupLocationDoc,
  MeetupStatus,
  normalizeHoldDoc,
  toDateSafe,
} from '../types/schema';
import {
  Calendar,
  MapPin,
  Clock,
  User as UserIcon,
  BookOpen,
  History as HistoryIcon,
  Phone,
  CheckCircle2,
  XCircle,
  Edit3,
  Check,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { motion } from 'motion/react';

function formatDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function getMeetupStatusLabel(status?: MeetupStatus): { text: string; className: string } {
  switch (status) {
    case 'confirmed':
      return { text: 'Đã chốt lịch hẹn', className: 'bg-emerald-100 text-emerald-700' };
    case 'rescheduled':
      return { text: 'Đã dời lịch hẹn', className: 'bg-amber-100 text-amber-800' };
    default:
      return { text: 'Đề xuất lịch hẹn', className: 'bg-slate-100 text-slate-700' };
  }
}

export const MyHolds: React.FC = () => {
  const { user } = useAuth();
  const [reqHolds, setReqHolds] = useState<HoldDoc[]>([]);
  const [sellerHolds, setSellerHolds] = useState<HoldDoc[]>([]);
  const [locations, setLocations] = useState<MeetupLocationDoc[]>(DEFAULT_MEETUP_LOCATIONS);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<Record<string, 'free' | 'cash' | 'bank_transfer'>>({});

  // Inline reschedule editor state
  const [editingHoldId, setEditingHoldId] = useState<string | null>(null);
  const [editLocId, setEditLocId] = useState<string>(DEFAULT_MEETUP_LOCATIONS[0].id);
  const [editTimeStr, setEditTimeStr] = useState<string>('');
  const [editNote, setEditNote] = useState<string>('');

  useEffect(() => {
    getDocs(collection(db, 'meetup_locations'))
      .then((snap) => {
        if (!snap.empty) {
          const list: MeetupLocationDoc[] = [];
          snap.forEach((d) => {
            const data = d.data() as Omit<MeetupLocationDoc, 'id'>;
            if (data.is_active !== false) list.push({ id: d.id, ...data });
          });
          if (list.length > 0) setLocations(list);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    releaseExpiredHoldsIfAny().catch(() => {});

    const qRequester = query(collection(db, 'holds'), where('requester_id', '==', user.uid));
    const qSeller = query(collection(db, 'holds'), where('seller_id', '==', user.uid));

    const unsub1 = onSnapshot(qRequester, (snap) => {
      const list: HoldDoc[] = [];
      snap.forEach((d) => list.push(normalizeHoldDoc(d.id, d.data())));
      setReqHolds(list);
      setLoading(false);
    });

    const unsub2 = onSnapshot(qSeller, (snap) => {
      const list: HoldDoc[] = [];
      snap.forEach((d) => list.push(normalizeHoldDoc(d.id, d.data())));
      setSellerHolds(list);
      setLoading(false);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  const mergedMap = new Map<string, HoldDoc>();
  [...reqHolds, ...sellerHolds].forEach((h) => mergedMap.set(h.id, h));
  const allHolds = Array.from(mergedMap.values()).sort(
    (a, b) => toDateSafe(b.created_at).getTime() - toDateSafe(a.created_at).getTime()
  );

  const activeHolds = allHolds.filter((h) => h.hold_status === 'active');
  const pastHolds = allHolds.filter((h) => h.hold_status !== 'active');

  const openRescheduleEditor = (hold: HoldDoc) => {
    if (editingHoldId === hold.id) {
      setEditingHoldId(null);
      return;
    }
    const matchedLoc =
      locations.find((l) => l.id === hold.meetup_summary?.location_id) ||
      locations.find((l) => l.location_name === hold.meetup_summary?.location_name) ||
      locations[0];
    const proposed = hold.meetup_summary?.proposed_time
      ? toDateSafe(hold.meetup_summary.proposed_time)
      : new Date(Date.now() + 2 * 3600 * 1000);
    setEditingHoldId(hold.id);
    setEditLocId(matchedLoc.id);
    setEditTimeStr(formatDatetimeLocal(proposed));
    setEditNote(hold.meetup_summary?.note || '');
  };

  const handleConfirmMeetup = async (hold: HoldDoc) => {
    if (!user) return;
    setProcessingId(hold.id);
    try {
      await confirmHoldMeetupWithTransaction(hold, user.uid);
    } catch (err: any) {
      alert(err?.message || 'Không thể chốt lịch hẹn.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleSaveReschedule = async (e: React.FormEvent, hold: HoldDoc) => {
    e.preventDefault();
    if (!user) return;
    const selectedLoc = locations.find((l) => l.id === editLocId) || locations[0];
    const proposedDate = new Date(editTimeStr);

    setProcessingId(hold.id);
    try {
      await rescheduleHoldMeetupWithTransaction({
        hold,
        actorUid: user.uid,
        locationId: selectedLoc.id,
        locationName: selectedLoc.location_name,
        proposedTime: proposedDate,
        note: editNote,
      });
      setEditingHoldId(null);
    } catch (err: any) {
      alert(err?.message || 'Không thể cập nhật lịch hẹn.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleBuyerConfirm = async (hold: HoldDoc) => {
    if (!user) return;
    setProcessingId(hold.id);
    try {
      await confirmBuyerReceivedWithTransaction(hold, user.uid);
    } catch (err: any) {
      alert(err?.message || 'Không thể ghi nhận xác nhận đã nhận đồ.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleComplete = async (hold: HoldDoc) => {
    if (!user) return;
    const method = paymentMethods[hold.id] || 'free';
    setProcessingId(hold.id);
    try {
      await completeHoldWithTransaction(hold, user.uid, method);
    } catch (err: any) {
      alert(err?.message || 'Không thể xác nhận giao dịch.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (hold: HoldDoc) => {
    if (!user) return;
    const isRequester = user.uid === hold.requester_id;
    const confirmMsg = isRequester
      ? 'Hủy giữ chỗ sẽ trả vật phẩm về sàn và trừ 10 điểm tín nhiệm của bạn. Bạn chắc chắn muốn hủy?'
      : 'Bạn muốn hủy lịch hẹn này và mở khóa lại vật phẩm lên sàn?';
    if (!window.confirm(confirmMsg)) return;

    setProcessingId(hold.id);
    try {
      await cancelHoldWithTransaction(
        hold,
        user.uid,
        isRequester ? 'Người nhận chủ động hủy hẹn' : 'Người đăng hủy lịch hẹn'
      );
    } catch (err: any) {
      alert(err?.message || 'Không thể hủy lịch hẹn.');
    } finally {
      setProcessingId(null);
    }
  };

  if (!user) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center">
        <p className="text-slate-500 font-bold">Vui lòng đăng nhập để xem lịch hẹn giữ chỗ và lịch sử giao dịch.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-white rounded-3xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
          <Clock className="text-blue-600" />
          Phiên giữ chỗ &amp; Lịch hẹn đang diễn ra ({activeHolds.length})
        </h2>

        {activeHolds.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {activeHolds.map((hold) => {
              const isBuyer = hold.requester_id === user.uid;
              const partnerName = isBuyer
                ? hold.seller_summary?.full_name || 'Người đăng'
                : hold.requester_summary?.full_name || 'Người nhận';
              const partnerPhone = isBuyer
                ? hold.seller_summary?.phone_number
                : hold.requester_summary?.phone_number;
              const meetupBadge = getMeetupStatusLabel(hold.meetup_summary?.status);
              const buyerConfirmed = Boolean(hold.meetup_summary?.buyer_confirmed);
              const isEditing = editingHoldId === hold.id;
              const minEditTime = formatDatetimeLocal(new Date(Date.now() + 5 * 60 * 1000));
              const maxEditTime = formatDatetimeLocal(toDateSafe(hold.hold_expires_at));

              return (
                <motion.div
                  key={hold.id}
                  layout
                  className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden border border-slate-100">
                        {hold.primary_image ? (
                          <img
                            src={hold.primary_image}
                            alt={hold.item_title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <BookOpen className="text-blue-600" size={26} />
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              'px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider',
                              isBuyer ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                            )}
                          >
                            {isBuyer ? 'Bạn đặt nhận (Requester)' : 'Bạn giao đồ (Seller)'}
                          </span>
                          <span
                            className={cn(
                              'px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider',
                              meetupBadge.className
                            )}
                          >
                            {meetupBadge.text}
                          </span>
                          {buyerConfirmed && (
                            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white">
                              Người nhận xác nhận đã nhận đồ
                            </span>
                          )}
                          <h3 className="font-bold text-slate-900 text-lg">{hold.item_title}</h3>
                        </div>

                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600 font-medium">
                          <span className="flex items-center gap-1.5">
                            <UserIcon size={14} className="text-slate-400" />
                            {isBuyer ? 'Người cho/bán:' : 'Sinh viên nhận:'} <strong>{partnerName}</strong>
                          </span>
                          {partnerPhone && (
                            <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
                              <Phone size={14} /> {partnerPhone}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <MapPin size={14} className="text-slate-400" />
                            {hold.meetup_summary?.location_name}
                          </span>
                          {hold.meetup_summary?.proposed_time && (
                            <span className="flex items-center gap-1.5">
                              <Calendar size={14} className="text-slate-400" />
                              Hẹn lúc: {format(toDateSafe(hold.meetup_summary.proposed_time), 'HH:mm dd/MM/yyyy')}
                            </span>
                          )}
                        </div>

                        {hold.meetup_summary?.note && (
                          <p className="text-xs text-slate-500 italic">
                            Ghi chú: &ldquo;{hold.meetup_summary.note}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col lg:items-end gap-2.5 shrink-0">
                      <div className="bg-amber-50 text-amber-700 border border-amber-200 px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5">
                        <Clock size={14} />
                        Khóa hết hạn:{' '}
                        {formatDistanceToNow(toDateSafe(hold.hold_expires_at), { addSuffix: true, locale: vi })}
                      </div>

                      <div className="flex flex-wrap gap-2 w-full lg:w-auto lg:justify-end">
                        <button
                          disabled={processingId === hold.id}
                          onClick={() => openRescheduleEditor(hold)}
                          className="px-3.5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Edit3 size={14} /> Đổi giờ/điểm hẹn
                        </button>

                        {!isBuyer && hold.meetup_summary?.status !== 'confirmed' && (
                          <button
                            disabled={processingId === hold.id}
                            onClick={() => handleConfirmMeetup(hold)}
                            className="px-3.5 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all flex items-center justify-center gap-1.5"
                          >
                            <Check size={14} /> Chốt lịch hẹn
                          </button>
                        )}

                        <button
                          disabled={processingId === hold.id}
                          onClick={() => handleCancel(hold)}
                          className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-all flex items-center justify-center gap-1.5"
                        >
                          <XCircle size={15} /> Hủy hẹn
                        </button>

                        {isBuyer ? (
                          buyerConfirmed ? (
                            <span className="px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
                              <CheckCircle2 size={15} /> Chờ người đăng xác nhận giao đồ (+5đ)
                            </span>
                          ) : (
                            <button
                              disabled={processingId === hold.id}
                              onClick={() => handleBuyerConfirm(hold)}
                              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-md flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle2 size={15} /> Báo đã nhận đồ
                            </button>
                          )
                        ) : (
                          <div className="flex items-center gap-2">
                            <select
                              value={paymentMethods[hold.id] || 'free'}
                              onChange={(e) =>
                                setPaymentMethods((prev) => ({
                                  ...prev,
                                  [hold.id]: e.target.value as 'free' | 'cash' | 'bank_transfer',
                                }))
                              }
                              aria-label="Phương thức giao nhận"
                              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
                            >
                              <option value="free">Tặng 0đ</option>
                              <option value="cash">Tiền mặt</option>
                              <option value="bank_transfer">Chuyển khoản</option>
                            </select>
                            <button
                              disabled={processingId === hold.id}
                              onClick={() => handleComplete(hold)}
                              className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-md flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle2 size={15} /> Xác nhận Đã giao đồ (+5đ người nhận)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {isEditing && (
                    <form
                      onSubmit={(e) => handleSaveReschedule(e, hold)}
                      className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
                    >
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">Điểm hẹn nội khu</label>
                        <select
                          value={editLocId}
                          onChange={(e) => setEditLocId(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
                        >
                          {locations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.location_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">
                          Giờ hẹn mới (trong hạn giữ chỗ)
                        </label>
                        <input
                          required
                          type="datetime-local"
                          min={minEditTime}
                          max={maxEditTime}
                          value={editTimeStr}
                          onChange={(e) => setEditTimeStr(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">Ghi chú nhận diện</label>
                        <input
                          type="text"
                          maxLength={500}
                          placeholder="Ghi chú địa điểm/trang phục..."
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingHoldId(null)}
                          className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200"
                        >
                          Đóng
                        </button>
                        <button
                          disabled={processingId === hold.id}
                          type="submit"
                          className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
                        >
                          Lưu lịch hẹn
                        </button>
                      </div>
                    </form>
                  )}
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 border-dashed rounded-3xl p-12 text-center">
            <p className="text-slate-400 font-bold">Hiện không có phiên giữ chỗ nào đang chờ gặp mặt.</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
          <HistoryIcon className="text-slate-400" />
          Lịch sử Phiên giữ chỗ &amp; Giao dịch
        </h2>

        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
          {pastHolds.length > 0 ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Vật phẩm</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Vai trò</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Trạng thái</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">
                    Thời gian
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pastHolds.map((hold) => {
                  const isBuyer = hold.requester_id === user.uid;
                  const durationHours =
                    hold.hold_duration_hours ||
                    (Math.round(
                      (toDateSafe(hold.hold_expires_at).getTime() - toDateSafe(hold.hold_start_time).getTime()) /
                        3600000
                    ) <= 25
                      ? 24
                      : 48);
                  return (
                    <tr key={hold.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{hold.item_title}</p>
                        {hold.cancel_reason && (
                          <p className="text-xs text-slate-400 font-medium">{hold.cancel_reason}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600">
                        {isBuyer ? 'Người nhận' : 'Người đăng'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'px-3 py-1 rounded-full text-[11px] font-black uppercase',
                            hold.hold_status === 'converted'
                              ? 'bg-emerald-100 text-emerald-700'
                              : hold.hold_status === 'expired'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-600'
                          )}
                        >
                          {hold.hold_status === 'converted'
                            ? isBuyer
                              ? 'Hoàn tất (+5đ)'
                              : 'Đã bàn giao'
                            : hold.hold_status === 'expired'
                            ? isBuyer
                              ? `Quá hạn ${durationHours}h (-10đ)`
                              : 'Người nhận để quá hạn'
                            : 'Đã hủy'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-slate-500">
                        {format(toDateSafe(hold.created_at), 'dd/MM/yyyy HH:mm')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-400 font-bold">Chưa có lịch sử giao dịch.</div>
          )}
        </div>
      </section>
    </div>
  );
};
