import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import { useAuth } from '../lib/FirebaseProvider';
import { 
  Package, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  MoreVertical
} from 'lucide-react';
import { motion } from 'motion/react';

interface Item {
  id: string;
  title: string;
  category: string;
  status: 'available' | 'held' | 'exchanged';
  createdAt: any;
}

export const MyItems: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'items'),
      where('sellerId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsList: Item[] = [];
      snapshot.forEach((doc) => {
        itemsList.push({ id: doc.id, ...doc.data() } as Item);
      });
      setItems(itemsList.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'items');
    });

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (itemId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa tin đăng này?')) return;
    try {
      await deleteDoc(doc(db, 'items', itemId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `items/${itemId}`);
    }
  };

  if (loading) return <div className="space-y-4 animate-pulse">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-3xl" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Đồ của tôi</h2>
        <div className="bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold text-slate-500 uppercase tracking-widest">
          Tổng cộng: {items.length}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {items.length > 0 ? (
          items.map((item) => (
            <motion.div
              key={item.id}
              layout
              className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex items-center justify-between group hover:border-slate-300 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center",
                  item.status === 'available' ? "bg-emerald-50 text-emerald-500" :
                  item.status === 'held' ? "bg-amber-50 text-amber-500" : "bg-slate-50 text-slate-400"
                )}>
                  <Package size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg mb-1">{item.title}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {item.category === 'Textbook' ? 'Giáo trình' : 
                       item.category === 'Equipment' ? 'Thiết thiết bị' : 
                       item.category === 'Note' ? 'Tài liệu' : 'Khác'}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-slate-200" />
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest flex items-center gap-1",
                      item.status === 'available' ? "text-emerald-500" :
                      item.status === 'held' ? "text-amber-500" : "text-slate-400"
                    )}>
                      {item.status === 'available' ? 'Đang hiển thị' :
                       item.status === 'held' ? 'Đang được giữ' : 'Đã trao đổi'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={item.status === 'held'}
                  onClick={() => handleDelete(item.id)}
                  className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all disabled:opacity-0"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="bg-white border border-slate-200 border-dashed rounded-3xl p-20 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="text-slate-200" size={32} />
            </div>
            <p className="text-slate-400 font-bold">Bạn chưa đăng món đồ nào.</p>
          </div>
        )}
      </div>
    </div>
  );
};
