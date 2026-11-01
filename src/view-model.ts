import {
	deepSeekV4,
	formatCountdown,
	formatCountdownSec,
	fmtTime,
	getState,
	getTodaySchedule,
	getUserTimeZone,
	holidayCoverageYears,
	offPeakReason,
	tzInfo,
	windowText,
} from './schedule';
import type { TimeState } from './schedule';

/**
 * UI-agnostic view model shared by the VS Code extension and the OpenCode
 * adapters. Nothing here imports `vscode` or DOM APIs: each adapter maps the
 * plain strings and rows below to its own UI.
 *
 * All pricing, schedule and holiday data comes from `schedule.ts`. Do not add
 * copies of that data here.
 */

export const LBL_COPY_STATUS = '📋 Copy current status';
export const LBL_COPY_SCHEDULE = "📋 Copy today's schedule";
export const LBL_RUN_NOW = '💡 Should I run now?';

export type PanelAction = 'copy-status' | 'copy-schedule' | 'run-now' | 'open-pricing';

export interface PanelRow {
	readonly id: string;
	readonly label: string;
	readonly detail?: string;
	readonly description?: string;
	readonly separator?: true;
	readonly action?: PanelAction;
	readonly icon?:
		| 'warning'
		| 'circle-check'
		| 'circle-exclamation'
		| 'models'
		| 'square-arrow-top-right'
		| 'copy';
	readonly tone?: 'success' | 'warning' | 'danger';
}

/**
 * Status text. `seconds` gives the ticking VS Code status bar; the OpenCode
 * pill and commands use the minute-granularity `statusLabel` below.
 */
export function statusText(s: TimeState, seconds = true): string {
	const cd = seconds ? formatCountdownSec(s.secondsRemaining) : formatCountdown(s.minutesRemaining);
	const why = offPeakReason(s);
	if (why) return `🟢 DS OFF · ${why} · ${cd}`;
	if (s.isOffPeak) return `🟢 DS OFF · ${cd}`;
	return `🔴 DS PEAK · ${cd}`;
}

/** Minute-granularity status, for the OpenCode pill and toasts. */
export function statusLabel(s: TimeState): string {
	return statusText(s, false);
}

export function statusTone(s: TimeState): 'danger' | 'success' {
	return s.isOffPeak ? 'success' : 'danger';
}

/** Full-width bar text. The bar itself is only shown during peak. */
export function barText(s: TimeState): string {
	return s.isOffPeak
		? 'DeepSeek off-peak pricing · 50% discount applied'
		: 'DeepSeek peak pricing · off-peak discount NOT applied · 2x rates';
}

/** "ends in 2h 00m" — the time left in the current pricing phase. */
export function barCountdown(s: TimeState): string {
	return `ends in ${formatCountdown(s.minutesRemaining)}`;
}

/** "DS PEAK · 2h 00m" / "DS OFF · China holiday · 6d 23h" */
export function pillLabel(s: TimeState): string {
	const cd = formatCountdown(s.minutesRemaining);
	const why = offPeakReason(s);
	return s.isOffPeak ? `DS OFF${why ? ` · ${why}` : ''} · ${cd}` : `DS PEAK · ${cd}`;
}

/** Toast text for the pre-transition warning. */
export function alertText(s: TimeState, seconds = true): string {
	const cd = seconds ? formatCountdownSec(s.secondsRemaining) : formatCountdown(s.minutesRemaining);
	return s.nextIsPeak
		? `DeepSeek peak pricing starts in ${cd}.`
		: `DeepSeek off-peak pricing starts in ${cd} — good time for bulk jobs.`;
}

/** Rule-based advice for the current phase. */
export function adviceText(s: TimeState, seconds = true): string {
	if (s.isOffPeak) return 'OFF-PEAK — good time for large AI workloads. Run batch jobs now.';
	const cd = seconds ? formatCountdownSec(s.secondsRemaining) : formatCountdown(s.minutesRemaining);
	return `PEAK — large/batch workloads are cheaper if delayed. Off-peak starts in ${cd}.`;
}

/**
 * Today's peak windows in the user's timezone. `s` decides whether the day is
 * free (so the text can never disagree with the state), `now` picks the day.
 */
