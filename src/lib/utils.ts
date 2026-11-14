import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth } from './firebase';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Chuẩn hóa chuỗi tiếng Việt (bao gồm đ/Đ) thành URL/document slug an toàn.
 */
export function toSlugVi(input: string): string {
  return input
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Ghi log có cấu trúc cho lỗi Firestore mà không làm crash luồng UI/onSnapshot.
 */
export function logFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

/**
 * Ánh xạ mã lỗi Firebase Auth / Firestore / Storage sang thông báo tiếng Việt thân thiện.
 */
export function formatUserError(
  error: unknown,
  fallback: string = 'Đã xảy ra lỗi. Vui lòng thử lại.'
): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : '';

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Email hoặc mật khẩu không chính xác.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Email này đã được đăng ký tài khoản.';
  }
  if (code === 'auth/weak-password') {
    return 'Mật khẩu quá yếu (cần tối thiểu 6 ký tự).';
  }
  if (code === 'auth/invalid-email') {
    return 'Địa chỉ email không đúng định dạng.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Cửa sổ đăng nhập Google đã bị đóng trước khi hoàn tất.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Bạn thao tác quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.';
  }
  if (code === 'auth/invalid-phone-number') {
    return 'Số điện thoại không hợp lệ (ví dụ: +84901234567).';
  }
  if (code === 'auth/invalid-verification-code' || code === 'auth/code-expired') {
    return 'Mã OTP không đúng hoặc đã hết hạn.';
  }
  if (code === 'permission-denied' || msg.includes('Missing or insufficient permissions')) {
    return 'Bạn không có quyền thực hiện thao tác này hoặc dữ liệu không hợp lệ.';
  }
  if (code === 'storage/unauthorized') {
    return 'Không có quyền tải ảnh lên Storage (kiểm tra kích thước < 5MB và định dạng ảnh).';
  }
  if (code === 'unavailable') {
    return 'Mất kết nối tới máy chủ Firebase. Vui lòng kiểm tra mạng và thử lại.';
  }
  return msg || fallback;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = logFirestoreError(error, operationType, path);
  throw new Error(JSON.stringify(errInfo));
}
