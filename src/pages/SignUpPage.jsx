import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box, Paper, TextField, Button, Typography,
  Alert, CircularProgress, Stepper, Step, StepLabel,
  InputAdornment, IconButton, Divider,
} from '@mui/material';
import { registerCustomer } from '../services/authService';

// ─── Simple inline SVG eye icon ───────────────────────────────────────────────
const EyeIcon = ({ open }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {open
      ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
      : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
    }
  </svg>
);

const STEPS = ['Personal Details', 'Account Setup'];

const INITIAL = {
  name: '', email: '', phone: '', password: '', confirmPassword: '',
  accountBalance: 1000, panNumber: ''
};

export default function SignUpPage() {
  const navigate = useNavigate();

  const [step,     setStep]     = useState(0);
  const [formData, setFormData] = useState(INITIAL);
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  const set = (field) => (e) =>
    setFormData(prev => ({ ...prev, [field]: e.target.value }));

  // ── Per-step validation ────────────────────────────────────────────────────
  const validateStep = () => {

  setError('');

  if (step === 0) {

    if (!formData.name.trim()) {
      setError('Full name is required.');
      return false;
    }

    if (!formData.email.trim()) {
      setError('Email is required.');
      return false;
    }

    if (!/\S+@\S+\.\S+/.test(formData.email)) {
      setError('Enter a valid email address.');
      return false;
    }

    if (!formData.phone.trim()) {
      setError('Phone number is required.');
      return false;
    }

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.panNumber)) {
      setError('Enter a valid PAN number.');
      return false;
    }
  }

  if (step === 1) {

    if (!formData.password) {
      setError('Password is required.');
      return false;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }

    if (Number(formData.accountBalance) < 1000) {
      setError('Minimum opening balance is ₹1,000.');
      return false;
    }
  }

  return true;
};

  const handleNext = () => {
    if (validateStep()) setStep(s => s + 1);
  };

  const handleBack = () => {
    setError('');
    setStep(s => s - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;

    setLoading(true);
    setError('');

    try {
      const result = await registerCustomer(formData);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => navigate('/login'), 4000);
      } else {
        setError(result.error || 'Registration failed. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          p: 2,
        }}
      >
        <Paper
          elevation={0}
          sx={{ p: 6, borderRadius: 4, textAlign: 'center', maxWidth: 440, width: '100%' }}
        >
          <Typography sx={{ fontSize: 64 }}>✅</Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 2, color: '#0f172a' }}>
            Application Submitted!
          </Typography>
          <Typography sx={{ color: '#64748b', mt: 1 }}>
            Your account request has been submitted successfully. An admin will review it and
            you'll be notified by email once it's approved.
          </Typography>
          <Typography sx={{ color: '#94a3b8', fontSize: 13, mt: 2 }}>
            Redirecting to login…
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 500,
          borderRadius: 4,
          overflow: 'hidden',
          boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            p: 3,
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontSize: 36 }}>🏦</Typography>
          <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 22 }}>
            Open a JGBank Account
          </Typography>
        </Box>

        <Box sx={{ p: 4 }}>
          {/* Stepper */}
          <Stepper activeStep={step} sx={{ mb: 4 }}>
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {/* ── Step 0: Personal Details ── */}
          {step === 0 && (
            <Box>
              <TextField label="Full Name"    fullWidth margin="normal" required
                value={formData.name}  onChange={set('name')} />
              <TextField label="Email Address" type="email" fullWidth margin="normal" required
                value={formData.email} onChange={set('email')} />
              <TextField label="Phone Number" fullWidth margin="normal" required
                value={formData.phone} onChange={set('phone')}
                inputProps={{ maxLength: 15 }} />
              <TextField
                label="PAN Number"
                fullWidth
                margin="normal"
                required
                value={formData.panNumber}
                onChange={set('panNumber')}
                placeholder="ABCDE1234F"
                inputProps={{ maxLength: 10 }}
                />
            </Box>
          )}

          {/* ── Step 1: Account Setup ── */}
          {step === 1 && (
            <Box>
              <TextField
                label="Password"
                type={showPwd ? 'text' : 'password'}
                fullWidth margin="normal" required
                value={formData.password}
                onChange={set('password')}
                helperText="Minimum 6 characters"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPwd(v => !v)} edge="end" size="small">
                        <EyeIcon open={showPwd} />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Confirm Password"
                type={showPwd ? 'text' : 'password'}
                fullWidth margin="normal" required
                value={formData.confirmPassword}
                onChange={set('confirmPassword')}
              />
              <TextField
                label="Opening Balance (₹)"
                type="number"
                fullWidth margin="normal" required
                value={formData.accountBalance}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, accountBalance: e.target.value }))
                }
                inputProps={{ min: 1000 }}
                helperText="Minimum opening balance is ₹1,000"
              />
            </Box>
          )}

          

          {/* Navigation buttons */}
          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            {step > 0 && (
              <Button
                variant="outlined" fullWidth onClick={handleBack}
                sx={{ py: 1.5, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
              >
                Back
              </Button>
            )}

            {step < STEPS.length - 1 ? (
              <Button
                variant="contained" fullWidth onClick={handleNext}
                sx={{
                  py: 1.5, borderRadius: 2, textTransform: 'none', fontWeight: 700,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  '&:hover': { background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' },
                }}
              >
                Continue
              </Button>
            ) : (
              <Button
                variant="contained" fullWidth onClick={handleSubmit} disabled={loading}
                sx={{
                  py: 1.5, borderRadius: 2, textTransform: 'none', fontWeight: 700,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  '&:hover': { background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' },
                }}
              >
                {loading
                  ? <CircularProgress size={22} sx={{ color: '#fff' }} />
                  : 'Submit Application'}
              </Button>
            )}
          </Box>

          <Divider sx={{ my: 3 }} />

          <Typography sx={{ textAlign: 'center', color: '#64748b', fontSize: 14 }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#6366f1', fontWeight: 700, textDecoration: 'none' }}>
              Sign In
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}