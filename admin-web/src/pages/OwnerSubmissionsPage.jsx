import { useCallback, useEffect, useState } from 'react';
import { fetchOwnerSubmissions } from '../apiClient.js';

function contentPreview(content) {
  if (!content || typeof content !== 'object') return '—';
  return content.vi || content.en || '—';
}

function statusBadge(status) {
  const s = status || '—';
  const cls =
    s === 'APPROVED'
      ? 'bg-emerald-100 text-emerald-800'
      : s === 'PENDING'
        ? 'bg-amber-100 text-amber-900'
        : s === 'REJECTED'
          ? 'bg-red-100 text-red-800'
          : 'bg-slate-100 text-slate-700';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{s}</span>;
}

export default function OwnerSubmissionsPage() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async (page = 1) => {
    setErr('');
    setLoading(true);
    try {
      const res = await fetchOwnerSubmissions(page, pagination.limit);
      setRows(Array.isArray(res?.data) ? res.data : []);
      if (res?.pagination) setPagination((p) => ({ ...p, ...res.pagination }));
    } catch (e) {
      setErr(e.message || 'Không thể tải danh sách địa điểm đã gửi');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit]);

  useEffect(() => {
    load(1);
  }, []);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">POI của tôi</h1>
          <p className="text-sm text-slate-600">Danh sách địa điểm bạn đã gửi, chờ quản trị viên xử lý.</p>
        </div>
        <button
          type="button"
          onClick={() => load(pagination.page || 1)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
        >
          Làm mới
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</div>
      )}

      {loading ? (
        <p className="text-slate-600">Đang tải...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-slate-600">
          Bạn chưa gửi POI nào. Hãy dùng mục <strong>Gửi POI mới</strong> trong thanh bên.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Mã</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Nội dung</th>
                <th className="px-4 py-3 font-medium">Tọa độ</th>
                <th className="px-4 py-3 font-medium">Cập nhật</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {rows.map((row) => {
                const id = String(row.id || row._id || '');
                const loc = row.location;
                const lat = loc != null ? Number(loc.lat) : NaN;
                const lng = loc != null ? Number(loc.lng) : NaN;
                const locStr =
                  loc && !Number.isNaN(lat) && !Number.isNaN(lng)
                    ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                    : '—';
                return (
                  <tr key={id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-emerald-700">{row.code}</td>
                    <td className="px-4 py-3">{statusBadge(row.status)}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-800">{contentPreview(row.content)}</td>
                    <td className="px-4 py-3 text-slate-600">{locStr}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
