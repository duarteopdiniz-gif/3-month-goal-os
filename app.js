/* =========================================================================
 * app.js — Reviews-first goal tracker. Light, minimal, high-contrast.
 * Sections: Week (hero), Month, Progress, Goals.
 * Shared ENTRY model → logging during the week and the Sunday review write to
 * the SAME records. Missing = absence of entry (never zero). States:
 *   logged · missing · na · (date) reviewed.
 * ========================================================================= */
const E = window.Engine;
const KEY = "goal-os-v1";
const TH = { green:85, yellow:50 };
const FW = { "3M":4,"M":3,"W":2,"D":1 };

/* ------------------------------ state ------------------------------ */
let state = load();
function load(){
  const raw=localStorage.getItem(KEY);
  if(raw){ try{ return migrate(JSON.parse(raw)); }catch(e){ console.warn("load failed",e); } }
  return seedState();
}
function seedState(){
  const goals=SEED_GOALS.map((g,i)=>({ id:"g"+(i+1), active:true, createdAt:todayStr(), ...g }));
  return { period:structuredClone(DEFAULT_PERIOD), categories:structuredClone(CATEGORIES),
    goals, entries:[], reviews:[], settings:{}, _v:2 };
}
/* migrate old {logs:[{goalId,date,value,done,meals,total}]} → {entries:[...]} */
function migrate(s){
  if(s._v>=2 && s.entries) return s;
  s.entries = s.entries || [];
  if(Array.isArray(s.logs)){
    for(const l of s.logs){
      const g=(s.goals||[]).find(x=>x.id===l.goalId); if(!g) continue;
      if(g.type==="count"||(g.freq==="M"&&g.type==="count")){
        const n=Number(l.value)||0; for(let k=0;k<n;k++) s.entries.push(mkEntry(l.goalId,l.date,{}));
      } else if(g.type==="boolean"){
        if(l.done) s.entries.push(mkEntry(l.goalId,l.date,{}));
      } else if(g.type==="meals"){
        if(l.meals) s.entries.push(mkEntry(l.goalId,l.date,{meals:l.meals}));
      } else if(g.type==="average"){
        if(l.value!=null&&l.value!=="") s.entries.push(mkEntry(l.goalId,l.date,{value:Number(l.value)}));
      } else if(g.type==="percentage"){
        if(l.value!=null) s.entries.push(mkEntry(l.goalId,l.date,{value:Number(l.value),total:l.total?Number(l.total):undefined}));
      }
    }
  }
  delete s.logs; s._v=2; s.reviews=s.reviews||[]; s.settings=s.settings||{};
  return s;
}
function mkEntry(goalId,date,extra){ return { id:"e"+Date.now().toString(36)+Math.random().toString(36).slice(2,7), goalId, date, kind:"logged", ts:Date.now(), ...extra }; }
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function todayStr(){ return E.fmt(new Date()); }
function goalById(id){ return state.goals.find(g=>g.id===id); }
function catById(id){ return state.categories.find(c=>c.id===id); }
state.goals.forEach(g=> g._th=TH);

/* virtual "today" for backtracking/demo */
let VTODAY=localStorage.getItem(KEY+"-vtoday")||null;
function today(){ return VTODAY||todayStr(); }
function setVToday(d){ VTODAY=d||null; d?localStorage.setItem(KEY+"-vtoday",d):localStorage.removeItem(KEY+"-vtoday"); }

/* which week/month we are VIEWING (independent of today, for backtracking) */
let viewWeekStart=null, viewMonthKey=null;
function currentWeek(){
  const ws=viewWeekStart || E.weekForDate(today(),state.period)?.start;
  return E.buildWeeks(state.period).find(w=>w.start===ws) || E.weekForDate(today(),state.period) || E.buildWeeks(state.period)[0];
}
function currentMonthKey(){ return viewMonthKey || E.monthKeyOf(today()); }

/* ------------------------- entry operations ------------------------- */
/* Count goals: each entry = one occurrence (supports multiple/day). */
function countEntries(goalId,date){ return state.entries.filter(e=>e.goalId===goalId && e.date===date && e.kind==="logged"); }
function addOccurrence(goalId,date){ state.entries.push(mkEntry(goalId,date,{})); save(); }
function removeOccurrence(goalId,date){ const list=countEntries(goalId,date); if(list.length){ const id=list[list.length-1].id; state.entries=state.entries.filter(e=>e.id!==id); save(); } }
/* Boolean goals: single entry per day; toggle logged / (remove) / na */
function singleEntry(goalId,date){ return state.entries.find(e=>e.goalId===goalId && e.date===date); }
function setDayState(goalId,date,stateName){ // "logged" | "na" | "missing"
  state.entries=state.entries.filter(e=>!(e.goalId===goalId && e.date===date));
  if(stateName==="logged") state.entries.push(mkEntry(goalId,date,{}));
  else if(stateName==="na") state.entries.push(mkEntry(goalId,date,{kind:"na"}));
  save();
}
function setValue(goalId,date,patch){ // average / percentage / meals: upsert one entry
  let e=state.entries.find(x=>x.goalId===goalId && x.date===date && x.kind!=="na");
  if(!e){ e=mkEntry(goalId,date,{}); state.entries.push(e); }
  Object.assign(e,patch,{kind:"logged",ts:Date.now()}); save();
}
function clearValue(goalId,date){ state.entries=state.entries.filter(e=>!(e.goalId===goalId && e.date===date)); save(); }

