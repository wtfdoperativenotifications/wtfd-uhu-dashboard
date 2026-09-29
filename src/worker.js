const DISPLAY = {
  R43: "E43",
  R44: "E44"
};

const ORDER = ["M41","M42","E43","E44","M45","E42","E45","L41","BC40"];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function isoDateUTC(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDateUTC(d);
}

function easternParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  });
  return Object.fromEntries(
    fmt.formatToParts(now)
      .filter(p => p.type !== "literal")
      .map(p => [p.type, p.value])
  );
}

function currentOperationalDate(now = new Date()) {
  const p = easternParts(now);
  const localDate = `${p.year}-${p.month}-${p.day}`;
  return Number(p.hour) < 7 ? addDays(localDate, -1) : localDate;
}

function pct(v) {
  return Number((Number(v || 0) * 100).toFixed(2));
}

function labelResource(id) {
  return DISPLAY[id] || id;
}

function sortResources(rows) {
  const pos = new Map(ORDER.map((x, i) => [x, i]));
  return [...rows].sort((a, b) => {
    const ai = pos.has(a.display_id) ? pos.get(a.display_id) : 999;
    const bi = pos.has(b.display_id) ? pos.get(b.display_id) : 999;
    return ai - bi || a.display_id.localeCompare(b.display_id);
  });
}

async function getLatestCompletedDate(env) {
  const current = currentOperationalDate();
  const row = await env.DB.prepare(`
    SELECT MAX(shift_date) AS shift_date
    FROM resource_uhu_daily
    WHERE shift_date < ?
  `).bind(current).first();
  return row?.shift_date || addDays(current, -1);
}

