import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/FirebaseProvider';
import {
  adjustTrustScoreByAdmin,
  moderateItemWithBatch,
  seedDefaultMasterData,
} from '../lib/exchangeService';
import {
  CATEGORY_LABELS,
  ItemDoc,
  MeetupLocationDoc,
  normalizeItemDoc,
  normalizeUserDoc,
  SubjectDoc,
  toDateSafe,
  UserProfile,
} from '../types/schema';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  BookOpen,
  MapPin,
  Users,
  Sparkles,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '../lib/utils';

export const AdminDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [subTab, setSubTab] = useState<'moderation' | 'catalog' | 'users'>('moderation');
  const [items, setItems] = useState<ItemDoc[]>([]);
  const [subjects, setSubjects] = useState<SubjectDoc[]>([]);
  const [locations, setLocations] = useState<MeetupLocationDoc[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [seeding, setSeeding] = useState(false);

  // Add Subject Form
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [faculty, setFaculty] = useState('Công nghệ thông tin');

  // Add Location Form
  const [locName, setLocName] = useState('');
  const [campus, setCampus] = useState('Khuôn viên chính');
  const [landmark, setLandmark] = useState('');

  useEffect(() => {
    if (profile?.role !== 'admin') return;

    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      const list: ItemDoc[] = [];
      snap.forEach((d) => list.push(normalizeItemDoc(d.id, d.data())));
      list.sort((a, b) => toDateSafe(b.created_at).getTime() - toDateSafe(a.created_at).getTime());
      setItems(list);
    });

    const unsubSub = onSnapshot(collection(db, 'subjects'), (snap) => {
      const list: SubjectDoc[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<SubjectDoc, 'id'>) }));
      setSubjects(list);
    });

    const unsubLoc = onSnapshot(collection(db, 'meetup_locations'), (snap) => {
      const list: MeetupLocationDoc[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<MeetupLocationDoc, 'id'>) }));
      setLocations(list);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => list.push(normalizeUserDoc(d.id, d.data())));
      setUsersList(list);
    });

    return () => {
      unsubItems();
      unsubSub();
      unsubLoc();
      unsubUsers();
    };
  }, [profile]);

  if (profile?.role !== 'admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center">
        <p className="text-red-600 font-bold">Khu vực chỉ dành cho Quản trị viên (Admin).</p>
      </div>
    );
  }

  const pendingItems = items.filter((i) => i.moderation_status === 'pending');

  const handleModerate = async (item: ItemDoc, action: 'approve' | 'reject') => {
    if (!user) return;
    let reason = 'Đạt chuẩn học liệu trường học';
    if (action === 'reject') {
      const input = window.prompt('Nhập lý do từ chối bài đăng để sinh viên chỉnh sửa:', 'Nội dung/hình ảnh chưa rõ ràng');
      if (input === null) return;
      reason = input;
    }
    await moderateItemWithBatch(item.id, user.uid, action, reason);
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDefaultMasterData();
      alert('Đã đồng bộ Danh mục, Môn học & Điểm hẹn mẫu lên Firestore thành công!');
    } finally {
      setSeeding(false);
    }
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = subCode.trim().toUpperCase();
    if (!code || !subName.trim()) return;
    await setDoc(doc(db, 'subjects', code), {
      subject_code: code,
      subject_name: subName.trim(),
      faculty: faculty.trim(),
      is_active: true,
    });
    setSubCode('');
    setSubName('');
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locName.trim()) return;
    const slug = locName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    await setDoc(doc(db, 'meetup_locations', slug || `loc-${Date.now()}`), {
      location_name: locName.trim(),
      campus: campus.trim(),
      landmark_description: landmark.trim(),
      is_active: true,
    });
    setLocName('');
    setLandmark('');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <ShieldCheck className="text-emerald-600" size={32} />
            Bảng Điều Khiển Quản Trị (FR-03 &amp; FR-07)
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Kiểm duyệt tin đăng, quản trị danh mục học phần/điểm hẹn và giám sát Điểm tín nhiệm sinh viên.
          </p>
        </div>

        <button
          disabled={seeding}
          onClick={handleSeed}
          className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 self-start"
        >
          <Sparkles size={15} />
          {seeding ? 'Đang khởi tạo...' : 'Khởi tạo Danh mục Chuẩn'}
        </button>
      </div>

      {/* Sub-navigation */}
      <div className="flex gap-2 p-1.5 bg-slate-200/60 rounded-2xl w-fit">
        <button
          onClick={() => setSubTab('moderation')}
          className={cn(
            'px-5 py-2.5 rounded-xl text-xs font-bold transition-all',
            subTab === 'moderation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          )}
        >
          Duyệt bài đăng ({pendingItems.length} chờ duyệt)
        </button>
        <button
          onClick={() => setSubTab('catalog')}
          className={cn(
            'px-5 py-2.5 rounded-xl text-xs font-bold transition-all',
            subTab === 'catalog' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          )}
        >
          Môn học &amp; Điểm hẹn ({subjects.length + locations.length})
        </button>
        <button
          onClick={() => setSubTab('users')}
          className={cn(
            'px-5 py-2.5 rounded-xl text-xs font-bold transition-all',
            subTab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          )}
        >
          Giám sát Điểm tín nhiệm ({usersList.length})
        </button>
      </div>

      {/* TAB 1: MODERATION */}
      {subTab === 'moderation' && (
        <div className="space-y-4">
          {items.length > 0 ? (
            items.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase',
                        item.moderation_status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : item.moderation_status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      )}
                    >
                      {item.moderation_status}
                    </span>
                    <h3 className="font-bold text-slate-900 text-lg">{item.title}</h3>
                    <span className="text-xs font-black text-emerald-700">
                      ({item.price === 0 ? 'Tặng 0đ' : `${item.price.toLocaleString('vi-VN')}đ`})
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{item.description}</p>
                  <p className="text-xs text-slate-400 font-semibold">
                    Người đăng: {item.seller_summary.full_name} · {CATEGORY_LABELS[item.category_id]} ·{' '}
                    {item.subject_name || item.subject_id}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.moderation_status !== 'approved' && (
                    <button
                      onClick={() => handleModerate(item, 'approve')}
                      className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={15} /> Duyệt đăng
                    </button>
                  )}
                  {item.moderation_status !== 'rejected' && (
                    <button
                      onClick={() => handleModerate(item, 'reject')}
                      className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 flex items-center gap-1.5"
                    >
                      <XCircle size={15} /> Từ chối
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-400 font-bold">
              Chưa có bài đăng nào trong hệ thống.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MASTER DATA (SUBJECTS & MEETUP LOCATIONS) */}
      {subTab === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
            <h3 className="font-black text-slate-900 flex items-center gap-2">
              <BookOpen size={18} /> Danh mục Môn học (`subjects`)
            </h3>
            <form onSubmit={handleAddSubject} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                required
                placeholder="Mã môn (INT1340)"
                value={subCode}
                onChange={(e) => setSubCode(e.target.value)}
                className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase"
              />
              <input
                required
                placeholder="Tên học phần"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
              >
                <Plus size={14} /> Thêm môn
              </button>
            </form>
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {subjects.map((s) => (
                <div key={s.id} className="py-2.5 flex justify-between text-sm">
                  <span className="font-bold text-slate-800">
                    {s.subject_code} — {s.subject_name}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">{s.faculty}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
            <h3 className="font-black text-slate-900 flex items-center gap-2">
              <MapPin size={18} /> Điểm hẹn An toàn (`meetup_locations`)
            </h3>
            <form onSubmit={handleAddLocation} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                required
                placeholder="Tên điểm hẹn"
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
              />
              <input
                placeholder="Mô tả cột mốc"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
              >
                <Plus size={14} /> Thêm điểm
              </button>
            </form>
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {locations.map((l) => (
                <div key={l.id} className="py-2.5 flex justify-between text-sm">
                  <div>
                    <p className="font-bold text-slate-800">{l.location_name}</p>
                    <p className="text-xs text-slate-400">{l.landmark_description}</p>
                  </div>
                  <span className="text-xs text-emerald-600 font-bold">{l.campus}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: USERS & TRUST SCORE MANAGEMENT */}
      {subTab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">Sinh viên</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">Điểm tín nhiệm</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase text-right">
                  Xử lý vi phạm / Khiếu nại (FR-07)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersList.map((u) => (
                <tr key={u.uid}>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">
                      {u.full_name} <span className="text-xs text-slate-400">({u.student_id_code})</span>
                    </p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        'px-3 py-1 rounded-full text-xs font-black',
                        u.current_trust_score >= 80
                          ? 'bg-emerald-100 text-emerald-700'
                          : u.current_trust_score >= 50
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      )}
                    >
                      {u.current_trust_score} điểm {u.current_trust_score < 50 && '(Đã khóa Hold)'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() =>
                        adjustTrustScoreByAdmin(
                          u.uid,
                          -30,
                          'NO_SHOW',
                          'Admin xác nhận vi phạm không đến điểm hẹn (No-show: -30 điểm)'
                        )
                      }
                      className="px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 inline-flex items-center gap-1"
                    >
                      <AlertTriangle size={13} /> Phạt No-show (-30đ)
                    </button>
                    <button
                      onClick={() =>
                        adjustTrustScoreByAdmin(
                          u.uid,
                          10,
                          'ADMIN_ADJUST',
                          'Admin khôi phục +10 điểm tín nhiệm sau khi xác minh khiếu nại'
                        )
                      }
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100"
                    >
                      Khôi phục (+10đ)
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
