export interface ScheduleWindow {
	start: string; // "HH:MM" in provider tz
	end: string;
}

export interface PricePair {
	peak: string;
	offPeak: string;
}

export interface ModelPricing {
	/** API model id a user passes as `model`. */
	id: string;
	/** Model version actually served behind that id. */
	version: string;
	/** USD per 1M input tokens, cached prefix. */
	cacheHit: PricePair;
	/** USD per 1M input tokens, fresh prefix. */
	cacheMiss: PricePair;
	/** USD per 1M output tokens. */
	output: PricePair;
	/** Account-level concurrency limit; over this returns HTTP 429. */
	concurrency: number;
}

export interface PricingSchedule {
	timezone: string;
	weekendOffPeak: boolean;
	peakWindows: ScheduleWindow[];
	/** DeepSeek bills Chinese public holidays off-peak all day. */
	holidayOffPeak: boolean;
	/** "YYYY-MM-DD" rest days in provider tz. Only covers years present here. */
	holidays: string[];
	models: ModelPricing[];
	note: string;
	/** ISO date this data was last read from `sourceUrl`. */
	verifiedOn: string;
	sourceUrl: string;
}

// Peak hours are 01:00-04:00 and 06:00-10:00 UTC = 09:00-12:00 and 14:00-18:00
// Beijing, Monday-Friday, excluding Chinese public holidays. Off-peak = half of
// peak. Prices are USD per 1M tokens.
//
// Verified against https://api-docs.deepseek.com/quick_start/pricing/ on
// 2026-10-02. Flash output is $1.20 peak / $0.60 off-peak -- NOT $1.32/$0.66,
// which is the Pro cache-miss *input* rate (a transposition several news
// outlets repeated on 2026-08-13).
export const deepSeekV4: PricingSchedule = {
	timezone: 'Asia/Shanghai',
	weekendOffPeak: true,
	peakWindows: [
		{ start: '09:00', end: '12:00' },
		{ start: '14:00', end: '18:00' },
	],
	holidayOffPeak: true,
	holidays: [
		// 2026 -- State Council notice published 2025-11-04 (confirmed).
		'2026-01-01', '2026-01-02',
		'2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-23',
		'2026-04-06',
		'2026-05-01', '2026-05-04', '2026-05-05',
		'2026-06-19',
		'2026-09-25',
		'2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07',
		// 2027 -- PROVISIONAL, statutory dates only. The State Council publishes
		// the final schedule each Nov; the 调休 bridge days it adds are unknown
		// until then, so they are deliberately absent. That fails safe: we may
		// call a 调休 rest day "peak" (user waits, no loss) but never call a
		// normal workday "off-peak" (user would pay peak rates).
		// Re-verify and add the bridge days before Jan 2027.
		'2027-01-01',
		'2027-02-05', '2027-02-08',
		'2027-04-05',
		'2027-06-09',
		'2027-09-15',
		'2027-10-01',
	],
	models: [
		{
			id: 'deepseek-flash',
			version: 'DeepSeek-V4.1-Flash',
			cacheHit: { peak: '$0.006', offPeak: '$0.003' },
			cacheMiss: { peak: '$0.30', offPeak: '$0.15' },
			output: { peak: '$1.20', offPeak: '$0.60' },
			concurrency: 2500,
		},
		{
			id: 'deepseek-v4-pro',
			version: 'DeepSeek-V4-Pro-0813',
			cacheHit: { peak: '$0.044', offPeak: '$0.022' },
			cacheMiss: { peak: '$1.32', offPeak: '$0.66' },
			output: { peak: '$3.96', offPeak: '$1.98' },
			concurrency: 500,
		},
	],
	note: 'Off-peak = 50% of peak · USD per 1M tokens',
	verifiedOn: '2026-10-02',
	sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
};

export interface Transition {
	at: number;
	to: 'peak' | 'offPeak';
}

