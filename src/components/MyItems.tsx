import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import { useAuth } from '../lib/FirebaseProvider';
import { CATEGORY_LABELS, ItemDoc, normalizeItemDoc, toDateSafe } from '../types/schema';
import { Package, Trash2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export const MyItems: React.FC = () => {
  const [items, setItems] = useState<ItemDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'items'), where('seller_id', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const itemsList: ItemDoc[] = [];
        snapshot.forEach((d) => {
          itemsList.push(normalizeItemDoc(d.id, d.data()));
        });
        itemsList.sort((a, b) => toDateSafe(b.created_at).getTime() - toDateSafe(a.created_at).getTime());
        setItems(itemsList);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'items');
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (item: ItemDoc) => {
    if (item.item_status === 'held') return;
    if (!window.confirm('Bạn có chắc chắn muốn xóa tin đăng này?')) return;
    try {
      await deleteDoc(doc(db, 'items', item.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `items/${item.id}`);
    }
  };

  if (!user) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center">
        <p className="text-slate-500 font-bold">Vui lòng đăng nhập để quản lý các vật phẩm đã đăng.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-white rounded-3xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Đồ của tôi</h2>
        <div className="bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 uppercase tracking-widest">
          Tổng bài đăng: {items.length}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {items.length > 0 ? (
          items.map((item) => (
            <motion.div
              key={item.id}
              layout
              className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex items-center justify-between gap-4 hover:border-slate-300 transition-all"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className={cn(
                    'w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden',
                    item.item_status === 'available'
                      ? 'bg-emerald-50 text-emerald-600'
                      : item.item_status === 'held'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-slate-100 text-slate-400'
                  )}
                >
                  {item.primary_image ? (
                    <img src={item.primary_image} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <Package size={24} />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-bold text-slate-900 text-lg truncate">{item.title}</h3>
                    <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {item.price === 0 ? 'Tặng 0đ' : `${item.price.toLocaleString('vi-VN')}đ`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap text-xs font-bold">
                    <span className="text-slate-400 uppercase">
                      {CATEGORY_LABELS[item.category_id]} · {item.subject_name || item.subject_id}
                    </span>
                    <span className="text-slate-300">•</span>
                    {/* Moderation Status Badge */}
                    <span
                      className={cn(
                        'px-2.5 py-0.5 rounded-md uppercase text-[10px] font-black',
                        item.moderation_status === 'approved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : item.moderation_status === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      )}
                    >
                      {item.moderation_status === 'approved'
                        ? 'Đã duyệt'
                        : item.moderation_status === 'pending'
                        ? 'Chờ Admin duyệt'
                        : 'Bị từ chối'}
                    </span>

                    {/* Item Status Badge */}
                    <span
                      className={cn(
                        'uppercase text-[11px] font-black',
                        item.item_status === 'available'
                          ? 'text-emerald-600'
                          : item.item_status === 'held'
                          ? 'text-amber-600'
                          : 'text-slate-400'
                      )}
                    >
                      {item.item_status === 'available'
                        ? 'Sẵn sàng trên sàn'
                        : item.item_status === 'held'
                        ? 'Đang được giữ chỗ (Khóa xóa)'
                        : item.item_status === 'completed'
                        ? 'Đã trao đổi xong'
                        : 'Đã ẩn'}
                    </span>
                  </div>

                  {item.moderation_status === 'rejected' && item.reject_reason && (
                    <p className="text-xs text-red-600 font-semibold mt-1.5 flex items-center gap-1">
                      <AlertCircle size={13} /> Lý do từ chối: {item.reject_reason}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  disabled={item.item_status === 'held'}
                  title={
                    item.item_status === 'held'
                      ? 'Không thể xóa khi đang có sinh viên giữ chỗ hẹn nhận (BR-01)'
                      : 'Xóa bài đăng'
                  }
                  onClick={() => handleDelete(item)}
                  className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all disabled:opacity-25 disabled:cursor-not-allowed"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="bg-white border border-slate-200 border-dashed rounded-3xl p-20 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="text-slate-300" size={32} />
            </div>
            <p className="text-slate-400 font-bold">Bạn chưa đăng chia sẻ vật phẩm nào.</p>
          </div>
        )}
      </div>
    </div>
  );
};
