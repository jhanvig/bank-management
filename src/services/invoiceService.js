// invoiceService.js
// Opens a styled print-ready invoice in a new browser window.
// No external dependencies — pure DOM. Works offline.
// ─────────────────────────────────────────────────────────────────────────────

const BANK_NAME  = 'JG Bank';
const BANK_ADDR  = 'JG Bank, Main Branch, Chennai, Tamil Nadu – 600001';
const BANK_IFSC  = 'JGBK000001';
const BANK_EMAIL = process.env.REACT_APP_BANK_SUPPORT_EMAIL || 'support@jgbank.com';

const fmt    = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtDt  = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' }) : '—';
const refId  = (id) => id ? String(id).slice(-10).toUpperCase() : Math.random().toString(36).slice(2,12).toUpperCase();

// ─── Shared print-window helper ───────────────────────────────────────────────

const openPrint = (title, html) => {
  const win = window.open('', '_blank', 'width=760,height=960');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print invoices.');
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;400;600;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'IBM Plex Sans', sans-serif;
      background: #f8fafc;
      color: #0f172a;
      padding: 0;
    }

    .page {
      max-width: 720px;
      margin: 0 auto;
      background: #fff;
      min-height: 100vh;
      padding: 48px 56px;
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 28px;
      border-bottom: 3px solid #0f172a;
      margin-bottom: 32px;
    }
    .bank-name {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: #0f172a;
    }
    .bank-name span { color: #6366f1; }
    .bank-meta {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
      line-height: 1.6;
    }
    .invoice-title {
      text-align: right;
    }
    .invoice-title h1 {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -1px;
      color: #6366f1;
      text-transform: uppercase;
    }
    .invoice-title .ref {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
    }
    .invoice-title .date {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 2px;
    }

    /* ── Status badge ── */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 32px;
      padding: 14px 20px;
      border-radius: 10px;
    }
    .status-bar.success { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .status-bar.warning { background: #fffbeb; border: 1px solid #fde68a; }
    .status-bar.error   { background: #fff1f2; border: 1px solid #fecdd3; }
    .status-badge {
      font-size: 12px;
      font-weight: 700;
      padding: 4px 14px;
      border-radius: 99px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .success .status-badge { background: #dcfce7; color: #15803d; }
    .warning .status-badge { background: #fef9c3; color: #a16207; }
    .error   .status-badge { background: #fee2e2; color: #b91c1c; }
    .status-bar .status-desc { font-size: 13px; color: #374151; }

    /* ── Section headings ── */
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #94a3b8;
      margin-bottom: 14px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
    }

    /* ── Party row (from / to) ── */
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }
    .party-card {
      background: #f8fafc;
      border-radius: 10px;
      padding: 18px 20px;
    }
    .party-card .party-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    .party-card .party-name { font-size: 15px; font-weight: 700; color: #0f172a; }
    .party-card .party-acct {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      color: #64748b;
      margin-top: 2px;
    }

    /* ── Detail table ── */
    .detail-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }
    .detail-table tr td {
      padding: 11px 14px;
      font-size: 14px;
      border-bottom: 1px solid #f1f5f9;
    }
    .detail-table tr:last-child td { border-bottom: none; }
    .detail-table td:first-child { color: #64748b; width: 42%; }
    .detail-table td:last-child  { font-weight: 600; color: #0f172a; text-align: right; }
    .detail-table tr.highlight td { background: #fafafe; }

    /* ── Amount block ── */
    .amount-block {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 12px;
      padding: 24px 28px;
      margin-bottom: 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .amount-block .amount-label { color: rgba(255,255,255,0.75); font-size: 13px; }
    .amount-block .amount-value {
      font-size: 36px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -1px;
    }
    .amount-block .amount-right { text-align: right; }
    .amount-block .amount-type {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: rgba(255,255,255,0.6);
      margin-top: 2px;
    }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .footer .disclaimer {
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.6;
      max-width: 380px;
    }
    .footer .qr-placeholder {
      width: 64px;
      height: 64px;
      border: 2px dashed #cbd5e1;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      color: #94a3b8;
      text-align: center;
    }

    /* ── Print styles ── */
    @media print {
      body { background: #fff; }
      .page { padding: 0; max-width: 100%; }
      .no-print { display: none !important; }
    }

    /* ── Print button (screen only) ── */
    .print-btn {
      display: block;
      width: 100%;
      padding: 14px;
      margin-top: 28px;
      background: #6366f1;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'IBM Plex Sans', sans-serif;
      letter-spacing: -0.3px;
    }
    .print-btn:hover { background: #4f46e5; }
  </style>
</head>
<body>
  <div class="page">
    ${html}
    <button class="print-btn no-print" onclick="window.print()">🖨️ &nbsp;Print / Save as PDF</button>
  </div>
  <script>
    // Auto-focus so Ctrl+P works immediately
    window.focus();
  </script>
</body>
</html>`);
  win.document.close();
};

// ─── Transaction Invoice ──────────────────────────────────────────────────────
// Call after a successful transfer.

export const printTransactionInvoice = ({
  transferId,
  fromEmail,
  toEmail,
  fromAccountNumber = '',
  toAccountNumber   = '',
  fromName          = '',
  toName            = '',
  amount,
  note              = '',
  type              = 'INTERNAL',
  status            = 'SUCCESS',
  createdAt,
}) => {
  const ref      = refId(transferId);
  const dateStr  = fmtDt(createdAt);
  const isFail   = status === 'FAILED';
  const isPending = status === 'PENDING';
  const barClass = isFail ? 'error' : isPending ? 'warning' : 'success';
  const barDesc  = isFail
    ? 'This transaction did not complete successfully.'
    : isPending
    ? 'This transaction is pending processing.'
    : 'This transaction was completed successfully.';

  const typeLabel = {
    INTERNAL:          'Internal Transfer',
    INTERBANK:         'Interbank Transfer',
    LOAN_DISBURSEMENT: 'Loan Disbursement',
  }[type] || type;

  const html = `
    <div class="header">
      <div>
        <div class="bank-name">🏦 ${BANK_NAME.split(' ')[0]}<span>${BANK_NAME.split(' ').slice(1).join(' ')}</span></div>
        <div class="bank-meta">${BANK_ADDR}<br/>IFSC: ${BANK_IFSC} &nbsp;|&nbsp; ${BANK_EMAIL}</div>
      </div>
      <div class="invoice-title">
        <h1>Invoice</h1>
        <div class="ref">Ref: ${ref}</div>
        <div class="date">${dateStr}</div>
      </div>
    </div>

    <div class="status-bar ${barClass}">
      <span class="status-badge">${status}</span>
      <span class="status-desc">${barDesc}</span>
    </div>

    <div class="amount-block">
      <div>
        <div class="amount-label">Transaction Amount</div>
        <div class="amount-value">${fmt(amount)}</div>
      </div>
      <div class="amount-right">
        <div class="amount-type">${typeLabel}</div>
      </div>
    </div>

    <div class="parties">
      <div class="party-card">
        <div class="party-label">From</div>
        <div class="party-name">${fromName || fromEmail}</div>
        <div class="party-acct">${fromAccountNumber || fromEmail}</div>
      </div>
      <div class="party-card">
        <div class="party-label">To</div>
        <div class="party-name">${toName || toEmail}</div>
        <div class="party-acct">${toAccountNumber || toEmail}</div>
      </div>
    </div>

    <p class="section-title">Transaction Details</p>
    <table class="detail-table">
      <tr class="highlight"><td>Transaction Reference</td><td style="font-family:'IBM Plex Mono',monospace">${ref}</td></tr>
      <tr><td>Transfer Type</td><td>${typeLabel}</td></tr>
      <tr><td>Date &amp; Time</td><td>${dateStr}</td></tr>
      <tr><td>Note / Description</td><td>${note || '—'}</td></tr>
      <tr><td>Amount</td><td>${fmt(amount)}</td></tr>
      <tr><td>Transaction Fee</td><td>₹0.00 (waived)</td></tr>
      <tr class="highlight"><td><strong>Total Deducted</strong></td><td><strong>${fmt(amount)}</strong></td></tr>
    </table>

    <div class="footer">
      <div class="disclaimer">
        This is a computer-generated receipt and does not require a signature.
        ${BANK_NAME} is regulated under applicable banking laws.
        For disputes, contact ${BANK_EMAIL}.
      </div>
      <div class="qr-placeholder">Scan<br/>Verify</div>
    </div>`;

  openPrint(`${BANK_NAME} — Transaction Invoice ${ref}`, html);
};

// ─── Loan Invoice ─────────────────────────────────────────────────────────────
// Call after admin approves or rejects a loan.

export const printLoanInvoice = ({
  loanId,
  customerEmail,
  customerName = '',
  amount,
  tenure,
  purpose  = '',
  status,
  reviewedAt,
}) => {
  const ref      = refId(loanId);
  const dateStr  = fmtDt(reviewedAt);
  const isApproved = status === 'APPROVED';
  const barClass = isApproved ? 'success' : 'error';
  const barDesc  = isApproved
    ? 'Loan approved and amount disbursed to customer account.'
    : 'Loan application was not approved.';

  // Simple EMI estimate (flat rate 10% p.a. for display only)
  const annualRate  = 0.10;
  const monthlyRate = annualRate / 12;
  const emi = tenure > 0
    ? Math.round((amount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
                 (Math.pow(1 + monthlyRate, tenure) - 1))
    : 0;
  const totalRepay = emi * tenure;

  const html = `
    <div class="header">
      <div>
        <div class="bank-name">🏦 ${BANK_NAME.split(' ')[0]}<span>${BANK_NAME.split(' ').slice(1).join(' ')}</span></div>
        <div class="bank-meta">${BANK_ADDR}<br/>IFSC: ${BANK_IFSC} &nbsp;|&nbsp; ${BANK_EMAIL}</div>
      </div>
      <div class="invoice-title">
        <h1>Loan Letter</h1>
        <div class="ref">Ref: ${ref}</div>
        <div class="date">${dateStr}</div>
      </div>
    </div>

    <div class="status-bar ${barClass}">
      <span class="status-badge">${status}</span>
      <span class="status-desc">${barDesc}</span>
    </div>

    <div class="amount-block">
      <div>
        <div class="amount-label">Loan Amount ${isApproved ? 'Disbursed' : 'Applied'}</div>
        <div class="amount-value">${fmt(amount)}</div>
      </div>
      <div class="amount-right">
        <div class="amount-type">Tenure: ${tenure} months</div>
        ${isApproved ? `<div class="amount-type" style="margin-top:4px">Est. EMI: ${fmt(emi)}/mo</div>` : ''}
      </div>
    </div>

    <div class="parties">
      <div class="party-card">
        <div class="party-label">Borrower</div>
        <div class="party-name">${customerName || customerEmail}</div>
        <div class="party-acct">${customerEmail}</div>
      </div>
      <div class="party-card">
        <div class="party-label">Lender</div>
        <div class="party-name">${BANK_NAME}</div>
        <div class="party-acct">IFSC: ${BANK_IFSC}</div>
      </div>
    </div>

    <p class="section-title">Loan Details</p>
    <table class="detail-table">
      <tr class="highlight"><td>Loan Reference</td><td style="font-family:'IBM Plex Mono',monospace">${ref}</td></tr>
      <tr><td>Purpose</td><td>${purpose || '—'}</td></tr>
      <tr><td>Principal Amount</td><td>${fmt(amount)}</td></tr>
      <tr><td>Tenure</td><td>${tenure} months</td></tr>
      ${isApproved ? `
      <tr><td>Interest Rate (indicative)</td><td>10% p.a. (flat)</td></tr>
      <tr><td>Estimated Monthly EMI</td><td>${fmt(emi)}</td></tr>
      <tr class="highlight"><td><strong>Estimated Total Repayment</strong></td><td><strong>${fmt(totalRepay)}</strong></td></tr>
      ` : ''}
      <tr><td>Decision Date</td><td>${dateStr}</td></tr>
      <tr><td>Status</td><td>${status}</td></tr>
    </table>

    <div class="footer">
      <div class="disclaimer">
        ${isApproved
          ? `The loan amount of ${fmt(amount)} has been credited to the borrower's account.
             EMI figures are indicative and subject to final agreement. This document serves as a provisional sanction letter.`
          : `This loan application was not approved. Contact ${BANK_EMAIL} for more information.`}
        <br/>This is a computer-generated document. ${BANK_NAME}.
      </div>
      <div class="qr-placeholder">Scan<br/>Verify</div>
    </div>`;

  openPrint(`${BANK_NAME} — Loan ${status} Letter ${ref}`, html);
};