# Changelog

All notable changes to DeepShift are documented here. Format follows Keep a Changelog and Semantic Versioning.

## [0.2.0] - 2026-08-24

### Added
- Data-driven schedule engine (`src/schedule.ts`): `deepSeekV4` with `weekendOffPeak: true`, peak `09:00-12:00 & 14:00-18:00 Asia/Shanghai` (01:00-04:00 & 06:00-10:00 UTC), `tzInfo()` with flag/country map
- Weekend-aware countdown: all weekend is off-peak, boundaries evaluated in `Asia/Shanghai` via `Intl.DateTimeFormat`
- Live seconds in status bar (`2h 07m 42s`, 1s tick) and weekend `Weekend · 2h 07m 42s` variant
- Click → QuickPick panel (hideInputBox): current state, Next/Then, Best off-peak window (today→tomorrow), Today's schedule in user TZ, Pricing, Schedule footer, Copy actions, Should I run now?
- Both models pricing: `V4-Flash $1.32/$0.66` and `V4-Pro $3.96/$1.98` (USD/1M output, off-peak 50%)
- Country display: hover tooltip and panel show `🇵🇰 Pakistan (Asia/Karachi)` vs `🇨🇳 China (Beijing)` via `tzInfo()`
- Commands: `deepshift.openPanel`, `deepshift.copyStatus`, `deepshift.diagnostics`
- Dual alerts: `notifyBeforePeakStarts` and `notifyBeforeOffPeakStarts` (default 10 min each), deduplicated per transition

### Changed
- Schedule corrected from legacy `00:30-08:30 Beijing` to current DeepSeek V4 policy (verified via TechNode/TechTimes, effective 2026-08-16)
- `src/clock.ts` → `src/schedule.ts` (pure functions, no vscode dependency), `formatCountdownSec()` added
- Status bar no longer uses `statusBarItem.errorBackground` (red-on-orange clash on light themes); now emoji dot + text only
- Tooltip is minute-stable and cached (`lastTooltip`) to prevent hover jitter on 1s ticks; M-dash removed from Pricing header

### Fixed
- Flash and Pro pricing now on separate rows (`V4-Flash` / `V4-Pro` QuickPick items and `- Flash` / `- Pro` markdown bullets) instead of single combined line

## [0.1.0] - 2026-08-24

### Added
- Initial MVP: status bar countdown (`clock.ts` UTC window 16:30-00:30 UTC), markdown tooltip with local + Beijing times, single alert `warnBeforePeakEnds`
- Tests: `clock.test.ts` boundary cases, `vsce package` 4.46 KB vsix, `launch.json` for F5 Extension Development Host
