import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/FirebaseProvider';
import {
  adjustTrustScoreByAdmin,
  moderateItemWithBatch,
  seedDefaultMasterData,
  setUserAccountStatusByAdmin,
  toggleCatalogActiveByAdmin,
} from '../lib/exchangeService';
import {
  CATEGORY_LABELS,
  CategoryDoc,
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
  Sparkles,
  Plus,
  AlertTriangle,
  EyeOff,
  Lock,
  Unlock,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { cn, formatUserError, logFirestoreError, OperationType, toSlugVi } from '../lib/utils';

export const AdminDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [subTab, setSubTab] = useState<'moderation' | 'catalog' | 'users'>('moderation');
  const [items, setItems] = useState<ItemDoc[]>([]);
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [subjects, setSubjects] = useState<SubjectDoc[]>([]);
  const [locations, setLocations] = useState<MeetupLocationDoc[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');

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

    const unsubItems = onSnapshot(
      collection(db, 'items'),
      (snap) => {
        const list: ItemDoc[] = [];
        snap.forEach((d) => list.push(normalizeItemDoc(d.id, d.data())));
        list.sort((a, b) => toDateSafe(b.created_at).getTime() - toDateSafe(a.created_at).getTime());
        setItems(list);
      },
      (err) => {
        logFirestoreError(err, OperationType.LIST, 'items');
        setErrorMsg(formatUserError(err, 'Không thể tải danh sách bài đăng.'));
      }
    );

    const unsubCat = onSnapshot(
      collection(db, 'categories'),
      (snap) => {
        const list: CategoryDoc[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<CategoryDoc, 'id'>) }));
        list.sort((a, b) => (a.display_order ?? 99) - (b.display_order ?? 99));
        setCategories(list);
      },
      (err) => {
        logFirestoreError(err, OperationType.LIST, 'categories');
      }
    );

    const unsubSub = onSnapshot(
      collection(db, 'subjects'),
      (snap) => {
        const list: SubjectDoc[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<SubjectDoc, 'id'>) }));
        setSubjects(list);
      },
      (err) => {
        logFirestoreError(err, OperationType.LIST, 'subjects');
      }
    );

    const unsubLoc = onSnapshot(
      collection(db, 'meetup_locations'),
      (snap) => {
        const list: MeetupLocationDoc[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<MeetupLocationDoc, 'id'>) }));
        setLocations(list);
      },
      (err) => {
        logFirestoreError(err, OperationType.LIST, 'meetup_locations');
      }
    );

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((d) => list.push(normalizeUserDoc(d.id, d.data())));
        setUsersList(list);
      },
      (err) => {
        logFirestoreError(err, OperationType.LIST, 'users');
        setErrorMsg(formatUserError(err, 'Không thể tải danh sách sinh viên.'));
      }
    );

    return () => {
      unsubItems();
      unsubCat();
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

  const handleModerate = async (item: ItemDoc, action: 'approve' | 'reject' | 'hide') => {
    if (!user) return;
    let reason = 'Đạt chuẩn học liệu trường học';
    if (action === 'reject') {
      const input = window.prompt(
        'Nhập lý do từ chối bài đăng để sinh viên chỉnh sửa:',
        'Nội dung/hình ảnh chưa rõ ràng'
      );
      if (input === null) return;
      reason = input;
    } else if (action === 'hide') {
      const input = window.prompt(
        'Nhập lý do ẩn bài đăng vi phạm:',
        'Bài đăng vi phạm nội quy trao đổi hoặc giá không phù hợp'
      );
      if (input === null) return;
      reason = input;
    }
    setErrorMsg('');
    setFeedbackMsg('');
    setBusyKey(`mod-${item.id}`);
    try {
      await moderateItemWithBatch(item.id, user.uid, action, reason);
      setFeedbackMsg(
        action === 'approve'
          ? `Đã duyệt bài "${item.title}".`
          : action === 'reject'
          ? `Đã từ chối bài "${item.title}".`
          : `Đã ẩn bài "${item.title}".`
      );
    } catch (err: unknown) {
      setErrorMsg(formatUserError(err, 'Không thể xử lý kiểm duyệt bài đăng.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleSeed = async () => {
    setErrorMsg('');
    setFeedbackMsg('');
    setSeeding(true);
    try {
      await seedDefaultMasterData();
      setFeedbackMsg('Đã đồng bộ Danh mục, Môn học & Điểm hẹn mẫu lên Firestore thành công!');
    } catch (err: unknown) {
      setErrorMsg(formatUserError(err, 'Không thể khởi tạo danh mục chuẩn.'));
    } finally {
      setSeeding(false);
    }
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = subCode.trim().toUpperCase();
    if (!code || !subName.trim()) return;
    setErrorMsg('');
    setFeedbackMsg('');
    setBusyKey('add-subject');
    try {
      await setDoc(doc(db, 'subjects', code), {
        subject_code: code,
        subject_name: subName.trim(),
        faculty: faculty.trim(),
        is_active: true,
      });
      setSubCode('');
      setSubName('');
      setFeedbackMsg(`Đã thêm học phần ${code}.`);
    } catch (err: unknown) {
      setErrorMsg(formatUserError(err, 'Không thể thêm môn học mới.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locName.trim()) return;
    const slug = toSlugVi(locName) || `loc-${Date.now()}`;
    setErrorMsg('');
    setFeedbackMsg('');
    setBusyKey('add-location');
    try {
      await setDoc(doc(db, 'meetup_locations', slug), {
        location_name: locName.trim(),
        campus: campus.trim(),
        landmark_description: landmark.trim(),
        is_active: true,
      });
      setLocName('');
      setLandmark('');
      setFeedbackMsg(`Đã thêm điểm hẹn "${locName.trim()}".`);
    } catch (err: unknown) {
      setErrorMsg(formatUserError(err, 'Không thể thêm điểm hẹn mới.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleCatalogActive = async (
    col: 'categories' | 'subjects' | 'meetup_locations',
    id: string,
    currentActive: boolean
  ) => {
    setErrorMsg('');
    setFeedbackMsg('');
    setBusyKey(`${col}-${id}`);
    try {
      await toggleCatalogActiveByAdmin(col, id, !currentActive);
      setFeedbackMsg(`Đã ${currentActive ? 'vô hiệu hóa' : 'kích hoạt lại'} mục ${id}.`);
    } catch (err: unknown) {
      setErrorMsg(formatUserError(err, 'Không thể cập nhật trạng thái danh mục.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleAdjustTrust = async (
    targetUser: UserProfile,
    delta: number,
    eventType: 'NO_SHOW' | 'ADMIN_ADJUST',
    description: string
  ) => {
    setErrorMsg('');
    setFeedbackMsg('');
    setBusyKey(`trust-${targetUser.uid}`);
    try {
      await adjustTrustScoreByAdmin(targetUser.uid, delta, eventType, description);
      setFeedbackMsg(
        `Đã cập nhật ${delta > 0 ? `+${delta}` : delta} điểm tín nhiệm cho ${targetUser.full_name}.`
      );
    } catch (err: unknown) {
      setErrorMsg(formatUserError(err, 'Không thể điều chỉnh điểm tín nhiệm.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleCustomTrustAdjust = async (targetUser: UserProfile) => {
    const rawDelta = window.prompt(
      `Nhập mức điểm điều chỉnh cho ${targetUser.full_name} (ví dụ: +15 hoặc -20):`,
      '10'
    );
    if (rawDelta === null) return;
    const parsed = parseInt(rawDelta.trim(), 10);
    if (isNaN(parsed) || parsed === 0 || Math.abs(parsed) > 200) {
      setErrorMsg('Mức điều chỉnh điểm phải là số nguyên khác 0 và nằm trong [-200, 200].');
      return;
    }
    const reason = window.prompt(
      'Nhập lý do giải quyết khiếu nại / điều chỉnh:',
      'Admin điều chỉnh điểm tín nhiệm theo kết quả xác minh'
    );
    if (reason === null || !reason.trim()) return;
    await handleAdjustTrust(targetUser, parsed, 'ADMIN_ADJUST', reason.trim());
  };

  const handleToggleUserStatus = async (targetUser: UserProfile) => {
    const nextStatus = targetUser.status === 'active' ? 'suspended' : 'active';
    const confirmMsg =
      nextStatus === 'suspended'
        ? `Tạm khóa tài khoản của ${targetUser.full_name}?`
        : `Mở khóa lại tài khoản cho ${targetUser.full_name}?`;
    if (!window.confirm(confirmMsg)) return;

    setErrorMsg('');
    setFeedbackMsg('');
    setBusyKey(`status-${targetUser.uid}`);
    try {
      await setUserAccountStatusByAdmin(targetUser.uid, nextStatus);
      setFeedbackMsg(
        `Đã chuyển trạng thái tài khoản ${targetUser.full_name} sang "${nextStatus}".`
      );
    } catch (err: unknown) {
      setErrorMsg(formatUserError(err, 'Không thể cập nhật trạng thái tài khoản.'));
    } finally {
      setBusyKey(null);
    }
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

      {/* Feedback / Errors */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-red-700 text-sm font-semibold">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
      {feedbackMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-emerald-800 text-sm font-semibold">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-600" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-200/60 rounded-2xl w-fit">
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
          Danh mục, Môn học &amp; Điểm hẹn ({categories.length + subjects.length + locations.length})
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
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                      {item.item_status}
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

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {(item.moderation_status !== 'approved' || item.item_status === 'hidden') &&
                    item.item_status !== 'completed' && (
                      <button
                        disabled={busyKey === `mod-${item.id}`}
                        onClick={() => handleModerate(item, 'approve')}
                        className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <CheckCircle2 size={15} /> Duyệt đăng
                      </button>
                    )}
                  {item.moderation_status !== 'rejected' && item.item_status !== 'completed' && (
                    <button
                      disabled={busyKey === `mod-${item.id}`}
                      onClick={() => handleModerate(item, 'reject')}
                      className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <XCircle size={15} /> Từ chối
                    </button>
                  )}
                  {item.moderation_status === 'approved' && item.item_status === 'available' && (
                    <button
                      disabled={busyKey === `mod-${item.id}`}
                      onClick={() => handleModerate(item, 'hide')}
                      className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <EyeOff size={15} /> Ẩn bài
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

      {/* TAB 2: MASTER DATA (CATEGORIES, SUBJECTS & MEETUP LOCATIONS) */}
      {subTab === 'catalog' && (
        <div className="space-y-8">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">
            <h3 className="font-black text-slate-900 flex items-center gap-2">
              <Layers size={18} /> Danh mục Vật phẩm (`categories`)
            </h3>
            {categories.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">{cat.category_name}</p>
                      <p className="text-[11px] text-slate-400 truncate">{cat.description}</p>
                    </div>
                    <button
                      disabled={busyKey === `categories-${cat.id}`}
                      onClick={() => handleToggleCatalogActive('categories', cat.id, cat.is_active)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[11px] font-black shrink-0',
                        cat.is_active
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      )}
                    >
                      {cat.is_active ? 'Đang bật' : 'Đã tắt'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 font-semibold">
                Nhấn &ldquo;Khởi tạo Danh mục Chuẩn&rdquo; ở góc trên phải để đồng bộ danh mục mẫu.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
              <h3 className="font-black text-slate-900 flex items-center gap-2">
                <BookOpen size={18} /> Danh mục Môn học (`subjects`)
              </h3>
              <form onSubmit={handleAddSubject} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  required
                  maxLength={50}
                  placeholder="Mã môn (INT1340)"
                  value={subCode}
                  onChange={(e) => setSubCode(e.target.value)}
                  className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase"
                />
                <input
                  required
                  maxLength={200}
                  placeholder="Tên học phần"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
                <button
                  disabled={busyKey === 'add-subject'}
                  type="submit"
                  className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Plus size={14} /> Thêm môn
                </button>
              </form>
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {subjects.map((s) => (
                  <div key={s.id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800">
                        {s.subject_code} — {s.subject_name}
                      </span>
                      <p className="text-xs text-slate-400 font-semibold">{s.faculty}</p>
                    </div>
                    <button
                      disabled={busyKey === `subjects-${s.id}`}
                      onClick={() => handleToggleCatalogActive('subjects', s.id, s.is_active)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[11px] font-black shrink-0',
                        s.is_active
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      )}
                    >
                      {s.is_active ? 'Đang bật' : 'Đã tắt'}
                    </button>
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
                  maxLength={200}
                  placeholder="Tên điểm hẹn"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
                <input
                  maxLength={500}
                  placeholder="Mô tả cột mốc"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                />
                <button
                  disabled={busyKey === 'add-location'}
                  type="submit"
                  className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Plus size={14} /> Thêm điểm
                </button>
              </form>
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {locations.map((l) => (
                  <div key={l.id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">{l.location_name}</p>
                      <p className="text-xs text-slate-400">{l.landmark_description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-emerald-600 font-bold">{l.campus}</span>
                      <button
                        disabled={busyKey === `meetup_locations-${l.id}`}
                        onClick={() => handleToggleCatalogActive('meetup_locations', l.id, l.is_active)}
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-[11px] font-black',
                          l.is_active
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        )}
                      >
                        {l.is_active ? 'Đang bật' : 'Đã tắt'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: USERS & TRUST SCORE MANAGEMENT */}
      {subTab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">Sinh viên</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">Điểm tín nhiệm</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">Trạng thái</th>
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
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[11px] font-black uppercase',
                        u.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-100 text-red-700'
                      )}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        disabled={busyKey === `trust-${u.uid}`}
                        onClick={() =>
                          handleAdjustTrust(
                            u,
                            -30,
                            'NO_SHOW',
                            'Admin xác nhận vi phạm không đến điểm hẹn (No-show: -30 điểm)'
                          )
                        }
                        className="px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <AlertTriangle size={13} /> Phạt No-show (-30đ)
                      </button>
                      <button
                        disabled={busyKey === `trust-${u.uid}`}
                        onClick={() => handleCustomTrustAdjust(u)}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Điều chỉnh điểm
                      </button>
                      <button
                        disabled={u.uid === user?.uid || busyKey === `status-${u.uid}`}
                        onClick={() => handleToggleUserStatus(u)}
                        className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 inline-flex items-center gap-1 disabled:opacity-40"
                      >
                        {u.status === 'active' ? (
                          <>
                            <Lock size={13} /> Khóa TK
                          </>
                        ) : (
                          <>
                            <Unlock size={13} /> Mở khóa TK
                          </>
                        )}
                      </button>
                    </div>
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
