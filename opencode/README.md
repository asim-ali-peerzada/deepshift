# DeepShift for OpenCode v2

DeepSeek peak/off-peak pricing indicator for [OpenCode v2](https://opencode.ai/v2/docs/) Desktop. It
uses the same pricing, schedule and Chinese-holiday data as the VS Code extension: `src/schedule.ts`
and the shared presentation in `src/view-model.ts` are the single source of truth for both products.

Peak is **09:00–12:00 & 14:00–18:00 Beijing** (`01:00–04:00 & 06:00–10:00 UTC`), Monday–Friday.
Everything else — **including weekends and Chinese public holidays** — is off-peak at **50% off**.

## Requirements

- OpenCode v2 (Desktop). This plugin uses the v2 GUI plugin API and the v2 `opencode.json`
  configuration.
- Node.js 20+ to build the bundle.

## Install (local, experimental UI)

The GUI half is an experimental export (`./gui-experimental`) and the package is installed from disk,
not from npm. Build the generated bundle first (it is not committed), then add the plugin to your
global or project `opencode.json`. From the repository root:

```sh
npm install
npm run build:opencode
```

Point the `package` entry at the absolute path of this `opencode` folder. Use the path that matches
your machine; on Windows, forward slashes work well:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/absolute/path/to/deepshift/opencode",
      "options": {
        "notifyBeforePeakStarts": 10,
        "notifyBeforeOffPeakStarts": 10,
        "always": false
      }
    }
  ]
}
```

Restart OpenCode Desktop afterwards. If the plugin appears under Settings → Extensions with
`features.server` but no GUI contribution, restart the app once more — a freshly added local plugin
can register its server half before its GUI half is detected.

## What you see

- **Red bar above the toasts** (`window.bottom`) while peak rates are in effect:
  `DeepSeek peak pricing · off-peak discount NOT applied · 2x rates · ends in 2h 00m`.
  It disappears outside peak windows, on weekends and on Chinese public holidays. Hover it for the
  peak windows, the resume time and the official pricing link. Set `always: true` to show the bar even
  when the selected model is not a DeepSeek one.
- **Composer pill** with a live countdown: red `DS PEAK · 2h 00m` during peak, green
  `DS OFF · 2h 00m` off-peak (`DS OFF · weekend · …` / `DS OFF · China holiday · …` when that is why).
  Click it for Next / Then transitions, the best off-peak window, today's schedule in your timezone,
  the per-model rate card, and actions to copy the status, copy today's schedule or open the pricing
  page.
- **Commands** in the palette and as `/deepshift` in the composer:
  - `/deepshift` — current status, the advice for this phase, today's schedule and the pricing link.
  - `DeepShift: Copy status`, `DeepShift: Copy today's schedule`.
  - `DeepShift: Diagnose timezone` — local, Beijing and UTC clocks, schedule timezone.
- **Alerts** once per transition, `notifyBeforePeakStarts` / `notifyBeforeOffPeakStarts` minutes before
  it happens (default 10, `0` disables). Toasts are mirrored to system notifications when the host
  exposes `attention.notify`.

## Options

| Option | Default | Notes |
|---|---|---|
| `notifyBeforePeakStarts` | `10` | minutes before peak starts, `0` disables |
| `notifyBeforeOffPeakStarts` | `10` | minutes before off-peak starts, `0` disables |
| `always` | `false` | show the peak bar even when no DeepSeek model is selected |

## Develop

`gui.cjs` is a generated single-file CommonJS bundle and is gitignored. Rebuild it with
`npm run build:opencode` from the repository root after editing `gui.cts`, `src/view-model.ts` or
`src/schedule.ts`. The build uses the project's existing `typescript` dependency; there is no bundler
dependency to install.

```sh
npm install
npm test               # tsc + schedule + shared view-model tests
npm run build:opencode # TypeScript bundle: opencode/gui.cts -> opencode/gui.cjs
```
