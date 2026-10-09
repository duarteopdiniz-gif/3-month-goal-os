/* =========================================================================
 * engine.js — Pure calculation engine. No DOM, no storage. Testable.
 * Reads goals + logs, produces scores/statuses/trends. Logic is driven by
 * goal.type and goal config, never by hardcoded goal identities.
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

/* Build the list of weeks in the period (Mon→Sun), labelled Week 1..N */
function buildWeeks(period){
  const ps=parseDate(period.start), pe=parseDate(period.end);
  // Begin week 1 at the first week-start (Mon) that is >= period start.
  // If the period starts mid-week, the leading partial days fold into week 1.
  let first = startOfWeek(ps, period.weekStartsOn);   // Monday of the week containing ps
  // If ps lands exactly on the last day of that week (period starts on a Sunday),
  // that single dangling day shouldn't be week 1 — advance to the next Monday.
  if (fmt(addDays(first,6)) === fmt(ps)) first = addDays(first,7);
  const weeks=[]; let cur=first, i=1;
  while(cur <= pe){
    const alignedStart = cur < ps ? ps : cur;       // clamp first week to period start
    const naturalEnd = addDays(cur,6);
    const end = naturalEnd > pe ? pe : naturalEnd;  // clamp last week to period end
    weeks.push({ index:i, start:fmt(alignedStart), end:fmt(end),
                 startDate:parseDate(fmt(alignedStart)), endDate:parseDate(fmt(end)) });
    cur=addDays(cur,7); i++;
  }
  return weeks;
}
function weekForDate(dateStr, period){
  const weeks=buildWeeks(period); const d=parseDate(dateStr);
  return weeks.find(w=> d>=w.startDate && d<=addDays(w.endDate,0)) || weeks[0];
}
function daysElapsedInWeek(week, today){
  const t=parseDate(today);
  if(t < week.startDate) return 0;
  if(t > week.endDate) return 7;
  return Math.floor((t - week.startDate)/DAY)+1;
}

/* ----------------------------- status ----------------------------- */
function statusOf(score, th){ return score>=th.green ? "green" : score>=th.yellow ? "yellow" : "red"; }
const DOT = { green:"🟢", yellow:"🟡", red:"🔴", none:"⚪️" };

/* -------------------------------------------------------------------------
 * Per-goal weekly score. Returns {score, label, status, detail}
 * logs: array of {date, goalId, value, done, meals, note}
 * ---------------------------------------------------------------------- */
function scoreGoalForWeek(goal, logs, week, th, today){
  const inWeek = logs.filter(l=> l.goalId===goal.id && l.date>=week.start && l.date<=week.end);
  const elapsed = clamp(daysElapsedInWeek(week, today),1,7);

  switch(goal.type){
    case "count": {
      const actual = inWeek.reduce((s,l)=> s + (Number(l.value)||0), 0);
      const score = clamp(actual/goal.target*100, 0, 100);
      return { score, label:`${actual}/${goal.target}`, status:statusOf(score,th), actual };
    }
    case "boolean": {
      // weekly boolean (e.g. study plan updated / share): target is per-week completion
      if(goal.freq!=="D"){
        const done = inWeek.some(l=> l.done || Number(l.value)>0);
        const score = done?100:0;
        return { score, label: done?"Yes":"No", status:statusOf(score,th), actual:done?1:0 };
      }
      // daily boolean (creatine, no-phone): done days / elapsed days
      const doneDays = inWeek.filter(l=> l.done).length;
      const score = clamp(doneDays/elapsed*100, 0, 100);
      return { score, label:`${doneDays}/${elapsed}`, status:statusOf(score,th), actual:doneDays };
    }
    case "meals": {
      // each day target meals; weekly score = total meals eaten / (elapsed*target)
      const total = inWeek.reduce((s,l)=> s + (l.meals? Object.values(l.meals).filter(Boolean).length : (Number(l.value)||0)), 0);
      const possible = elapsed*goal.target;
      const score = clamp(total/possible*100, 0, 100);
      return { score, label:`${total}/${possible}`, status:statusOf(score,th), actual:total };
    }
    case "average": {
      const vals = inWeek.map(l=> Number(l.value)).filter(v=> !isNaN(v));
      if(!vals.length) return { score:0, label:"no data", status:"red", actual:null };
      const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
      let score;
      if(goal.lowerIsBetter){ score = avg<=goal.target ? 100 : clamp((goal.target/avg)*100,0,100); }
      else { score = clamp(avg/goal.target*100,0,100); }
      return { score, label:`${fmtMin(avg)} avg`, status:statusOf(score,th), actual:avg };
    }
    case "percentage": {
      // value is attended, note holds total via l.total; fallback to value as pct
      const latest = inWeek[inWeek.length-1];
      if(!latest) return { score:0, label:"no data", status:"red", actual:null };
      const pct = latest.total ? (Number(latest.value)/Number(latest.total)*100) : Number(latest.value);
      const score = clamp(pct,0,100);
      const lbl = latest.total ? `${latest.value}/${latest.total} → ${round(pct)}%` : `${round(pct)}%`;
      return { score, label:lbl, status:statusOf(score,th), actual:pct };
    }
    default:
      // period-type goals (threshold/qualify/milestone/reading) don't score weekly
      return periodScore(goal, th);
  }
}

