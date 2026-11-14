import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/FirebaseProvider';
import { toDateSafe, TrustHistoryEntry } from '../types/schema';
import { X, ShieldCheck, Award, Phone, Hash, User as UserIcon, CheckCircle2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export const ProfileModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { profile, updateProfileInfo } = useAuth();
  const [fullName, setFullName] = useState('');
  const [studentIdCode, setStudentIdCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [history, setHistory] = useState<TrustHistoryEntry[]>([]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setStudentIdCode(profile.student_id_code || '');
      setPhoneNumber(profile.phone_number || '');
    }
  }, [profile]);

  useEffect(() => {
    if (!isOpen || !profile) return;
    const unsub = onSnapshot(collection(db, 'users', profile.uid, 'trust_history'), (snap) => {
      const list: TrustHistoryEntry[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<TrustHistoryEntry, 'id'>) }));
      list.sort((a, b) => toDateSafe(b.created_at).getTime() - toDateSafe(a.created_at).getTime());
      setHistory(list);
    });
    return () => unsub();
  }, [isOpen, profile]);

  if (!isOpen || !profile) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    try {
      await updateProfileInfo({
        full_name: fullName,
        student_id_code: studentIdCode,
        phone_number: phoneNumber,
      });
      setSavedMsg('Đã cập nhật hồ sơ sinh viên thành công!');
    } finally {
      setSaving(false);
    }
  };

  const score = profile.current_trust_score;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-y-auto max-h-[88vh] p-8"
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 rounded-full"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-xl">
            {profile.full_name?.[0] || 'S'}
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900">Hồ sơ & Sổ Điểm Tín Nhiệm</h2>
            <p className="text-sm text-slate-500 font-medium">{profile.email}</p>
          </div>
        </div>

        {/* Trust Score Banner */}
        <div
          className={cn(
            'p-5 rounded-3xl border mb-6 flex items-center justify-between',
            score >= 80
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : score >= 50
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-900'
          )}
        >
          <div className="flex items-center gap-3">
            {score >= 50 ? <Award size={28} /> : <AlertTriangle size={28} />}
            <div>
              <p className="text-xs font-black uppercase tracking-widest opacity-70">Điểm tín nhiệm hiện tại</p>
              <p className="text-sm font-semibold mt-0.5">
                {score >= 80
                  ? 'Uy tín cao — Đầy đủ quyền đăng bài & đặt giữ chỗ'
                  : score >= 50
                  ? 'Cần lưu ý đúng hẹn (Dưới 50 điểm sẽ bị khóa quyền giữ chỗ)'
                  : 'Đang bị khóa quyền đặt giữ chỗ do điểm dưới mức tối thiểu (50 điểm)'}
              </p>
            </div>
          </div>
          <div className="text-3xl font-black">{score}</div>
        </div>

        {/* Edit Profile Form */}
        <form onSubmit={handleSave} className="space-y-4 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 mb-1.5">
                <Hash size={13} /> Mã sinh viên
              </label>
              <input
                required
                value={studentIdCode}
                onChange={(e) => setStudentIdCode(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm uppercase"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 mb-1.5">
                <UserIcon size={13} /> Họ và tên
              </label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 mb-1.5">
                <Phone size={13} /> SĐT liên hệ
              </label>
              <input
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="09xx..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            {savedMsg ? (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 size={15} /> {savedMsg}
              </span>
            ) : (
              <span />
            )}
            <button
              disabled={saving}
              type="submit"
              className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all"
            >
              {saving ? 'Đang lưu...' : 'Lưu thông tin'}
            </button>
          </div>
        </form>

        {/* Append-only Trust History Ledger */}
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
            <ShieldCheck size={16} /> Sổ cái Lịch sử Điểm tín nhiệm (trust_history)
          </h3>
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            {history.length > 0 ? (
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {history.map((log) => (
                  <div key={log.id} className="px-4 py-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">{log.description}</p>
                      <p className="text-xs text-slate-400 font-medium">
                        {log.event_type} · {format(toDateSafe(log.created_at), 'dd/MM/yyyy HH:mm')}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <span
                        className={cn(
                          'font-black text-sm',
                          log.score_change > 0
                            ? 'text-emerald-600'
                            : log.score_change < 0
                            ? 'text-red-600'
                            : 'text-slate-600'
                        )}
                      >
                        {log.score_change > 0 ? `+${log.score_change}` : log.score_change}
                      </span>
                      <p className="text-[11px] text-slate-400 font-bold">Số dư: {log.balance_after}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-slate-400 font-medium">
                Chưa phát sinh biến động điểm tín nhiệm.
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
