import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box, Paper, TextField, Button, Typography,
  Alert, CircularProgress, InputAdornment,
  IconButton, Divider,
} from '@mui/material';
import { loginUser, getCurrentUser } from '../services/authService';

// ─── Inline SVG icons (no extra dep) ─────────────────────────────────────────
const EyeIcon = ({ open }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {open
      ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
      : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
    }
  </svg>
);

// ─── Status messages shown instead of navigating ──────────────────────────────
const STATUS_MESSAGES = {
  PENDING:  'Your account is pending admin approval. You will be notified by email.',
  HOLD:     'Your account is currently on hold. Please contact support.',
  REJECTED: 'Your account registration was rejected. Please contact support.',
};

export default function LoginPage() {
  const navigate = useNavigate();

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPwd,     setShowPwd]     = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [statusMsg,   setStatusMsg]   = useState('');



  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setStatusMsg('');

    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const result = await loginUser(email, password);

      if (!result.success) {
        setError(result.error || 'Login failed. Please try again.');
        return;
      }

      const { user } = result;

      if (user.role === 'admin') {
        navigate('/admin/dashboard');
        return;
      }

      if (user.role === 'customer') {
        if (user.status === 'APPROVED') {
          navigate('/customer/dashboard');
        } else {
          setStatusMsg(STATUS_MESSAGES[user.status] || 'Account status unknown.');
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
          maxWidth: 440,
          borderRadius: 4,
          overflow: 'hidden',
          boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header strip */}
        <Box
          sx={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            p: 4,
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontSize: 42, lineHeight: 1 }}>🏦</Typography>
          <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 26, mt: 1 }}>
            JGBank
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>
            Secure Online Banking
          </Typography>
        </Box>

        {/* Form */}
        <Box sx={{ p: 4 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 20, mb: 3, color: '#0f172a' }}>
            Sign In to your account
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {statusMsg && (
            <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setStatusMsg('')}>
              {statusMsg}
            </Alert>
          )}

          <form onSubmit={handleLogin} noValidate>
            <TextField
              label="Email address"
              type="email"
              fullWidth
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <TextField
              label="Password"
              type={showPwd ? 'text' : 'password'}
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPwd(v => !v)}
                      edge="end"
                      size="small"
                    >
                      <EyeIcon open={showPwd} />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{
                mt: 3,
                py: 1.5,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                fontWeight: 700,
                fontSize: 16,
                borderRadius: 2,
                textTransform: 'none',
                '&:hover': {
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                },
              }}
            >
              {loading ? <CircularProgress size={24} sx={{ color: '#fff' }} /> : 'Sign In'}
            </Button>
          </form>

          <Divider sx={{ my: 3 }} />

          <Typography sx={{ textAlign: 'center', color: '#64748b', fontSize: 14 }}>
            New to JGBank?{' '}
            <Link
              to="/signup"
              style={{ color: '#6366f1', fontWeight: 700, textDecoration: 'none' }}
            >
              Create an account
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}