import React, { useEffect, useState } from 'react';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/FirebaseProvider';
import { createHoldWithTransaction, validateHoldWindow } from '../lib/exchangeService';
import { formatUserError, logFirestoreError, OperationType } from '../lib/utils';
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  DEFAULT_MEETUP_LOCATIONS,
  ItemDoc,
  MeetupLocationDoc,
  normalizeItemDoc,
} from '../types/schema';
import {
  X,
  MapPin,
  Calendar,
  ShieldCheck,
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Cpu,
  Clock,
  Award,
} from 'lucide-react';
import { addHours, format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

function formatDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function getDefaultProposedTimeString(): string {
  const tomorrow = addHours(new Date(), 20);
  tomorrow.setMinutes(0, 0, 0);
  return formatDatetimeLocal(tomorrow);
}

export const ItemDetail: React.FC<{
  item: ItemDoc;
  onClose: () => void;
  onViewMyHolds?: () => void;
}> = ({ item, onClose, onViewMyHolds }) => {
  const { user, profile } = useAuth();
  const [liveItem, setLiveItem] = useState<ItemDoc>(item);
  const [itemUnavailableMsg, setItemUnavailableMsg] = useState('');
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [locations, setLocations] = useState<MeetupLocationDoc[]>(DEFAULT_MEETUP_LOCATIONS);
  const [selectedLocId, setSelectedLocId] = useState(DEFAULT_MEETUP_LOCATIONS[0].id);
  const [holdHours, setHoldHours] = useState<24 | 48>(48);
  const [proposedTimeStr, setProposedTimeStr] = useState(getDefaultProposedTimeString);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [holdResult, setHoldResult] = useState<{ expiresAt: Date; locationName: string } | null>(null);

  useEffect(() => {
    setLiveItem(item);
    setItemUnavailableMsg('');
    setActiveImageIdx(0);
    const unsubItem = onSnapshot(
      doc(db, 'items', item.id),
      (snap) => {
        if (snap.exists()) {
          setLiveItem(normalizeItemDoc(snap.id, snap.data()));
          setItemUnavailableMsg('');
        } else {
          setItemUnavailableMsg('Vật phẩm này đã bị gỡ hoặc không còn tồn tại trên hệ thống.');
        }
      },
      (err) => {
        logFirestoreError(err, OperationType.GET, `items/${item.id}`);
      }
    );
    return () => unsubItem();
  }, [item]);

  useEffect(() => {
    getDocs(collection(db, 'meetup_locations'))
      .then((snap) => {
        if (!snap.empty) {
          const list: MeetupLocationDoc[] = [];
          snap.forEach((d) => {
            const data = d.data() as Omit<MeetupLocationDoc, 'id'>;
            if (data.is_active !== false) list.push({ id: d.id, ...data });
          });
          if (list.length > 0) {
            setLocations(list);
            setSelectedLocId(list[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  const isSeller = user?.uid === liveItem.seller_id;
  const trustScore = profile?.current_trust_score ?? 100;
  const isTrustLocked = !!profile && trustScore < 50;
  const isAvailableForHold =
    !itemUnavailableMsg &&
    liveItem.item_status === 'available' &&
    liveItem.moderation_status === 'approved';
  const galleryImages =
    liveItem.image_urls.length > 0
      ? liveItem.image_urls
      : liveItem.primary_image
      ? [liveItem.primary_image]
      : [];
  const displayedImage = galleryImages[activeImageIdx] || liveItem.primary_image;
  const nowMs = Date.now();
  const minTimeStr = formatDatetimeLocal(new Date(nowMs + 5 * 60 * 1000));
  const maxTimeStr = formatDatetimeLocal(new Date(nowMs + holdHours * 3600 * 1000));

  const handleHold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !isAvailableForHold) return;

    setErrorMsg('');
    setLoading(true);
    try {
      const selectedLoc = locations.find((l) => l.id === selectedLocId) || locations[0];
      const proposedDate = new Date(proposedTimeStr);
      validateHoldWindow(holdHours, proposedDate);

      const res = await createHoldWithTransaction({
        itemId: liveItem.id,
        requester: profile,
        holdDurationHours: holdHours,
        locationId: selectedLoc.id,
        locationName: selectedLoc.location_name,
        proposedTime: proposedDate,
        note,
      });

      setHoldResult({
        expiresAt: res.expiresAt,
        locationName: selectedLoc.location_name,
      });
    } catch (err: unknown) {
      setErrorMsg(formatUserError(err, 'Không thể đặt giữ chỗ. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:p-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col lg:flex-row max-h-[90vh]"
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 z-10 p-2 bg-white/90 rounded-full text-slate-500 hover:text-slate-900 shadow-sm"
        >
          <X size={20} />
        </button>

        {/* Left Image Column */}
        <div className="w-full lg:w-5/12 h-56 lg:h-auto bg-slate-100 relative shrink-0 flex flex-col">
          <div className="flex-1 relative overflow-hidden">
            {displayedImage ? (
              <img src={displayedImage} alt={liveItem.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-3">
                {liveItem.category_id === 'giao-trinh' ? <BookOpen size={72} /> : <Cpu size={72} />}
                <span className="text-xs font-bold uppercase tracking-widest">
                  {CATEGORY_LABELS[liveItem.category_id]}
                </span>
              </div>
            )}
            <div className="absolute top-6 left-6">
              <span className="px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-lg">
                {liveItem.subject_name || liveItem.subject_id || CATEGORY_LABELS[liveItem.category_id]}
              </span>
            </div>
          </div>
          {galleryImages.length > 1 && (
            <div className="p-2.5 bg-white/90 border-t border-slate-100 flex gap-2 overflow-x-auto">
              {galleryImages.map((imgUrl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImageIdx(idx)}
                  className={`w-14 h-14 rounded-xl overflow-hidden border-2 shrink-0 ${
                    idx === activeImageIdx ? 'border-slate-900' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={imgUrl} alt={`${liveItem.title} ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Details & Hold Form */}
        <div className="flex-1 p-7 lg:p-10 overflow-y-auto">
          <AnimatePresence mode="wait">
            {!holdResult ? (
              <motion.div key="details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">
                    <ShieldCheck size={15} className="text-emerald-600" />
                    Đã kiểm duyệt · {CONDITION_LABELS[liveItem.condition_level]}
                  </div>
                  <h2 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-3">{liveItem.title}</h2>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className={`text-2xl font-black ${
                        liveItem.price === 0 ? 'text-emerald-600' : 'text-slate-900'
                      }`}
                    >
                      {liveItem.price === 0 ? 'Tặng miễn phí (0đ)' : `${liveItem.price.toLocaleString('vi-VN')}đ`}
                    </span>
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                      Người đăng: {liveItem.seller_summary.full_name} (Uy tín {liveItem.seller_summary.trust_score}đ)
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Mô tả tình trạng</h4>
                  <p className="text-sm text-slate-700 font-medium leading-relaxed">{liveItem.description}</p>
                </div>

                {errorMsg && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-red-700 text-sm font-semibold">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {isTrustLocked && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-semibold">
                    Điểm tín nhiệm hiện tại của bạn là <strong>{trustScore}đ (&lt; 50đ)</strong>. Quyền đặt giữ chỗ đang
                    tạm khóa theo quy định FR-07.
                  </div>
                )}

                {!isSeller && !isAvailableForHold && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-sm font-semibold flex items-start gap-2.5">
                    <AlertCircle size={18} className="shrink-0 mt-0.5 text-amber-600" />
                    <span>
                      {itemUnavailableMsg ||
                        (liveItem.item_status === 'held'
                          ? 'Món đồ này vừa được một sinh viên khác giữ chỗ (FR-04.4).'
                          : liveItem.item_status === 'completed'
                          ? 'Vật phẩm này đã được trao đổi hoàn tất.'
                          : 'Vật phẩm hiện không còn mở giữ chỗ trên sàn.')}
                    </span>
                  </div>
                )}

                {!isSeller ? (
                  <form onSubmit={handleHold} className="space-y-4 pt-2 border-t border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                          <MapPin size={14} /> Điểm hẹn an toàn trong trường
                        </label>
                        <select
                          value={selectedLocId}
                          onChange={(e) => setSelectedLocId(e.target.value)}
                          className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none"
                        >
                          {locations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.location_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                          <Clock size={14} /> Thời hạn khóa giữ chỗ
                        </label>
                        <select
                          value={holdHours}
                          onChange={(e) => {
                            const nextHours = Number(e.target.value) as 24 | 48;
                            setHoldHours(nextHours);
                            const currentProposed = new Date(proposedTimeStr);
                            if (
                              !isNaN(currentProposed.getTime()) &&
                              currentProposed.getTime() > Date.now() + nextHours * 3600 * 1000
                            ) {
                              setProposedTimeStr(getDefaultProposedTimeString());
                            }
                          }}
                          className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none"
                        >
                          <option value={24}>Giữ chỗ trong 24 giờ</option>
                          <option value={48}>Giữ chỗ tối đa 48 giờ</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                          <Calendar size={14} /> Thời gian hẹn gặp dự kiến
                        </label>
                        <input
                          required
                          type="datetime-local"
                          min={minTimeStr}
                          max={maxTimeStr}
                          value={proposedTimeStr}
                          onChange={(e) => setProposedTimeStr(e.target.value)}
                          className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                          <UserIcon size={14} /> Ghi chú nhận diện (tùy chọn)
                        </label>
                        <input
                          type="text"
                          placeholder="VD: Áo đồng phục khoa CNTT..."
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none"
                        />
                      </div>
                    </div>

                    <button
                      disabled={loading || !user || isTrustLocked || !isAvailableForHold}
                      type="submit"
                      className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-base hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : !user ? (
                        'Vui lòng đăng nhập ở thanh bên trái để giữ chỗ'
                      ) : !isAvailableForHold ? (
                        'Vật phẩm không còn sẵn sàng để giữ chỗ'
                      ) : (
                        `Đặt giữ chỗ độc quyền (${holdHours}h)`
                      )}
                    </button>
                    <p className="text-[11px] text-center text-slate-400 font-semibold">
                      * Sử dụng giao dịch nguyên tử (runTransaction) chống trùng lặp người nhận. Quá hạn sẽ tự mở khóa & trừ 10 điểm uy tín.
                    </p>
                  </form>
                ) : (
                  <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-3">
                    <Award className="text-emerald-600 shrink-0 mt-0.5" size={22} />
                    <div>
                      <h4 className="font-bold text-emerald-900 text-sm">Bài đăng của chính bạn</h4>
                      <p className="text-xs text-emerald-700 font-medium mt-1">
                        Bạn có thể theo dõi người đặt nhận tại mục &quot;Lịch hẹn &amp; Giao dịch&quot; hoặc quản lý tại &quot;Đồ của tôi&quot;.
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-8 flex flex-col items-center text-center space-y-5"
              >
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={42} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 mb-1">Đặt giữ chỗ thành công!</h2>
                  <p className="text-sm text-slate-600 font-medium">
                    Vật phẩm đã được khóa độc quyền cho bạn. Hãy đến điểm hẹn đúng giờ để nhận đồ và được +5 điểm uy tín!
                  </p>
                </div>
                <div className="w-full p-5 bg-slate-50 rounded-2xl space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Điểm hẹn nội khu:</span>
                    <span className="text-slate-900 font-bold">{holdResult.locationName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Tự động mở khóa sau:</span>
                    <span className="text-red-600 font-bold">
                      {format(holdResult.expiresAt, 'HH:mm - dd/MM/yyyy')}
                    </span>
                  </div>
                </div>
                <button
                  onClick={onViewMyHolds || onClose}
                  className="w-full bg-slate-900 text-white py-3.5 rounded-2xl font-bold hover:bg-slate-800 transition-all"
                >
                  Xem trong Lịch hẹn của tôi
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
