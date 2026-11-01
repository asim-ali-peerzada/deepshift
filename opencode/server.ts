import { Plugin } from '@opencode/plugin';

// The server half exists so the plugin has a stable id and shows up in
// `opencode plugin list` / Settings › Extensions. All pricing logic and UI live
// in the GUI half (gui.ts, bundled to gui.cjs).
export default Plugin.define({
	id: 'deepshift',
	setup() {},
});
