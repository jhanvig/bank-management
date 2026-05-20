// emailService.js
// Client-side wrapper that calls the local emailServer.js Express endpoint.
//
// The server must be running:  node emailServer.js
// Configure EMAIL_SERVER_URL in your .env:
//   REACT_APP_EMAIL_SERVER_URL=http://localhost:4001
//
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.REACT_APP_EMAIL_SERVER_URL || 'http://localhost:4001';

const post = async (path, body) => {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    // Email is non-critical — log but never crash the calling flow.
    console.warn('[emailService] Failed:', path, err.message);
    return { success: false, error: err.message };
  }
};

// ─── Send transaction notification ───────────────────────────────────────────
// Call this immediately after a successful transferMoney / interbankTransfer.

export const sendTransactionEmail = ({
  fromEmail,
  toEmail,
  fromAccountNumber = '',
  toAccountNumber   = '',
  amount,
  note              = '',
  type              = 'INTERNAL',
  status            = 'SUCCESS',
  createdAt         = new Date().toISOString(),
  transferId        = '',
}) =>
  post('/send-transaction-notification', {
    fromEmail, toEmail, fromAccountNumber, toAccountNumber,
    amount, note, type, status, createdAt, transferId,
  });

// ─── Send loan decision notification ─────────────────────────────────────────
// Call after approveLoan or rejectLoan.

export const sendLoanEmail = ({
  customerEmail,
  customerName = '',
  loanId       = '',
  amount,
  tenure,
  purpose      = '',
  status,
  reviewedAt   = new Date().toISOString(),
}) =>
  post('/send-loan-notification', {
    customerEmail, customerName, loanId, amount, tenure, purpose, status, reviewedAt,
  });

// ─── Send KYC decision notification ──────────────────────────────────────────

export const sendKYCEmail = ({
  customerEmail,
  customerName = '',
  status,
  reason       = '',
}) =>
  post('/send-kyc-notification', { customerEmail, customerName, status, reason });