export interface TimeState {
	isOffPeak: boolean;
	isWeekend: boolean;
	/** Chinese public holiday, which DeepSeek bills off-peak all day. */
	isHoliday: boolean;
	/** Phase the next transition flips TO */
	nextIsPeak: boolean;
	minutesRemaining: number;
	secondsRemaining: number;
	/** Epoch ms of next peak/off-peak transition */
	transitionAt: number;
	/** Next two upcoming transitions (UI: "Next" / "Then") */
	nextTransitions: Transition[];
	/** Start/end epoch ms of the next off-peak block */
	bestWindow: { start: number; end: number } | null;
}

export interface DayWindow {
	start: string;
	end: string;
	startEpoch: number;
	endEpoch: number;
}

const MIN_PER_DAY = 1440;

// Lookahead for the transition scan. Must exceed the longest run of consecutive
// free days, or getTransitions() returns [] and getState() dereferences
// undefined. Spring Festival 2026 runs 9 consecutive free days (Feb 15-23, of
// which Feb 15/21/22 are weekends anyway), which already overruns the old
// 8-day window. 21 is ~2x the longest Chinese holiday on record.
const LOOKAHEAD_DAYS = 21;

function parseMin(s: string): number {
	const [h, m] = s.split(':').map(Number);
	return h * 60 + m;
}

function isWeekend(dow: string): boolean {
	return dow === 'Sat' || dow === 'Sun';
}

function tzOffsetMinutes(tz: string, date: Date): number {
	const p = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(date);
	const g = (t: string) => p.find((x) => x.type === t)!.value;
	let h = parseInt(g('hour'), 10);
	if (h === 24) h = 0;
	const asUTC = Date.UTC(
		+g('year'),
		+g('month') - 1,
		+g('day'),
		h,
		+g('minute'),
		+g('second')
	);
	return Math.round((asUTC - date.getTime()) / 60000);
}

/** Epoch ms for a wall-clock time in tz (DST handled by probe offset). */
function wallToEpoch(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
	const ms = Date.UTC(y, mo - 1, d, h, mi);
	return ms - tzOffsetMinutes(tz, new Date(ms)) * 60000;
}

type Parts = { dow: string; totalMin: number; y: number; mo: number; d: number; key: string };

function providerParts(date: Date, tz: string): Parts {
	const p = new Intl.DateTimeFormat('en-GB', {
		timeZone: tz,
		hour12: false,
		weekday: 'short',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	}).formatToParts(date);
	const g = (t: string) => p.find((x) => x.type === t)!.value;
	let h = parseInt(g('hour'), 10);
	if (h === 24) h = 0;
	const mo = +g('month');
	const d = +g('day');
	return {
		dow: g('weekday'),
		totalMin: h * 60 + parseInt(g('minute'), 10),
		y: +g('year'),
		mo,
		d,
		key: `${g('year')}-${g('month')}-${g('day')}`,
	};
}

function isHoliday(key: string, sch: PricingSchedule): boolean {
	return sch.holidayOffPeak && sch.holidays.includes(key);
}

function isFree(parts: Parts, sch: PricingSchedule): boolean {
	return (
		(sch.weekendOffPeak && isWeekend(parts.dow)) || isHoliday(parts.key, sch)
	);
}

export function fmtTime(at: number, tz?: string): string {
	return new Date(at).toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
		...(tz && { timeZone: tz }),
	});
}

function phaseAt(parts: Parts, sch: PricingSchedule): 'peak' | 'offPeak' {
	if (isFree(parts, sch)) return 'offPeak';
	for (const w of sch.peakWindows) {
		const s = parseMin(w.start);
		const e = parseMin(w.end);
		if (parts.totalMin >= s && parts.totalMin < e) return 'peak';
	}
	return 'offPeak';
}

