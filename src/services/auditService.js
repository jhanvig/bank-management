import axios from 'axios';

const projectId = process.env.REACT_APP_FIRESTORE_PROJECT_ID;
const apiKey    = process.env.REACT_APP_FIRESTORE_API_KEY;
const API_URL   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

const fromFirestoreValue = (fields) => {
  const result = {};
  Object.keys(fields).forEach((key) => {
    const f = fields[key];
    if      ('stringValue'    in f) result[key] = f.stringValue;
    else if ('integerValue'   in f) result[key] = parseInt(f.integerValue);
    else if ('doubleValue'    in f) result[key] = f.doubleValue;
    else if ('booleanValue'   in f) result[key] = f.booleanValue;
    else if ('timestampValue' in f) result[key] = new Date(f.timestampValue);
  });
  return result;
};

// ─── Get all audit logs ───────────────────────────────────────────────────────

export const getAuditLogs = async () => {
  try {
    const response = await axios.get(`${API_URL}/auditLogs?key=${apiKey}`);

    const logs = response.data.documents?.map((doc) => ({
      id: doc.name.split('/').pop(),
      ...fromFirestoreValue(doc.fields),
    })) || [];

    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return { success: true, logs };
  } catch (error) {
    // If collection is empty Firestore returns 404 – treat as empty
    if (error.response?.status === 404) return { success: true, logs: [] };
    return { success: false, error: error.message };
  }
};