/* =========================================================================
 * engine.js — Pure calculation engine. No DOM, no storage. Testable.
 *
 * Data model (shared entries; see app.js store):
 *   entry = { id, goalId, date:"YYYY-MM-DD", kind, value, meals, note, ts }
 *     kind: "logged"  — a real recorded occurrence/value
 *           "na"      — the goal explicitly did not apply that day
 *     (MISSING is the ABSENCE of an entry — never stored, never a zero.)
 *   review = { id, type:"weekly"|"monthly", key, ... , reviewedDates:[...] }
 *
 * Scoring principle: MISSING data is EXCLUDED from the denominator and
 * reported separately as "coverage". A blank day is never counted as 0 /
 * as a failure. An explicit zero (logged value 0, or an "na") is honoured.
 * ========================================================================= */

const DAY = 86400000;

/* ----------------------------- date helpers ----------------------------- */
function parseDate(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y, m-1, d); }
function fmt(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d, weekStartsOn=1){
  const x=new Date(d); const day=(x.getDay()-weekStartsOn+7)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x;
}
function clamp(n,lo,hi){ return Math.max(lo, Math.min(hi,n)); }
function round(n,p=0){ const f=10**p; return Math.round(n*f)/f; }

function buildWeeks(period){
  const ps=parseDate(period.start), pe=parseDate(period.end);
  let first = startOfWeek(ps, period.weekStartsOn);
  if (fmt(addDays(first,6)) === fmt(ps)) first = addDays(first,7);
  const weeks=[]; let cur=first, i=1;
  while(cur <= pe){
    const alignedStart = cur < ps ? ps : cur;
    const naturalEnd = addDays(cur,6);
    const end = naturalEnd > pe ? pe : naturalEnd;
    weeks.push({ index:i, start:fmt(alignedStart), end:fmt(end),
                 startDate:parseDate(fmt(alignedStart)), endDate:parseDate(fmt(end)) });
    cur=addDays(cur,7); i++;
  }
  return weeks;
}
function weekForDate(dateStr, period){
  const weeks=buildWeeks(period); const d=parseDate(dateStr);
  return weeks.find(w=> d>=w.startDate && d<=w.endDate) || weeks[weeks.length-1] || null;
}
function daysInWeek(week){ // array of date strings actually inside the (possibly clamped) week
  const out=[]; let c=new Date(week.startDate);
  while(fmt(c)<=week.end){ out.push(fmt(c)); c=addDays(c,1); } return out;
}
function daysElapsedInWeek(week, today){
  const t=parseDate(today);
  if(t < week.startDate) return 0;
  if(t > week.endDate) return daysInWeek(week).length;
  return Math.floor((t - week.startDate)/DAY)+1;
}

