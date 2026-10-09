/* =========================================================================
 * app.js — UI + storage. Depends on Engine (engine.js) and seed (seed.js).
 * No framework; vanilla JS. Data persists in localStorage. Fully offline.
 * ========================================================================= */
const E = window.Engine;
const KEY = "goal-os-v1";

/* ----------------------------- state ----------------------------- */
let state = load();
function load(){
  const raw = localStorage.getItem(KEY);
  if(raw){ try{ return JSON.parse(raw); }catch(e){} }
  return seedState();
}
function seedState(){
  const goals = SEED_GOALS.map((g,i)=> ({ id:"g"+(i+1), active:true, createdAt:todayStr(), ...g }));
  return {
    period: structuredClone(DEFAULT_PERIOD),
    thresholds: structuredClone(DEFAULT_THRESHOLDS),
    freqWeight: structuredClone(FREQ_WEIGHT),
    categories: structuredClone(CATEGORIES),
    goals,
    logs: [],            // {id, goalId, date, value, done, meals, total, note}
    reviews: [],         // {type:'weekly'|'monthly', key, score, answers, snapshot, createdAt}
    settings: { notifDaily:true, notifSunday:true, notifBehind:true, dailyTime:"20:00" },
    _seedExample:false,
  };
}
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function todayStr(){ return E.fmt(new Date()); }
function goalById(id){ return state.goals.find(g=>g.id===id); }
function catById(id){ return state.categories.find(c=>c.id===id); }

/* "virtual today" lets us demo on 8 Oct 2026 regardless of real clock */
let VTODAY = localStorage.getItem(KEY+"-vtoday") || null;
function today(){ return VTODAY || todayStr(); }
function setVToday(d){ VTODAY=d; d? localStorage.setItem(KEY+"-vtoday",d):localStorage.removeItem(KEY+"-vtoday"); render(); }

