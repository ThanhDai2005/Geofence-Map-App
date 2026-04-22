import { useEffect, useState } from 'react';
import { fetchPoiChangeRequests, reviewPoiChangeRequest } from '../apiClient.js';

export default function AdminChangeRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [reason, setReason] = useState('');

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const res = await fetchPoiChangeRequests();
      setRequests(res.data || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleReview(id, status) {
    if (status === 'REJECTED' && !reason) {
      alert('Vui lòng nhập lý do từ chối.');
      return;
    }
    try {
      await reviewPoiChangeRequest(id, status, reason);
      alert('Đã ' + (status === 'APPROVED' ? 'duyệt' : 'từ chối') + ' yêu cầu.');
      setReviewingId(null);
      setReason('');
      load();
    } catch (e) {
      alert('Lỗi: ' + e.message);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Yêu cầu thay đổi POI</h1>
      <p className="text-sm text-slate-600 mb-6">Xử lý các yêu cầu Chỉnh sửa hoặc Xóa từ POI Owner.</p>

      {err && <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-lg border border-red-200">{err}</div>}

      {loading ? (
        <p>Đang tải...</p>
      ) : requests.length === 0 ? (
        <p className="text-slate-500 bg-slate-50 p-8 rounded-lg border border-slate-200 text-center">Không có yêu cầu nào chờ xử lý.</p>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div key={req._id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${req.type === 'DELETE' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                    {req.type === 'DELETE' ? 'Yêu cầu Xóa' : 'Yêu cầu Cập nhật'}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">{req.poi_id?.name || req.poi_id?.code}</h3>
                  <p className="text-xs text-slate-500">Người gửi: {req.submittedBy?.email}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setReviewingId(req._id)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                  >
                    Xử lý
                  </button>
                </div>
              </div>

              {req.type === 'UPDATE' && (
                <div className="bg-slate-50 p-4 rounded-lg text-sm grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                  <p className="md:col-span-2 border-b border-slate-200 pb-1 mb-1 font-semibold text-slate-700">Dữ liệu đề xuất mới:</p>
                  <p><strong>Tên:</strong> {req.data?.name}</p>
                  <p><strong>Tóm tắt:</strong> {req.data?.summary || '—'}</p>
                  <p><strong>Văn bản ngắn:</strong> {req.data?.narrationShort || '—'}</p>
                  <p><strong>Bán kính:</strong> {req.data?.radius}m</p>
                  <p><strong>Priority:</strong> {req.data?.priority}</p>
                  <p><strong>Tọa độ:</strong> {req.data?.location?.lat}, {req.data?.location?.lng}</p>
                  <div className="md:col-span-2 mt-2">
                    <p><strong>Văn bản dài:</strong></p>
                    <p className="mt-1 text-slate-600 italic line-clamp-3">{req.data?.narrationLong || '—'}</p>
                  </div>
                </div>
              )}

              {reviewingId === req._id && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Lý do (nếu từ chối):</label>
                  <textarea
                    className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Nhập lý do..."
                  />
                  <div className="flex justify-end gap-2 mt-3">
                    <button onClick={() => setReviewingId(null)} className="px-3 py-1.5 text-sm text-slate-600">Hủy</button>
                    <button onClick={() => handleReview(req._id, 'REJECTED')} className="px-3 py-1.5 bg-red-50 text-red-700 rounded text-sm">Từ chối</button>
                    <button onClick={() => handleReview(req._id, 'APPROVED')} className="px-3 py-1.5 bg-emerald-600 text-white rounded text-sm">Chấp thuận</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
