# Changelog

All notable changes to DeepShift are documented here. Format follows Keep a Changelog and Semantic Versioning.

## [0.3.1] - 2026-10-02

Internal code quality pass — no behaviour changes, no data changes.

### Fixed
- `fmtTime` was defined identically in both `extension.ts` and `schedule.ts`.
  It is now a single exported function in `schedule.ts`; `extension.ts` imports
  it. A change to the time-formatting logic previously had to be made in two
  places.
- `getUserTimeZone()` and `tzInfo()` were called twice inside `buildPanelItems`
  (once for the status row, once for the "Today's schedule" separator label).
  Both calls now reuse the values computed at the top of the function.
- QuickPick action dispatch used `label.includes('Copy current')` / `label.includes('Copy today')` /
  `label.includes('Should I run')` — substring matching that silently breaks
  if any label text changes. Replaced with three named string constants
  (`LBL_COPY_STATUS`, `LBL_COPY_SCHEDULE`, `LBL_RUN_NOW`) shared between the
  item that creates the label and the handler that tests it (`===` equality).
- `statusText` built a `label` intermediate that was used in only one branch
  where the condition already guaranteed the value. Inlined to a direct
  template literal.
- `isHoliday` used `Array.indexOf(key) !== -1`; replaced with
  `Array.includes(key)` for readability.

## [0.3.0] - 2026-10-02

Pricing, model IDs and the peak-window calendar were re-verified against
`https://api-docs.deepseek.com/quick_start/pricing/` (EN and zh-CN). This release
corrects two facts that were wrong in 0.2.0 and adds a schedule rule that was
missing entirely.

### Fixed
- **Flash output price was wrong.** 0.2.0 displayed `$1.32` peak / `$0.66`
  off-peak for `deepseek-flash` output. The real rate is **`$1.20` peak /
  `$0.60` off-peak**. The old figures are V4-Pro's *cache-miss input* rate —
  a model-and-lane transposition several outlets (TechTimes/Quartz, devtk,
  aipricing.guru) repeated when the price rose on 2026-08-13, and which this
  extension inherited. Flash output was overstated by 10%.
- **Retired model id was being advertised.** `deepseek-v4-flash` was retired on
  2026-09-10 and now silently routes to DeepSeek-V4.1-Flash. The panel,
  tooltip and docs now show the callable ids `deepseek-flash` and
  `deepseek-v4-pro` alongside the served version
  (`DeepSeek-V4.1-Flash`, `DeepSeek-V4-Pro-0813`).
- **Chinese public holidays showed as PEAK.** DeepSeek bills them off-peak all
  day; 0.2.0 only knew the weekend rule. Added the official State Council
  calendar for 2026 (confirmed, notice of 2025-11-04) and 2027 statutory
  dates (provisional). Weekend and holiday days are now both skipped when
  computing the next transition, so the countdown jumps the whole holiday block.
- **Hard crash for ~6 days every Chinese New Year.** The transition scan only
  looked 8 days ahead. Spring Festival 2026 is 9 consecutive free days
  (Feb 15–23), so `getTransitions()` returned `[]` and `getState()` threw
  `TypeError: Cannot read properties of undefined (reading 'at')` on
  2026-02-14 → 2026-02-19 — every second, from the 1s status-bar interval.
  Lookahead is now 21 days, and a test asserts it covers the longest free run
  in the holiday list.
- **Countdowns past 24h were unreadable in three places.** A weekend or holiday
  gap runs to ~6 days and the extension showed `167h 00m` — in the tooltip, the
  status bar, and the panel's best-off-peak row (which carried its own
  hand-rolled hours math). All three now roll up to `6d 23h` via one formatter.
- Tooltip schedule footer no longer a hardcoded string literal
  (`09:00–12:00 & 14:00–18:00`) — derived from `deepSeekV4.peakWindows`, so it
  can no longer drift out of sync with the data.
- Removed a duplicated `fmtT`/`fmtTime` pair and dead `DayWindow.peak` field
  (always `true`). The off-peak reason and the window string are now single
  exported helpers shared by the status bar, tooltip and panel, so they cannot
  disagree.

