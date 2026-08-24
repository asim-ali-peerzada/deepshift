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
const assert = __importStar(require("node:assert"));
const schedule_1 = require("./schedule");
const d = (iso) => new Date(iso);
const at = (iso) => d(iso).getTime();
// Mon 2026-08-24 is a weekday. Peak UTC = 01:00-04:00 and 06:00-10:00.
// Inside first peak window (Beijing 10:00)
let s = (0, schedule_1.getState)(d('2026-08-24T02:00:00Z'));
assert.strictEqual(s.isOffPeak, false);
assert.strictEqual(s.minutesRemaining, 120); // ends 04:00Z
assert.strictEqual(s.nextIsPeak, false);
// Lunch gap between windows -> off-peak, next transition is peak start 06:00Z
s = (0, schedule_1.getState)(d('2026-08-24T05:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual(s.minutesRemaining, 60);
assert.strictEqual(s.nextIsPeak, true);
// End of afternoon peak
s = (0, schedule_1.getState)(d('2026-08-24T09:00:00Z'));
assert.strictEqual(s.isOffPeak, false);
assert.strictEqual(s.minutesRemaining, 60); // ends 10:00Z
// Evening off-peak -> next peak is next weekday 01:00Z (Tue)
s = (0, schedule_1.getState)(d('2026-08-24T11:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual(s.minutesRemaining, 840);
assert.strictEqual(s.transitionAt, at('2026-08-25T01:00:00Z'));
// Weekend (Sat 2026-08-29) -> always off-peak regardless of clock
s = (0, schedule_1.getState)(d('2026-08-29T02:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual(s.transitionAt, at('2026-08-31T01:00:00Z')); // next peak Mon 09:00 Beijing
// Sunday off-peak
s = (0, schedule_1.getState)(d('2026-08-30T09:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual(s.transitionAt, at('2026-08-31T01:00:00Z'));
// Timezone day boundary: Fri 17:00Z = Sat 01:00 Beijing -> weekend off-peak
s = (0, schedule_1.getState)(d('2026-08-28T17:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual((0, schedule_1.formatCountdown)(125), '2h 05m');
// New fields: next two transitions + best window
const v = (0, schedule_1.getState)(d('2026-08-24T02:00:00Z')); // peak, ends 04:00Z
assert.strictEqual(v.nextTransitions.length, 2);
assert.strictEqual(v.nextTransitions[0].to, 'offPeak'); // 04:00Z
assert.strictEqual(v.nextTransitions[0].at, at('2026-08-24T04:00:00Z'));
assert.ok(v.bestWindow && v.bestWindow.start === at('2026-08-24T04:00:00Z'));
const wk = (0, schedule_1.getState)(d('2026-08-29T02:00:00Z')); // weekend off-peak
assert.strictEqual(wk.isWeekend, true);
assert.strictEqual(wk.isOffPeak, true);
console.log('all schedule tests passed');
