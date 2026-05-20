// accountService.js
// Manages customer accounts with real account numbers.
// Account numbers are generated on approval and stored in the 'accounts' collection.

import axios from 'axios';
import { doc, collection, setDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { privateDb } from '../firebase';
import { registerAccountOnHub } from './hubService';

const projectId = process.env.REACT_APP_FIRESTORE_PROJECT_ID;
const apiKey    = process.env.REACT_APP_FIRESTORE_API_KEY;
const API_URL   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// FIX: was mapping ALL numbers to integerValue, which truncates decimals.
// Rupee-denominated values (e.g. accountBalance = 1234.56) must use doubleValue.
const toFirestoreValue = (value) => {
  if (typeof value === 'string')  return { stringValue: value };
  if (typeof value === 'number')  return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
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
    else if ('doubleValue'    in f) result[key] = f.doubleValue;
    else if ('booleanValue'   in f) result[key] = f.booleanValue;
    else if ('timestampValue' in f) result[key] = f.timestampValue;
  });
  return result;
};

// ─── Generate a unique 12-digit account number ────────────────────────────────
// Format: YYYYMMDD + 4 random digits — unique enough for a test environment.

const generateAccountNumber = () => {
  const now    = new Date();
  const date   = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const random = String(Math.floor(1000 + Math.random() * 9000));
  return date + random;
};

// ─── Create account for a newly approved customer ─────────────────────────────
// Call this in userService.approveCustomer AFTER setting status to APPROVED.
// initialBalancePaise must be an integer (paise). The customers collection
// receives accountBalance in rupees (double) for display purposes.

export const createAccountForCustomer = async (customerEmail, initialBalancePaise) => {
  try {
    // FIX: guard against a caller accidentally passing rupees instead of paise,
    // and ensure the value stored is always a whole number of paise.
    const balancePaise = Math.round(initialBalancePaise);

    const accountNumber = generateAccountNumber();

    // Write to accounts collection in your private DB
    const accountRef   = doc(collection(privateDb, 'accounts'));
    const accountDocId = accountRef.id;

    await setDoc(accountRef, {
      ifscCode:           'JGBK000001',
      accountDocId,
      accountNumber,                    // the 12-digit number
      customerId:         customerEmail,
      balance:            balancePaise, // stored in paise (integer)
      transferLimitPaise: 1000000,      // ₹10,000 default (in paise)
      status:             'ACTIVE',
      createdAt:          serverTimestamp(),
      updatedAt:          serverTimestamp(),
    });

    // Mirror masked record on hub so other banks can verify routing
    await registerAccountOnHub(accountDocId, accountNumber);

    // Write accountNumber + initial display balance back to customer doc.
    // FIX: accountBalance is in rupees (may be a non-integer double like 1234.56),
    // so toFirestoreValue must use doubleValue — which it now does correctly.
    const mask = [
      'updateMask.fieldPaths=accountNumber',
      'updateMask.fieldPaths=accountDocId',
      'updateMask.fieldPaths=accountBalance',
    ].join('&');

    await axios.patch(
      `${API_URL}/customers/${customerEmail}?${mask}&key=${apiKey}`,
      {
        fields: {
          accountNumber:  toFirestoreValue(accountNumber),
          accountDocId:   toFirestoreValue(accountDocId),
          accountBalance: toFirestoreValue(balancePaise / 100), // rupees for display
        },
      }
    );

    return { success: true, accountNumber, accountDocId };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Get account doc for a customer ──────────────────────────────────────────

export const getAccountByEmail = async (customerEmail) => {
  try {
    const q    = query(collection(privateDb, 'accounts'), where('customerId', '==', customerEmail));
    const snap = await getDocs(q);
    if (snap.empty) return { success: false, error: 'No account found.' };
    const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
    return { success: true, account: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Get account by account number ───────────────────────────────────────────

export const getAccountByNumber = async (accountNumber) => {
  try {
    const q    = query(collection(privateDb, 'accounts'), where('accountNumber', '==', accountNumber));
    const snap = await getDocs(q);
    if (snap.empty) return { success: false, error: `No account found for number ${accountNumber}.` };
    const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
    return { success: true, account: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};