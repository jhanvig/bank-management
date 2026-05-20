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

// ─── Get all banks ────────────────────────────────────────────────────────────

export const getBanks = async () => {
  try {
    const response = await axios.get(`${API_URL}/banks?key=${apiKey}`);

    const banks = response.data.documents?.map((doc) => ({
      id: doc.name.split('/').pop(),
      ...fromFirestoreValue(doc.fields),
    })) || [];

    return { success: true, banks };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Create bank ──────────────────────────────────────────────────────────────

export const createBank = async (bankData) => {
  try {
    const response = await axios.post(
      `${API_URL}/banks?key=${apiKey}`,
      {
        fields: {
          name:      toFirestoreValue(bankData.name),
          ifsc:      toFirestoreValue(bankData.ifsc),
          address:   toFirestoreValue(bankData.address),
          createdAt: toFirestoreValue(new Date()),
        },
      }
    );

    const id = response.data.name.split('/').pop();
    return { success: true, id };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Update bank ──────────────────────────────────────────────────────────────

export const updateBank = async (bankId, bankData) => {
  try {
    const mask =
      'updateMask.fieldPaths=name&updateMask.fieldPaths=ifsc&updateMask.fieldPaths=address';

    await axios.patch(
      `${API_URL}/banks/${bankId}?${mask}&key=${apiKey}`,
      {
        fields: {
          name:    toFirestoreValue(bankData.name),
          ifsc:    toFirestoreValue(bankData.ifsc),
          address: toFirestoreValue(bankData.address),
        },
      }
    );

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Delete bank ──────────────────────────────────────────────────────────────

export const deleteBank = async (bankId) => {
  try {
    await axios.delete(`${API_URL}/banks/${bankId}?key=${apiKey}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};