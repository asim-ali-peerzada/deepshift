// DeepShift for OpenCode Desktop.
//
// Shows DeepSeek peak/off-peak pricing the same way the VS Code extension does:
// a red bar above the toasts while peak rates are in effect, and a composer pill
// that is red during peak and green off-peak. All pricing, schedule, holiday and
// presentation logic comes from `../src/schedule` and `../src/view-model` — this
// file is only the UI adapter.
//
// Options in opencode.json(c):
//   {
//     "package": "P:/deepshift/opencode",
//     "options": {
//       "notifyBeforePeakStarts": 10,     // minutes, 0 disables
//       "notifyBeforeOffPeakStarts": 10,  // minutes, 0 disables
//       "always": false                   // show the bar even when no DeepSeek model is selected
//     }
//   }

import { Command, ComposerPill, Plugin, Slot, Style } from '@opencode/plugin/gui';
import { createSignal } from 'solid-js';
import { deepSeekV4, fmtTime, getState, windowText } from '../src/schedule';
import {
	adviceText,
	alertText,
	barCountdown,
	barText,
	buildPanelItems,
	diagnosticsText,
	pillLabel,
	scheduleText,
	statusLabel,
	statusTone,
	type PanelAction,
} from '../src/view-model';

const PRICING_URL = deepSeekV4.sourceUrl;
const PEAK_PILL_TITLE = 'DeepSeek peak pricing: off-peak discount not applied';
const OFF_PEAK_PILL_TITLE = 'DeepSeek off-peak pricing: 50% off';

// The pill is styled through this aria-label prefix so the red override only
// ever matches this plugin's pill, never another plugin's.
const CSS = `
.oc-ds-bar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 26px;
  padding: 0 12px;
  box-sizing: border-box;
  background: linear-gradient(90deg, #7f1d1d, #dc2626 45%, #b91c1c);
  background-size: 220% 100%;
  animation: oc-ds-slide 7s linear infinite;
  color: #fff;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.055em;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  user-select: none;
  cursor: default;
}
.oc-ds-bar[hidden] { display: none; }
.oc-ds-bar .oc-ds-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.35);
  animation: oc-ds-pulse 1.3s ease-in-out infinite;
}
.oc-ds-bar .oc-ds-text { overflow: hidden; text-overflow: ellipsis; }
.oc-ds-bar .oc-ds-time { flex: 0 0 auto; opacity: 0.9; font-weight: 550; }
@keyframes oc-ds-slide { from { background-position: 0 0; } to { background-position: -220% 0; } }
@keyframes oc-ds-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

button[data-composer-pill][aria-label^="DeepSeek peak pricing"] {
  background: #dc2626 !important;
  color: #fff !important;
  border-color: #7f1d1d !important;
  box-shadow: 0 0 0 1px #7f1d1d inset, 0 0 0 3px rgba(220, 38, 38, 0.22) !important;
  font-weight: 600 !important;
  animation: oc-ds-pill 2.4s ease-in-out infinite;
}
button[data-composer-pill][aria-label^="DeepSeek peak pricing"] svg { color: #fff !important; }
@keyframes oc-ds-pill {
  0%, 100% { box-shadow: 0 0 0 1px #7f1d1d inset, 0 0 0 3px rgba(220, 38, 38, 0.18); }
  50% { box-shadow: 0 0 0 1px #7f1d1d inset, 0 0 0 6px rgba(220, 38, 38, 0.32); }
}

@media (prefers-reduced-motion: reduce) {
  .oc-ds-bar { animation: none; }
  .oc-ds-bar .oc-ds-dot { animation: none; }
  button[data-composer-pill][aria-label^="DeepSeek peak pricing"] { animation: none; }
}
`;

