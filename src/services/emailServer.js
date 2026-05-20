// emailServer.js
// ─── Express server for transactional emails via Nodemailer ──────────────────
//
// Run alongside your React app:   node emailServer.js
//
// Required env vars (add to your .env):
//   EMAIL_HOST        smtp.gmail.com
//   EMAIL_PORT        587
//   EMAIL_USER        your-bank-email@gmail.com
//   EMAIL_PASS        your-app-password          (Gmail: use App Password, not account password)
//   ADMIN_EMAIL       admin@yourdomain.com        (where YOU receive copies)
//   EMAIL_SERVER_PORT 4001                        (optional, defaults to 4001)
//
// Install deps:  npm install express nodemailer cors dotenv
//
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const express    = require('express');
const nodemailer = require('nodemailer');
const cors       = require('cors');

const app  = express();
const PORT = process.env.EMAIL_SERVER_PORT || 4001;

app.use(cors());
app.use(express.json());

// ─── Transporter ──────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
  port:   Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((err) => {
  if (err) console.error('[EMAIL] SMTP connection failed:', err.message);
  else     console.log('[EMAIL] SMTP ready on', process.env.EMAIL_HOST);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BANK_NAME = 'JG Bank';
const BANK_COLOR = '#6366f1';

const baseTemplate = (title, bodyHtml) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body { margin:0; padding:0; background:#f1f5f9; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrap { max-width:580px; margin:32px auto; background:#fff; border-radius:12px;
            overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
    .header { background:${BANK_COLOR}; padding:28px 32px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:22px; font-weight:800; letter-spacing:-0.5px; }
    .header p  { color:rgba(255,255,255,0.8); margin:4px 0 0; font-size:13px; }
    .body { padding:32px; color:#1e293b; }
    .body h2 { margin:0 0 16px; font-size:18px; font-weight:700; color:#0f172a; }
    .row { display:flex; justify-content:space-between; padding:10px 0;
           border-bottom:1px solid #f1f5f9; font-size:14px; }
    .row .label { color:#64748b; }
    .row .value { font-weight:600; color:#0f172a; }
    .amount { font-size:32px; font-weight:900; color:${BANK_COLOR};
              text-align:center; margin:24px 0; letter-spacing:-1px; }
    .badge { display:inline-block; padding:4px 12px; border-radius:99px;
             font-size:12px; font-weight:700; }
    .badge-success { background:#dcfce7; color:#16a34a; }
    .badge-warning { background:#fef9c3; color:#ca8a04; }
    .badge-error   { background:#fee2e2; color:#dc2626; }
    .footer { background:#f8fafc; padding:20px 32px; text-align:center;
              font-size:12px; color:#94a3b8; border-top:1px solid #e2e8f0; }
    .footer strong { color:#64748b; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>🏦 ${BANK_NAME}</h1>
      <p>${title}</p>
    </div>
    <div class="body">${bodyHtml}</div>
    <div class="footer">
      This is an automated message from <strong>${BANK_NAME}</strong>.<br/>
      Please do not reply to this email.
    </div>
  </div>
</body>
</html>`;

const row = (label, value) =>
  `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`;

const fmt = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

// ─── POST /send-transaction-notification ─────────────────────────────────────
// Called after every successful transfer.
// Body: { fromEmail, toEmail, fromAccountNumber, toAccountNumber,
//         amount, note, type, status, createdAt, transferId }

app.post('/send-transaction-notification', async (req, res) => {
  try {
    const {
      fromEmail, toEmail, fromAccountNumber, toAccountNumber,
      amount, note, type = 'INTERNAL', status = 'SUCCESS',
      createdAt, transferId,
    } = req.body;

    const date = createdAt
      ? new Date(createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    // ── Debit notification → sender ──────────────────────────────────────────
    const debitBody = `
      <h2>Money Sent Successfully</h2>
      <div class="amount">−${fmt(amount)}</div>
      ${row('Transaction ID',  transferId || '—')}
      ${row('To Account',      toAccountNumber || toEmail)}
      ${row('Transfer Type',   type)}
      ${row('Note',            note || '—')}
      ${row('Date & Time',     date)}
      ${row('Status',          `<span class="badge badge-success">${status}</span>`)}
      <p style="margin-top:24px;color:#64748b;font-size:13px;">
        If you did not authorise this transaction, please contact us immediately.
      </p>`;

    // ── Credit notification → receiver ───────────────────────────────────────
    const creditBody = `
      <h2>Money Received</h2>
      <div class="amount" style="color:#16a34a">+${fmt(amount)}</div>
      ${row('Transaction ID',  transferId || '—')}
      ${row('From Account',    fromAccountNumber || fromEmail)}
      ${row('Transfer Type',   type)}
      ${row('Note',            note || '—')}
      ${row('Date & Time',     date)}
      ${row('Status',          `<span class="badge badge-success">${status}</span>`)}`;

    const adminBody = `
      <h2>Transfer Alert</h2>
      ${row('From',   fromEmail)}
      ${row('To',     toEmail)}
      ${row('Amount', fmt(amount))}
      ${row('Type',   type)}
      ${row('Status', status)}
      ${row('Ref',    transferId || '—')}
      ${row('Time',   date)}`;

    const mails = [
      {
        to:      fromEmail,
        subject: `[${BANK_NAME}] Debit: ${fmt(amount)} sent`,
        html:    baseTemplate('Transaction Notification', debitBody),
      },
      {
        to:      toEmail,
        subject: `[${BANK_NAME}] Credit: ${fmt(amount)} received`,
        html:    baseTemplate('Transaction Notification', creditBody),
      },
      {
        to:      process.env.ADMIN_EMAIL,
        subject: `[${BANK_NAME}] Admin — Transfer ${fmt(amount)} | ${transferId || ''}`,
        html:    baseTemplate('Admin Transfer Alert', adminBody),
      },
    ].filter(m => m.to && m.to !== 'undefined');

    await Promise.all(
      mails.map(m =>
        transporter.sendMail({
          from: `"${BANK_NAME}" <${process.env.EMAIL_USER}>`,
          ...m,
        })
      )
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[EMAIL] /send-transaction-notification error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /send-loan-notification ────────────────────────────────────────────
// Called after loan approval or rejection.
// Body: { customerEmail, customerName, loanId, amount, tenure, purpose,
//         status, reviewedAt }

app.post('/send-loan-notification', async (req, res) => {
  try {
    const {
      customerEmail, customerName = 'Customer',
      loanId, amount, tenure, purpose,
      status, reviewedAt,
    } = req.body;

    const date = reviewedAt
      ? new Date(reviewedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const isApproved = status === 'APPROVED';

    const customerBody = `
      <h2>Loan Application ${isApproved ? 'Approved ✓' : 'Rejected'}</h2>
      <p>Dear <strong>${customerName}</strong>,</p>
      <p>Your loan application has been <strong>${isApproved ? 'approved and disbursed' : 'rejected'}</strong>.</p>
      ${row('Loan ID',   loanId || '—')}
      ${row('Amount',    fmt(amount))}
      ${row('Tenure',    `${tenure} months`)}
      ${row('Purpose',   purpose || '—')}
      ${row('Status',    `<span class="badge ${isApproved ? 'badge-success' : 'badge-error'}">${status}</span>`)}
      ${row('Date',      date)}
      ${isApproved
        ? `<p style="margin-top:20px;background:#dcfce7;padding:14px;border-radius:8px;color:#166534;font-size:13px;">
             The loan amount of <strong>${fmt(amount)}</strong> has been credited to your account.
           </p>`
        : `<p style="margin-top:20px;background:#fee2e2;padding:14px;border-radius:8px;color:#991b1b;font-size:13px;">
             Unfortunately your loan application was not approved at this time.
             Please contact the branch for further details.
           </p>`}`;

    const adminBody = `
      <h2>Loan Decision Recorded</h2>
      ${row('Customer', customerEmail)}
      ${row('Loan ID',  loanId || '—')}
      ${row('Amount',   fmt(amount))}
      ${row('Status',   status)}
      ${row('Date',     date)}`;

    const mails = [
      {
        to:      customerEmail,
        subject: `[${BANK_NAME}] Your loan application has been ${status.toLowerCase()}`,
        html:    baseTemplate('Loan Decision', customerBody),
      },
      {
        to:      process.env.ADMIN_EMAIL,
        subject: `[${BANK_NAME}] Admin — Loan ${status} | ${fmt(amount)} | ${customerEmail}`,
        html:    baseTemplate('Admin Loan Alert', adminBody),
      },
    ].filter(m => m.to && m.to !== 'undefined');

    await Promise.all(
      mails.map(m =>
        transporter.sendMail({
          from: `"${BANK_NAME}" <${process.env.EMAIL_USER}>`,
          ...m,
        })
      )
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[EMAIL] /send-loan-notification error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /send-kyc-notification ─────────────────────────────────────────────
// Body: { customerEmail, customerName, status, reason }

app.post('/send-kyc-notification', async (req, res) => {
  try {
    const { customerEmail, customerName = 'Customer', status, reason = '' } = req.body;
    const isApproved = status === 'APPROVED';

    const body = `
      <h2>KYC Verification ${isApproved ? 'Approved ✓' : 'Rejected'}</h2>
      <p>Dear <strong>${customerName}</strong>,</p>
      <p>Your KYC documents have been <strong>${isApproved ? 'verified successfully' : 'rejected'}</strong>.</p>
      ${!isApproved && reason ? row('Reason', reason) : ''}
      ${isApproved
        ? `<p style="margin-top:20px;background:#dcfce7;padding:14px;border-radius:8px;color:#166534;font-size:13px;">
             Your account now has full access to all banking features.
           </p>`
        : `<p style="margin-top:20px;background:#fee2e2;padding:14px;border-radius:8px;color:#991b1b;font-size:13px;">
             Please resubmit your documents through the KYC section of your dashboard.
           </p>`}`;

    await transporter.sendMail({
      from:    `"${BANK_NAME}" <${process.env.EMAIL_USER}>`,
      to:      customerEmail,
      subject: `[${BANK_NAME}] KYC ${isApproved ? 'Verified' : 'Rejected'}`,
      html:    baseTemplate('KYC Update', body),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[EMAIL] /send-kyc-notification error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_, res) => res.json({ status: 'ok', server: BANK_NAME }));

app.listen(PORT, () => {
  console.log(`[EMAIL] Server running on http://localhost:${PORT}`);
});