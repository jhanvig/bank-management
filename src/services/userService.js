// userService.js
// NOTE: approveCustomer now calls createAccountForCustomer automatically.
// The account number is generated and stored in the 'accounts' collection.

import axios from 'axios';
import { createAccountForCustomer } from './accountService';

const projectId = process.env.REACT_APP_FIRESTORE_PROJECT_ID;
const apiKey    = process.env.REACT_APP_FIRESTORE_API_KEY;
const API_URL   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// ─── Firestore helpers ────────────────────────────────────────────────────────

// FIX: was mapping ALL numbers to integerValue, truncating any decimal rupee values.
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

// ─── Get ALL customers (all statuses) ────────────────────────────────────────

export const getAllCustomers = async () => {
  try {
    const response = await axios.post(
      `${API_URL}:runQuery?key=${apiKey}`,
      { structuredQuery: { from: [{ collectionId: 'customers' }] } }
    );

    const customers = response.data
      .filter(item => item.document)
      .map(item => ({
        id: item.document.name.split('/').pop(),
        ...fromFirestoreValue(item.document.fields),
      }))
      .filter(u => u.role === 'customer');

    return { success: true, customers };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Get PENDING customers only ───────────────────────────────────────────────

export const getPendingCustomers = async () => {
  try {
    const result = await getAllCustomers();
    if (!result.success) return result;
    return {
      success: true,
      customers: result.customers.filter(u => u.status === 'PENDING'),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Approve ──────────────────────────────────────────────────────────────────
// Sets status to APPROVED, then creates an account with a 12-digit account number.
// Initial balance: ₹0 (0 paise). Admin can top-up separately if needed.

export const approveCustomer = async (customerId) => {
  try {
    // 1. Set status to APPROVED
    const statusResult = await _updateStatus(customerId, 'APPROVED');
    if (!statusResult.success) return statusResult;

    // 2. Check if account already exists (idempotency — re-approving won't duplicate)
    const { getAccountByEmail } = await import('./accountService');
    const existing = await getAccountByEmail(customerId);
    if (existing.success) {
      return { success: true, message: 'Customer APPROVED (account already existed)' };
    }

    // 3. Create the account with ₹0 initial balance (admin tops up separately)
    const accountResult = await createAccountForCustomer(customerId, 0);
    if (!accountResult.success) {
      console.error('[approveCustomer] Account creation failed:', accountResult.error);
      return { success: true, message: 'Customer APPROVED but account creation failed. Check logs.' };
    }

    return {
      success: true,
      message: `Customer APPROVED. Account ${accountResult.accountNumber} created.`,
      accountNumber: accountResult.accountNumber,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const holdCustomer   = (customerId, reason) => _updateStatus(customerId, 'HOLD',     reason);
export const rejectCustomer = (customerId, reason) => _updateStatus(customerId, 'REJECTED', reason);

const _updateStatus = async (customerId, status, reason = '') => {
  try {
    const mask =
      'updateMask.fieldPaths=status&updateMask.fieldPaths=adminRemarks&updateMask.fieldPaths=reviewedAt';

    await axios.patch(
      `${API_URL}/customers/${customerId}?${mask}&key=${apiKey}`,
      {
        fields: {
          status:       toFirestoreValue(status),
          adminRemarks: toFirestoreValue(reason),
          reviewedAt:   toFirestoreValue(new Date()),
        },
      }
    );

    await _writeAuditLog(status, customerId, reason);
    return { success: true, message: `Customer ${status}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Update transfer limit ────────────────────────────────────────────────────
// FIX: the old implementation only updated the display field in `customers`,
// never the enforced `transferLimitPaise` in `accounts`. The two were always
// out of sync. Delegate entirely to transferService which updates both correctly.

export const updateTransferLimit = async (customerEmail, limit) => {
  try {
    const { updateTransferLimit: _updateLimit } = await import('./transferService');
    return await _updateLimit(customerEmail, Number(limit));
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Soft-delete customer ─────────────────────────────────────────────────────

export const deleteCustomer = async (customerId) => {
  try {
    const mask = 'updateMask.fieldPaths=deleted&updateMask.fieldPaths=deletedAt';
    await axios.patch(
      `${API_URL}/customers/${customerId}?${mask}&key=${apiKey}`,
      {
        fields: {
          deleted:   toFirestoreValue(true),
          deletedAt: toFirestoreValue(new Date()),
        },
      }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Internal: write audit log ────────────────────────────────────────────────

const _writeAuditLog = async (action, customerId, details = '') => {
  try {
    const admin = JSON.parse(localStorage.getItem('user') || '{}');
    await axios.post(
      `${API_URL}/auditLogs?key=${apiKey}`,
      {
        fields: {
          action:     toFirestoreValue(action),
          customerId: toFirestoreValue(customerId),
          details:    toFirestoreValue(details),
          adminEmail: toFirestoreValue(admin.email || 'unknown'),
          timestamp:  toFirestoreValue(new Date()),
        },
      }
    );
  } catch (_) {
    // Non-critical — swallow silently
  }
};