/** Sorted future peak/off-peak edges for the next LOOKAHEAD_DAYS (provider tz). */
export function getTransitions(now: Date = new Date(), sch: PricingSchedule = deepSeekV4, limit = 6): Transition[] {
	const candidates: Transition[] = [];
	for (let k = 0; k < LOOKAHEAD_DAYS; k++) {
		const p = providerParts(new Date(now.getTime() + k * MIN_PER_DAY * 60000), sch.timezone);
		if (isFree(p, sch)) continue;
		for (const w of sch.peakWindows) {
			const s = parseMin(w.start);
			const e = parseMin(w.end);
			candidates.push({ at: wallToEpoch(p.y, p.mo, p.d, Math.floor(s / 60), s % 60, sch.timezone), to: 'peak' });
			candidates.push({ at: wallToEpoch(p.y, p.mo, p.d, Math.floor(e / 60), e % 60, sch.timezone), to: 'offPeak' });
		}
	}
	return candidates
		.filter((c) => c.at > now.getTime())
		.sort((a, b) => a.at - b.at)
		.slice(0, limit);
}

export function getState(now: Date = new Date(), sch: PricingSchedule = deepSeekV4): TimeState {
	const parts = providerParts(now, sch.timezone);
	const current = phaseAt(parts, sch);
	const transitions = getTransitions(now, sch, 6);
	const next = transitions[0];

	const remainingSec = Math.max(0, (next.at - now.getTime()) / 1000);

	let bestWindow: { start: number; end: number } | null = null;
	if (current === 'offPeak') {
		const nextPeak = transitions.find((t) => t.to === 'peak');
		bestWindow = { start: now.getTime(), end: nextPeak ? nextPeak.at : now.getTime() };
	} else {
		const nextOff = transitions.find((t) => t.to === 'offPeak');
		if (nextOff) {
			const after = transitions.find((t) => t.at > nextOff.at && t.to === 'peak');
			bestWindow = { start: nextOff.at, end: after ? after.at : nextOff.at };
		}
	}

	return {
		isOffPeak: current === 'offPeak',
		isWeekend: sch.weekendOffPeak && isWeekend(parts.dow),
		isHoliday: isHoliday(parts.key, sch),
		nextIsPeak: next.to === 'peak',
		minutesRemaining: Math.ceil(remainingSec / 60),
		secondsRemaining: Math.max(0, Math.ceil(remainingSec)),
		transitionAt: next.at,
		nextTransitions: transitions.slice(0, 2),
		bestWindow,
	};
}

export function getUserTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	} catch {
		return 'UTC';
	}
}

export function tzInfo(tz: string): { flag: string; country: string } {
	const map: Record<string, { flag: string; country: string }> = {
		'Asia/Shanghai': { flag: '🇨🇳', country: 'China' },
		'Asia/Karachi': { flag: '🇵🇰', country: 'Pakistan' },
		'Asia/Kolkata': { flag: '🇮🇳', country: 'India' },
		'Asia/Dubai': { flag: '🇦🇪', country: 'UAE' },
		'Asia/Tokyo': { flag: '🇯🇵', country: 'Japan' },
		'Asia/Seoul': { flag: '🇰🇷', country: 'South Korea' },
		'Asia/Singapore': { flag: '🇸🇬', country: 'Singapore' },
		'Europe/London': { flag: '🇬🇧', country: 'UK' },
		'Europe/Berlin': { flag: '🇩🇪', country: 'Germany' },
		'Europe/Paris': { flag: '🇫🇷', country: 'France' },
		'America/New_York': { flag: '🇺🇸', country: 'USA' },
		'America/Los_Angeles': { flag: '🇺🇸', country: 'USA' },
		'America/Chicago': { flag: '🇺🇸', country: 'USA' },
		'Australia/Sydney': { flag: '🇦🇺', country: 'Australia' },
	};
	return map[tz] || { flag: '🌍', country: tz };
}

