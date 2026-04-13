import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  createPoi,
  deletePoiByCode,
  fetchMasterPois,
  fetchPoiQrToken,
  updatePoiByCode,
} from "../apiClient.js";

function contentCell(content, key) {
  if (!content || typeof content !== "object") return "—";
  const v = content[key];
  return v && String(v).trim() ? String(v).slice(0, 48) : "—";
}

function statusBadge(status) {
  const s = status || "—";
  const cls =
    s === "APPROVED"
      ? "bg-emerald-100 text-emerald-800"
      : s === "PENDING"
        ? "bg-amber-100 text-amber-800"
        : s === "REJECTED"
          ? "bg-red-100 text-red-800"
          : "bg-slate-100 text-slate-700";
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {s}
    </span>
  );
}

function emptyForm() {
  return {
    code: "",
    vi: "",
    en: "",
    lat: "",
    lng: "",
  };
}

export default function MasterPoisPage() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyCode, setBusyCode] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [qrModalRow, setQrModalRow] = useState(null);
  const [qrModalUrl, setQrModalUrl] = useState("");
  const [qrModalLoading, setQrModalLoading] = useState(false);
  const [qrModalErr, setQrModalErr] = useState("");

  const load = useCallback(async (page = 1) => {
    setErr("");
    setLoading(true);
    try {
      const res = await fetchMasterPois(page, pagination.limit);
      const list = Array.isArray(res?.data) ? res.data : [];
      setRows(list);
      if (res?.pagination) setPagination((p) => ({ ...p, ...res.pagination }));
    } catch (e) {
      const msg = e.message || "Không thể tải danh sách POI";
      const hint404 =
        msg.includes("404") || msg.includes("not found")
          ? " — Neu endpoint la /api/v1/admin/pois/master: dung lai backend (npm run dev trong thu muc backend) bang code moi nhat; route GET /master phai co trong admin-poi.routes.js."
          : "";
      setErr(msg + hint404);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit]);

  useEffect(() => {
    load(1);
  }, []);

  function openCreate() {
    setForm(emptyForm());
    setCreateOpen(true);
  }

  function openEdit(row) {
    const loc = row.location || {};
    setForm({
      code: row.code || "",
      vi: contentCell(row.content, "vi") === "—" ? "" : row.content?.vi || "",
      en: contentCell(row.content, "en") === "—" ? "" : row.content?.en || "",
      lat: loc.lat != null ? String(loc.lat) : "",
      lng: loc.lng != null ? String(loc.lng) : "",
    });
    setEditRow(row);
  }

  async function submitCreate(e) {
    e.preventDefault();
    const code = form.code.trim();
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (!code) {
      setErr("Mã địa điểm là bắt buộc");
      return;
    }
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setErr("Vĩ độ và kinh độ phải là số hợp lệ");
      return;
    }
    const vi = form.vi.trim();
    const en = form.en.trim();
    if (!en && !vi) {
      setErr("Cần nhập ít nhất một nội dung tiếng Anh hoặc tiếng Việt");
      return;
    }
    setErr("");
    setBusyCode("__create__");
    try {
      const content = {};
      if (en) content.en = en;
      if (vi) content.vi = vi;
      await createPoi({
        code,
        location: { lat, lng },
        content,
      });
      setCreateOpen(false);
      await load(pagination.page);
    } catch (e) {
      setErr(e.message || "Tạo POI thất bại");
    } finally {
      setBusyCode(null);
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (!editRow?.code) return;
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setErr("Vĩ độ và kinh độ phải là số hợp lệ");
      return;
    }
    const vi = form.vi.trim();
    const en = form.en.trim();
    if (!en && !vi) {
      setErr("Cần nhập ít nhất một nội dung tiếng Anh hoặc tiếng Việt");
      return;
    }
    setErr("");
    setBusyCode(editRow.code);
    try {
      const content = {};
      if (en) content.en = en;
      if (vi) content.vi = vi;
      await updatePoiByCode(editRow.code, {
        location: { lat, lng },
        content,
      });
      setEditRow(null);
      await load(pagination.page);
    } catch (e) {
      setErr(e.message || "Cập nhật POI thất bại");
    } finally {
      setBusyCode(null);
    }
  }

  async function openQrModal(row) {
    if (!row?.id) {
      setErr("Thiếu id POI — không thể tạo QR token.");
      return;
    }
    setQrModalRow(row);
    setQrModalUrl("");
    setQrModalErr("");
    setQrModalLoading(true);
    try {
      const res = await fetchPoiQrToken(row.id);
      const url = res?.data?.scanUrl;
      if (!url || typeof url !== "string") {
        throw new Error("Phản hồi từ endpoint qr-token không hợp lệ");
      }
      setQrModalUrl(url);
    } catch (e) {
      setQrModalErr(e.message || "Không thể tải QR token");
    } finally {
      setQrModalLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteRow?.code) return;
    setBusyCode(deleteRow.code);
    setErr("");
    try {
      await deletePoiByCode(deleteRow.code);
      setDeleteRow(null);
      await load(pagination.page);
    } catch (e) {
      setErr(e.message || "Xóa POI thất bại");
    } finally {
      setBusyCode(null);
    }
  }

  const page = pagination.page || 1;
  const totalPages = pagination.totalPages || 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Quản lý POI</h1>
          <p className="text-sm text-slate-600">
            Danh sách đầy đủ (mọi trạng thái). Tạo / sửa / xóa qua{" "}
            <code className="text-slate-500">/api/v1/pois</code>. Không
            thay thế luồng kiểm duyệt gửi địa điểm từ Owner.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => load(page)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
          >
            Làm mới
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Thêm POI
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          {err}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mb-4 flex items-center gap-3 text-sm text-slate-600">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1)}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-40"
          >
            Trước
          </button>
          <span>
            Trang {page} / {totalPages || 1} ({pagination.total ?? 0} bản ghi)
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1)}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-slate-600">Đang tải...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-slate-600">
          Chưa có POI trong cơ sở dữ liệu.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Mã</th>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Trạng thái</th>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">VI</th>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">EN</th>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Tọa độ</th>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">QR</th>
                <th className="bg-gray-800 px-4 py-3 text-right font-bold text-white">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const loc = row.location;
                const lat = loc != null ? Number(loc.lat) : NaN;
                const lng = loc != null ? Number(loc.lng) : NaN;
                const locStr =
                  loc && !Number.isNaN(lat) && !Number.isNaN(lng)
                    ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                    : "—";
                const busy = busyCode === row.code;
                return (
                  <tr key={String(row.id || row.code)} className="odd:bg-gray-50 even:bg-white">
                    <td className="border-b border-gray-200 px-4 py-3 font-mono text-gray-900">
                      {row.code}
                    </td>
                    <td className="border-b border-gray-200 px-4 py-3">{statusBadge(row.status)}</td>
                    <td className="max-w-[140px] truncate border-b border-gray-200 px-4 py-3 text-gray-900">
                      {contentCell(row.content, "vi")}
                    </td>
                    <td className="max-w-[140px] truncate border-b border-gray-200 px-4 py-3 text-gray-900">
                      {contentCell(row.content, "en")}
                    </td>
                    <td className="border-b border-gray-200 px-4 py-3 text-gray-900">{locStr}</td>
                    <td className="border-b border-gray-200 px-4 py-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openQrModal(row)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                      >
                        Xem QR
                      </button>
                    </td>
                    <td className="border-b border-gray-200 px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openEdit(row)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDeleteRow(row)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Thêm POI</h2>
            <p className="mt-1 text-sm text-slate-400">
              Tạo mới với trạng thái <strong className="text-emerald-400">APPROVED</strong>{" "}
              (luồng quản trị viên).
            </p>
            <form onSubmit={submitCreate} className="mt-4 space-y-3">
              <Field
                label="Mã"
                value={form.code}
                onChange={(v) => setForm((f) => ({ ...f, code: v }))}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Vĩ độ"
                  value={form.lat}
                  onChange={(v) => setForm((f) => ({ ...f, lat: v }))}
                  required
                />
                <Field
                  label="Kinh độ"
                  value={form.lng}
                  onChange={(v) => setForm((f) => ({ ...f, lng: v }))}
                  required
                />
              </div>
              <Field
                label="Nội dung (EN)"
                value={form.en}
                onChange={(v) => setForm((f) => ({ ...f, en: v }))}
              />
              <Field
                label="Nội dung (VI)"
                value={form.vi}
                onChange={(v) => setForm((f) => ({ ...f, vi: v }))}
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busyCode === "__create__"}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busyCode === "__create__" ? "..." : "Tạo mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Sửa POI</h2>
            <p className="mt-1 font-mono text-sm text-emerald-300">
              {editRow.code}
            </p>
            <form onSubmit={submitEdit} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Vĩ độ"
                  value={form.lat}
                  onChange={(v) => setForm((f) => ({ ...f, lat: v }))}
                  required
                />
                <Field
                  label="Kinh độ"
                  value={form.lng}
                  onChange={(v) => setForm((f) => ({ ...f, lng: v }))}
                  required
                />
              </div>
              <Field
                label="Nội dung (EN)"
                value={form.en}
                onChange={(v) => setForm((f) => ({ ...f, en: v }))}
              />
              <Field
                label="Nội dung (VI)"
                value={form.vi}
                onChange={(v) => setForm((f) => ({ ...f, vi: v }))}
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditRow(null)}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busyCode === editRow.code}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busyCode === editRow.code ? "..." : "Lưu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Secure QR (JWT) — large scannable */}
      {qrModalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">QR quét (bảo mật)</h2>
            <p className="mt-1 font-mono text-sm text-emerald-300">{qrModalRow.code}</p>
            <p className="mt-2 text-xs text-slate-400">
              Mã QR là token ký số vĩnh viễn (không hết hạn). Ứng dụng quét sẽ gửi token lên server để xác thực chữ ký.
            </p>
            {qrModalErr && (
              <p className="mt-3 text-sm text-red-300">{qrModalErr}</p>
            )}
            {qrModalLoading && (
              <p className="mt-6 text-center text-slate-400">Đang tạo mã…</p>
            )}
            {!qrModalLoading && qrModalUrl && (
              <div className="mt-6 flex flex-col items-center gap-3">
                <div className="rounded-lg bg-white p-4">
                  <QRCodeSVG value={qrModalUrl} size={240} level="M" includeMargin />
                </div>
                <p className="break-all text-center text-[10px] text-slate-500">{qrModalUrl}</p>
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setQrModalRow(null);
                  setQrModalUrl("");
                  setQrModalErr("");
                }}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Xóa POI?</h2>
            <p className="mt-2 text-sm text-slate-400">
              Xóa vĩnh viễn{" "}
              <span className="font-mono text-emerald-300">
                {deleteRow.code}
              </span>
              . Hành động này không thể hoàn tác.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteRow(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busyCode === deleteRow.code}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-50"
              >
                {busyCode === deleteRow.code ? "..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, required }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <input
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
      />
    </label>
  );
}