/* ------------------------- log helpers ------------------------- */
function getLog(goalId, date){ return state.logs.find(l=>l.goalId===goalId && l.date===date); }
function upsertLog(goalId, date, patch){
  let l=getLog(goalId,date);
  if(!l){ l={ id:"l"+Date.now()+Math.random().toString(36).slice(2,6), goalId, date }; state.logs.push(l); }
  Object.assign(l, patch); save();
}
function dayName(dstr){ return new Date(E.parseDate(dstr)).toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"}); }
function shortDay(dstr){ return new Date(E.parseDate(dstr)).toLocaleDateString(undefined,{weekday:"short"}); }

/* ------------------------- flash + modal ------------------------- */
let flashT;
function flash(msg){ const f=document.getElementById("flash"); f.textContent=msg; f.classList.add("show"); clearTimeout(flashT); flashT=setTimeout(()=>f.classList.remove("show"),1600); }
function modal(html){
  const bg=document.createElement("div"); bg.className="modal-bg";
  bg.innerHTML=`<div class="modal"><div class="sheet-handle"></div>${html}</div>`;
  bg.addEventListener("click",e=>{ if(e.target===bg) bg.remove(); });
  document.body.appendChild(bg); return bg;
}
function closeModals(){ document.querySelectorAll(".modal-bg").forEach(m=>m.remove()); }

/* =========================================================================
 * ROUTING
 * ========================================================================= */
let route = "today";
const TABS = [
  {id:"today",   ic:"🏠", label:"Today"},
  {id:"week",    ic:"📊", label:"Week"},
  {id:"goals",   ic:"🎯", label:"Goals"},
  {id:"month",   ic:"📅", label:"Monthly"},
  {id:"period",  ic:"📈", label:"3-Month"},
  {id:"reviews", ic:"📝", label:"Reviews"},
];
function go(r){ route=r; render(); window.scrollTo(0,0); }

/* =========================================================================
 * RENDER
 * ========================================================================= */
function render(){
  renderTopbar();
  const main=document.getElementById("app");
  const views={ today:viewToday, week:viewWeek, goals:viewGoals, month:viewMonth, period:viewPeriod, reviews:viewReviews };
  main.innerHTML = (views[route]||viewToday)();
  renderTabbar();
  bindView();
}
function renderTopbar(){
  const d=today(); const wk=E.weekForDate(d, state.period);
  const inPeriod = d>=state.period.start && d<=state.period.end;
  document.getElementById("topbar").innerHTML=`
    <div><h1>3-Month OS</h1>
      <div class="sub">${inPeriod?`Week ${wk.index} of ${E.buildWeeks(state.period).length}`:"Outside period"} · ${dayName(d)}</div>
    </div>
    <button class="iconbtn" id="btn-settings" title="Settings">⚙️</button>`;
}
function renderTabbar(){
  document.getElementById("tabbar").innerHTML = TABS.map(t=>
    `<button data-tab="${t.id}" class="${route===t.id?"active":""}"><span class="ic">${t.ic}</span>${t.label}</button>`).join("");
}

/* ---------------- helpers for rendering scores ---------------- */
function statusPill(status, text){ return `<span class="pill ${status}">${E.DOT[status]} ${text}</span>`; }
function pbar(pct,status){ return `<div class="pbar ${status}"><span style="width:${E.clamp(pct,0,100)}%"></span></div>`; }

/* =========================================================================
 * VIEW: TODAY  — ultra-fast daily input
 * ========================================================================= */
function viewToday(){
  const d=today();
  const daily = state.goals.filter(g=>g.active!==false && g.freq==="D");
  const weeklyCountToday = state.goals.filter(g=>g.active!==false && g.freq==="W" && ["count","boolean","percentage"].includes(g.type));
  // group daily by category
  const byCat = {};
  for(const g of daily){ (byCat[g.cat]=byCat[g.cat]||[]).push(g); }

  let html = `<h2 class="section">Today — ${dayName(d)}</h2>`;
  if(d<state.period.start||d>state.period.end){
    html += `<div class="hint">This date is outside your 3-month period (${state.period.start} → ${state.period.end}). You can still log, but weekly scores only count in-period days.</div>`;
  }

  // Daily goals grouped
  for(const c of state.categories){
    const gs=byCat[c.id]; if(!gs||!gs.length) continue;
    html += `<h2 class="section">${c.emoji} ${c.name}</h2>`;
    for(const g of gs) html += dailyControl(g,d);
  }

  // Weekly quick-adds that make sense to bump from "today"
  if(weeklyCountToday.length){
    html += `<h2 class="section">⚡ Quick log (weekly goals)</h2>`;
    const wk=E.weekForDate(d,state.period);
    for(const g of weeklyCountToday){
      if(g.type==="count"){
        const total = state.logs.filter(l=>l.goalId===g.id && l.date>=wk.start && l.date<=wk.end).reduce((s,l)=>s+(Number(l.value)||0),0);
        html += `<div class="card tight"><div class="row">
          <div><div class="goal-title">${g.title}</div><div class="goal-meta">This week: ${total}/${g.target} ${g.unit||""}</div></div>
          <button class="btn secondary" style="width:auto;padding:10px 14px" data-quickadd="${g.id}">+1</button>
        </div></div>`;
      } else if(g.type==="boolean"){
        const done = state.logs.some(l=>l.goalId===g.id && l.date>=wk.start && l.date<=wk.end && l.done);
        html += `<div class="card tight"><div class="row">
          <div><div class="goal-title">${g.title}</div><div class="goal-meta">This week</div></div>
          <button class="toggle ${done?"on":""}" data-weekbool="${g.id}">${done?"✓":""}</button>
        </div></div>`;
      } else if(g.type==="percentage"){
        const l=getLog(g.id, wk.start) || state.logs.filter(x=>x.goalId===g.id && x.date>=wk.start && x.date<=wk.end).pop();
        html += `<div class="card tight"><div class="row">
          <div><div class="goal-title">${g.title}</div><div class="goal-meta">${l?`${l.value}/${l.total||100}`:"not set"} this week</div></div>
          <button class="btn secondary" style="width:auto;padding:10px 14px" data-editpct="${g.id}">Edit</button>
        </div></div>`;
      }
    }
  }

  if(!daily.length && !weeklyCountToday.length) html += `<div class="empty">No daily goals. Add some in 🎯 Goals.</div>`;
  html += `<div style="height:8px"></div><button class="btn ghost" id="goto-week">See this week's dashboard →</button>`;
  return html;
}

function dailyControl(g, d){
  if(g.type==="boolean"){
    const l=getLog(g.id,d); const on=!!(l&&l.done);
    const streak=E.booleanStreak(g,state.logs,today());
    return `<div class="card tight"><div class="row">
      <div><div class="goal-title">${g.title}</div><div class="goal-meta">${streak>0?`🔥 ${streak}-day streak`:"Tap to complete"}</div></div>
      <button class="toggle ${on?"on":""}" data-bool="${g.id}">${on?"✓":""}</button></div></div>`;
  }
  if(g.type==="meals"){
    const l=getLog(g.id,d)||{}; const m=l.meals||{};
    const items=[["b","Breakfast"],["l","Lunch"],["d","Dinner"],["s","Snack"]];
    return `<div class="card"><div class="goal-title">${g.title}</div>
      <div class="chips">${items.map(([k,lab])=>`<button class="chip ${m[k]?"on":""}" data-meal="${g.id}:${k}">${m[k]?"✓ ":""}${lab}</button>`).join("")}</div>
      <div class="inline-note">At least ${g.target} meals/day · protein-aware</div></div>`;
  }
  return `<div class="card tight"><div class="row"><div><div class="goal-title">${g.title}</div></div></div></div>`;
}

/* =========================================================================
 * VIEW: THIS WEEK  — auto-calculated dashboard
 * ========================================================================= */
function viewWeek(){
  const d=today(); const wk=E.weekForDate(d,state.period); const th=state.thresholds;
  const o=E.overallScore(state.goals, state.logs, wk, th, d, state.freqWeight, state.categories);
  let html=`<h2 class="section">Week ${wk.index} · ${wk.start} → ${wk.end}</h2>`;
  html += `<div class="card"><div class="row">
      <div><div class="score-big">${E.round(o.score)}% ${E.DOT[o.status]}</div><div class="score-sub">Overall this week (fair-weighted)</div></div>
    </div>${pbar(o.score,o.status)}</div>`;

  html += `<div class="hint">Weekly score counts only Daily & Weekly goals (the ones that recur weekly). Monthly/3-Month goals are shown as context and scored on their own tabs.</div>`;
  for(const c of o.cats){
    html += `<h2 class="section">${c.cat.emoji} ${c.cat.name} — ${E.round(c.score)}% ${E.DOT[c.status]}</h2>`;
    for(const r of c.rows){
      html += `<div class="card tight"><div class="row">
        <div style="flex:1"><div class="goal-title">${r.goal.title}</div>
          <div class="goal-meta">${freqLabel(r.goal.freq)} · ${r.label}</div></div>
        ${statusPill(r.status, E.round(r.score)+"%")}
      </div>${pbar(r.score,r.status)}</div>`;
    }
  }
  // Monthly / 3-month context (not part of weekly %)
  const ctx=[]; (o.allCats||[]).forEach(c=> (c.contextRows||[]).forEach(r=> ctx.push({c,r})));
  if(ctx.length){
    html += `<h2 class="section">📌 Longer-term goals (context — not in weekly %)</h2>`;
    for(const {c,r} of ctx){
      html += `<div class="card tight"><div class="row">
        <div style="flex:1"><div class="goal-title">${c.cat.emoji} ${r.goal.title}</div>
          <div class="goal-meta">${freqLabel(r.goal.freq)} · ${r.label}</div></div>
        ${statusPill(r.status, E.round(r.score)+"%")}</div>${pbar(r.score,r.status)}</div>`;
    }
  }
  html += `<div style="height:8px"></div><button class="btn" id="start-checkin">📝 Sunday Check-In</button>`;
  return html;
}
function freqLabel(f){ return {D:"Daily",W:"Weekly",M:"Monthly","3M":"3-Month"}[f]||f; }

/* =========================================================================
 * VIEW: GOALS — list + edit, type-specific editors
 * ========================================================================= */
function viewGoals(){
  let html=`<h2 class="section">🎯 My Goals (${state.goals.filter(g=>g.active!==false).length} active)</h2>`;
  html += `<button class="btn secondary" id="add-goal">＋ Add goal</button><div style="height:12px"></div>`;
  for(const c of state.categories){
    const gs=state.goals.filter(g=>g.cat===c.id);
    if(!gs.length) continue;
    html += `<h2 class="section">${c.emoji} ${c.name}</h2>`;
    // subcategories
    const subs=[...new Set(gs.map(g=>g.sub||""))];
    for(const sub of subs){
      if(sub) html += `<div class="subhead">${sub}</div>`;
      for(const g of gs.filter(x=>(x.sub||"")===sub)){
        const r=E.scoreGoal(g,state.logs,E.weekForDate(today(),state.period),state.thresholds,today());
        html += `<div class="card tight" data-goal="${g.id}" style="cursor:pointer">
          <div class="row"><div style="flex:1">
            <div class="goal-title">${g.active===false?"⏸ ":""}${g.title}</div>
            <div class="goal-meta">${freqLabel(g.freq)} · ${typeLabel(g.type)} · ${r.label}</div>
          </div>${statusPill(r.status,E.round(r.score)+"%")}</div></div>`;
      }
    }
  }
  return html;
}
function typeLabel(t){ return {count:"Count",boolean:"Yes/No",average:"Average",percentage:"Percentage",threshold:"Threshold",qualify:"Qualify",milestone:"Project",reading:"Reading",meals:"Meals"}[t]||t; }

/* =========================================================================
 * VIEW: MONTHLY
 * ========================================================================= */
function monthsInPeriod(){
  const out=[]; let d=E.parseDate(state.period.start); const end=E.parseDate(state.period.end);
  while(d<=end){ const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    if(!out.find(m=>m.key===key)) out.push({key,label:d.toLocaleDateString(undefined,{month:"long",year:"numeric"}),y:d.getFullYear(),m:d.getMonth()});
    d=E.addDays(d,1);
  }
  return out;
}
function weeksInMonth(my){
  return E.buildWeeks(state.period).filter(w=>{ const s=E.parseDate(w.start); return s.getFullYear()===my.y && s.getMonth()===my.m; });
}
function viewMonth(){
  const months=monthsInPeriod();
  const d=today(); const curKey=`${E.parseDate(d).getFullYear()}-${String(E.parseDate(d).getMonth()+1).padStart(2,"0")}`;
  const my = months.find(m=>m.key===curKey) || months[0];
  let html=`<h2 class="section">📅 ${my.label}</h2>`;
  html += `<div class="chips">${months.map(m=>`<button class="chip ${m.key===my.key?"on":""}" data-month="${m.key}">${m.label.split(" ")[0]}</button>`).join("")}</div><div style="height:6px"></div>`;

  const wks=weeksInMonth(my); const th=state.thresholds;
  if(!wks.length){ html+=`<div class="empty">No weeks in this month within the period.</div>`; return html; }

  // Monthly category score = avg of weekly category scores across the month's weeks (only elapsed)
  const catAgg={};
  for(const c of state.categories) catAgg[c.id]={sum:0,n:0};
  const trend=[];
  for(const w of wks){
    const elapsed = E.parseDate(w.start) <= E.parseDate(d);
    const o=E.overallScore(state.goals,state.logs,w,th,w.end,state.freqWeight,state.categories);
    trend.push({week:w.index, score: elapsed? E.round(o.score):null});
    if(!elapsed) continue;
    for(const cc of o.cats){ catAgg[cc.cat.id].sum+=cc.score; catAgg[cc.cat.id].n++; }
  }
  const catScores = state.categories.map(c=>({c, score: catAgg[c.id].n? catAgg[c.id].sum/catAgg[c.id].n : null})).filter(x=>x.score!==null);
  const overall = catScores.length? catScores.reduce((s,x)=>s+x.score,0)/catScores.length : 0;

  html += `<div class="card"><div class="score-big">${E.round(overall)}%</div><div class="score-sub">Average weekly performance this month</div></div>`;
  for(const x of catScores){
    const st=E.statusOf(x.score,th);
    html += `<div class="card tight"><div class="row"><div class="goal-title">${x.c.emoji} ${x.c.name}</div>${statusPill(st,E.round(x.score)+"%")}</div>${pbar(x.score,st)}</div>`;
  }
  // insights
  html += monthlyInsights(wks, my);
  html += `<div style="height:8px"></div><button class="btn secondary" id="save-month" data-key="${my.key}">💾 Save monthly review</button>`;
  return html;
}
function monthlyInsights(wks, my){
  const th=state.thresholds, d=today();
  // per-goal avg across month weeks
  const perGoal={};
  for(const w of wks){ if(E.parseDate(w.start)>E.parseDate(d)) continue;
    for(const g of state.goals.filter(x=>x.active!==false)){
      const r=E.scoreGoal(g,state.logs,w,th,w.end);
      (perGoal[g.id]=perGoal[g.id]||{g, scores:[]}).scores.push(r.score);
    }
  }
  const avg=o=>o.scores.reduce((a,b)=>a+b,0)/o.scores.length;
  const arr=Object.values(perGoal).map(o=>({g:o.g, avg:avg(o), first:o.scores[0], last:o.scores[o.scores.length-1]}));
  if(!arr.length) return "";
  const best=[...arr].sort((a,b)=>b.avg-a.avg)[0];
  const worst=[...arr].sort((a,b)=>a.avg-b.avg)[0];
  const improved=[...arr].sort((a,b)=>(b.last-b.first)-(a.last-a.first))[0];
  const missed=[...arr].filter(x=>x.avg<state.thresholds.yellow).sort((a,b)=>a.avg-b.avg)[0];
  return `<div class="card">
    <div class="kv"><span>🏆 Biggest strength</span><b>${best.g.title}</b></div>
    <div class="kv"><span>⚠️ Biggest weakness</span><b>${worst.g.title}</b></div>
    <div class="kv"><span>📈 Most improved</span><b>${improved.g.title}</b></div>
    <div class="kv"><span>🔴 Most consistently missed</span><b>${missed?missed.g.title:"—"}</b></div>
  </div>`;
}

/* =========================================================================
 * VIEW: 3-MONTH PROGRESS  — trend chart + final-review table
 * ========================================================================= */
function viewPeriod(){
  const th=state.thresholds, d=today();
  const trend=E.weeklyTrend(state.goals,state.logs,state.period,th,d,state.freqWeight,state.categories);
  const done=trend.filter(t=>!t.future && t.score!==null);
  const overall=done.length? done.reduce((s,t)=>s+t.score,0)/done.length:0;
  const ost=E.statusOf(overall,th);

  let html=`<h2 class="section">📈 3-Month Progress</h2>`;
  html += `<div class="card"><div class="score-big">${E.round(overall)}% ${E.DOT[ost]}</div>
    <div class="score-sub">Average across ${done.length} completed week(s) · period ${state.period.start} → ${state.period.end}</div>${pbar(overall,ost)}</div>`;

  // trend chart
  html += `<div class="card"><div class="subhead">Weekly trend — are you improving?</div>${lineChart(trend)}
    <div class="legend">Each point = that week's fair-weighted overall score. Hollow = future.</div></div>`;

  // category breakdown (period-to-date) — includes monthly/3M goals via scope "all"
  html += `<h2 class="section">By category (all goals)</h2>`;
  const wkNowP=E.weekForDate(d,state.period);
  for(const c of state.categories){
    const cs=E.categoryScore(c.id,state.goals,state.logs,wkNowP,th,d,state.freqWeight,"all");
    if(!cs.rows.length) continue;
    const sc=cs.score; const st=E.statusOf(sc,th);
    html += `<div class="card tight"><div class="row"><div class="goal-title">${c.emoji} ${c.name}</div>${statusPill(st,E.round(sc)+"%")}</div>${pbar(sc,st)}</div>`;
  }

  // final review table
  html += `<h2 class="section">Every goal — target vs actual</h2>`;
  html += `<div class="card"><table class="review"><thead><tr><th>Goal</th><th>Target</th><th>Actual</th><th>Status</th></tr></thead><tbody>`;
  const wkNow=E.weekForDate(d,state.period);
  for(const g of state.goals.filter(x=>x.active!==false)){
    const r=E.scoreGoal(g,state.logs,wkNow,th,d);
    const tgt = g.type==="threshold"? `${g.direction==="min"?"≥":"≤"}${g.target}`
      : g.type==="qualify"? `${g.target} @${g.bar}%`
      : g.type==="average"? `≤${E.fmtMin(g.target)}`
      : g.type==="milestone"? `${(g.milestones||[]).length} steps`
      : g.type==="reading"? `${(g.books||[]).length} books`
      : `${g.target} ${g.unit||""}`;
    html += `<tr><td>${g.title}</td><td>${tgt}</td><td>${r.label}</td><td>${E.DOT[r.status]} ${E.round(r.score)}%</td></tr>`;
  }
  html += `</tbody></table></div>`;

  // superlatives
  html += periodSuperlatives(trend);
  if(d>=state.period.end) html += `<div class="hint">🎉 Period complete — this is your final 3-month report.</div>`;
  return html;
}
function periodSuperlatives(trend){
  const th=state.thresholds, d=today();
  const wks=E.buildWeeks(state.period).filter(w=>E.parseDate(w.start)<=E.parseDate(d));
  if(!wks.length) return "";
  const stats={};
  for(const g of state.goals.filter(x=>x.active!==false)){
    const scores=wks.map(w=>E.scoreGoal(g,state.logs,w,th,w.end).score);
    const mean=scores.reduce((a,b)=>a+b,0)/scores.length;
    const variance=scores.reduce((a,b)=>a+(b-mean)**2,0)/scores.length;
    stats[g.id]={g,mean,std:Math.sqrt(variance),first:scores[0],last:scores[scores.length-1]};
  }
  const arr=Object.values(stats);
  const best=[...arr].sort((a,b)=>b.mean-a.mean)[0];
  const worst=[...arr].sort((a,b)=>a.mean-b.mean)[0];
  const improved=[...arr].sort((a,b)=>(b.last-b.first)-(a.last-a.first))[0];
  const inconsistent=[...arr].sort((a,b)=>b.std-a.std)[0];
  const consistAchieved=arr.filter(x=>x.mean>=th.green).map(x=>x.g.title);
  const consistMissed=arr.filter(x=>x.mean<th.yellow).map(x=>x.g.title);
  return `<h2 class="section">Insights</h2><div class="card">
    <div class="kv"><span>🏆 Best-performing</span><b>${best.g.title}</b></div>
    <div class="kv"><span>🔻 Worst-performing</span><b>${worst.g.title}</b></div>
    <div class="kv"><span>📈 Most improved</span><b>${improved.g.title}</b></div>
    <div class="kv"><span>🎲 Most inconsistent</span><b>${inconsistent.g.title}</b></div>
    <div class="kv"><span>✅ Consistently achieved</span><b>${consistAchieved.length?consistAchieved.join(", "):"—"}</b></div>
    <div class="kv"><span>❌ Consistently missed</span><b>${consistMissed.length?consistMissed.join(", "):"—"}</b></div>
  </div>`;
}

/* simple inline SVG line chart, no deps */
function lineChart(points){
  const W=640,H=160,pad=24;
  const xs=points.map((p,i)=> pad + i*((W-2*pad)/Math.max(points.length-1,1)));
  const y=v=> H-pad - (v/100)*(H-2*pad);
  const linePts=points.map((p,i)=> p.score==null?null:`${xs[i].toFixed(1)},${y(p.score).toFixed(1)}`).filter(Boolean).join(" ");
  const grid=[0,25,50,75,100].map(v=>`<line x1="${pad}" y1="${y(v)}" x2="${W-pad}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="2" y="${y(v)+3}" fill="var(--muted)" font-size="9">${v}</text>`).join("");
  const dots=points.map((p,i)=> p.score==null
    ? `<circle cx="${xs[i]}" cy="${y(0)}" r="3" fill="none" stroke="var(--line)"/>`
    : `<circle cx="${xs[i]}" cy="${y(p.score)}" r="3.5" fill="${p.score>=state.thresholds.green?'var(--green)':p.score>=state.thresholds.yellow?'var(--yellow)':'var(--red)'}"/>`).join("");
  const labels=points.map((p,i)=> i%2===0?`<text x="${xs[i]}" y="${H-6}" fill="var(--muted)" font-size="8" text-anchor="middle">W${p.week}</text>`:"").join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}
    ${linePts?`<polyline points="${linePts}" fill="none" stroke="var(--accent)" stroke-width="2"/>`:""}
    ${dots}${labels}</svg>`;
}

/* =========================================================================
 * VIEW: REVIEWS (weekly + monthly history)
 * ========================================================================= */
function viewReviews(){
  let html=`<h2 class="section">📝 Weekly Reviews</h2>`;
  const weekly=state.reviews.filter(r=>r.type==="weekly").sort((a,b)=>b.key.localeCompare(a.key));
  if(!weekly.length) html+=`<div class="empty">No weekly reviews yet. Do your Sunday check-in from the Week tab.</div>`;
  for(const r of weekly){
    html += `<div class="card"><div class="row"><div class="goal-title">Week ${r.weekIndex} · ${r.key}</div>${statusPill(E.statusOf(r.score,state.thresholds),E.round(r.score)+"%")}</div>
      <div class="small" style="margin-top:8px">
      <div class="kv"><span>Went well</span><b>${esc(r.answers.wins||"—")}</b></div>
      <div class="kv"><span>Struggled</span><b>${esc(r.answers.struggles||"—")}</b></div>
      <div class="kv"><span>Why missed</span><b>${esc(r.answers.why||"—")}</b></div>
      <div class="kv"><span>Will change</span><b>${esc(r.answers.change||"—")}</b></div>
      <div class="kv"><span>Next priority</span><b>${esc(r.answers.priority||"—")}</b></div>
      </div></div>`;
  }
  html += `<h2 class="section">📋 Monthly Reviews</h2>`;
  const monthly=state.reviews.filter(r=>r.type==="monthly").sort((a,b)=>b.key.localeCompare(a.key));
  if(!monthly.length) html+=`<div class="empty">No monthly reviews yet.</div>`;
  for(const r of monthly){
    html += `<div class="card"><div class="row"><div class="goal-title">${r.label||r.key}</div>${statusPill(E.statusOf(r.score,state.thresholds),E.round(r.score)+"%")}</div>
      <div class="small">${esc(r.answers?.reflection||"")}</div></div>`;
  }
  return html;
}
function esc(s){ return String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }

/* =========================================================================
 * EVENT BINDING
 * ========================================================================= */
function bindView(){
  // tabs
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>go(b.dataset.tab));
  document.getElementById("btn-settings").onclick=openSettings;

  // TODAY controls
  document.querySelectorAll("[data-bool]").forEach(b=>b.onclick=()=>{
    const id=b.dataset.bool, d=today(); const cur=getLog(id,d); upsertLog(id,d,{done:!(cur&&cur.done)}); flash("Saved"); render();
  });
  document.querySelectorAll("[data-meal]").forEach(b=>b.onclick=()=>{
    const [id,k]=b.dataset.meal.split(":"); const d=today(); const l=getLog(id,d)||{}; const m={...(l.meals||{})}; m[k]=!m[k];
    upsertLog(id,d,{meals:m}); flash("Saved"); render();
  });
  document.querySelectorAll("[data-quickadd]").forEach(b=>b.onclick=()=>{
    const id=b.dataset.quickadd, d=today(); const cur=getLog(id,d); upsertLog(id,d,{value:(cur?.value||0)+1}); flash("+1 logged"); render();
  });
  document.querySelectorAll("[data-weekbool]").forEach(b=>b.onclick=()=>{
    const id=b.dataset.weekbool, d=today(); const cur=getLog(id,d); upsertLog(id,d,{done:!(cur&&cur.done)}); flash("Saved"); render();
  });
  document.querySelectorAll("[data-editpct]").forEach(b=>b.onclick=()=>editPercentage(b.dataset.editpct));
  const gw=document.getElementById("goto-week"); if(gw) gw.onclick=()=>go("week");

  // WEEK
  const ci=document.getElementById("start-checkin"); if(ci) ci.onclick=startCheckin;

  // GOALS
  const ag=document.getElementById("add-goal"); if(ag) ag.onclick=()=>editGoal(null);
  document.querySelectorAll("[data-goal]").forEach(c=>c.onclick=()=>editGoal(c.dataset.goal));

  // MONTH
  document.querySelectorAll("[data-month]").forEach(b=>b.onclick=()=>{ /* jump vtoday into that month start for viewing */
    const key=b.dataset.month; const w=E.buildWeeks(state.period).find(x=>x.start.startsWith(key)); if(w){ /* just re-render month using key */ }
    renderMonthKey(key);
  });
  const sm=document.getElementById("save-month"); if(sm) sm.onclick=()=>saveMonthly(sm.dataset.key);
}

function renderMonthKey(key){
  // temporarily render a specific month
  const main=document.getElementById("app");
  const months=monthsInPeriod(); const my=months.find(m=>m.key===key)||months[0];
  // reuse viewMonth logic by faking: easiest is set a module-level selected month
  SELECTED_MONTH=key; main.innerHTML=viewMonth(); bindView();
}
let SELECTED_MONTH=null;
/* patch viewMonth to honor SELECTED_MONTH */
const _viewMonth=viewMonth;
viewMonth=function(){
  if(SELECTED_MONTH){ const saved=today();
    // render for selected month by picking its first in-period day
    const months=monthsInPeriod(); const my=months.find(m=>m.key===SELECTED_MONTH);
    if(my){ const w=E.buildWeeks(state.period).find(x=>x.start.startsWith(SELECTED_MONTH))||E.buildWeeks(state.period)[0];
      const prev=VTODAY; VTODAY=w? (w.end>saved? w.end : w.end):saved; const html=_viewMonth.call(this); VTODAY=prev; return html; }
  }
  return _viewMonth.call(this);
};

/* ---------------- percentage editor ---------------- */
function editPercentage(id){
  const g=goalById(id), d=today(), wk=E.weekForDate(d,state.period);
  const l=state.logs.filter(x=>x.goalId===id && x.date>=wk.start && x.date<=wk.end).pop()||{};
  const bg=modal(`<h3>${g.title}</h3><p class="small">Record classes attended / total this week.</p>
    <label class="fld">Attended</label><input id="pct-a" type="number" inputmode="numeric" value="${l.value??""}" placeholder="8">
    <label class="fld">Total classes</label><input id="pct-t" type="number" inputmode="numeric" value="${l.total??""}" placeholder="10">
    <div style="height:10px"></div><button class="btn" id="pct-save">Save</button>`);
  bg.querySelector("#pct-save").onclick=()=>{
    const a=Number(bg.querySelector("#pct-a").value)||0, t=Number(bg.querySelector("#pct-t").value)||0;
    upsertLog(id, wk.start, {value:a, total:t}); bg.remove(); flash("Saved"); render();
  };
}

/* =========================================================================
 * SUNDAY CHECK-IN
 * ========================================================================= */
function startCheckin(){
  const d=today(); const wk=E.weekForDate(d,state.period); const th=state.thresholds;
  const o=E.overallScore(state.goals,state.logs,wk,th,d,state.freqWeight,state.categories);
  const rows=[]; o.cats.forEach(c=>c.rows.forEach(r=>rows.push(r)));
  const green=rows.filter(r=>r.status==="green");
  const yellow=rows.filter(r=>r.status==="yellow");
  const red=rows.filter(r=>r.status==="red");
  const li=arr=>arr.length? arr.map(r=>`<li>${r.goal.title} — ${r.label}</li>`).join("") : "<li class='small'>none</li>";
  const bg=modal(`
    <h3>Sunday Check-In · Week ${wk.index}</h3>
    <div class="card" style="margin-top:10px"><div class="score-big">${E.round(o.score)}% ${E.DOT[o.status]}</div><div class="score-sub">Weekly score</div>${pbar(o.score,o.status)}</div>
    <div class="subhead">🟢 On track</div><ul class="small">${li(green)}</ul>
    <div class="subhead">🟡 Needs attention</div><ul class="small">${li(yellow)}</ul>
    <div class="subhead">🔴 Missed</div><ul class="small">${li(red)}</ul>
    <label class="fld">1. What went well this week?</label><textarea id="q-wins"></textarea>
    <label class="fld">2. What did you struggle with?</label><textarea id="q-struggles"></textarea>
    <label class="fld">3. Why did you miss any goals?</label><textarea id="q-why"></textarea>
    <label class="fld">4. One thing you'll change next week?</label><textarea id="q-change"></textarea>
    <label class="fld">5. Main priority next week?</label><textarea id="q-priority"></textarea>
    <div style="height:12px"></div><button class="btn" id="save-checkin">💾 Save weekly review</button>
    <button class="btn ghost" id="cancel-checkin">Cancel</button>`);
  bg.querySelector("#cancel-checkin").onclick=()=>bg.remove();
  bg.querySelector("#save-checkin").onclick=()=>{
    const answers={ wins:v("#q-wins"), struggles:v("#q-struggles"), why:v("#q-why"), change:v("#q-change"), priority:v("#q-priority") };
    function v(s){ return bg.querySelector(s).value.trim(); }
    const key=wk.start;
    const existing=state.reviews.find(r=>r.type==="weekly"&&r.key===key);
    const rec={ type:"weekly", key, weekIndex:wk.index, score:o.score, answers,
      snapshot:rows.map(r=>({title:r.goal.title,score:E.round(r.score),status:r.status,label:r.label})), createdAt:todayStr() };
    if(existing) Object.assign(existing,rec); else state.reviews.push(rec);
    save(); bg.remove(); flash("Weekly review saved"); go("reviews");
  };
}

/* =========================================================================
 * MONTHLY SAVE
 * ========================================================================= */
function saveMonthly(key){
  const months=monthsInPeriod(); const my=months.find(m=>m.key===key);
  const wks=weeksInMonth(my); const th=state.thresholds, d=today();
  let sum=0,n=0; for(const w of wks){ if(E.parseDate(w.start)>E.parseDate(d))continue; const o=E.overallScore(state.goals,state.logs,w,th,w.end,state.freqWeight,state.categories); sum+=o.score;n++; }
  const score=n?sum/n:0;
  const bg=modal(`<h3>Monthly review · ${my.label}</h3>
    <div class="card"><div class="score-big">${E.round(score)}%</div><div class="score-sub">Avg weekly performance</div></div>
    <label class="fld">Reflection — what improved, what declined, what to adjust?</label><textarea id="m-ref"></textarea>
    <div style="height:10px"></div><button class="btn" id="m-save">Save</button>`);
  bg.querySelector("#m-save").onclick=()=>{
    const rec={type:"monthly",key,label:my.label,score,answers:{reflection:bg.querySelector("#m-ref").value.trim()},createdAt:todayStr()};
    const ex=state.reviews.find(r=>r.type==="monthly"&&r.key===key); if(ex)Object.assign(ex,rec);else state.reviews.push(rec);
    save(); bg.remove(); flash("Monthly review saved"); go("reviews");
  };
}

/* =========================================================================
 * GOAL EDITOR (add / edit / pause / delete) + type-specific sub-editors
 * ========================================================================= */
function editGoal(id){
  const g = id? structuredClone(goalById(id)) : { id:null, title:"", cat:state.categories[0].id, sub:"", freq:"W", type:"count", target:1, unit:"", priority:"Medium", active:true };
  const catOpts=state.categories.map(c=>`<option value="${c.id}" ${g.cat===c.id?"selected":""}>${c.emoji} ${c.name}</option>`).join("");
  const typeOpts=["count","boolean","meals","average","percentage","threshold","qualify","milestone","reading"]
    .map(t=>`<option value="${t}" ${g.type===t?"selected":""}>${typeLabel(t)}</option>`).join("");
  const freqOpts=["D","W","M","3M"].map(f=>`<option value="${f}" ${g.freq===f?"selected":""}>${freqLabel(f)}</option>`).join("");
  const bg=modal(`<h3>${id?"Edit goal":"Add goal"}</h3>
    <label class="fld">Title</label><input id="e-title" value="${esc(g.title)}">
    <label class="fld">Category</label><select id="e-cat">${catOpts}</select>
    <label class="fld">Subcategory (optional)</label><input id="e-sub" value="${esc(g.sub||"")}">
    <div class="grid2"><div><label class="fld">Frequency</label><select id="e-freq">${freqOpts}</select></div>
      <div><label class="fld">Type</label><select id="e-type">${typeOpts}</select></div></div>
    <div id="type-fields"></div>
    <label class="fld">Priority</label><select id="e-prio">${["High","Medium","Low"].map(p=>`<option ${g.priority===p?"selected":""}>${p}</option>`).join("")}</select>
    <label class="fld"><input type="checkbox" id="e-active" ${g.active!==false?"checked":""} style="width:auto;vertical-align:middle"> Active (uncheck to pause)</label>
    <div style="height:12px"></div><button class="btn" id="e-save">Save</button>
    ${id?`<button class="btn ghost danger" id="e-del">Delete goal</button>`:""}
    <button class="btn ghost" id="e-cancel">Cancel</button>`);
  const tf=bg.querySelector("#type-fields");
  function renderTypeFields(){
    const t=bg.querySelector("#e-type").value;
    let h="";
    if(["count","meals"].includes(t)) h=`<label class="fld">Target (per period)</label><input id="e-target" type="number" value="${g.target??1}"><label class="fld">Unit</label><input id="e-unit" value="${esc(g.unit||"")}">`;
    else if(t==="boolean") h=`<p class="small">Yes/No completion. Daily → counts done days ÷ elapsed; weekly → done once/week.</p>`;
    else if(t==="average") h=`<label class="fld">Target (minutes, lower is better)</label><input id="e-target" type="number" value="${g.target??180}"><label class="small"><input type="checkbox" id="e-lower" ${g.lowerIsBetter!==false?"checked":""} style="width:auto"> Lower is better</label>`;
    else if(t==="percentage") h=`<label class="fld">Target %</label><input id="e-target" type="number" value="${g.target??100}">`;
    else if(t==="threshold") h=`<label class="fld">Target value</label><input id="e-target" type="number" step="0.1" value="${g.target??8.5}"><label class="fld">Current value</label><input id="e-current" type="number" step="0.1" value="${g.current??0}"><label class="fld">Direction</label><select id="e-dir"><option value="min" ${g.direction!=="max"?"selected":""}>At least (≥)</option><option value="max" ${g.direction==="max"?"selected":""}>At most (≤)</option></select>`;
    else if(t==="qualify") h=`<label class="fld">How many must qualify</label><input id="e-target" type="number" value="${g.target??2}"><label class="fld">Qualifying bar %</label><input id="e-bar" type="number" value="${g.bar??90}"><div id="q-items">${qualifyEditor(g)}</div><button class="btn secondary" id="add-item" style="margin-top:8px">＋ Add class</button>`;
    else if(t==="milestone") h=`<div id="ms-list">${milestoneEditor(g)}</div><button class="btn secondary" id="add-ms" style="margin-top:8px">＋ Add milestone</button>`;
    else if(t==="reading") h=`<div id="bk-list">${bookEditor(g)}</div><button class="btn secondary" id="add-bk" style="margin-top:8px">＋ Add book</button>`;
    tf.innerHTML=h;
    const ai=tf.querySelector("#add-item"); if(ai)ai.onclick=()=>{(g.items=g.items||[]).push({name:"New class",value:0,credits:5});tf.querySelector("#q-items").innerHTML=qualifyEditor(g);};
    const am=tf.querySelector("#add-ms"); if(am)am.onclick=()=>{(g.milestones=g.milestones||[]).push({name:"New milestone",done:false});tf.querySelector("#ms-list").innerHTML=milestoneEditor(g);};
    const ab=tf.querySelector("#add-bk"); if(ab)ab.onclick=()=>{(g.books=g.books||[]).push({name:"New book",pages:300,read:0,done:false});tf.querySelector("#bk-list").innerHTML=bookEditor(g);};
  }
  renderTypeFields();
  bg.querySelector("#e-type").onchange=renderTypeFields;
  bg.querySelector("#e-cancel").onclick=()=>bg.remove();
  if(id) bg.querySelector("#e-del").onclick=()=>{ if(confirm("Delete this goal and its logs?")){ state.goals=state.goals.filter(x=>x.id!==id); state.logs=state.logs.filter(l=>l.goalId!==id); save(); bg.remove(); flash("Deleted"); render(); } };
  bg.querySelector("#e-save").onclick=()=>{
    collectDynamic(bg,g); // reads qualify/milestone/book inputs into g
    g.title=bg.querySelector("#e-title").value.trim(); g.cat=bg.querySelector("#e-cat").value; g.sub=bg.querySelector("#e-sub").value.trim();
    g.freq=bg.querySelector("#e-freq").value; g.type=bg.querySelector("#e-type").value; g.priority=bg.querySelector("#e-prio").value;
    g.active=bg.querySelector("#e-active").checked;
    const tgt=bg.querySelector("#e-target"); if(tgt)g.target=Number(tgt.value);
    const unit=bg.querySelector("#e-unit"); if(unit)g.unit=unit.value.trim();
    const low=bg.querySelector("#e-lower"); if(low)g.lowerIsBetter=low.checked;
    const cur=bg.querySelector("#e-current"); if(cur)g.current=Number(cur.value);
    const dir=bg.querySelector("#e-dir"); if(dir)g.direction=dir.value;
    const bar=bg.querySelector("#e-bar"); if(bar)g.bar=Number(bar.value);
    if(!g.title){ flash("Title required"); return; }
    if(id){ const idx=state.goals.findIndex(x=>x.id===id); state.goals[idx]=g; }
    else { g.id="g"+Date.now(); g.createdAt=todayStr(); state.goals.push(g); }
    save(); bg.remove(); flash("Goal saved"); render();
  };
}
function qualifyEditor(g){ return (g.items||[]).map((it,i)=>`<div class="grid2" style="margin-top:6px"><input data-qi="name:${i}" value="${esc(it.name)}"><div class="grid2"><input data-qi="value:${i}" type="number" value="${it.value}" placeholder="%"><input data-qi="credits:${i}" type="number" value="${it.credits}" placeholder="cr"></div></div>`).join(""); }
function milestoneEditor(g){ return (g.milestones||[]).map((m,i)=>`<div class="milestone"><button type="button" class="mk ${m.done?"on":""}" data-mstoggle="${i}">${m.done?"✓":""}</button><input data-ms="${i}" value="${esc(m.name)}"></div>`).join(""); }
function bookEditor(g){ return (g.books||[]).map((b,i)=>`<div class="card tight"><input data-bk="name:${i}" value="${esc(b.name)}"><div class="grid2" style="margin-top:6px"><input data-bk="read:${i}" type="number" value="${b.read}" placeholder="pages read"><input data-bk="pages:${i}" type="number" value="${b.pages}" placeholder="total"></div><label class="small"><input type="checkbox" data-bk="done:${i}" ${b.done?"checked":""} style="width:auto"> Finished</label></div>`).join(""); }
function collectDynamic(bg,g){
  bg.querySelectorAll("[data-qi]").forEach(inp=>{ const[f,i]=inp.dataset.qi.split(":"); g.items[i][f]= f==="name"?inp.value:Number(inp.value); });
  bg.querySelectorAll("[data-ms]").forEach(inp=>{ g.milestones[inp.dataset.ms].name=inp.value; });
  bg.querySelectorAll("[data-mstoggle]").forEach(btn=>{}); // toggles handled live below
  bg.querySelectorAll("[data-bk]").forEach(inp=>{ const[f,i]=inp.dataset.bk.split(":"); g.books[i][f]= f==="name"?inp.value : f==="done"?inp.checked:Number(inp.value); });
}
/* live milestone toggles inside editor */
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-mstoggle]"); if(!t)return;
  t.classList.toggle("on"); t.textContent=t.classList.contains("on")?"✓":"";
});

/* =========================================================================
 * SETTINGS: period, thresholds, notifications, example data, export/import
 * ========================================================================= */
function openSettings(){
  const s=state.settings;
  const bg=modal(`<h3>⚙️ Settings</h3>
    <div class="subhead">3-Month Period</div>
    <div class="grid2"><div><label class="fld">Start</label><input id="s-start" type="date" value="${state.period.start}"></div>
      <div><label class="fld">End</label><input id="s-end" type="date" value="${state.period.end}"></div></div>
    <div class="subhead">Status thresholds (%)</div>
    <div class="grid2"><div><label class="fld">🟢 Green ≥</label><input id="s-green" type="number" value="${state.thresholds.green}"></div>
      <div><label class="fld">🟡 Yellow ≥</label><input id="s-yellow" type="number" value="${state.thresholds.yellow}"></div></div>
    <div class="subhead">Scoring weights (by frequency)</div>
    <div class="grid2"><div><label class="fld">Daily</label><input id="w-d" type="number" value="${state.freqWeight.D}"></div><div><label class="fld">Weekly</label><input id="w-w" type="number" value="${state.freqWeight.W}"></div>
      <div><label class="fld">Monthly</label><input id="w-m" type="number" value="${state.freqWeight.M}"></div><div><label class="fld">3-Month</label><input id="w-3m" type="number" value="${state.freqWeight['3M']}"></div></div>
    <div class="subhead">Notifications</div>
    <label class="small"><input type="checkbox" id="n-daily" ${s.notifDaily?"checked":""} style="width:auto"> Daily reminder at <input id="n-time" type="time" value="${s.dailyTime}" style="width:auto;display:inline-block"></label>
    <label class="small" style="display:block;margin-top:8px"><input type="checkbox" id="n-sunday" ${s.notifSunday?"checked":""} style="width:auto"> Sunday check-in reminder</label>
    <label class="small" style="display:block;margin-top:8px"><input type="checkbox" id="n-behind" ${s.notifBehind?"checked":""} style="width:auto"> "Falling behind" nudges</label>
    <button class="btn secondary" id="s-notif-test" style="margin-top:10px">Enable & test notifications</button>
    <div class="subhead">Demo</div>
    <label class="fld">Simulate "today" (for testing)</label><input id="s-vtoday" type="date" value="${today()}">
    <button class="btn secondary" id="s-example" style="margin-top:8px">Load realistic example data</button>
    <button class="btn ghost" id="s-clear-example" style="margin-top:8px">Clear all logs</button>
    <div class="subhead">Data</div>
    <button class="btn secondary" id="s-export">⬇️ Export JSON (backup / Notion mirror)</button>
    <button class="btn secondary" id="s-export-md" style="margin-top:8px">📄 Export Notion-ready Markdown</button>
    <label class="fld">Import JSON</label><input id="s-import" type="file" accept="application/json">
    <button class="btn ghost danger" id="s-reset" style="margin-top:14px">Reset everything to seed</button>
    <div style="height:12px"></div><button class="btn" id="s-save">Save settings</button>`);

  bg.querySelector("#s-save").onclick=()=>{
    state.period.start=bg.querySelector("#s-start").value; state.period.end=bg.querySelector("#s-end").value;
    state.thresholds.green=Number(bg.querySelector("#s-green").value); state.thresholds.yellow=Number(bg.querySelector("#s-yellow").value);
    state.freqWeight.D=Number(bg.querySelector("#w-d").value); state.freqWeight.W=Number(bg.querySelector("#w-w").value);
    state.freqWeight.M=Number(bg.querySelector("#w-m").value); state.freqWeight["3M"]=Number(bg.querySelector("#w-3m").value);
    state.settings.notifDaily=bg.querySelector("#n-daily").checked; state.settings.notifSunday=bg.querySelector("#n-sunday").checked;
    state.settings.notifBehind=bg.querySelector("#n-behind").checked; state.settings.dailyTime=bg.querySelector("#n-time").value;
    const vt=bg.querySelector("#s-vtoday").value; save(); setVToday(vt||null); bg.remove(); flash("Settings saved"); scheduleNotifications();
  };
  bg.querySelector("#s-example").onclick=()=>{ loadExampleData(); bg.remove(); flash("Example data loaded"); render(); };
  bg.querySelector("#s-clear-example").onclick=()=>{ if(confirm("Delete all daily logs?")){ state.logs=[]; save(); bg.remove(); flash("Logs cleared"); render(); } };
  bg.querySelector("#s-export").onclick=exportJSON;
  bg.querySelector("#s-export-md").onclick=exportMarkdown;
  bg.querySelector("#s-import").onchange=e=>importJSON(e.target.files[0], ()=>bg.remove());
  bg.querySelector("#s-reset").onclick=()=>{ if(confirm("Reset to the 25 seed goals and wipe data?")){ state=seedState(); save(); bg.remove(); flash("Reset"); render(); } };
  bg.querySelector("#s-notif-test").onclick=async()=>{ const ok=await requestNotif(); if(ok){ notify("3-Month OS","Notifications enabled ✅"); scheduleNotifications(); } else flash("Permission denied"); };
}

/* =========================================================================
 * EXPORT / IMPORT
 * ========================================================================= */
function download(name, text, type="application/json"){
  const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}
function exportJSON(){ download(`goal-os-backup-${todayStr()}.json`, JSON.stringify(state,null,2)); flash("Exported"); }
function importJSON(file, done){ if(!file)return; const r=new FileReader(); r.onload=()=>{ try{ state=JSON.parse(r.result); save(); flash("Imported"); done&&done(); render(); }catch(e){ flash("Invalid file"); } }; r.readAsText(file); }
function exportMarkdown(){
  // Produces copy-paste-ready Notion content: Goals DB rows + reviews.
  let md=`# 3-Month Goal OS — Notion mirror\n\nPeriod: ${state.period.start} → ${state.period.end}\n\n## Goals\n\n| Goal | Category | Subcat | Frequency | Type | Target | Status |\n|---|---|---|---|---|---|---|\n`;
  const wk=E.weekForDate(today(),state.period);
  for(const g of state.goals){ const r=E.scoreGoal(g,state.logs,wk,state.thresholds,today());
    md+=`| ${g.title} | ${catById(g.cat).name} | ${g.sub||""} | ${freqLabel(g.freq)} | ${typeLabel(g.type)} | ${g.target??""} ${g.unit||""} | ${E.DOT[r.status]} ${E.round(r.score)}% |\n`; }
  md+=`\n## Weekly Reviews\n`;
  for(const rv of state.reviews.filter(r=>r.type==="weekly")){ md+=`\n### Week ${rv.weekIndex} (${rv.key}) — ${E.round(rv.score)}%\n- Went well: ${rv.answers.wins||""}\n- Struggled: ${rv.answers.struggles||""}\n- Why missed: ${rv.answers.why||""}\n- Will change: ${rv.answers.change||""}\n- Priority: ${rv.answers.priority||""}\n`; }
  download(`goal-os-notion-${todayStr()}.md`, md, "text/markdown"); flash("Markdown exported");
}