function createBar() {
	const bar = document.createElement('div');
	bar.className = 'oc-ds-bar';
	bar.setAttribute('role', 'status');
	bar.setAttribute('aria-live', 'polite');

	const dot = document.createElement('span');
	dot.className = 'oc-ds-dot';

	const text = document.createElement('span');
	text.className = 'oc-ds-text';

	const time = document.createElement('span');
	time.className = 'oc-ds-time';

	bar.append(dot, text, time);
	return { bar, text, time };
}

module.exports = Plugin.define({
	i18n: {
		en: {
			'command.status': 'DeepShift: DeepSeek pricing status',
			'command.status.description': 'Check whether the DeepSeek off-peak discount is applied right now',
			'command.copyStatus': 'DeepShift: Copy status',
			'command.copyStatus.description': 'Copy the current DeepSeek pricing status to the clipboard',
			'command.copySchedule': "DeepShift: Copy today's schedule",
			'command.copySchedule.description': "Copy today's DeepSeek peak windows in your timezone",
			'command.diagnostics': 'DeepShift: Diagnose timezone',
			'command.diagnostics.description': 'Show local, Beijing and UTC clocks plus holiday calendar coverage',
		},
	},
	setup(ctx) {
		const options = ctx.options ?? {};
		const always = options.always === true;
		const peakThreshold = Number(options.notifyBeforePeakStarts ?? 10);
		const offPeakThreshold = Number(options.notifyBeforeOffPeakStarts ?? 10);

		const isDeepSeek = (model) => {
			if (!model) return false;
			const provider = String(model.providerID ?? '').toLowerCase();
			const modelID = String(model.modelID ?? '').toLowerCase();
			return provider.includes('deepseek') || modelID.includes('deepseek');
		};

		const currentModel = () => ctx.screen.current()?.composer.model();

		// One clock read per evaluation; everything else is derived from getState().
		const status = () => {
			const now = new Date();
			const state = getState(now);
			const model = currentModel();
			return { now, state, model, relevant: always || isDeepSeek(model) };
		};

		// The window bar. The slot renders once, so this plugin drives the DOM
		// itself from the ticker below.
		const { bar, text, time } = createBar();
		ctx.add(Slot, { at: 'window.bottom', order: 100, render: () => bar });
		ctx.add(Style, CSS);

		const syncBar = () => {
			const { state, model, relevant } = status();

			if (state.isOffPeak || !relevant) {
				bar.hidden = true;
				return;
			}

			text.textContent = barText(state);
			time.textContent = `· ${barCountdown(state)}`;
			bar.title = [
				'DeepSeek peak pricing is active: the off-peak discount is not applied, so rates are 2x off-peak.',
				`Peak windows: ${windowText()} Beijing, Monday to Friday (excluding Chinese public holidays).`,
				`Off-peak rates resume at ${fmtTime(state.transitionAt, 'Asia/Shanghai')} Beijing (${fmtTime(
					state.transitionAt
				)} local).`,
				model ? `Selected model: ${model.providerID}/${model.modelID}.` : '',
				`Official pricing: ${PRICING_URL}`,
			]
				.filter(Boolean)
				.join('\n');
			bar.hidden = false;
		};

		// A ticking signal makes the composer pill re-evaluate too, so its
		// countdown and colour follow the clock without a page reload.
		const [tick, setTick] = createSignal(0);

		const copyStatus = () => {
			void ctx.system.copy(statusLabel(getState()));
			ctx.toast.show({ title: 'DeepShift', description: 'Status copied.', duration: 4000 });
		};

		const copySchedule = () => {
			void ctx.system.copy(scheduleText(getState()));
			ctx.toast.show({ title: 'DeepShift', description: 'Schedule copied.', duration: 4000 });
		};

		const rowAction = (action: PanelAction | undefined, state: ReturnType<typeof getState>) => {
			switch (action) {
				case 'copy-status':
					return copyStatus;
				case 'copy-schedule':
					return copySchedule;
				case 'run-now':
					return () => ctx.toast.show({ title: 'DeepShift', description: adviceText(state, false), duration: 10000 });
				case 'open-pricing':
					return () => ctx.system.openExternal(PRICING_URL);
				default:
					return undefined;
			}
		};

		// The same panel rows the VS Code QuickPick renders; separators and
		// QuickPick-only fields are dropped for the composer-pill menu.
		const pillRows = (state: ReturnType<typeof getState>) =>
			buildPanelItems(state)
				.filter((row) => !row.separator)
				.map((row) => ({
					id: row.id,
					label: row.label,
					detail: row.detail ?? row.description,
					icon: row.icon,
					tone: row.tone,
					run: rowAction(row.action, state),
				}));

		ctx.add(ComposerPill, {
			id: 'deepshift',
			order: 10,
			show: () => {
				tick();
				const { state } = status();
				return {
					icon: state.isOffPeak ? 'circle-check' : 'warning',
					tone: statusTone(state),
					label: pillLabel(state),
					title: state.isOffPeak ? OFF_PEAK_PILL_TITLE : PEAK_PILL_TITLE,
					rows: pillRows(state),
				};
			},
		});

		let lastWarned = 0;

		const timer = setInterval(() => {
			setTick((value) => value + 1);

			const { state } = status();
			const threshold = state.nextIsPeak ? peakThreshold : offPeakThreshold;

			if (threshold > 0 && state.minutesRemaining <= threshold && state.transitionAt !== lastWarned) {
				lastWarned = state.transitionAt;
				const message = alertText(state, false);
				ctx.toast.show({
					title: 'DeepShift',
					description: message,
					variant: state.nextIsPeak ? 'error' : 'success',
					icon: state.nextIsPeak ? 'warning' : 'circle-check',
					duration: 10000,
				});
				void ctx.attention?.notify?.({ title: 'DeepShift', message });
			}

			syncBar();
		}, 1000);

		syncBar();

		ctx.add(Command, () => ({
			id: 'deepshift.status',
			title: ctx.t('command.status'),
			description: ctx.t('command.status.description'),
			keywords: 'deepseek peak off-peak pricing discount cost rates countdown',
			group: 'DeepShift',
			slash: { name: 'deepshift' },
			run: () => {
				const state = getState();
				const model = currentModel();
				ctx.toast.show({
					title: state.isOffPeak ? 'DeepSeek off-peak pricing' : 'DeepSeek peak pricing',
					description: [
						statusLabel(state),
						state.isOffPeak ? 'Off-peak rates: 50% off.' : 'The off-peak discount is NOT applied: rates are 2x.',
						scheduleText(state),
						`Rates verified ${deepSeekV4.verifiedOn}: ${PRICING_URL}`,
						model ? `Selected model: ${model.providerID}/${model.modelID}.` : '',
					]
						.filter(Boolean)
						.join('\n'),
					variant: state.isOffPeak ? 'success' : 'error',
					icon: state.isOffPeak ? 'circle-check' : 'warning',
					duration: 12000,
				});
			},
		}));

		ctx.add(Command, () => ({
			id: 'deepshift.copyStatus',
			title: ctx.t('command.copyStatus'),
			description: ctx.t('command.copyStatus.description'),
			group: 'DeepShift',
			run: copyStatus,
		}));

		ctx.add(Command, () => ({
			id: 'deepshift.copySchedule',
			title: ctx.t('command.copySchedule'),
			description: ctx.t('command.copySchedule.description'),
			group: 'DeepShift',
			run: copySchedule,
		}));

		ctx.add(Command, () => ({
			id: 'deepshift.diagnostics',
			title: ctx.t('command.diagnostics'),
			description: ctx.t('command.diagnostics.description'),
			group: 'DeepShift',
			run: () => {
				ctx.toast.show({
					title: 'DeepShift diagnostics',
					description: diagnosticsText(),
					duration: 20000,
				});
			},
		}));

		return () => clearInterval(timer);
	},
});