export function scheduleText(s: TimeState = getState(), now: Date = new Date()): string {
	const day = getTodaySchedule(now);
	const head = `DeepSeek — ${day.tz}`;
	if (s.isHoliday) return `${head}\nChinese public holiday: all day off-peak`;
	if (s.isWeekend) return `${head}\nWeekend: all day off-peak`;
	const lines = day.windows.map((w) => `${w.start}–${w.end} Peak`);
	lines.push('Other hours: Off-peak');
	return `${head}\n${lines.join('\n')}`;
}

/** Local/Beijing/UTC clocks, holiday coverage and the verification date. */
export function diagnosticsText(now: Date = new Date()): string {
	const userTz = getUserTimeZone();
	const user = tzInfo(userTz);
	const bj = tzInfo('Asia/Shanghai');
	const years = holidayCoverageYears();
	const stale = years.includes(now.getFullYear()) ? '' : '  (STALE — no data for this year)';
	return [
		`System timezone: ${userTz} ${user.flag} ${user.country}`,
		`Local time: ${fmtTime(now.getTime())} ${user.flag}`,
		`Beijing: ${fmtTime(now.getTime(), 'Asia/Shanghai')} ${bj.flag} ${bj.country}`,
		`UTC: ${now.toISOString().slice(11, 16)}`,
		`Schedule timezone: ${deepSeekV4.timezone} ${bj.flag} ${bj.country}`,
		`Weekend evaluated in: ${deepSeekV4.timezone} ${bj.flag}`,
		`Weekend off-peak: ${deepSeekV4.weekendOffPeak}`,
		`Holiday off-peak: ${deepSeekV4.holidayOffPeak}`,
		`Holiday calendar covers: ${years[0]}-${years[years.length - 1]}${stale}`,
		`Peak windows (Beijing): ${deepSeekV4.peakWindows.map((w) => `${w.start}-${w.end}`).join(', ')}`,
		`Prices verified: ${deepSeekV4.verifiedOn}`,
		`Source: ${deepSeekV4.sourceUrl}`,
	].join('\n');
}

