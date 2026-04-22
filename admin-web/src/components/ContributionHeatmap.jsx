import { useMemo } from 'react';
import { HEATMAP_THRESHOLDS, HEATMAP_COLORS } from '../heatmapConfig.js';

function toIsoDay(d) {
  return d.toISOString().slice(0, 10);
}

function parseIsoDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function normalizeDailyCounts(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const day = row?.date;
    if (!day) continue;
    // Handle both field names from backend (total_events or total_unique_visitors)
    const val = Number(row?.total_events ?? row?.total_unique_visitors) || 0;
    map.set(day, (map.get(day) || 0) + val);
  }
  return map;
}

function buildDateRange(start, end) {
  const first = new Date(start);
  first.setUTCHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setUTCHours(0, 0, 0, 0);

  const days = [];
  for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

function startOnMonday(date) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function colorFor(value) {
  if (!value || value <= 0) return HEATMAP_COLORS.EMPTY;
  if (value < HEATMAP_THRESHOLDS.LEVEL_1) return HEATMAP_COLORS.EMPTY; // Still empty if below level 1
  if (value < HEATMAP_THRESHOLDS.LEVEL_2) return HEATMAP_COLORS.LEVEL_1;
  if (value < HEATMAP_THRESHOLDS.LEVEL_3) return HEATMAP_COLORS.LEVEL_2;
  if (value < HEATMAP_THRESHOLDS.LEVEL_4) return HEATMAP_COLORS.LEVEL_3;
  return HEATMAP_COLORS.LEVEL_4;
}

export default function ContributionHeatmap({
  rows = [],
  startIso,
  endIso,
  title = 'Bản đồ hoạt động theo ngày',
  subtitle,
}) {
  const { weeks, monthLabels, maxValue } = useMemo(() => {
    const now = new Date();
    const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const defaultStart = new Date(defaultEnd);
    defaultStart.setUTCDate(defaultStart.getUTCDate() - 364);
    defaultStart.setUTCHours(0, 0, 0, 0);

    const start = startIso ? new Date(startIso) : defaultStart;
    const end = endIso ? new Date(endIso) : defaultEnd;
    const dayCounts = normalizeDailyCounts(rows);
    const days = buildDateRange(start, end);
    const firstGridDay = startOnMonday(days[0] || start);
    const lastGridDay = new Date(days[days.length - 1] || end);
    lastGridDay.setUTCHours(0, 0, 0, 0);

    const paddedDays = [];
    for (let d = new Date(firstGridDay); d <= lastGridDay; d.setUTCDate(d.getUTCDate() + 1)) {
      paddedDays.push(new Date(d));
    }
    while (paddedDays.length % 7 !== 0) {
      const d = new Date(paddedDays[paddedDays.length - 1]);
      d.setUTCDate(d.getUTCDate() + 1);
      paddedDays.push(d);
    }

    const nextWeeks = [];
    for (let i = 0; i < paddedDays.length; i += 7) {
      nextWeeks.push(paddedDays.slice(i, i + 7));
    }

    const labels = [];
    let lastMonth = '';
    nextWeeks.forEach((week) => {
      const month = week[0].toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
      if (month !== lastMonth) {
        labels.push(month);
        lastMonth = month;
      } else {
        labels.push('');
      }
    });

    let max = 0;
    for (const [, val] of dayCounts.entries()) {
      if (val > max) max = val;
    }

    return {
      weeks: nextWeeks.map((week) =>
        week.map((d) => {
          const iso = toIsoDay(d);
          return { iso, value: dayCounts.get(iso) || 0, inRange: d >= days[0] && d <= days[days.length - 1] };
        }),
      ),
      monthLabels: labels,
      maxValue: max,
    };
  }, [rows, startIso, endIso]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-medium text-slate-800">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}

      <div className="mt-4 overflow-x-auto">
        <div className="inline-block min-w-[860px]">
          <div className="ml-12 grid grid-flow-col auto-cols-[14px] gap-1 text-[10px] text-slate-500">
            {monthLabels.map((label, idx) => (
              <div key={`m-${idx}`} className="h-4 w-[14px] text-left">
                {label}
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-start gap-2">
            <div className="grid h-[98px] grid-rows-7 gap-1 pr-1 text-[10px] text-slate-500">
              <div className="h-[12px]" />
              <div className="h-[12px]">Tue</div>
              <div className="h-[12px]" />
              <div className="h-[12px]">Thu</div>
              <div className="h-[12px]" />
              <div className="h-[12px]">Sat</div>
              <div className="h-[12px]" />
            </div>

            <div className="grid grid-flow-col auto-cols-[12px] gap-1">
              {weeks.map((week, weekIdx) => (
                <div key={`w-${weekIdx}`} className="grid grid-rows-7 gap-1">
                  {week.map((cell) => (
                    <div
                      key={cell.iso}
                      className="h-[12px] w-[12px] rounded-[2px] border border-slate-200"
                      style={{ backgroundColor: cell.inRange ? colorFor(cell.value) : '#f8fafc' }}
                      title={`${cell.iso}: ${cell.value} lượt`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
        <span>Ít</span>
        <div className="h-3 w-3 rounded-[2px] border border-slate-200" style={{ backgroundColor: HEATMAP_COLORS.EMPTY }} title="0" />
        <div className="h-3 w-3 rounded-[2px] border border-slate-200" style={{ backgroundColor: HEATMAP_COLORS.LEVEL_1 }} title={`>= ${HEATMAP_THRESHOLDS.LEVEL_1}`} />
        <div className="h-3 w-3 rounded-[2px] border border-slate-200" style={{ backgroundColor: HEATMAP_COLORS.LEVEL_2 }} title={`>= ${HEATMAP_THRESHOLDS.LEVEL_2}`} />
        <div className="h-3 w-3 rounded-[2px] border border-slate-200" style={{ backgroundColor: HEATMAP_COLORS.LEVEL_3 }} title={`>= ${HEATMAP_THRESHOLDS.LEVEL_3}`} />
        <div className="h-3 w-3 rounded-[2px] border border-slate-200" style={{ backgroundColor: HEATMAP_COLORS.LEVEL_4 }} title={`>= ${HEATMAP_THRESHOLDS.LEVEL_4}`} />
        <span>Nhiều</span>
      </div>
    </section>
  );
}
