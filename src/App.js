import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage      from './pages/LoginPage';
import SignUpPage     from './pages/SignUpPage';
import AdminDashboard from './pages/AdminDashboard';
import CustomerDashboard from './pages/CustomerDashboard';

// ─── Simple route guard ───────────────────────────────────────────────────────
function ProtectedRoute({ children, requiredRole }) {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) return <Navigate to="/login" replace />;
    if (requiredRole && user.role !== requiredRole) return <Navigate to="/login" replace />;
    return children;
  } catch {
    return <Navigate to="/login" replace />;
  }
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"       element={<LoginPage />} />
        <Route path="/login"  element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />

        <Route path="/admin/dashboard" element={
          <ProtectedRoute requiredRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        } />

        <Route path="/customer/dashboard" element={
          <ProtectedRoute requiredRole="customer">
              <CustomerDashboard />
          </ProtectedRoute>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;