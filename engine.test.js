/* Tests the coverage-aware engine + the 8 required workflow scenarios. */
const E = require("./engine.js");
const period = { start:"2026-09-13", end:"2026-12-13", weekStartsOn:1 };
const th = { green:85, yellow:50 };
const FW = { "3M":4,"M":3,"W":2,"D":1 };

let pass=0, fail=0;
const ok=(n,c,x="")=>{ c?(pass++,console.log("  ✓",n)):(fail++,console.log("  ✗",n,x)); };
const approx=(a,b,e=0.6)=>Math.abs(a-b)<=e;
let _id=0; const E2=(goalId,date,patch={})=>({ id:"e"+(++_id), goalId, date, kind:"logged", ...patch });

const weeks=E.buildWeeks(period);
ok("13 weeks", weeks.length===13, weeks.length);
const w=weeks.find(x=>x.index===4); // Week 4 = Mon 5 Oct → Sun 11 Oct 2026
ok("week4 is Mon 5 Oct → Sun 11 Oct", w.start==="2026-10-05"&&w.end==="2026-10-11", `${w.start}..${w.end}`);
const sunday="2026-10-11"; // the review day, full week elapsed

console.log("\n[Scenario 1] Gym logged Tue appears in Sunday review");
let gym={id:"gym",type:"count",freq:"W",target:3};
let entries=[ E2("gym","2026-10-06") ]; // Tuesday
let r=E.weeklyResult(gym,entries,w,sunday);
ok("gym 1/3 after Tue", r.actual===1 && r.label==="1/3", JSON.stringify(r));
ok("1 remaining shown", r.remaining===2, "rem="+r.remaining);

console.log("\n[Scenario 2] Add Thursday during review — no duplicate");
entries.push(E2("gym","2026-10-08")); // Thursday added at review time
r=E.weeklyResult(gym,entries,w,sunday);
ok("gym now 2/3, exactly 2 occurrences", r.actual===2 && r.occurrences.length===2, JSON.stringify({a:r.actual,n:r.occurrences.length}));
// per-day view marks Tue+Thu logged
const perDayGym = E.byDay(E.entriesFor(gym,entries,w.start,w.end), E.daysInWeek(w));
ok("Tue+Thu logged in grid", perDayGym["2026-10-06"].state==="logged" && perDayGym["2026-10-08"].state==="logged", JSON.stringify(perDayGym));
ok("Wed missing (not zero)", perDayGym["2026-10-07"].state==="missing", perDayGym["2026-10-07"].state);

console.log("\n[Scenario 3] Blank screen time Wed = missing, not zero");
let scr={id:"scr",type:"average",freq:"W",target:180,lowerIsBetter:true};
entries=[ E2("scr","2026-10-05",{value:170}), E2("scr","2026-10-06",{value:160}) ]; // Mon,Tue only
r=E.weeklyResult(scr,entries,w,sunday);
ok("avg uses only logged days (165)", approx(r.actual,165), "avg="+r.actual);
ok("coverage 2 of 7", r.coverage.have===2 && r.coverage.need===7, JSON.stringify(r.coverage));
ok("Wed is missing not zero", E.byDay(E.entriesFor(scr,entries,w.start,w.end),E.daysInWeek(w))["2026-10-07"].state==="missing");

console.log("\n[Scenario 4] Historical edit recalculates average");
// edit Mon from 170 to 300
entries[0].value=300;
r=E.weeklyResult(scr,entries,w,sunday);
ok("avg recalculated to 230", approx(r.actual,230), "avg="+r.actual);

console.log("\n[Scenario 7] Multiple sessions same day counted");
gym={id:"gym",type:"count",freq:"W",target:3};
entries=[ E2("gym","2026-10-06"), E2("gym","2026-10-06"), E2("gym","2026-10-09") ]; // two Tue + one Fri
r=E.weeklyResult(gym,entries,w,sunday);
ok("3 occurrences across 2 days", r.actual===3 && r.complete, JSON.stringify({a:r.actual,c:r.complete}));

