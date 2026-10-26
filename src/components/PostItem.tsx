import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../lib/FirebaseProvider';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { 
  X, 
  Upload, 
  Tag, 
  Book, 
  Package, 
  FileText, 
  Layers,
  ArrowLeft,
  Image as ImageIcon
} from 'lucide-react';
import { motion } from 'motion/react';

export const PostItem: React.FC<{ onCancel: () => void, onSuccess: () => void }> = ({ onCancel, onSuccess }) => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Textbook',
    subject: '',
    condition: '80%',
    price: 0
  });

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
    if (!user) return;

    setLoading(true);
    try {
      let imageUrl = '';
      if (imageFile) {
        const storageRef = ref(storage, `items/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(snapshot.ref);
      }

      await addDoc(collection(db, 'items'), {
        ...formData,
        imageUrl,
        sellerId: user.uid,
        sellerName: profile?.displayName || 'Anonymous',
        status: 'available',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      onSuccess();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'items');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button 
        onClick={onCancel}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-8 font-semibold transition-colors"
      >
        <ArrowLeft size={20} />
        Quay lại sàn trao đổi
      </button>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 lg:p-12 shadow-xl shadow-slate-200/50">
        <div className="mb-10">
          <h2 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">Đăng tin trao đổi</h2>
          <p className="text-slate-500 font-medium text-lg">Chia sẻ tài liệu và thiết bị cũ cho cộng đồng sinh viên.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Image Upload Area */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <ImageIcon size={16} />
              Hình ảnh món đồ
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
                    className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-md rounded-full text-slate-600 hover:text-red-500 shadow-sm transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full aspect-video border-2 border-slate-200 border-dashed rounded-2xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-all group">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-12 h-12 mb-4 text-slate-400 group-hover:scale-110 transition-transform" />
                    <p className="mb-2 text-sm text-slate-500"><span className="font-bold">Nhấn để tải lên</span> hoặc kéo thả</p>
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-widest">PNG, JPG hoặc JPEG</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                </label>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Tag size={16} />
                Tên món đồ
              </label>
              <input
                required
                type="text"
                placeholder="VD: Giáo trình Giải tích 1"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium"
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Layers size={16} />
                Môn học
              </label>
              <input
                required
                type="text"
                placeholder="VD: Giải tích, Vật lý 1"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Book size={16} />
              Danh mục
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['Textbook', 'Equipment', 'Note', 'Other'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFormData({ ...formData, category: cat })}
                  className={`py-4 px-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 font-bold text-xs ${
                    formData.category === cat 
                      ? 'border-slate-900 bg-slate-900 text-white shadow-lg' 
                      : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                  }`}
                >
                  {cat === 'Textbook' && <Book size={20} />}
                  {cat === 'Equipment' && <Package size={20} />}
                  {cat === 'Note' && <FileText size={20} />}
                  {cat === 'Other' && <Layers size={20} />}
                  {cat === 'Textbook' ? 'Giáo trình' : 
                   cat === 'Equipment' ? 'Thiết bị' : 
                   cat === 'Note' ? 'Tài liệu' : 'Khác'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-700">Tình trạng (Mới %)</label>
              <select
                value={formData.condition}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none transition-all font-semibold"
              >
                <option value="100%">100% (Như mới)</option>
                <option value="95%">95%</option>
                <option value="90%">90%</option>
                <option value="80%">80%</option>
                <option value="70%">70%</option>
                <option value="60%">60%</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-700">Giá (VND) - Để 0 nếu miễn phí</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none transition-all font-bold"
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 font-bold text-slate-400">VND</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700">Mô tả chi tiết</label>
            <textarea
              rows={4}
              placeholder="Ghi chú về tình trạng, nội dung sách, hoặc các lưu ý khác..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium resize-none"
            />
          </div>

          <div className="pt-6">
            <button
              disabled={loading}
              type="submit"
              className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Đăng tin ngay'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
