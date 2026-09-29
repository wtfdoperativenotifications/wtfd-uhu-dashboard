const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(window.location.search);
const tvMode = params.get("tv") === "1";
let dashboard = null;

function fmtDate(s, short = false) {
  if (!s) return "—";
  const [y,m,d] = s.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", short
    ? { month:"short", day:"numeric" }
    : { month:"long", day:"numeric", year:"numeric" }
  ).format(new Date(y, m - 1, d));
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

function pct(v) {
  return `${Number(v || 0).toFixed(1)}%`;
}

function hours(v) {
  return Number(v || 0).toFixed(2);
}

function showStatus(message) {
  let el = $("status");
  if (!el) {
    el = document.createElement("div");
    el.id = "status";
    el.className = "status";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.hidden = false;
}

function hideStatus() {
  const el = $("status");
  if (el) el.hidden = true;
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
  if (!dashboard || tvMode) return;
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

function renderDesktop(data) {
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

function differenceLabel(value, benchmark) {
  const delta = Number(value || 0) - Number(benchmark || 0);
  if (Math.abs(delta) < 0.05) return "≈ dept";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pts`;
}

function renderTv(data) {
  dashboard = data;
  document.documentElement.classList.add("tv-mode");
  document.body.className = "tv-body";

  const endDate = addDays(data.selected_date, 1);
  const deptOverall = Number(data.summary.ytd_system_uhu_pct || 0);
  const deptPlatoon = Number(data.summary.platoon_ytd_system_uhu_pct || 0);

  document.body.innerHTML = `
    <main class="tv-shell">
      <header class="tv-uhu-header">
        <div>
          <div class="tv-kicker">WASHINGTON TOWNSHIP FIRE DEPARTMENT</div>
          <h1>UNIT HOUR UTILIZATION</h1>
        </div>
        <div class="tv-shift-block">
          <strong>${data.shift_name} / PLATOON ${data.shift_number}</strong>
          <span>PREVIOUS SHIFT · ${fmtDate(data.selected_date, true)} 07:00 → ${fmtDate(endDate, true)} 07:00</span>
        </div>
      </header>

      <section class="tv-benchmarks">
        <div class="tv-benchmark">
          <span>Previous Shift — Department</span>
          <strong>${pct(data.summary.daily_system_uhu_pct)}</strong>
        </div>
        <div class="tv-benchmark">
          <span>${data.shift_name} YTD — Department</span>
          <strong>${pct(deptPlatoon)}</strong>
        </div>
        <div class="tv-benchmark">
          <span>All Platoons YTD — Department</span>
          <strong>${pct(deptOverall)}</strong>
        </div>
      </section>

      <section class="tv-grid">
        ${data.resources.map(r => `
          <article class="tv-unit-card">
            <div class="tv-unit-name">${r.display_id}</div>
            <div class="tv-unit-primary">
              <span>Previous Shift</span>
              <strong>${pct(r.daily_uhu_pct)}</strong>
              <small>${r.daily_runs} runs · ${Number(r.daily_committed_hours).toFixed(1)} hrs</small>
            </div>
            <div class="tv-unit-comparison">
              <div>
                <span>${data.shift_name} YTD</span>
                <strong>${pct(r.platoon_ytd_uhu_pct)}</strong>
              </div>
              <div>
                <span>vs Dept ${data.shift_name}</span>
                <strong class="${Number(r.platoon_ytd_uhu_pct) >= deptPlatoon ? "above" : "below"}">
                  ${differenceLabel(r.platoon_ytd_uhu_pct, deptPlatoon)}
                </strong>
              </div>
            </div>
          </article>
        `).join("")}
      </section>

      <footer class="tv-footer">
        <span>E43 = shared M43/E43 crew resource · E44 = shared M44/E44 crew resource</span>
        <span>UHU = committed time ÷ available unit hours</span>
      </footer>
    </main>
    <div id="status" class="status" hidden></div>
  `;
}

async function load(date = "") {
  hideStatus();
  try {
    const qs = date ? `?date=${encodeURIComponent(date)}` : "";
    const res = await fetch(`/api/uhu${qs}`, {cache:"no-store"});
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || "Unable to load UHU data.");
    if (tvMode) renderTv(data);
    else renderDesktop(data);
  } catch (err) {
    showStatus(err.message || String(err));
  }
}

if (!tvMode) {
  $("shiftDate").addEventListener("change", (e) => load(e.target.value));
  $("trendResource").addEventListener("change", renderTrend);
}

load();
