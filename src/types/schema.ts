export type UserRole = 'student' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned';

export interface UserProfile {
  uid: string;
  student_id_code: string;
  email: string;
  full_name: string;
  phone_number: string;
  avatar_url: string;
  role: UserRole;
  current_trust_score: number;
  status: UserStatus;
  hold_locked_until: any | null;
  created_at: any;
  updated_at: any;
}

export type TrustEventType =
  | 'INIT'
  | 'COMPLETE_TX'
  | 'CANCEL_HOLD'
  | 'EXPIRED_HOLD'
  | 'NO_SHOW'
  | 'ADMIN_ADJUST';

export interface TrustHistoryEntry {
  id: string;
  score_change: number;
  balance_after: number;
  event_type: TrustEventType;
  reference_id: string | null;
  description: string;
  created_at: any;
}

export interface CategoryDoc {
  id: string;
  category_name: string;
  description: string;
  display_order: number;
  is_active: boolean;
}

export interface SubjectDoc {
  id: string;
  subject_code: string;
  subject_name: string;
  faculty: string;
  is_active: boolean;
}

export interface MeetupLocationDoc {
  id: string;
  location_name: string;
  campus: string;
  landmark_description: string;
  is_active: boolean;
}

export type ItemType = 'gift' | 'sell';
export type ConditionLevel = 'new_99' | 'used_good' | 'used_acceptable';
export type ItemStatus = 'available' | 'held' | 'completed' | 'hidden';
export type ModerationStatus = 'pending' | 'approved' | 'rejected';

export interface SellerSummary {
  full_name: string;
  trust_score: number;
  avatar_url: string;
}

export interface ItemDoc {
  id: string;
  seller_id: string;
  seller_summary: SellerSummary;
  category_id: string;
  subject_id: string | null;
  subject_name?: string;
  title: string;
  description: string;
  item_type: ItemType;
  price: number;
  condition_level: ConditionLevel;
  image_urls: string[];
  primary_image: string;
  item_status: ItemStatus;
  active_hold_id: string | null;
  moderation_status: ModerationStatus;
  reject_reason?: string | null;
  created_at: any;
  updated_at: any;
}

export interface ModerationLogDoc {
  id: string;
  admin_id: string;
  action: 'approve' | 'reject' | 'hide';
  reason: string;
  created_at: any;
}

export type HoldStatus = 'active' | 'expired' | 'cancelled' | 'converted';

export interface HoldDoc {
  id: string;
  item_id: string;
  item_title: string;
  primary_image?: string;
  seller_id: string;
  seller_summary?: {
    full_name: string;
    phone_number: string;
  };
  requester_id: string;
  requester_summary?: {
    full_name: string;
    phone_number: string;
  };
  meetup_summary?: {
    location_id: string;
    location_name: string;
    proposed_time: any;
    note: string;
  };
  hold_start_time: any;
  hold_expires_at: any;
  hold_status: HoldStatus;
  cancel_reason: string | null;
  created_at: any;
  updated_at: any;
}

export interface MeetupDoc {
  id: string;
  hold_id: string;
  item_id: string;
  seller_id: string;
  buyer_id: string;
  location_id: string;
  location_name: string;
  proposed_time: any;
  status: 'proposed' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed';
  note: string;
  created_at: any;
  updated_at: any;
}

export interface TransactionDoc {
  id: string;
  item_id: string;
  item_title: string;
  hold_id: string | null;
  seller_id: string;
  buyer_id: string;
  final_amount: number;
  payment_method: 'cash' | 'bank_transfer' | 'free';
  current_status: 'pending' | 'completed' | 'disputed' | 'cancelled';
  completed_at: any | null;
  created_at: any;
  updated_at: any;
}

export const DEFAULT_CATEGORIES: CategoryDoc[] = [
  { id: 'giao-trinh', category_name: 'Giáo trình', description: 'Giáo trình đại cương & chuyên ngành', display_order: 1, is_active: true },
  { id: 'thiet-bi', category_name: 'Thiết bị', description: 'Máy tính bỏ túi, linh kiện, dụng cụ học tập', display_order: 2, is_active: true },
  { id: 'tai-lieu', category_name: 'Tài liệu ôn thi', description: 'Sổ tay ghi chép, đề cương, tài liệu tham khảo', display_order: 3, is_active: true },
  { id: 'khac', category_name: 'Khác', description: 'Vật phẩm học tập khác trong trường', display_order: 4, is_active: true },
];

