import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Alert, CircularProgress,
  Avatar, Chip, Divider, Dialog, DialogTitle, DialogContent,
  DialogActions, Table, TableBody, TableCell, TableHead, TableRow,
  IconButton, InputAdornment, Tooltip, Paper, MenuItem, Snackbar,
} from '@mui/material';
import { logoutUser }           from '../services/authService';
import { getCustomerProfile, updateKYCDocuments, updateProfile } from '../services/profileService';
import { transferMoney, getTransactions, verifyAccount }  from '../services/transferService';
import { getHubBanks, syncBankToHub, signInToHub, startIncomingListener, startStatusListener} from '../services/hubService';
import { applyLoan, getAllLoans }          from '../services/loanService';
import { sendTransactionEmail }           from '../services/emailService';
import { printTransactionInvoice, printLoanInvoice } from '../services/invoiceService';

import axios from 'axios';
const projectId = process.env.REACT_APP_FIRESTORE_PROJECT_ID;
const apiKey    = process.env.REACT_APP_FIRESTORE_API_KEY;
const API_URL   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
// ─── Tiny SVG icon ─────────────────────────────────────────────────────────────
const Ico = ({ d, size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const EyeIco = ({ open }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {open
      ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
      : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
    }
  </svg>
);

const NAV = [
  { id: 'overview',      label: 'Overview',         icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'kyc',           label: 'KYC Documents',    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
  { id: 'send',          label: 'Send Money',       icon: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z' },
  { id: 'transactions',  label: 'Transactions',     icon: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3' },
  { id: 'loans',         label: 'Loans',            icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { id: 'profile',       label: 'My Profile',       icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' },
];

const Loader = () => (
  <Box sx={{ display:'flex', justifyContent:'center', py:10 }}>
    <CircularProgress sx={{ color:'#10b981' }} />
  </Box>
);

const Empty = ({ msg, icon='📭' }) => (
  <Box sx={{ textAlign:'center', py:8, color:'#94a3b8' }}>
    <Typography sx={{ fontSize:40, mb:1 }}>{icon}</Typography>
    <Typography>{msg}</Typography>
  </Box>
);

const StatCard = ({ label, value, sub, color }) => (
  <Paper elevation={0} sx={{
    p:3, borderRadius:3, flex:1, minWidth:160,
    borderLeft:`4px solid ${color}`,
    boxShadow:'0 1px 6px rgba(0,0,0,0.06)', background:'#fff',
  }}>
    <Typography sx={{ color:'#64748b', fontSize:12, fontWeight:600, mb:0.5, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</Typography>
    <Typography sx={{ fontSize:28, fontWeight:800, color, lineHeight:1.1 }}>{value}</Typography>
    {sub && <Typography sx={{ color:'#94a3b8', fontSize:12, mt:0.5 }}>{sub}</Typography>}
  </Paper>
);

const KYCStatusChip = ({ status }) => {
  const map = {
    PENDING:   { bg:'#f59e0b22', color:'#f59e0b', label:'Pending' },
    SUBMITTED: { bg:'#6366f122', color:'#6366f1', label:'Submitted' },
    APPROVED:  { bg:'#10b98122', color:'#10b981', label:'Verified ✓' },
    REJECTED:  { bg:'#ef444422', color:'#ef4444', label:'Rejected' },
  };
  const s = map[status] || map['PENDING'];
  return <Chip label={s.label} size="small" sx={{ background:s.bg, color:s.color, fontWeight:700, fontSize:11 }} />;
};

function LogoutDialog({ open, onConfirm, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight:700 }}>Sign Out?</DialogTitle>
      <DialogContent><Typography sx={{ color:'#64748b' }}>Are you sure you want to sign out?</Typography></DialogContent>
      <DialogActions sx={{ p:2, gap:1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ textTransform:'none', flex:1 }}>Stay</Button>
        <Button onClick={onConfirm} variant="contained"
          sx={{ textTransform:'none', flex:1, background:'#ef4444', '&:hover':{ background:'#dc2626' } }}>
          Sign Out
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
export default function CustomerDashboard() {
  const navigate   = useNavigate();
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

  const [activeNav,    setActiveNav]    = useState('overview');
  const [profile,      setProfile]      = useState(storedUser);
  const [transactions, setTransactions] = useState([]);
  const [loans,        setLoans]        = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');
  const [logoutOpen,   setLogoutOpen]   = useState(false);
  const [hubBanks,     setHubBanks]     = useState([]);
  const [selectedBank, setSelectedBank] = useState('JGB');
  const [txPopup,      setTxPopup]      = useState(false);

  const [incomingSnack, setIncomingSnack] = useState({ open: false, amount: 0, from: '' });
  const [lastTx,        setLastTx]        = useState(null);

  const fetchProfile = useCallback(async () => {
    if (!storedUser.email) return;
    const r = await getCustomerProfile(storedUser.email);
    if (r.success) setProfile(r.profile);
  }, [storedUser.email]);

  const fetchTransactions = useCallback(async () => {
    if (!storedUser.email) return;
    const r = await getTransactions(storedUser.email);
    if (r.success) setTransactions(r.transactions || []);
  }, [storedUser.email]);

  const fetchLoans = useCallback(async () => {
    if (!storedUser.email) return;
    const r = await getAllLoans();
    if (r.success) setLoans((r.loans || []).filter(l => l.customerId === storedUser.email));
  }, [storedUser.email]);

  const fetchHubBanks = useCallback(async () => {
    const r = await getHubBanks();
    if (r.success) setHubBanks(r.banks || []);
  }, []);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user || user.role !== 'customer' || user.status !== 'APPROVED') {
      navigate('/login', { replace: true });
      return;
    }

    const load = async () => {
      setLoading(true);
      await Promise.all([fetchProfile(), fetchTransactions(), fetchLoans()]);
      setLoading(false);
    };
    load();

    signInToHub().catch(err => console.error('Hub sign-in failed:', err));
    fetchHubBanks();

    const unsubIncoming = startIncomingListener(
      (tx) => {
        setIncomingSnack({ open: true, amount: tx.amount / 100, from: tx.fromBankId || 'external bank' });
        fetchTransactions();
        fetchProfile();
      },
      (tx, err) => console.error('Incoming transfer failed:', err)
    );

    const unsubStatus = startStatusListener(async (tx) => {
        if (tx.transferId) {
            try {
            const matchResp = await axios.post(`${API_URL}:runQuery?key=${apiKey}`, {
                structuredQuery: {
                from: [{ collectionId: 'transactions' }],
                where: { fieldFilter: { field: { fieldPath: 'transferId' }, op: 'EQUAL', value: { stringValue: tx.transferId } } },
                },
            });
            const match = matchResp.data.find(d => d.document);
            if (match) {
                const docId = match.document.name.split('/').pop();
                await axios.patch(
                `${API_URL}/transactions/${docId}?updateMask.fieldPaths=status&updateMask.fieldPaths=completedAt&key=${apiKey}`,
                {
                    fields: {
                    status:      { stringValue: tx.status || 'SUCCESS' },
                    completedAt: { timestampValue: new Date().toISOString() },
                    },
                }
                );
            }
            } catch (e) {
            console.warn('Status update failed:', e.message);
            }
        }
        fetchTransactions();
        });

    return () => { unsubIncoming?.(); unsubStatus?.(); };
  }, [navigate, fetchProfile, fetchTransactions, fetchLoans, fetchHubBanks]);

  const flash = (msg, type='success') => {
    if (type === 'success') { setSuccess(msg); setError(''); }
    else                    { setError(msg);   setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 5000);
  };

  const handleLogout = async () => {
    setLogoutOpen(false);
    await logoutUser();
    navigate('/login', { replace: true });
  };

  const refreshAll = () => { fetchProfile(); fetchTransactions(); fetchLoans(); };

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION: Overview
  // ─────────────────────────────────────────────────────────────────────────
  const renderOverview = () => {
    const totalSent     = transactions.filter(t => t.fromEmail === profile.email || t.fromAccountNumber === profile.accountNumber).reduce((s,t) => s + Number(t.amount||0), 0);
    const totalReceived = transactions.filter(t => t.toEmail   === profile.email || t.toAccountNumber   === profile.accountNumber).reduce((s,t) => s + Number(t.amount||0), 0);
    const activeLoan    = loans.find(l => l.status === 'APPROVED');

    return (
      <Box>
        <Box sx={{ background:'linear-gradient(135deg,#064e3b,#10b981)', borderRadius:4, p:4, mb:4, color:'#fff', position:'relative', overflow:'hidden' }}>
          <Box sx={{ position:'absolute', right:-30, top:-30, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.07)' }} />
          <Typography sx={{ fontSize:13, opacity:0.8, mb:0.5 }}>Available Balance</Typography>
          <Typography sx={{ fontSize:42, fontWeight:900, letterSpacing:-1 }}>
            ₹{Number(profile.accountBalance||0).toLocaleString('en-IN')}
          </Typography>
          <Typography sx={{ opacity:0.75, fontSize:13, mt:1 }}>Account holder: <strong>{profile.name}</strong></Typography>
          <Typography sx={{ opacity:0.75, fontSize:13, mt:0.5 }}>Account Number: <strong>{profile.accountNumber || 'Not assigned'}</strong></Typography>
          <Typography sx={{ opacity:0.6, fontSize:12, mt:0.5 }}>Transfer limit: ₹{Number(profile.transferLimit||10000).toLocaleString('en-IN')} / transaction</Typography>
          <Button variant="contained" onClick={async () => { const r = await syncBankToHub(); r.success ? flash('Synced with hub ✓') : flash(r.error, 'error'); }}
            sx={{ mt:3, textTransform:'none', fontWeight:700, borderRadius:2, background:'#6366f1', '&:hover':{ background:'#4f46e5' } }}>
            Sync Back To Shared Hub
          </Button>
        </Box>

        <Box sx={{ display:'flex', gap:2, flexWrap:'wrap', mb:4 }}>
          <StatCard label="Total Sent"     value={`₹${Number(totalSent).toLocaleString('en-IN')}`}     color="#ef4444" />
          <StatCard label="Total Received" value={`₹${Number(totalReceived).toLocaleString('en-IN')}`} color="#10b981" />
          <StatCard label="Transactions"   value={transactions.length}  color="#6366f1" />
          <StatCard label="Loans"          value={loans.length}         color="#f59e0b"
            sub={activeLoan ? `₹${Number(activeLoan.amount).toLocaleString('en-IN')} active` : 'None active'} />
        </Box>

        {profile.kycStatus !== 'APPROVED' && (
          <Alert severity="warning" sx={{ borderRadius:2, mb:3 }}
            action={<Button size="small" onClick={() => setActiveNav('kyc')} sx={{ textTransform:'none', fontWeight:700 }}>Submit KYC →</Button>}>
            Your KYC documents are <strong>{profile.kycStatus || 'not submitted'}</strong>. Submit your PAN and Aadhaar to unlock all features.
          </Alert>
        )}

        <Typography sx={{ fontWeight:700, fontSize:16, mb:2, color:'#0f172a' }}>Recent Activity</Typography>
        {transactions.length === 0
          ? <Empty msg="No transactions yet. Send money to get started." icon="💸" />
          : (
            <Box sx={{ background:'#fff', borderRadius:3, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
              {transactions.slice(0,5).map(t => {
                const isSent = t.fromEmail === profile.email || t.fromAccountNumber === profile.accountNumber;
                return (
                  <Box key={t.id} sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', px:3, py:2, borderBottom:'1px solid #f1f5f9', '&:last-child':{ borderBottom:'none' } }}>
                    <Box sx={{ display:'flex', alignItems:'center', gap:2 }}>
                      <Box sx={{ width:40, height:40, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background: isSent ? '#ef444415' : '#10b98115' }}>
                        <Typography sx={{ fontSize:18 }}>{isSent ? '↑' : '↓'}</Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontWeight:600, fontSize:14 }}>
                          {isSent ? `To: ${t.toAccountNumber || t.toEmail}` : `From: ${t.fromAccountNumber || t.fromEmail}`}
                        </Typography>
                        <Typography sx={{ color:'#94a3b8', fontSize:12 }}>
                          {t.note || 'Transfer'} · {t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-IN') : ''}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                      <Typography sx={{ fontWeight:800, fontSize:16, color: isSent ? '#ef4444' : '#10b981' }}>
                        {isSent ? '−' : '+'}₹{Number(t.amount).toLocaleString('en-IN')}
                      </Typography>
                      <Tooltip title="Print invoice">
                        <IconButton size="small" onClick={() => printTransactionInvoice({ ...t, fromName: isSent ? profile.name : '', toName: isSent ? '' : profile.name })}>
                          🖨️
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                );
              })}
              {transactions.length > 5 && (
                <Box sx={{ p:2, textAlign:'center' }}>
                  <Button size="small" onClick={() => setActiveNav('transactions')} sx={{ textTransform:'none', color:'#6366f1', fontWeight:600 }}>
                    View all {transactions.length} transactions →
                  </Button>
                </Box>
              )}
            </Box>
          )}
      </Box>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION: KYC
  // ─────────────────────────────────────────────────────────────────────────
  const KYCSection = () => {
    const [pan,         setPan]         = useState(profile.pan      || '');
    const [aadhaar,     setAadhaar]     = useState(profile.aadhaar  || '');
    const [passport,    setPassport]    = useState(profile.passport || '');
    const [saving,      setSaving]      = useState(false);
    const [showAadhaar, setShowAadhaar] = useState(false);

    const handleSave = async () => {
      if (!pan.trim()) { flash('PAN number is required.', 'error'); return; }
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase())) { flash('Invalid PAN format. Example: ABCDE1234F', 'error'); return; }
      setSaving(true);
      const r = await updateKYCDocuments(profile.email, { pan, aadhaar, passport });
      setSaving(false);
      if (r.success) { flash('KYC documents submitted for review!'); fetchProfile(); }
      else           flash(r.error, 'error');
    };

    const statusMap = {
      APPROVED: { bg:'#10b98112', border:'#10b98130', icon:'✅', desc:'Your identity has been verified. You can resubmit if your documents have changed.' },
      SUBMITTED:{ bg:'#6366f112', border:'#6366f130', icon:'⏳', desc:'Your documents are under review. You may resubmit with updated information.' },
      REJECTED: { bg:'#ef444412', border:'#ef444430', icon:'❌', desc:'Your submission was rejected. Please correct your documents and resubmit.' },
      PENDING:  { bg:'#f59e0b12', border:'#f59e0b30', icon:'📋', desc:'Please submit at least PAN to proceed.' },
    };
    const sm = statusMap[profile.kycStatus] || statusMap['PENDING'];

    return (
      <Box>
        <Typography variant="h5" sx={{ fontWeight:800, color:'#0f172a' }}>KYC Documents</Typography>
        <Typography sx={{ color:'#64748b', mt:0.5, mb:4 }}>Submit or update your government-issued identity documents for verification.</Typography>

        <Box sx={{ background: sm.bg, border:`1px solid ${sm.border}`, borderRadius:3, p:3, mb:4, display:'flex', alignItems:'center', gap:2 }}>
          <Typography sx={{ fontSize:32 }}>{sm.icon}</Typography>
          <Box>
            <Typography sx={{ fontWeight:700, color:'#0f172a' }}>
              KYC Status: <KYCStatusChip status={profile.kycStatus || 'PENDING'} />
            </Typography>
            <Typography sx={{ color:'#64748b', fontSize:13, mt:0.5 }}>{sm.desc}</Typography>
          </Box>
        </Box>

        <Box sx={{ background:'#fff', borderRadius:3, p:4, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <Typography sx={{ fontWeight:700, fontSize:16, mb:3, color:'#0f172a' }}>Identity Documents</Typography>

          <Box sx={{ mb:3 }}>
            <Typography sx={{ fontWeight:600, fontSize:13, color:'#374151', mb:1 }}>
              PAN Card Number <span style={{ color:'#ef4444' }}>*</span>
            </Typography>
            <TextField fullWidth placeholder="ABCDE1234F" value={pan}
              onChange={e => setPan(e.target.value.toUpperCase())}
              inputProps={{ maxLength:10, style:{ fontFamily:'monospace', letterSpacing:2, fontSize:16 } }}
              helperText="Required — 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)" />
          </Box>

          <Box sx={{ mb:3 }}>
            <Typography sx={{ fontWeight:600, fontSize:13, color:'#374151', mb:1 }}>Aadhaar Card Number</Typography>
            <TextField fullWidth placeholder="123456789012" type={showAadhaar ? 'text' : 'password'}
              value={aadhaar} onChange={e => setAadhaar(e.target.value.replace(/\D/g,'').slice(0,12))}
              inputProps={{ maxLength:12, style:{ fontFamily:'monospace', letterSpacing:2, fontSize:16 } }}
              helperText="12-digit Aadhaar number (digits only)"
              InputProps={{ endAdornment:(
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowAadhaar(v=>!v)} edge="end" size="small">
                    <EyeIco open={showAadhaar} />
                  </IconButton>
                </InputAdornment>
              )}} />
          </Box>

          <Box sx={{ mb:4 }}>
            <Typography sx={{ fontWeight:600, fontSize:13, color:'#374151', mb:1 }}>
              Passport Number <span style={{ color:'#94a3b8', fontWeight:400 }}>(optional)</span>
            </Typography>
            <TextField fullWidth placeholder="A1234567" value={passport}
              onChange={e => setPassport(e.target.value.toUpperCase())}
              inputProps={{ maxLength:12, style:{ fontFamily:'monospace', letterSpacing:2 } }} />
          </Box>

          <Button variant="contained" onClick={handleSave} disabled={saving}
            sx={{ textTransform:'none', fontWeight:700, px:4, py:1.5,
              background:'linear-gradient(135deg,#10b981,#059669)',
              '&:hover':{ background:'linear-gradient(135deg,#059669,#047857)' } }}>
            {saving ? <CircularProgress size={20} sx={{ color:'#fff' }} /> : (
              profile.kycStatus === 'APPROVED' ? 'Resubmit KYC Documents' : 'Submit KYC Documents'
            )}
          </Button>
        </Box>

        <Box sx={{ background:'#f8fafc', borderRadius:3, p:3, mt:3 }}>
          <Typography sx={{ fontWeight:700, fontSize:14, mb:2, color:'#374151' }}>Accepted Documents</Typography>
          {[
            ['PAN Card',     'Required — 5 letters + 4 digits + 1 letter'],
            ['Aadhaar Card', 'Government-issued 12-digit unique identity number'],
            ['Passport',     'Optional additional identity proof'],
          ].map(([doc, desc]) => (
            <Box key={doc} sx={{ display:'flex', gap:2, mb:1.5 }}>
              <Typography sx={{ color:'#10b981', fontWeight:700, minWidth:16 }}>✓</Typography>
              <Box>
                <Typography sx={{ fontWeight:600, fontSize:13 }}>{doc}</Typography>
                <Typography sx={{ color:'#64748b', fontSize:12 }}>{desc}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION: Send Money — with account verification before confirm step
  // ─────────────────────────────────────────────────────────────────────────
  const SendMoneySection = () => {
    const [toAccountNumber, setToAccountNumber] = useState('');
    const [amount,          setAmount]          = useState('');
    const [note,            setNote]            = useState('');
    const [step,            setStep]            = useState('form');   // 'form' | 'confirm' | 'success'
    const [sending,         setSending]         = useState(false);
    const [verifying,       setVerifying]       = useState(false);   // ← NEW: verifying account
    const [verifiedName,    setVerifiedName]    = useState('');      // ← NEW: confirmed account holder name
    const [localErr,        setLocalErr]        = useState('');
    const [completedTx,     setCompletedTx]     = useState(null);

    const validateForm = () => {
      setLocalErr('');
      if (!toAccountNumber.trim())                         { setLocalErr('Recipient account number is required.'); return false; }
      if (!amount || isNaN(amount))                        { setLocalErr('Enter a valid amount.'); return false; }
      if (Number(amount) <= 0)                             { setLocalErr('Amount must be greater than ₹0.'); return false; }
      if (Number(amount) > (profile.transferLimit||10000)) { setLocalErr(`Amount exceeds your transfer limit of ₹${Number(profile.transferLimit||10000).toLocaleString('en-IN')}.`); return false; }
      if (Number(amount) > (profile.accountBalance||0))   { setLocalErr('Insufficient balance.'); return false; }
      return true;
    };

    // ── NEW: verify account exists, then move to confirm ──────────────────
    const handleReview = async () => {
      if (!validateForm()) return;

      setVerifying(true);
      setLocalErr('');
      setVerifiedName('');

      const bankId = selectedBank || 'JGB';
      const result = await verifyAccount({ accountNumber: toAccountNumber.trim(), bankId });

      setVerifying(false);

      if (!result.exists) {
        setLocalErr(result.error || 'Account not found. Please check the account number.');
        return;
      }

      // Account verified — store the name (if returned) and advance
      setVerifiedName(result.accountName || '');
      setStep('confirm');
    };

    const handleSend = async () => {
      setSending(true);
      let r;

      if (selectedBank === 'JGB') {
        r = await transferMoney({ fromEmail: profile.email, toAccountNumber: toAccountNumber.trim(), amount: Number(amount), note: note.trim() });
      } else {
        const { interbankTransfer } = await import('../services/transferService');
        r = await interbankTransfer({ fromEmail: profile.email, toAccountNumber: toAccountNumber.trim(), toBankId: selectedBank, amount: Number(amount), note: note.trim() });
      }

      setSending(false);

      if (r.success) {
        const txData = {
          transferId:        r.transferId || '',
          fromEmail:         profile.email,
          toEmail:           '',
          fromAccountNumber: profile.accountNumber || '',
          toAccountNumber:   toAccountNumber.trim(),
          amount:            Number(amount),
          note:              note.trim(),
          type:              selectedBank === 'JGB' ? 'INTERNAL' : 'INTERBANK',
          status:            'SUCCESS',
          createdAt:         new Date().toISOString(),
        };

        setCompletedTx(txData);
        setLastTx(txData);
        setStep('success');
        setTxPopup(true);
        refreshAll();

        sendTransactionEmail(txData)
          .catch(err => console.warn('[CustomerDashboard] Email failed:', err.message));

        setTimeout(() => setTxPopup(false), 3000);
      } else {
        setLocalErr(r.error || 'Transfer failed.');
        setStep('form');
      }
    };

    if (step === 'success' && completedTx) return (
      <Box sx={{ textAlign:'center', py:6 }}>
        <Typography sx={{ fontSize:72, mb:2 }}>✅</Typography>
        <Typography variant="h5" sx={{ fontWeight:800, color:'#0f172a', mb:1 }}>Money Sent!</Typography>
        <Typography sx={{ color:'#64748b', mb:1 }}>
          ₹{Number(amount).toLocaleString('en-IN')} sent to <strong>{toAccountNumber}</strong>
        </Typography>
        <Typography sx={{ color:'#94a3b8', fontSize:13, mb:4 }}>
          New balance: ₹{Number((profile.accountBalance||0) - Number(amount)).toLocaleString('en-IN')}
        </Typography>
        <Box sx={{ display:'flex', gap:2, justifyContent:'center', flexWrap:'wrap' }}>
          <Button variant="contained"
            onClick={() => { setStep('form'); setToAccountNumber(''); setAmount(''); setNote(''); setVerifiedName(''); setCompletedTx(null); }}
            sx={{ textTransform:'none', fontWeight:700, background:'linear-gradient(135deg,#10b981,#059669)', '&:hover':{ background:'linear-gradient(135deg,#059669,#047857)' } }}>
            Send Another
          </Button>
          <Button variant="outlined" onClick={() => printTransactionInvoice({ ...completedTx, fromName: profile.name })}
            sx={{ textTransform:'none', fontWeight:700 }}>
            🖨️ Print Invoice
          </Button>
          <Button onClick={() => setActiveNav('transactions')} sx={{ textTransform:'none', color:'#6366f1', fontWeight:600 }}>
            View Transactions →
          </Button>
        </Box>
      </Box>
    );

    return (
      <Box>
        <Typography variant="h5" sx={{ fontWeight:800, color:'#0f172a' }}>Send Money</Typography>
        <Typography sx={{ color:'#64748b', mt:0.5, mb:4 }}>Transfer funds instantly to any connected bank account.</Typography>

        <Box sx={{ display:'inline-flex', alignItems:'center', gap:1.5, background:'#10b98112', border:'1px solid #10b98130', borderRadius:99, px:3, py:1, mb:4 }}>
          <Typography sx={{ color:'#10b981', fontWeight:700, fontSize:14 }}>Available: ₹{Number(profile.accountBalance||0).toLocaleString('en-IN')}</Typography>
          <Typography sx={{ color:'#94a3b8', fontSize:12 }}>| Limit: ₹{Number(profile.transferLimit||10000).toLocaleString('en-IN')}</Typography>
        </Box>

        <Box sx={{ background:'#fff', borderRadius:3, p:4, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', maxWidth:520 }}>
          {localErr && <Alert severity="error" sx={{ mb:3, borderRadius:2 }} onClose={() => setLocalErr('')}>{localErr}</Alert>}

          {step === 'form' && (
            <>
              <TextField select fullWidth margin="normal" label="Destination Bank" value={selectedBank} onChange={e => setSelectedBank(e.target.value)}>
                <MenuItem value="">Select Bank</MenuItem>
                {hubBanks.map(bank => <MenuItem key={bank.bankId} value={bank.bankId}>{bank.bankName}</MenuItem>)}
              </TextField>

              <TextField
                label="Recipient's Account Number" fullWidth margin="normal" required
                value={toAccountNumber}
                onChange={e => { setToAccountNumber(e.target.value); setVerifiedName(''); setLocalErr(''); }}
                placeholder="202605194521"
                // ── Show a green tick + name once verified ──
                InputProps={verifiedName ? {
                  endAdornment: (
                    <InputAdornment position="end">
                      <Box sx={{ display:'flex', alignItems:'center', gap:0.5, color:'#10b981' }}>
                        <Typography sx={{ fontSize:16 }}>✓</Typography>
                        <Typography sx={{ fontSize:12, fontWeight:600 }}>{verifiedName}</Typography>
                      </Box>
                    </InputAdornment>
                  ),
                } : undefined}
              />

              <TextField label="Amount (₹)" fullWidth margin="normal" required value={amount} onChange={e => setAmount(e.target.value)} type="number"
                inputProps={{ min:1, max: profile.transferLimit||10000 }}
                helperText={`Max per transaction: ₹${Number(profile.transferLimit||10000).toLocaleString('en-IN')}`} />

              <TextField label="Note (optional)" fullWidth margin="normal" value={note} onChange={e => setNote(e.target.value)} placeholder="Rent, dinner, etc." inputProps={{ maxLength:100 }} />

              <Button
                variant="contained" fullWidth onClick={handleReview} disabled={verifying}
                sx={{ mt:3, py:1.6, textTransform:'none', fontWeight:700, fontSize:16, borderRadius:2, background:'linear-gradient(135deg,#10b981,#059669)', '&:hover':{ background:'linear-gradient(135deg,#059669,#047857)' } }}>
                {verifying
                  ? <><CircularProgress size={18} sx={{ color:'#fff', mr:1 }} /> Verifying account…</>
                  : 'Review Transfer →'
                }
              </Button>
            </>
          )}

          {step === 'confirm' && (
            <Box>
              <Typography sx={{ fontWeight:700, fontSize:16, mb:3, color:'#0f172a' }}>Confirm Transfer Details</Typography>

              {/* ── Show verified account name prominently if available ── */}
              {verifiedName && (
                <Box sx={{ background:'#10b98112', border:'1px solid #10b98130', borderRadius:2, px:2.5, py:1.5, mb:3, display:'flex', alignItems:'center', gap:1 }}>
                  <Typography sx={{ fontSize:18 }}>✅</Typography>
                  <Box>
                    <Typography sx={{ color:'#10b981', fontWeight:700, fontSize:13 }}>Account Verified</Typography>
                    <Typography sx={{ color:'#064e3b', fontSize:13 }}>Sending to: <strong>{verifiedName}</strong></Typography>
                  </Box>
                </Box>
              )}

              {[
                ['From',             profile.email],
                ['Destination Bank', selectedBank],
                ['To Account',       toAccountNumber],
                ['Account Holder',   verifiedName || '—'],
                ['Amount',           `₹${Number(amount).toLocaleString('en-IN')}`],
                ['Note',             note||'—'],
              ].map(([k, v]) => (
                <Box key={k} sx={{ display:'flex', justifyContent:'space-between', py:1.5, borderBottom:'1px solid #f1f5f9' }}>
                  <Typography sx={{ color:'#64748b', fontSize:14 }}>{k}</Typography>
                  <Typography sx={{ fontWeight:700, fontSize:14, color:'#0f172a' }}>{v}</Typography>
                </Box>
              ))}

              <Box sx={{ display:'flex', gap:2, mt:4 }}>
                <Button variant="outlined" fullWidth onClick={() => setStep('form')} sx={{ textTransform:'none', py:1.4, fontWeight:600 }}>Edit</Button>
                <Button variant="contained" fullWidth onClick={handleSend} disabled={sending}
                  sx={{ textTransform:'none', py:1.4, fontWeight:700, background:'linear-gradient(135deg,#10b981,#059669)', '&:hover':{ background:'linear-gradient(135deg,#059669,#047857)' } }}>
                  {sending ? <CircularProgress size={20} sx={{ color:'#fff' }} /> : `Confirm & Send ₹${Number(amount).toLocaleString('en-IN')}`}
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION: Transactions
  // ─────────────────────────────────────────────────────────────────────────
  const TransactionsSection = () => {
    const [filter, setFilter] = useState('ALL');
    const filtered = transactions.filter(t => {
      if (filter === 'SENT')     return t.fromEmail === profile.email || t.fromAccountNumber === profile.accountNumber;
      if (filter === 'RECEIVED') return t.toEmail   === profile.email || t.toAccountNumber   === profile.accountNumber;
      return true;
    });

    return (
      <Box>
        <Typography variant="h5" sx={{ fontWeight:800, color:'#0f172a' }}>Transaction History</Typography>
        <Typography sx={{ color:'#64748b', mt:0.5, mb:3 }}>All your past transfers and payments.</Typography>

        <Box sx={{ display:'flex', gap:1, mb:3 }}>
          {['ALL','SENT','RECEIVED'].map(f => (
            <Chip key={f} label={f} onClick={() => setFilter(f)} clickable
              sx={{ fontWeight:700, fontSize:12, background: filter===f ? '#10b981' : '#f1f5f9', color: filter===f ? '#fff' : '#64748b' }} />
          ))}
        </Box>

        {filtered.length === 0
          ? <Empty msg="No transactions to show." icon="💸" />
          : (
            <Box sx={{ background:'#fff', borderRadius:3, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    {['Type','From / To','Amount (₹)','Note','Date','Status','Invoice'].map(h => (
                      <TableCell key={h} sx={{ fontWeight:700, color:'#64748b', background:'#f8fafc', fontSize:12 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map(t => {
                    const isSent = t.fromEmail === profile.email || t.fromAccountNumber === profile.accountNumber;
                    return (
                      <TableRow key={t.id} sx={{ '&:hover':{ background:'#f8fafc' } }}>
                        <TableCell>
                          <Box sx={{ width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background: isSent ? '#ef444415' : '#10b98115' }}>
                            <Typography sx={{ fontSize:14 }}>{isSent?'↑':'↓'}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize:13, color:'#374151' }}>{isSent ? (t.toAccountNumber||t.toEmail) : (t.fromAccountNumber||t.fromEmail)}</TableCell>
                        <TableCell sx={{ fontWeight:700, fontSize:15, color: isSent ? '#ef4444' : '#10b981' }}>
                          {isSent?'−':'+'}₹{Number(t.amount).toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell sx={{ color:'#94a3b8', fontSize:12 }}>{t.note||'—'}</TableCell>
                        <TableCell sx={{ color:'#94a3b8', fontSize:12 }}>{t.createdAt ? new Date(t.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}) : '—'}</TableCell>
                        <TableCell>
                          <Chip label={t.status||'SUCCESS'} size="small"
                            sx={{ background: t.status==='FAILED' ? '#ef444420' : t.status==='PENDING' ? '#f59e0b20' : '#10b98120', color: t.status==='FAILED' ? '#ef4444' : t.status==='PENDING' ? '#f59e0b' : '#10b981', fontWeight:700, fontSize:11 }} />
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Print Invoice">
                            <IconButton size="small" onClick={() => printTransactionInvoice({ ...t, fromName: isSent ? profile.name : '', toName: isSent ? '' : profile.name })}>
                              🖨️
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
      </Box>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION: Loans
  // ─────────────────────────────────────────────────────────────────────────
  const LoansSection = () => {
    const [showForm, setShowForm] = useState(false);
    const [amount,   setAmount]   = useState('');
    const [purpose,  setPurpose]  = useState('');
    const [tenure,   setTenure]   = useState('12');
    const [applying, setApplying] = useState(false);
    const [localErr, setLocalErr] = useState('');

    const handleApply = async () => {
      setLocalErr('');
      if (!amount || Number(amount) <= 0) { setLocalErr('Enter a valid loan amount.'); return; }
      if (!purpose.trim())                { setLocalErr('Please describe the purpose.'); return; }
      if (!tenure || Number(tenure) <= 0) { setLocalErr('Enter a valid tenure in months.'); return; }
      setApplying(true);
      const r = await applyLoan({ customerId: profile.email, amount: Number(amount), purpose, tenure: Number(tenure) });
      setApplying(false);
      if (r.success) { flash('Loan application submitted!'); setShowForm(false); setAmount(''); setPurpose(''); setTenure('12'); fetchLoans(); }
      else setLocalErr(r.error || 'Application failed.');
    };

    const SC = { PENDING:'#f59e0b', APPROVED:'#10b981', REJECTED:'#ef4444' };

    return (
      <Box>
        <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', mb:4 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight:800, color:'#0f172a' }}>Loans</Typography>
            <Typography sx={{ color:'#64748b', mt:0.5 }}>Apply for and manage your loans.</Typography>
          </Box>
          {!showForm && (
            <Button variant="contained" onClick={() => setShowForm(true)}
              sx={{ textTransform:'none', fontWeight:700, background:'linear-gradient(135deg,#10b981,#059669)', '&:hover':{ background:'linear-gradient(135deg,#059669,#047857)' } }}>
              + Apply for Loan
            </Button>
          )}
        </Box>

        {showForm && (
          <Box sx={{ background:'#fff', borderRadius:3, p:4, mb:4, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', maxWidth:520 }}>
            <Typography sx={{ fontWeight:700, fontSize:16, mb:3 }}>New Loan Application</Typography>
            {localErr && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{localErr}</Alert>}
            <TextField label="Loan Amount (₹)" type="number" fullWidth margin="normal" value={amount} onChange={e => setAmount(e.target.value)} inputProps={{ min:1000 }} helperText="Minimum loan amount: ₹1,000" />
            <TextField label="Tenure (months)" type="number" fullWidth margin="normal" value={tenure} onChange={e => setTenure(e.target.value)} inputProps={{ min:1, max:360 }} />
            <TextField label="Purpose / Reason" fullWidth margin="normal" multiline rows={3} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Home renovation, medical, education, etc." />
            <Box sx={{ display:'flex', gap:2, mt:3 }}>
              <Button variant="outlined" onClick={() => setShowForm(false)} sx={{ textTransform:'none', flex:1 }}>Cancel</Button>
              <Button variant="contained" onClick={handleApply} disabled={applying}
                sx={{ textTransform:'none', flex:2, fontWeight:700, background:'linear-gradient(135deg,#10b981,#059669)', '&:hover':{ background:'linear-gradient(135deg,#059669,#047857)' } }}>
                {applying ? <CircularProgress size={20} sx={{ color:'#fff' }} /> : 'Submit Application'}
              </Button>
            </Box>
          </Box>
        )}

        {loans.length === 0
          ? <Empty msg="No loan applications yet." icon="🏦" />
          : (
            <Box sx={{ display:'flex', flexDirection:'column', gap:2 }}>
              {loans.map(l => (
                <Box key={l.id} sx={{ background:'#fff', borderRadius:3, p:3, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', borderLeft:`4px solid ${SC[l.status]||'#94a3b8'}` }}>
                  <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <Box>
                      <Typography sx={{ fontWeight:700, fontSize:18, color:'#0f172a' }}>₹{Number(l.amount).toLocaleString('en-IN')}</Typography>
                      <Typography sx={{ color:'#64748b', fontSize:13, mt:0.5 }}>{l.purpose||'No purpose'} · {l.tenure} months</Typography>
                      <Typography sx={{ color:'#94a3b8', fontSize:12, mt:0.5 }}>Applied: {l.appliedAt ? new Date(l.appliedAt).toLocaleDateString('en-IN') : '—'}</Typography>
                    </Box>
                    <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                      <Chip label={l.status} size="small" sx={{ background:`${SC[l.status]||'#94a3b8'}20`, color: SC[l.status]||'#64748b', fontWeight:700 }} />
                      {(l.status === 'APPROVED' || l.status === 'REJECTED') && (
                        <Tooltip title="Print loan letter">
                          <IconButton size="small" onClick={() => printLoanInvoice({ ...l, loanId: l.id, customerEmail: profile.email, customerName: profile.name, reviewedAt: l.reviewedAt || l.appliedAt })}>
                            🖨️
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
      </Box>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION: Profile
  // ─────────────────────────────────────────────────────────────────────────
  const ProfileSection = () => {
    const [name,     setName]     = useState(profile.name  || '');
    const [phone,    setPhone]    = useState(profile.phone || '');
    const [saving,   setSaving]   = useState(false);
    const [localErr, setLocalErr] = useState('');

    const handleSave = async () => {
      setLocalErr('');
      if (!name.trim()) { setLocalErr('Name cannot be empty.'); return; }
      setSaving(true);
      const r = await updateProfile(profile.email, { name: name.trim(), phone: phone.trim() });
      setSaving(false);
      if (r.success) { flash('Profile updated!'); fetchProfile(); }
      else setLocalErr(r.error);
    };

    return (
      <Box>
        <Typography variant="h5" sx={{ fontWeight:800, color:'#0f172a' }}>My Profile</Typography>
        <Typography sx={{ color:'#64748b', mt:0.5, mb:4 }}>Manage your personal information.</Typography>
        <Box sx={{ background:'linear-gradient(135deg,#064e3b,#10b981)', borderRadius:3, p:4, mb:4, display:'flex', alignItems:'center', gap:3 }}>
          <Avatar sx={{ width:72, height:72, fontSize:28, fontWeight:800, background:'rgba(255,255,255,0.2)', color:'#fff' }}>{(profile.name||'U')[0].toUpperCase()}</Avatar>
          <Box>
            <Typography sx={{ color:'#fff', fontWeight:800, fontSize:20 }}>{profile.name}</Typography>
            <Typography sx={{ color:'rgba(255,255,255,0.75)', fontSize:13 }}>{profile.email}</Typography>
            <Box sx={{ display:'flex', gap:1, mt:1 }}>
              <KYCStatusChip status={profile.kycStatus||'PENDING'} />
              <Chip label={profile.status} size="small" sx={{ background:'rgba(255,255,255,0.2)', color:'#fff', fontWeight:700, fontSize:11 }} />
            </Box>
          </Box>
        </Box>
        <Box sx={{ background:'#fff', borderRadius:3, p:4, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', maxWidth:480 }}>
          <Typography sx={{ fontWeight:700, fontSize:16, mb:3 }}>Edit Information</Typography>
          {localErr && <Alert severity="error" sx={{ mb:2, borderRadius:2 }}>{localErr}</Alert>}
          <TextField label="Full Name"    fullWidth margin="normal" value={name}  onChange={e => setName(e.target.value)} />
          <TextField label="Phone Number" fullWidth margin="normal" value={phone} onChange={e => setPhone(e.target.value)} inputProps={{ maxLength:15 }} />
          <TextField label="Email"        fullWidth margin="normal" value={profile.email} disabled />
          <Button variant="contained" onClick={handleSave} disabled={saving}
            sx={{ mt:3, textTransform:'none', fontWeight:700, px:4, py:1.4, background:'linear-gradient(135deg,#10b981,#059669)', '&:hover':{ background:'linear-gradient(135deg,#059669,#047857)' } }}>
            {saving ? <CircularProgress size={20} sx={{ color:'#fff' }} /> : 'Save Changes'}
          </Button>
        </Box>
        <Box sx={{ background:'#f8fafc', borderRadius:3, p:3, mt:3, maxWidth:480 }}>
          <Typography sx={{ fontWeight:700, fontSize:14, mb:2, color:'#374151' }}>Account Information</Typography>
          {[
            ['Account ID',      profile.uid||'—'],
            ['Account Number',  profile.accountNumber||'—'],
            ['Account Balance', `₹${Number(profile.accountBalance||0).toLocaleString('en-IN')}`],
            ['Transfer Limit',  `₹${Number(profile.transferLimit||10000).toLocaleString('en-IN')} / txn`],
            ['Member Since',    profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN') : '—'],
          ].map(([k,v]) => (
            <Box key={k} sx={{ display:'flex', justifyContent:'space-between', py:1.2, borderBottom:'1px solid #e2e8f0', '&:last-child':{ borderBottom:'none' } }}>
              <Typography sx={{ color:'#64748b', fontSize:13 }}>{k}</Typography>
              <Typography sx={{ fontWeight:600, fontSize:13, color:'#0f172a', fontFamily: k==='Account ID'||k==='Account Number' ? 'monospace' : 'inherit' }}>{v}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  if (loading) return <Loader />;

  return (
    <Box sx={{ display:'flex', minHeight:'100vh', background:'#f1f5f9' }}>

      {/* SIDEBAR */}
      <Box sx={{ width:240, background:'#0a1628', color:'#fff', p:3, display:'flex', flexDirection:'column', flexShrink:0 }}>
        <Typography sx={{ fontSize:20, fontWeight:900, mb:0.5, letterSpacing:-0.5 }}>🏦 JGBank</Typography>
        <Typography sx={{ fontSize:11, color:'#475569', mb:4, fontWeight:600, textTransform:'uppercase', letterSpacing:1 }}>Customer Portal</Typography>
        {NAV.map(item => (
          <Box key={item.id} onClick={() => setActiveNav(item.id)}
            sx={{ p:1.5, borderRadius:2, mb:0.5, cursor:'pointer', display:'flex', alignItems:'center', gap:1.5, background: activeNav===item.id ? '#10b981' : 'transparent', '&:hover':{ background: activeNav===item.id ? '#10b981' : '#1e293b' }, transition:'background 0.15s' }}>
            <Typography sx={{ fontWeight: activeNav===item.id ? 700 : 500, fontSize:14 }}>{item.label}</Typography>
            {item.id==='kyc' && profile.kycStatus !== 'APPROVED' && (
              <Box sx={{ ml:'auto', width:8, height:8, borderRadius:'50%', background:'#f59e0b' }} />
            )}
          </Box>
        ))}
        <Box sx={{ flex:1 }} />
        <Divider sx={{ borderColor:'#1e293b', mb:2 }} />
        <Box sx={{ display:'flex', alignItems:'center', gap:1.5, mb:2 }}>
          <Avatar sx={{ width:32, height:32, background:'#10b981', fontSize:14, fontWeight:700 }}>{(profile.name||'U')[0].toUpperCase()}</Avatar>
          <Box sx={{ overflow:'hidden' }}>
            <Typography sx={{ fontSize:13, fontWeight:600, color:'#e2e8f0', lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile.name||'Customer'}</Typography>
            <Typography sx={{ fontSize:11, color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile.email}</Typography>
          </Box>
        </Box>
        <Button onClick={() => setLogoutOpen(true)} fullWidth sx={{ background:'#ef444415', color:'#ef4444', fontWeight:700, textTransform:'none', borderRadius:2, '&:hover':{ background:'#ef444428' } }}>Sign Out</Button>
      </Box>

      {/* MAIN */}
      <Box sx={{ flex:1, p:4, overflow:'auto' }}>
        <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:4 }}>
          <Typography sx={{ fontWeight:800, fontSize:22, color:'#0f172a' }}>{NAV.find(n => n.id===activeNav)?.label||'Dashboard'}</Typography>
          <Box sx={{ display:'flex', alignItems:'center', gap:2 }}>
            <Box sx={{ background:'#10b98115', border:'1px solid #10b98130', borderRadius:99, px:2.5, py:0.8 }}>
              <Typography sx={{ color:'#10b981', fontWeight:700, fontSize:13 }}>₹{Number(profile.accountBalance||0).toLocaleString('en-IN')}</Typography>
            </Box>
            <Avatar sx={{ background:'#10b981', fontWeight:700, width:36, height:36, fontSize:15 }}>{(profile.name||'U')[0].toUpperCase()}</Avatar>
          </Box>
        </Box>

        {error   && <Alert severity="error"   sx={{ mb:3, borderRadius:2 }} onClose={()=>setError('')}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb:3, borderRadius:2 }} onClose={()=>setSuccess('')}>{success}</Alert>}

        {activeNav==='overview'     && renderOverview()}
        {activeNav==='kyc'          && <KYCSection />}
        {activeNav==='send'         && <SendMoneySection />}
        {activeNav==='transactions' && <TransactionsSection />}
        {activeNav==='loans'        && <LoansSection />}
        {activeNav==='profile'      && <ProfileSection />}
      </Box>

      {/* Transaction success popup */}
      <Dialog open={txPopup} onClose={() => setTxPopup(false)} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign:'center', py:5 }}>
          <Typography sx={{ fontSize:64 }}>✅</Typography>
          <Typography sx={{ fontSize:24, fontWeight:800, mt:2, color:'#10b981' }}>Transaction Successful</Typography>
          <Typography sx={{ color:'#64748b', mt:1 }}>Your money transfer was completed successfully.</Typography>
          <Box sx={{ display:'flex', gap:2, mt:3, justifyContent:'center' }}>
            <Button variant="outlined" onClick={() => { setTxPopup(false); if (lastTx) printTransactionInvoice({ ...lastTx, fromName: profile.name }); }}
              sx={{ textTransform:'none', fontWeight:600 }}>🖨️ Print Invoice</Button>
            <Button variant="contained" onClick={() => setTxPopup(false)} sx={{ textTransform:'none', background:'#10b981' }}>Close</Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Incoming transfer notification toast */}
      <Snackbar
        open={incomingSnack.open}
        autoHideDuration={6000}
        onClose={() => setIncomingSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert onClose={() => setIncomingSnack(s => ({ ...s, open: false }))} severity="success" sx={{ width:'100%', fontWeight:600 }}>
          💸 You received ₹{Number(incomingSnack.amount).toLocaleString('en-IN')} from {incomingSnack.from}!
        </Alert>
      </Snackbar>

      <LogoutDialog open={logoutOpen} onConfirm={handleLogout} onClose={() => setLogoutOpen(false)} />
    </Box>
  );
}