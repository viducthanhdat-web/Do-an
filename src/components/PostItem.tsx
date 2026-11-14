import React, { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../lib/FirebaseProvider';
import { handleFirestoreError, OperationType } from '../lib/utils';
import {
  ConditionLevel,
  DEFAULT_SUBJECTS,
  ItemType,
  SubjectDoc,
} from '../types/schema';
import {
  X,
  Upload,
  Tag,
  Book,
  Package,
  FileText,
  Layers,
  ArrowLeft,
  Image as ImageIcon,
  Gift,
  Coins,
  CheckCircle2,
} from 'lucide-react';

export const PostItem: React.FC<{ onCancel: () => void; onSuccess: () => void }> = ({
  onCancel,
  onSuccess,
}) => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState<SubjectDoc[]>(DEFAULT_SUBJECTS);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    category_id: string;
    subject_id: string;
    custom_subject: string;
    condition_level: ConditionLevel;
    item_type: ItemType;
    price: number;
  }>({
    title: '',
    description: '',
    category_id: 'giao-trinh',
    subject_id: 'BAS1201',
    custom_subject: '',
    condition_level: 'used_good',
    item_type: 'gift',
    price: 0,
  });

  useEffect(() => {
    getDocs(collection(db, 'subjects'))
      .then((snap) => {
        if (!snap.empty) {
          const list: SubjectDoc[] = [];
          snap.forEach((d) => {
            const data = d.data() as Omit<SubjectDoc, 'id'>;
            if (data.is_active !== false) list.push({ id: d.id, ...data });
          });
          if (list.length > 0) setSubjects(list);
        }
      })
      .catch(() => {});
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    setLoading(true);
    try {
      let uploadedUrl = '';
      if (imageFile) {
        const storageRef = ref(storage, `items/${user.uid}_${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        uploadedUrl = await getDownloadURL(snapshot.ref);
      }

      const selectedSub = subjects.find((s) => s.subject_code === formData.subject_id || s.id === formData.subject_id);
      const subjectIdValue = formData.subject_id === 'OTHER' ? null : formData.subject_id;
      const subjectDisplay =
        formData.subject_id === 'OTHER'
          ? formData.custom_subject.trim() || 'Chung'
          : selectedSub
          ? `${selectedSub.subject_code} - ${selectedSub.subject_name}`
          : formData.subject_id;

      const finalPrice = formData.item_type === 'gift' ? 0 : Math.max(1000, formData.price);
      const isAdmin = profile.role === 'admin';
      const nowServer = serverTimestamp();

      await addDoc(collection(db, 'items'), {
        seller_id: user.uid,
        seller_summary: {
          full_name: profile.full_name || 'Sinh viên',
          trust_score: profile.current_trust_score ?? 100,
          avatar_url: profile.avatar_url || '',
        },
        category_id: formData.category_id,
        subject_id: subjectIdValue,
        subject_name: subjectDisplay,
        title: formData.title.trim(),
        description: formData.description.trim() || 'Sách/thiết bị còn sử dụng tốt.',
        item_type: formData.item_type,
        price: finalPrice,
        condition_level: formData.condition_level,
        image_urls: uploadedUrl ? [uploadedUrl] : [],
        primary_image: uploadedUrl,
        item_status: 'available',
        active_hold_id: null,
        moderation_status: isAdmin ? 'approved' : 'pending',
        reject_reason: null,
        created_at: nowServer,
        updated_at: nowServer,
      });

      onSuccess();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'items');
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { id: 'giao-trinh', label: 'Giáo trình', icon: Book },
    { id: 'thiet-bi', label: 'Thiết bị', icon: Package },
    { id: 'tai-lieu', label: 'Tài liệu ôn thi', icon: FileText },
    { id: 'khac', label: 'Khác', icon: Layers },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={onCancel}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-6 font-semibold transition-colors"
      >
        <ArrowLeft size={20} />
        Quay lại sàn trao đổi
      </button>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 lg:p-12 shadow-xl shadow-slate-200/50">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">Đăng tin chia sẻ học liệu</h2>
          <p className="text-slate-500 font-medium">
            Bài đăng sẽ được Ban quản trị kiểm duyệt nhanh (FR-03) trước khi hiển thị công khai trên sàn.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-7">
          {/* Image Upload */}
          <div className="space-y-2.5">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <ImageIcon size={16} />
              Hình ảnh thực tế của sách / thiết bị
            </label>
            <div className="flex items-center justify-center w-full">
              {imagePreview ? (
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-slate-200">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                    className="absolute top-4 right-4 p-2 bg-white/90 rounded-full text-slate-700 hover:text-red-600 shadow-sm"
                  >
                    <X size={20} />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full aspect-video border-2 border-slate-200 border-dashed rounded-2xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-all group">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 mb-3 text-slate-400 group-hover:scale-110 transition-transform" />
                    <p className="mb-1 text-sm text-slate-600">
                      <span className="font-bold">Nhấn để tải ảnh lên</span> (PNG, JPG, JPEG)
                    </p>
                    <p className="text-xs text-slate-400 font-semibold">Chụp rõ bìa sách hoặc tình trạng thiết bị</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                </label>
              )}
            </div>
          </div>

          {/* Title & Subject */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Tag size={16} />
                Tên giáo trình / thiết bị
              </label>
              <input
                required
                maxLength={100}
                type="text"
                placeholder="VD: Giáo trình Cơ sở dữ liệu + Bài tập"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-medium"
              />
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Layers size={16} />
                Học phần / Mã môn học
              </label>
              <select
                value={formData.subject_id}
                onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-semibold"
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.subject_code}>
                    {sub.subject_code} — {sub.subject_name}
                  </option>
                ))}
                <option value="OTHER">Môn học khác (tự nhập)...</option>
              </select>
              {formData.subject_id === 'OTHER' && (
                <input
                  required
                  type="text"
                  placeholder="Nhập mã hoặc tên môn học..."
                  value={formData.custom_subject}
                  onChange={(e) => setFormData({ ...formData, custom_subject: e.target.value })}
                  className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm"
                />
              )}
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2.5">
            <label className="text-sm font-bold text-slate-700">Danh mục phân loại</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {categories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, category_id: cat.id })}
                    className={`py-3.5 px-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 font-bold text-xs ${
                      formData.category_id === cat.id
                        ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                        : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                    }`}
                  >
                    <Icon size={20} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gift vs Sell & Condition */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <label className="text-sm font-bold text-slate-700">Tình trạng thực tế</label>
              <select
                value={formData.condition_level}
                onChange={(e) => setFormData({ ...formData, condition_level: e.target.value as ConditionLevel })}
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-semibold"
              >
                <option value="new_99">Mới 95–99% (Như mới, chưa viết vẽ)</option>
                <option value="used_good">Tốt 80–90% (Đủ trang, bìa đẹp)</option>
                <option value="used_acceptable">Khá 60–75% (Có ghi chú / highlight ôn thi)</option>
              </select>
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-bold text-slate-700">Hình thức chuyển nhượng</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, item_type: 'gift', price: 0 })}
                  className={`py-3.5 px-3 rounded-2xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                    formData.item_type === 'gift'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  <Gift size={16} /> Tặng 0 đồng
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, item_type: 'sell', price: formData.price > 0 ? formData.price : 20000 })
                  }
                  className={`py-3.5 px-3 rounded-2xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                    formData.item_type === 'sell'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  <Coins size={16} /> Giá tượng trưng
                </button>
              </div>
            </div>
          </div>

          {formData.item_type === 'sell' && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Mức giá tượng trưng (VND)</label>
              <div className="relative">
                <input
                  required
                  type="number"
                  min={1000}
                  step={1000}
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">VND</span>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <label className="text-sm font-bold text-slate-700">Mô tả chi tiết tình trạng</label>
            <textarea
              required
              maxLength={1000}
              rows={3}
              placeholder="VD: Sách xuất bản 2024, đã bọc nilon, có ghi chú công thức quan trọng ở chương 3..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-medium resize-none"
            />
          </div>

          <button
            disabled={loading}
            type="submit"
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-base hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 size={20} />
                Gửi đăng tin vật phẩm
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
