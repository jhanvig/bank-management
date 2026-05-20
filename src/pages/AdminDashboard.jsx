import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Table, TableBody, TableCell,
  TableHead, TableRow, Chip, Avatar, CircularProgress,
  Alert, Tooltip, Badge, Divider, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, IconButton,
  Paper,Card,CardContent,
} from '@mui/material';
import {
  getAllLoans,
  approveLoan,
  rejectLoan
} from '../services/loanService';
import { printTransactionInvoice, printLoanInvoice } from '../services/invoiceService';
import { logoutUser, requireRole } from '../services/authService';
import { getPendingCustomers, getAllCustomers, approveCustomer, holdCustomer, rejectCustomer, updateTransferLimit } from '../services/userService';
import { getBanks, createBank, updateBank, deleteBank } from '../services/bankService';
import { getAuditLogs } from '../services/auditService';
import { getAllKYC, approveKYC, rejectKYC } from '../services/kycService';
import { updateProfile, updateKYCStatus } from '../services/profileService';// FIX 3: needed to sync kycStatus on user record

// ─── SVG icon helper ──────────────────────────────────────────────────────────
const Ico = ({ path, size = 18, color = 'currentColor', extra = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />{extra && <path d={extra} />}
  </svg>
);

// ─── Sidebar nav items ────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview',   label: 'Overview',           icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'customers',  label: 'Customer Requests',  icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
  { id: 'allUsers',   label: 'All Customers',      icon: 'M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { id: 'banks',      label: 'Bank Management',    icon: 'M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3' },
  { id: 'limits',     label: 'Transfer Limits',    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { id: 'audit',      label: 'Audit Logs',         icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
  { id: 'kyc',        label: 'KYC Reviews',        icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
  {id: 'loans',       label: 'Loan Requests',      icon: 'M12 2L2 7l10 5 10-5-10-5zm0 7L2 14l10 5 10-5-10-5z'},
];

// ─── Status chip colours ──────────────────────────────────────────────────────
const STATUS_COLOR = {
  PENDING:  '#f59e0b',
  APPROVED: '#22c55e',
  HOLD:     '#6366f1',
  REJECTED: '#ef4444',
};

// ─── Reusable sub-components ──────────────────────────────────────────────────
const Loader = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
    <CircularProgress sx={{ color: '#6366f1' }} />
  </Box>
);

const Empty = ({ msg }) => (
  <Box sx={{ textAlign: 'center', py: 10, color: '#94a3b8' }}>
    <Typography sx={{ fontSize: 40, mb: 1 }}>📭</Typography>
    <Typography>{msg}</Typography>
  </Box>
);

const StatCard = ({ label, value, color }) => (
  <Paper elevation={0} sx={{
    p: 3, borderRadius: 3, minWidth: 180, flex: 1,
    borderLeft: `4px solid ${color}`,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <Typography sx={{ color: '#64748b', fontSize: 13, mb: 0.5 }}>{label}</Typography>
    <Typography sx={{ fontSize: 34, fontWeight: 800, color }}>{value}</Typography>
  </Paper>
);

const StatusChip = ({ status }) => (
  <Chip label={status} size="small" sx={{
    background: `${STATUS_COLOR[status] || '#94a3b8'}22`,
    color: STATUS_COLOR[status] || '#94a3b8',
    fontWeight: 700, fontSize: 11,
  }} />
);

// ─── Reason dialog ────────────────────────────────────────────────────────────
function ReasonDialog({ open, title, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const handleConfirm = () => { if (reason.trim()) { onConfirm(reason); setReason(''); } };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent>
        <TextField
          label="Reason" fullWidth multiline rows={3} autoFocus
          value={reason} onChange={e => setReason(e.target.value)}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={!reason.trim()}
          sx={{ textTransform: 'none', background: '#6366f1' }}>
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Logout confirmation dialog ───────────────────────────────────────────────
function LogoutDialog({ open, onConfirm, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Confirm Logout</DialogTitle>
      <DialogContent>
        <Typography sx={{ color: '#64748b' }}>
          Are you sure you want to log out of the admin panel?
        </Typography>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ textTransform: 'none', flex: 1 }}>
          Stay
        </Button>
        <Button onClick={onConfirm} variant="contained"
          sx={{ textTransform: 'none', flex: 1, background: '#ef4444', '&:hover': { background: '#dc2626' } }}>
          Logout
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Bank form dialog ─────────────────────────────────────────────────────────
function BankDialog({ open, bank, onSave, onClose }) {
  const [form, setForm] = useState({ name: '', ifsc: '', address: '' });
  useEffect(() => {
    if (bank) setForm({ name: bank.name || '', ifsc: bank.ifsc || '', address: bank.address || '' });
    else setForm({ name: '', ifsc: '', address: '' });
  }, [bank, open]);

  const s = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{bank ? 'Edit Bank' : 'Add Bank'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <TextField label="Bank Name"    value={form.name}    onChange={s('name')}    fullWidth required />
        <TextField label="IFSC Code"    value={form.ifsc}    onChange={s('ifsc')}    fullWidth required />
        <TextField label="Address"      value={form.address} onChange={s('address')} fullWidth multiline rows={2} />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button onClick={() => onSave(form)} variant="contained"
          disabled={!form.name || !form.ifsc}
          sx={{ textTransform: 'none', background: '#6366f1' }}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // Guard
  useEffect(() => { requireRole(navigate, 'admin'); }, [navigate]);

  const [activeNav,    setActiveNav]    = useState('overview');
  const [customers,    setCustomers]    = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [banks,        setBanks]        = useState([]);
  const [auditLogs,    setAuditLogs]    = useState([]);
  const [kycRecords,   setKycRecords]   = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');
  const [loans, setLoans] = useState([]);

  // Dialogs
  const [logoutOpen,   setLogoutOpen]   = useState(false);
  const [reasonDialog, setReasonDialog] = useState({ open: false, type: '', customer: null });
  const [bankDialog,   setBankDialog]   = useState({ open: false, bank: null });
  const [limitDialog,  setLimitDialog]  = useState({ open: false, customer: null, value: '' });

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    // FIX 1: destructure all 5 results — was missing kycRes
    const [pend, all, bnks, logs, kycRes, loanRes] = await Promise.all([
      getPendingCustomers(),
      getAllCustomers(),
      getBanks(),
      getAuditLogs(),
      getAllKYC(),
      getAllLoans()
    ]);
    if (pend.success)   setCustomers(pend.customers || []);
    if (all.success)    setAllCustomers(all.customers || []);
    if (bnks.success)   setBanks(bnks.banks || []);
    if (logs.success)   setAuditLogs(logs.logs || []);
    if (kycRes.success) setKycRecords(kycRes.kyc || []);
    if (loanRes.success) setLoans(loanRes.loans || []); // now kycRes is defined
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const flash = (msg, type = 'success') => {
    if (type === 'success') setSuccess(msg);
    else setError(msg);
    setTimeout(() => { setSuccess(''); setError(''); }, 4000);
  };

  // ── Customer actions ───────────────────────────────────────────────────────
  const handleApprove = async (customer) => {
    const r = await approveCustomer(customer.id);
    if (r.success) { flash(`${customer.name} approved ✓`); fetchAll(); }
    else flash(r.error, 'error');
  };

  const openReason = (type, customer) =>
    setReasonDialog({ open: true, type, customer });

  const handleReasonConfirm = async (reason) => {
    const { type, customer } = reasonDialog;
    setReasonDialog({ open: false, type: '', customer: null });
    const fn = type === 'HOLD' ? holdCustomer : rejectCustomer;
    const r  = await fn(customer.id, reason);
    if (r.success) { flash(`${customer.name} ${type.toLowerCase()}ed ✓`); fetchAll(); }
    else flash(r.error, 'error');
  };

  // ── Bank actions ───────────────────────────────────────────────────────────
  const handleBankSave = async (form) => {
    const { bank } = bankDialog;
    setBankDialog({ open: false, bank: null });
    const r = bank
      ? await updateBank(bank.id, form)
      : await createBank(form);
    if (r.success) { flash('Bank saved ✓'); fetchAll(); }
    else flash(r.error, 'error');
  };

  const handleBankDelete = async (bankId) => {
    if (!window.confirm('Delete this bank?')) return;
    const r = await deleteBank(bankId);
    if (r.success) { flash('Bank deleted ✓'); fetchAll(); }
    else flash(r.error, 'error');
  };

  // ── Transfer limit ─────────────────────────────────────────────────────────
  const handleLimitSave = async () => {
    const { customer, value } = limitDialog;
    if (!value || isNaN(value) || Number(value) < 0) {
      flash('Enter a valid limit.', 'error');
      return;
    }
    setLimitDialog({ open: false, customer: null, value: '' });
    const r = await updateTransferLimit(customer.email, Number(value));
    if (r.success) { flash(`Limit updated for ${customer.name} ✓`); fetchAll(); }
    else flash(r.error, 'error');
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    setLogoutOpen(false);
    await logoutUser();
    navigate('/login', { replace: true });
  };

  // ── Shared table styles ────────────────────────────────────────────────────
  const TH = { fontWeight: 700, color: '#64748b', background: '#f8fafc', fontSize: 13 };
  const TR = { '&:hover': { background: '#f8fafc' } };

  // ── Sections ───────────────────────────────────────────────────────────────

  const renderOverview = () => {
    const approved = allCustomers.filter(c => c.status === 'APPROVED').length;
    const held     = allCustomers.filter(c => c.status === 'HOLD').length;
    const rejected = allCustomers.filter(c => c.status === 'REJECTED').length;
    const pendingKYC = kycRecords.filter(k => k.status === 'PENDING').length;

    return (
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
          Dashboard Overview
        </Typography>
        <Typography sx={{ color: '#64748b', mt: 0.5, mb: 4 }}>
          Welcome back, {user.name || user.email}
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 4 }}>
          <StatCard label="Pending Requests" value={customers.length} color="#f59e0b" />
          <StatCard label="Approved"          value={approved}         color="#22c55e" />
          <StatCard label="On Hold"           value={held}             color="#6366f1" />
          <StatCard label="Rejected"          value={rejected}         color="#ef4444" />
          <StatCard label="Pending KYC"       value={pendingKYC}       color="#0ea5e9" />
          <StatCard label="Banks Registered"  value={banks.length}     color="#0ea5e9" />
          <StatCard label="Audit Events"      value={auditLogs.length} color="#8b5cf6" />
        </Box>

        {customers.length > 0 && (
          <Alert severity="warning" sx={{ borderRadius: 2, mb: 2 }}>
            You have <strong>{customers.length}</strong> pending customer request(s) awaiting review.{' '}
            <Button size="small" onClick={() => setActiveNav('customers')}
              sx={{ textTransform: 'none', fontWeight: 700 }}>
              Review now →
            </Button>
          </Alert>
        )}

        {pendingKYC > 0 && (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            You have <strong>{pendingKYC}</strong> pending KYC submission(s) to review.{' '}
            <Button size="small" onClick={() => setActiveNav('kyc')}
              sx={{ textTransform: 'none', fontWeight: 700 }}>
              Review now →
            </Button>
          </Alert>
        )}
      </Box>
    );
  };

  const renderCustomers = () => (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
        Customer Account Requests
      </Typography>
      <Typography sx={{ color: '#64748b', mt: 0.5, mb: 3 }}>
        Approve, Hold, or Reject pending registrations
      </Typography>

      {loading ? <Loader /> : customers.length === 0
        ? <Empty msg="No pending customer requests — all caught up!" />
        : (
          <Box sx={{ background: '#fff', borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <Table>
              <TableHead>
                <TableRow>
                  {['Customer', 'Email', 'Balance (₹)', 'Documents', 'Status', 'Actions'].map(h => (
                    <TableCell key={h} sx={TH}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {customers.map(c => (
                  <TableRow key={c.id} sx={TR}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ background: '#6366f120', color: '#6366f1', fontWeight: 700 }}>
                          {c.name?.[0]?.toUpperCase()}
                        </Avatar>
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{c.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ color: '#64748b', fontSize: 13 }}>{c.email}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {Number(c.accountBalance).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell sx={{ color: '#64748b', fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={c.documents || 'None'}><span>{c.documents || '—'}</span></Tooltip>
                    </TableCell>
                    <TableCell><StatusChip status={c.status} /></TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button size="small" variant="contained" onClick={() => handleApprove(c)}
                          sx={{ textTransform: 'none', fontWeight: 600, background: '#22c55e', fontSize: 12,
                            '&:hover': { background: '#16a34a' } }}>
                          Approve
                        </Button>
                        <Button size="small" variant="contained" onClick={() => openReason('HOLD', c)}
                          sx={{ textTransform: 'none', fontWeight: 600, background: '#6366f1', fontSize: 12,
                            '&:hover': { background: '#4f46e5' } }}>
                          Hold
                        </Button>
                        <Button size="small" variant="contained" onClick={() => openReason('REJECTED', c)}
                          sx={{ textTransform: 'none', fontWeight: 600, background: '#ef4444', fontSize: 12,
                            '&:hover': { background: '#dc2626' } }}>
                          Reject
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
    </Box>
  );

  const renderLoans = () => (
  <Card sx={{ borderRadius: 4 }}>

    <CardContent>

      <Typography sx={{
        fontSize: 26,
        fontWeight: 800,
        mb: 3
      }}>
        Loan Requests
      </Typography>

      <Table>

        <TableHead>
          <TableRow>

            <TableCell>
              Customer
            </TableCell>

            <TableCell>
              Amount
            </TableCell>

            <TableCell>
              Tenure
            </TableCell>

            <TableCell>
              Purpose
            </TableCell>

            <TableCell>
              Status
            </TableCell>

            <TableCell>
              Actions
            </TableCell>

          </TableRow>
        </TableHead>

        <TableBody>

          {loans.map((loan) => (

            <TableRow key={loan.id}>

              <TableCell>
                {loan.customerId}
              </TableCell>

              <TableCell>
                ₹{Number(loan.amount).toLocaleString('en-IN')}
              </TableCell>

              <TableCell>
                {loan.tenure} months
              </TableCell>

              <TableCell>
                {loan.purpose}
              </TableCell>

              <TableCell>

                <Chip
                  label={loan.status}
                  color={
                    loan.status === 'APPROVED'
                      ? 'success'
                      : loan.status === 'REJECTED'
                      ? 'error'
                      : 'warning'
                  }
                />

              </TableCell>

              <TableCell>

                {loan.status === 'PENDING' && (
                  <>

                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      onClick={async () => {

                        const r = await approveLoan(loan.id);

                        if (r.success) {
                          flash('Loan approved');
                          fetchAll();
                        } else {
                          flash(r.error, 'error');
                        }
                      }}
                    >
                      Approve
                    </Button>

                    <Button
                      size="small"
                      variant="contained"
                      color="error"
                      sx={{ ml: 1 }}
                      onClick={async () => {

                        const r = await rejectLoan(loan.id);

                        if (r.success) {
                          flash('Loan rejected');
                          fetchAll();
                        } else {
                          flash(r.error, 'error');
                        }
                      }}
                    >
                      Reject
                    </Button>

                  </>
                )}

              </TableCell>

            </TableRow>

          ))}

        </TableBody>

      </Table>

    </CardContent>

  </Card>
);

  const renderAllUsers = () => (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>All Customers</Typography>
      <Typography sx={{ color: '#64748b', mt: 0.5, mb: 3 }}>
        View all registered customers and their statuses
      </Typography>

      {loading ? <Loader /> : allCustomers.length === 0
        ? <Empty msg="No customers registered yet." />
        : (
          <Box sx={{ background: '#fff', borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <Table>
              <TableHead>
                <TableRow>
                  {['Customer', 'Email', 'Balance (₹)', 'Transfer Limit', 'Status', 'Joined'].map(h => (
                    <TableCell key={h} sx={TH}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {allCustomers.map(c => (
                  <TableRow key={c.id} sx={TR}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ background: '#6366f120', color: '#6366f1', fontWeight: 700, width: 32, height: 32, fontSize: 14 }}>
                          {c.name?.[0]?.toUpperCase()}
                        </Avatar>
                        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{c.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ color: '#64748b', fontSize: 13 }}>{c.email}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      ₹{Number(c.accountBalance || 0).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell>
                      ₹{Number(c.transferLimit || 0).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell><StatusChip status={c.status} /></TableCell>
                    <TableCell sx={{ color: '#94a3b8', fontSize: 12 }}>
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
    </Box>
  );

  // FIX 2: renderKYC is now defined at the top level (not nested inside another render fn)
  // FIX 3: handleKYCApprove also calls updateProfile to sync kycStatus on the user record
  const renderKYC = () => {
    const KYC_STATUS_COLOR = {
      PENDING:  '#f59e0b',
      APPROVED: '#22c55e',
      REJECTED: '#ef4444',
    };

    const handleKYCApprove = async (kycId, customerEmail) => {
      const r = await approveKYC(kycId);
      if (r.success) {
        // FIX 3: sync kycStatus on the user/profile document so CustomerDashboard reflects it
        await updateKYCStatus(customerEmail, 'APPROVED');
        flash('KYC approved ✓');
        fetchAll();
      } else {
        flash(r.error, 'error');
      }
    };

    const handleKYCReject = async (kycId, customerEmail) => {
      const reason = window.prompt('Rejection reason:');
      if (!reason) return;
      const r = await rejectKYC(kycId, reason);
      if (r.success) {
        // Also sync the rejection status back to the user profile
        await updateKYCStatus(customerEmail, 'REJECTED');
        flash('KYC rejected ✓');
        fetchAll();
      } else {
        flash(r.error, 'error');
      }
    };

    return (
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>KYC Reviews</Typography>
        <Typography sx={{ color: '#64748b', mt: 0.5, mb: 3 }}>
          Review and approve customer identity documents
        </Typography>

        {loading ? <Loader /> : kycRecords.length === 0
          ? <Empty msg="No KYC submissions yet." />
          : (
            <Box sx={{ background: '#fff', borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    {['Customer Email', 'PAN', 'Aadhaar', 'Passport', 'Status', 'Submitted', 'Actions'].map(h => (
                      <TableCell key={h} sx={TH}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {kycRecords.map(k => (
                    <TableRow key={k.id} sx={TR}>
                      <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>{k.customerId || '—'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>{k.pan || '—'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                        {k.aadhaar ? '••••' + k.aadhaar.slice(-4) : '—'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>{k.passport || '—'}</TableCell>
                      <TableCell>
                        <Chip label={k.status || 'PENDING'} size="small" sx={{
                          background: `${KYC_STATUS_COLOR[k.status] || '#94a3b8'}22`,
                          color: KYC_STATUS_COLOR[k.status] || '#94a3b8',
                          fontWeight: 700, fontSize: 11,
                        }} />
                      </TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontSize: 12 }}>
                        {k.submittedAt ? new Date(k.submittedAt).toLocaleDateString('en-IN') : '—'}
                      </TableCell>
                      <TableCell>
                        {k.status === 'PENDING' ? (
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button size="small" variant="contained"
                              onClick={() => handleKYCApprove(k.id, k.customerId)}
                              sx={{ textTransform: 'none', fontWeight: 600, background: '#22c55e', fontSize: 12,
                                '&:hover': { background: '#16a34a' } }}>
                              Approve
                            </Button>
                            <Button size="small" variant="contained"
                              onClick={() => handleKYCReject(k.id, k.email || k.customerId)}
                              sx={{ textTransform: 'none', fontWeight: 600, background: '#ef4444', fontSize: 12,
                                '&:hover': { background: '#dc2626' } }}>
                              Reject
                            </Button>
                          </Box>
                        ) : (
                          <Typography sx={{ color: '#94a3b8', fontSize: 12 }}>No action needed</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
      </Box>
    );
  };

  const renderBanks = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>Bank Management</Typography>
          <Typography sx={{ color: '#64748b', mt: 0.5 }}>Manage bank branches, IFSC codes, and addresses</Typography>
        </Box>
        <Button variant="contained" onClick={() => setBankDialog({ open: true, bank: null })}
          sx={{ textTransform: 'none', fontWeight: 700, background: '#6366f1',
            '&:hover': { background: '#4f46e5' } }}>
          + Add Bank
        </Button>
      </Box>

      {loading ? <Loader /> : banks.length === 0
        ? <Empty msg="No banks registered yet. Add one above." />
        : (
          <Box sx={{ background: '#fff', borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <Table>
              <TableHead>
                <TableRow>
                  {['Bank Name', 'IFSC Code', 'Address', 'Actions'].map(h => (
                    <TableCell key={h} sx={TH}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {banks.map(b => (
                  <TableRow key={b.id} sx={TR}>
                    <TableCell sx={{ fontWeight: 600 }}>{b.name}</TableCell>
                    <TableCell>
                      <Chip label={b.ifsc} size="small" sx={{ fontFamily: 'monospace', background: '#f1f5f9' }} />
                    </TableCell>
                    <TableCell sx={{ color: '#64748b', fontSize: 13 }}>{b.address || '—'}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button size="small" variant="outlined" onClick={() => setBankDialog({ open: true, bank: b })}
                          sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600 }}>
                          Edit
                        </Button>
                        <Button size="small" variant="contained" onClick={() => handleBankDelete(b.id)}
                          sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600,
                            background: '#ef4444', '&:hover': { background: '#dc2626' } }}>
                          Delete
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
    </Box>
  );

  const renderLimits = () => (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>Transfer Limits</Typography>
      <Typography sx={{ color: '#64748b', mt: 0.5, mb: 3 }}>
        Set per-customer daily transfer limits
      </Typography>

      {loading ? <Loader /> : allCustomers.filter(c => c.status === 'APPROVED').length === 0
        ? <Empty msg="No approved customers yet." />
        : (
          <Box sx={{ background: '#fff', borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <Table>
              <TableHead>
                <TableRow>
                  {['Customer', 'Email', 'Current Limit (₹)', 'Action'].map(h => (
                    <TableCell key={h} sx={TH}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {allCustomers.filter(c => c.status === 'APPROVED').map(c => (
                  <TableRow key={c.id} sx={TR}>
                    <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                    <TableCell sx={{ color: '#64748b', fontSize: 13 }}>{c.email}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#6366f1' }}>
                      ₹{Number(c.transferLimit || 10000).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell>
                      <Button size="small" variant="outlined" onClick={() =>
                        setLimitDialog({ open: true, customer: c, value: String(c.transferLimit || 10000) })}
                        sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}>
                        Update Limit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

      {/* Transfer limit dialog */}
      <Dialog open={limitDialog.open} onClose={() => setLimitDialog({ open: false, customer: null, value: '' })}
        maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Set Transfer Limit — {limitDialog.customer?.name}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="New Transfer Limit (₹)" type="number" fullWidth autoFocus sx={{ mt: 1 }}
            value={limitDialog.value}
            onChange={e => setLimitDialog(prev => ({ ...prev, value: e.target.value }))}
            inputProps={{ min: 0 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setLimitDialog({ open: false, customer: null, value: '' })}
            sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button onClick={handleLimitSave} variant="contained"
            sx={{ textTransform: 'none', background: '#6366f1' }}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  const renderAudit = () => (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>Audit Logs</Typography>
      <Typography sx={{ color: '#64748b', mt: 0.5, mb: 3 }}>All admin actions are recorded here</Typography>

      {loading ? <Loader /> : auditLogs.length === 0
        ? <Empty msg="No audit events recorded yet." />
        : (
          <Box sx={{ background: '#fff', borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <Table>
              <TableHead>
                <TableRow>
                  {['Action', 'Customer ID', 'Details', 'Admin', 'Timestamp'].map(h => (
                    <TableCell key={h} sx={TH}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {auditLogs.map(log => (
                  <TableRow key={log.id} sx={TR}>
                    <TableCell>
                      <Chip label={log.action} size="small"
                        sx={{ background: `${STATUS_COLOR[log.action] || '#6366f1'}20`,
                          color: STATUS_COLOR[log.action] || '#6366f1', fontWeight: 700, fontSize: 11 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 13, color: '#64748b' }}>{log.customerId}</TableCell>
                    <TableCell sx={{ fontSize: 13, color: '#64748b', maxWidth: 200,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={log.details || ''}><span>{log.details || '—'}</span></Tooltip>
                    </TableCell>
                    <TableCell sx={{ fontSize: 13, color: '#64748b' }}>{log.adminEmail || '—'}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#94a3b8' }}>
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
    </Box>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>

      {/* SIDEBAR */}
      <Box sx={{
        width: 250, background: '#0f172a', color: '#fff',
        p: 3, display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 0.5 }}>🏦 JGBank</Typography>
        <Typography sx={{ fontSize: 12, color: '#64748b', mb: 4 }}>Admin Panel</Typography>

        {NAV.map(item => (
          <Box key={item.id} onClick={() => setActiveNav(item.id)}
            sx={{
              p: 1.5, borderRadius: 2, mb: 0.5, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 1.5,
              background: activeNav === item.id ? '#6366f1' : 'transparent',
              '&:hover': { background: activeNav === item.id ? '#6366f1' : '#1e293b' },
              transition: 'background 0.2s',
            }}>
            <Typography sx={{ fontWeight: activeNav === item.id ? 700 : 500, fontSize: 14 }}>
              {item.label}
            </Typography>
            {/* Badge for pending KYC in sidebar */}
            {item.id === 'kyc' && kycRecords.filter(k => k.status === 'PENDING').length > 0 && (
              <Box sx={{ ml: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
            )}
          </Box>
        ))}

        <Box sx={{ flex: 1 }} />

        <Divider sx={{ borderColor: '#1e293b', mb: 2 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Avatar sx={{ width: 32, height: 32, background: '#6366f1', fontSize: 14 }}>
            {(user.name || user.email || 'A')[0].toUpperCase()}
          </Avatar>
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.2 }}>
              {user.name || 'Admin'}
            </Typography>
            <Typography sx={{ fontSize: 11, color: '#64748b' }}>{user.email}</Typography>
          </Box>
        </Box>

        <Button onClick={() => setLogoutOpen(true)} fullWidth
          sx={{
            background: '#ef444418', color: '#ef4444', fontWeight: 700,
            textTransform: 'none', borderRadius: 2,
            '&:hover': { background: '#ef444430' },
          }}>
          Sign Out
        </Button>
      </Box>

      {/* MAIN */}
      <Box sx={{ flex: 1, p: 4, overflow: 'auto' }}>

        {/* Topbar */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 24, color: '#0f172a' }}>
            {NAV.find(n => n.id === activeNav)?.label || 'Dashboard'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Tooltip title={`${customers.length} pending request(s)`}>
              <Badge badgeContent={customers.length} color="warning">
                <Box sx={{ cursor: 'pointer', color: '#64748b' }}
                  onClick={() => setActiveNav('customers')}>
                  <Ico path="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" size={22} />
                </Box>
              </Badge>
            </Tooltip>
            <Avatar sx={{ background: '#6366f1', fontWeight: 700, width: 36, height: 36, fontSize: 15 }}>
              {(user.name || user.email || 'A')[0].toUpperCase()}
            </Avatar>
          </Box>
        </Box>

        {/* Alerts */}
        {error   && <Alert severity="error"   sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

        {/* Section content — FIX 2: kyc section is now wired in */}
        {activeNav === 'overview'  && renderOverview()}
        {activeNav === 'customers' && renderCustomers()}
        {activeNav === 'allUsers'  && renderAllUsers()}
        {activeNav === 'banks'     && renderBanks()}
        {activeNav === 'limits'    && renderLimits()}
        {activeNav === 'audit'     && renderAudit()}
        {activeNav === 'kyc'       && renderKYC()}
        {activeNav === 'loans' && renderLoans()}
      </Box>

      {/* Dialogs */}
      <LogoutDialog
        open={logoutOpen}
        onConfirm={handleLogout}
        onClose={() => setLogoutOpen(false)}
      />

      <ReasonDialog
        open={reasonDialog.open}
        title={reasonDialog.type === 'HOLD'
          ? `Hold — ${reasonDialog.customer?.name}`
          : `Reject — ${reasonDialog.customer?.name}`}
        onConfirm={handleReasonConfirm}
        onClose={() => setReasonDialog({ open: false, type: '', customer: null })}
      />

      <BankDialog
        open={bankDialog.open}
        bank={bankDialog.bank}
        onSave={handleBankSave}
        onClose={() => setBankDialog({ open: false, bank: null })}
      />
    </Box>
  );
}