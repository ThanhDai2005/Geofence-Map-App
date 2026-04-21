import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, useMap, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

// ⚙️ IMPLEMENTATION PART 2 — COLOR FUNCTION
export function getColor(value) {
  const r = Math.floor(255 * value);
  const g = Math.floor(255 * (1 - value));
  return `rgb(${r},${g},0)`;
}

// ⚙️ IMPLEMENTATION PART 3 — LEAFLET HEATMAP LAYER
function HeatmapLayer({ points, longitudeExtractor, latitudeExtractor, intensityExtractor }) {
  const map = useMap();

  useEffect(() => {
    if (!Array.isArray(points) || points.length === 0) return undefined;

    const heatData = points.map(p => [
      latitudeExtractor(p),
      longitudeExtractor(p),
      intensityExtractor(p)
    ]);

    const layer = L.heatLayer(heatData, {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      minOpacity: 0.4,
      gradient: {
        0.0: getColor(0),
        0.5: getColor(0.5),
        1.0: getColor(1),
      },
    }).addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, points, latitudeExtractor, longitudeExtractor, intensityExtractor]);

  return null;
}

function FitBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!Array.isArray(points) || points.length === 0) return;
    const validPoints = points.map(p => [Number(p.lat), Number(p.lng)]).filter(p => !Number.isNaN(p[0]) && !Number.isNaN(p[1]));
    if (validPoints.length === 0) return;

    const bounds = L.latLngBounds(validPoints);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    }
  }, [map, points]);

  return null;
}