/* =========================================================================
 * NOTIFICATIONS (local, best-effort — explained in UI)
 * ========================================================================= */
async function requestNotif(){ if(!("Notification"in window))return false; if(Notification.permission==="granted")return true; const p=await Notification.requestPermission(); return p==="granted"; }
function notify(title, body){ if(("Notification"in window)&&Notification.permission==="granted"){ try{ new Notification(title,{body}); }catch(e){} } }
let notifTimers=[];
function scheduleNotifications(){
  notifTimers.forEach(clearTimeout); notifTimers=[];
  if(!("Notification"in window)||Notification.permission!=="granted")return;
  const s=state.settings;
  if(s.notifDaily && s.dailyTime){
    const [h,m]=s.dailyTime.split(":").map(Number); const now=new Date(); const t=new Date(); t.setHours(h,m,0,0); if(t<now)t.setDate(t.getDate()+1);
    notifTimers.push(setTimeout(()=>{ notify("Daily goals","Don't forget to complete today's goals."); scheduleNotifications(); }, t-now));
  }
  // Sunday + behind nudges checked once now
  if(s.notifSunday && new Date().getDay()===0) notify("Weekly check-in","Your weekly check-in is ready.");
  if(s.notifBehind) behindNudge();
}
function behindNudge(){
  const wk=E.weekForDate(today(),state.period); const d=new Date(E.parseDate(today())); const dow=(d.getDay()+6)%7; // 0=Mon
  if(dow<4) return; // only nudge later in the week
  for(const g of state.goals.filter(x=>x.active!==false && x.type==="count" && x.freq==="W")){
    const total=state.logs.filter(l=>l.goalId===g.id&&l.date>=wk.start&&l.date<=wk.end).reduce((s,l)=>s+(Number(l.value)||0),0);
    const remaining=g.target-total;
    if(remaining>0 && remaining>=g.target/2){ notify("Falling behind", `You've done ${total}/${g.target} for "${g.title}". ${remaining} more to reach your goal.`); break; }
  }
}

