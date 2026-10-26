import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import { useAuth } from '../lib/FirebaseProvider';
import { 
  Search, 
  BookOpen, 
  Cpu, 
  Filter, 
  Clock, 
  User as UserIcon,
  ChevronRight,
  Info
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { motion } from 'motion/react';

interface Item {
  id: string;
  title: string;
  description: string;
  category: string;
  subject: string;
  condition: string;
  price: number;
  sellerId: string;
  sellerName: string;
  status: 'available' | 'held' | 'exchanged';
  imageUrl?: string;
  createdAt: string;
}

export const Marketplace: React.FC<{ onSelectItem: (item: Item) => void }> = ({ onSelectItem }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const { user } = useAuth();

  useEffect(() => {
    const q = query(
      collection(db, 'items'),
      where('status', '==', 'available'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsList: Item[] = [];
      snapshot.forEach((doc) => {
        itemsList.push({ id: doc.id, ...doc.data() } as Item);
      });
      setItems(itemsList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'items');
    });

    return () => unsubscribe();
  }, []);

  const filteredItems = items.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         item.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categories = ['All', 'Textbook', 'Equipment', 'Note', 'Other'];

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
    <div className="space-y-8">
      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Tìm theo tên sách, môn học..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2 p-1 bg-slate-200/50 rounded-xl w-full md:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "px-4 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap flex-1 md:flex-none",
                categoryFilter === cat 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {cat === 'All' ? 'Tất cả' : 
               cat === 'Textbook' ? 'Giáo trình' : 
               cat === 'Equipment' ? 'Thiết bị' : 
               cat === 'Note' ? 'Tài liệu' : 'Khác'}
            </button>
          ))}
        </div>
      </div>

      {/* Items Grid */}
      {filteredItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredItems.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="group bg-white border border-slate-200 rounded-3xl overflow-hidden hover:border-slate-900 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 flex flex-col"
            >
              {/* Image Placeholder or Actual Image */}
              <div className="h-48 bg-slate-100 relative overflow-hidden">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                    {item.category === 'Textbook' ? <BookOpen size={48} /> : <Cpu size={48} />}
                  </div>
                )}
                <div className="absolute top-4 left-4">
                  <span className="px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-wider text-slate-700 shadow-sm">
                    {item.subject}
                  </span>
                </div>
                <div className="absolute bottom-4 right-4">
                  <div className="bg-slate-900 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg">
                    {item.price === 0 ? 'Miễn phí' : `${item.price.toLocaleString()}đ`}
                  </div>
                </div>
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-slate-900 line-clamp-1">{item.title}</h3>
                </div>
                
                <p className="text-sm text-slate-500 line-clamp-2 mb-4 font-medium h-10">
                  {item.description || 'Không có mô tả.'}
                </p>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="flex items-center gap-2 text-slate-500">
                    <div className="p-1.5 bg-slate-50 rounded-lg">
                      <Info size={14} />
                    </div>
                    <span className="text-xs font-semibold">{item.condition} mới</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <div className="p-1.5 bg-slate-50 rounded-lg">
                      <Clock size={14} />
                    </div>
                    <span className="text-xs font-semibold">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: vi })}
                    </span>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                      <UserIcon size={14} className="text-slate-500" />
                    </div>
                    <span className="text-xs font-bold text-slate-700">{item.sellerName}</span>
                  </div>
                  
                  <button
                    onClick={() => onSelectItem(item)}
                    className="flex items-center gap-1 text-slate-900 font-bold text-sm hover:translate-x-1 transition-transform"
                  >
                    Chi tiết
                    <ChevronRight size={16} />
                  </button>
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
          <h3 className="text-xl font-bold text-slate-900 mb-2">Không tìm thấy món đồ nào</h3>
          <p className="text-slate-500 font-medium">Hãy thử thay đổi từ khóa tìm kiếm hoặc danh mục.</p>
        </div>
      )}
    </div>
  );
};
