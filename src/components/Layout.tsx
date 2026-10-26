import React from 'react';
import { useAuth } from '../lib/FirebaseProvider';
import { 
  Library, 
  PlusCircle, 
  History, 
  Settings, 
  LogOut, 
  LayoutDashboard,
  ShieldCheck,
  Menu,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { LoginModal } from './LoginModal';

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}

const SidebarItem = ({ icon: Icon, label, active, onClick }: SidebarItemProps) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-all duration-200",
      active 
        ? "bg-slate-900 text-white shadow-md" 
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    )}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

export const Layout: React.FC<{ 
  children: React.ReactNode, 
  activeTab: string, 
  setActiveTab: (tab: string) => void 
}> = ({ children, activeTab, setActiveTab }) => {
  const { user, profile, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = React.useState(false);

  const navigation = [
    { id: 'marketplace', label: 'Sàn trao đổi', icon: Library },
    { id: 'my-items', label: 'Đồ của tôi', icon: LayoutDashboard },
    { id: 'my-holds', label: 'Lịch hẹn', icon: History },
  ];

  if (profile?.role === 'admin') {
    navigation.push({ id: 'admin', label: 'Quản trị', icon: ShieldCheck });
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        className={cn(
          "fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 z-50 flex flex-col lg:relative lg:translate-x-0 transition-transform duration-300",
          !isSidebarOpen && "-translate-x-full"
        )}
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-slate-900 p-2 rounded-xl">
              <Library className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">UniExchange</h1>
              <p className="text-xs text-slate-500 font-medium">Hệ thống thư viện mở</p>
            </div>
          </div>

          <nav className="space-y-2">
            {navigation.map((item) => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeTab === item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsSidebarOpen(false);
                }}
              />
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-slate-100">
          {user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-2">
                {profile?.photoURL ? (
                  <img src={profile.photoURL} className="w-10 h-10 rounded-full border border-slate-200" alt="Avatar" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
                    {profile?.displayName?.[0] || 'U'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{profile?.displayName}</p>
                  <p className="text-xs text-slate-500 font-medium">Tín nhiệm: {profile?.trustScore || 100}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut size={18} />
                Đăng xuất
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="w-full bg-slate-900 text-white py-3 rounded-xl font-semibold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
            >
              Đăng nhập
            </button>
          )}
        </div>
      </motion.aside>

      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-600 lg:hidden hover:bg-slate-100 rounded-lg"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
              <span>Hệ thống</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-900 font-semibold">{navigation.find(n => n.id === activeTab)?.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {activeTab === 'marketplace' && user && (
              <button
                onClick={() => setActiveTab('post')}
                className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-all shadow-md shadow-slate-100"
              >
                <PlusCircle size={18} />
                Đăng tin mới
              </button>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
