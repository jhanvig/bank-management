import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import axios from 'axios';

const projectId = process.env.REACT_APP_FIRESTORE_PROJECT_ID;
const apiKey    = process.env.REACT_APP_FIRESTORE_API_KEY;
const API_URL   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toFirestoreValue = (value) => {
  if (typeof value === 'string')  return { stringValue: value };
  if (typeof value === 'number')  return { integerValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (value instanceof Date)      return { timestampValue: value.toISOString() };
  return { stringValue: String(value) };
};

const fromFirestoreValue = (fields) => {
  const result = {};
  Object.keys(fields).forEach((key) => {
    const f = fields[key];
    if      ('stringValue'    in f) result[key] = f.stringValue;
    else if ('integerValue'   in f) result[key] = parseInt(f.integerValue);
    else if ('booleanValue'   in f) result[key] = f.booleanValue;
    else if ('timestampValue' in f) result[key] = f.timestampValue;
  });
  return result;
};

// ─── Login ────────────────────────────────────────────────────────────────────

export const loginUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser   = userCredential.user;

    // Check admins collection first
    try {
      const adminRes = await axios.get(`${API_URL}/admins/${email}?key=${apiKey}`);
      if (adminRes.data.fields) {
        const user = {
          uid: firebaseUser.uid,
          email,
          role: 'admin',
          ...fromFirestoreValue(adminRes.data.fields),
        };
        localStorage.setItem('user', JSON.stringify(user));
        return { success: true, user };
      }
    } catch (_) { /* not an admin */ }

    // Check customers collection
    const customerRes = await axios.get(`${API_URL}/customers/${email}?key=${apiKey}`);
    if (customerRes.data.fields) {
      const user = {
        uid: firebaseUser.uid,
        email,
        role: 'customer',
        ...fromFirestoreValue(customerRes.data.fields),
      };
      localStorage.setItem('user', JSON.stringify(user));
      return { success: true, user };
    }

    return { success: false, error: 'User profile not found in database.' };
  } catch (error) {
    // Make Firebase errors friendlier
    const msg = _friendlyError(error.code);
    return { success: false, error: msg };
  }
};

// ─── Register customer ────────────────────────────────────────────────────────

export const registerCustomer = async (customerData) => {
  try {
    if (Number(customerData.accountBalance) < 1000) {
      return { success: false, error: 'Minimum opening balance is ₹1,000.' };
    }

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      customerData.email,
      customerData.password
    );
    const firebaseUser = userCredential.user;

    // Save customer doc (keyed by email for easy lookup)
    await axios.patch(
      `${API_URL}/customers/${customerData.email}?key=${apiKey}`,
      {
        fields: {
          uid:            toFirestoreValue(firebaseUser.uid),
          name:           toFirestoreValue(customerData.name),
          email:          toFirestoreValue(customerData.email),
          phone:          toFirestoreValue(customerData.phone || ''),
          panNumber:      toFirestoreValue(customerData.panNumber),
          role:           toFirestoreValue('customer'),
          status:         toFirestoreValue('PENDING'),
          kycStatus:      toFirestoreValue('NOT_SUBMITTED'),
          accountBalance: toFirestoreValue(Number(customerData.accountBalance)),
          transferLimit:  toFirestoreValue(10000),
          createdAt:      toFirestoreValue(new Date()),
          deleted:        toFirestoreValue(false),
        },
      }
    );

    // Save KYC doc
    await axios.post(
      `${API_URL}/kyc?key=${apiKey}`,
      {
        fields: {
          customerId:  toFirestoreValue(customerData.email),
          panNumber: toFirestoreValue(customerData.panNumber),
          status:      toFirestoreValue('PENDING'),
          submittedAt: toFirestoreValue(new Date()),
        },
      }
    );

    return { success: true };
  } catch (error) {
    return { success: false, error: _friendlyError(error.code) || error.message };
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logoutUser = async () => {
  try {
    await signOut(auth);
    localStorage.removeItem('user');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Get current user from localStorage ──────────────────────────────────────

export const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
};

// ─── Route guard helper ───────────────────────────────────────────────────────

export const requireRole = (navigate, requiredRole) => {
  const user = getCurrentUser();
  if (!user) { navigate('/login'); return false; }
  if (user.role !== requiredRole) { navigate('/login'); return false; }
  return true;
};

// ─── Internal ─────────────────────────────────────────────────────────────────

const _friendlyError = (code) => {
  const map = {
    'auth/user-not-found':       'No account found with this email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/invalid-email':        'Invalid email address.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/too-many-requests':    'Too many attempts. Please try again later.',
    'auth/invalid-credential':   'Invalid email or password.',
  };
  return map[code] || null;
};