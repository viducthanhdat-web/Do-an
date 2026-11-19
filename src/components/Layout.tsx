import React from 'react';
import { useAuth } from '../lib/FirebaseProvider';
import {
  Library,
  PlusCircle,
  History,
  LogOut,
  LayoutDashboard,
  ShieldCheck,
  Menu,
  Award,
  MessageCircle,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { LoginModal } from './LoginModal';
import { ProfileModal } from './ProfileModal';

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
      'flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-all duration-200',
      active
        ? 'bg-slate-900 text-white shadow-md'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    )}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

export const Layout: React.FC<{
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  loginOpen: boolean;
  onLoginOpenChange: (open: boolean) => void;
}> = ({ children, activeTab, setActiveTab, loginOpen, onLoginOpenChange }) => {
  const { user, profile, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const isLoginModalOpen = loginOpen;
  const setIsLoginModalOpen = onLoginOpenChange;
  const [isProfileModalOpen, setIsProfileModalOpen] = React.useState(false);
  const [logoutMessage, setLogoutMessage] = React.useState('');
  React.useEffect(() => {
    if (!logoutMessage) return;

    const timer = setTimeout(() => {
      setLogoutMessage('');
    }, 3000);

    return () => clearTimeout(timer);
  }, [logoutMessage]);
  const [loginSuccess, setLoginSuccess] = React.useState(false);

  React.useEffect(() => {
    if (!loginSuccess) return;

    const timer = setTimeout(() => {
      setLoginSuccess(false);
    }, 2500);

    return () => clearTimeout(timer);
  }, [loginSuccess]);

  const navigation = [
    { id: 'marketplace', label: 'Sàn trao đổi', icon: Library },
    { id: 'messages', label: 'Tin nhắn', icon: MessageCircle },
    { id: 'my-items', label: 'Đồ của tôi', icon: LayoutDashboard },
    { id: 'my-holds', label: 'Lịch hẹn & Giao dịch', icon: History },
  ];

  if (profile?.role === 'admin') {
    navigation.push({ id: 'admin', label: 'Quản trị & Duyệt bài', icon: ShieldCheck });
  }

  const trustScore = profile?.current_trust_score ?? 100;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <AnimatePresence>
        {logoutMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="fixed top-5 right-5 z-[100] flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-5 py-4 shadow-lg"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
              <ShieldCheck size={20} className="text-emerald-600" />
            </div>

            <div>
              <p className="text-sm font-bold text-slate-900">
                Đăng xuất thành công
              </p>
              <p className="text-xs text-slate-500">
                Bạn đã đăng xuất khỏi UniExchange.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

      <motion.aside
        className={cn(
          'fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 z-50 flex flex-col lg:relative lg:translate-x-0 transition-transform duration-300',
          !isSidebarOpen && '-translate-x-full'
        )}
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-slate-900 p-2 rounded-xl">
              <Library className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">UniExchange</h1>
              <p className="text-xs text-slate-500 font-medium">Thư viện & Sàn trao đổi mở</p>
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
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className="flex items-center gap-3 p-2.5 w-full text-left rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all"
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} className="w-10 h-10 rounded-full border border-slate-200" alt="Avatar" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">
                    {profile?.full_name?.[0] || 'S'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{profile?.full_name || 'Sinh viên'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">{profile?.student_id_code}</span>
                    <span className="text-slate-300">·</span>
                    <span
                      className={cn(
                        'text-xs font-extrabold flex items-center gap-0.5',
                        trustScore >= 80
                          ? 'text-emerald-600'
                          : trustScore >= 50
                          ? 'text-amber-600'
                          : 'text-red-600'
                      )}
                    >
                      <Award size={12} /> {trustScore}đ
                    </span>
                  </div>
                </div>
              </button>
              <button
                onClick={async () => {
                  try {
                    await logout();
                    setLogoutMessage('Đã đăng xuất thành công!');
                    setTimeout(() => setLogoutMessage(''), 3000);
                  } catch (error) {
                    console.error('Lỗi đăng xuất:', error);
                  }
                }}
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

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={() => setLoginSuccess(true)}
      />
      <AnimatePresence>
        {loginSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 25 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="login-success-title"
              className="w-full max-w-md rounded-3xl bg-white p-8 sm:p-10 text-center shadow-2xl"
            >
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2
                  size={46}
                  className="text-emerald-600"
                  strokeWidth={2.5}
                />
              </div>

              <h2
                id="login-success-title"
                className="text-2xl sm:text-3xl font-black text-slate-900"
              >
                Đăng nhập thành công!
              </h2>

              <p className="mt-3 text-base leading-relaxed text-slate-500">
                Chào mừng bạn quay trở lại với UniExchange.
              </p>

              <button
                type="button"
                onClick={() => setLoginSuccess(false)}
                className="mt-7 w-full rounded-xl bg-slate-900 px-6 py-3.5 font-bold text-white shadow-lg transition-all hover:bg-slate-800 active:scale-[0.98]"
              >
                Tiếp tục
              </button>

              <p className="mt-4 text-xs text-slate-400">
                Thông báo sẽ tự động đóng sau ít giây
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-600 lg:hidden hover:bg-slate-100 rounded-lg"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
              <span>UniExchange</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-900 font-semibold">
                {activeTab === 'post'
                  ? 'Đăng tin vật phẩm'
                  : navigation.find((n) => n.id === activeTab)?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user && activeTab !== 'post' && (
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

        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
};
