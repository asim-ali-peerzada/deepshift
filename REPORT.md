# DeepShift — Full Extension Report

**Name:** DeepShift — DeepSeek Peak/Off-Peak Timer
**ID:** `asimalipeerzada.deepshift` · **Version:** 0.2.0 · **Engine:** VS Code `^1.80.0`
**Built artifact:** `deepshift-0.2.0.vsix` (26.9 KB, 9 files via `vsce ls`)

---

## 1. What This Extension Is

A status-bar utility for developers who use the **DeepSeek API**. DeepSeek V4 applies **surge
("peak") pricing during two Beijing business windows**; everything else — including **all
weekends** — is off-peak at **half** the peak rate. DeepShift shows the live peak/off-peak state,
countdowns, and a click-to-open planning panel.

## 2. The Schedule (verified)

Effective **2026-08-16/17** (TechNode, TechTimes):

- **Peak (Beijing):** `09:00–12:00` and `14:00–18:00` → in UTC `01:00–04:00` and `06:00–10:00`
- **Off-peak:** every other hour, **plus all of Saturday and Sunday**
- **Pricing:** off-peak = 50% of peak. V4-Pro output ≈ **$3.96 / 1M tokens peak**, **$1.98 off-peak**.

The earlier "00:30–08:30 Beijing" (16:30–00:30 UTC) window was the **pre-V4** schedule and is
now obsolete — the engine was rewritten around the current V4 policy.

## 3. The Problem It Solves

| Before DeepShift | With DeepShift |
|---|---|
| Manually converting Beijing time + tracking weekends | Automatic from `Asia/Shanghai`, recomputed every 30 s |
| Guessing when the next cheap window opens | Status bar countdown + "Next"/"Then" transitions in the panel |
| No plan beyond "is it peak now?" | Best off-peak window (start→end + duration), today's schedule |
| Running bulk jobs into peak pricing | Optional alerts before peak starts *and* before off-peak starts |

## 4. File Inventory (excluding `node_modules`)

```
deepshift/
├── .vscode/
│   └── launch.json          Debug config — F5 launches an Extension Development Host
├── src/
│   ├── schedule.ts          Data-driven schedule engine (no vscode dependency) — testable anywhere
│   ├── extension.ts         Entry point: status bar, tooltip, Quick Pick panel, commands, alerts
│   └── schedule.test.ts     Assert-based boundary + new-field tests (node:assert, no framework)
├── out/                     Compiled JS output of `tsc` (what the runtime actually loads)
├── package.json             Manifest: activation, commands, settings, scripts, deps
├── tsconfig.json            TypeScript strict-mode compiler options
├── .vscodeignore            Excludes src/, tests etc. from the packaged .vsix
├── README.md                Short user-facing doc
├── REPORT.md                This document
├── deepshift-0.1.0.vsix     Installable package produced by `vsce`
└── package-lock.json        Dependency lockfile
```

Total hand-written source: **~280 lines across 3 files.** Zero runtime dependencies
(dev-only: `typescript`, `@types/vscode`, `@types/node`).

---

## 5. Features & Code References

### 5.1 Schedule engine — `src/schedule.ts`

The single source of truth, pure and vscode-free so it runs in Node and the extension host alike.

- **`deepSeekV4` data model** (`src/schedule.ts:18-33`) — schedule is **data, not constants**:
  ```ts
  { timezone: 'Asia/Shanghai', weekendOffPeak: true,
    peakWindows: [{start:'09:00',end:'12:00'},{start:'14:00',end:'18:00'}],
    prices: { peak:'$3.96', offPeak:'$1.98', note:'V4-Pro output / 1M tokens · off-peak = 50%' } }
  ```
  Adding a provider or changing windows is a data edit, not an algorithm change.
- **`TimeState` interface** (`src/schedule.ts:43-54`) — per-tick output:
  `isOffPeak`, `isWeekend`, `nextIsPeak`, `minutesRemaining`, `transitionAt`,
  `nextTransitions` (next 2), `bestWindow` (next off-peak block start/end).
