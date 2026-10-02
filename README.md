# DeepShift — DeepSeek Peak/Off-Peak Timer

**Know when your AI costs less.** Live countdown to DeepSeek pricing windows inside VS Code, Cursor, Windsurf and any VS Code fork.

Peak is **09:00–12:00 & 14:00–18:00 Beijing** (`01:00–04:00 & 06:00–10:00 UTC`), Monday–Friday; everything else — **including weekends and Chinese public holidays** — is off-peak at **50% off**. DeepShift converts that to your local timezone.

## What you see

- **Status bar (bottom-right):** `🟢 DS OFF · 2h 07m 42s` ticks every second, or `🔴 DS PEAK · 2h 07m 42s`. Weekend shows `🟢 DS OFF · weekend · 2h 07m 42s`; a Chinese public holiday shows `🟢 DS OFF · China holiday · …`. No background fill — emoji dot + `PEAK`/`OFF` text keeps it readable on light/dark themes.
- **Hover tooltip:** state, `Window ends in 2h 07m`, a per-model **price table** (input cache-hit / input cache-miss / output, peak vs off-peak) for `deepseek-flash` and `deepseek-v4-pro`, `🇵🇰 Local` vs `🇨🇳 Beijing` times with country flags, and the date the data was verified against the official page. Minute-stable so hover doesn't jitter while the bar ticks.
- **Click → panel:** Current state, `Next` / `Then`, `Best off-peak window` (today→tomorrow), `Today's schedule` in your TZ (`Asia/Karachi` → `06–09 Peak`), `Should I run now?`, and per-model pricing with concurrency limits. `Copy current status` / `Copy today's schedule` included.
- **Chinese public holidays** are treated as off-peak all day, and the next-peak countdown skips the whole holiday block. The panel warns when the bundled holiday calendar no longer covers the current year.
- **Alerts:** `deepshift.notifyBeforePeakStarts` and `deepshift.notifyBeforeOffPeakStarts` (default 10 min each), once per transition. Diagnostics via `DeepShift: Diagnose Timezone`.

Works via standard `StatusBarItem`/`ThemeColor`/`MarkdownString`/`QuickPick` APIs — no webviews, no runtime deps.

## Screenshots

### Status bar

![DeepShift off-peak status](https://raw.githubusercontent.com/asim-ali-peerzada/deepshift/main/media/off.png)

![DeepShift peak status](https://raw.githubusercontent.com/asim-ali-peerzada/deepshift/main/media/peak.png)

### Planning panel

![DeepShift planning panel](https://raw.githubusercontent.com/asim-ali-peerzada/deepshift/main/media/planning.png)

### Tooltip

![DeepShift tooltip](https://raw.githubusercontent.com/asim-ali-peerzada/deepshift/main/media/tooltip.png)

## Schedule & pricing

Read from the [official DeepSeek rate card](https://api-docs.deepseek.com/quick_start/pricing/) on **2026-10-02**. USD per 1M tokens:

| Model | Version | input (cache hit) | input (cache miss) | output | concurrency |
|---|---|---|---|---|---|
| `deepseek-flash` | DeepSeek-V4.1-Flash | `$0.006` / `$0.003` | `$0.30` / `$0.15` | `$1.20` / `$0.60` | 2500 |
| `deepseek-v4-pro` | DeepSeek-V4-Pro-0813 | `$0.044` / `$0.022` | `$1.32` / `$0.66` | `$3.96` / `$1.98` | 500 |

Each cell is *peak / off-peak*. Note `deepseek-v4-flash` was **retired on 2026-09-10** and now silently routes to V4.1 Flash — use `deepseek-flash`.

> Prices move. The panel, tooltip and `DeepShift: Diagnose Timezone` all show the verification date and link to the official page; trust the page over this extension if they disagree.

## Install

Marketplace: `AsimAliPeerzada.deepshift` — or sideload the `.vsix`:
```sh
code --install-extension deepshift-0.3.0.vsix
windsurf --install-extension deepshift-0.3.0.vsix
```
Cursor/Windsurf users: also on Open VSX (`npx ovsx publish`).

## Develop

```sh
npm install
npm test      # tsc + schedule.test.ts (weekday, weekend, holiday, timezone-boundary, price card)
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