/* =========================================================================
 * REALISTIC EXAMPLE DATA — fills weeks 1..4 so dashboards/charts are testable
 * ========================================================================= */
function loadExampleData(){
  state.logs=[];
  const weeks=E.buildWeeks(state.period).slice(0,4); // W1..W4
  const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
  const G=id=>state.goals.find(g=>g.id===id);
  // helper to set a count goal's weekly total by distributing +1 logs on distinct days
  function setCount(goalId, wk, n){ for(let i=0;i<n;i++) upsertLog(goalId, E.fmt(E.addDays(wk.startDate,i)), {value:(getLog(goalId,E.fmt(E.addDays(wk.startDate,i)))?.value||0)+1}); }
  function setBoolDays(goalId, wk, days){ for(let i=0;i<days;i++) upsertLog(goalId,E.fmt(E.addDays(wk.startDate,i)),{done:true}); }
  function setMeals(goalId, wk, perDay){ for(let i=0;i<7;i++){ const m={b:true,l:true,d:perDay>=3}; upsertLog(goalId,E.fmt(E.addDays(wk.startDate,i)),{meals:m}); } }
  function setAvg(goalId, wk, mins){ for(let i=0;i<7;i++) upsertLog(goalId,E.fmt(E.addDays(wk.startDate,i)),{value: mins+rnd(-20,20)}); }
  function setPct(goalId, wk, a, t){ upsertLog(goalId, wk.start, {value:a, total:t}); }
  function setWeekBool(goalId, wk, yes){ if(yes) upsertLog(goalId, wk.start, {done:true}); }

  const byTitle=t=>state.goals.find(g=>g.title.includes(t));
  const gym=byTitle("Gym"), creatine=byTitle("creatine"), meals=byTitle("skip a meal"),
    screen=byTitle("screen time"), nophone=byTitle("first 30"), revise=byTitle("Revise"),
    fam=byTitle("whole family"), calls=byTitle("grandparents"), classpart=byTitle("every class"),
    studyplan=byTitle("study plan"), curiosity=byTitle("outside my usual")||byTitle("outside usual"),
    share=byTitle("Share something"), hangout=byTitle("every weekend");

  const gymPlan=[3,2,3,3], crePlan=[7,6,7,6], mealPlan=[3,3,2,3], screenPlan=[165,175,168,172],
    nophonePlan=[6,5,7,6], revisePlan=[3,2,3,3], famPlan=[3,2,3,2], callPlan=[2,1,2,2],
    classPlan=[[10,10],[9,10],[10,10],[9,10]], hangPlan=[1,1,1,1];

  weeks.forEach((wk,i)=>{
    if(gym) setCount(gym.id,wk,gymPlan[i]);
    if(creatine) setBoolDays(creatine.id,wk,crePlan[i]);
    if(meals) setMeals(meals.id,wk,mealPlan[i]);
    if(screen) setAvg(screen.id,wk,screenPlan[i]);
    if(nophone) setBoolDays(nophone.id,wk,nophonePlan[i]);
    if(revise) setCount(revise.id,wk,revisePlan[i]);
    if(fam) setCount(fam.id,wk,famPlan[i]);
    if(calls) setCount(calls.id,wk,callPlan[i]);
    if(classpart) setPct(classpart.id,wk,classPlan[i][0],classPlan[i][1]);
    if(studyplan) setWeekBool(studyplan.id,wk, i!==1); // missed one week
    if(curiosity) setCount(curiosity.id,wk, i===3?0:1);
    if(share) setWeekBool(share.id,wk, i<3);
    if(hangout) setCount(hangout.id,wk,hangPlan[i]);
  });

  // period/project goals: set realistic progress
  const gpa=byTitle("GPA"); if(gpa) gpa.current=8.3;
  const qual=byTitle("two classes"); if(qual&&qual.items){ qual.items[0].value=92; qual.items[1].value=87; qual.items[2].value=91; }
  const reading=byTitle("Homo Deus"); if(reading&&reading.books){ reading.books[0].read=Math.round(reading.books[0].pages*0.72); reading.books[1].read=reading.books[1].pages; reading.books[1].done=true; }
  const job=byTitle("afternoon job"); if(job&&job.milestones){ job.milestones[0].done=true; job.milestones[1].done=true; }
  const invest=byTitle("investing"); if(invest&&invest.milestones){ invest.milestones.slice(0,3).forEach(m=>m.done=true); }
  const driver=byTitle("driver"); if(driver&&driver.milestones){ driver.milestones[0].done=true; }
  const date=byTitle("Pookie date"); if(date) setCount(date.id,weeks[0],1);
  const flowers=byTitle("flowers"); if(flowers) setCount(flowers.id,weeks[1],1);
  state._seedExample=true; save();
}

/* =========================================================================
 * BOOT
 * ========================================================================= */
function boot(){
  render();
  if("serviceWorker"in navigator){ navigator.serviceWorker.register("sw.js").catch(()=>{}); }
  scheduleNotifications();
}
window.addEventListener("DOMContentLoaded", boot);
