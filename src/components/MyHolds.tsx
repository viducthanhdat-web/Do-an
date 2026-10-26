import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import { useAuth } from '../lib/FirebaseProvider';
import { 
  Calendar, 
  MapPin, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  User as UserIcon,
  BookOpen,
  ChevronRight,
  History as HistoryIcon
} from 'lucide-react';
import { format, formatDistanceToNow, isAfter, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { motion } from 'motion/react';

interface Hold {
  id: string;
  itemId: string;
  itemTitle: string;
  requesterId: string;
  requesterName: string;
  sellerId: string;
  sellerName: string;
  expiresAt: string;
  meetupPoint: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  createdAt: any;
}

export const MyHolds: React.FC = () => {
  const [holds, setHolds] = useState<Hold[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // We want to see holds where the user is either the requester or the seller
    const q = query(
      collection(db, 'holds'),
      where('requesterId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const holdsList: Hold[] = [];
      snapshot.forEach((doc) => {
        holdsList.push({ id: doc.id, ...doc.data() } as Hold);
      });
      setHolds(holdsList.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'holds');
    });

    return () => unsubscribe();
  }, [user]);

  const handleAction = async (hold: Hold, newStatus: 'completed' | 'cancelled') => {
    try {
      const batch = writeBatch(db);

      // 1. Update hold status
      batch.update(doc(db, 'holds', hold.id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      // 2. Update item status
      const itemStatus = newStatus === 'completed' ? 'exchanged' : 'available';
      batch.update(doc(db, 'items', hold.itemId), {
        status: itemStatus,
        updatedAt: serverTimestamp()
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'holds');
    }
  };

  if (loading) return <div className="space-y-4 animate-pulse">{[1, 2, 3].map(i => <div key={i} className="h-32 bg-white rounded-3xl" />)}</div>;

  const activeHolds = holds.filter(h => h.status === 'active');
  const pastHolds = holds.filter(h => h.status !== 'active');

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
          <Clock className="text-blue-500" />
          Lịch hẹn hiện tại
        </h2>
        
        {activeHolds.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {activeHolds.map((hold) => (
              <motion.div
                key={hold.id}
                layout
                className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0">
                    <BookOpen className="text-blue-500" size={28} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg mb-1">{hold.itemTitle}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 font-semibold">
                      <div className="flex items-center gap-1.5">
                        <UserIcon size={14} />
                        Người đăng: {hold.sellerName}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin size={14} />
                        {hold.meetupPoint}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:items-end gap-2">
                  <div className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    <Clock size={14} />
                    Hết hạn: {formatDistanceToNow(parseISO(hold.expiresAt), { addSuffix: true, locale: vi })}
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    <button
                      onClick={() => handleAction(hold, 'cancelled')}
                      className="flex-1 md:flex-none px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                    >
                      Hủy hẹn
                    </button>
                    <button
                      onClick={() => handleAction(hold, 'completed')}
                      className="flex-1 md:flex-none px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-100"
                    >
                      Đã nhận đồ
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 border-dashed rounded-3xl p-12 text-center">
            <p className="text-slate-400 font-bold">Bạn chưa có lịch hẹn nào.</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
          <HistoryIcon className="text-slate-400" />
          Lịch sử trao đổi
        </h2>
        
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
          {pastHolds.length > 0 ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Món đồ</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Trạng thái</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Ngày</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pastHolds.map((hold) => (
                  <tr key={hold.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-5">
                      <p className="font-bold text-slate-900">{hold.itemTitle}</p>
                      <p className="text-xs text-slate-400 font-semibold">{hold.sellerName}</p>
                    </td>
                    <td className="px-6 py-5">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter",
                        hold.status === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {hold.status === 'completed' ? 'Hoàn thành' : 'Đã hủy'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-bold text-slate-500">
                      {hold.createdAt?.seconds ? format(new Date(hold.createdAt.seconds * 1000), 'dd/MM/yyyy') : '--/--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-400 font-bold">Chưa có lịch sử.</div>
          )}
        </div>
      </section>
    </div>
  );
};