export const DEFAULT_SUBJECTS: SubjectDoc[] = [
  { id: 'BAS1201', subject_code: 'BAS1201', subject_name: 'Giải tích 1', faculty: 'Khoa Cơ bản', is_active: true },
  { id: 'BAS1203', subject_code: 'BAS1203', subject_name: 'Đại số tuyến tính', faculty: 'Khoa Cơ bản', is_active: true },
  { id: 'BAS1224', subject_code: 'BAS1224', subject_name: 'Vật lý 1 & Thí nghiệm', faculty: 'Khoa Cơ bản', is_active: true },
  { id: 'INT1340', subject_code: 'INT1340', subject_name: 'Nhập môn Công nghệ phần mềm', faculty: 'Công nghệ thông tin', is_active: true },
  { id: 'INT1313', subject_code: 'INT1313', subject_name: 'Cơ sở dữ liệu', faculty: 'Công nghệ thông tin', is_active: true },
  { id: 'INT1306', subject_code: 'INT1306', subject_name: 'Cấu trúc dữ liệu & Giải thuật', faculty: 'Công nghệ thông tin', is_active: true },
];

export const DEFAULT_MEETUP_LOCATIONS: MeetupLocationDoc[] = [
  { id: 'thu-vien-tang-2', location_name: 'Bàn tròn Thư viện Tầng 2', campus: 'Khuôn viên chính', landmark_description: 'Khu tự học nhóm cạnh quầy thủ thư', is_active: true },
  { id: 'sanh-nha-a', location_name: 'Sảnh Giảng đường Nhà A', campus: 'Khuôn viên chính', landmark_description: 'Ghế đá sảnh chính có camera an ninh', is_active: true },
  { id: 'nha-van-hoa-sv', location_name: 'Nhà Văn hóa Sinh viên', campus: 'Khuôn viên chính', landmark_description: 'Khu bàn sinh hoạt CLB tầng 1', is_active: true },
  { id: 'can-tin-trung-tam', location_name: 'Căn tin Trung tâm', campus: 'Khuôn viên chính', landmark_description: 'Dãy bàn gần cửa ra vào chính', is_active: true },
];

export const CONDITION_LABELS: Record<ConditionLevel, string> = {
  new_99: 'Mới 95–99%',
  used_good: 'Tốt (80–90%)',
  used_acceptable: 'Khá (60–75%, có ghi chú)',
};

export const BOOTSTRAP_ADMIN_EMAIL = 'viducthanhdat3@gmail.com';

export const CATEGORY_LABELS: Record<string, string> = {
  'giao-trinh': 'Giáo trình',
  'thiet-bi': 'Thiết bị',
  'tai-lieu': 'Tài liệu',
  'khac': 'Khác',
  Textbook: 'Giáo trình',
  Equipment: 'Thiết bị',
  Note: 'Tài liệu',
  Other: 'Khác',
};

/**
 * Chuẩn hóa đọc dữ liệu User hỗ trợ tương thích ngược và đồng nhất giữa AuthContext & AdminDashboard
 */
export function normalizeUserDoc(
  uid: string,
  raw: any,
  fallback?: { email?: string | null; displayName?: string | null; phoneNumber?: string | null; photoURL?: string | null }
): UserProfile {
  const email = raw?.email ?? fallback?.email ?? '';
  const isDefaultAdmin = email === BOOTSTRAP_ADMIN_EMAIL;
  return {
    uid,
    student_id_code:
      raw?.student_id_code ||
      email?.split('@')[0]?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12) ||
      'SV00000',
    email,
    full_name: raw?.full_name || raw?.displayName || fallback?.displayName || 'Sinh viên',
    phone_number: raw?.phone_number ?? raw?.phoneNumber ?? fallback?.phoneNumber ?? '',
    avatar_url: raw?.avatar_url ?? raw?.photoURL ?? fallback?.photoURL ?? '',
    role: raw?.role === 'admin' || isDefaultAdmin ? 'admin' : 'student',
    current_trust_score:
      typeof raw?.current_trust_score === 'number'
        ? raw.current_trust_score
        : typeof raw?.trustScore === 'number'
        ? raw.trustScore
        : 100,
    status: raw?.status || 'active',
    hold_locked_until: raw?.hold_locked_until ?? null,
    created_at: raw?.created_at || raw?.createdAt || null,
    updated_at: raw?.updated_at || raw?.updatedAt || null,
  };
}

