const $ = (id) => document.getElementById(id);

let dashboard = null;

function fmtDate(s) {
  if (!s) return "—";
  const [y,m,d] = s.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month:"long", day:"numeric", year:"numeric"
  }).format(new Date(y, m - 1, d));
}

function pct(v) {
  return `${Number(v || 0).toFixed(1)}%`;
}

function hours(v) {
  return Number(v || 0).toFixed(2);
}

function showStatus(message) {
  const el = $("status");
  el.textContent = message;
  el.hidden = false;
}

function hideStatus() {
  $("status").hidden = true;
}

function uhuCell(value, kind) {
  const p = Number(value || 0);
  const width = Math.min(100, p * 3.5);
  return `
    <td class="uhu-cell">
      <div class="uhu-top">
        <span class="uhu-value">${pct(p)}</span>
        <span class="muted">${(p/100).toFixed(3)}</span>
      </div>
      <div class="bar ${kind}"><span style="width:${width}%"></span></div>
    </td>`;
}

function renderTable(resources) {
  $("resourceRows").innerHTML = resources.map(r => `
    <tr>
      <td class="resource">${r.display_id}</td>
      <td class="num">${r.daily_runs.toLocaleString()}</td>
      <td class="num">${hours(r.daily_committed_hours)}</td>
      ${uhuCell(r.daily_uhu_pct, "daily")}
      <td class="num">${r.ytd_runs.toLocaleString()}</td>
      <td class="num">${Number(r.ytd_committed_hours).toFixed(1)}</td>
      ${uhuCell(r.ytd_uhu_pct, "ytd")}
    </tr>
  `).join("");
}

function renderTrendSelector(resources) {
  const select = $("trendResource");
  const current = select.value;
  select.innerHTML = resources.map(r =>
    `<option value="${r.display_id}">${r.display_id}</option>`
  ).join("");
  if ([...select.options].some(o => o.value === current)) select.value = current;
  else select.value = resources[0]?.display_id || "";
}

function renderTrend() {
  if (!dashboard) return;
  const resource = $("trendResource").value;
  $("trendTitle").textContent = `${resource} UHU`;
  const rows = dashboard.trend.filter(r => r.display_id === resource);

  const maxPct = Math.max(25, ...rows.map(r => r.daily_uhu_pct));
  $("trendChart").innerHTML = rows.map((r, i) => {
    const h = Math.max(2, (r.daily_uhu_pct / maxPct) * 100);
    const label = i % 3 === 0 || i === rows.length - 1 ? r.shift_date.slice(5) : "";
    return `
      <div class="chart-col">
        <div class="chart-bar-wrap">
          <div class="chart-bar"
               style="height:${h}%"
               data-tip="${r.shift_date}: ${r.daily_uhu_pct.toFixed(1)}% · ${r.run_count} runs"></div>
        </div>
        <div class="chart-date">${label}</div>
      </div>`;
  }).join("");
}

function render(data) {
  dashboard = data;

  $("shiftDate").max = data.latest_completed_date;
  $("shiftDate").value = data.selected_date;
  $("shiftDateLabel").textContent = fmtDate(data.selected_date);
  $("shiftName").textContent = `${data.shift_name || "—"} / Platoon ${data.shift_number || "—"}`;

  $("dailySystemUhu").textContent = pct(data.summary.daily_system_uhu_pct);
  $("dailySystemDetail").textContent =
    `${data.summary.daily_committed_hours.toFixed(2)} committed hours across 9 staffed resources`;

  $("dailyRuns").textContent = data.summary.daily_runs.toLocaleString();

  $("ytdSystemUhu").textContent = pct(data.summary.ytd_system_uhu_pct);
  $("ytdSystemDetail").textContent =
    `${Number(data.summary.ytd_committed_hours).toFixed(1)} committed hours through ${fmtDate(data.selected_date)}`;

  $("ytdRuns").textContent = data.summary.ytd_runs.toLocaleString();

  renderTable(data.resources);
  renderTrendSelector(data.resources);
  renderTrend();
}

async function load(date = "") {
  hideStatus();
  try {
    const qs = date ? `?date=${encodeURIComponent(date)}` : "";
    const res = await fetch(`/api/uhu${qs}`, {cache:"no-store"});
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || "Unable to load UHU data.");
    render(data);
  } catch (err) {
    showStatus(err.message || String(err));
  }
}

$("shiftDate").addEventListener("change", (e) => load(e.target.value));
$("trendResource").addEventListener("change", renderTrend);
load();
