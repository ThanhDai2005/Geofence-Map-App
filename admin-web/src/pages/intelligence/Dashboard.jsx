import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchMasterPois,
  fetchIntelligenceGeoHeatmap,
  fetchIntelligenceHeatmap,
  fetchIntelligenceOverview,
  fetchSystemOverview,
} from '../../apiClient.js';
import Heatmap, { defaultUtcRange7d } from './Heatmap.jsx';
import GeoHeatmapMap from './GeoHeatmapMap.jsx';

const PIE_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#64748b'];

function defaultRange() {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 14);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

function utcDateInputValue(d) {
  const x = d instanceof Date ? d : new Date(d);
  return x.toISOString().slice(0, 10);
}

function toIso(d) {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function mapFamilyLabel(family) {
  const x = String(family || '').trim();
  if (x === 'LocationEvent') return 'Sự kiện vị trí';
  if (x === 'UserInteractionEvent') return 'Sự kiện tương tác người dùng';
  if (x === 'NavigationEvent') return 'Sự kiện điều hướng';
  if (x === 'ObservabilityEvent') return 'Sự kiện quan sát hệ thống';
  return x || 'Không xác định';
}

function mapAuthLabel(auth) {
  const x = String(auth || '').trim().toLowerCase();
  if (x === 'guest') return 'Khách';
  if (x === 'logged_in') return 'Đã đăng nhập';
  if (x === 'premium') return 'Premium';
  return auth || 'Không xác định';
}

export default function IntelligenceDashboard() {
  const [{ start, end }, setRange] = useState(() => defaultRange());
  const [granularity, setGranularity] = useState('daily');
  const [overviewData, setOverviewData] = useState({
    totalUsers: 0,
    newPremiumUsers: 0,
    estimatedRevenue: 0,
  });
  const [systemOverview, setSystemOverview] = useState({
    totalUsers: 0,
    totalPremiumUsers: 0,
  });
  const [geoHeatmapRows, setGeoHeatmapRows] = useState([]);
  const [geoFallbackRows, setGeoFallbackRows] = useState([]);
  const [heatmapCells, setHeatmapCells] = useState([]);
  const [role, setRole] = useState('ADMIN'); // Default to ADMIN
  const [heatmapRange, setHeatmapRange] = useState(() => {
    const { start, end } = defaultUtcRange7d();
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const startIso = useMemo(() => toIso(start), [start]);
  const endIso = useMemo(() => toIso(end), [end]);

  // ⚙️ ROLE DETECTION
  useEffect(() => {
    const token = localStorage.getItem("vngo_admin_jwt");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role) setRole(payload.role);
      } catch (e) {
        console.error("Failed to decode token", e);
      }
    }
  }, []);

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const { start: hmStart, end: hmEnd } = defaultUtcRange7d();
      const hmStartIso = hmStart.toISOString();
      const hmEndIso = hmEnd.toISOString();
      setHeatmapRange({ startIso: hmStartIso, endIso: hmEndIso });

      const withGuard = async (p, fallback = []) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // ⚙️ EXTENDED TIMEOUT FOR COMPLEX AGGS

          const res = await p;
          clearTimeout(timeoutId);
          return res;
        } catch (err) {
          console.error("[Intelligence] API call failed or timed out", err.message);
          return fallback;
        }
      };

      const isOwner = role === 'OWNER';
      
      const requests = [
        withGuard(
          isOwner ? Promise.resolve([]) : fetchIntelligenceGeoHeatmap(startIso, endIso), 
          []
        ),
        withGuard(
          isOwner ? Promise.resolve([]) : fetchIntelligenceHeatmap(hmStartIso, hmEndIso), 
          []
        ),
        withGuard(
          isOwner ? Promise.resolve({ data: [] }) : fetchMasterPois(1, 200), 
          { data: [], items: [] }
        ),
      ];

      if (!isOwner) {
        requests.push(withGuard(fetchIntelligenceOverview(startIso, endIso), {}));
        requests.push(withGuard(fetchSystemOverview(), {}));
      }

      const results = await Promise.all(requests);
      const [geo, hm, masterPois, overview, sysOverview] = results;

      setGeoHeatmapRows(Array.isArray(geo) ? geo : []);
      setHeatmapCells(Array.isArray(hm) ? hm : []);
      if (overview) {
        setOverviewData({
          totalUsers: overview.totalUsers || 0,
          newPremiumUsers: overview.newPremiumUsers || 0,
          estimatedRevenue: overview.estimatedRevenue || 0,
        });
      }
      if (sysOverview) {
        setSystemOverview({
          totalUsers: sysOverview.totalUsers || 0,
          totalPremiumUsers: sysOverview.totalPremiumUsers || 0,
        });
      }

      const masterPoiRows = Array.isArray(masterPois?.data)
        ? masterPois.data
        : Array.isArray(masterPois?.items)
          ? masterPois.items
          : [];

      const fallback = !isOwner && masterPoiRows.length > 0
        ? masterPoiRows
            .filter((p) => p?.status === 'APPROVED' && p?.location)
            .map((p) => ({
              lat: Number(
                Array.isArray(p.location?.coordinates) ? p.location.coordinates[1] : p.location?.lat,
              ),
              lng: Number(
                Array.isArray(p.location?.coordinates) ? p.location.coordinates[0] : p.location?.lng,
              ),
              total_events: Math.max(1, Number(p.priority) || 1),
            }))
            .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lng))
        : [];
      setGeoFallbackRows(fallback);
    } catch (e) {
      setErr(e.message || 'Không thể tải số liệu Intelligence');
      setTimeline([]);
      setByFamily([]);
      setByAuth([]);
      setGeoHeatmapRows([]);
      setGeoFallbackRows([]);
      setHeatmapCells([]);
    } finally {
      setLoading(false);
    }
  }, [startIso, endIso, granularity, role]);

  useEffect(() => {
    load();
  }, [load]);

  const OverviewCards = () => (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <div className="group relative overflow-hidden rounded-2xl border border-white/20 bg-emerald-50/50 p-6 shadow-xl shadow-emerald-900/5 transition-all hover:-translate-y-1 hover:shadow-emerald-900/10 dark:bg-emerald-900/10">
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/10 transition-all group-hover:scale-150" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600/80">Tổng người dùng</p>
            <p className="mt-2 text-4xl font-black text-slate-900">{overviewData.totalUsers.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-emerald-500 p-3 text-white shadow-lg shadow-emerald-500/40">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          </div>
        </div>
        <p className="relative mt-4 text-[10px] font-medium text-emerald-600/60 uppercase tracking-tighter italic">Lifetime users</p>
      </div>

      <div className="group relative overflow-hidden rounded-2xl border border-white/20 bg-indigo-50/50 p-6 shadow-xl shadow-indigo-900/5 transition-all hover:-translate-y-1 hover:shadow-indigo-900/10 dark:bg-indigo-900/10">
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-indigo-500/10 transition-all group-hover:scale-150" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600/80">Premium Mới</p>
            <p className="mt-2 text-4xl font-black text-slate-900">{overviewData.newPremiumUsers.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-indigo-500 p-3 text-white shadow-lg shadow-indigo-500/40">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
            </svg>
          </div>
        </div>
        <p className="relative mt-4 text-[10px] font-medium text-indigo-600/60 uppercase tracking-tighter italic">Trong kỳ báo cáo</p>
      </div>

      <div className="group relative overflow-hidden rounded-2xl border border-white/20 bg-amber-50/50 p-6 shadow-xl shadow-amber-900/5 transition-all hover:-translate-y-1 hover:shadow-amber-900/10 dark:bg-amber-900/10">
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-500/10 transition-all group-hover:scale-150" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-600/80">Doanh thu ước tính</p>
            <p className="mt-2 text-4xl font-black text-slate-900">${overviewData.estimatedRevenue.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-amber-500 p-3 text-white shadow-lg shadow-amber-500/40">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
        </div>
        <p className="relative mt-4 text-[10px] font-medium text-amber-600/60 uppercase tracking-tighter italic">Premium × $20 USD</p>
      </div>
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl font-black tracking-tight text-slate-900">Intelligence <span className="text-emerald-600">Hub</span></h1>
        <p className="text-sm font-medium text-slate-500">
          {role === 'OWNER' 
            ? 'Thống kê lượng khách tại các cơ sở (POI) của bạn.' 
            : 'Phân tích dữ liệu hệ thống thời gian thực dựa trên các rollup metadata.'}
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tùy chỉnh thời gian</span>
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-1.5 ring-1 ring-slate-200">
              <input
                type="date"
                className="bg-transparent px-2 py-1 text-xs font-bold text-slate-700 outline-none"
                value={utcDateInputValue(start)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const d = new Date(`${v}T00:00:00.000Z`);
                  setRange((prev) => ({ ...prev, start: d }));
                }}
              />
              <span className="text-slate-300">/</span>
              <input
                type="date"
                className="bg-transparent px-2 py-1 text-xs font-bold text-slate-700 outline-none"
                value={utcDateInputValue(end)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const d = new Date(`${v}T23:59:59.999Z`);
                  setRange((prev) => ({ ...prev, end: d }));
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Độ chi tiết</span>
            <select
              className="rounded-xl bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 outline-none focus:ring-emerald-500"
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
            >
              <option value="hourly">Rollup Giờ</option>
              <option value="daily">Rollup Ngày</option>
              <option value="weekly">Rollup Tuần</option>
              {role !== 'OWNER' && <option value="monthly">Tháng</option>}
              {role !== 'OWNER' && <option value="yearly">Năm</option>}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="ml-auto flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-bold text-white transition-all hover:bg-emerald-600 disabled:opacity-50"
        >
          {loading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" fill="none" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" className="opacity-75" fill="none" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          )}
          REFRESH DATA
        </button>
      </div>

      {err && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Đang tải số liệu…</p>
      ) : (
        <div className="mt-8 space-y-10">
          {role !== 'OWNER' && (
            <>
              <section>
                <h2 className="mb-4 text-lg font-medium text-slate-800">Tổng quan hệ thống</h2>
                <OverviewCards />
              </section>

              <section>
                <h2 className="mb-4 text-lg font-medium text-slate-800">Thống kê tổng thể (Lifetime)</h2>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Lifetime Stats Cards */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-600">Tổng quan người dùng</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Tổng người dùng</span>
                        <span className="text-2xl font-black text-slate-900">{systemOverview.totalUsers.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Người dùng Premium</span>
                        <span className="text-2xl font-black text-indigo-600">{systemOverview.totalPremiumUsers.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                        <span className="text-sm font-bold text-slate-700">Tỷ lệ Premium</span>
                        <span className="text-xl font-black text-emerald-600">
                          {systemOverview.totalUsers > 0
                            ? ((systemOverview.totalPremiumUsers / systemOverview.totalUsers) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Pie Chart */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-600">Phân bổ người dùng</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Premium', value: systemOverview.totalPremiumUsers },
                            { name: 'Free', value: systemOverview.totalUsers - systemOverview.totalPremiumUsers }
                          ]}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          <Cell fill="#6366f1" />
                          <Cell fill="#e2e8f0" />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Bar Chart */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
                    <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-600">So sánh người dùng</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart
                        data={[
                          { category: 'Tổng người dùng', count: systemOverview.totalUsers },
                          { category: 'Premium', count: systemOverview.totalPremiumUsers },
                          { category: 'Free', count: systemOverview.totalUsers - systemOverview.totalPremiumUsers }
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="category" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#6366f1" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-medium text-slate-800">Heatmap vị trí khách theo POI</h2>
                <div className="mt-3">
                  <GeoHeatmapMap rows={geoHeatmapRows} fallbackRows={geoFallbackRows} isLoading={loading} />
                </div>
              </section>

              <Heatmap
                cells={heatmapCells}
                rangeStartIso={heatmapRange.startIso}
                rangeEndIso={heatmapRange.endIso}
                subtitle="Nguồn: uis_events_raw (7 ngày UTC gần nhất), không dùng rollup."
              />
            </>
          )}
          
          {role === 'OWNER' && (
            <p className="text-sm text-slate-500 italic">Số liệu chi tiết cho Owner đang được phát triển.</p>
          )}
        </div>
      )}
    </div>
  );
}