console.log("\n[Missing excluded from score] creatine 5 logged, 2 missing");
let cre={id:"cre",type:"boolean",freq:"D",target:1};
entries=[0,1,2,3,4].map(n=>E2("cre",E.fmt(E.addDays(w.startDate,n)))); // Mon–Fri done, Sat/Sun missing
r=E.weeklyResult(cre,entries,w,sunday);
ok("5/5 covered = 100% (missing excluded)", r.score===100 && r.coverage.have===5 && r.coverage.need===7, JSON.stringify({s:r.score,cov:r.coverage}));
// now explicitly record a skipped day (na) + a logged-0 is same as na for boolean
entries.push(E2("cre","2026-10-10",{kind:"na"}));
r=E.weeklyResult(cre,entries,w,sunday);
ok("after 1 N/A: 5 done of 6 covered = 83%", approx(r.score,83.3), JSON.stringify({s:r.score,cov:r.coverage}));

console.log("\n[Explicit zero is a failure] gym 0 recorded");
gym={id:"gym",type:"count",freq:"W",target:3};
r=E.weeklyResult(gym,[],w,sunday);
ok("no entries: count score 0 w/ hasData false", r.score===0 && r.hasData===false, JSON.stringify({s:r.score,h:r.hasData}));

console.log("\n[No-data goals excluded from category rollup]");
const goals=[
  {id:"a",cat:"uni",type:"count",freq:"W",target:3,active:true},
  {id:"b",cat:"uni",type:"average",freq:"W",target:180,lowerIsBetter:true,active:true}, // no data
];
entries=[ E2("a","2026-10-06"),E2("a","2026-10-07"),E2("a","2026-10-08") ]; // a=3/3=100, b=no data
let cw=E.categoryWeekly("uni",goals,entries,w,sunday,th,FW);
ok("category = 100 (b excluded, no data)", cw.score===100, JSON.stringify({s:cw.score}));
ok("b row present but score null", cw.rows.find(x=>x.goal.id==="b").score===null);

console.log("\n[Weekly scope excludes monthly from weekly score]");
const goals2=[
  {id:"a",cat:"uni",type:"count",freq:"W",target:3,active:true},
  {id:"m",cat:"uni",type:"count",freq:"M",target:1,active:true},
];
cw=E.categoryWeekly("uni",goals2,[E2("a","2026-10-06"),E2("a","2026-10-07"),E2("a","2026-10-08")],w,sunday,th,FW);
ok("weekly score ignores monthly goal", cw.score===100 && cw.longerRows.length===1, JSON.stringify({s:cw.score,l:cw.longerRows.length}));

console.log("\n[Scenario 8] Monthly count not double-counted");
let date={id:"date",type:"count",freq:"M",target:1};
// one date logged on 3 Oct; monthly result for October should be 1/1 regardless of weeks
entries=[ E2("date","2026-10-03") ];
r=E.periodResult(date, entries, "2026-10-20");
ok("monthly date 1/1 for October", r.actual===1 && r.complete, JSON.stringify(r));
// a date in September must NOT count for October
entries.push(E2("date","2026-09-20"));
r=E.periodResult(date, entries, "2026-10-20");
ok("September date excluded from October", r.actual===1, "oct actual="+r.actual);
r=E.periodResult(date, entries, "2026-09-25");
ok("September window counts the Sep date", r.actual===1, "sep actual="+r.actual);

console.log("\n[Avg lower-is-better status]");
scr={id:"scr",type:"average",freq:"W",target:180,lowerIsBetter:true};
entries=[0,1,2].map((n,i)=>E2("scr",E.fmt(E.addDays(w.startDate,n)),{value:[160,170,165][i]}));
r=E.weeklyResult(scr,entries,w,sunday);
ok("avg 165 ≤180 → 100 green", r.score===100 && r.status==="green", JSON.stringify({s:r.score,st:r.status}));

