import * as assert from 'node:assert';
import {
	statusLabel,
	statusTone,
	barText,
	barCountdown,
	pillLabel,
	alertText,
	adviceText,
	scheduleText,
	diagnosticsText,
	buildPanelItems,
	pricingRows,
} from './view-model';
import { getState, getUserTimeZone, offPeakReason } from './schedule';

const d = (iso: string) => new Date(iso);
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

// --- Peak: Mon 2026-08-24 02:00Z, first window ends 04:00Z ---
const peak = getState(d('2026-08-24T02:00:00Z'));
assert.strictEqual(peak.isOffPeak, false);
assert.strictEqual(statusLabel(peak), '🔴 DS PEAK · 2h 00m');
assert.strictEqual(statusTone(peak), 'danger');
assert.ok(barText(peak).includes('off-peak discount NOT applied'), 'peak bar must warn about the discount');
assert.ok(barText(peak).includes('2x rates'), 'peak bar must state the 2x rate');
assert.strictEqual(barCountdown(peak), 'ends in 2h 00m');
assert.strictEqual(pillLabel(peak), 'DS PEAK · 2h 00m');
assert.strictEqual(alertText(peak, false), 'DeepSeek off-peak pricing starts in 2h 00m — good time for bulk jobs.');
assert.ok(adviceText(peak, false).startsWith('PEAK'), 'peak advice must lead with PEAK');
assert.ok(adviceText(peak, false).includes('2h 00m'), 'peak advice must show when off-peak starts');

// --- Lunch gap: Mon 2026-08-24 05:00Z, off-peak until 06:00Z ---
const lunch = getState(d('2026-08-24T05:00:00Z'));
assert.strictEqual(lunch.isOffPeak, true);
assert.strictEqual(lunch.nextIsPeak, true);
assert.strictEqual(statusLabel(lunch), '🟢 DS OFF · 1h 00m');
assert.strictEqual(statusTone(lunch), 'success');
assert.strictEqual(pillLabel(lunch), 'DS OFF · 1h 00m');
assert.strictEqual(alertText(lunch, false), 'DeepSeek peak pricing starts in 1h 00m.');
assert.ok(adviceText(lunch, false).startsWith('OFF-PEAK'), 'off-peak advice must lead with OFF-PEAK');
assert.ok(barText(lunch).includes('off-peak pricing'), 'off-peak bar text must say off-peak');

// --- Weekend: Sat 2026-08-29 02:00Z, next peak Mon 01:00Z ---
const weekend = getState(d('2026-08-29T02:00:00Z'));
assert.strictEqual(offPeakReason(weekend), 'weekend');
assert.strictEqual(statusLabel(weekend), '🟢 DS OFF · weekend · 1d 23h');
assert.strictEqual(pillLabel(weekend), 'DS OFF · weekend · 1d 23h');
assert.ok(
	scheduleText(weekend, d('2026-08-29T02:00:00Z')).includes('Weekend: all day off-peak'),
	'weekend schedule must say all day off-peak'
);

// --- Chinese holiday: Thu 2026-10-01 02:00Z would be peak without the holiday rule ---
const holiday = getState(d('2026-10-01T02:00:00Z'));
assert.strictEqual(holiday.isHoliday, true);
assert.strictEqual(offPeakReason(holiday), 'China holiday');
assert.strictEqual(statusLabel(holiday), '🟢 DS OFF · China holiday · 6d 23h');
assert.ok(
	scheduleText(holiday, d('2026-10-01T02:00:00Z')).includes('Chinese public holiday: all day off-peak'),
	'holiday reason must be surfaced in the schedule text'
);

// --- Weekday schedule is rendered in the user's timezone from data ---
const weekdaySchedule = scheduleText(peak, d('2026-08-24T02:00:00Z'));
assert.ok(
	weekdaySchedule.startsWith(`DeepSeek — ${getUserTimeZone()}`),
	'schedule must be headed by the user timezone'
);
assert.ok(weekdaySchedule.includes('Peak'), 'weekday schedule must list peak windows');
assert.ok(weekdaySchedule.includes('Other hours: Off-peak'), 'weekday schedule must list off-peak hours');

