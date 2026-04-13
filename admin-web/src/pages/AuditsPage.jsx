import { useCallback, useEffect, useState } from 'react';
import { fetchAudits } from '../apiClient.js';

export default function AuditsPage() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async (p) => {
    setErr('');
    setLoading(true);
    try {
      const res = await fetchAudits(p, 20);
      setItems(Array.isArray(res?.data) ? res.data : []);
      setPagination(res?.pagination || null);
    } catch (e) {
      setErr(e.message || 'Không thể tải nhật ký kiểm duyệt');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [page, load]);

  const totalPages = pagination?.totalPages ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Nhật ký kiểm duyệt POI</h1>
      <p className="mt-1 text-sm text-slate-600">Mọi hành động duyệt / từ chối đều được ghi lại.</p>

      {err && (
        <div className="mt-4 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          {err}
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-slate-600">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-slate-600">
          Chưa có bản ghi nhật ký.
        </p>
      ) : (
        <>
          <div className="mt-6 overflow-hidden rounded-lg bg-white shadow">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Thời gian</th>
                  <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Quản trị viên</th>
                  <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Hành động</th>
                  <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">POI</th>
                  <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Trạng thái</th>
                  <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={String(row.id)} className="odd:bg-gray-50 even:bg-white">
                    <td className="whitespace-nowrap border-b border-gray-200 px-4 py-3 text-gray-900">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="border-b border-gray-200 px-4 py-3 text-gray-900">
                      {row.admin?.email || '—'}
                    </td>
                    <td className="border-b border-gray-200 px-4 py-3">
                      <span
                        className={
                          row.action === 'APPROVE'
                            ? 'text-emerald-700'
                            : row.action === 'REJECT'
                              ? 'text-red-700'
                              : 'text-gray-900'
                        }
                      >
                        {row.action}
                      </span>
                    </td>
                    <td className="border-b border-gray-200 px-4 py-3 font-mono text-gray-900">
                      {row.poi?.code || '—'}
                    </td>
                    <td className="border-b border-gray-200 px-4 py-3 text-gray-900">
                      {row.previousStatus} → {row.newStatus}
                    </td>
                    <td className="max-w-xs truncate border-b border-gray-200 px-4 py-3 text-gray-900" title={row.reason || ''}>
                      {row.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-4 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-600 px-3 py-1 disabled:opacity-40"
              >
                Trước
              </button>
              <span className="text-slate-400">
                Trang {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-600 px-3 py-1 disabled:opacity-40"
              >
                Sau
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
