"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const schedule_1 = require("./schedule");
function fmtTime(at, tz) {
    return new Date(at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        ...(tz && { timeZone: tz }),
    });
}
function statusText(s) {
    const cd = (0, schedule_1.formatCountdownSec)(s.secondsRemaining);
    if (s.isWeekend)
        return `🟢 DS OFF · Weekend · ${cd}`;
    if (s.isOffPeak)
        return `🟢 DS OFF · ${cd}`;
    return `🔴 DS PEAK · ${cd}`;
}
function scheduleText() {
    const day = (0, schedule_1.getTodaySchedule)();
    if (day.isWeekend)
        return `DeepSeek V4 — ${day.tz}\nWeekend: all day off-peak`;
    const lines = day.windows.map((w) => `${w.start}–${w.end} Peak`);
    lines.push('Other hours: Off-peak');
    return `DeepSeek V4 — ${day.tz}\n${lines.join('\n')}`;
}
function pricing() {
    const pr = schedule_1.deepSeekV4.prices;
    if (!pr)
        return null;
    return { flash: pr.flash, pro: pr.pro, note: pr.note };
}
function shortHour(epoch) {
    const d = new Date(epoch);
    const h = d.getHours();
    const m = d.getMinutes();
    return m === 0 ? String(h).padStart(2, '0') : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function dayTag(epoch) {
    const today = new Date().toDateString();
    const e = new Date(epoch).toDateString();
    if (e === today)
        return 'today';
    const tomorrow = new Date(Date.now() + 86400000).toDateString();
    if (e === tomorrow)
        return 'tomorrow';
    return new Date(epoch).toLocaleDateString([], { weekday: 'short' });
}
function buildPanelItems(s) {
    const cd = (0, schedule_1.formatCountdownSec)(s.secondsRemaining);
    const userTz = (0, schedule_1.getUserTimeZone)();
    const user = (0, schedule_1.tzInfo)(userTz);
    const items = [
        {
            label: s.isOffPeak ? '🟢 OFF-PEAK' : '🔴 PEAK PRICING',
            detail: `${s.isOffPeak ? 'Ends' : 'Peak ends'} in ${cd} · ${fmtTime(s.transitionAt)} ${user.flag} ${user.country} · ${fmtTime(s.transitionAt, 'Asia/Shanghai')} 🇨🇳 China`,
        },
    ];
    if (s.nextTransitions[0]) {
        const t = s.nextTransitions[0];
        const to = t.to === 'peak' ? '🔴 Peak' : '🟢 Off-peak';
        items.push({
            label: `Next   ${to} · ${fmtTime(t.at)} · ${(0, schedule_1.formatCountdownSec)(Math.max(0, Math.ceil((t.at - Date.now()) / 1000)))}`,
        });
    }
    if (s.nextTransitions[1]) {
        const t = s.nextTransitions[1];
        const to = t.to === 'peak' ? '🔴 Peak' : '🟢 Off-peak';
        items.push({ label: `Then   ${to} · ${fmtTime(t.at)} ${dayTag(t.at)}` });
    }
    if (s.bestWindow && s.bestWindow.end > s.bestWindow.start) {
        const ms = s.bestWindow.end - s.bestWindow.start;
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        items.push({
            label: '💡 Best off-peak window',
            detail: `${fmtTime(s.bestWindow.start)} ${dayTag(s.bestWindow.start)} → ${fmtTime(s.bestWindow.end)} ${dayTag(s.bestWindow.end)} · ${h}h ${m}m`,
        });
    }
    const dayTz = (0, schedule_1.getUserTimeZone)();
    const dayCountry = (0, schedule_1.tzInfo)(dayTz);
    items.push({
        label: `──── Today’s schedule ${dayCountry.flag} ${dayCountry.country} (${dayTz}) ────`,
        kind: vscode.QuickPickItemKind.Separator,
    });
    const day = (0, schedule_1.getTodaySchedule)();
    if (day.isWeekend) {
        items.push({ label: '🟢 Off-peak', detail: 'All day (weekend rule)' });
    }
    else {
        for (const w of day.windows)
            items.push({ label: `${shortHour(w.startEpoch)}–${shortHour(w.endEpoch)} 🔴 Peak` });
        items.push({ label: 'Other hours 🟢 Off-peak' });
    }
    items.push({ label: '💡 Should I run now?', detail: 'Rule-based advice, no input needed' });
    items.push({ label: '──── More ────', kind: vscode.QuickPickItemKind.Separator });
    const pr = pricing();
    if (pr) {
        items.push({ label: '──── Pricing (USD / 1M output) ────', kind: vscode.QuickPickItemKind.Separator });
        items.push({ label: 'V4-Flash', detail: `Peak ${pr.flash.peak} · Off-peak ${pr.flash.offPeak}` });
        items.push({ label: 'V4-Pro', detail: `Peak ${pr.pro.peak} · Off-peak ${pr.pro.offPeak}` });
    }
    items.push({
        label: 'Schedule',
        detail: `DeepSeek V4 · 🇨🇳 China (${schedule_1.deepSeekV4.timezone}) · verify official docs`,
    });
    items.push({ label: '📋 Copy current status' });
    items.push({ label: '📋 Copy today’s schedule' });
    return items;
}
function openPanel() {
    const s = (0, schedule_1.getState)();
    const items = buildPanelItems(s);
    const qp = vscode.window.createQuickPick();
    qp.items = items;
    qp.title = 'DeepShift';
    qp.hideInputBox = true; // it's a menu, nothing to search
    qp.placeholder = 'DeepSeek pricing window';
    qp.onDidChangeSelection((sel) => {
        const label = sel[0]?.label ?? '';
        if (label.includes('Copy current')) {
            vscode.env.clipboard.writeText(statusText(s));
            vscode.window.showInformationMessage('DeepShift status copied.');
        }
        else if (label.includes('Copy today')) {
            vscode.env.clipboard.writeText(scheduleText());
            vscode.window.showInformationMessage('Schedule copied.');
        }
        else if (label.includes('Should I run')) {
            const adv = s.isOffPeak
                ? 'OFF-PEAK — good time for large AI workloads. Run batch jobs now.'
                : `PEAK — large/batch workloads are cheaper if delayed. Off-peak starts in ${(0, schedule_1.formatCountdownSec)(s.secondsRemaining)}.`;
            vscode.window.showInformationMessage(adv);
        }
        qp.hide();
    });
    qp.onDidHide(() => qp.dispose());
    qp.show();
}
function diagnostics() {
    const now = new Date();
    const userTz = (0, schedule_1.getUserTimeZone)();
    const user = (0, schedule_1.tzInfo)(userTz);
    const bj = (0, schedule_1.tzInfo)('Asia/Shanghai');
    // ponytail: diagnostics is verbose by request — not debt
    const lines = [
        `System timezone: ${userTz} ${user.flag} ${user.country}`,
        `Local time: ${fmtTime(now.getTime())} ${user.flag}`,
        `Beijing: ${fmtTime(now.getTime(), 'Asia/Shanghai')} ${bj.flag} ${bj.country}`,
        `UTC: ${now.toISOString().slice(11, 16)}`,
        `Schedule timezone: ${schedule_1.deepSeekV4.timezone} ${bj.flag} ${bj.country}`,
        `Weekend evaluated in: ${schedule_1.deepSeekV4.timezone} ${bj.flag}`,
        `Weekend off-peak: ${schedule_1.deepSeekV4.weekendOffPeak}`,
        `Peak windows (Beijing): ${schedule_1.deepSeekV4.peakWindows.map((w) => `${w.start}-${w.end}`).join(', ')}`,
    ];
    vscode.window.showInformationMessage('DeepShift Diagnostics', {
        modal: true,
        detail: lines.join('\n'),
    });
}
function activate(context) {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    item.name = 'DeepShift';
    item.command = 'deepshift.openPanel';
    let lastWarned = 0;
    let lastTooltip = '';
    function update() {
        const s = (0, schedule_1.getState)();
        const cdSec = (0, schedule_1.formatCountdownSec)(s.secondsRemaining);
        const cdMin = (0, schedule_1.formatCountdown)(s.minutesRemaining);
        item.text = statusText(s);
        // No background fill: emoji dot + text carry the state, so peak stays
        // readable across themes (a red errorBackground turns orange and hides
        // the red dot on some themes).
        item.backgroundColor = undefined;
        // Tooltip is minute-stable (no seconds) and only reassigned when
        // content actually changes — otherwise a 1s tick makes the hover
        // tooltip jump in/out every second.
        const pr = pricing();
        const userTz = (0, schedule_1.getUserTimeZone)();
        const user = (0, schedule_1.tzInfo)(userTz);
        const nextTooltip = `**DeepSeek V4**\n\n` +
            `${s.isOffPeak ? '🟢 OFF-PEAK' : '🔴 PEAK PRICING'}${s.isWeekend ? ' (weekend)' : ''}\n\n` +
            `Window ends in **${cdMin}**\n\n` +
            `${user.flag} Local: **${fmtTime(s.transitionAt)}** ${user.country} (${userTz})\n` +
            `🇨🇳 Beijing: **${fmtTime(s.transitionAt, 'Asia/Shanghai')}** China\n\n` +
            (pr
                ? `**Pricing** USD per 1M output tokens\n\n` +
                    `- **Flash**: peak ${pr.flash.peak} · off-peak ${pr.flash.offPeak}\n` +
                    `- **Pro**: peak ${pr.pro.peak} · off-peak ${pr.pro.offPeak}\n\n` +
                    `${pr.note}\n\n`
                : '') +
            (schedule_1.deepSeekV4.weekendOffPeak ? 'Weekends: always off-peak\n\n' : '') +
            `Schedule (Beijing 09:00–12:00 & 14:00–18:00, else off-peak) 🇨🇳`;
        if (nextTooltip !== lastTooltip) {
            item.tooltip = new vscode.MarkdownString(nextTooltip);
            lastTooltip = nextTooltip;
        }
        // Status bar keeps live seconds (cdSec) for the ticking effect;
        // tooltip stays on cdMin so hover doesn't flicker.
        const cfg = vscode.workspace.getConfiguration('deepshift');
        const thr = s.nextIsPeak
            ? cfg.get('notifyBeforePeakStarts', 10)
            : cfg.get('notifyBeforeOffPeakStarts', 10);
        if (thr > 0 && s.minutesRemaining <= thr && s.transitionAt !== lastWarned) {
            lastWarned = s.transitionAt;
            const msg = s.nextIsPeak
                ? `DeepSeek peak pricing starts in ${cdSec}.`
                : `DeepSeek off-peak pricing starts in ${cdSec} — good time for bulk jobs.`;
            vscode.window.showInformationMessage(msg);
        }
    }
    item.show();
    update();
    const interval = setInterval(update, 1000);
    context.subscriptions.push(item, { dispose: () => clearInterval(interval) }, vscode.commands.registerCommand('deepshift.openPanel', openPanel), vscode.commands.registerCommand('deepshift.copyStatus', () => vscode.env.clipboard.writeText(statusText((0, schedule_1.getState)()))), vscode.commands.registerCommand('deepshift.diagnostics', diagnostics));
}
function deactivate() { }