/* Period-level score for 3M / project / reading / threshold goals */
function periodScore(goal, th){
  switch(goal.type){
    case "threshold": {
      const cur=Number(goal.current)||0;
      const met = goal.direction==="min" ? cur>=goal.target : cur<=goal.target;
      const score = met?100: (goal.direction==="min" ? clamp(cur/goal.target*100,0,100) : clamp(goal.target/Math.max(cur,0.0001)*100,0,100));
      // Never award green on a threshold that isn't actually met — cap at yellow.
      let status = met ? "green" : statusOf(score,th);
      if(!met && status==="green") status="yellow";
      return { score, label:`${cur}/${goal.target}`, status, actual:cur };
    }
    case "qualify": {
      const q = (goal.items||[]).filter(it=> Number(it.value)>=goal.bar).length;
      const score = clamp(q/goal.target*100,0,100);
      return { score, label:`${q}/${goal.target} qualifying`, status:statusOf(score,th), actual:q };
    }
    case "milestone": {
      const ms=goal.milestones||[]; const done=ms.filter(m=>m.done).length;
      const score = ms.length? clamp(done/ms.length*100,0,100):0;
      return { score, label:`${done}/${ms.length}`, status:statusOf(score,th), actual:done };
    }
    case "reading": {
      const bk=goal.books||[];
      const totalPct = bk.length ? bk.reduce((s,b)=> s + (b.done?100: clamp((b.read/Math.max(b.pages,1))*100,0,100)),0)/bk.length : 0;
      const score = clamp(totalPct,0,100);
      return { score, label:`${round(score)}% read`, status:statusOf(score,th), actual:score };
    }
    default: return { score:0, label:"—", status:"red", actual:null };
  }
}

/* Pick the right score depending on whether goal is week-scoped or period-scoped */
function scoreGoal(goal, logs, week, th, today){
  const periodTypes=["threshold","qualify","milestone","reading"];
  if(periodTypes.includes(goal.type)) return periodScore(goal, th);
  return scoreGoalForWeek(goal, logs, week, th, today);
}

/* ----------------------- category + overall rollups ---------------------- */
function weightOf(goal, FREQ_WEIGHT){ return FREQ_WEIGHT[goal.freq] || 1; }

/* scopeFor: which goals count toward a WEEKLY score.
 * Only Daily + Weekly goals recur weekly, so only they are scored for the
 * week. Monthly / 3-Month goals are returned separately as context — their
 * cadence is judged on the Monthly / 3-Month views, not as a weekly "miss". */
function categoryScore(catId, goals, logs, week, th, today, FREQ_WEIGHT, scope="week"){
  const gs = goals.filter(g=> g.cat===catId && g.active!==false);
  // scope "week": only D/W count toward score. scope "all": every goal counts.
  const weeklyScored = scope==="all" ? gs : gs.filter(g=> g.freq==="D" || g.freq==="W");
  const context      = scope==="all" ? [] : gs.filter(g=> g.freq==="M" || g.freq==="3M");
  let wsum=0, acc=0; const rows=[];
  for(const g of weeklyScored){
    const r=scoreGoal(g, logs, week, th, today);
    const w=weightOf(g, FREQ_WEIGHT);
    wsum+=w; acc+=r.score*w;
    rows.push({ goal:g, ...r, weight:w });
  }
  const contextRows = context.map(g=> ({ goal:g, ...scoreGoal(g, logs, week, th, today), weight:weightOf(g,FREQ_WEIGHT), context:true }));
  const score = wsum? acc/wsum : null; // null = no weekly-scored goals in this category
  return { score: score==null?0:score, hasWeekly: wsum>0, status: score==null?"none":statusOf(score,th), rows, contextRows };
}

function overallScore(goals, logs, week, th, today, FREQ_WEIGHT, CATEGORIES){
  const all = CATEGORIES.map(c=> ({ cat:c, ...categoryScore(c.id, goals, logs, week, th, today, FREQ_WEIGHT) }));
  const scored = all.filter(c=> c.hasWeekly);           // only categories with weekly-scored goals
  const score = scored.length ? scored.reduce((s,c)=> s+c.score,0)/scored.length : 0; // categories equal-weight
  return { score, status:statusOf(score,th), cats:scored, allCats:all };
}

/* ------------------------------- streaks -------------------------------- */
function booleanStreak(goal, logs, today){
  const mine = logs.filter(l=> l.goalId===goal.id && l.done).map(l=>l.date).sort();
  if(!mine.length) return 0;
  let streak=0, cursor=parseDate(today);
  const set=new Set(mine);
  // allow today not yet logged: start from today, walk back
  if(!set.has(fmt(cursor))) cursor=addDays(cursor,-1);
  while(set.has(fmt(cursor))){ streak++; cursor=addDays(cursor,-1); }
  return streak;
}

/* ------------------------- weekly trend across period ------------------- */
function weeklyTrend(goals, logs, period, th, today, FREQ_WEIGHT, CATEGORIES){
  return buildWeeks(period).map(w=>{
    const o=overallScore(goals, logs, w, th, w.end, FREQ_WEIGHT, CATEGORIES);
    const isFuture = parseDate(w.start) > parseDate(today);
    return { week:w.index, start:w.start, end:w.end, score: isFuture?null:round(o.score), future:isFuture };
  });
}

/* ------------------------------ formatting ------------------------------ */
function fmtMin(mins){ const m=Math.round(mins); return `${Math.floor(m/60)}h ${String(m%60).padStart(2,"0")}m`; }
function bar(pct, width=10){ const f=Math.round(clamp(pct,0,100)/100*width); return "█".repeat(f)+"░".repeat(width-f); }

const Engine = {
  parseDate, fmt, addDays, startOfWeek, clamp, round,
  buildWeeks, weekForDate, daysElapsedInWeek, statusOf, DOT,
  scoreGoal, scoreGoalForWeek, periodScore, categoryScore, overallScore,
  booleanStreak, weeklyTrend, fmtMin, bar, FREQ_WEIGHT_fallback:{ "3M":4,"M":3,"W":2,"D":1 }
};

if (typeof module !== "undefined") module.exports = Engine;
if (typeof window !== "undefined") window.Engine = Engine;