// --- Panel rows: state, Next / Then, best window, today's schedule, advice ---
const panel = buildPanelItems(peak, d('2026-08-24T02:00:00Z'));
for (const id of ['state', 'next', 'then', 'best-window', 'schedule-header', 'run-now', 'pricing-header']) {
	assert.ok(ids(panel).includes(id), `panel must contain the "${id}" row`);
}
assert.strictEqual(new Set(ids(panel)).size, ids(panel).length, 'row ids must be unique');
assert.strictEqual(panel[0].label, '🔴 PEAK PRICING');
assert.strictEqual(panel[0].tone, 'danger');
const best = panel.find((r) => r.id === 'best-window')!;
assert.ok(best.detail!.includes('2h 00m'), 'peak best window is the 04:00Z-06:00Z gap');
assert.ok(adviceText(peak, false).startsWith('PEAK'), 'panel must carry the run-now advice');
assert.ok(
	ids(panel).includes('copy-status') && ids(panel).includes('copy-schedule'),
	'panel must carry the copy actions'
);

// Holiday panel renders the all-day off-peak row, not fake peak windows.
const holidayPanel = buildPanelItems(holiday, d('2026-10-01T02:00:00Z'));
assert.ok(
	holidayPanel.some((r) => r.detail === 'All day (Chinese public holiday)'),
	'holiday panel must show an all-day off-peak row'
);
assert.ok(!ids(holidayPanel).some((id) => id.startsWith('today-peak-')), 'no peak windows on a holiday');

// --- Pricing rows: the corrected rate card, not the 0.2.0 transposition ---
const pricing = pricingRows(d('2026-08-24T02:00:00Z'));
const pricingText = pricing.map((r) => `${r.label} ${r.detail ?? ''}`).join('\n');
assert.ok(pricingText.includes('deepseek-flash'), 'flash must be listed');
assert.ok(pricingText.includes('deepseek-v4-pro'), 'pro must be listed');
assert.ok(pricingText.includes('$1.20') && pricingText.includes('$0.60'), 'flash output must render');
assert.ok(pricingText.includes('$3.96') && pricingText.includes('$1.98'), 'pro output must render');
assert.ok(!/peak \$1\.32/.test(pricingText), 'flash output must never regress to $1.32');
assert.ok(pricingText.includes('09:00–12:00 & 14:00–18:00'), 'peak windows must render from data');
assert.ok(ids(pricing).includes('note'), 'pricing must carry the schedule note');
assert.ok(!ids(pricing).includes('stale-calendar'), '2026 is covered, no stale-calendar warning');

// Outside the bundled coverage (2027) the panel must warn.
assert.ok(ids(pricingRows(d('2029-01-15T00:00:00Z'))).includes('stale-calendar'), 'stale calendar must warn');

// --- Diagnostics: every clock, the coverage and the verification date ---
const diagnostics = diagnosticsText(d('2026-10-01T02:00:00Z'));
for (const needle of [
	'System timezone:',
	'Local time:',
	'Beijing: 10:00',
	'UTC: 02:00',
	'Holiday calendar covers: 2026-2027',
	'Prices verified: 2026-10-02',
	'api-docs.deepseek.com',
]) {
	assert.ok(diagnostics.includes(needle), `diagnostics must include "${needle}"`);
}

// --- The shared panel keeps the pricing and schedule rows after the state rows ---
assert.ok(ids(panel).includes('pricing-page'), 'panel must link the official pricing page');
assert.ok(ids(panel).includes('schedule'), 'panel must carry the schedule row');
assert.ok(
	panel.find((r) => r.id === 'schedule')!.detail!.includes('09:00–12:00 & 14:00–18:00'),
	'schedule row must render from data'
);

console.log('all view-model tests passed');