- **Timezone-safe math** — provider-local time and day-of-week come from
  `Intl.DateTimeFormat(..., {timeZone:'Asia/Shanghai'})` (`providerParts`, `providerYMD`),
  so the weekend boundary is correct even when the UTC date differs from the Beijing date.
  `wallToEpoch` (`src/schedule.ts:~95`) converts a provider wall-clock time to a real epoch
  using a probe-offset trick, handling DST for future non-Beijing providers.
- **`getTransitions()`** (`src/schedule.ts:~205`) — enumerates every peak-window edge for the
  next 8 days (skipping weekends), returns sorted future transitions. This one function powers
  the countdown, "Next/Then", and best-window derivation.
- **`getState()`** (`src/schedule.ts:~235`) — phase decision + remaining time + best window.
  Weekend is off-peak; otherwise a time falls in a peak window iff
  `totalMin ∈ [parseMin(start), parseMin(end))`.
- **`getTodaySchedule()` / `getUserTimeZone()`** (`src/schedule.ts:~290`) — peak windows
  converted to the user's resolved timezone for the panel's "Today's schedule".
- **`formatCountdown()`** — `125 → "2h 05m"` (zero-padded).

### 5.2 Status bar indicator — `src/extension.ts`

- Created right-aligned, priority 100; **clickable** → `deepshift.openPanel` (`src/extension.ts:155`).
- **Off-peak:** `🟢 DS OFF · 3h 21m` (or `🟢 DS OFF · Weekend` on Sat/Sun).
- **Peak:** `🔴 DS PEAK · 2h 41m`.
- **No background fill** — emoji dots + explicit text carry the state. A red
  `statusBarItem.errorBackground` renders orange in some themes and hides the red dot
  (red-on-red); dropping the fill keeps both states readable in light/dark themes and is
  color-blind safe (the word PEAK/OFF is always present).
- Refresh: immediate paint + `setInterval(update, 30_000)`; interval disposed via
  `context.subscriptions`.

### 5.3 Hover tooltip — `src/extension.ts`

