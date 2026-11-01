import * as vscode from 'vscode';
import { buildTooltip, getState, getUserTimeZone } from './schedule';
import {
	adviceText,
	alertText,
	buildPanelItems,
	diagnosticsText,
	LBL_COPY_SCHEDULE,
	LBL_COPY_STATUS,
	LBL_RUN_NOW,
	scheduleText,
	statusText,
	type PanelRow,
} from './view-model';

function toQuickPick(row: PanelRow): vscode.QuickPickItem {
	if (row.separator) return { label: row.label, kind: vscode.QuickPickItemKind.Separator };
	return { label: row.label, detail: row.detail, description: row.description };
}

function openPanel() {
	const s = getState();
	const items = buildPanelItems(s).map(toQuickPick);
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
			vscode.window.showInformationMessage(adviceText(s));
		}
		qp.hide();
	});
	qp.onDidHide(() => qp.dispose());
	qp.show();
}

function diagnostics() {
	void vscode.window.showInformationMessage('DeepShift Diagnostics', {
		modal: true,
		detail: diagnosticsText(),
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

		const cfg = vscode.workspace.getConfiguration('deepshift');
		const thr = s.nextIsPeak
			? cfg.get<number>('notifyBeforePeakStarts', 10)
			: cfg.get<number>('notifyBeforeOffPeakStarts', 10);

		if (thr > 0 && s.minutesRemaining <= thr && s.transitionAt !== lastWarned) {
			lastWarned = s.transitionAt;
			void vscode.window.showInformationMessage(alertText(s));
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
			void vscode.env.clipboard.writeText(statusText(getState()))
		),
		vscode.commands.registerCommand('deepshift.diagnostics', diagnostics)
	);
}

export function deactivate() {}
