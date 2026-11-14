import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { BOOTSTRAP_ADMIN_EMAIL, normalizeUserDoc, UserProfile } from '../types/schema';
import { releaseExpiredHoldsIfAny } from './exchangeService';

interface SignUpPayload {
  email: string;
  password: string;
  fullName: string;
  studentIdCode: string;
  phoneNumber: string;
}

interface UpdateProfilePayload {
  full_name: string;
  student_id_code: string;
  phone_number: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (payload: SignUpPayload) => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  updateProfileInfo: (payload: UpdateProfilePayload) => Promise<void>;
  setupRecaptcha: (containerId: string) => void;
  signInWithPhone: (phoneNumber: string) => Promise<ConfirmationResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null);

  const pendingSignUpRef = useRef<Omit<SignUpPayload, 'password'> | null>(null);
  const initializingUidRef = useRef<string | null>(null);

  const initializeStudentProfile = async (firebaseUser: User) => {
    if (initializingUidRef.current === firebaseUser.uid) return;
    initializingUidRef.current = firebaseUser.uid;

    try {
      const pending = pendingSignUpRef.current;
      if (pending && pending.email.trim().toLowerCase() === (firebaseUser.email || '').toLowerCase()) {
        pendingSignUpRef.current = null;
      }

      const email = pending?.email.trim() || firebaseUser.email || '';
      const isDefaultAdmin = email === BOOTSTRAP_ADMIN_EMAIL;
      const autoStudentId =
        pending?.studentIdCode.trim().toUpperCase() ||
        email.split('@')[0]?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12) ||
        `SV${firebaseUser.uid.slice(0, 6).toUpperCase()}`;

      const nowServer = serverTimestamp();
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', firebaseUser.uid);
      const initLogRef = doc(collection(db, 'users', firebaseUser.uid, 'trust_history'));

      batch.set(userRef, {
        uid: firebaseUser.uid,
        student_id_code: autoStudentId,
        email,
        full_name: pending?.fullName.trim() || firebaseUser.displayName || 'Sinh viên mới',
        phone_number: pending?.phoneNumber.trim() || firebaseUser.phoneNumber || '',
        avatar_url: firebaseUser.photoURL || '',
        role: isDefaultAdmin ? 'admin' : 'student',
        current_trust_score: 100,
        status: 'active',
        hold_locked_until: null,
        created_at: nowServer,
        updated_at: nowServer,
      });

      batch.set(initLogRef, {
        score_change: 0,
        balance_after: 100,
        event_type: 'INIT',
        reference_id: null,
        description: 'Khởi tạo tài khoản sinh viên mới với 100 điểm tín nhiệm gốc',
        created_at: nowServer,
      });

      await batch.commit();
    } catch (err) {
      console.error('Error initializing student profile:', err);
      setLoading(false);
    } finally {
      if (initializingUidRef.current === firebaseUser.uid) {
        initializingUidRef.current = null;
      }
    }
  };

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      unsubProfile = onSnapshot(
        userRef,
        async (snap) => {
          if (snap.exists()) {
            setProfile(normalizeUserDoc(firebaseUser.uid, snap.data(), firebaseUser));
            setLoading(false);
          } else {
            await initializeStudentProfile(firebaseUser);
          }
        },
        (err) => {
          console.error('Error listening to user profile:', err);
          setLoading(false);
        }
      );

      // Quét dọn các phiên Hold quá hạn 24-48h (bổ trợ NFR-03)
      releaseExpiredHoldsIfAny().catch(() => {});
    });

    return () => {
      if (unsubProfile) unsubProfile();
      unsubscribeAuth();
    };
  }, []);

  const setupRecaptcha = (containerId: string) => {
    if (!recaptchaVerifier) {
      const verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
      setRecaptchaVerifier(verifier);
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signUpWithEmail = async ({
    email,
    password,
    fullName,
    studentIdCode,
    phoneNumber,
  }: SignUpPayload) => {
    pendingSignUpRef.current = { email, fullName, studentIdCode, phoneNumber };
    const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await initializeStudentProfile(res.user);
  };

  const signInWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const updateProfileInfo = async (payload: UpdateProfilePayload) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), {
      full_name: payload.full_name.trim(),
      student_id_code: payload.student_id_code.trim().toUpperCase(),
      phone_number: payload.phone_number.trim(),
      updated_at: serverTimestamp(),
    });
  };

  const signInWithPhone = async (phoneNumber: string) => {
    if (!recaptchaVerifier) throw new Error('Recaptcha not initialized');
    return await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithGoogle,
        signUpWithEmail,
        signInWithEmail,
        updateProfileInfo,
        setupRecaptcha,
        signInWithPhone,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a FirebaseProvider');
  }
  return context;
};
