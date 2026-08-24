import * as vscode from 'vscode';
import {
	getState,
	formatCountdown,
	formatCountdownSec,
	deepSeekV4,
	getTodaySchedule,
	getUserTimeZone,
	tzInfo,
} from './schedule';

function fmtTime(at: number, tz?: string): string {
	return new Date(at).toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
		...(tz && { timeZone: tz }),
	});
}

function statusText(s: ReturnType<typeof getState>): string {
	const cd = formatCountdownSec(s.secondsRemaining);
	if (s.isWeekend) return `🟢 DS OFF · Weekend · ${cd}`;
	if (s.isOffPeak) return `🟢 DS OFF · ${cd}`;
	return `🔴 DS PEAK · ${cd}`;
}

function scheduleText(): string {
	const day = getTodaySchedule();
	if (day.isWeekend) return `DeepSeek V4 — ${day.tz}\nWeekend: all day off-peak`;
	const lines = day.windows.map((w) => `${w.start}–${w.end} Peak`);
	lines.push('Other hours: Off-peak');
	return `DeepSeek V4 — ${day.tz}\n${lines.join('\n')}`;
}

function pricing(): {
	flash: { peak: string; offPeak: string };
	pro: { peak: string; offPeak: string };
	note: string;
} | null {
	const pr = deepSeekV4.prices;
	if (!pr) return null;
	return { flash: pr.flash, pro: pr.pro, note: pr.note };
}

function shortHour(epoch: number): string {
	const d = new Date(epoch);
	const h = d.getHours();
	const m = d.getMinutes();
	return m === 0 ? String(h).padStart(2, '0') : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function dayTag(epoch: number): string {
	const today = new Date().toDateString();
	const e = new Date(epoch).toDateString();
	if (e === today) return 'today';
	const tomorrow = new Date(Date.now() + 86400000).toDateString();
	if (e === tomorrow) return 'tomorrow';
	return new Date(epoch).toLocaleDateString([], { weekday: 'short' });
}

function buildPanelItems(s: ReturnType<typeof getState>): vscode.QuickPickItem[] {
	const cd = formatCountdownSec(s.secondsRemaining);
	const userTz = getUserTimeZone();
	const user = tzInfo(userTz);
	const items: vscode.QuickPickItem[] = [
		{
			label: s.isOffPeak ? '🟢 OFF-PEAK' : '🔴 PEAK PRICING',
			detail: `${s.isOffPeak ? 'Ends' : 'Peak ends'} in ${cd} · ${fmtTime(
				s.transitionAt
			)} ${user.flag} ${user.country} · ${fmtTime(s.transitionAt, 'Asia/Shanghai')} 🇨🇳 China`,
		},
	];

	if (s.nextTransitions[0]) {
		const t = s.nextTransitions[0];
		const to = t.to === 'peak' ? '🔴 Peak' : '🟢 Off-peak';
		items.push({
			label: `Next   ${to} · ${fmtTime(t.at)} · ${formatCountdownSec(
				Math.max(0, Math.ceil((t.at - Date.now()) / 1000))
			)}`,
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
			detail: `${fmtTime(s.bestWindow.start)} ${dayTag(s.bestWindow.start)} → ${fmtTime(
				s.bestWindow.end
			)} ${dayTag(s.bestWindow.end)} · ${h}h ${m}m`,
		});
	}

	const dayTz = getUserTimeZone();
	const dayCountry = tzInfo(dayTz);
	items.push({
		label: `──── Today’s schedule ${dayCountry.flag} ${dayCountry.country} (${dayTz}) ────`,
		kind: vscode.QuickPickItemKind.Separator,
	});
	const day = getTodaySchedule();
	if (day.isWeekend) {
		items.push({ label: '🟢 Off-peak', detail: 'All day (weekend rule)' });
	} else {
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
		detail: `DeepSeek V4 · 🇨🇳 China (${deepSeekV4.timezone}) · verify official docs`,
	});
	items.push({ label: '📋 Copy current status' });
	items.push({ label: '📋 Copy today’s schedule' });
	return items;
}

