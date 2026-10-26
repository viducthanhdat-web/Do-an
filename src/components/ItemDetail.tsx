import React, { useState } from 'react';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/FirebaseProvider';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import { 
  X, 
  MapPin, 
  Calendar, 
  ShieldCheck, 
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Cpu
} from 'lucide-react';
import { format, addHours } from 'date-fns';
import { vi } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

interface Item {
  id: string;
  title: string;
  description: string;
  category: string;
  subject: string;
  condition: string;
  price: number;
  sellerId: string;
  sellerName: string;
  status: 'available' | 'held' | 'exchanged';
  imageUrl?: string;
  createdAt: string;
}

export const ItemDetail: React.FC<{ item: Item, onClose: () => void }> = ({ item, onClose }) => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showHoldSuccess, setShowHoldSuccess] = useState(false);
  const [meetupPoint, setMeetupPoint] = useState('Thư viện');

  const handleHold = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Update item status to 'held'
      await updateDoc(doc(db, 'items', item.id), {
        status: 'held',
        updatedAt: serverTimestamp()
      });

      // 2. Create hold record
      await addDoc(collection(db, 'holds'), {
        itemId: item.id,
        itemTitle: item.title,
        requesterId: user.uid,
        requesterName: profile?.displayName || 'Anonymous',
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        expiresAt: addHours(new Date(), 48).toISOString(),
        meetupPoint: meetupPoint,
        status: 'active',
        createdAt: serverTimestamp()
      });

      setShowHoldSuccess(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'items');
    } finally {
      setLoading(false);
    }
  };

  const isSeller = user?.uid === item.sellerId;

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
        className="relative bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col lg:flex-row"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-10 p-2 bg-white/80 backdrop-blur-md rounded-full text-slate-500 hover:text-slate-900 shadow-sm transition-all"
        >
          <X size={20} />
        </button>

        {/* Left Side - Image/Visual */}
        <div className="w-full lg:w-1/2 h-64 lg:h-auto bg-slate-100 relative">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-4">
              {item.category === 'Textbook' ? <BookOpen size={80} /> : <Cpu size={80} />}
              <span className="text-sm font-bold uppercase tracking-widest">{item.category}</span>
            </div>
          )}
          <div className="absolute top-8 left-8">
            <span className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg">
              {item.subject}
            </span>
          </div>
        </div>

        {/* Right Side - Details */}
        <div className="flex-1 p-8 lg:p-12 overflow-y-auto max-h-[80vh] lg:max-h-none">
          <AnimatePresence mode="wait">
            {!showHoldSuccess ? (
              <motion.div
                key="details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div>
                  <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-widest mb-2">
                    <ShieldCheck size={14} className="text-emerald-500" />
                    Đã kiểm duyệt · {item.condition} mới
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-4">{item.title}</h2>
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-black text-slate-900">
                      {item.price === 0 ? 'Miễn phí' : `${item.price.toLocaleString()}đ`}
                    </div>
                    {item.price > 0 && (
                      <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md uppercase tracking-tighter">Giá tượng trưng</span>
                    )}
                  </div>
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Mô tả</h4>
                  <p className="text-slate-600 font-medium leading-relaxed">
                    {item.description || 'Không có mô tả chi tiết.'}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border-2 border-white shadow-sm">
                        <UserIcon size={18} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{item.sellerName}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Người đăng tin</p>
                      </div>
                    </div>
                  </div>
                </div>

                {!isSeller && (
                  <div className="space-y-6 pt-6">
                    <div className="space-y-3">
                      <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <MapPin size={16} />
                        Điểm hẹn trong trường
                      </label>
                      <select
                        value={meetupPoint}
                        onChange={(e) => setMeetupPoint(e.target.value)}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none transition-all font-semibold"
                      >
                        <option value="Thư viện">Thư viện</option>
                        <option value="Sảnh nhà A">Sảnh nhà A</option>
                        <option value="Nhà văn hóa sinh viên">Nhà văn hóa sinh viên</option>
                        <option value="Căn tin trung tâm">Căn tin trung tâm</option>
                      </select>
                    </div>

                    <button
                      disabled={loading || !user}
                      onClick={handleHold}
                      className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {loading ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : !user ? (
                        'Đăng nhập để nhận đồ'
                      ) : (
                        'Đặt giữ đồ ngay'
                      )}
                    </button>
                    <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">
                      * Giữ đồ tối đa 48h. Hãy đến đúng hẹn!
                    </p>
                  </div>
                )}

                {isSeller && (
                  <div className="pt-6">
                    <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-4">
                      <CheckCircle2 className="text-emerald-500 shrink-0" size={24} />
                      <div>
                        <h4 className="font-bold text-emerald-900 text-sm">Tin đăng của bạn</h4>
                        <p className="text-xs text-emerald-700 font-medium mt-1">
                          Bạn có thể quản lý trạng thái món đồ trong phần "Đồ của tôi".
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="h-full flex flex-col items-center justify-center text-center space-y-6 py-12"
              >
                <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={48} className="text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-slate-900 mb-2">Thành công!</h2>
                  <p className="text-slate-600 font-medium">
                    Bạn đã đặt giữ món đồ thành công.<br />Vui lòng liên hệ và gặp người bán trong vòng 48h.
                  </p>
                </div>
                <div className="w-full p-6 bg-slate-50 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-bold">Điểm hẹn</span>
                    <span className="text-slate-900 font-black">{meetupPoint}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-bold">Hết hạn sau</span>
                    <span className="text-red-500 font-black">48 giờ</span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg"
                >
                  Đã hiểu
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