console.log("\n[Percentage attendance]");
let cls={id:"cls",type:"percentage",freq:"W",target:100};
r=E.weeklyResult(cls,[E2("cls","2026-10-11",{value:9,total:10})],w,sunday);
ok("9/10 = 90% yellow-ish", approx(r.score,90), JSON.stringify({s:r.score}));

console.log("\n[Trend excludes future & no-data weeks appropriately]");
const trend=E.weeklyTrend(goals2,[E2("a","2026-10-06"),E2("a","2026-10-07"),E2("a","2026-10-08")],period,"2026-10-11",th,FW,[{id:"uni",name:"Uni"},{id:"x",name:"X"}]);
ok("week 5+ future = null", trend.find(t=>t.week===5).score===null && trend.find(t=>t.week===5).future);
ok("week 4 has score 100", trend.find(t=>t.week===4).score===100, JSON.stringify(trend.find(t=>t.week===4)));

console.log("\n[Streak]");
cre={id:"cre",type:"boolean",freq:"D",target:1};
const t2=E.fmt(new Date());
entries=[0,1,2,3].map(n=>E2("cre",E.fmt(E.addDays(new Date(),-n))));
ok("4-day streak", E.booleanStreak(cre,entries,t2)===4, String(E.booleanStreak(cre,entries,t2)));

console.log("\n[missingCells] blanks for elapsed days only");
const mcGoals=[
  {id:"gym",cat:"m",type:"count",freq:"W",target:3,active:true},
  {id:"cre",cat:"m",type:"boolean",freq:"D",target:1,active:true},
  {id:"cls",cat:"m",type:"percentage",freq:"W",target:100,active:true},
];
let mcE=[ E2("gym","2026-10-06"), E2("cre","2026-10-05") ]; // gym Tue, creatine Mon
let mc=E.missingCells(mcGoals, mcE, w, sunday);
// gym is count → weekly single-shot, has data → 0 missing; creatine per-day → Tue..Sun = 6; cls weekly → 1
const gymMiss=mc.filter(x=>x.goalId==="gym").length, creMiss=mc.filter(x=>x.goalId==="cre").length, clsMiss=mc.filter(x=>x.goalId==="cls").length;
ok("gym count has data → 0 missing slots", gymMiss===0, String(gymMiss));
ok("creatine 6 blank days", creMiss===6, String(creMiss));
ok("class weekly 1 missing slot", clsMiss===1, String(clsMiss));
// a count goal with NO data this week → exactly 1 weekly slot
let mc0=E.missingCells([{id:"gym2",cat:"m",type:"count",freq:"W",target:3,active:true}], [], w, sunday);
ok("empty count goal → 1 weekly slot", mc0.length===1 && mc0[0].weekly===true, JSON.stringify(mc0));
// only elapsed days: as of Wednesday, fewer blanks
let mc2=E.missingCells(mcGoals, mcE, w, "2026-10-07");
ok("as of Wed, creatine blanks = Tue,Wed = 2", mc2.filter(x=>x.goalId==="cre").length===2, String(mc2.filter(x=>x.goalId==="cre").length));
// coverage never exceeds 100% even with future-dated entries
let covGoals=[{id:"scr",cat:"m",type:"average",freq:"W",target:180,lowerIsBetter:true,active:true}];
let covE=[E2("scr","2026-10-05",{value:100}),E2("scr","2026-10-06",{value:100}),E2("scr","2026-10-11",{value:100})]; // Sun is future vs Fri
let cvg=E.weekCoverage(covGoals,covE,w,"2026-10-09"); // as of Friday
ok("coverage capped ≤100% (future entries ignored)", cvg.pct<=100 && cvg.have<=cvg.need, JSON.stringify(cvg));

