import axios from 'axios';

const projectId = process.env.REACT_APP_FIRESTORE_PROJECT_ID;
const apiKey    = process.env.REACT_APP_FIRESTORE_API_KEY;

const API_URL =
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const toFirestoreValue = (value) => {

  if (typeof value === 'string')
    return { stringValue: value };

  if (typeof value === 'number')
    return { integerValue: value };

  if (typeof value === 'boolean')
    return { booleanValue: value };

  if (value instanceof Date)
    return { timestampValue: value.toISOString() };

  return {
    stringValue: String(value)
  };
};

const fromFirestoreValue = (fields) => {

  const result = {};

  Object.keys(fields).forEach((key) => {

    const f = fields[key];

    if ('stringValue' in f)
      result[key] = f.stringValue;

    else if ('integerValue' in f)
      result[key] = parseInt(f.integerValue);

    else if ('doubleValue' in f)
      result[key] = f.doubleValue;

    else if ('booleanValue' in f)
      result[key] = f.booleanValue;

    else if ('timestampValue' in f)
      result[key] = f.timestampValue;
  });

  return result;
};


// ─────────────────────────────────────────────────────────────────────────────
// GET ALL LOANS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllLoans = async () => {

  try {

    const response = await axios.post(
      `${API_URL}:runQuery?key=${apiKey}`,
      {
        structuredQuery: {
          from: [
            { collectionId: 'loans' }
          ]
        }
      }
    );

    const loans = response.data
      .filter(item => item.document)
      .map(item => ({
        id: item.document.name
          .split('/')
          .pop(),

        ...fromFirestoreValue(
          item.document.fields
        ),
      }));

    return {
      success: true,
      loans
    };

  } catch (error) {

    return {
      success: false,
      error: error.message
    };
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET PENDING LOANS
// ─────────────────────────────────────────────────────────────────────────────

export const getPendingLoans = async () => {

  try {

    const result = await getAllLoans();

    if (!result.success)
      return result;

    return {
      success: true,
      loans: result.loans.filter(
        l => l.status === 'PENDING'
      ),
    };

  } catch (error) {

    return {
      success: false,
      error: error.message
    };
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// APPLY FOR LOAN
// ─────────────────────────────────────────────────────────────────────────────

export const applyLoan = async (loanData) => {

  try {

    const response = await axios.post(
      `${API_URL}/loans?key=${apiKey}`,
      {
        fields: {

          customerId:
            toFirestoreValue(
              loanData.customerId
            ),

          amount:
            toFirestoreValue(
              Number(loanData.amount)
            ),

          purpose:
            toFirestoreValue(
              loanData.purpose
            ),

          tenure:
            toFirestoreValue(
              Number(loanData.tenure)
            ),

          status:
            toFirestoreValue('PENDING'),

          appliedAt:
            toFirestoreValue(
              new Date()
            ),
        },
      }
    );

    const id =
      response.data.name
        .split('/')
        .pop();

    return {
      success: true,
      id
    };

  } catch (error) {

    return {
      success: false,
      error: error.message
    };
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// APPROVE LOAN + DISBURSE MONEY
// ─────────────────────────────────────────────────────────────────────────────

export const approveLoan = async (loanId) => {

  try {

    //
    // APPROVE LOAN
    //

    const mask =
      'updateMask.fieldPaths=status&updateMask.fieldPaths=reviewedAt';

    await axios.patch(
      `${API_URL}/loans/${loanId}?${mask}&key=${apiKey}`,
      {
        fields: {
          status:
            toFirestoreValue('APPROVED'),

          reviewedAt:
            toFirestoreValue(
              new Date()
            ),
        },
      }
    );

    //
    // FETCH LOAN
    //

    const loanRes = await axios.get(
      `${API_URL}/loans/${loanId}?key=${apiKey}`
    );

    const loanFields =
      loanRes.data.fields;

    const customerId =
      loanFields.customerId.stringValue;

    const amount =
      parseInt(
        loanFields.amount.integerValue
      );

    //
    // FIND CUSTOMER ACCOUNT
    //

    const queryRes = await axios.post(
      `${API_URL}:runQuery?key=${apiKey}`,
      {
        structuredQuery: {

          from: [
            { collectionId: 'accounts' }
          ],

          where: {
            fieldFilter: {

              field: {
                fieldPath: 'customerId'
              },

              op: 'EQUAL',

              value: {
                stringValue: customerId
              }
            }
          }
        }
      }
    );

    const accountDoc =
      queryRes.data.find(
        d => d.document
      )?.document;

    //
    // ACCOUNT FOUND
    //

    if (accountDoc) {

      const accountId =
        accountDoc.name
          .split('/')
          .pop();

      const balance =
        parseInt(
          accountDoc.fields.balance
            .integerValue
        );

      //
      // accounts.balance uses PAISE
      //

      const newBalance =
        balance + (amount * 100);

      //
      // UPDATE ACCOUNT BALANCE
      //

      await axios.patch(
        `${API_URL}/accounts/${accountId}?updateMask.fieldPaths=balance&key=${apiKey}`,
        {
          fields: {
            balance: {
              integerValue:
                newBalance
            }
          }
        }
      );

      //
      // UPDATE CUSTOMER DISPLAY BALANCE
      // customers.accountBalance uses RUPEES
      //

      await axios.patch(
        `${API_URL}/customers/${customerId}?updateMask.fieldPaths=accountBalance&key=${apiKey}`,
        {
          fields: {
            accountBalance: {
              integerValue:
                newBalance / 100
            }
          }
        }
      );

      //
      // CREATE TRANSACTION RECORD
      //

      await axios.post(
        `${API_URL}/transactions?key=${apiKey}`,
        {
          fields: {

            fromEmail: {
              stringValue: 'BANK'
            },

            toEmail: {
              stringValue: customerId
            },

            amount: {
              integerValue: amount
            },

            amountPaise: {
              integerValue:
                amount * 100
            },

            type: {
              stringValue:
                'LOAN_DISBURSEMENT'
            },

            status: {
              stringValue:
                'SUCCESS'
            },

            note: {
              stringValue:
                'Loan disbursed'
            },

            createdAt: {
              timestampValue:
                new Date().toISOString()
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


// ─────────────────────────────────────────────────────────────────────────────
// REJECT LOAN
// ─────────────────────────────────────────────────────────────────────────────

export const rejectLoan = async (loanId) => {

  try {

    const mask =
      'updateMask.fieldPaths=status&updateMask.fieldPaths=reviewedAt';

    await axios.patch(
      `${API_URL}/loans/${loanId}?${mask}&key=${apiKey}`,
      {
        fields: {

          status:
            toFirestoreValue('REJECTED'),

          reviewedAt:
            toFirestoreValue(
              new Date()
            ),
        },
      }
    );

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

export function printLoanInvoice({ loanId, customerEmail, customerName, amount, tenure, purpose, status, reviewedAt }) {
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>Loan Letter - JGBank</title>
    <style>
      body { font-family: sans-serif; padding: 40px; color: #0f172a; max-width: 600px; margin: 0 auto; }
      h1 { color: #10b981; margin-bottom: 4px; }
      .sub { color: #64748b; font-size: 13px; margin-bottom: 32px; }
      .row { display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #e2e8f0; }
      .label { color:#64748b; font-size:14px; }
      .value { font-weight:700; font-size:14px; }
      .status-APPROVED { color: #10b981; }
      .status-REJECTED { color: #ef4444; }
      .footer { color:#94a3b8; font-size:12px; margin-top:32px; text-align:center; }
    </style></head><body>
    <h1>🏦 JGBank</h1>
    <p class="sub">Loan ${status} Letter · Ref: ${loanId}</p>
    <div class="row"><span class="label">Customer Name</span><span class="value">${customerName || '—'}</span></div>
    <div class="row"><span class="label">Customer Email</span><span class="value">${customerEmail}</span></div>
    <div class="row"><span class="label">Loan Amount</span><span class="value">₹${Number(amount).toLocaleString('en-IN')}</span></div>
    <div class="row"><span class="label">Tenure</span><span class="value">${tenure} months</span></div>
    <div class="row"><span class="label">Purpose</span><span class="value">${purpose || '—'}</span></div>
    <div class="row"><span class="label">Status</span><span class="value class="status-${status}">${status}</span></div>
    <div class="row"><span class="label">Date</span><span class="value">${reviewedAt ? new Date(reviewedAt).toLocaleDateString('en-IN') : '—'}</span></div>
    <p class="footer">This is an auto-generated document. Please contact JGBank for any queries.</p>
    </body></html>
  `);
  win.document.close();
  win.print();
}