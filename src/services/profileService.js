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
    else if ('doubleValue'    in f) result[key] = f.doubleValue;
    else if ('booleanValue'   in f) result[key] = f.booleanValue;
    else if ('timestampValue' in f) result[key] = f.timestampValue;
  });
  return result;
};

// ─── Get fresh customer profile ───────────────────────────────────────────────
// Always fetch from Firestore so balance/status is up-to-date

export const getCustomerProfile = async (email) => {
  try {
    const res = await axios.get(`${API_URL}/customers/${email}?key=${apiKey}`);
    if (!res.data.fields) return { success: false, error: 'Profile not found.' };

    const profile = { email, ...fromFirestoreValue(res.data.fields) };

    // Also sync to localStorage so other components see fresh data
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    localStorage.setItem('user', JSON.stringify({ ...stored, ...profile }));

    return { success: true, profile };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Update KYC documents ─────────────────────────────────────────────────────

export const updateKYCDocuments = async (email, { pan, aadhaar, passport = '' }) => {
  try {
    // Validate PAN: 5 letters, 4 digits, 1 letter
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase())) {
      return { success: false, error: 'Invalid PAN format. Example: ABCDE1234F' };
    }

    // Validate Aadhaar: 12 digits
    if (aadhaar && !/^\d{12}$/.test(aadhaar.replace(/\s/g, ''))) {
      return { success: false, error: 'Aadhaar must be exactly 12 digits.' };
    }

    const docString = [
      pan      ? `PAN: ${pan.toUpperCase()}`        : '',
      aadhaar  ? `Aadhaar: ${aadhaar.replace(/\s/g,'').replace(/(\d{4})(?=\d)/g,'$1 ')}` : '',
      passport ? `Passport: ${passport.toUpperCase()}` : '',
    ].filter(Boolean).join(' | ');

    // Update customer doc
    const mask = 'updateMask.fieldPaths=documents&updateMask.fieldPaths=pan&updateMask.fieldPaths=aadhaar&updateMask.fieldPaths=passport&updateMask.fieldPaths=kycStatus&updateMask.fieldPaths=kycUpdatedAt';
    await axios.patch(
      `${API_URL}/customers/${email}?${mask}&key=${apiKey}`,
      {
        fields: {
          documents:    toFirestoreValue(docString),
          pan:          toFirestoreValue(pan?.toUpperCase()      || ''),
          aadhaar:      toFirestoreValue(aadhaar?.replace(/\s/g,'') || ''),
          passport:     toFirestoreValue(passport?.toUpperCase() || ''),
          kycStatus:    toFirestoreValue('SUBMITTED'),
          kycUpdatedAt: toFirestoreValue(new Date()),
        },
      }
    );

    // Also update / create the KYC collection entry
    await axios.post(
      `${API_URL}/kyc?key=${apiKey}`,
      {
        fields: {
          customerId:  toFirestoreValue(email),
          documents:   toFirestoreValue(docString),
          pan:         toFirestoreValue(pan?.toUpperCase()      || ''),
          aadhaar:     toFirestoreValue(aadhaar?.replace(/\s/g,'') || ''),
          passport:    toFirestoreValue(passport?.toUpperCase() || ''),
          status:      toFirestoreValue('SUBMITTED'),
          submittedAt: toFirestoreValue(new Date()),
        },
      }
    );

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Update basic profile info ────────────────────────────────────────────────

export const updateProfile = async (email, { name, phone }) => {
  try {
    const mask = 'updateMask.fieldPaths=name&updateMask.fieldPaths=phone';
    await axios.patch(
      `${API_URL}/customers/${email}?${mask}&key=${apiKey}`,
      {
        fields: {
          name:  toFirestoreValue(name),
          phone: toFirestoreValue(phone || ''),
        },
      }
    );

    // Sync localStorage
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    localStorage.setItem('user', JSON.stringify({ ...stored, name, phone }));

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const updateKYCStatus = async (email, status) => {
  try {
    const mask =
      'updateMask.fieldPaths=kycStatus&updateMask.fieldPaths=kycReviewedAt';

    await axios.patch(
      `${API_URL}/customers/${email}?${mask}&key=${apiKey}`,
      {
        fields: {
          kycStatus: toFirestoreValue(status),
          kycReviewedAt: toFirestoreValue(new Date()),
        },
      }
    );

    // Sync localStorage
    const stored = JSON.parse(localStorage.getItem('user') || '{}');

    localStorage.setItem(
      'user',
      JSON.stringify({
        ...stored,
        kycStatus: status,
      })
    );

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};