### Added
- Full rate card per model instead of output-only: input **cache hit**,
  input **cache miss**, and output, each peak/off-peak. Input is often the
  larger token count, and cache-hit input is ~50× cheaper than cache-miss, so
  the old output-only view was a fraction of a real bill.
- Account concurrency limits (2500 flash / 500 pro) in the panel.
- `verifiedOn` + `sourceUrl` on the schedule, surfaced in the tooltip, the panel
  and `DeepShift: Diagnose Timezone`, so a stale card is visibly stale instead of
  silently wrong.
- `isHoliday` on `TimeState`; status bar reads `🟢 DS OFF · China holiday · …`
  on an otherwise-peak weekday.
- Panel warns when the bundled holiday calendar no longer covers the current year.
- Tests for the holiday rule, the corrected price card, and holiday-list shape.

### Changed
- `deepSeekV4.prices` → `deepSeekV4.models` (array of `ModelPricing`), with
  `holidayOffPeak`, `holidays`, `verifiedOn` and `sourceUrl`.
- `providerParts()` now returns the Beijing `y/mo/d` in its single `Intl`
  call, replacing `providerYMD()`; `getTransitions()` drops from two `Intl`
  calls per day to one.
- `getTodaySchedule()` returns `isHoliday` alongside `isWeekend`.

### Known limitations
- 2027 holiday dates are provisional: only the statutory days are included,
  because the State Council publishes the 调休 bridge days each November. This
  deliberately fails safe — a 调休 rest day may be reported as peak (the user
  waits and loses nothing), but a normal workday is never reported as off-peak.
- Pricing is bundled, not fetched. There is no network call in this extension by
  design, so DeepSeek price changes need a release.

## [0.2.0] - 2026-08-24

### Added
- Data-driven schedule engine (`src/schedule.ts`): `deepSeekV4` with `weekendOffPeak: true`, peak `09:00-12:00 & 14:00-18:00 Asia/Shanghai` (01:00-04:00 & 06:00-10:00 UTC), `tzInfo()` with flag/country map
- Weekend-aware countdown: all weekend is off-peak, boundaries evaluated in `Asia/Shanghai` via `Intl.DateTimeFormat`
- Live seconds in status bar (`2h 07m 42s`, 1s tick) and weekend `Weekend · 2h 07m 42s` variant
- Click → QuickPick panel (hideInputBox): current state, Next/Then, Best off-peak window (today→tomorrow), Today's schedule in user TZ, Pricing, Schedule footer, Copy actions, Should I run now?
- Both models pricing: `V4-Flash $1.32/$0.66` and `V4-Pro $3.96/$1.98` (USD/1M output, off-peak 50%) — **both Flash figures corrected in 0.3.0**
- Country display: hover tooltip and panel show `🇵🇰 Pakistan (Asia/Karachi)` vs `🇨🇳 China (Beijing)` via `tzInfo()`
- Commands: `deepshift.openPanel`, `deepshift.copyStatus`, `deepshift.diagnostics`
- Dual alerts: `notifyBeforePeakStarts` and `notifyBeforeOffPeakStarts` (default 10 min each), deduplicated per transition

### Changed
- Schedule corrected from legacy `00:30-08:30 Beijing` to current DeepSeek V4 policy (effective 2026-08-16; verified via TechNode/TechTimes — **superseded by 0.3.0**, which cites the official rate card directly)
- `src/clock.ts` → `src/schedule.ts` (pure functions, no vscode dependency), `formatCountdownSec()` added
- Status bar no longer uses `statusBarItem.errorBackground` (red-on-orange clash on light themes); now emoji dot + text only
- Tooltip is minute-stable and cached (`lastTooltip`) to prevent hover jitter on 1s ticks; M-dash removed from Pricing header

### Fixed
- Flash and Pro pricing now on separate rows (`V4-Flash` / `V4-Pro` QuickPick items and `- Flash` / `- Pro` markdown bullets) instead of single combined line

## [0.1.0] - 2026-08-24

### Added
- Initial MVP: status bar countdown (`clock.ts` UTC window 16:30-00:30 UTC), markdown tooltip with local + Beijing times, single alert `warnBeforePeakEnds`
- Tests: `clock.test.ts` boundary cases, `vsce package` 4.46 KB vsix, `launch.json` for F5 Extension Development Host
