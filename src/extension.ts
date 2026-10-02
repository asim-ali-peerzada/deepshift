import * as vscode from 'vscode';
import {
	getState,
	formatCountdown,
	formatCountdownSec,
	deepSeekV4,
	getTodaySchedule,
	getUserTimeZone,
	buildTooltip,
	holidayCoverageYears,
	offPeakReason,
	windowText,
	tzInfo,
	fmtTime,
} from './schedule';

const LBL_COPY_STATUS = '📋 Copy current status';
const LBL_COPY_SCHEDULE = "📋 Copy today's schedule";
const LBL_RUN_NOW = '💡 Should I run now?';

function statusText(s: ReturnType<typeof getState>): string {
	const cd = formatCountdownSec(s.secondsRemaining);
	const why = offPeakReason(s);
	if (why) return `🟢 DS OFF · ${why} · ${cd}`;
	if (s.isOffPeak) return `🟢 DS OFF · ${cd}`;
	return `🔴 DS PEAK · ${cd}`;
}

function scheduleText(): string {
	const day = getTodaySchedule();
	if (day.isWeekend) return `DeepSeek — ${day.tz}\nWeekend: all day off-peak`;
	if (day.isHoliday) return `DeepSeek — ${day.tz}\nChinese public holiday: all day off-peak`;
	const lines = day.windows.map((x) => `${x.start}–${x.end} Peak`);
	lines.push('Other hours: Off-peak');
	return `DeepSeek — ${day.tz}\n${lines.join('\n')}`;
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
		items.push({
			label: '💡 Best off-peak window',
			detail: `${fmtTime(s.bestWindow.start)} ${dayTag(s.bestWindow.start)} → ${fmtTime(
				s.bestWindow.end
			)} ${dayTag(s.bestWindow.end)} · ${formatCountdown(
				Math.round((s.bestWindow.end - s.bestWindow.start) / 60000)
			)}`,
		});
	}

	items.push({
		label: `──── Today's schedule ${user.flag} ${user.country} (${userTz}) ────`,
		kind: vscode.QuickPickItemKind.Separator,
	});
	const day = getTodaySchedule();
	if (day.isWeekend) {
		items.push({ label: '🟢 Off-peak', detail: 'All day (weekend rule)' });
	} else if (day.isHoliday) {
		items.push({ label: '🟢 Off-peak', detail: 'All day (Chinese public holiday)' });
	} else {
		for (const w of day.windows)
			items.push({ label: `${shortHour(w.startEpoch)}–${shortHour(w.endEpoch)} 🔴 Peak` });
		items.push({ label: 'Other hours 🟢 Off-peak' });
	}

	items.push({ label: LBL_RUN_NOW, detail: 'Rule-based advice, no input needed' });

	items.push({ label: '──── Pricing ────', kind: vscode.QuickPickItemKind.Separator });
	for (const m of deepSeekV4.models) {
		items.push({ label: m.id, description: m.version });
		items.push({
			label: '  input · cache hit',
			detail: `Peak ${m.cacheHit.peak} · off-peak ${m.cacheHit.offPeak}`,
		});
		items.push({
			label: '  input · cache miss',
			detail: `Peak ${m.cacheMiss.peak} · off-peak ${m.cacheMiss.offPeak}`,
		});
		items.push({
			label: '  output',
			detail: `Peak ${m.output.peak} · off-peak ${m.output.offPeak}`,
		});
		items.push({ label: '  concurrency limit', detail: `${m.concurrency} in-flight` });
	}
	items.push({ label: '  note', detail: deepSeekV4.note });

	const years = holidayCoverageYears();
	const thisYear = new Date().getFullYear();
	if (!years.includes(thisYear)) {
		items.push({
			label: '⚠ Holiday calendar out of date',
			detail: `Covers ${years[0]}–${years[years.length - 1]}. Chinese holidays are NOT applied for ${thisYear} — verify against the official page before trusting peak days.`,
		});
	}

	items.push({
		label: 'Schedule',
		detail: `DeepSeek · 🇨🇳 China (${deepSeekV4.timezone}) · ${windowText()}`,
	});
	items.push({
		label: '📖 Official pricing page',
		detail: `Verified ${deepSeekV4.verifiedOn} · ${deepSeekV4.sourceUrl}`,
	});
	items.push({ label: LBL_COPY_STATUS });
	items.push({ label: LBL_COPY_SCHEDULE });
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
		if (label === LBL_COPY_STATUS) {
			vscode.env.clipboard.writeText(statusText(s));
			vscode.window.showInformationMessage('DeepShift status copied.');
		} else if (label === LBL_COPY_SCHEDULE) {
			vscode.env.clipboard.writeText(scheduleText());
			vscode.window.showInformationMessage('Schedule copied.');
		} else if (label === LBL_RUN_NOW) {
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
	const years = holidayCoverageYears();
	const lines = [
		`System timezone: ${userTz} ${user.flag} ${user.country}`,
		`Local time: ${fmtTime(now.getTime())} ${user.flag}`,
		`Beijing: ${fmtTime(now.getTime(), 'Asia/Shanghai')} ${bj.flag} ${bj.country}`,
		`UTC: ${now.toISOString().slice(11, 16)}`,
		`Schedule timezone: ${deepSeekV4.timezone} ${bj.flag} ${bj.country}`,
		`Weekend evaluated in: ${deepSeekV4.timezone} ${bj.flag}`,
		`Weekend off-peak: ${deepSeekV4.weekendOffPeak}`,
		`Holiday off-peak: ${deepSeekV4.holidayOffPeak}`,
		`Holiday calendar covers: ${years[0]}-${years[years.length - 1]}${years.includes(now.getFullYear()) ? '' : '  (STALE — no data for this year)'}`,
		`Peak windows (Beijing): ${deepSeekV4.peakWindows.map((w) => `${w.start}-${w.end}`).join(', ')}`,
		`Prices verified: ${deepSeekV4.verifiedOn}`,
		`Source: ${deepSeekV4.sourceUrl}`,
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

		item.text = statusText(s);
		// No background fill: emoji dot + text carry the state, so peak stays
		// readable across themes (a red errorBackground turns orange and hides
		// the red dot on some themes).
		item.backgroundColor = undefined;

		// Tooltip is minute-stable (no seconds) and only reassigned when
		// content actually changes — otherwise a 1s tick makes the hover
		// tooltip jump in/out every second.
		const nextTooltip = buildTooltip(s, getUserTimeZone());
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
