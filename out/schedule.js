"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepSeekV4 = void 0;
exports.getTransitions = getTransitions;
exports.getState = getState;
exports.getUserTimeZone = getUserTimeZone;
exports.tzInfo = tzInfo;
exports.getTodaySchedule = getTodaySchedule;
exports.formatCountdown = formatCountdown;
exports.formatCountdownSec = formatCountdownSec;
// DeepSeek V4 (effective 2026-08-16/17): two peak windows Beijing business hours,
// off-peak = half of peak; weekends always off-peak. Output rates per 1M tokens (USD,
// via TechTimes citing DeepSeek docs); off-peak = 50% of peak.
exports.deepSeekV4 = {
    timezone: 'Asia/Shanghai',
    weekendOffPeak: true,
    peakWindows: [
        { start: '09:00', end: '12:00' },
        { start: '14:00', end: '18:00' },
    ],
    prices: {
        flash: { peak: '$1.32', offPeak: '$0.66' },
        pro: { peak: '$3.96', offPeak: '$1.98' },
        note: 'Off-peak = 50% of peak',
    },
};
const MIN_PER_DAY = 1440;
function parseMin(s) {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
}
function isWeekend(dow) {
    return dow === 'Sat' || dow === 'Sun';
}
function tzOffsetMinutes(tz, date) {
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
    const g = (t) => p.find((x) => x.type === t).value;
    let h = parseInt(g('hour'), 10);
    if (h === 24)
        h = 0;
    const asUTC = Date.UTC(+g('year'), +g('month') - 1, +g('day'), h, +g('minute'), +g('second'));
    return Math.round((asUTC - date.getTime()) / 60000);
}
/** Epoch ms for a wall-clock time in tz (DST handled by probe offset). */
function wallToEpoch(y, mo, d, h, mi, tz) {
    const ms = Date.UTC(y, mo - 1, d, h, mi);
    return ms - tzOffsetMinutes(tz, new Date(ms)) * 60000;
}
function providerParts(date, tz) {
    const p = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour12: false,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(date);
    const g = (t) => p.find((x) => x.type === t).value;
    let h = parseInt(g('hour'), 10);
    if (h === 24)
        h = 0;
    return { dow: g('weekday'), totalMin: h * 60 + parseInt(g('minute'), 10) };
}
function providerYMD(date, tz) {
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const g = (t) => p.find((x) => x.type === t).value;
    return { y: +g('year'), mo: +g('month'), d: +g('day') };
}
function phaseAt(parts, sch) {
    if (sch.weekendOffPeak && isWeekend(parts.dow))
        return 'offPeak';
    for (const w of sch.peakWindows) {
        const s = parseMin(w.start);
        const e = parseMin(w.end);
        if (parts.totalMin >= s && parts.totalMin < e)
            return 'peak';
    }
    return 'offPeak';
}
function fmtT(at, tz) {
    return new Date(at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        ...(tz && { timeZone: tz }),
    });
}
/** Sorted future peak/off-peak edges for the next 8 days (provider tz). */
function getTransitions(now = new Date(), sch = exports.deepSeekV4, limit = 6) {
    const candidates = [];
    for (let k = 0; k < 8; k++) {
        const day = new Date(now.getTime() + k * MIN_PER_DAY * 60000);
        const ymd = providerYMD(day, sch.timezone);
        const dow = providerParts(day, sch.timezone).dow;
        if (sch.weekendOffPeak && isWeekend(dow))
            continue;
        for (const w of sch.peakWindows) {
            const s = parseMin(w.start);
            const e = parseMin(w.end);
            candidates.push({ at: wallToEpoch(ymd.y, ymd.mo, ymd.d, Math.floor(s / 60), s % 60, sch.timezone), to: 'peak' });
            candidates.push({ at: wallToEpoch(ymd.y, ymd.mo, ymd.d, Math.floor(e / 60), e % 60, sch.timezone), to: 'offPeak' });
        }
    }
    return candidates
        .filter((c) => c.at > now.getTime())
        .sort((a, b) => a.at - b.at)
        .slice(0, limit);
}
function getState(now = new Date(), sch = exports.deepSeekV4) {
    const parts = providerParts(now, sch.timezone);
    const current = phaseAt(parts, sch);
    const transitions = getTransitions(now, sch, 6);
    const next = transitions[0];
    const remainingSec = Math.max(0, (next.at - now.getTime()) / 1000);
    let bestWindow = null;
    if (current === 'offPeak') {
        const nextPeak = transitions.find((t) => t.to === 'peak');
        bestWindow = { start: now.getTime(), end: nextPeak ? nextPeak.at : now.getTime() };
    }
    else {
        const nextOff = transitions.find((t) => t.to === 'offPeak');
        if (nextOff) {
            const after = transitions.find((t) => t.at > nextOff.at && t.to === 'peak');
            bestWindow = { start: nextOff.at, end: after ? after.at : nextOff.at };
        }
    }
    return {
        isOffPeak: current === 'offPeak',
        isWeekend: sch.weekendOffPeak && isWeekend(parts.dow),
        nextIsPeak: next.to === 'peak',
        minutesRemaining: Math.ceil(remainingSec / 60),
        secondsRemaining: Math.max(0, Math.ceil(remainingSec)),
        transitionAt: next.at,
        nextTransitions: transitions.slice(0, 2),
        bestWindow,
    };
}
function getUserTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }
    catch {
        return 'UTC';
    }
}
function tzInfo(tz) {
    const map = {
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
function getTodaySchedule(now = new Date(), sch = exports.deepSeekV4) {
    const tz = getUserTimeZone();
    const weekend = sch.weekendOffPeak && isWeekend(providerParts(now, sch.timezone).dow);
    const ymd = providerYMD(now, sch.timezone);
    const windows = sch.peakWindows.map((w) => {
        const s = parseMin(w.start);
        const e = parseMin(w.end);
        const startEpoch = wallToEpoch(ymd.y, ymd.mo, ymd.d, Math.floor(s / 60), s % 60, sch.timezone);
        const endEpoch = wallToEpoch(ymd.y, ymd.mo, ymd.d, Math.floor(e / 60), e % 60, sch.timezone);
        return {
            start: fmtT(startEpoch, tz),
            end: fmtT(endEpoch, tz),
            peak: true,
            startEpoch,
            endEpoch,
        };
    });
    return { isWeekend: weekend, windows, tz };
}
function formatCountdown(minutes) {
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}
function formatCountdownSec(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}
