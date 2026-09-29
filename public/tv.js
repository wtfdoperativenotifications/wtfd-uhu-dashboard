const DISPLAY_RESOURCES=Object.freeze({
  hq:["M41","M42","E43","E44","M45","E42","E45","L41","BC40"],
  station41:["M41","L41"],station42:["M42","E42"],station43:["E43"],
  station44:["E44"],station45:["M45","E45","BC40"]
});
const qs=new URLSearchParams(location.search);
const display=String(qs.get("display")||"hq").toLowerCase();
const view=document.body.dataset.view||"summary";

function pct(v){return Number(v||0).toFixed(1)+"%"}
function fmtDate(s,long=false){
  if(!s)return "—"; const [y,m,d]=s.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US",long?{month:"long",day:"numeric",year:"numeric"}:{month:"short",day:"numeric"}).format(new Date(y,m-1,d));
}
function addDay(s){const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)}
function allowed(rows){const set=new Set(DISPLAY_RESOURCES[display]||DISPLAY_RESOURCES.hq);return rows.filter(r=>set.has(r.display_id))}
function delta(v,b){const d=Number(v||0)-Number(b||0);return (d>=0?"+":"")+d.toFixed(1)+" pts"}
function displayLabel(){return display==="hq"?"HEADQUARTERS · ALL STAFFED RESOURCES":"STATION "+display.replace("station","")+" · ASSIGNED RESOURCES"}

function renderSummary(data){
  const rows=allowed(data.resources), deptP=Number(data.summary.platoon_ytd_system_uhu_pct||0), deptAll=Number(data.summary.ytd_system_uhu_pct||0);
  document.body.innerHTML=`<main class="tv">
    <header class="header"><div><div class="kicker">WASHINGTON TOWNSHIP FIRE DEPARTMENT</div><h1>UNIT HOUR UTILIZATION</h1></div>
    <div class="shift"><strong>${data.shift_name} / PLATOON ${data.shift_number}</strong><span>PREVIOUS SHIFT · ${fmtDate(data.selected_date)} 07:00 → ${fmtDate(addDay(data.selected_date))} 07:00</span></div></header>
    <section class="bench">
      <div class="benchCard"><span>Previous Shift — Department</span><strong>${pct(data.summary.daily_system_uhu_pct)}</strong></div>
      <div class="benchCard"><span>${data.shift_name} YTD — Department</span><strong>${pct(deptP)}</strong></div>
      <div class="benchCard"><span>All Platoons YTD — Department</span><strong>${pct(deptAll)}</strong></div>
    </section>
    <section class="units">${rows.map(r=>`<article class="unit">
      <div class="unitId">${r.display_id}</div>
      <div class="primary"><span>Previous Shift</span><strong>${pct(r.daily_uhu_pct)}</strong><small>${r.daily_runs} runs · ${Number(r.daily_committed_hours).toFixed(1)} hrs</small></div>
      <div class="compare"><div><span>${data.shift_name} YTD</span><strong>${pct(r.platoon_ytd_uhu_pct)}</strong></div><div><span>vs Dept ${data.shift_name}</span><strong class="delta">${delta(r.platoon_ytd_uhu_pct,deptP)}</strong></div></div>
    </article>`).join("")}</section>
    <footer class="footer"><span>E43 = shared M43/E43 · E44 = shared M44/E44</span><span>UHU = committed time ÷ available unit hours</span></footer>
  </main>`;
}

function spark(points,bench){
  const w=500,h=110,p=5,vals=points.map(x=>Number(x.daily_uhu_pct||0)),max=Math.max(25,Number(bench||0),...vals);
  const step=points.length>1?(w-p*2)/(points.length-1):0, y=v=>h-p-(Number(v||0)/max)*(h-p*2);
  const path=points.map((x,i)=>(i?"L":"M")+" "+(p+i*step).toFixed(1)+" "+y(x.daily_uhu_pct).toFixed(1)).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="${p}" y1="${y(bench)}" x2="${w-p}" y2="${y(bench)}" class="sparkBench"/><path d="${path}" class="sparkLine"/></svg>`;
}
function renderTrend(data){
  const rows=allowed(data.resources), ids=new Set(rows.map(r=>r.display_id)), by=new Map();
  for(const x of data.trend){if(!ids.has(x.display_id))continue;if(!by.has(x.display_id))by.set(x.display_id,[]);by.get(x.display_id).push(x)}
  const cls=rows.length<=2?"few":rows.length<=4?"medium":"all";
  document.body.innerHTML=`<main class="tv trendTv">
    <header class="header"><div><div class="kicker">WASHINGTON TOWNSHIP FIRE DEPARTMENT</div><h1>30-DAY UNIT HOUR UTILIZATION</h1></div>
    <div class="shift"><strong>${displayLabel()}</strong><span>Through ${fmtDate(data.selected_date,true)} · ${data.shift_name} / Platoon ${data.shift_number}</span></div></header>
    <section class="trendGrid ${cls}">${rows.map(r=>{const pts=by.get(r.display_id)||[],avg=pts.length?pts.reduce((a,b)=>a+Number(b.daily_uhu_pct||0),0)/pts.length:0;
      return `<article class="trendCard"><div class="trendHead"><strong>${r.display_id}</strong><div class="trendStats"><span>30-Day Avg <b>${pct(avg)}</b></span><span>${data.shift_name} YTD <b>${pct(r.platoon_ytd_uhu_pct)}</b></span></div></div><div class="sparkWrap">${spark(pts,r.platoon_ytd_uhu_pct)}</div><div class="trendFoot"><span>${pts[0]?fmtDate(pts[0].shift_date):"—"}</span><span>Dashed = ${data.shift_name} YTD</span><span>${pts.at(-1)?fmtDate(pts.at(-1).shift_date):"—"}</span></div></article>`}).join("")}</section>
    <footer class="footer"><span>E43 = shared M43/E43 · E44 = shared M44/E44</span><span>Daily UHU = committed time ÷ available unit hours</span></footer>
  </main>`;
}
fetch("/api/uhu",{cache:"no-store"}).then(r=>r.json().then(d=>({r,d}))).then(({r,d})=>{if(!r.ok)throw new Error(d.message||d.error||"Unable to load UHU");view==="trend"?renderTrend(d):renderSummary(d)}).catch(e=>{document.getElementById("error").style.display="flex";document.getElementById("error").textContent=e.message});
