// staffService.js
// Manages bank staff accounts stored in the `staff` collection.
// Staff are distinct from admins and customers; they have a role and branch.
//
// ─── Firestore `staff` collection schema ──────────────────────────────────────
//
//  Document ID : staffEmail  (e.g. "jane.doe@jgbank.com")
//
//  Fields:
//    uid          string    — Firebase Auth UID (set after account creation)
//    name         string    — Full name
//    email        string    — Work email (= doc ID)
//    phone        string    — Contact number
//    role         string    — One of: TELLER | LOAN_OFFICER | BRANCH_MANAGER | SUPPORT
//    branch       string    — Branch name / code (e.g. "Chennai Main", "JGBK001")
//    status       string    — ACTIVE | SUSPENDED | RESIGNED
//    employeeId   string    — Internal employee ID (e.g. "EMP-2024-001")
//    department   string    — e.g. "Retail Banking", "Loans"
//    joiningDate  string    — ISO date string
//    createdAt    timestamp
//    updatedAt    timestamp
//    createdBy    string    — email of admin who created the record
//
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';

const projectId = process.env.REACT_APP_FIRESTORE_PROJECT_ID;
const apiKey    = process.env.REACT_APP_FIRESTORE_API_KEY;
const API_URL   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const adminEmail = () => {
  try { return JSON.parse(localStorage.getItem('user') || '{}').email || 'unknown'; }
  catch { return 'unknown'; }
};

// Generate a sequential-looking employee ID using timestamp + random suffix
const generateEmployeeId = () => {
  const year   = new Date().getFullYear();
  const suffix = String(Math.floor(100 + Math.random() * 900));
  return `EMP-${year}-${suffix}`;
};

// ─── Get all staff ────────────────────────────────────────────────────────────

export const getAllStaff = async () => {
  try {
    const response = await axios.post(
      `${API_URL}:runQuery?key=${apiKey}`,
      {
        structuredQuery: {
          from: [{ collectionId: 'staff' }],
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        },
      }
    );

    const staff = response.data
      .filter(item => item.document)
      .map(item => ({
        id: item.document.name.split('/').pop(),
        ...fromFirestoreValue(item.document.fields),
      }));

    return { success: true, staff };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Get staff by role ────────────────────────────────────────────────────────

export const getStaffByRole = async (role) => {
  try {
    const response = await axios.post(
      `${API_URL}:runQuery?key=${apiKey}`,
      {
        structuredQuery: {
          from: [{ collectionId: 'staff' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'role' },
              op: 'EQUAL',
              value: { stringValue: role },
            },
          },
        },
      }
    );

    const staff = response.data
      .filter(item => item.document)
      .map(item => ({
        id: item.document.name.split('/').pop(),
        ...fromFirestoreValue(item.document.fields),
      }));

    return { success: true, staff };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Create staff member ──────────────────────────────────────────────────────
// Does NOT create a Firebase Auth account — that's done separately if needed.
// The record is keyed by email for easy lookup.

export const createStaff = async ({
  name,
  email,
  phone      = '',
  role,                         // TELLER | LOAN_OFFICER | BRANCH_MANAGER | SUPPORT
  branch     = '',
  department = '',
  joiningDate = new Date().toISOString().split('T')[0],
}) => {
  try {
    if (!name?.trim())  return { success: false, error: 'Name is required.' };
    if (!email?.trim()) return { success: false, error: 'Email is required.' };
    if (!role)          return { success: false, error: 'Role is required.' };

    const VALID_ROLES = ['TELLER', 'LOAN_OFFICER', 'BRANCH_MANAGER', 'SUPPORT'];
    if (!VALID_ROLES.includes(role)) {
      return { success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}.` };
    }

    // Check for duplicate
    try {
      const existing = await axios.get(`${API_URL}/staff/${email}?key=${apiKey}`);
      if (existing.data.fields) {
        return { success: false, error: 'A staff member with this email already exists.' };
      }
    } catch (_) { /* doc doesn't exist — good */ }

    const employeeId = generateEmployeeId();
    const now        = new Date().toISOString();

    await axios.patch(
      `${API_URL}/staff/${email}?key=${apiKey}`,
      {
        fields: {
          name:        toFirestoreValue(name.trim()),
          email:       toFirestoreValue(email.trim().toLowerCase()),
          phone:       toFirestoreValue(phone.trim()),
          role:        toFirestoreValue(role),
          branch:      toFirestoreValue(branch.trim()),
          department:  toFirestoreValue(department.trim()),
          joiningDate: toFirestoreValue(joiningDate),
          employeeId:  toFirestoreValue(employeeId),
          status:      toFirestoreValue('ACTIVE'),
          createdAt:   toFirestoreValue(new Date()),
          updatedAt:   toFirestoreValue(new Date()),
          createdBy:   toFirestoreValue(adminEmail()),
        },
      }
    );

    return { success: true, employeeId };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Update staff member ──────────────────────────────────────────────────────

export const updateStaff = async (email, updates) => {
  try {
    const allowed = ['name', 'phone', 'role', 'branch', 'department', 'joiningDate'];
    const fields  = { updatedAt: toFirestoreValue(new Date()) };
    const paths   = ['updatedAt'];

    allowed.forEach(key => {
      if (updates[key] !== undefined) {
        fields[key] = toFirestoreValue(updates[key]);
        paths.push(key);
      }
    });

    const mask = paths.map(p => `updateMask.fieldPaths=${p}`).join('&');

    await axios.patch(
      `${API_URL}/staff/${email}?${mask}&key=${apiKey}`,
      { fields }
    );

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Update staff status ──────────────────────────────────────────────────────

export const updateStaffStatus = async (email, status) => {
  const VALID = ['ACTIVE', 'SUSPENDED', 'RESIGNED'];
  if (!VALID.includes(status)) {
    return { success: false, error: `Invalid status. Must be one of: ${VALID.join(', ')}.` };
  }

  try {
    const mask = 'updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt';
    await axios.patch(
      `${API_URL}/staff/${email}?${mask}&key=${apiKey}`,
      {
        fields: {
          status:    toFirestoreValue(status),
          updatedAt: toFirestoreValue(new Date()),
        },
      }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Delete staff member (hard delete) ───────────────────────────────────────
// For regulatory reasons you may prefer updateStaffStatus(email, 'RESIGNED') instead.

export const deleteStaff = async (email) => {
  try {
    await axios.delete(`${API_URL}/staff/${email}?key=${apiKey}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Get single staff member ──────────────────────────────────────────────────

export const getStaffByEmail = async (email) => {
  try {
    const res = await axios.get(`${API_URL}/staff/${email}?key=${apiKey}`);
    if (!res.data.fields) return { success: false, error: 'Staff member not found.' };
    return { success: true, staff: { id: email, ...fromFirestoreValue(res.data.fields) } };
  } catch (error) {
    return { success: false, error: error.message };
  }
};