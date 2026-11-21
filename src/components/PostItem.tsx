import React, { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../lib/FirebaseProvider';
import { formatUserError, logFirestoreError, OperationType } from '../lib/utils';
import {
  ConditionLevel,
  DEFAULT_SUBJECTS,
  ItemDoc,
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
  AlertCircle,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 10;

type ImageEntry = {
  id: string;
  url: string;
  file?: File;
};

export const PostItem: React.FC<{
  onCancel: () => void;
  onSuccess: () => void;
  editingItem?: ItemDoc | null;
}> = ({ onCancel, onSuccess, editingItem }) => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [priceInput, setPriceInput] = useState(editingItem?.price ? String(editingItem.price) : '');
  const [errorMsg, setErrorMsg] = useState('');
  const [subjects, setSubjects] = useState<SubjectDoc[]>(DEFAULT_SUBJECTS);
  const [images, setImages] = useState<ImageEntry[]>(() => {
    const oldImages =
      editingItem?.image_urls?.length
        ? editingItem.image_urls
        : editingItem?.primary_image
          ? [editingItem.primary_image]
          : [];

    return oldImages.map((url, index) => ({
      id: `old-${index}`,
      url,
    }));
  });

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
    title: editingItem?.title || '',
    description: editingItem?.description || '',
    category_id: editingItem?.category_id || 'giao-trinh',
    subject_id: editingItem ? editingItem.subject_id || 'OTHER' : 'BAS1201',
    custom_subject: editingItem && !editingItem.subject_id ? editingItem.subject_name || '' : '',
    condition_level: editingItem?.condition_level || 'used_good',
    item_type: editingItem?.item_type || 'gift',
    price: editingItem?.price ?? 0,
  });

  useEffect(() => {
    setErrorMsg('');
    const oldImages =
      editingItem?.image_urls?.length
        ? editingItem.image_urls
        : editingItem?.primary_image
          ? [editingItem.primary_image]
          : [];

    setImages(
      oldImages.map((url, index) => ({
        id: `old-${index}`,
        url,
      }))
    );

    setPriceInput(editingItem?.price ? String(editingItem.price) : '');

    setFormData({
      title: editingItem?.title || '',
      description: editingItem?.description || '',
      category_id: editingItem?.category_id || 'giao-trinh',
      subject_id: editingItem ? editingItem.subject_id || 'OTHER' : 'BAS1201',
      custom_subject: editingItem && !editingItem.subject_id ? editingItem.subject_name || '' : '',
      condition_level: editingItem?.condition_level || 'used_good',
      item_type: editingItem?.item_type || 'gift',
      price: editingItem?.price ?? 0,
    });
  }, [editingItem]);

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

  const isSuspended = Boolean(profile && profile.status !== 'active');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg('');

    const selectedFiles = Array.from(e.target.files || []);

    if (images.length + selectedFiles.length > MAX_IMAGES) {
      setErrorMsg(`Bạn chỉ được đăng tối đa ${MAX_IMAGES} ảnh.`);
      e.target.value = '';
      return;
    }

    const validFiles: File[] = [];

    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/')) {
        setErrorMsg('Vui lòng chỉ chọn tệp hình ảnh.');
        continue;
      }

      if (file.size >= MAX_IMAGE_SIZE_BYTES) {
        setErrorMsg('Mỗi ảnh phải có kích thước nhỏ hơn 5MB.');
        continue;
      }

      validFiles.push(file);
    }

    const newImages: ImageEntry[] = validFiles.map((file, index) => ({
      id: `new-${Date.now()}-${index}`,
      url: URL.createObjectURL(file),
      file,
    }));

    setImages((prev) => [...prev, ...newImages]);

    e.target.value = '';
  };
  const handleRemoveImage = (id: string) => {
    setImages((prev) => {
      const imageToRemove = prev.find((image) => image.id === id);

      if (imageToRemove?.file) {
        URL.revokeObjectURL(imageToRemove.url);
      }

      return prev.filter((image) => image.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (profile.status !== 'active') {
      setErrorMsg('Tài khoản của bạn đang bị tạm khóa quyền đăng tin (FR-02).');
      return;
    }
    if (editingItem && (editingItem.item_status === 'held' || editingItem.item_status === 'completed')) {
      setErrorMsg('Không thể chỉnh sửa vật phẩm đang được giữ chỗ hoặc đã trao đổi xong.');
      return;
    }

    setErrorMsg('');
    setLoading(true);
    try {
      const nextImageUrls: string[] = [];

      for (const image of images) {
        if (image.file) {
          const storageRef = ref(
            storage,
            `items/${user.uid}_${Date.now()}_${image.file.name}`
          );

          const snapshot = await uploadBytes(storageRef, image.file);
          const uploadedUrl = await getDownloadURL(snapshot.ref);

          nextImageUrls.push(uploadedUrl);
        } else {
          nextImageUrls.push(image.url);
        }
      }

      const nextPrimaryImage = nextImageUrls[0] || '';

      const selectedSub = subjects.find(
        (s) => s.subject_code === formData.subject_id || s.id === formData.subject_id
      );
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

      const itemPayload = {
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
        image_urls: nextImageUrls,
        primary_image: nextPrimaryImage,
        item_status: 'available' as const,
        moderation_status: (isAdmin ? 'approved' : 'pending') as 'approved' | 'pending',
        reject_reason: null,
        updated_at: nowServer,
      };

      if (editingItem) {
        await updateDoc(doc(db, 'items', editingItem.id), itemPayload);
      } else {
        await addDoc(collection(db, 'items'), {
          ...itemPayload,
          seller_id: user.uid,
          active_hold_id: null,
          created_at: nowServer,
        });
      }

      onSuccess();
    } catch (error) {
      logFirestoreError(
        error,
        editingItem ? OperationType.UPDATE : OperationType.CREATE,
        editingItem ? `items/${editingItem.id}` : 'items'
      );
      setErrorMsg(formatUserError(error, 'Không thể lưu bài đăng. Vui lòng thử lại.'));
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
          <h2 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">
            {editingItem ? 'Chỉnh sửa bài đăng vật phẩm' : 'Đăng tin chia sẻ học liệu'}
          </h2>
          <p className="text-slate-500 font-medium">
            {editingItem
              ? 'Sau khi lưu chỉnh sửa, bài đăng sẽ được chuyển lại hàng chờ Admin duyệt (FR-03.2).'
              : 'Bài đăng sẽ được Ban quản trị kiểm duyệt nhanh (FR-03) trước khi hiển thị công khai trên sàn.'}
          </p>
        </div>

        {editingItem?.moderation_status === 'rejected' && editingItem.reject_reason && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-amber-900 text-sm font-semibold">
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-bold">Lý do bị từ chối trước đó:</p>
              <p>{editingItem.reject_reason}</p>
            </div>
          </div>
        )}

        {isSuspended && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-red-700 text-sm font-semibold">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>Tài khoản của bạn đang bị tạm đình chỉ ({profile?.status}), không thể đăng hoặc sửa tin mới.</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-red-700 text-sm font-semibold">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-7">
          {/* Image Upload */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <ImageIcon size={16} />
              Hình ảnh thực tế của sách / thiết bị
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {images.map((image, index) => (
                <div
                  key={image.id}
                  className="relative aspect-square rounded-2xl overflow-hidden border border-slate-200"
                >
                  <img
                    src={image.url}
                    alt={`Ảnh vật phẩm ${index + 1}`}
                    className="w-full h-full object-cover"
                  />

                  {index === 0 && (
                    <span className="absolute bottom-2 left-2 px-2 py-1 bg-slate-900/80 text-white text-xs rounded-lg">
                      Ảnh đại diện
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveImage(image.id)}
                    className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full text-slate-700 hover:text-red-600 shadow"
                    aria-label="Xóa ảnh"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}

              {images.length < MAX_IMAGES && (
                <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <Upload size={28} className="text-slate-400 mb-2" />

                  <span className="text-sm font-bold text-slate-600">
                    Thêm ảnh
                  </span>

                  <span className="text-xs text-slate-400 mt-1">
                    {images.length}/{MAX_IMAGES}
                  </span>

                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                  />
                </label>
              )}
            </div>

            <p className="text-xs text-slate-400">
              Có thể thêm tối đa 10 ảnh, mỗi ảnh nhỏ hơn 5MB.
              Ảnh đầu tiên sẽ được sử dụng làm ảnh đại diện.
            </p>
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
                <option value="new_99">Mới 95–99%</option>
                <option value="used_good">Tốt 80–90%</option>
                <option value="used_acceptable">Khá 60–75%</option>
              </select>
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-bold text-slate-700">Hình thức chuyển nhượng</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, item_type: 'gift', price: 0 });
                    setPriceInput('');
                  }}
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
                  onClick={() => {
                    const nextPrice = formData.price > 0 ? formData.price : 20000;
                    setFormData({ ...formData, item_type: 'sell', price: nextPrice });
                    setPriceInput(String(nextPrice));
                  }}
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
            <div className="space-y-2.5">
              <label className="text-sm font-bold text-slate-700">
                Mức giá tượng trưng (VND)
              </label>

              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    aria-label="Tăng giá 10.000 đồng"
                    onClick={() => {
                      const nextPrice = (Number(priceInput) || 0) + 10000;
                      setPriceInput(String(nextPrice));
                      setFormData({ ...formData, price: nextPrice });
                    }}
                    className="w-11 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    <ChevronUp size={18} />
                  </button>

                  <button
                    type="button"
                    aria-label="Giảm giá 10.000 đồng"
                    onClick={() => {
                      const currentPrice = Number(priceInput) || 0;
                      const nextPrice = Math.max(1000, currentPrice - 10000);
                      setPriceInput(String(nextPrice));
                      setFormData({ ...formData, price: nextPrice });
                    }}
                    className="w-11 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    <ChevronDown size={18} />
                  </button>
                </div>

                <div className="flex-1 relative">
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    placeholder="Ví dụ: 50.000"
                    value={priceInput}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      const normalized = digits.replace(/^0+(?=\d)/, '');

                      setPriceInput(normalized);
                      setFormData({
                        ...formData,
                        price: normalized === '' ? 0 : Number(normalized),
                      });
                    }}
                    className="w-full px-4 py-3.5 pr-16 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none font-bold text-slate-900 placeholder:font-medium placeholder:text-slate-400"
                  />

                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400 pointer-events-none">
                    VND
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-400 font-medium">
                Nhập số tiền mong muốn hoặc sử dụng mũi tên để tăng, giảm mỗi lần 10.000 đồng.
              </p>
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
            disabled={loading || isSuspended}
            type="submit"
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-base hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 size={20} />
                {editingItem ? 'Lưu thay đổi & gửi duyệt lại' : 'Gửi đăng tin vật phẩm'}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