Markdown tooltip: current state (+ weekend tag), "Window ends in X", reference pricing labeled
explicitly as **V4-Pro** (not assumed to be the user's model), weekend rule, and the Beijing
schedule. Stating "Reference pricing (V4-Pro)" avoids implying model-specific numbers before
model awareness exists.

### 5.4 Click → Quick Pick panel — `src/extension.ts` (`openPanel`)

Clicking the status bar (or `DeepShift: Open Panel`) opens a `showQuickPick` panel — no Webview
needed:

```
🔴 PEAK PRICING — Peak ends in 2h 41m · local 03:00 PM · Beijing 06:00 PM
Next: 🟢 Off-peak · 03:00 PM   (in 2h 41m)
Then: 🔴 Peak · 11:00 AM
💡 Best off-peak window — 03:00 PM → 11:00 AM (20h)
──── Today's schedule ────
09:00 – 12:00 🔴 Peak
14:00 – 18:00 🔴 Peak
Other hours 🟢 Off-peak
Reference pricing (V4-Pro) — $3.96 peak / $1.98 per 1M output · off-peak = 50%
Schedule — DeepSeek V4 · Asia/Shanghai · verify official docs
📋 Copy current status
📋 Copy today's schedule
```

(Saturday/Sunday rows collapse to "🟢 Off-peak — All day (weekend rule)".) The two copy items
write to the clipboard (`vscode.env.clipboard`).

### 5.5 Dual alerts — `src/extension.ts` (`update`)

Two settings, each default **10** minutes, each fires **once per transition** (dedup via
`transitionAt`):

- `deepshift.notifyBeforePeakStarts` → *"DeepSeek peak pricing starts in X."*
- `deepshift.notifyBeforeOffPeakStarts` → *"DeepSeek off-peak pricing starts in X — good time
  for bulk jobs."*

The correct threshold is chosen by `nextIsPeak` (`src/extension.ts:~190`).

### 5.6 Commands & diagnostics — `package.json` + `src/extension.ts`

Registered commands (palette, `Ctrl/Cmd+Shift+P`): `DeepShift: Open Panel`,
`DeepShift: Copy Status`, `DeepShift: Diagnose Timezone`. Diagnostics shows system tz, local /
Beijing / UTC times, schedule tz, weekend rule, and the peak windows — useful because the
weekend-boundary logic is subtle.

### 5.7 Lifecycle — `package.json`, `.vscode/launch.json`

- `activationEvents: ["onStartupFinished"]` — lazy load after startup.
- `main: ./out/extension.js`; `vscode:prepublish` compiles via `tsc`.
- Three command contributions + two configuration settings.
- `.vscode/launch.json` — **F5** spawns an Extension Development Host.

---

## 6. Where You See It — Visual Summary

| Surface | Location | What appears |
|---|---|---|
| Status bar item | Bottom-right | `🟢 DS OFF · …` / `🔴 DS PEAK · …` (no bg fill) |
| Tooltip | Hover over item | State, reference pricing, weekend tag, Beijing schedule |
| Quick Pick panel | Click item or `DeepShift: Open Panel` | Current + Next/Then + best window + today's schedule + copy actions |
| Notification | OS toast, bottom-right | Once per transition, N min before (each direction) |
| Diagnostics | `DeepShift: Diagnose Timezone` | Timezone/schedule verification |
| Settings UI | `Ctrl+,` → DeepShift | `notifyBeforePeakStarts`, `notifyBeforeOffPeakStarts` |

## 7. Correctness Verification — `src/schedule.test.ts`

Boundary asserts across the V4 windows, weekends, and the Friday→Saturday timezone boundary
(run via `npm test`):

| Case (UTC) | Expected |
|---|---|
| Mon 02:00 (Beijing 10:00) | peak, 120 min left, next→off-peak |
| Mon 05:00 (lunch gap) | off-peak, next peak in 60 min |
| Mon 09:00 (Beijing 17:00) | peak, ends in 60 min |
| Mon 11:00 (evening) | off-peak, next peak Tue 01:00Z (840 min) |
| Sat 02:00 | weekend off-peak, next peak Mon 01:00Z |
| Sun 09:00 | weekend off-peak |
| Fri 17:00Z (= Sat 01:00 Beijing) | weekend off-peak (tz boundary) |
| New fields | `nextTransitions` length 2, `bestWindow` set, `isWeekend` true on Sat |

All pass (`all schedule tests passed`). Formatting: `formatCountdown(125) === '2h 05m'`.

## 8. Compatibility & Distribution

- Only documented stable APIs (`StatusBarItem`, `ThemeColor`, `MarkdownString`,
  `showQuickPick`, `showInformationMessage`, `env.clipboard`) → runs unchanged in **VS Code,
  Cursor, Windsurf** and other forks.
- Theme tokens, no hardcoded hex; emoji convey state so no theme-color dependency for meaning.
- Publish: Microsoft Marketplace (`npx vsce publish`) and **Open VSX** (`npx ovsx publish`) for
  fork users — set the real publisher id in `package.json` first.

## 9. Known Deliberate Simplifications (roadmap)

- **0.3 DECIDE:** Cost calculator + "Worth Waiting?" — needs a full token-price table
  (Flash/Pro × cache-hit/miss × output) and an input form, not just the one V4-Pro output figure.
- **0.2.x polish:** notification quiet-hours / mode, timezone override.
- **Deferred / rejected:** `src/schedule/` folder split (directory ceremony at this size);
  remote-manifest fetch + stale-data warning + Last-Known-Good (depends on a fetch we haven't
  built); provider abstraction / multi-provider (prove DeepSeek first); account, cloud,
  telemetry, usage scraping (out of scope for a timer).
