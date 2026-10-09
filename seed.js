/* =========================================================================
 * seed.js — Initial dataset + configuration (NOT hardcoded logic)
 * The 25 goals live here as DATA. Add/remove/edit freely; the engine reads
 * whatever is in state. This file only provides the first-run seed.
 * ========================================================================= */

// ---- Period configuration (editable from Settings) ----
const DEFAULT_PERIOD = {
  start: "2026-09-13", // 13 Sep 2026
  end:   "2026-12-13", // 13 Dec 2026
  weekStartsOn: 1,      // 1 = Monday
};

// ---- Status thresholds (editable) ----
const DEFAULT_THRESHOLDS = { green: 85, yellow: 50 }; // >=green 🟢, >=yellow 🟡, else 🔴

// ---- Frequency weights for fair scoring (editable) ----
// Bigger, rarer goals weigh more so daily habits don't dominate.
const FREQ_WEIGHT = { "3M": 4, "M": 3, "W": 2, "D": 1 };

// ---- Categories ----
const CATEGORIES = [
  { id: "love",    name: "Love & Relationships", emoji: "❤️" },
  { id: "uni",     name: "Uni & Studies",        emoji: "🎓" },
  { id: "mind",    name: "Mind & Body",          emoji: "🧠" },
  { id: "free",    name: "Free Time Management",  emoji: "⏰" },
];

/* Goal types the engine understands:
 *  count       — actual/target  (e.g. gym 3/wk)
 *  boolean     — done days / elapsed days (e.g. creatine)
 *  average     — avg vs threshold; lowerIsBetter supported (e.g. screen time)
 *  percentage  — attended/total (e.g. class participation)
 *  threshold   — numeric >= (or <=) target (e.g. GPA)
 *  qualify     — N of sub-items must each reach a bar (e.g. 2 classes >=90%)
 *  milestone   — completed milestones / total (projects)
 *  reading     — pages/chapters progress across one or more books
 *  meals       — per-day meal checklist (specialized boolean group)
 */

