# 🎯 3-Month Goal OS

A personal, installable, offline-first web app (PWA) that turns your 25 three-month goals into a living operating system. Fast daily input, auto-calculated weekly/monthly/period dashboards, a 5-minute Sunday check-in, trend charts, streaks, and reviews — with **zero** manual percentage math.

**Period:** 13 Sep 2026 → 13 Dec 2026 (13 weeks, Mon→Sun). Today in the demo = Thu 8 Oct 2026 = **Week 4**.

---

## Why a PWA and not Notion (short version)

You asked me to evaluate Options A–D (section 12). Here is the honest comparison, judged on **fast tracking > beautiful design > technical complexity**.

| Criterion | A: Notion only | B: Notion + automation | C: **Notion + PWA (this)** | D: Native app |
|---|---|---|---|---|
| Mobile input speed | 🔴 slow (open big DB) | 🟡 better | 🟢 **1–2 taps** | 🟢 fast |
| Auto calc (avg, threshold, weighted score) | 🔴 formula hell | 🟡 needs scripts | 🟢 **done in JS** | 🟢 |
| Notifications | 🔴 weak | 🟡 via tools | 🟢 **local + install** | 🟢 push |
| Cost | 🟢 free | 🟡 paid tools | 🟢 **free** | 🔴 dev + stores |
| Maintenance | 🟢 | 🟡 | 🟢 **single folder** | 🔴 high |
| Reliability | 🟢 | 🟡 breaks | 🟢 **offline** | 🟢 |

**Decision: Option C.** Notion's formula engine genuinely cannot do your averaging / threshold / fair-weighted-scoring logic cleanly, and it fails the "<1 minute on mobile" bar. This PWA does all the math, installs to your home screen, works offline, and **exports to a Notion-ready Markdown** so you can keep Notion as an archive/source-of-truth journal. See `ARCHITECTURE.md` for the full Notion schema if you still want to build it there.

> ⚠️ **I could not access your existing Notion workspace** — there is no Notion integration connected to this environment. So I could not inspect or reuse your current goals/databases. `ARCHITECTURE.md` section 3 tells you exactly what to provide if you want me to migrate your existing Notion content.

---

## Run it

It's a static site — no build, no install, no backend.

**Locally:**
```bash
cd /projects/sandbox
python3 -m http.server 8099     # or: npx serve .
# open http://localhost:8099
```

**On your phone (install as an app):**
1. Host the folder anywhere static (GitHub Pages, Netlify drop, Vercel, or your own box). HTTPS is required for install + notifications.
2. Open the URL in Safari (iOS) or Chrome (Android).
3. **iOS:** Share → *Add to Home Screen*. **Android:** menu → *Install app*.
4. It now opens full-screen like a native app and works offline.

---

## The 7 navigation tabs

| Tab | What it does |
|---|---|
| 🏠 **Today** | Ultra-fast daily input. Creatine/no-phone toggles, meal chips, quick +1 for weekly goals. One or two taps. |
| 📊 **Week** | Auto-calculated weekly dashboard with the fair-weighted score, per-goal bars, and the **Sunday Check-In** button. |
| 🎯 **Goals** | All goals by category/subcategory. Tap any to edit; add/pause/delete; edit milestones/books. |
| 📅 **Monthly** | Monthly performance, category scores, strengths/weaknesses/most-improved. Save a monthly review. |
| 📈 **3-Month** | Period score, **weekly trend chart**, by-category, full target-vs-actual table, superlatives, final report on 13 Dec. |
| 📝 **Reviews** | History of all weekly & monthly reviews with your reflection answers. |
| ⚙️ **Settings** | Change period, thresholds, scoring weights, notifications, load example data, **export/import**. |

---

## The core loop

**SET GOALS → TRACK (Today, <1 min) → AUTO-CALCULATE → SUNDAY REVIEW (~5 min) → IDENTIFY WEAKNESSES → ADJUST → REPEAT**

- **Daily (<1 min):** Open 🏠 Today, tap your toggles/chips, done.
- **Sunday (~5 min):** 📊 Week → *Sunday Check-In*. It shows your score + 🟢🟡🔴 lists and asks the 5 reflection questions. Save → stored in Reviews.
- **Monthly (~10 min):** 📅 Monthly → review trends → *Save monthly review*.
- **13 Dec:** 📈 3-Month auto-generates your final report.

---

## Scoring methodology (fair, not naïve)

See `ARCHITECTURE.md` for full detail. In short:
1. **Per-goal score** is computed by the goal's *type* (count / boolean / average / percentage / threshold / qualify / milestone / reading / meals) — never a universal checkbox.
2. **Weekly score counts only Daily & Weekly goals** (the ones that recur weekly). Monthly/3-Month goals appear as *context* and are scored on their own tabs — so a monthly goal never shows as a weekly "miss."
3. **Fair weighting:** within a category, goals are weighted by frequency (3M=4, M=3, W=2, D=1) so daily habits don't drown big goals.
4. **Categories are averaged equally** into the overall score, so a category with many goals doesn't dominate.

Statuses: 🟢 ≥85% · 🟡 50–84% · 🔴 <50% (all configurable in Settings).

---

## Your data

- Stored **on-device** in `localStorage`. Nothing leaves your phone.
- **Back up / move devices:** Settings → *Export JSON*. Import on the new device.
- **Mirror to Notion:** Settings → *Export Notion-ready Markdown*.

---

## Files

| File | Role |
|---|---|
| `index.html` | App shell |
| `styles.css` | Mobile-first dark UI |
| `seed.js` | Config + your 25 goals as the **initial dataset** (editable data, not logic) |
| `engine.js` | Pure calculation engine (scores, rollups, trends, streaks) |
| `app.js` | UI, storage, views, check-ins, editor, notifications, export |
| `engine.test.js` | 21 unit tests verifying the math (`node engine.test.js`) |
| `sw.js` + `manifest.webmanifest` + `icon-*.png` | PWA offline + install |

---

## Known limitations (and what I did about them)

- **No access to your Notion workspace** → built the full standalone system + a Notion schema doc + Markdown export so you can mirror.
- **Web push notifications** are limited on iOS (only work when installed to Home Screen, iOS 16.4+). The app uses the local Notification API and schedules a daily reminder while open/installed; it is best-effort, not a cloud push service. Reminders are configurable in Settings.
- **Emoji may render as boxes** in a headless/server browser without an emoji font — on your actual phone they render natively.