/* ------------------------- small helpers ------------------------- */
let flashT; function flash(m){ const f=document.getElementById("flash"); f.textContent=m; f.classList.add("show"); clearTimeout(flashT); flashT=setTimeout(()=>f.classList.remove("show"),1500); }
function sheet(html){ const bg=document.createElement("div"); bg.className="sheet-bg";
  bg.innerHTML=`<div class="sheet"><div class="handle"></div>${html}</div>`;
  bg.addEventListener("click",e=>{ if(e.target===bg) bg.remove(); }); document.body.appendChild(bg); return bg; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function longDate(d){ return new Date(E.parseDate(d)).toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"}); }
function dShort(d){ return new Date(E.parseDate(d)).toLocaleDateString(undefined,{weekday:"short"}); }
function dNum(d){ return E.parseDate(d).getDate(); }
function monthLabel(key){ const [y,m]=key.split("-").map(Number); return new Date(y,m-1,1).toLocaleDateString(undefined,{month:"long",year:"numeric"}); }
function freqLabel(f){ return {D:"Daily",W:"Weekly",M:"Monthly","3M":"3-month"}[f]||f; }
function typeLabel(t){ return {count:"Count",boolean:"Yes/No",average:"Average",percentage:"Percentage",threshold:"Threshold",qualify:"Qualify",milestone:"Project",reading:"Reading",meals:"Meals"}[t]||t; }
function track(pct,status){ return `<div class="track ${status}"><span style="width:${pct==null?0:E.clamp(pct,0,100)}%"></span></div>`; }
function stText(status,label){ return `<span class="st ${status}">${label}</span>`; }

/* review record lookup / mark */
function weekReview(key){ return state.reviews.find(r=>r.type==="weekly"&&r.key===key); }
function monthReview(key){ return state.reviews.find(r=>r.type==="monthly"&&r.key===key); }
function isWeekReviewed(week){ const r=weekReview(week.start); return !!(r && r.completed); }

/* =========================================================================
 * ROUTING — 4 sections
 * ========================================================================= */
let route="week";
const TABS=[ {id:"week",label:"Week"},{id:"month",label:"Month"},{id:"progress",label:"Progress"},{id:"goals",label:"Goals"} ];
function go(r){ route=r; render(); window.scrollTo(0,0); }

function render(){
  const d=today(), wk=E.weekForDate(d,state.period);
  const inP = d>=state.period.start && d<=state.period.end;
  document.getElementById("top").innerHTML=`
    <div><h1>Goal Review</h1><div class="meta">${inP?`Week ${wk?wk.index:"—"} of ${E.buildWeeks(state.period).length}`:"Outside period"} · ${longDate(d)}</div></div>
    <button class="linkbtn" id="settings">Settings</button>`;
  const views={ week:viewWeek, month:viewMonth, progress:viewProgress, goals:viewGoals };
  document.getElementById("app").innerHTML=(views[route]||viewWeek)();
  document.getElementById("tabs").innerHTML=TABS.map(t=>`<button data-tab="${t.id}" class="${route===t.id?"active":""}">${t.label}</button>`).join("");
  bind();
}

/* =========================================================================
 * WEEK — the hero: summary + per-category goal review + reflection
 * ========================================================================= */
function viewWeek(){
  const wk=currentWeek(); if(!wk) return `<div class="empty">No weeks in period.</div>`;
  const d=today();
  const asOf = wk.end<d ? wk.end : d;                 // don't score days that haven't happened
  const o=E.overallWeekly(state.goals,state.entries,wk,asOf,TH,FW,state.categories);
  const cov=E.weekCoverage(state.goals,state.entries,wk,asOf);
  const reviewed=isWeekReviewed(wk);
  const weeks=E.buildWeeks(state.period); const idx=weeks.findIndex(w=>w.start===wk.start);

  let h=`<div class="summary">
    <div>
      <div class="bignum ${o.score==null?"none":""}">${o.score==null?"—":E.round(o.score)+"%"}</div>
      <div class="sub">Week ${wk.index} · ${fmtRange(wk)} ${reviewed?'<span class="badge reviewed">reviewed</span>':''}</div>
    </div>
    <div style="text-align:right">
      <div class="coverage">${cov.have}/${cov.need} entries logged (${cov.pct}%)</div>
      <div class="rowbtn" style="justify-content:flex-end">
        <button class="btn sec sm" id="wk-prev" ${idx<=0?"disabled":""}>‹ Prev</button>
        <button class="btn sec sm" id="wk-next" ${idx>=weeks.length-1?"disabled":""}>Next ›</button>
      </div>
    </div></div>`;
  h+=`<div class="hint">Log anything you did this week below — tap days for daily habits, use ＋ for sessions, type values for the rest. Already-logged items are highlighted. Missing data is <b>not</b> counted as zero.</div>`;

  for(const c of state.categories){
    const cw=E.categoryWeekly(c.id,state.goals,state.entries,wk,asOf,TH,FW);
    if(!cw.rows.length && !cw.longerRows.length) continue;
    h+=`<div class="catg"><div class="cn">${c.name}</div><div class="cs ${cw.score==null?"none st":"st "+cw.status}">${cw.score==null?"no data":E.round(cw.score)+"%"}</div></div>`;
    h+=`<div class="rows">`;
    for(const r of cw.rows) h+=weekGoalRow(r.goal, r, wk, asOf);
    h+=`</div>`;
    if(cw.longerRows.length){
      h+=`<div class="note" style="margin:8px 0 4px">Longer-term (tracked on Month/Progress):</div><div class="rows">`;
      for(const r of cw.longerRows) h+=longerRowCompact(r.goal, r);
      h+=`</div>`;
    }
  }

  // reflection
  const rev=weekReview(wk.start)||{answers:{}};
  h+=`<h2 class="sec">Reflection (optional)</h2>
    <label class="fld">What went well?</label><textarea id="rf-wins">${esc(rev.answers.wins)}</textarea>
    <label class="fld">What did you struggle with?</label><textarea id="rf-str">${esc(rev.answers.struggles)}</textarea>
    <label class="fld">One thing to change next week?</label><textarea id="rf-chg">${esc(rev.answers.change)}</textarea>
    <label class="fld">Main priority next week?</label><textarea id="rf-pri">${esc(rev.answers.priority)}</textarea>
    <div style="height:12px"></div>
    <button class="btn" id="wk-complete">${reviewed?"Update review":"Mark week reviewed & save"}</button>
    <button class="btn ghost" id="wk-saveonly">Save reflection without marking reviewed</button>`;
  return h;
}
function fmtRange(wk){ const a=new Date(E.parseDate(wk.start)),b=new Date(E.parseDate(wk.end));
  const o={day:"numeric",month:"short"}; return `${a.toLocaleDateString(undefined,o)} – ${b.toLocaleDateString(undefined,o)}`; }

/* a weekly goal row with the right inline control */
function weekGoalRow(g, r, wk, asOf){
  const status=r.score==null?"none":r.status;
  const valTxt = r.score==null ? `<span class="st none">—</span>` : `<span class="val">${r.label}</span> ${stText(status, r.score!=null?E.round(r.score)+"%":"")}`;
  let control="";
  if(g.type==="count"){
    const todayStr2=today();
    control=`<div class="counter">
      <button data-cdec="${g.id}">−</button>
      <span class="v">${r.actual}</span>
      <button data-cinc="${g.id}">＋</button></div>`;
  } else if(g.type==="boolean" && g.freq==="D"){
    control=`<button class="btn sec sm" data-expand="${g.id}">Days ▾</button>`;
  } else if(g.type==="boolean"){
    const yes=r.complete;
    control=`<button class="chip ${yes?"on":""}" data-wkbool="${g.id}">${yes?"✓ Yes":"Mark done"}</button>`;
  } else if(g.type==="meals"){
    control=`<button class="btn sec sm" data-expand="${g.id}">Days ▾</button>`;
  } else if(g.type==="average"){
    control=`<button class="btn sec sm" data-expand="${g.id}">Enter ▾</button>`;
  } else if(g.type==="percentage"){
    control=`<button class="btn sec sm" data-editpct="${g.id}">Edit</button>`;
  }
  let row=`<div class="grow"><div class="nm"><div class="title">${esc(g.title)}</div>
    <div class="det">${weekTargetText(g)} · ${valTxt}${r.coverage&&r.coverage.need?` · <span class="small">${r.coverage.have}/${r.coverage.need} days logged</span>`:""}</div>
    ${track(r.score,status)}</div>${control}</div>`;
  return row;
}
function weekTargetText(g){
  if(g.type==="count") return `${g.target} ${g.unit||"/wk"}`;
  if(g.type==="boolean"&&g.freq==="D") return `every day`;
  if(g.type==="boolean") return `once this week`;
  if(g.type==="meals") return `${g.target} meals/day`;
  if(g.type==="average") return `avg ${g.lowerIsBetter?"≤":"≥"}${E.fmtMin(g.target)}/day`;
  if(g.type==="percentage") return `target ${g.target}%`;
  return g.unit||"";
}
function longerRowCompact(g,r){
  const status=r.score==null?"none":r.status;
  return `<div class="grow click" data-goal="${g.id}"><div class="nm"><div class="title">${esc(g.title)}</div>
    <div class="det">${freqLabel(g.freq)} · ${r.label}</div>${track(r.score,status)}</div>
    <span class="st ${status}">${r.score==null?"—":E.round(r.score)+"%"}</span></div>`;
}

/* expandable 7-day editor (daily boolean / meals / average) */
function expandDays(goalId){
  const g=goalById(goalId); const wk=currentWeek(); const days=E.daysInWeek(wk); const d=today();
  const es=E.entriesFor(g,state.entries,wk.start,wk.end);
  const byDay=E.byDay(es,days);
  let inner="";
  if(g.type==="boolean"){
    inner=`<div class="week7">`+days.map(dd=>{
      const cell=byDay[dd]; const future=dd>d; const stt=future?"future":cell.state;
      const mk= cell.state==="logged"?"✓" : cell.state==="na"?"–" : "·";
      return `<div class="day ${stt}" data-dayb="${goalId}:${dd}"><div class="dl">${dShort(dd)}</div><div class="mk">${mk}</div><div class="num">${dNum(dd)}</div></div>`;
    }).join("")+`</div><div class="note">Tap: empty → done → N/A → empty. Missing days are not counted as failures.</div>`;
  } else if(g.type==="meals"){
    inner=days.map(dd=>{
      const cell=byDay[dd]; const future=dd>d; const m=cell.meals||{};
      const items=[["b","B"],["l","L"],["d","D"],["s","S"]];
      return `<div class="grow" style="border-top:1px solid var(--line)"><div class="nm"><div class="title" style="font-size:.85rem">${dShort(dd)} ${dNum(dd)}</div>
        <div class="chips">${items.map(([k,lab])=>`<button class="chip ${m[k]?"on":""}" ${future?"disabled":""} data-mealc="${goalId}:${dd}:${k}">${lab}</button>`).join("")}
        <button class="chip" ${future?"disabled":""} data-mealna="${goalId}:${dd}">N/A</button></div></div></div>`;
    }).join("");
  } else if(g.type==="average"){
    inner=days.map(dd=>{
      const cell=byDay[dd]; const future=dd>d;
      const val = cell.state==="logged" ? cell.value : "";
      return `<div class="grow" style="border-top:1px solid var(--line)"><div class="nm"><div class="title" style="font-size:.85rem">${dShort(dd)} ${dNum(dd)} ${cell.state==="missing"&&!future?'<span class="badge missing">missing</span>':''}</div></div>
        <input type="number" inputmode="numeric" placeholder="minutes" value="${val}" ${future?"disabled":""} data-avg="${goalId}:${dd}" style="width:120px">
        <button class="btn ghost sm" data-avgclr="${goalId}:${dd}">clear</button></div>`;
    }).join("");
  }
  const bg=sheet(`<h3>${esc(g.title)}</h3><div class="small">${weekTargetText(g)} · ${fmtRange(wk)}</div><div style="height:10px"></div>${inner}
    <div style="height:14px"></div><button class="btn" id="days-done">Done</button>`);
  bg.querySelector("#days-done").onclick=()=>{ bg.remove(); render(); };
  bindDayEditors(bg);
}
function bindDayEditors(bg){
  bg.querySelectorAll("[data-dayb]").forEach(el=>el.onclick=()=>{
    if(el.classList.contains("future"))return;
    const [gid,dd]=el.dataset.dayb.split(":"); const cur=singleEntry(gid,dd);
    const next = !cur ? "logged" : cur.kind==="logged" ? "na" : "missing";
    setDayState(gid,dd,next); flash("Saved");
    // re-render the sheet
    bg.remove(); expandDays(gid);
  });
  bg.querySelectorAll("[data-mealc]").forEach(el=>el.onclick=()=>{
    const [gid,dd,k]=el.dataset.mealc.split(":"); let e=state.entries.find(x=>x.goalId===gid&&x.date===dd&&x.kind!=="na");
    if(!e){ e=mkEntry(gid,dd,{meals:{}}); state.entries.push(e); } e.meals=e.meals||{}; e.meals[k]=!e.meals[k]; e.kind="logged"; save();
    bg.remove(); expandDays(gid);
  });
  bg.querySelectorAll("[data-mealna]").forEach(el=>el.onclick=()=>{ const [gid,dd]=el.dataset.mealna.split(":"); setDayState(gid,dd,"na"); bg.remove(); expandDays(gid); });
  bg.querySelectorAll("[data-avg]").forEach(el=>el.onchange=()=>{
    const [gid,dd]=el.dataset.avg.split(":"); const v=el.value.trim();
    if(v==="") clearValue(gid,dd); else setValue(gid,dd,{value:Number(v)}); flash("Saved");
  });
  bg.querySelectorAll("[data-avgclr]").forEach(el=>el.onclick=()=>{ const [gid,dd]=el.dataset.avgclr.split(":"); clearValue(gid,dd); bg.remove(); expandDays(gid); });
}

/* percentage editor (class participation) */
function editPct(goalId){
  const g=goalById(goalId); const wk=currentWeek();
  const e=state.entries.filter(x=>x.goalId===goalId && x.date>=wk.start && x.date<=wk.end && x.kind==="logged").slice(-1)[0]||{};
  const bg=sheet(`<h3>${esc(g.title)}</h3><div class="small">${fmtRange(wk)}</div>
    <label class="fld">Attended / participated</label><input id="pa" type="number" inputmode="numeric" value="${e.value??""}" placeholder="9">
    <label class="fld">Total this week</label><input id="pt" type="number" inputmode="numeric" value="${e.total??""}" placeholder="10">
    <div style="height:12px"></div><button class="btn" id="ps">Save</button>
    <button class="btn ghost" id="pc">Clear this week</button>`);
  bg.querySelector("#ps").onclick=()=>{ const a=Number(bg.querySelector("#pa").value), t=Number(bg.querySelector("#pt").value);
    if(isNaN(a)){ flash("Enter a number"); return; } setValue(goalId, wk.start, {value:a, total:t||undefined}); bg.remove(); flash("Saved"); render(); };
  bg.querySelector("#pc").onclick=()=>{ state.entries=state.entries.filter(x=>!(x.goalId===goalId && x.date>=wk.start && x.date<=wk.end)); save(); bg.remove(); render(); };
}

/* =========================================================================
 * MONTH
 * ========================================================================= */
function viewMonth(){
  const months=E.monthsInPeriod(state.period).map(m=>m.key);
  const key=months.includes(currentMonthKey())?currentMonthKey():months[0];
  const d=today();
  const weeks=E.buildWeeks(state.period).filter(w=>E.monthKeyOf(w.start)===key);
  let h=`<div class="summary"><div><div class="lead">${monthLabel(key)}</div></div></div>`;
  h+=`<div class="chips">${months.map(k=>`<button class="chip ${k===key?"on":""}" data-mo="${k}">${monthLabel(k).split(" ")[0]}</button>`).join("")}</div>`;

  // weekly-goal average performance across the month (coverage-aware, past weeks only)
  const catAgg={}; state.categories.forEach(c=>catAgg[c.id]={sum:0,n:0});
  let oSum=0,oN=0;
  for(const w of weeks){ if(E.parseDate(w.start)>E.parseDate(d)) continue;
    const asOf=w.end<d?w.end:d;
    const o=E.overallWeekly(state.goals,state.entries,w,asOf,TH,FW,state.categories);
    if(o.score!=null){ oSum+=o.score; oN++; }
    for(const cc of o.cats){ catAgg[cc.cat.id].sum+=cc.score; catAgg[cc.cat.id].n++; }
  }
  const monthScore = oN? oSum/oN : null;
  h+=`<h2 class="sec">Weekly-goal performance (avg of weeks in month)</h2>`;
  h+=`<div class="summary"><div class="bignum ${monthScore==null?"none":""}">${monthScore==null?"—":E.round(monthScore)+"%"}</div></div>`;
  h+=`<div class="rows">`;
  for(const c of state.categories){ const a=catAgg[c.id]; if(!a.n) continue; const sc=a.sum/a.n; const st=E.statusOf(sc,TH);
    h+=`<div class="grow"><div class="nm"><div class="title">${esc(c.name)}</div>${track(sc,st)}</div><span class="st ${st}">${E.round(sc)}%</span></div>`; }
  h+=`</div>`;

  // monthly + 3M goals progress (counted within month window, once)
  const win=E.monthRange(key);
  const longer=state.goals.filter(g=>g.active!==false && (g.freq==="M"||g.freq==="3M"));
  if(longer.length){
    h+=`<h2 class="sec">Monthly & long-term goals</h2><div class="rows">`;
    for(const g of longer){ g._th=TH;
      const r = g.type==="count"? E.periodResult(g,state.entries, win.end>d?d:win.end) : E.periodResult(g,state.entries,d);
      const st=r.score==null?"none":r.status;
      const click = (["milestone","threshold","qualify","reading","count"].includes(g.type))?`data-goal="${g.id}" class="grow click"`:`class="grow"`;
      h+=`<div ${click}><div class="nm"><div class="title">${esc(g.title)}</div><div class="det">${freqLabel(g.freq)} · ${r.label}</div>${track(r.score,st)}</div>
        <span class="st ${st}">${r.score==null?"—":E.round(r.score)+"%"}${r.complete?" ✓":""}</span></div>`; }
    h+=`</div>`;
  }

  // reflection
  const rev=monthReview(key)||{answers:{}};
  h+=`<h2 class="sec">Monthly reflection</h2>
    <label class="fld">What went well this month?</label><textarea id="mo-wins">${esc(rev.answers.wins)}</textarea>
    <label class="fld">What did you struggle with?</label><textarea id="mo-str">${esc(rev.answers.struggles)}</textarea>
    <label class="fld">Priority for next month?</label><textarea id="mo-pri">${esc(rev.answers.priority)}</textarea>
    <div style="height:12px"></div><button class="btn" id="mo-save" data-key="${key}">${rev.completed?"Update monthly review":"Save monthly review"}</button>`;
  return h;
}

/* =========================================================================
 * PROGRESS — the visualisations (kept & improved, but restrained)
 * ========================================================================= */
function viewProgress(){
  const d=today();
  const trend=E.weeklyTrend(state.goals,state.entries,state.period,d,TH,FW,state.categories);
  const done=trend.filter(t=>!t.future && t.score!=null);
  const overall=done.length? done.reduce((s,t)=>s+t.score,0)/done.length : null;
  const st=overall==null?"none":E.statusOf(overall,TH);

  let h=`<div class="summary"><div><div class="bignum ${overall==null?"none":""}">${overall==null?"—":E.round(overall)+"%"}</div>
    <div class="sub">Overall · avg of ${done.length} reviewed week${done.length===1?"":"s"} · ${state.period.start} → ${state.period.end}</div></div></div>`;

  // main trend chart
  h+=`<h2 class="sec">Weekly performance over the 3 months</h2>
    <div class="chartwrap">${lineChart(trend.map(t=>({x:t.week,y:t.score,future:t.future})),"W")}
    <div class="clegend">Each point is a reviewed week's score. Future weeks are omitted; weeks with no data yet are gaps.</div></div>`;

  // category comparison (small multiples as a grouped bar)
  h+=`<h2 class="sec">Category performance (period to date)</h2><div class="rows">`;
  const catScores=[];
  for(const c of state.categories){
    const ct=E.categoryTrend(c.id,state.goals,state.entries,state.period,d,TH,FW).filter(x=>!x.future && x.score!=null);
    if(!ct.length) continue; const sc=ct.reduce((s,x)=>s+x.score,0)/ct.length; const cst=E.statusOf(sc,TH);
    catScores.push({c,sc,cst});
    h+=`<div class="grow"><div class="nm"><div class="title">${esc(c.name)}</div>${track(sc,cst)}</div><span class="st ${cst}">${E.round(sc)}%</span></div>`;
  }
  h+=`</div>`;

  // strongest / weakest
  if(catScores.length){
    const best=[...catScores].sort((a,b)=>b.sc-a.sc)[0], worst=[...catScores].sort((a,b)=>a.sc-b.sc)[0];
    h+=`<div class="rows" style="margin-top:10px">
      <div class="grow"><div class="nm"><div class="title">Strongest area</div></div><span class="st green">${esc(best.c.name)}</span></div>
      <div class="grow"><div class="nm"><div class="title">Needs most attention</div></div><span class="st red">${esc(worst.c.name)}</span></div></div>`;
  }

  // every goal table
  h+=`<h2 class="sec">Every goal — target vs actual</h2>`;
  const wk=E.weekForDate(d,state.period);
  h+=`<table class="tbl"><thead><tr><th>Goal</th><th>Target</th><th class="num">Actual</th><th>Status</th></tr></thead><tbody>`;
  for(const g of state.goals.filter(x=>x.active!==false)){ g._th=TH;
    const r=E.result(g,state.entries,wk,d);
    const tgt= g.type==="threshold"?`${g.direction==="min"?"≥":"≤"}${g.target}`
      : g.type==="qualify"?`${g.target}@${g.bar}%`
      : g.type==="average"?`≤${E.fmtMin(g.target)}`
      : g.type==="milestone"?`${(g.milestones||[]).length} steps`
      : g.type==="reading"?`${(g.books||[]).length} books`
      : `${g.target} ${g.unit||""}`;
    const stt=r.score==null?"none":r.status;
    h+=`<tr><td>${esc(g.title)}</td><td>${tgt}</td><td class="num">${esc(r.label)}</td><td><span class="st ${stt}">${r.score==null?"—":E.round(r.score)+"%"}</span></td></tr>`;
  }
  h+=`</tbody></table>`;

  // goal-specific trend picker
  h+=`<h2 class="sec">Goal-specific trend</h2>
    <select id="gt-sel">${state.goals.filter(g=>g.active!==false && (g.freq==="D"||g.freq==="W")).map(g=>`<option value="${g.id}">${esc(g.title)}</option>`).join("")}</select>
    <div id="gt-chart" style="margin-top:10px"></div>`;
  return h;
}

function goalTrendChart(goalId){
  const g=goalById(goalId); if(!g) return "";
  const pts=E.buildWeeks(state.period).map(w=>{ const future=E.parseDate(w.start)>E.parseDate(today());
    if(future) return {x:w.index,y:null,future:true};
    const r=E.weeklyResult(g,state.entries,w,w.end<today()?w.end:today());
    return {x:w.index,y:r.score==null?null:E.round(r.score),future:false}; });
  return `<div class="chartwrap">${lineChart(pts,"W")}<div class="clegend">${esc(g.title)} — weekly result across the period.</div></div>`;
}

/* restrained SVG line chart (light theme) */
function lineChart(points,xpre){
  const W=720,H=180,pad=28;
  const xs=points.map((p,i)=> pad + i*((W-2*pad)/Math.max(points.length-1,1)));
  const y=v=> H-pad-(v/100)*(H-2*pad);
  const grid=[0,50,100].map(v=>`<line x1="${pad}" y1="${y(v)}" x2="${W-pad}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="4" y="${y(v)+3}" fill="var(--ink-2)" font-size="10">${v}</text>`).join("");
  const seg=[]; let prev=null;
  points.forEach((p,i)=>{ if(p.y==null){prev=null;return;} if(prev!=null) seg.push(`<line x1="${xs[prev]}" y1="${y(points[prev].y)}" x2="${xs[i]}" y2="${y(p.y)}" stroke="var(--accent)" stroke-width="2"/>`); prev=i; });
  const dots=points.map((p,i)=> p.y==null?"":`<circle cx="${xs[i]}" cy="${y(p.y)}" r="3.5" fill="var(--accent)"/>`).join("");
  const labels=points.map((p,i)=> (i%2===0||points.length<=7)?`<text x="${xs[i]}" y="${H-8}" fill="var(--ink-2)" font-size="9" text-anchor="middle">${xpre}${p.x}</text>`:"").join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${grid}${seg.join("")}${dots}${labels}</svg>`;
}

/* =========================================================================
 * GOALS — simple manager (one page), edit everything
 * ========================================================================= */
function viewGoals(){
  let h=`<div class="summary"><div><div class="lead">Goals</div><div class="sub">${state.goals.filter(g=>g.active!==false).length} active · period ${state.period.start} → ${state.period.end}</div></div>
    <button class="btn sec sm" id="add-goal">＋ Add</button></div>`;
  for(const c of state.categories){
    const gs=state.goals.filter(g=>g.cat===c.id); if(!gs.length) continue;
    h+=`<h2 class="sec">${esc(c.name)}</h2><div class="rows">`;
    for(const g of gs){ g._th=TH; const r=E.result(g,state.entries,E.weekForDate(today(),state.period),today()); const st=r.score==null?"none":r.status;
      h+=`<div class="grow click" data-goal="${g.id}"><div class="nm"><div class="title">${g.active===false?"⏸ ":""}${esc(g.title)}</div>
        <div class="det">${freqLabel(g.freq)} · ${typeLabel(g.type)} · target ${goalTargetShort(g)}</div></div>
        <span class="st ${st}">${r.score==null?"—":E.round(r.score)+"%"}</span></div>`; }
    h+=`</div>`;
  }
  return h;
}
function goalTargetShort(g){ if(g.type==="milestone")return `${(g.milestones||[]).length} steps`; if(g.type==="reading")return `${(g.books||[]).length} books`;
  if(g.type==="average")return `≤${E.fmtMin(g.target)}`; if(g.type==="threshold")return `${g.direction==="min"?"≥":"≤"}${g.target}`;
  if(g.type==="qualify")return `${g.target}@${g.bar}%`; return `${g.target} ${g.unit||""}`; }

/* =========================================================================
 * EVENT BINDING
 * ========================================================================= */
function bind(){
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>go(b.dataset.tab));
  const s=document.getElementById("settings"); if(s) s.onclick=openSettings;

  // week nav
  const wp=document.getElementById("wk-prev"), wn=document.getElementById("wk-next");
  if(wp) wp.onclick=()=>{ const weeks=E.buildWeeks(state.period); const i=weeks.findIndex(w=>w.start===currentWeek().start); if(i>0){ viewWeekStart=weeks[i-1].start; render(); } };
  if(wn) wn.onclick=()=>{ const weeks=E.buildWeeks(state.period); const i=weeks.findIndex(w=>w.start===currentWeek().start); if(i<weeks.length-1){ viewWeekStart=weeks[i+1].start; render(); } };

  // count +/-
  document.querySelectorAll("[data-cinc]").forEach(b=>b.onclick=()=>{ const g=b.dataset.cinc; addOccurrence(g, defaultLogDate(g)); flash("Logged"); render(); });
  document.querySelectorAll("[data-cdec]").forEach(b=>b.onclick=()=>{ const g=b.dataset.cdec; const wk=currentWeek();
    // remove latest occurrence in the viewed week
    const inWk=state.entries.filter(e=>e.goalId===g && e.date>=wk.start && e.date<=wk.end && e.kind==="logged").sort((a,b2)=>a.ts-b2.ts);
    if(inWk.length){ const id=inWk[inWk.length-1].id; state.entries=state.entries.filter(e=>e.id!==id); save(); flash("Removed"); render(); } });
  document.querySelectorAll("[data-wkbool]").forEach(b=>b.onclick=()=>{ const g=b.dataset.wkbool; const wk=currentWeek();
    const has=state.entries.some(e=>e.goalId===g && e.date>=wk.start && e.date<=wk.end && e.kind==="logged");
    if(has){ state.entries=state.entries.filter(e=>!(e.goalId===g && e.date>=wk.start && e.date<=wk.end)); } else { addOccurrence(g, defaultLogDate(g)); }
    save(); flash("Saved"); render(); });
  document.querySelectorAll("[data-expand]").forEach(b=>b.onclick=()=>expandDays(b.dataset.expand));
  document.querySelectorAll("[data-editpct]").forEach(b=>b.onclick=()=>editPct(b.dataset.editpct));
  document.querySelectorAll("[data-goal]").forEach(el=>el.onclick=()=>editGoal(el.dataset.goal));

  // week complete / save
  const wc=document.getElementById("wk-complete"); if(wc) wc.onclick=()=>saveWeek(true);
  const wso=document.getElementById("wk-saveonly"); if(wso) wso.onclick=()=>saveWeek(false);

  // month
  document.querySelectorAll("[data-mo]").forEach(b=>b.onclick=()=>{ viewMonthKey=b.dataset.mo; render(); });
  const ms=document.getElementById("mo-save"); if(ms) ms.onclick=()=>saveMonth(ms.dataset.key);

  // goals
  const ag=document.getElementById("add-goal"); if(ag) ag.onclick=()=>editGoal(null);

  // progress goal-trend
  const gt=document.getElementById("gt-sel"); if(gt){ const paint=()=>{ document.getElementById("gt-chart").innerHTML=goalTrendChart(gt.value); }; gt.onchange=paint; paint(); }
}
/* when logging from the weekly view, attribute to "today" if today is inside the
 * viewed week, otherwise to the week's end (so backtracked weeks log correctly). */
function defaultLogDate(goalId){ const wk=currentWeek(); const d=today(); return (d>=wk.start && d<=wk.end)? d : wk.end; }

/* save weekly reflection + optionally mark reviewed (coverage-aware snapshot) */
function saveWeek(markReviewed){
  const wk=currentWeek(); const d=today(); const asOf=wk.end<d?wk.end:d;
  const o=E.overallWeekly(state.goals,state.entries,wk,asOf,TH,FW,state.categories);
  const cov=E.weekCoverage(state.goals,state.entries,wk,asOf);
  const answers={ wins:val("rf-wins"), struggles:val("rf-str"), change:val("rf-chg"), priority:val("rf-pri") };
  function val(id){ const el=document.getElementById(id); return el?el.value.trim():""; }
  let rec=weekReview(wk.start);
  const snap={ type:"weekly", key:wk.start, weekIndex:wk.index, score:o.score, coverage:cov,
    answers, completed: markReviewed? true : (rec?rec.completed:false), updatedAt:todayStr() };
  if(rec) Object.assign(rec,snap); else state.reviews.push(snap);
  save(); flash(markReviewed?"Week reviewed ✓":"Reflection saved"); render();
}
function saveMonth(key){
  const d=today(); const weeks=E.buildWeeks(state.period).filter(w=>E.monthKeyOf(w.start)===key && E.parseDate(w.start)<=E.parseDate(d));
  let sum=0,n=0; for(const w of weeks){ const o=E.overallWeekly(state.goals,state.entries,w,w.end<d?w.end:d,TH,FW,state.categories); if(o.score!=null){sum+=o.score;n++;} }
  const answers={ wins:val("mo-wins"), struggles:val("mo-str"), priority:val("mo-pri") };
  function val(id){ const el=document.getElementById(id); return el?el.value.trim():""; }
  let rec=monthReview(key);
  const snap={ type:"monthly", key, score:n?sum/n:null, answers, completed:true, updatedAt:todayStr() };
  if(rec) Object.assign(rec,snap); else state.reviews.push(snap);
  save(); flash("Monthly review saved ✓"); render();
}

/* =========================================================================
 * GOAL EDITOR (same capabilities as before, light styling)
 * ========================================================================= */
function editGoal(id){
  const g=id? structuredClone(goalById(id)) : { id:null, title:"", cat:state.categories[0].id, sub:"", freq:"W", type:"count", target:1, unit:"", priority:"Medium", active:true };
  const catOpts=state.categories.map(c=>`<option value="${c.id}" ${g.cat===c.id?"selected":""}>${esc(c.name)}</option>`).join("");
  const typeOpts=["count","boolean","meals","average","percentage","threshold","qualify","milestone","reading"].map(t=>`<option value="${t}" ${g.type===t?"selected":""}>${typeLabel(t)}</option>`).join("");
  const freqOpts=["D","W","M","3M"].map(f=>`<option value="${f}" ${g.freq===f?"selected":""}>${freqLabel(f)}</option>`).join("");
  const bg=sheet(`<h3>${id?"Edit goal":"Add goal"}</h3>
    <label class="fld">Title</label><input id="e-title" value="${esc(g.title)}">
    <label class="fld">Category</label><select id="e-cat">${catOpts}</select>
    <label class="fld">Subcategory (optional)</label><input id="e-sub" value="${esc(g.sub||"")}">
    <div class="grid2"><div><label class="fld">Frequency</label><select id="e-freq">${freqOpts}</select></div><div><label class="fld">Type</label><select id="e-type">${typeOpts}</select></div></div>
    <div id="tf"></div>
    <label class="fld">Priority</label><select id="e-prio">${["High","Medium","Low"].map(p=>`<option ${g.priority===p?"selected":""}>${p}</option>`).join("")}</select>
    <label class="fld"><input type="checkbox" id="e-active" ${g.active!==false?"checked":""} style="width:auto;vertical-align:-2px"> Active (uncheck to pause)</label>
    <div style="height:14px"></div><button class="btn" id="e-save">Save</button>
    ${id?`<button class="btn danger" id="e-del">Delete goal & its entries</button>`:""}
    <button class="btn ghost" id="e-cancel">Cancel</button>`);
  const tf=bg.querySelector("#tf");
  function fields(){ const t=bg.querySelector("#e-type").value; let hh="";
    if(["count","meals"].includes(t)) hh=`<label class="fld">Target (per period)</label><input id="e-target" type="number" value="${g.target??1}"><label class="fld">Unit</label><input id="e-unit" value="${esc(g.unit||"")}">`;
    else if(t==="boolean") hh=`<div class="note">Yes/No. Daily → done days ÷ days logged (missing excluded). Weekly → once per week.</div>`;
    else if(t==="average") hh=`<label class="fld">Target (minutes)</label><input id="e-target" type="number" value="${g.target??180}"><label class="fld"><input type="checkbox" id="e-lower" ${g.lowerIsBetter!==false?"checked":""} style="width:auto;vertical-align:-2px"> Lower is better</label>`;
    else if(t==="percentage") hh=`<label class="fld">Target %</label><input id="e-target" type="number" value="${g.target??100}">`;
    else if(t==="threshold") hh=`<label class="fld">Target</label><input id="e-target" type="number" step="0.1" value="${g.target??8.5}"><label class="fld">Current</label><input id="e-current" type="number" step="0.1" value="${g.current??""}"><label class="fld">Direction</label><select id="e-dir"><option value="min" ${g.direction!=="max"?"selected":""}>At least (≥)</option><option value="max" ${g.direction==="max"?"selected":""}>At most (≤)</option></select>`;
    else if(t==="qualify") hh=`<label class="fld">How many must qualify</label><input id="e-target" type="number" value="${g.target??2}"><label class="fld">Bar %</label><input id="e-bar" type="number" value="${g.bar??90}"><div id="qi">${qualifyEditor(g)}</div><button class="btn sec sm" id="add-qi" style="margin-top:8px">＋ class</button>`;
    else if(t==="milestone") hh=`<div id="ml">${milestoneEditor(g)}</div><button class="btn sec sm" id="add-ml" style="margin-top:8px">＋ milestone</button>`;
    else if(t==="reading") hh=`<div id="bl">${bookEditor(g)}</div><button class="btn sec sm" id="add-bl" style="margin-top:8px">＋ book</button>`;
    tf.innerHTML=hh;
    const q=tf.querySelector("#add-qi"); if(q)q.onclick=()=>{(g.items=g.items||[]).push({name:"New class",value:"",credits:5});tf.querySelector("#qi").innerHTML=qualifyEditor(g);};
    const m=tf.querySelector("#add-ml"); if(m)m.onclick=()=>{(g.milestones=g.milestones||[]).push({name:"New milestone",done:false});tf.querySelector("#ml").innerHTML=milestoneEditor(g); bindMs(tf);};
    const b=tf.querySelector("#add-bl"); if(b)b.onclick=()=>{(g.books=g.books||[]).push({name:"New book",pages:300,read:0,done:false});tf.querySelector("#bl").innerHTML=bookEditor(g);};
    bindMs(tf);
  }
  function bindMs(scope){ scope.querySelectorAll("[data-mt]").forEach(btn=>btn.onclick=()=>{ btn.classList.toggle("on"); btn.textContent=btn.classList.contains("on")?"✓":""; }); }
  fields(); bg.querySelector("#e-type").onchange=fields;
  bg.querySelector("#e-cancel").onclick=()=>bg.remove();
  if(id) bg.querySelector("#e-del").onclick=()=>{ if(confirm("Delete this goal and all its entries?")){ state.goals=state.goals.filter(x=>x.id!==id); state.entries=state.entries.filter(e=>e.goalId!==id); save(); bg.remove(); flash("Deleted"); render(); } };
  bg.querySelector("#e-save").onclick=()=>{
    collect(bg,g);
    g.title=bg.querySelector("#e-title").value.trim(); g.cat=bg.querySelector("#e-cat").value; g.sub=bg.querySelector("#e-sub").value.trim();
    g.freq=bg.querySelector("#e-freq").value; g.type=bg.querySelector("#e-type").value; g.priority=bg.querySelector("#e-prio").value; g.active=bg.querySelector("#e-active").checked;
    const t=bg.querySelector("#e-target"); if(t)g.target=Number(t.value);
    const u=bg.querySelector("#e-unit"); if(u)g.unit=u.value.trim();
    const lo=bg.querySelector("#e-lower"); if(lo)g.lowerIsBetter=lo.checked;
    const cu=bg.querySelector("#e-current"); if(cu)g.current=cu.value===""?null:Number(cu.value);
    const di=bg.querySelector("#e-dir"); if(di)g.direction=di.value;
    const ba=bg.querySelector("#e-bar"); if(ba)g.bar=Number(ba.value);
    if(!g.title){ flash("Title required"); return; }
    g._th=TH;
    if(id){ const i=state.goals.findIndex(x=>x.id===id); state.goals[i]=g; } else { g.id="g"+Date.now(); g.createdAt=todayStr(); state.goals.push(g); }
    save(); bg.remove(); flash("Saved"); render();
  };
}
function qualifyEditor(g){ return (g.items||[]).map((it,i)=>`<div class="grid2" style="margin-top:6px"><input data-qi="name:${i}" value="${esc(it.name)}"><div class="grid2"><input data-qi="value:${i}" type="number" value="${it.value}" placeholder="%"><input data-qi="credits:${i}" type="number" value="${it.credits}" placeholder="cr"></div></div>`).join(""); }
function milestoneEditor(g){ return (g.milestones||[]).map((m,i)=>`<div class="mile"><button type="button" class="box ${m.done?"on":""}" data-mt="${i}">${m.done?"✓":""}</button><input data-ms="${i}" value="${esc(m.name)}"></div>`).join(""); }
function bookEditor(g){ return (g.books||[]).map((b,i)=>`<div style="padding:8px 0;border-top:1px solid var(--line)"><input data-bk="name:${i}" value="${esc(b.name)}"><div class="grid2" style="margin-top:6px"><input data-bk="read:${i}" type="number" value="${b.read}" placeholder="read"><input data-bk="pages:${i}" type="number" value="${b.pages}" placeholder="total"></div><label class="note"><input type="checkbox" data-bk="done:${i}" ${b.done?"checked":""} style="width:auto;vertical-align:-2px"> Finished</label></div>`).join(""); }
function collect(bg,g){
  bg.querySelectorAll("[data-qi]").forEach(inp=>{ const[f,i]=inp.dataset.qi.split(":"); g.items[i][f]= f==="name"?inp.value:(inp.value===""?"":Number(inp.value)); });
  bg.querySelectorAll("[data-ms]").forEach(inp=>{ g.milestones[inp.dataset.ms].name=inp.value; });
  bg.querySelectorAll("[data-mt]").forEach(btn=>{ g.milestones[btn.dataset.mt].done=btn.classList.contains("on"); });
  bg.querySelectorAll("[data-bk]").forEach(inp=>{ const[f,i]=inp.dataset.bk.split(":"); g.books[i][f]= f==="name"?inp.value : f==="done"?inp.checked : Number(inp.value); });
}

/* =========================================================================
 * SETTINGS — period, backtracking date, example data, export/import
 * ========================================================================= */
function openSettings(){
  const bg=sheet(`<h3>Settings</h3>
    <h2 class="sec">Period</h2>
    <div class="grid2"><div><label class="fld">Start</label><input id="s-start" type="date" value="${state.period.start}"></div><div><label class="fld">End</label><input id="s-end" type="date" value="${state.period.end}"></div></div>
    <h2 class="sec">Backtracking</h2>
    <label class="fld">Treat "today" as (for reviewing past weeks)</label><input id="s-vtoday" type="date" value="${today()}">
    <div class="note">Set this to a past Sunday to do a retrospective review. All logging attributes to the correct dates.</div>
    <h2 class="sec">Data</h2>
    <button class="btn sec" id="s-example">Load realistic example data</button>
    <button class="btn ghost" id="s-clear" style="margin-top:8px">Clear all entries (keep goals)</button>
    <button class="btn sec" id="s-export" style="margin-top:8px">Export backup (JSON)</button>
    <label class="fld">Import JSON</label><input id="s-import" type="file" accept="application/json">
    <button class="btn danger" id="s-reset" style="margin-top:14px">Reset to 25 seed goals</button>
    <div style="height:12px"></div><button class="btn" id="s-save">Save</button>`);
  bg.querySelector("#s-save").onclick=()=>{ state.period.start=bg.querySelector("#s-start").value; state.period.end=bg.querySelector("#s-end").value;
    setVToday(bg.querySelector("#s-vtoday").value||null); viewWeekStart=null; viewMonthKey=null; save(); bg.remove(); flash("Saved"); render(); };
  bg.querySelector("#s-example").onclick=()=>{ loadExample(); bg.remove(); flash("Example data loaded"); render(); };
  bg.querySelector("#s-clear").onclick=()=>{ if(confirm("Delete all entries?")){ state.entries=[]; state.reviews=[]; save(); bg.remove(); flash("Cleared"); render(); } };
  bg.querySelector("#s-export").onclick=()=>{ const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`goal-backup-${todayStr()}.json`; a.click(); flash("Exported"); };
  bg.querySelector("#s-import").onchange=e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{ try{ state=migrate(JSON.parse(r.result)); state.goals.forEach(g=>g._th=TH); save(); bg.remove(); flash("Imported"); render(); }catch(err){ flash("Invalid file"); } }; r.readAsText(f); };
  bg.querySelector("#s-reset").onclick=()=>{ if(confirm("Reset everything to seed?")){ state=seedState(); setVToday(null); save(); bg.remove(); flash("Reset"); render(); } };
}

/* =========================================================================
 * EXAMPLE DATA — realistic, coverage-aware (some missing days left blank)
 * ========================================================================= */
function loadExample(){
  state.entries=[]; state.reviews=[];
  const weeks=E.buildWeeks(state.period).slice(0,4);
  const byTitle=t=>state.goals.find(g=>g.title.includes(t));
  const add=(gid,date,extra={})=>state.entries.push(mkEntry(gid,date,extra));
  const addN=(gid,wk,n)=>{ for(let i=0;i<n;i++) add(gid, E.fmt(E.addDays(wk.startDate,i))); };
  const addDays2=(gid,wk,days)=>{ for(let i=0;i<days;i++) add(gid,E.fmt(E.addDays(wk.startDate,i))); };
  const addAvg=(gid,wk,base,coverDays)=>{ for(let i=0;i<coverDays;i++) add(gid,E.fmt(E.addDays(wk.startDate,i)),{value:base+((i*17)%40-20)}); };
  const addMeals=(gid,wk,fullDays)=>{ for(let i=0;i<fullDays;i++) add(gid,E.fmt(E.addDays(wk.startDate,i)),{meals:{b:true,l:true,d:true}}); };
  const addPct=(gid,wk,a,t)=>add(gid,wk.start,{value:a,total:t});
  const weekBool=(gid,wk,yes)=>{ if(yes) add(gid,wk.start); };

  const gym=byTitle("Gym"),cre=byTitle("creatine"),meals=byTitle("skip a meal"),scr=byTitle("screen time"),
    noph=byTitle("first 30"),rev=byTitle("Revise"),fam=byTitle("whole family"),cal=byTitle("grandparents"),
    cls=byTitle("every class"),plan=byTitle("study plan"),cur=byTitle("outside my usual")||byTitle("outside usual"),
    shr=byTitle("Share something"),hang=byTitle("every weekend");

  const gymP=[3,2,3,3], creDays=[7,6,7,5], mealsDays=[7,7,5,7], scrBase=[165,175,168,172], scrCover=[7,7,5,6],
    nophDays=[6,5,7,6], revP=[3,2,3,3], famP=[3,2,3,2], calP=[2,1,2,2], clsP=[[10,10],[9,10],[10,10],[9,10]];

  weeks.forEach((wk,i)=>{
    if(gym) addN(gym.id,wk,gymP[i]);
    if(cre) addDays2(cre.id,wk,creDays[i]);
    if(meals) addMeals(meals.id,wk,mealsDays[i]);
    if(scr) addAvg(scr.id,wk,scrBase[i],scrCover[i]);
    if(noph) addDays2(noph.id,wk,nophDays[i]);
    if(rev) addN(rev.id,wk,revP[i]);
    if(fam) addN(fam.id,wk,famP[i]);
    if(cal) addN(cal.id,wk,calP[i]);
    if(cls) addPct(cls.id,wk,clsP[i][0],clsP[i][1]);
    if(plan) weekBool(plan.id,wk, i!==1);
    if(cur) addN(cur.id,wk, i===3?0:1);
    if(shr) weekBool(shr.id,wk, i<3);
    if(hang) addN(hang.id,wk,1);
  });
  // monthly/project goals
  const gpa=byTitle("GPA"); if(gpa) gpa.current=8.3;
  const qual=byTitle("two classes"); if(qual&&qual.items){ qual.items[0].value=92; qual.items[1].value=87; qual.items[2].value=91; }
  const rd=byTitle("Homo Deus"); if(rd&&rd.books){ rd.books[0].read=Math.round(rd.books[0].pages*0.72); rd.books[1].read=rd.books[1].pages; rd.books[1].done=true; }
  const job=byTitle("afternoon job"); if(job&&job.milestones){ job.milestones[0].done=true; job.milestones[1].done=true; }
  const inv=byTitle("investing"); if(inv&&inv.milestones){ inv.milestones.slice(0,3).forEach(m=>m.done=true); }
  const drv=byTitle("driver"); if(drv&&drv.milestones){ drv.milestones[0].done=true; }
  const date=byTitle("Pookie date"); if(date) add(date.id, E.fmt(E.addDays(weeks[0].startDate,2)));
  const fl=byTitle("flowers"); if(fl) add(fl.id, E.fmt(E.addDays(weeks[1].startDate,3)));
  // one completed weekly review (week 1) so Progress has a reviewed point
  const w1=weeks[0]; const o=E.overallWeekly(state.goals,state.entries,w1,w1.end,TH,FW,state.categories);
  state.reviews.push({type:"weekly",key:w1.start,weekIndex:w1.index,score:o.score,coverage:E.weekCoverage(state.goals,state.entries,w1,w1.end),answers:{wins:"Strong gym + revision week",struggles:"Missed one family meal",change:"Plan Sunday dinner",priority:"Keep screen time down"},completed:true,updatedAt:todayStr()});
  save();
}

/* =========================================================================
 * BOOT
 * ========================================================================= */
function boot(){ // default to viewing the week that contains "today"
  const wk=E.weekForDate(today(),state.period); if(wk) viewWeekStart=wk.start;
  render();
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
}
window.addEventListener("DOMContentLoaded", boot);
