import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  ConditionLevel,
  ItemDoc,
  normalizeItemDoc,
  toDateSafe,
} from '../types/schema';
import {
  Search,
  BookOpen,
  Cpu,
  Clock,
  User as UserIcon,
  ChevronRight,
  Info,
  Gift,
  Award,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { motion } from 'motion/react';

export const Marketplace: React.FC<{ onSelectItem: (item: ItemDoc) => void }> = ({ onSelectItem }) => {
  const [items, setItems] = useState<ItemDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState<'all' | 'gift' | 'sell'>('all');
  const [conditionFilter, setConditionFilter] = useState<'all' | ConditionLevel>('all');

  useEffect(() => {
    const q = query(
      collection(db, 'items'),
      where('moderation_status', '==', 'approved'),
      where('item_status', '==', 'available')
    );

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
  }, []);

  const filteredItems = items.filter((item) => {
    const keyword = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !keyword ||
      item.title.toLowerCase().includes(keyword) ||
      (item.subject_id || '').toLowerCase().includes(keyword) ||
      (item.subject_name || '').toLowerCase().includes(keyword);

    const matchesCategory = categoryFilter === 'all' || item.category_id === categoryFilter;
    const matchesPrice =
      priceFilter === 'all' ||
      (priceFilter === 'gift' && (item.item_type === 'gift' || item.price === 0)) ||
      (priceFilter === 'sell' && item.price > 0);
    const matchesCondition = conditionFilter === 'all' || item.condition_level === conditionFilter;

    return matchesSearch && matchesCategory && matchesPrice && matchesCondition;
  });

  const categories = [
    { id: 'all', label: 'Tất cả' },
    { id: 'giao-trinh', label: 'Giáo trình' },
    { id: 'thiet-bi', label: 'Thiết bị' },
    { id: 'tai-lieu', label: 'Tài liệu' },
    { id: 'khac', label: 'Khác' },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl h-80 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Row 1: Search & Category Tabs */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <div className="relative w-full lg:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Tìm theo tên sách, mã môn học (VD: INT1313, Giải tích)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all shadow-sm text-sm font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 rounded-xl overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={cn(
                'px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap',
                categoryFilter === cat.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Free 0đ Filter & Condition Filter (FR-04) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 mr-1">Hình thức:</span>
          <button
            onClick={() => setPriceFilter('all')}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-bold transition-all',
              priceFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            Tất cả ({items.length})
          </button>
          <button
            onClick={() => setPriceFilter(priceFilter === 'gift' ? 'all' : 'gift')}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5',
              priceFilter === 'gift'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            )}
          >
            <Gift size={13} />
            Tặng miễn phí (0 đồng)
          </button>
          <button
            onClick={() => setPriceFilter(priceFilter === 'sell' ? 'all' : 'sell')}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-bold transition-all',
              priceFilter === 'sell' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            Giá tượng trưng
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400">Tình trạng:</span>
          <select
            value={conditionFilter}
            onChange={(e) => setConditionFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
          >
            <option value="all">Mọi tình trạng</option>
            <option value="new_99">Mới 95–99%</option>
            <option value="used_good">Tốt (80–90%)</option>
            <option value="used_acceptable">Khá (60–75%, có ghi chú)</option>
          </select>
        </div>
      </div>

      {/* Items Grid */}
      {filteredItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
          {filteredItems.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => onSelectItem(item)}
              className="cursor-pointer group bg-white border border-slate-200 rounded-3xl overflow-hidden hover:border-slate-900 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 flex flex-col"
            >
              <div className="h-48 bg-slate-100 relative overflow-hidden">
                {item.primary_image ? (
                  <img
                    src={item.primary_image}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                    {item.category_id === 'giao-trinh' ? <BookOpen size={48} /> : <Cpu size={48} />}
                    <span className="text-[11px] font-bold uppercase tracking-widest">
                      {CATEGORY_LABELS[item.category_id] || 'Học liệu'}
                    </span>
                  </div>
                )}

                <div className="absolute top-4 left-4 flex items-center gap-1.5">
                  <span className="px-3 py-1 bg-white/95 backdrop-blur-md rounded-full text-[11px] font-extrabold text-slate-800 shadow-sm">
                    {item.subject_name || item.subject_id || CATEGORY_LABELS[item.category_id]}
                  </span>
                </div>

                <div className="absolute bottom-4 right-4">
                  <div
                    className={cn(
                      'px-3.5 py-1 rounded-full text-xs font-black shadow-lg',
                      item.price === 0 ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
                    )}
                  >
                    {item.price === 0 ? 'Tặng 0đ' : `${item.price.toLocaleString('vi-VN')}đ`}
                  </div>
                </div>
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <h3 className="text-lg font-bold text-slate-900 line-clamp-1 mb-2">{item.title}</h3>

                <p className="text-sm text-slate-500 line-clamp-2 mb-4 font-medium min-h-[2.5rem]">
                  {item.description || 'Không có ghi chú thêm.'}
                </p>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="flex items-center gap-2 text-slate-600">
                    <div className="p-1.5 bg-slate-50 rounded-lg">
                      <Info size={14} />
                    </div>
                    <span className="text-xs font-semibold truncate">
                      {CONDITION_LABELS[item.condition_level] || item.condition_level}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <div className="p-1.5 bg-slate-50 rounded-lg">
                      <Clock size={14} />
                    </div>
                    <span className="text-xs font-semibold truncate">
                      {formatDistanceToNow(toDateSafe(item.created_at), { addSuffix: true, locale: vi })}
                    </span>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <UserIcon size={14} className="text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{item.seller_summary.full_name}</p>
                      <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                        <Award size={10} /> Uy tín: {item.seller_summary.trust_score}
                      </p>
                    </div>
                  </div>

                  <span className="flex items-center gap-1 text-slate-900 font-bold text-sm group-hover:translate-x-1 transition-transform shrink-0">
                    Giữ chỗ
                    <ChevronRight size={16} />
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-white border border-slate-200 border-dashed rounded-3xl">
          <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="text-slate-300" size={32} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Chưa có vật phẩm phù hợp</h3>
          <p className="text-slate-500 font-medium text-sm">
            Hãy thử bỏ bộ lọc hoặc đăng chia sẻ cuốn giáo trình đầu tiên cho môn học này!
          </p>
        </div>
      )}
    </div>
  );
};
