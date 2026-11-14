import { useState } from 'react';
import { FirebaseProvider, useAuth } from './lib/FirebaseProvider';
import { Layout } from './components/Layout';
import { Marketplace } from './components/Marketplace';
import { PostItem } from './components/PostItem';
import { ItemDetail } from './components/ItemDetail';
import { MyHolds } from './components/MyHolds';
import { MyItems } from './components/MyItems';
import { AdminDashboard } from './components/AdminDashboard';
import { ItemDoc } from './types/schema';
import { AnimatePresence } from 'motion/react';

function AppContent() {
  const [activeTab, setActiveTab] = useState('marketplace');
  const [selectedItem, setSelectedItem] = useState<ItemDoc | null>(null);
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-slate-900 uppercase tracking-widest animate-pulse">
            Đang tải hệ thống UniExchange...
          </p>
        </div>
      </div>
    );
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      <AnimatePresence mode="wait">
        {activeTab === 'marketplace' && (
          <Marketplace key="marketplace" onSelectItem={setSelectedItem} />
        )}
        {activeTab === 'post' && (
          <PostItem
            key="post"
            onCancel={() => setActiveTab('marketplace')}
            onSuccess={() => setActiveTab('my-items')}
          />
        )}
        {activeTab === 'my-holds' && <MyHolds key="my-holds" />}
        {activeTab === 'my-items' && <MyItems key="my-items" />}
        {activeTab === 'admin' && <AdminDashboard key="admin" />}
      </AnimatePresence>

      <AnimatePresence>
        {selectedItem && (
          <ItemDetail
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onViewMyHolds={() => {
              setSelectedItem(null);
              setActiveTab('my-holds');
            }}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}

export default function App() {
  return (
    <FirebaseProvider>
      <AppContent />
    </FirebaseProvider>
  );
}