export function getTodaySchedule(now: Date = new Date(), sch: PricingSchedule = deepSeekV4): {
	isWeekend: boolean;
	isHoliday: boolean;
	windows: DayWindow[];
	tz: string;
} {
	const tz = getUserTimeZone();
	const p = providerParts(now, sch.timezone);
	const windows: DayWindow[] = sch.peakWindows.map((w) => {
		const s = parseMin(w.start);
		const e = parseMin(w.end);
		const startEpoch = wallToEpoch(p.y, p.mo, p.d, Math.floor(s / 60), s % 60, sch.timezone);
		const endEpoch = wallToEpoch(p.y, p.mo, p.d, Math.floor(e / 60), e % 60, sch.timezone);
		return { start: fmtTime(startEpoch, tz), end: fmtTime(endEpoch, tz), startEpoch, endEpoch };
	});
	return {
		isWeekend: sch.weekendOffPeak && isWeekend(p.dow),
		isHoliday: isHoliday(p.key, sch),
		windows,
		tz,
	};
}

/** Beijing years the holiday list covers, ascending. */
export function holidayCoverageYears(sch: PricingSchedule = deepSeekV4): number[] {
	const years = new Set(sch.holidays.map((k) => parseInt(k.slice(0, 4), 10)));
	return [...years].sort((a, b) => a - b);
}


/** "09:00–12:00 & 14:00–18:00" — derived from data, never a hand-written literal. */
export function windowText(sch: PricingSchedule = deepSeekV4): string {
	return sch.peakWindows.map((w) => `${w.start}–${w.end}`).join(' & ');
}

/** Why today is off-peak, or "" on a normal day. Single source for both the
 *  status bar and the tooltip so the two can never disagree. */
export function offPeakReason(s: TimeState): string {
	if (s.isHoliday) return 'China holiday';
	if (s.isWeekend) return 'weekend';
	return '';
}

export function buildTooltip(
	s: TimeState,
	userTz: string,
	sch: PricingSchedule = deepSeekV4
): string {
	const user = tzInfo(userTz);
	const why = offPeakReason(s);
	const prices = sch.models
		.map(
			(m) =>
				`\`${m.id}\` · ${m.version}\n` +
				`in hit ${m.cacheHit.peak} / ${m.cacheHit.offPeak} · in miss ${m.cacheMiss.peak} / ${m.cacheMiss.offPeak}\n` +
				`out **${m.output.peak}** / **${m.output.offPeak}** · ${m.concurrency} concurrent`
		)
		.join('\n\n');
	return (
		`**DeepSeek**\n\n` +
		`${s.isOffPeak ? '🟢 OFF-PEAK' : '🔴 PEAK PRICING'}${why ? ` (${why})` : ''}\n\n` +
		`Window ends in **${formatCountdown(s.minutesRemaining)}**\n\n` +
		`${user.flag} Local: **${fmtTime(s.transitionAt)}** ${user.country} (${userTz})\n` +
		`🇨🇳 Beijing: **${fmtTime(s.transitionAt, 'Asia/Shanghai')}** China\n\n` +
		`**${sch.note}**\n\n` +
		`${prices}\n\n` +
		`Weekends & Chinese public holidays: always off-peak\n\n` +
		`Peak (Beijing ${windowText(sch)}) 🇨🇳\n\n` +
		`Verified ${sch.verifiedOn} · [official pricing page](${sch.sourceUrl})`
	);
}

/** Hours/minutes, rolling up to days past 24h — a weekend or holiday gap
 *  runs to ~6 days and "167h 00m" is not a countdown anyone can read. */
export function formatCountdown(minutes: number): string {
	const d = Math.floor(minutes / 1440);
	const h = Math.floor((minutes % 1440) / 60);
	const m = minutes % 60;
	return d > 0 ? `${d}d ${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Seconds countdown for the status bar. Rolls up to days past 24h: a weekend
 *  or China-holiday gap runs to ~6 days and "133h 00m 00s" is not a countdown. */
export function formatCountdownSec(totalSeconds: number): string {
	const d = Math.floor(totalSeconds / 86400);
	const h = Math.floor((totalSeconds % 86400) / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	if (d > 0) return `${d}d ${String(h).padStart(2, '0')}h`;
	return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}