console.log("\n[scoreBreakdown] attributes points to the dragging goal");
// one category, two weekly count goals: A perfect (3/3), B poor (1/3)
const sbGoals=[
  {id:"A",cat:"c",type:"count",freq:"W",target:3,active:true},
  {id:"B",cat:"c",type:"count",freq:"W",target:3,active:true},
];
let sbE=[E2("A","2026-10-05"),E2("A","2026-10-06"),E2("A","2026-10-07"), E2("B","2026-10-05")];
const CATS=[{id:"c",name:"C"}];
let sb=E.scoreBreakdown(sbGoals,sbE,w,sunday,th,FW,CATS);
ok("breakdown lists B (the drag), not A", sb.items.length===1 && sb.items[0].goal.id==="B", JSON.stringify(sb.items.map(i=>i.goal.id)));
// A=100,B=33.3, equal weight → overall 66.7; if B were 100 → overall 100 → cost ~33.3
ok("B cost ~33 points", Math.abs(sb.items[0].cost-33.3)<1.5, "cost="+sb.items[0].cost);

console.log("[atRiskGoals] count goal that can't be reached flags; reachable doesn't");
// Friday of the week → remaining days = Sat,Sun = 2. gym 0/3 → max 0+2=2 < 3 → at risk
let riskE=[]; let risk=E.atRiskGoals([{id:"gym",cat:"c",type:"count",freq:"W",target:3,active:true}],riskE,w,"2026-10-09",th);
ok("gym 0/3 on Fri → at risk", risk.length===1 && risk[0].goal.id==="gym", JSON.stringify(risk.map(r=>r.goal.id)));
// gym 2/3 on Fri → max 2+2=4 ≥3 → NOT at risk
let riskE2=[E2("gym","2026-10-05"),E2("gym","2026-10-06")];
let risk2=E.atRiskGoals([{id:"gym",cat:"c",type:"count",freq:"W",target:3,active:true}],riskE2,w,"2026-10-09",th);
ok("gym 2/3 on Fri → not at risk", risk2.length===0, JSON.stringify(risk2));
// on Sunday (0 days left) a 1/3 goal is unreachable → at risk
let risk3=E.atRiskGoals([{id:"gym",cat:"c",type:"count",freq:"W",target:3,active:true}],[E2("gym","2026-10-05")],w,sunday,th);
ok("gym 1/3 on Sun (0 left) → at risk", risk3.length===1, JSON.stringify(risk3));

console.log("\n[weekStatuses] classify weeks");
const wsGoals=[{id:"cre",cat:"m",type:"boolean",freq:"D",target:1,active:true}];
// week1 fully entered + reviewed; week2 partial; week3 (current-ish) empty
const weeks13=E.buildWeeks(period);
const w1=weeks13[0], w2=weeks13[1];
let wsE=[]; E.daysInWeek(w1).forEach(d=>wsE.push(E2("cre",d))); // week1 all 7 logged
wsE.push(E2("cre",w2.start)); // week2 only 1 day
const reviews=[{type:"weekly",key:w1.start,completed:true}];
let ws=E.weekStatuses(wsGoals,wsE,reviews,period,"2026-10-11");
ok("week1 reviewed", ws.find(x=>x.index===1).status==="reviewed", ws.find(x=>x.index===1).status);
ok("week2 partial", ws.find(x=>x.index===2).status==="partial", ws.find(x=>x.index===2).status);
ok("week5 future", ws.find(x=>x.index===5).status==="future", ws.find(x=>x.index===5).status);

console.log("[insights] produce sentences from data");
const insGoals=[{id:"gym",cat:"mind",type:"count",freq:"W",target:3,active:true}];
let insE=[]; // week1: 1 session; week4: 3 sessions → improving
E.daysInWeek(weeks13[0]).slice(0,1).forEach(d=>insE.push(E2("gym",d)));
E.daysInWeek(weeks13[3]).slice(0,3).forEach(d=>insE.push(E2("gym",d)));
const ins=E.insights(insGoals,insE,period,"2026-10-11",th,FW,[{id:"mind",name:"Mind"}],4);
ok("insights produced", Array.isArray(ins) && ins.length>=1, JSON.stringify(ins));

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail?1:0);