function shortHour(epoch: number): string {
	const d = new Date(epoch);
	const h = d.getHours();
	const m = d.getMinutes();
	return m === 0 ? String(h).padStart(2, '0') : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function dayTag(at: number, now: Date): string {
	const today = now.toDateString();
	const e = new Date(at).toDateString();
	if (e === today) return 'today';
	const tomorrow = new Date(now.getTime() + 86400000).toDateString();
	if (e === tomorrow) return 'tomorrow';
	return new Date(at).toLocaleDateString([], { weekday: 'short' });
}

/** Per-model peak / off-peak rate card, the schedule note and the calendar warning. */
export function pricingRows(now: Date = new Date()): PanelRow[] {
	const rows: PanelRow[] = [];
	for (const m of deepSeekV4.models) {
		rows.push({
			id: `model:${m.id}`,
			label: m.id,
			description: m.version,
			icon: 'models',
		});
		rows.push({
			id: `model:${m.id}:hit`,
			label: '  input · cache hit',
			detail: `Peak ${m.cacheHit.peak} · off-peak ${m.cacheHit.offPeak}`,
		});
		rows.push({
			id: `model:${m.id}:miss`,
			label: '  input · cache miss',
			detail: `Peak ${m.cacheMiss.peak} · off-peak ${m.cacheMiss.offPeak}`,
		});
		rows.push({
			id: `model:${m.id}:out`,
			label: '  output',
			detail: `Peak ${m.output.peak} · off-peak ${m.output.offPeak}`,
		});
		rows.push({
			id: `model:${m.id}:concurrency`,
			label: '  concurrency limit',
			detail: `${m.concurrency} in-flight`,
		});
	}
	rows.push({ id: 'note', label: '  note', detail: deepSeekV4.note });

	const years = holidayCoverageYears();
	if (!years.includes(now.getFullYear())) {
		rows.push({
			id: 'stale-calendar',
			label: '⚠ Holiday calendar out of date',
			detail: `Covers ${years[0]}–${years[years.length - 1]}. Chinese holidays are NOT applied for ${now.getFullYear()} — verify against the official page before trusting peak days.`,
			icon: 'warning',
			tone: 'warning',
		});
	}
	rows.push({
		id: 'schedule',
		label: 'Schedule',
		detail: `DeepSeek · 🇨🇳 China (${deepSeekV4.timezone}) · ${windowText()}`,
	});
	return rows;
}

/**
 * Full panel: current state, Next / Then, best window, today's schedule,
 * run-now advice, the rate card, diagnostics links and the copy actions.
 * Both adapters render this same list; VS Code maps it to QuickPick items and
 * OpenCode maps it to composer-pill rows.
 */
export function buildPanelItems(s: TimeState, now: Date = new Date()): PanelRow[] {
	const cd = formatCountdownSec(s.secondsRemaining);
	const userTz = getUserTimeZone();
	const user = tzInfo(userTz);
	const rows: PanelRow[] = [
		{
			id: 'state',
			label: s.isOffPeak ? '🟢 OFF-PEAK' : '🔴 PEAK PRICING',
			detail: `${s.isOffPeak ? 'Ends' : 'Peak ends'} in ${cd} · ${fmtTime(
				s.transitionAt
			)} ${user.flag} ${user.country} · ${fmtTime(s.transitionAt, 'Asia/Shanghai')} 🇨🇳 China`,
			icon: s.isOffPeak ? 'circle-check' : 'warning',
			tone: statusTone(s),
		},
	];

	s.nextTransitions.slice(0, 2).forEach((t, index) => {
		const to = t.to === 'peak' ? '🔴 Peak' : '🟢 Off-peak';
		rows.push({
			id: index === 0 ? 'next' : 'then',
			label:
				index === 0
					? `Next   ${to} · ${fmtTime(t.at)} · ${formatCountdownSec(
							Math.max(0, Math.ceil((t.at - now.getTime()) / 1000))
						)}`
					: `Then   ${to} · ${fmtTime(t.at)} ${dayTag(t.at, now)}`,
		});
	});

	if (s.bestWindow && s.bestWindow.end > s.bestWindow.start) {
		rows.push({
			id: 'best-window',
			label: '💡 Best off-peak window',
			detail: `${fmtTime(s.bestWindow.start)} ${dayTag(s.bestWindow.start, now)} → ${fmtTime(
				s.bestWindow.end
			)} ${dayTag(s.bestWindow.end, now)} · ${formatCountdown(
				Math.round((s.bestWindow.end - s.bestWindow.start) / 60000)
			)}`,
		});
	}

	rows.push({
		id: 'schedule-header',
		label: `──── Today's schedule ${user.flag} ${user.country} (${userTz}) ────`,
		separator: true,
	});

	const day = getTodaySchedule(now);
	if (day.isWeekend) {
		rows.push({ id: 'today', label: '🟢 Off-peak', detail: 'All day (weekend rule)' });
	} else if (day.isHoliday) {
		rows.push({ id: 'today', label: '🟢 Off-peak', detail: 'All day (Chinese public holiday)' });
	} else {
		day.windows.forEach((w, index) => {
			rows.push({
				id: `today-peak-${index}`,
				label: `${shortHour(w.startEpoch)}–${shortHour(w.endEpoch)} 🔴 Peak`,
			});
		});
		rows.push({ id: 'today-rest', label: 'Other hours 🟢 Off-peak' });
	}

	rows.push({
		id: 'run-now',
		label: LBL_RUN_NOW,
		detail: 'Rule-based advice, no input needed',
		action: 'run-now',
		icon: s.isOffPeak ? 'circle-check' : 'circle-exclamation',
		tone: statusTone(s),
	});

	rows.push({ id: 'pricing-header', label: '──── Pricing ────', separator: true });
	rows.push(...pricingRows(now));

	rows.push({
		id: 'pricing-page',
		label: '📖 Official pricing page',
		detail: `Verified ${deepSeekV4.verifiedOn} · ${deepSeekV4.sourceUrl}`,
		action: 'open-pricing',
		icon: 'square-arrow-top-right',
	});
	rows.push({ id: 'copy-status', label: LBL_COPY_STATUS, action: 'copy-status', icon: 'copy' });
	rows.push({ id: 'copy-schedule', label: LBL_COPY_SCHEDULE, action: 'copy-schedule', icon: 'copy' });
	return rows;
}
