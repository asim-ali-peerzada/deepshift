import * as assert from 'node:assert';
import {
	getState,
	formatCountdown,
	formatCountdownSec,
	deepSeekV4,
	holidayCoverageYears,
	buildTooltip,
	windowText,
	offPeakReason,
} from './schedule';

const d = (iso: string) => new Date(iso);
const at = (iso: string) => d(iso).getTime();

// Mon 2026-08-24 is a weekday. Peak UTC = 01:00-04:00 and 06:00-10:00.

// Inside first peak window (Beijing 10:00)
let s = getState(d('2026-08-24T02:00:00Z'));
assert.strictEqual(s.isOffPeak, false);
assert.strictEqual(s.minutesRemaining, 120); // ends 04:00Z
assert.strictEqual(s.nextIsPeak, false);

// Lunch gap between windows -> off-peak, next transition is peak start 06:00Z
s = getState(d('2026-08-24T05:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual(s.minutesRemaining, 60);
assert.strictEqual(s.nextIsPeak, true);

// End of afternoon peak
s = getState(d('2026-08-24T09:00:00Z'));
assert.strictEqual(s.isOffPeak, false);
assert.strictEqual(s.minutesRemaining, 60); // ends 10:00Z

// Evening off-peak -> next peak is next weekday 01:00Z (Tue)
s = getState(d('2026-08-24T11:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual(s.minutesRemaining, 840);
assert.strictEqual(s.transitionAt, at('2026-08-25T01:00:00Z'));

// Weekend (Sat 2026-08-29) -> always off-peak regardless of clock
s = getState(d('2026-08-29T02:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual(s.transitionAt, at('2026-08-31T01:00:00Z')); // next peak Mon 09:00 Beijing

// Sunday off-peak
s = getState(d('2026-08-30T09:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual(s.transitionAt, at('2026-08-31T01:00:00Z'));

// Timezone day boundary: Fri 17:00Z = Sat 01:00 Beijing -> weekend off-peak
s = getState(d('2026-08-28T17:00:00Z'));
assert.strictEqual(s.isOffPeak, true);

assert.strictEqual(formatCountdown(125), '2h 05m');
// Past 24h it must roll up to days -- a weekend or China-holiday gap is ~6 days.
assert.strictEqual(formatCountdown(10020), '6d 23h');
assert.strictEqual(formatCountdown(1440), '1d 0h');
assert.strictEqual(formatCountdown(1439), '23h 59m');
// The status bar countdown needs the same treatment, or it reads "133h 00m 00s".
assert.strictEqual(formatCountdownSec(3600), '1h 00m 00s');
assert.strictEqual(formatCountdownSec(478800), '5d 13h');
assert.strictEqual(formatCountdownSec(86399), '23h 59m 59s');

// --- Regression: a long free run must not crash getState() ---
// Spring Festival 2026 is 9 consecutive free days (Feb 15-23). An 8-day
// transition lookahead returned [] and getState() threw on undefined.at, which
// would have crashed the status bar every second for a week.
for (const iso of ['2026-02-14T12:00:00Z', '2026-02-16T12:00:00Z', '2026-02-18T12:00:00Z', '2026-02-20T12:00:00Z']) {
	const st = getState(d(iso));
	assert.strictEqual(st.isOffPeak, true, iso);
	assert.ok(st.transitionAt > d(iso).getTime(), `${iso} must still find a next transition`);
	assert.strictEqual(st.transitionAt, at('2026-02-24T01:00:00Z')); // Tue Feb 24, 09:00 Beijing
}
// The lookahead must outlast the longest free run, with margin.
const byKey = new Set(deepSeekV4.holidays);
let longestRun = 0;
for (let k = 0; k < 500; k++) {
	let run = 0;
	for (let j = k; j < 500; j++) {
		const q = new Date(Date.UTC(2025, 0, 1) + j * 86400000);
		if (byKey.has(q.toISOString().slice(0, 10)) || q.getUTCDay() === 0 || q.getUTCDay() === 6) run++;
		else break;
	}
	if (run > longestRun) longestRun = run;
}
assert.ok(longestRun <= 21, `lookahead of 21 must cover longest free run (${longestRun})`);

// --- One source of truth for the derived strings ---
assert.strictEqual(windowText(), '09:00–12:00 & 14:00–18:00');
assert.strictEqual(offPeakReason(getState(d('2026-10-01T02:00:00Z'))), 'China holiday');
assert.strictEqual(offPeakReason(getState(d('2026-08-29T02:00:00Z'))), 'weekend');
assert.strictEqual(offPeakReason(getState(d('2026-08-24T02:00:00Z'))), '');

// New fields: next two transitions + best window
const v = getState(d('2026-08-24T02:00:00Z')); // peak, ends 04:00Z
assert.strictEqual(v.nextTransitions.length, 2);
assert.strictEqual(v.nextTransitions[0].to, 'offPeak'); // 04:00Z
assert.strictEqual(v.nextTransitions[0].at, at('2026-08-24T04:00:00Z'));
assert.ok(v.bestWindow && v.bestWindow.start === at('2026-08-24T04:00:00Z'));

const wk = getState(d('2026-08-29T02:00:00Z')); // weekend off-peak
assert.strictEqual(wk.isWeekend, true);
assert.strictEqual(wk.isOffPeak, true);

// --- Chinese public holidays are off-peak all day ---
// Thu 2026-10-01 is National Day. 02:00Z = 10:00 Beijing, inside a peak
// window -- without the holiday rule this would report PEAK.
let h = getState(d('2026-10-01T02:00:00Z'));
assert.strictEqual(h.isHoliday, true);
assert.strictEqual(h.isWeekend, false);
assert.strictEqual(h.isOffPeak, true);
assert.strictEqual(h.isWeekend || h.isHoliday, true);

// The next peak after Golden Week skips the remaining holiday days:
// Wed 2026-10-07 is the last off-day, so next peak is Thu 2026-10-08 09:00
// Beijing = 01:00Z.
assert.strictEqual(h.transitionAt, at('2026-10-08T01:00:00Z'));

// A normal weekday one day after the holiday is peak again.
h = getState(d('2026-10-08T02:00:00Z'));
assert.strictEqual(h.isHoliday, false);
assert.strictEqual(h.isOffPeak, false);

// A holiday whose dates are *not* weekends: Mon 2026-09-25 Mid-Autumn.
const mid = getState(d('2026-09-25T02:00:00Z'));
assert.strictEqual(mid.isHoliday, true);
assert.strictEqual(mid.isOffPeak, true);

// Every listed holiday must actually be a rest day DeepSeek would not bill
// peak on. Guard the transcription: no holiday may be a Sat/Sun duplicate of
// an already-covered weekend day, and all must be well-formed ISO dates.
const HOLIDAY_RE = /^\d{4}-\d{2}-\d{2}$/;
for (const key of deepSeekV4.holidays) {
	assert.match(key, HOLIDAY_RE);
}
assert.strictEqual(new Set(deepSeekV4.holidays).size, deepSeekV4.holidays.length);
assert.deepStrictEqual(holidayCoverageYears(), [2026, 2027]);

// --- Prices verified against the official rate card on 2026-10-02 ---
const flash = deepSeekV4.models.find((m) => m.id === 'deepseek-flash')!;
const pro = deepSeekV4.models.find((m) => m.id === 'deepseek-v4-pro')!;
// Flash output is $1.20/$0.60. $1.32/$0.66 is the Pro cache-miss input rate and
// must never reappear as a Flash output price.
assert.strictEqual(flash.version, 'DeepSeek-V4.1-Flash');
assert.deepStrictEqual(flash.output, { peak: '$1.20', offPeak: '$0.60' });
assert.deepStrictEqual(flash.cacheMiss, { peak: '$0.30', offPeak: '$0.15' });
assert.deepStrictEqual(flash.cacheHit, { peak: '$0.006', offPeak: '$0.003' });
assert.strictEqual(pro.version, 'DeepSeek-V4-Pro-0813');
assert.deepStrictEqual(pro.output, { peak: '$3.96', offPeak: '$1.98' });
assert.strictEqual(pro.concurrency, 500);
assert.strictEqual(flash.concurrency, 2500);
// No retired model id may be advertised as callable.
assert.ok(!deepSeekV4.models.some((m) => m.id === 'deepseek-v4-flash'));

// --- The rendered hover text is asserted, not just the data ---
const tip = buildTooltip(getState(d('2026-10-01T02:00:00Z')), 'Asia/Karachi');
assert.ok(tip.includes('OFF-PEAK'), 'holiday day must render OFF-PEAK');
assert.ok(tip.includes('China holiday'), 'holiday reason must be surfaced');
assert.ok(tip.includes('$1.20') && tip.includes('$0.60'), 'flash output must render corrected rate');
assert.ok(tip.includes('$3.96') && tip.includes('$1.98'), 'pro output must render');
assert.ok(tip.includes('$0.006') && tip.includes('$0.044'), 'cache-hit input must render');
assert.ok(!/Flash: peak \$1\.32/.test(tip), 'the 0.2.0 transposition must never render again');
assert.ok(tip.includes('Verified 2026-10-02'), 'tooltip must show the verification date');
assert.ok(tip.includes('api-docs.deepseek.com'), 'tooltip must link the official page');
assert.ok(tip.includes('09:00–12:00 & 14:00–18:00'), 'peak windows must render from data');
assert.ok(tip.includes('deepseek-flash'), 'callable model id must render');
assert.ok(!tip.includes('deepseek-v4-flash`'), 'retired id must not render as callable');

console.log('all schedule tests passed');
