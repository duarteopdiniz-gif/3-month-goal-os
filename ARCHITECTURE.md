# Architecture & Notion schema

This documents the data model, the scoring math, and — for section 10/11 — a clean relational **Notion** structure you can build if you want Notion as your archive/source of truth.

---

## 1. Data model (the PWA)

Everything is plain JSON in `localStorage` under `goal-os-v1`.

### Goal
```jsonc
{
  "id": "g10",
  "title": "Gym at least 3×/week",
  "cat": "mind",            // category id
  "sub": "Be healthier",    // optional subcategory
  "freq": "W",              // D | W | M | 3M
  "type": "count",          // see goal types below
  "target": 3,
  "unit": "sessions",
  "priority": "High",
  "active": true,
  // type-specific extras:
  "current": 8.3,                       // threshold
  "direction": "min",                   // threshold: min (≥) | max (≤)
  "lowerIsBetter": true,                // average
  "bar": 90,                            // qualify: the % bar
  "items": [{ "name":"Economics","value":92,"credits":6 }],  // qualify
  "milestones": [{ "name":"Create CV","done":true }],        // milestone
  "books": [{ "name":"Homo Deus","pages":450,"read":324,"done":false }] // reading
}
```

### Daily Log
```jsonc
{ "id":"l…", "goalId":"g10", "date":"2026-10-06",
  "value": 1,                 // count / average(minutes) / percentage(attended)
  "done": true,               // boolean goals
  "total": 10,                // percentage goals (denominator)
  "meals": { "b":true,"l":true,"d":true,"s":false }, // meals goals
  "note": "" }
```

### Review
```jsonc
{ "type":"weekly", "key":"2026-09-28", "weekIndex":4, "score":89,
  "answers": { "wins":"…","struggles":"…","why":"…","change":"…","priority":"…" },
  "snapshot": [ { "title":"Gym…","score":100,"status":"green","label":"3/3" } ] }
```

---

## 2. Goal types & how each is scored

| Type | Example | Weekly score formula |
|---|---|---|
| `count` | Gym 3/wk | `min(100, sum(value)/target×100)` |
| `boolean` (daily) | Creatine | `doneDays / elapsedDays × 100` |
| `boolean` (weekly) | Study plan updated | 100 if done once this week else 0 |
| `meals` | No skipped meals | `mealsEaten / (elapsedDays × target) × 100` |
| `average` (lowerIsBetter) | Screen time ≤180m | 100 if avg ≤ target, else `target/avg × 100` |
| `percentage` | Class participation | `attended/total × 100` |
| `threshold` | GPA ≥8.5 | 100 if met; else `current/target × 100` (never green unless met) |
| `qualify` | 2 classes ≥90% | `qualifyingCount / target × 100` |
| `milestone` | Find a job | `doneMilestones / total × 100` |
| `reading` | Finish Homo Deus | avg of each book's `read/pages` (100 if done) |

**Period vs weekly scoping:** `threshold`, `qualify`, `milestone`, `reading` are *period* goals — they're evaluated against their own state, not a single week. On the **Week** tab, only `D`/`W` goals contribute to the weekly % (monthly/3M goals show as context). On the **3-Month** tab, the by-category view uses `scope:"all"` so the big goals count. This is the fix to the "a monthly goal shouldn't look like a weekly failure" problem.

---

## 3. Rollup math

```
per-goal score  →  category score (frequency-weighted avg)  →  overall (categories equal-weight)

weight(goal) = { 3M:4, M:3, W:2, D:1 }         // configurable in Settings
categoryScore = Σ(score·weight) / Σ(weight)    // over the in-scope goals
overall       = mean(categoryScore for categories that have in-scope goals)
```
- **Period score** = mean of each completed week's overall score.
- **Weekly trend** = overall score computed independently for each week → the line chart.
- **Streaks** = consecutive days a daily boolean goal is `done`, counting back from today.
- **Superlatives** (best / worst / most improved / most inconsistent) use per-goal mean and standard deviation across the elapsed weeks.

All 21 formulas are covered by `engine.test.js` and verified against your stated examples (gym 3/3, creatine 6/7→86%, screen 2h48m, GPA 8.2 vs 8.6, 2/2 qualifying classes, Homo Deus 72%, etc.).

---

## 4. Notion schema (if you want Notion too)

If you prefer Notion as the archive, build these **5 databases** and relations. The PWA's *Export Notion-ready Markdown* produces rows you can paste in.

### Goals (DB)
| Property | Type |
|---|---|
| Goal | Title |
| Category | Select (Love / Uni / Mind / Free) |
| Subcategory | Select |
| Frequency | Select (D/W/M/3M) |
| Goal Type | Select (count/boolean/average/percentage/threshold/qualify/milestone/reading/meals) |
| Target | Number |
| Unit | Text |
| Start / End Date | Date |
| Priority | Select |
| Active | Checkbox |
| Current Progress | **Rollup** from Daily Logs |
| Status | **Formula** (🟢/🟡/🔴 from progress ÷ target) |

### Daily Logs (DB)
Date (Date), Goal (**Relation → Goals**), Value (Number), Completed (Checkbox), Notes (Text).

### Weekly Reviews (DB)
Week (Title/Date), Goals (Relation), Overall Score (Number/Formula), Wins, Problems, Reflection, Next Week Priority (Text).

### Monthly Reviews (DB)
Month (Title), Goals (Relation), Score (Rollup/Number), Reflection, Improvements, Weaknesses (Text).

### Milestones (DB)  *(for project goals)*
Goal (**Relation → Goals**), Milestone (Title), Completed (Checkbox), Date, Notes.

**Relations/rollups:** Goals ⇄ Daily Logs (rollup `sum(Value)` or `count(Completed)` → Current Progress). Goals ⇄ Milestones (rollup `percent(Completed)`). Weekly/Monthly Reviews ⇄ Goals for the snapshot.

**Where Notion struggles (why the PWA exists):** average-with-threshold (screen time), fair frequency-weighted overall score, and per-type branching all require nested `if()` formulas across rollups that are painful to maintain and can't be driven from a phone in <1 minute. The PWA does them in a few lines of JS.

### What to give me to migrate your existing Notion
Since I can't reach your workspace, if you want me to reuse/upgrade it, share: (1) a screenshot or export of your current Goals DB and its properties, (2) which goals already exist there, (3) whether you have Daily Logs / Reviews DBs already. I'll then produce a non-duplicating migration: what to reuse, which properties to add, which DBs/relations to create.

---

## 5. Flexibility (section 18)

Nothing is hardcoded in logic. The 25 goals live in `seed.js` as the *initial dataset*; after first load they're editable state. You can add/remove/pause goals, change targets/frequencies/types, edit milestones & books, add categories (edit `state.categories`), and change the 3-month period — all from the UI, without touching code.