function openPanel() {
	const s = getState();
	const items = buildPanelItems(s);
	const qp = vscode.window.createQuickPick();
	qp.items = items;
	qp.title = 'DeepShift';
	(qp as unknown as { hideInputBox: boolean }).hideInputBox = true; // it's a menu, nothing to search
	qp.placeholder = 'DeepSeek pricing window';
	qp.onDidChangeSelection((sel) => {
		const label = sel[0]?.label ?? '';
		if (label.includes('Copy current')) {
			vscode.env.clipboard.writeText(statusText(s));
			vscode.window.showInformationMessage('DeepShift status copied.');
		} else if (label.includes('Copy today')) {
			vscode.env.clipboard.writeText(scheduleText());
			vscode.window.showInformationMessage('Schedule copied.');
		} else if (label.includes('Should I run')) {
			const adv = s.isOffPeak
				? 'OFF-PEAK — good time for large AI workloads. Run batch jobs now.'
				: `PEAK — large/batch workloads are cheaper if delayed. Off-peak starts in ${formatCountdownSec(
						s.secondsRemaining
					)}.`;
			vscode.window.showInformationMessage(adv);
		}
		qp.hide();
	});
	qp.onDidHide(() => qp.dispose());
	qp.show();
}

function diagnostics() {
	const now = new Date();
	const userTz = getUserTimeZone();
	const user = tzInfo(userTz);
	const bj = tzInfo('Asia/Shanghai');
	// ponytail: diagnostics is verbose by request — not debt
	const lines = [
		`System timezone: ${userTz} ${user.flag} ${user.country}`,
		`Local time: ${fmtTime(now.getTime())} ${user.flag}`,
		`Beijing: ${fmtTime(now.getTime(), 'Asia/Shanghai')} ${bj.flag} ${bj.country}`,
		`UTC: ${now.toISOString().slice(11, 16)}`,
		`Schedule timezone: ${deepSeekV4.timezone} ${bj.flag} ${bj.country}`,
		`Weekend evaluated in: ${deepSeekV4.timezone} ${bj.flag}`,
		`Weekend off-peak: ${deepSeekV4.weekendOffPeak}`,
		`Peak windows (Beijing): ${deepSeekV4.peakWindows.map((w) => `${w.start}-${w.end}`).join(', ')}`,
	];
	vscode.window.showInformationMessage('DeepShift Diagnostics', {
		modal: true,
		detail: lines.join('\n'),
	});
}

export function activate(context: vscode.ExtensionContext) {
	const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	item.name = 'DeepShift';
	item.command = 'deepshift.openPanel';
	let lastWarned = 0;
	let lastTooltip = '';

	function update() {
		const s = getState();
		const cdSec = formatCountdownSec(s.secondsRemaining);
		const cdMin = formatCountdown(s.minutesRemaining);

		item.text = statusText(s);
		// No background fill: emoji dot + text carry the state, so peak stays
		// readable across themes (a red errorBackground turns orange and hides
		// the red dot on some themes).
		item.backgroundColor = undefined;

		// Tooltip is minute-stable (no seconds) and only reassigned when
		// content actually changes — otherwise a 1s tick makes the hover
		// tooltip jump in/out every second.
		const pr = pricing();
		const userTz = getUserTimeZone();
		const user = tzInfo(userTz);
		const nextTooltip =
			`**DeepSeek V4**\n\n` +
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
			(deepSeekV4.weekendOffPeak ? 'Weekends: always off-peak\n\n' : '') +
			`Schedule (Beijing 09:00–12:00 & 14:00–18:00, else off-peak) 🇨🇳`;
		if (nextTooltip !== lastTooltip) {
			item.tooltip = new vscode.MarkdownString(nextTooltip);
			lastTooltip = nextTooltip;
		}

		// Status bar keeps live seconds (cdSec) for the ticking effect;
		// tooltip stays on cdMin so hover doesn't flicker.

		const cfg = vscode.workspace.getConfiguration('deepshift');
		const thr = s.nextIsPeak
			? cfg.get<number>('notifyBeforePeakStarts', 10)
			: cfg.get<number>('notifyBeforeOffPeakStarts', 10);

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

	context.subscriptions.push(
		item,
		{ dispose: () => clearInterval(interval) },
		vscode.commands.registerCommand('deepshift.openPanel', openPanel),
		vscode.commands.registerCommand('deepshift.copyStatus', () =>
			vscode.env.clipboard.writeText(statusText(getState()))
		),
		vscode.commands.registerCommand('deepshift.diagnostics', diagnostics)
	);
}

export function deactivate() {}
