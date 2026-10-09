/* Node test: verifies engine math against the user's stated examples. */
const E = require("./engine.js");
const { DEFAULT_PERIOD, DEFAULT_THRESHOLDS, FREQ_WEIGHT, CATEGORIES } = require("./seed.js");
const th = DEFAULT_THRESHOLDS, period = DEFAULT_PERIOD;

let pass=0, fail=0;
function ok(name, cond, extra=""){ if(cond){pass++; console.log("  ✓",name);} else {fail++; console.log("  ✗",name,extra);} }
function approx(a,b,eps=0.6){ return Math.abs(a-b)<=eps; }

// Week 4 of the period, and "today" = Sunday end of that week so elapsed=7
const weeks = E.buildWeeks(period);
console.log(`Period has ${weeks.length} weeks. Week1 ${weeks[0].start}..${weeks[0].end}, last ${weeks[weeks.length-1].start}..${weeks[weeks.length-1].end}`);
ok("period is 13 weeks", weeks.length===13, `got ${weeks.length}`);

const w = weeks[3]; // Week 4
const today = w.end; // Sunday -> full week elapsed

console.log("\nCount: Gym 3/3");
let g={id:"gym",type:"count",freq:"W",target:3};
let logs=[{goalId:"gym",date:w.start,value:1},{goalId:"gym",date:E.addDays(E.parseDate(w.start),1).toISOString().slice(0,10),value:2}];
let r=E.scoreGoal(g,logs,w,th,today);
ok("gym 3/3 = 100%", approx(r.score,100), JSON.stringify(r));

console.log("\nCount: Family meals 2/3 -> 67% 🟡");
g={id:"fam",type:"count",freq:"W",target:3};
logs=[{goalId:"fam",date:w.start,value:2}];
r=E.scoreGoal(g,logs,w,th,today);
ok("2/3 ≈ 67%", approx(r.score,66.7), JSON.stringify(r));
ok("2/3 is yellow", r.status==="yellow", r.status);

console.log("\nBoolean daily: Creatine 6/7 -> 86% 🟡");
g={id:"cre",type:"boolean",freq:"D",target:1};
logs=[0,1,2,3,4,5].map(n=>({goalId:"cre",date:E.fmt(E.addDays(w.startDate,n)),done:true})); // 6 of 7 days
r=E.scoreGoal(g,logs,w,th,today);
ok("creatine 6/7 ≈ 86%", approx(r.score,85.7), JSON.stringify(r));

console.log("\nAverage lower-is-better: Screen time ≤180min");
g={id:"scr",type:"average",freq:"W",target:180,lowerIsBetter:true};
logs=[160,190,170].map((v,i)=>({goalId:"scr",date:E.fmt(E.addDays(w.startDate,i)),value:v})); // avg 173.3 <=180
r=E.scoreGoal(g,logs,w,th,today);
ok("avg 173 ≤180 = 100% green", r.score===100 && r.status==="green", JSON.stringify(r));
logs=[200,220,210].map((v,i)=>({goalId:"scr",date:E.fmt(E.addDays(w.startDate,i)),value:v})); // avg 210>180
r=E.scoreGoal(g,logs,w,th,today);
ok("avg 210 >180 scales below 100 & red-ish", r.score<100, JSON.stringify(r));

console.log("\nPercentage: class participation 8/10 -> 80%");
g={id:"cls",type:"percentage",freq:"W",target:100};
logs=[{goalId:"cls",date:w.start,value:8,total:10}];
r=E.scoreGoal(g,logs,w,th,today);
ok("8/10 = 80% yellow", approx(r.score,80) && r.status==="yellow", JSON.stringify(r));

console.log("\nThreshold: GPA 8.2/8.5 red, 8.6/8.5 green");
g={id:"gpa",type:"threshold",freq:"3M",target:8.5,direction:"min",current:8.2};
r=E.scoreGoal(g,[],w,th,today); ok("8.2 below target", r.status!=="green", JSON.stringify(r));
g.current=8.6; r=E.scoreGoal(g,[],w,th,today); ok("8.6 achieved green 100%", r.score===100 && r.status==="green", JSON.stringify(r));