function monthsInPeriod(period){
  const out=[]; let d=parseDate(period.start); const end=parseDate(period.end);
  while(d<=end){ const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    if(!out.find(m=>m.key===key)) out.push({key,y:d.getFullYear(),m:d.getMonth()}); d=addDays(d,1); }
  return out;
}
function monthKeyOf(dateStr){ const d=parseDate(dateStr); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function monthRange(key){ const [y,m]=key.split("-").map(Number); const start=new Date(y,m-1,1); const end=new Date(y,m,0); return {start:fmt(start),end:fmt(end)}; }

/* ----------------------------- status ----------------------------- */
function statusOf(score, th){ return score>=th.green ? "green" : score>=th.yellow ? "yellow" : "red"; }

/* ----------------------------- entry access ----------------------------- */
/* entriesFor: all entries for a goal within [start,end] inclusive */
function entriesFor(goal, entries, start, end){
  return entries.filter(e=> e.goalId===goal.id && e.date>=start && e.date<=end);
}

/* =========================================================================
 * WEEKLY RESULT — coverage-aware.
 * Returns:
 *  { score|null, status, label, actual, target,
 *    coverage:{ have, need }, complete:bool, remaining,
 *    perDay? , hasData }
 * score === null means "no data yet" (excluded from rollups).
 * ========================================================================= */
function weeklyResult(goal, entries, week, today){
  const th = goal._th || DEFAULT_TH;
  const weekDays = daysInWeek(week);
  const elapsedDays = weekDays.filter(d=> d<=today);           // only days that have happened
  const es = entriesFor(goal, entries, week.start, week.end);

  switch(goal.type){
    case "count": {
      // sum of logged occurrences (value defaults to 1 per entry). "na" => explicit 0 contribution.
      const logged = es.filter(e=> e.kind==="logged");
      const actual = logged.reduce((s,e)=> s + (e.value==null?1:Number(e.value)), 0);
      const score = clamp(actual/goal.target*100,0,100);
      return { score, status:statusOf(score,th), label:`${actual}/${goal.target}`,
               actual, target:goal.target, remaining:Math.max(goal.target-actual,0),
               complete:actual>=goal.target, hasData:logged.length>0,
               coverage:{have:null,need:null}, occurrences:logged };
    }
    case "boolean": {
      if(goal.freq!=="D"){ // weekly yes/no
        const yes = es.some(e=> e.kind==="logged" && (e.value==null || Number(e.value)>0));
        const anyEntry = es.length>0;
        const score = anyEntry ? (yes?100:0) : null;
        return { score, status: score==null?"none":statusOf(score,th),
                 label: anyEntry?(yes?"Yes":"No"):"—", actual:yes?1:0, target:1,
                 complete:yes, hasData:anyEntry, coverage:{have:anyEntry?1:0,need:1} };
      }
      // daily boolean: coverage-aware. denominator = days with an entry (logged or na).
      const covered = es.filter(e=> e.kind==="logged" || e.kind==="na");
      const doneDays = es.filter(e=> e.kind==="logged" && (e.value==null||Number(e.value)>0)).length;
      const have = covered.length, need = elapsedDays.length;
      const score = have? clamp(doneDays/have*100,0,100) : null;
      return { score, status: score==null?"none":statusOf(score,th),
               label: have?`${doneDays}/${have}`:"—", actual:doneDays, target:goal.target,
               complete:false, hasData:have>0, coverage:{have,need},
               perDay: byDay(es, weekDays) };
    }
    case "meals": {
      const covered = es.filter(e=> e.kind==="logged" || e.kind==="na");
      const have=covered.length, need=elapsedDays.length;
      const totalMeals = es.filter(e=>e.kind==="logged").reduce((s,e)=> s + (e.meals? Object.values(e.meals).filter(Boolean).length : (Number(e.value)||0)),0);
      const possible = have*goal.target;
      const score = possible? clamp(totalMeals/possible*100,0,100) : null;
      return { score, status: score==null?"none":statusOf(score,th),
               label: have?`${totalMeals}/${possible}`:"—", actual:totalMeals, target:goal.target,
               hasData:have>0, coverage:{have,need}, perDay: byDay(es, weekDays) };
    }
    case "average": {
      const vals = es.filter(e=>e.kind==="logged").map(e=>Number(e.value)).filter(v=>!isNaN(v));
      const have=es.filter(e=>e.kind==="logged").length, need=elapsedDays.length;
      if(!vals.length) return { score:null, status:"none", label:"—", actual:null, target:goal.target,
                                hasData:false, coverage:{have:0,need}, perDay:byDay(es,weekDays) };
      const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
      const score = goal.lowerIsBetter ? (avg<=goal.target?100:clamp(goal.target/avg*100,0,100))
                                        : clamp(avg/goal.target*100,0,100);
      return { score, status:statusOf(score,th), label:`${fmtMin(avg)} avg`, actual:avg, target:goal.target,
               complete: goal.lowerIsBetter? avg<=goal.target : avg>=goal.target,
               hasData:true, coverage:{have,need}, perDay:byDay(es,weekDays) };
    }
    case "percentage": {
      const latest = es.filter(e=>e.kind==="logged").slice(-1)[0];
      if(!latest) return { score:null, status:"none", label:"—", actual:null, target:goal.target,
                           hasData:false, coverage:{have:0,need:1} };
      const pct = latest.total ? Number(latest.value)/Number(latest.total)*100 : Number(latest.value);
      const score = clamp(pct,0,100);
      return { score, status:statusOf(score,th),
               label: latest.total?`${latest.value}/${latest.total} · ${round(pct)}%`:`${round(pct)}%`,
               actual:pct, target:goal.target, complete:pct>=goal.target, hasData:true, coverage:{have:1,need:1} };
    }
    default: // period types don't have a weekly result
      return periodResult(goal, entries, week?week.end:null);
  }
}

/* map entries to per-day cells for the 7-day grid; cell = {state, value, meals} */
function byDay(es, weekDays){
  const map={};
  for(const d of weekDays) map[d]={ state:"missing", value:null, meals:null };
  for(const e of es){
    if(!map[e.date]) continue;
    map[e.date]={ state: e.kind==="na"?"na":"logged", value:e.value==null?1:e.value, meals:e.meals||null, id:e.id };
  }
  return map;
}

/* =========================================================================
 * PERIOD RESULT — for monthly-count / 3M / threshold / qualify / milestone / reading.
 * These are measured against their own targets and a date window, counting
 * each achievement once.
 * ========================================================================= */
function periodResult(goal, entries, asOfDate){
  const th = goal._th || DEFAULT_TH;
  switch(goal.type){
    case "threshold": {
      const cur=Number(goal.current)||0;
      const met = goal.direction==="min" ? cur>=goal.target : cur<=goal.target;
      const hasData = goal.current!=null && goal.current!=="";
      const score = !hasData ? null : (met?100: (goal.direction==="min" ? clamp(cur/goal.target*100,0,100) : clamp(goal.target/Math.max(cur,1e-9)*100,0,100)));
      let status = score==null?"none": met?"green":statusOf(score,th); if(!met&&status==="green")status="yellow";
      return { score, status, label: hasData?`${cur}/${goal.target}`:"—", actual:cur, target:goal.target, complete:met, hasData };
    }
    case "qualify": {
      const items=goal.items||[]; const q=items.filter(it=>Number(it.value)>=goal.bar).length;
      const hasData = items.some(it=> it.value!=null && it.value!=="");
      const score = hasData? clamp(q/goal.target*100,0,100) : null;
      return { score, status: score==null?"none":statusOf(score,th), label:`${q}/${goal.target} qualifying`, actual:q, target:goal.target, complete:q>=goal.target, hasData };
    }
    case "milestone": {
      const ms=goal.milestones||[]; const done=ms.filter(m=>m.done).length;
      const score = ms.length? clamp(done/ms.length*100,0,100):null;
      return { score, status: score==null?"none":statusOf(score,th), label:`${done}/${ms.length}`, actual:done, target:ms.length, complete:done>=ms.length && ms.length>0, hasData:ms.length>0 };
    }
    case "reading": {
      const bk=goal.books||[]; if(!bk.length) return { score:null, status:"none", label:"—", hasData:false };
      const pct = bk.reduce((s,b)=> s+(b.done?100:clamp((b.read/Math.max(b.pages,1))*100,0,100)),0)/bk.length;
      return { score:clamp(pct,0,100), status:statusOf(pct,th), label:`${round(pct)}% read`, actual:pct, target:100, hasData:true };
    }
    case "count": { // monthly count goal, measured within its month window
      const win = asOfDate ? monthRange(monthKeyOf(asOfDate)) : null;
      const es = win? entriesFor(goal, entries, win.start, win.end) : entriesFor(goal, entries, "0000","9999");
      const logged = es.filter(e=>e.kind==="logged");
      const actual = logged.reduce((s,e)=> s+(e.value==null?1:Number(e.value)),0);
      const score = clamp(actual/goal.target*100,0,100);
      return { score, status:statusOf(score,th), label:`${actual}/${goal.target}`, actual, target:goal.target, complete:actual>=goal.target, remaining:Math.max(goal.target-actual,0), hasData:logged.length>0, occurrences:logged };
    }
    default: return { score:null, status:"none", label:"—", hasData:false };
  }
}

/* Dispatch: weekly scoring for D/W goals, period for the rest. */
function result(goal, entries, week, today){
  if(goal.freq==="D" || goal.freq==="W") return weeklyResult(goal, entries, week, today);
  return periodResult(goal, entries, today);
}

/* ----------------------- category + overall rollups ---------------------- */
function weightOf(goal, FREQ_WEIGHT){ return FREQ_WEIGHT[goal.freq] || 1; }

/* Weekly category score: only D/W goals, and only those WITH data (score!=null)
 * contribute. Coverage (data completeness) is reported separately. */
function categoryWeekly(catId, goals, entries, week, today, th, FREQ_WEIGHT){
  const gs = goals.filter(g=> g.cat===catId && g.active!==false);
  const weekly = gs.filter(g=> g.freq==="D"||g.freq==="W");
  const longer = gs.filter(g=> g.freq==="M"||g.freq==="3M");
  let wsum=0, acc=0; const rows=[]; let scoredCount=0;
  for(const g of weekly){
    g._th=th; const r=weeklyResult(g, entries, week, today);
    const w=weightOf(g,FREQ_WEIGHT);
    rows.push({ goal:g, ...r, weight:w });
    if(r.score!=null){ wsum+=w; acc+=r.score*w; scoredCount++; }
  }
  const longerRows = longer.map(g=>{ g._th=th; return { goal:g, ...periodResult(g, entries, today), weight:weightOf(g,FREQ_WEIGHT), context:true }; });
  const score = wsum? acc/wsum : null;
  return { score, status: score==null?"none":statusOf(score,th), rows, longerRows, hasWeekly:scoredCount>0 };
}

function overallWeekly(goals, entries, week, today, th, FREQ_WEIGHT, CATEGORIES){
  const all = CATEGORIES.map(c=> ({ cat:c, ...categoryWeekly(c.id, goals, entries, week, today, th, FREQ_WEIGHT) }));
  const scored = all.filter(c=> c.hasWeekly);
  const score = scored.length ? scored.reduce((s,c)=>s+c.score,0)/scored.length : null;
  return { score, status: score==null?"none":statusOf(score,th), cats:scored, allCats:all };
}

/* Coverage across all D/W goals in a week: how many expected entries exist. */
function weekCoverage(goals, entries, week, today){
  let have=0, need=0;
  for(const g of goals.filter(x=>x.active!==false && (x.freq==="D"||x.freq==="W"))){
    const r=weeklyResult(g, entries, week, today);
    if(r.coverage){ have+=r.coverage.have||0; need+=r.coverage.need||0; }
    else { need+=1; if(r.hasData) have+=1; } // weekly single-shot goals
  }
  return { have, need, pct: need? round(have/need*100):100 };
}

/* ------------------------------- streaks -------------------------------- */
function booleanStreak(goal, entries, today){
  const set=new Set(entries.filter(e=> e.goalId===goal.id && e.kind==="logged" && (e.value==null||Number(e.value)>0)).map(e=>e.date));
  let streak=0, cursor=parseDate(today);
  if(!set.has(fmt(cursor))) cursor=addDays(cursor,-1);
  while(set.has(fmt(cursor))){ streak++; cursor=addDays(cursor,-1); }
  return streak;
}

/* ------------------------- weekly trend across period ------------------- */
function weeklyTrend(goals, entries, period, today, th, FREQ_WEIGHT, CATEGORIES){
  return buildWeeks(period).map(w=>{
    const future = parseDate(w.start) > parseDate(today);
    const o = future? {score:null} : overallWeekly(goals, entries, w, w.end<today?w.end:today, th, FREQ_WEIGHT, CATEGORIES);
    return { week:w.index, start:w.start, end:w.end, score: future?null:(o.score==null?null:round(o.score)), future };
  });
}

/* category trend over the period (period-to-date) for one category */
function categoryTrend(catId, goals, entries, period, today, th, FREQ_WEIGHT){
  return buildWeeks(period).map(w=>{
    const future=parseDate(w.start)>parseDate(today);
    const c = future? {score:null} : categoryWeekly(catId, goals, entries, w, w.end<today?w.end:today, th, FREQ_WEIGHT);
    return { week:w.index, score: future?null:(c.score==null?null:round(c.score)), future };
  });
}

/* ------------------------------ formatting ------------------------------ */
function fmtMin(mins){ const m=Math.round(mins); return `${Math.floor(m/60)}h ${String(m%60).padStart(2,"0")}m`; }

const DEFAULT_TH = { green:85, yellow:50 };

const Engine = {
  parseDate, fmt, addDays, startOfWeek, clamp, round,
  buildWeeks, weekForDate, daysInWeek, daysElapsedInWeek,
  monthsInPeriod, monthKeyOf, monthRange,
  statusOf, entriesFor, weeklyResult, periodResult, result, byDay,
  categoryWeekly, overallWeekly, weekCoverage,
  booleanStreak, weeklyTrend, categoryTrend, fmtMin,
};
if (typeof module !== "undefined") module.exports = Engine;
if (typeof window !== "undefined") window.Engine = Engine;
