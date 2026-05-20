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

// ─── Get ALL KYC records ──────────────────────────────────────────────────────

export const getAllKYC = async () => {
  try {
    const response = await axios.post(
      `${API_URL}:runQuery?key=${apiKey}`,
      { structuredQuery: { from: [{ collectionId: 'kyc' }] } }
    );

    const kyc = response.data
      .filter(item => item.document)
      .map(item => ({
        id: item.document.name.split('/').pop(),
        ...fromFirestoreValue(item.document.fields),
      }));

    return { success: true, kyc };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Get PENDING KYC records ──────────────────────────────────────────────────

export const getPendingKYC = async () => {
  try {
    const result = await getAllKYC();
    if (!result.success) return result;

    return {
      success: true,
      kyc: result.kyc.filter(k => k.status === 'PENDING'),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Approve KYC ──────────────────────────────────────────────────────────────

export const approveKYC = async (kycId) => {
  try {
    const mask = 'updateMask.fieldPaths=status&updateMask.fieldPaths=reviewedAt';
    await axios.patch(
      `${API_URL}/kyc/${kycId}?${mask}&key=${apiKey}`,
      {
        fields: {
          status:     toFirestoreValue('APPROVED'),
          reviewedAt: toFirestoreValue(new Date()),
        },
      }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Reject KYC ───────────────────────────────────────────────────────────────

export const rejectKYC = async (kycId, reason = '') => {
  try {
    const mask =
      'updateMask.fieldPaths=status&updateMask.fieldPaths=rejectionReason&updateMask.fieldPaths=reviewedAt';

    await axios.patch(
      `${API_URL}/kyc/${kycId}?${mask}&key=${apiKey}`,
      {
        fields: {
          status:          toFirestoreValue('REJECTED'),
          rejectionReason: toFirestoreValue(reason),
          reviewedAt:      toFirestoreValue(new Date()),
        },
      }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const updateKYCDocuments = async (
  email,
  kycData
) => {

  try {

    //
    // FIND EXISTING KYC
    //

    const query = await axios.post(
      `${API_URL}:runQuery?key=${apiKey}`,
      {
        structuredQuery: {

          from: [
            { collectionId: 'kyc' }
          ],

          where: {
            fieldFilter: {

              field: {
                fieldPath: 'email'
              },

              op: 'EQUAL',

              value: {
                stringValue: email
              }
            }
          }
        }
      }
    );

    const existing =
      query.data.find(d => d.document)
        ?.document;

    //
    // UPDATE EXISTING
    //

    if (existing) {

      const docId =
        existing.name
          .split('/')
          .pop();

      await axios.patch(
        `${API_URL}/kyc/${docId}?key=${apiKey}`,
        {
          fields: {

            email: {
              stringValue: email
            },

            panNumber: {
              stringValue:
                kycData.pan || ''
            },

            aadhaarNumber: {
              stringValue:
                kycData.aadhaar || ''
            },

            passportNumber: {
              stringValue:
                kycData.passport || ''
            },

            status: {
              stringValue: 'SUBMITTED'
            },

            submittedAt: {
              timestampValue:
                new Date().toISOString()
            }
          }
        }
      );

    }

    //
    // CREATE NEW IF NONE EXISTS
    //

    else {

      await axios.post(
        `${API_URL}/kyc?key=${apiKey}`,
        {
          fields: {

            email: {
              stringValue: email
            },

            panNumber: {
              stringValue:
                kycData.pan || ''
            },

            aadhaarNumber: {
              stringValue:
                kycData.aadhaar || ''
            },

            passportNumber: {
              stringValue:
                kycData.passport || ''
            },

            status: {
              stringValue: 'SUBMITTED'
            },

            submittedAt: {
              timestampValue:
                new Date().toISOString()
            }
          }
        }
      );
    }

    //
    // UPDATE CUSTOMER STATUS
    //

    const customerQuery = await axios.post(
      `${API_URL}:runQuery?key=${apiKey}`,
      {
        structuredQuery: {

          from: [
            { collectionId: 'customers' }
          ],

          where: {
            fieldFilter: {

              field: {
                fieldPath: 'email'
              },

              op: 'EQUAL',

              value: {
                stringValue: email
              }
            }
          }
        }
      }
    );

    const customer =
      customerQuery.data.find(
        d => d.document
      )?.document;

    if (customer) {

      const customerId =
        customer.name
          .split('/')
          .pop();

      await axios.patch(
        `${API_URL}/customers/${customerId}?updateMask.fieldPaths=kycStatus&key=${apiKey}`,
        {
          fields: {
            kycStatus: {
              stringValue:
                'SUBMITTED'
            }
          }
        }
      );
    }

    return {
      success: true
    };

  } catch (error) {

    return {
      success: false,
      error: error.message
    };
  }
};