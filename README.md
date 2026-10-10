# Goal Review — a reviews-first 3-month tracker

A minimalist, installable, offline web app (PWA) built around **weekly and monthly check-ins**, not daily chores. Log things when you want; sit down each Sunday to see what's already recorded, fill the gaps, and understand your week — in about five minutes.

**Period:** 13 Sep 2026 → 13 Dec 2026 (13 weeks, Mon→Sun). All 25 goals, 4 categories, and their tracking types are preserved as editable data.

---

## The four sections

| Tab | Purpose |
|---|---|
| **Week** (home) | The hero: an interactive **7-day grid** — goals as rows, Mon→Sun as columns. Every cell is editable; tap any cell to fill/correct that day. Already-recorded days are highlighted; missing days show a faint dot and are *not* counted as failures. Prev / This week / Next and a date-jumper reach any week. Coverage (% entered) is shown separately from the performance score. Reflection + "Mark week reviewed" at the bottom (reopenable, stays editable). |
| **Month** | A functional monthly review: weekly-goal averages by category with **change vs previous month**, a list of the month's weeks (each opens its grid to backfill), monthly & long-term goals showing *recorded / remaining* (tap a count goal to add/remove occurrences — counted once; tap a project to tick milestones), and a monthly reflection you can mark reviewed. |
| **Progress** | Visualisations — overall trend line, category comparison, strongest/weakest, full target-vs-actual table, and a goal-specific trend picker. |
| **Goals** | One simple page to add / edit / pause / delete goals and milestones. |

---

## How logging works (the important part)

Everything is one **shared set of records (“entries”)**. Logging during the week and filling things in on Sunday write to the *same* records — never duplicates.

- **Count goals** (gym, revision, family meals, calls): each ＋ adds one occurrence; − removes the latest. Multiple on the same day are supported.
- **Daily yes/no habits** (creatine, no-phone): open **Days ▾** for the compact Mon–Sun grid. Tap a day to cycle **empty → done → N/A → empty**.
- **Meals**: per-day Breakfast / Lunch / Dinner / N/A chips.
- **Screen time (average)**: **Enter ▾** → type each day's minutes. Blank days stay blank.
- **Class participation (%)**: Edit → attended / total.
- **Weekly yes/no** (study plan, sharing): one “Yes” toggle.
- **Monthly / project goals**: edited from Month or Goals (milestones, GPA, reading, qualifying classes).

### Entry states — and why “missing” ≠ “zero”
- **Logged** — a real recorded value/occurrence.
- **Missing** — no entry yet. **Excluded from the score**, shown separately as *coverage* (e.g. “5/7 days logged”). A blank day is never counted as a failure or as zero.
- **N/A** — the goal explicitly didn't apply that day (counts toward coverage, not as a miss).
- **Reviewed** — you pressed *Mark week reviewed*. A week only shows “reviewed” when you say so; reopening it keeps everything editable.

To record a genuine zero (e.g. “I did no gym this week”), just leave count at 0 or mark days N/A — that is honoured as a real result.

---

## Scoring (fair + coverage-aware)

1. **Per-goal** score by type (count / boolean / average / percentage / threshold / qualify / milestone / reading / meals). Averages compare to a threshold; thresholds never show green unless actually met.
2. **Missing data is excluded** from the denominator. Coverage (completeness) is reported *separately* so a half-logged week isn't mistaken for a bad week.
3. **Weekly score counts only Daily & Weekly goals**; monthly/3-month goals appear as context and are scored on their own cadence (counted once per month, no double-counting across weeks).
4. **Frequency weighting** (3M=4, M=3, W=2, D=1) inside a category so daily habits don't overpower big goals; **categories averaged equally** into the overall.
5. **Historical edits recalculate everything** — totals, averages, charts.

Status: green ≥85%, amber ≥50%, red <50%.

---

## Design

Warm off-white background, near-black text, high contrast, one accent colour, status colours (green/amber/red) only where they mean something, clean list rows and tables instead of nested dark cards, generous whitespace. Works on mobile and desktop. The graphs and percentages are kept and refined — minimalism simplified the presentation, it didn't remove functionality.

---

## Run / install

Static site, no build. **Live:** host the folder over HTTPS (GitHub Pages). On your phone, open it in Safari → Share → **Add to Home Screen** → launch full-screen (works offline).

First run: **Settings → Load realistic example data** to explore (note: some days are intentionally left blank to show *missing* vs *zero*). When ready for real: **Settings → Clear all entries** (keeps your goals). Back up any time via **Export backup (JSON)**.

To do a **retrospective review**, set **Settings → Treat “today” as** to a past Sunday; logging still attributes to the correct dates.

---

## Files

`index.html` · `styles.css` · `seed.js` (25 goals as editable seed data) · `engine.js` (coverage-aware calculation engine) · `app.js` (UI, entry store, reviews) · `engine.test.js` (26 tests: `node engine.test.js`) · `sw.js` + `manifest.webmanifest` + icons (PWA).

See `ARCHITECTURE.md` for the data model, scoring details, and the optional Notion schema.

---

## Review quality-of-life (Tier 1)

- **Fill the gaps** — the Week tab shows how many cells are still blank for elapsed days and offers a guided one-at-a-time pass that walks only the missing cells (one tap each). Screen-time entry chains day→day in a single flow.
- **Coverage** is capped at 100% and counts only days that have actually happened (never treats a future day as expected).
- **Last-week context** — each goal row shows its previous week's result faintly, as a momentum signal.
- **Mobile grid polish** — a scroll affordance on the right edge and a tighter goal-name column so Fri–Sun are easy to reach on a phone.

## Verified

All 32 engine tests pass, and the full UI was browser-tested against the 8 required scenarios: log-Tuesday-shows-Sunday, add-Thursday-no-duplicate, blank-stays-missing, historical edit recalculates, reopen review stays editable, week navigation preserves data, multiple-same-day counts, and monthly-no-double-count — with zero console errors.
