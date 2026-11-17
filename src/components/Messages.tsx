import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/FirebaseProvider';
import { MessageCircle, Send, Search, CheckCircle, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ChatMessage {
  id: string;
  sender: 'me' | 'other';
  senderName: string;
  text: string;
  time: string;
}

interface Conversation {
  id: string;
  name: string;
  avatarChar: string;
  lastMessage: string;
  time: string;
  itemTitle: string;
  itemType: string;
  unread: number;
  trustScore: number;
  isOnline: boolean;
}

const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: 'bot',
    name: 'Ban Hỗ Trợ Sinh Viên',
    avatarChar: 'B',
    lastMessage: 'Chào bạn! Bạn có thể trao đổi trực tiếp với người b...',
    time: '12 phút',
    itemTitle: 'Hệ thống Trao đổi Giáo trình & Thiết bị',
    itemType: 'Miễn phí',
    unread: 0,
    trustScore: 100,
    isOnline: true,
  },
];

const SAMPLE_MESSAGES: Record<string, ChatMessage[]> = {
  bot: [
    {
      id: '1',
      sender: 'other',
      senderName: 'Ban Hỗ Trợ Sinh Viên',
      text: 'Chào mừng bạn đến với kênh nhắn tin trực tiếp UniExchange! 🎉✨',
      time: '21:17',
    },
    {
      id: '2',
      sender: 'other',
      senderName: 'Ban Hỗ Trợ Sinh Viên',
      text: 'Khi bạn xem bất kỳ giáo trình nào trên sàn, hãy nhấn "Nhắn tin cho người bán" để trao đổi chi tiết và hẹn điểm gặp trực tiếp an toàn trong trường học nhé.',
      time: '21:22',
    },
  ],
};

const QUICK_REPLIES = [
  'Chào bạn, sách này bạn còn giữ không?',
  'Mình muốn hẹn gặp ở Thư viện trung tâm được không?',
  'Sách có ghi chú hay highlight không?',
];

export const Messages: React.FC<{ onLoginRequest?: () => void }> = ({ onLoginRequest }) => {
  const { user, profile } = useAuth();
  const [selectedConvId, setSelectedConvId] = useState<string | null>('bot');
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(SAMPLE_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedConvId]);

  const selectedConv = SAMPLE_CONVERSATIONS.find((c) => c.id === selectedConvId);
  const currentMessages = selectedConvId ? (messages[selectedConvId] ?? []) : [];

  const handleSend = () => {
    if (!inputText.trim() || !selectedConvId) return;
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'me',
      senderName: profile?.full_name ?? 'Bạn',
      text: inputText.trim(),
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => ({
      ...prev,
      [selectedConvId]: [...(prev[selectedConvId] ?? []), newMsg],
    }));
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!user) {
    return (
      <motion.div
        key="messages-guest"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="flex-1 flex items-center justify-center p-6 bg-slate-50"
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
            <MessageCircle size={36} className="text-slate-500" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Nhắn tin trao đổi trực tiếp</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Đăng nhập để liên hệ trực tiếp với người đăng sách, hỏi rõ tình
              trạng tài liệu và chủ động hẹn gặp an toàn trong khuôn viên trường.
            </p>
          </div>

          <button
            onClick={onLoginRequest}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageCircle size={18} />
            Bắt đầu trò chuyện
          </button>

          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2 border border-slate-200">
            <p className="text-xs font-semibold text-slate-600 flex items-center gap-1">
              <CheckCircle size={13} className="text-emerald-600" />
              Lợi ích của kênh nhắn tin nội bộ:
            </p>
            {[
              'Trò chuyện tức thì không cần để lộ số điện thoại cá nhân.',
              'Tự động gắn kèm thông tin món đồ đang trao đổi.',
              'Gợi ý câu hỏi hữu ích và địa điểm hẹn an toàn.',
            ].map((item, i) => (
              <p key={i} className="text-xs text-slate-500">• {item}</p>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  const filteredConvs = SAMPLE_CONVERSATIONS.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <motion.div
      key="messages-auth"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="flex h-full overflow-hidden bg-white"
    >
      <div className="w-72 shrink-0 border-r border-slate-200 flex flex-col bg-white">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <MessageCircle size={16} />
              Tin nhắn
            </h2>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {filteredConvs.length} hội thoại
            </span>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm bạn học hoặc môn đồ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConvs.length === 0 ? (
            <p className="text-xs text-slate-400 text-center mt-8">Không tìm thấy hội thoại nào.</p>
          ) : (
            filteredConvs.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3 border-b border-slate-50 transition text-left',
                  selectedConvId === conv.id
                    ? 'bg-slate-100'
                    : 'hover:bg-slate-50'
                )}
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-sm">
                    {conv.avatarChar}
                  </div>
                  {conv.isOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-semibold text-slate-800 truncate">{conv.name}</span>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-1">{conv.time}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">
                    📚 {conv.itemTitle}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">{conv.lastMessage}</p>
                </div>

                {conv.unread > 0 && (
                  <span className="shrink-0 w-4 h-4 rounded-full bg-slate-800 text-white text-[9px] flex items-center justify-center">
                    {conv.unread}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-14 border-b border-slate-200 px-5 flex items-center justify-between shrink-0 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-sm">
                {selectedConv.avatarChar}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{selectedConv.name}</p>
                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  Sinh viên trường · Trực tuyến
                  <span className="ml-1 text-emerald-600 font-semibold">
                    · Tín nhiệm {selectedConv.trustScore}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <div>
                <p className="text-[10px] font-semibold text-slate-700 truncate max-w-[140px]">
                  {selectedConv.itemTitle}
                </p>
                <p className="text-[10px] text-emerald-600">{selectedConv.itemType}</p>
              </div>
              <ExternalLink size={12} className="text-slate-400 shrink-0" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-slate-50">
            <AnimatePresence>
              {currentMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex flex-col', msg.sender === 'me' ? 'items-end' : 'items-start')}
                >
                  <span className="text-[10px] text-slate-400 mb-1">
                    {msg.senderName} {msg.time}
                  </span>
                  <div
                    className={cn(
                      'max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                      msg.sender === 'me'
                        ? 'bg-slate-800 text-white rounded-br-sm'
                        : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm shadow-sm'
                    )}
                  >
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          <div className="px-5 py-2 flex gap-2 overflow-x-auto bg-white border-t border-slate-100">
            <span className="text-[10px] text-slate-400 shrink-0 self-center">Gợi ý:</span>
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply}
                onClick={() => setInputText(reply)}
                className="shrink-0 text-[10px] border border-slate-200 text-slate-600 rounded-full px-3 py-1 hover:bg-slate-100 transition cursor-pointer whitespace-nowrap"
              >
                {reply}
              </button>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-3 bg-white shrink-0">
            <input
              type="text"
              placeholder="Nhập tin nhắn... (Nhấn Enter để gửi)"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 text-sm border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-slate-300 bg-slate-50"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center transition shrink-0',
                inputText.trim()
                  ? 'bg-slate-800 text-white hover:bg-slate-700 cursor-pointer'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              )}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Chọn một hội thoại để bắt đầu nhắn tin
        </div>
      )}
    </motion.div>
  );
};
