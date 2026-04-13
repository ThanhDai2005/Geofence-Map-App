import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { login } from '../apiClient.js';

export default function LoginPage() {
  const { isAuthenticated, user, loginSuccess } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    if (user?.role === 'ADMIN') return <Navigate to="/dashboard" replace />;
    if (user?.role === 'OWNER') return <Navigate to="/my-pois" replace />;
    return <Navigate to="/forbidden" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(email, password);
      const payload = res?.data;
      const role = payload?.user?.role || 'USER';
      if (role !== 'ADMIN' && role !== 'OWNER') {
        setError('Từ chối truy cập. Chỉ tài khoản ADMIN hoặc OWNER mới dùng được cổng này.');
        return;
      }
      loginSuccess(payload.token, payload.user);
      if (role === 'ADMIN') navigate('/dashboard', { replace: true });
      else navigate('/my-pois', { replace: true });
    } catch (err) {
      setError(err.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 to-slate-900 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-xl">
        <h1 className="text-center text-xl font-semibold text-white">Đăng nhập quản trị</h1>
        <p className="mt-1 text-center text-sm text-slate-400">Hệ thống kiểm duyệt POI VNGo</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400" htmlFor="email">
              Email đăng nhập
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none ring-emerald-500/0 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400" htmlFor="password">
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500/60"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
