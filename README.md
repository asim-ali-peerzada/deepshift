# DeepShift — DeepSeek Peak/Off-Peak Timer

**Know when your AI costs less.** Live countdown to DeepSeek V4 pricing windows inside VS Code, Cursor, Windsurf and any VS Code fork.

Peak is **09:00–12:00 & 14:00–18:00 Beijing** (`01:00–04:00 & 06:00–10:00 UTC`); everything else — **including all weekend** — is off-peak at **50% off**. DeepShift converts that to your local timezone.

## What you see

- **Status bar (bottom-right):** `🟢 DS OFF · 2h 07m 42s` ticks every second, or `🔴 DS PEAK · 2h 07m 42s`. Weekend shows `🟢 DS OFF · Weekend · 2h 07m 42s`. No background fill — emoji dot + `PEAK`/`OFF` text keeps it readable on light/dark themes.
- **Hover tooltip:** `DeepSeek V4` state, `Window ends in 2h 07m`, **Pricing USD per 1M output** — `Flash: peak $1.32 · off-peak $0.66` / `Pro: peak $3.96 · off-peak $1.98` on separate rows, plus `🇵🇰 Local` vs `🇨🇳 Beijing` times with country flags. Minute-stable so hover doesn't jitter while the bar ticks.
- **Click → panel:** Current state, `Next` / `Then`, `Best off-peak window` (today→tomorrow), `Today's schedule` in your TZ (`Asia/Karachi` → `06–09 Peak`), `Should I run now?`, and pricing. `Copy current status` / `Copy today's schedule` included.
- **Alerts:** `deepshift.notifyBeforePeakStarts` and `deepshift.notifyBeforeOffPeakStarts` (default 10 min each), once per transition. Diagnostics via `DeepShift: Diagnose Timezone`.

Works via standard `StatusBarItem`/`ThemeColor`/`MarkdownString`/`QuickPick` APIs — no webviews, no runtime deps.

## Schedule & pricing

Effective 2026-08-16/17 (TechNode / TechTimes, verified). V4 output rates per 1M tokens, USD: `Flash $1.32 peak / $0.66 off`, `Pro $3.96 peak / $1.98 off`.

## Install

Marketplace: `AsimAliPeerzada.deepshift` — or sideload the `.vsix`:
```sh
code --install-extension deepshift-0.2.0.vsix
windsurf --install-extension deepshift-0.2.0.vsix
```
Cursor/Windsurf users: also on Open VSX (`npx ovsx publish`).

## Develop

```sh
npm install
npm test      # tsc + schedule.test.ts (weekday, weekend, timezone-boundary, secondsRemaining)
npm run watch # tsc -watch
# F5 to launch Extension Development Host
npx vsce package
```

## Configuration

| Setting | Default | Notes |
|---|---|---|
| `deepshift.notifyBeforePeakStarts` | `10` | minutes before peak, `0` disables |
| `deepshift.notifyBeforeOffPeakStarts` | `10` | minutes before off-peak |

## Publish

Publisher is `AsimAliPeerzada` (`package.json:publisher`), repository is `asim-ali-peerzada/deepshift` (matches `git remote`). Ensure `icon.png` (128×128) is present at repo root, then `npx vsce package` and upload the `.vsix` at https://marketplace.visualstudio.com/manage/publishers/AsimAliPeerzada → New Extension. License: MIT.