console.log("\nQualify: 2 classes >=90%");
g={id:"q",type:"qualify",freq:"3M",target:2,bar:90,items:[{name:"Econ",value:92},{name:"Mkt",value:87},{name:"Fin",value:91}]};
r=E.scoreGoal(g,[],w,th,today);
ok("2/2 qualifying = 100% green", r.score===100 && r.status==="green", JSON.stringify(r));

console.log("\nMilestone: job 3/6");
g={id:"job",type:"milestone",freq:"3M",milestones:[{done:true},{done:true},{done:true},{done:false},{done:false},{done:false}]};
r=E.scoreGoal(g,[],w,th,today);
ok("3/6 = 50% yellow", approx(r.score,50) && r.status==="yellow", JSON.stringify(r));

console.log("\nReading: Homo Deus 72%");
g={id:"rd",type:"reading",freq:"M",books:[{name:"Homo Deus",pages:450,read:324,done:false},{name:"Fin",pages:300,read:300,done:true}]};
r=E.scoreGoal(g,[],w,th,today);
ok("avg of 72% & 100% = 86%", approx(r.score,86), JSON.stringify(r));

console.log("\nMeals: full week of 3 meals = 100%");
g={id:"meal",type:"meals",freq:"D",target:3};
logs=[0,1,2,3,4,5,6].map(n=>({goalId:"meal",date:E.fmt(E.addDays(w.startDate,n)),meals:{b:true,l:true,d:true}}));
r=E.scoreGoal(g,logs,w,th,today);
ok("21/21 meals = 100%", r.score===100, JSON.stringify(r));

console.log("\nStreak: creatine 5-day streak ending today");
g={id:"cre",type:"boolean",freq:"D",target:1};
const t2 = E.fmt(new Date());
logs=[0,1,2,3,4].map(n=>({goalId:"cre",date:E.fmt(E.addDays(new Date(),-n)),done:true}));
ok("streak = 5", E.booleanStreak(g,logs,t2)===5, String(E.booleanStreak(g,logs,t2)));

console.log("\nWeekly scope excludes monthly/3M from weekly score");
const goals=[
  {id:"a",cat:"uni",type:"count",freq:"W",target:3,active:true},
  {id:"b",cat:"uni",type:"threshold",freq:"3M",target:8.5,direction:"min",current:8.5,active:true},
  {id:"c",cat:"uni",type:"count",freq:"M",target:1,active:true},
];
logs=[{goalId:"a",date:w.start,value:3}];
let cs=E.categoryScore("uni",goals,logs,w,th,today,FREQ_WEIGHT); // default week scope
ok("weekly scope: only the weekly goal counts -> 100", approx(cs.score,100), JSON.stringify({score:cs.score,rows:cs.rows.length}));
ok("weekly scope: 1 scored row", cs.rows.length===1, "rows="+cs.rows.length);
ok("weekly scope: 2 context rows", cs.contextRows.length===2, "ctx="+cs.contextRows.length);
let csAll=E.categoryScore("uni",goals,logs,w,th,today,FREQ_WEIGHT,"all");
ok("all scope: 3 rows scored", csAll.rows.length===3, "rows="+csAll.rows.length);
// monthly goal c has 0 -> weighted avg of 100(W,w2), 100(3M,w4), 0(M,w3) = (200+400+0)/9 = 66.7
ok("all scope: weighted avg ~66.7", approx(csAll.score,66.7,1), JSON.stringify({score:csAll.score}));

console.log("\nOverall excludes empty categories & monthly from weekly");
const o2=E.overallScore(goals,logs,w,th,today,FREQ_WEIGHT,[{id:"uni",name:"Uni",emoji:"🎓"},{id:"love",name:"Love",emoji:"❤️"}]);
ok("only uni counts (love empty) -> 100", approx(o2.score,100), JSON.stringify({score:o2.score,cats:o2.cats.length}));

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail?1:0);