/**
 * Chuẩn hóa đọc dữ liệu Hold hỗ trợ tương thích ngược
 */
export function normalizeHoldDoc(id: string, raw: any): HoldDoc {
  return {
    id,
    item_id: raw.item_id || raw.itemId || '',
    item_title: raw.item_title || raw.itemTitle || 'Vật phẩm học tập',
    primary_image: raw.primary_image || '',
    seller_id: raw.seller_id || raw.sellerId || '',
    seller_summary: raw.seller_summary || {
      full_name: raw.sellerName || 'Người đăng',
      phone_number: '',
    },
    requester_id: raw.requester_id || raw.requesterId || '',
    requester_summary: raw.requester_summary || {
      full_name: raw.requesterName || 'Người nhận',
      phone_number: '',
    },
    meetup_summary: raw.meetup_summary || {
      location_id: '',
      location_name: raw.meetupPoint || 'Thư viện',
      proposed_time: raw.created_at || raw.createdAt,
      note: '',
    },
    hold_start_time: raw.hold_start_time || raw.created_at || raw.createdAt,
    hold_expires_at: raw.hold_expires_at || raw.expiresAt,
    hold_status: raw.hold_status || (raw.status === 'completed' ? 'converted' : raw.status) || 'active',
    cancel_reason: raw.cancel_reason ?? null,
    created_at: raw.created_at || raw.createdAt,
    updated_at: raw.updated_at || raw.created_at,
  };
}

/**
 * Chuẩn hóa đọc dữ liệu Item hỗ trợ tương thích ngược nếu có bản ghi cũ trên Firestore
 */
export function normalizeItemDoc(id: string, raw: any): ItemDoc {
  const legacyCatMap: Record<string, string> = {
    Textbook: 'giao-trinh',
    Equipment: 'thiet-bi',
    Note: 'tai-lieu',
    Other: 'khac',
  };
  const categoryId = raw.category_id || legacyCatMap[raw.category] || 'khac';
  const price = typeof raw.price === 'number' ? raw.price : 0;
  const primaryImage = raw.primary_image ?? raw.imageUrl ?? (Array.isArray(raw.image_urls) ? raw.image_urls[0] : '') ?? '';
  const legacyStatusMap: Record<string, ItemStatus> = {
    available: 'available',
    held: 'held',
    exchanged: 'completed',
    completed: 'completed',
    hidden: 'hidden',
  };

  return {
    id,
    seller_id: raw.seller_id || raw.sellerId || '',
    seller_summary: raw.seller_summary || {
      full_name: raw.sellerName || 'Sinh viên',
      trust_score: 100,
      avatar_url: '',
    },
    category_id: categoryId,
    subject_id: raw.subject_id ?? raw.subject ?? null,
    subject_name: raw.subject_name || raw.subject || raw.subject_id || 'Chưa phân môn',
    title: raw.title || '',
    description: raw.description || '',
    item_type: raw.item_type || (price === 0 ? 'gift' : 'sell'),
    price,
    condition_level: raw.condition_level || 'used_good',
    image_urls: Array.isArray(raw.image_urls) ? raw.image_urls : primaryImage ? [primaryImage] : [],
    primary_image: primaryImage,
    item_status: legacyStatusMap[raw.item_status || raw.status] || 'available',
    active_hold_id: raw.active_hold_id ?? null,
    moderation_status: raw.moderation_status || 'approved',
    reject_reason: raw.reject_reason ?? null,
    created_at: raw.created_at || raw.createdAt || null,
    updated_at: raw.updated_at || raw.updatedAt || null,
  };
}

export function toDateSafe(ts: any): Date {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  const parsed = new Date(ts);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}