async function getDashboard(env, requestedDate) {
  const latestCompleted = await getLatestCompletedDate(env);
  const selectedDate =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate <= latestCompleted
      ? requestedDate
      : latestCompleted;

  const year = selectedDate.slice(0, 4);
  const yearStart = `${year}-01-01`;
  const trendStart = addDays(selectedDate, -29);

  const dailySeed = await env.DB.prepare(`
    SELECT shift_number, shift_name
    FROM resource_uhu_daily
    WHERE shift_date = ?
    LIMIT 1
  `).bind(selectedDate).first();

  const selectedShiftNumber = Number(dailySeed?.shift_number || 0);
  const selectedShiftName = dailySeed?.shift_name || null;

  const [dailyResult, ytdResult, platoonYtdResult, departmentPlatoonResult, trendResult] = await Promise.all([
    env.DB.prepare(`
      SELECT
        resource_id,
        shift_date,
        shift_number,
        shift_name,
        run_count,
        committed_seconds,
        committed_minutes,
        committed_hours,
        available_minutes,
        daily_uhu
      FROM resource_uhu_daily
      WHERE shift_date = ?
    `).bind(selectedDate).all(),

    env.DB.prepare(`
      SELECT
        resource_id,
        SUM(run_count) AS ytd_runs,
        SUM(committed_seconds) AS ytd_committed_seconds,
        ROUND(SUM(committed_seconds) / 3600.0, 1) AS ytd_committed_hours,
        SUM(available_minutes) AS ytd_available_minutes,
        ROUND(
          SUM(committed_seconds) /
          NULLIF(SUM(available_minutes) * 60.0, 0),
          4
        ) AS ytd_uhu
      FROM resource_uhu_daily
      WHERE shift_date >= ?
        AND shift_date <= ?
      GROUP BY resource_id
    `).bind(yearStart, selectedDate).all(),

    env.DB.prepare(`
      SELECT
        resource_id,
        SUM(run_count) AS platoon_ytd_runs,
        SUM(committed_seconds) AS platoon_ytd_committed_seconds,
        ROUND(SUM(committed_seconds) / 3600.0, 1) AS platoon_ytd_committed_hours,
        SUM(available_minutes) AS platoon_ytd_available_minutes,
        ROUND(
          SUM(committed_seconds) /
          NULLIF(SUM(available_minutes) * 60.0, 0),
          4
        ) AS platoon_ytd_uhu
      FROM resource_uhu_daily
      WHERE shift_date >= ?
        AND shift_date <= ?
        AND shift_number = ?
      GROUP BY resource_id
    `).bind(yearStart, selectedDate, selectedShiftNumber).all(),

    env.DB.prepare(`
      SELECT
        SUM(run_count) AS platoon_runs,
        SUM(committed_seconds) AS platoon_committed_seconds,
        SUM(available_minutes) AS platoon_available_minutes,
        ROUND(
          SUM(committed_seconds) /
          NULLIF(SUM(available_minutes) * 60.0, 0),
          4
        ) AS platoon_system_uhu
      FROM resource_uhu_daily
      WHERE shift_date >= ?
        AND shift_date <= ?
        AND shift_number = ?
    `).bind(yearStart, selectedDate, selectedShiftNumber).first(),

    env.DB.prepare(`
      SELECT
        shift_date,
        resource_id,
        daily_uhu,
        run_count,
        committed_hours
      FROM resource_uhu_daily
      WHERE shift_date >= ?
        AND shift_date <= ?
      ORDER BY shift_date, resource_id
    `).bind(trendStart, selectedDate).all()
  ]);

  const ytdById = new Map((ytdResult.results || []).map(r => [r.resource_id, r]));
  const platoonYtdById = new Map((platoonYtdResult.results || []).map(r => [r.resource_id, r]));

  const resources = (dailyResult.results || []).map(d => {
    const y = ytdById.get(d.resource_id) || {};
    const p = platoonYtdById.get(d.resource_id) || {};
    return {
      resource_id: d.resource_id,
      display_id: labelResource(d.resource_id),
      shift_date: d.shift_date,
      shift_number: d.shift_number,
      shift_name: d.shift_name,
      daily_runs: Number(d.run_count || 0),
      daily_committed_minutes: Number(d.committed_minutes || 0),
      daily_committed_hours: Number(d.committed_hours || 0),
      daily_uhu: Number(d.daily_uhu || 0),
      daily_uhu_pct: pct(d.daily_uhu),
      platoon_ytd_runs: Number(p.platoon_ytd_runs || 0),
      platoon_ytd_committed_hours: Number(p.platoon_ytd_committed_hours || 0),
      platoon_ytd_available_hours: Number((Number(p.platoon_ytd_available_minutes || 0) / 60).toFixed(1)),
      platoon_ytd_uhu: Number(p.platoon_ytd_uhu || 0),
      platoon_ytd_uhu_pct: pct(p.platoon_ytd_uhu),
      ytd_runs: Number(y.ytd_runs || 0),
      ytd_committed_hours: Number(y.ytd_committed_hours || 0),
      ytd_available_hours: Number((Number(y.ytd_available_minutes || 0) / 60).toFixed(1)),
      ytd_uhu: Number(y.ytd_uhu || 0),
      ytd_uhu_pct: pct(y.ytd_uhu)
    };
  });

  const sorted = sortResources(resources);

  const dailyCommitted = sorted.reduce((s, r) => s + Number(r.daily_committed_hours || 0), 0);
  const dailyAvailable = sorted.reduce((s) => s + 24, 0);
  const ytdCommitted = sorted.reduce((s, r) => s + Number(r.ytd_committed_hours || 0), 0);
  const ytdAvailable = sorted.reduce((s, r) => s + Number(r.ytd_available_hours || 0), 0);

  const shiftName = selectedShiftName || sorted[0]?.shift_name || null;
  const shiftNumber = selectedShiftNumber || sorted[0]?.shift_number || null;

  const trend = (trendResult.results || []).map(r => ({
    shift_date: r.shift_date,
    resource_id: r.resource_id,
    display_id: labelResource(r.resource_id),
    daily_uhu: Number(r.daily_uhu || 0),
    daily_uhu_pct: pct(r.daily_uhu),
    run_count: Number(r.run_count || 0),
    committed_hours: Number(r.committed_hours || 0)
  }));

  return {
    selected_date: selectedDate,
    latest_completed_date: latestCompleted,
    year,
    shift_name: shiftName,
    shift_number: shiftNumber,
    resources: sorted,
    summary: {
      daily_runs: sorted.reduce((s, r) => s + r.daily_runs, 0),
      daily_committed_hours: Number(dailyCommitted.toFixed(2)),
      daily_system_uhu: Number((dailyCommitted / dailyAvailable).toFixed(4)),
      daily_system_uhu_pct: Number(((dailyCommitted / dailyAvailable) * 100).toFixed(2)),
      ytd_runs: sorted.reduce((s, r) => s + r.ytd_runs, 0),
      ytd_committed_hours: Number(ytdCommitted.toFixed(1)),
      ytd_system_uhu: ytdAvailable ? Number((ytdCommitted / ytdAvailable).toFixed(4)) : 0,
      ytd_system_uhu_pct: ytdAvailable ? Number(((ytdCommitted / ytdAvailable) * 100).toFixed(2)) : 0,
      platoon_ytd_runs: Number(departmentPlatoonResult?.platoon_runs || 0),
      platoon_ytd_committed_hours: Number((Number(departmentPlatoonResult?.platoon_committed_seconds || 0) / 3600).toFixed(1)),
      platoon_ytd_system_uhu: Number(departmentPlatoonResult?.platoon_system_uhu || 0),
      platoon_ytd_system_uhu_pct: pct(departmentPlatoonResult?.platoon_system_uhu || 0)
    },
    trend
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/uhu") {
      try {
        const data = await getDashboard(env, url.searchParams.get("date"));
        return json(data);
      } catch (err) {
        return json({
          error: "UHU query failed",
          message: err instanceof Error ? err.message : String(err)
        }, 500);
      }
    }

    if (url.pathname === "/api/health") {
      try {
        const row = await env.DB.prepare(
          "SELECT COUNT(*) AS rows FROM resource_uhu_daily"
        ).first();
        return json({
          ok: true,
          database: true,
          resource_uhu_daily_rows: Number(row?.rows || 0),
          current_operational_date: currentOperationalDate()
        });
      } catch (err) {
        return json({
          ok: false,
          database: false,
          message: err instanceof Error ? err.message : String(err)
        }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