const SEED_GOALS = [
  // ❤️ LOVE & RELATIONSHIPS
  { title:"Go on a big Pookie date", cat:"love", sub:"", freq:"M", type:"count", target:1, unit:"date", priority:"High" },
  { title:"Hang out every weekend", cat:"love", sub:"", freq:"W", type:"count", target:1, unit:"hangout", priority:"High" },
  { title:"Buy Pixation flowers", cat:"love", sub:"", freq:"M", type:"count", target:1, unit:"time", priority:"Medium" },
  { title:"Do Pixation a little handmade gift", cat:"love", sub:"", freq:"M", type:"count", target:1, unit:"gift", priority:"Medium" },

  // 🎓 UNI & STUDIES
  { title:"Participate in every class", cat:"uni", sub:"", freq:"W", type:"percentage", target:100, unit:"%", priority:"High" },
  { title:"End with at least an 8.5 GPA", cat:"uni", sub:"", freq:"3M", type:"threshold", target:8.5, unit:"GPA", direction:"min", current:0, priority:"High" },
  { title:"90%+ in two classes with 5+ credits", cat:"uni", sub:"", freq:"3M", type:"qualify", target:2, bar:90, unit:"classes",
    items:[ {name:"Economics", value:0, credits:6}, {name:"Marketing", value:0, credits:5}, {name:"Finance", value:0, credits:6} ], priority:"High" },
  { title:"Finish & keep updating Notion study plan", cat:"uni", sub:"", freq:"W", type:"boolean", target:1, unit:"update/wk", priority:"Medium" },
  { title:"Revise class content 3×/week", cat:"uni", sub:"", freq:"W", type:"count", target:3, unit:"sessions", priority:"High" },

  // 🧠 MIND & BODY — Be healthier
  { title:"Gym at least 3×/week", cat:"mind", sub:"Be healthier", freq:"W", type:"count", target:3, unit:"sessions", priority:"High" },
  { title:"Take creatine every day", cat:"mind", sub:"Be healthier", freq:"D", type:"boolean", target:1, unit:"day", priority:"Medium" },
  { title:"Never skip a meal / higher protein", cat:"mind", sub:"Be healthier", freq:"D", type:"meals", target:3, unit:"meals", priority:"High" },

  // 🧠 MIND & BODY — Be focused
  { title:"Avg ≤3h phone screen time daily", cat:"mind", sub:"Be focused", freq:"W", type:"average", target:180, unit:"min/day", lowerIsBetter:true, priority:"High" },
  { title:"Read a book + finish Homo Deus", cat:"mind", sub:"Be focused", freq:"M", type:"reading", unit:"books",
    books:[ {name:"Homo Deus", pages:450, read:0, done:false}, {name:"Finance book", pages:300, read:0, done:false} ], target:2, priority:"Medium" },
  { title:"No phone first 30 min after waking", cat:"mind", sub:"Be focused", freq:"D", type:"boolean", target:1, unit:"day", priority:"Medium" },

  // 🧠 MIND & BODY — Spark curiosity
  { title:"Consume content outside usual interests", cat:"mind", sub:"Spark curiosity", freq:"W", type:"count", target:1, unit:"item", logNotes:true, priority:"Medium" },
  { title:"Share something interesting I learnt", cat:"mind", sub:"Spark curiosity", freq:"W", type:"boolean", target:1, unit:"share/wk", logNotes:true, priority:"Low" },
  { title:"TikTok trend: explain a topic for 1 min", cat:"mind", sub:"Spark curiosity", freq:"M", type:"count", target:1, unit:"video", logNotes:true, priority:"Low" },

  // 🧠 MIND & BODY — Be present
  { title:"3 meals with the whole family", cat:"mind", sub:"Be present", freq:"W", type:"count", target:3, unit:"meals", priority:"Medium" },
  { title:"Call grandparents and Dad", cat:"mind", sub:"Be present", freq:"W", type:"count", target:2, unit:"calls", priority:"Medium",
    note:"Interpretable as one call each; target configurable" },
  { title:"Check on friends (Lisbon & ICS)", cat:"mind", sub:"Be present", freq:"M", type:"count", target:1, unit:"check-in", logNotes:true, priority:"Low" },

  // ⏰ FREE TIME MANAGEMENT
  { title:"Learn the basics of investing", cat:"free", sub:"", freq:"M", type:"milestone", unit:"milestones", priority:"Medium",
    milestones:[
      {name:"Understand stocks", done:false}, {name:"Understand bonds", done:false},
      {name:"Understand ETFs", done:false}, {name:"Understand diversification", done:false},
      {name:"Understand risk", done:false}, {name:"Understand basic valuation", done:false},
      {name:"Complete a beginner investing resource", done:false} ] },
  { title:"Find an afternoon job", cat:"free", sub:"", freq:"3M", type:"milestone", unit:"milestones", priority:"High",
    milestones:[
      {name:"Create/update CV", done:false}, {name:"Build job search list", done:false},
      {name:"Apply to jobs", done:false}, {name:"Contact people", done:false},
      {name:"Get interviews", done:false}, {name:"Get job", done:false} ] },
  { title:"Start studying for driver's license", cat:"free", sub:"", freq:"M", type:"milestone", unit:"milestones", priority:"Medium",
    milestones:[
      {name:"Started studying", done:false}, {name:"Topics completed", done:false},
      {name:"Practice tests", done:false}, {name:"Mock exam passed", done:false} ] },
  { title:"Build one productive hobby/skill per month", cat:"free", sub:"", freq:"M", type:"milestone", unit:"skills", priority:"Medium",
    milestones:[
      {name:"Month 1 skill/hobby", done:false}, {name:"Month 2 skill/hobby", done:false},
      {name:"Month 3 skill/hobby", done:false} ] },
];

if (typeof module !== "undefined") module.exports = { DEFAULT_PERIOD, DEFAULT_THRESHOLDS, FREQ_WEIGHT, CATEGORIES, SEED_GOALS };
