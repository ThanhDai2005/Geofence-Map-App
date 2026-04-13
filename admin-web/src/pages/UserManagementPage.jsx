import { useCallback, useEffect, useState } from 'react';
import { createAdminUser, fetchAdminUsers, updateUserRole, updateUserStatus } from '../apiClient.js';
import { useAuth } from '../AuthContext.jsx';

const ROLES = ['USER', 'OWNER', 'ADMIN'];

export default function UserManagementPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', role: 'USER', isActive: true });

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const res = await fetchAdminUsers();
      const list = Array.isArray(res?.data) ? res.data : [];
      const currentUserId = String(user?.id || user?._id || '');
      setRows(list.filter((u) => String(u.id || u._id || '') !== currentUserId));
    } catch (e) {
      setErr(e.message || 'Không thể tải danh sách người dùng');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?._id]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRoleChange(userId, role) {
    setBusyId(userId);
    setErr('');
    try {
      await updateUserRole(userId, role);
      await load();
    } catch (e) {
      setErr(e.message || 'Cập nhật vai trò thất bại');
    } finally {
      setBusyId(null);
    }
  }

  async function onStatusToggle(userId, next) {
    setBusyId(userId);
    setErr('');
    try {
      await updateUserStatus(userId, next);
      await load();
    } catch (e) {
      setErr(e.message || 'Cập nhật trạng thái thất bại');
    } finally {
      setBusyId(null);
    }
  }

  async function onCreateUser(e) {
    e.preventDefault();
    setErr('');
    try {
      await createAdminUser({
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        isActive: form.isActive,
      });
      setCreateOpen(false);
      setForm({ email: '', password: '', role: 'USER', isActive: true });
      await load();
    } catch (e) {
      setErr(e.message || 'Tạo tài khoản thất bại');
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Quản lý người dùng</h1>
          <p className="text-sm text-slate-600">Quản lý vai trò, trạng thái và thêm tài khoản mới.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
          >
            Làm mới
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Thêm người dùng
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</div>
      )}

      {loading ? (
        <p className="text-slate-600">Đang tải...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Vai trò</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {rows.map((row) => {
                const id = String(row.id || row._id || '');
                const busy = busyId === id;
                return (
                  <tr key={id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{row.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={row.role || 'USER'}
                        disabled={busy}
                        onChange={(e) => onRoleChange(id, e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          row.isActive !== false
                            ? 'rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800'
                            : 'rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800'
                        }
                      >
                        {row.isActive !== false ? 'Đang hoạt động' : 'Đã khóa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onStatusToggle(id, row.isActive === false)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {row.isActive === false ? 'Mở khóa' : 'Khóa'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Thêm người dùng mới</h2>
            <form onSubmit={onCreateUser} className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Email</span>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Mật khẩu</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Vai trò</span>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Kích hoạt tài khoản ngay
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  Tạo tài khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
