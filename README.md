# DeepShift

Status bar countdown to DeepSeek API off-peak hours (00:30–08:30 Beijing / 16:30–00:30 UTC).

- Green-free status bar item: shows remaining off-peak time, or peak state with a countdown to off-peak (red background during peak).
- Hover tooltip: transition time in your local timezone + Beijing time, and the current pricing multiplier.
- Optional notification N minutes before off-peak ends (`deepshift.warnBeforePeakEnds`, default 10).

Works in VS Code and forks (Cursor, Windsurf) — standard `StatusBarItem`/`ThemeColor` APIs only.

## Develop

```sh
npm install
npm run test      # compile + boundary-math self-check
npm run watch
# F5 in VS Code to launch an Extension Development Host
```

## Package & publish

```sh
npx vsce package
npx ovsx publish   # Open VSX — where Cursor/Windsurf users get extensions
```