// ⚙️ IMPLEMENTATION PART 5 — UI INTEGRATION (OPTION A — HOVER)
function PredictionMarkers({ points }) {
  const LEVEL_COLORS = {
    LOW: '#10b981',   // 🟢
    MEDIUM: '#f59e0b', // 🟡
    HIGH: '#ef4444'   // 🔴
  };

  return (
    <>
      {points.map((p, idx) => (
        <CircleMarker
          key={p.poi_id || idx}
          center={[p.lat, p.lng]}
          radius={8}
          pathOptions={{
            fillColor: LEVEL_COLORS[p.level] || '#64748b',
            fillOpacity: 0.6,
            color: LEVEL_COLORS[p.level] || '#64748b',
            weight: 2,
            // ⚙️ IMPLEMENTATION PART 6 — VISUAL DIFFERENTIATION
            dashArray: p.predicted > p.current ? '5, 5' : null 
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={1}>
            <div className="p-1 min-w-[120px]">
              <div className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-1">
                {p.name || 'POI'}
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between items-center bg-slate-50 px-1.5 py-0.5 rounded">
                  <span className="text-slate-500">Now:</span>
                  <span className="font-mono font-bold text-slate-900">{p.current}</span>
                </div>
                <div className="flex justify-between items-center bg-blue-50 px-1.5 py-0.5 rounded">
                  <span className="text-blue-600 font-medium">Next hour:</span>
                  <span className="font-mono font-bold text-blue-700">{p.predicted}</span>
                </div>
                <div className="mt-1 flex items-center justify-center gap-1.5 py-0.5 rounded-full border border-slate-200 text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LEVEL_COLORS[p.level] }} />
                  <span style={{ color: LEVEL_COLORS[p.level] }}>{p.level} Traffic</span>
                </div>
              </div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

// ⚙️ IMPLEMENTATION PART 5 — LEGEND (BẮT BUỘC)
function HeatmapLegend() {
  return (
    <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-slate-200 pointer-events-auto">
      <h4 className="text-sm font-bold text-slate-800 mb-3">Mức độ đông đúc</h4>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded hover:scale-110 transition-transform shadow-sm" style={{ backgroundColor: getColor(0) }} />
          <span className="text-sm text-slate-600 font-medium">Ít người (Low traffic)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded hover:scale-110 transition-transform shadow-sm" style={{ backgroundColor: getColor(0.5) }} />
          <span className="text-sm text-slate-600 font-medium">Trung bình (Medium)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded hover:scale-110 transition-transform shadow-sm" style={{ backgroundColor: getColor(1) }} />
          <span className="text-sm text-slate-600 font-medium">Rất đông (High traffic)</span>
        </div>
      </div>
    </div>
  );
}

export default function GeoHeatmapMap({ 
  rows = [], 
  fallbackRows = [], 
  isOwner = false, 
  ownerPoiIds = [],
  onLiveUpdate = null,
  isLoading = false
}) {
  const activeRows = Array.isArray(rows) && rows.length > 0 ? rows : fallbackRows;

  // ⚙️ IMPLEMENTATION PART 6 — LIVE UPDATE
  useEffect(() => {
    if (onLiveUpdate) {
      const tid = setInterval(() => {
        onLiveUpdate();
      }, 30000);
      return () => clearInterval(tid);
    }
  }, [onLiveUpdate]);

  const points = useMemo(() => {
    // ⚙️ IMPLEMENTATION PART 4 — OWNER FILTER
    let filteredData = activeRows;
    if (isOwner && Array.isArray(ownerPoiIds) && ownerPoiIds.length > 0) {
      filteredData = filteredData.filter(p => ownerPoiIds.includes(p.poi_id));
    }

    if (filteredData.length === 0) return [];

    // ⚙️ IMPLEMENTATION PART 1 & 6 — NORMALIZATION AND OUTLIER PROTECTION
    // Step 1: Clamp and find max
    const counts = filteredData
      .map((x) => Number(x.total_unique_visitors || x.total_events || 0))
      .filter((v) => v >= 0)
      .sort((a, b) => a - b);

    if (counts.length === 0) return [];

    const min = counts[0];
    // ⚙️ OUTLIER PROTECTION: max out at 95th percentile (or max if small data) to avoid 1 POI = 9999 ruining map
    const maxThreshold = counts.length > 10 ? counts[Math.floor(counts.length * 0.95)] : counts[counts.length - 1];

    // ⚙️ LOGGING (DEMO MODE)
    console.log("[Heatmap] Processing points:", filteredData.length);
    console.log("[Heatmap] Max intensity threshold (p95 / clamped max):", maxThreshold);

    const mappedPoints = filteredData
      .map((r) => {
        const lat = Number(r.lat);
        const lng = Number(r.lng);
        let value = Number(r.total_unique_visitors || r.total_events || 0);

        // ⚙️ IMPLEMENTATION PART 5 — DATA SANITY CHECK
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || value < 0) {
            return null;
        }

        // Apply clamping
        value = Math.min(value, maxThreshold);

        // Step 2: Normalize (0 to 1)
        const normalized = (value - min) / (maxThreshold - min || 1);

        return {
          ...r,
          lat,
          lng,
          intensity: normalized,
        };
      })
      .filter(Boolean);

    console.log("[Heatmap] Valid points rendered:", mappedPoints.length);
    return mappedPoints;
  }, [activeRows, isOwner, ownerPoiIds]);

  // ⚙️ IMPLEMENTATION PART 3 & 2 — LOADING & EMPTY STATE
  if (isLoading) {
    return (
      <div className="flex h-[480px] flex-col gap-3 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 font-medium">
        <svg className="h-8 w-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
        </svg>
        Đang tải dữ liệu... (Loading)
      </div>
    );
  }

  if (!points.length) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 font-medium">
        Không có dữ liệu lưu lượng / No traffic data available
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      <MapContainer
        center={[10.7769, 106.7009]}
        zoom={12}
        scrollWheelZoom
        style={{ height: 480, width: '100%', zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <HeatmapLayer 
          points={points}
          longitudeExtractor={m => m.lng}
          latitudeExtractor={m => m.lat}
          intensityExtractor={m => m.intensity}
        />
        <PredictionMarkers points={points} />
        <FitBounds points={points} />
      </MapContainer>
      <HeatmapLegend />
    </div>
  );
}
