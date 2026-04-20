import { useCallback, useEffect, useState } from 'react';
import { fetchOwnerIntelligenceHeatmap, fetchOwnerSubmissions } from '../apiClient.js';
import ContributionHeatmap from '../components/ContributionHeatmap.jsx';

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
  const [heatmapRows, setHeatmapRows] = useState([]);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [heatmapErr, setHeatmapErr] = useState('');
  const [selectedPoiId, setSelectedPoiId] = useState('');
  const [range, setRange] = useState(() => {
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 364);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end };
  });

  const startIso = range.start.toISOString();
  const endIso = range.end.toISOString();

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

  const loadHeatmap = useCallback(async () => {
    setHeatmapErr('');
    setHeatmapLoading(true);
    try {
      const result = await fetchOwnerIntelligenceHeatmap(startIso, endIso, selectedPoiId || undefined);
      setHeatmapRows(Array.isArray(result) ? result : []);
    } catch (e) {
      setHeatmapErr(e.message || 'Không thể tải heatmap hoạt động POI của bạn');
      setHeatmapRows([]);
    } finally {
      setHeatmapLoading(false);
    }
  }, [startIso, endIso, selectedPoiId]);

  useEffect(() => {
    loadHeatmap();
  }, [loadHeatmap]);

  const toDateValue = (d) => d.toISOString().slice(0, 10);
  const approvedOptions = rows.filter((x) => x?.status === 'APPROVED');

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

      <section className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Heatmap lượt khách tại POI của tôi</h2>
            <p className="mt-1 text-sm text-slate-600">
              Chỉ tính các POI đã được duyệt do bạn quản lý. Owner khác sẽ có biểu đồ khác.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-600">
              POI
              <select
                className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                value={selectedPoiId}
                onChange={(e) => setSelectedPoiId(e.target.value)}
              >
                <option value="">Tất cả POI đã duyệt của tôi</option>
                {approvedOptions.map((poi) => (
                  <option key={String(poi.id)} value={String(poi.id)}>
                    {poi.name || poi.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              Từ ngày
              <input
                type="date"
                className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                value={toDateValue(range.start)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const d = new Date(`${v}T00:00:00.000Z`);
                  setRange((prev) => ({ ...prev, start: d }));
                }}
              />
            </label>
            <label className="text-xs text-slate-600">
              Đến ngày
              <input
                type="date"
                className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                value={toDateValue(range.end)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const d = new Date(`${v}T23:59:59.999Z`);
                  setRange((prev) => ({ ...prev, end: d }));
                }}
              />
            </label>
            <button
              type="button"
              onClick={loadHeatmap}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Tải lại heatmap
            </button>
          </div>
        </div>

        {heatmapErr ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {heatmapErr}
          </div>
        ) : null}

        {heatmapLoading ? (
          <p className="mt-4 text-sm text-slate-600">Đang tải heatmap...</p>
        ) : (
          <div className="mt-4">
            <ContributionHeatmap
              rows={heatmapRows}
              startIso={startIso}
              endIso={endIso}
              title="Lịch sử lượt khách theo ngày"
              subtitle={
                selectedPoiId
                  ? 'Nguồn: events của POI đã chọn (đã duyệt, thuộc owner hiện tại).'
                  : 'Nguồn: events vào tất cả POI đã duyệt của owner hiện tại.'
              }
            />
          </div>
        )}
      </section>

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
