import { useState } from 'react';
import { submitOwnerPoi } from '../apiClient.js';

export default function SubmitPoiPage() {
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameVi, setNameVi] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('50');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    const c = code.trim();
    const n = nameEn.trim();
    const r = Number(radius);
    const la = Number(lat);
    const ln = Number(lng);
    if (!c || !n) {
      setErr('Mã địa điểm và tên tiếng Anh là bắt buộc.');
      return;
    }
    if (Number.isNaN(la) || Number.isNaN(ln)) {
      setErr('Vĩ độ và kinh độ phải là số hợp lệ.');
      return;
    }
    if (Number.isNaN(r) || r < 1 || r > 100000) {
      setErr('Bán kính phải nằm trong khoảng từ 1 đến 100000 mét.');
      return;
    }
    setLoading(true);
    try {
      const body = {
        code: c,
        name: n,
        radius: r,
        location: { lat: la, lng: ln },
        content: nameVi.trim() ? { vi: nameVi.trim() } : undefined,
      };
      await submitOwnerPoi(body);
      setOk('Gửi thành công. Địa điểm đang chờ quản trị viên duyệt.');
      setCode('');
      setNameEn('');
      setNameVi('');
      setLat('');
      setLng('');
      setRadius('50');
    } catch (e) {
      setErr(e.message || 'Gửi yêu cầu thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Gửi POI mới</h1>
      <p className="mt-1 text-sm text-slate-600">
        Bản ghi mới sẽ có trạng thái <strong className="text-amber-700">PENDING</strong> cho đến khi quản trị viên duyệt.
      </p>

      {err && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div>
      )}
      {ok && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{ok}</div>
      )}

      <form onSubmit={onSubmit} className="mt-8 max-w-xl space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Mã địa điểm (duy nhất)</span>
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Tên (Tiếng Anh)</span>
          <input
            required
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Tên (Tiếng Việt, không bắt buộc)</span>
          <input
            value={nameVi}
            onChange={(e) => setNameVi(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Vĩ độ</span>
            <input
              required
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Kinh độ</span>
            <input
              required
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Bán kính (mét)</span>
          <input
            required
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {loading ? 'Đang gửi…' : 'Gửi để duyệt'}
        </button>
      </form>
    </div>
  );
}
