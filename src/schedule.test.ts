import * as assert from 'node:assert';
import { getState, formatCountdown } from './schedule';

const d = (iso: string) => new Date(iso);
const at = (iso: string) => d(iso).getTime();

// Mon 2026-08-24 is a weekday. Peak UTC = 01:00-04:00 and 06:00-10:00.

// Inside first peak window (Beijing 10:00)
let s = getState(d('2026-08-24T02:00:00Z'));
assert.strictEqual(s.isOffPeak, false);
assert.strictEqual(s.minutesRemaining, 120); // ends 04:00Z
assert.strictEqual(s.nextIsPeak, false);

// Lunch gap between windows -> off-peak, next transition is peak start 06:00Z
s = getState(d('2026-08-24T05:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual(s.minutesRemaining, 60);
assert.strictEqual(s.nextIsPeak, true);

// End of afternoon peak
s = getState(d('2026-08-24T09:00:00Z'));
assert.strictEqual(s.isOffPeak, false);
assert.strictEqual(s.minutesRemaining, 60); // ends 10:00Z

// Evening off-peak -> next peak is next weekday 01:00Z (Tue)
s = getState(d('2026-08-24T11:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual(s.minutesRemaining, 840);
assert.strictEqual(s.transitionAt, at('2026-08-25T01:00:00Z'));

// Weekend (Sat 2026-08-29) -> always off-peak regardless of clock
s = getState(d('2026-08-29T02:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual(s.transitionAt, at('2026-08-31T01:00:00Z')); // next peak Mon 09:00 Beijing

// Sunday off-peak
s = getState(d('2026-08-30T09:00:00Z'));
assert.strictEqual(s.isOffPeak, true);
assert.strictEqual(s.transitionAt, at('2026-08-31T01:00:00Z'));

// Timezone day boundary: Fri 17:00Z = Sat 01:00 Beijing -> weekend off-peak
s = getState(d('2026-08-28T17:00:00Z'));
assert.strictEqual(s.isOffPeak, true);

assert.strictEqual(formatCountdown(125), '2h 05m');

// New fields: next two transitions + best window
const v = getState(d('2026-08-24T02:00:00Z')); // peak, ends 04:00Z
assert.strictEqual(v.nextTransitions.length, 2);
assert.strictEqual(v.nextTransitions[0].to, 'offPeak'); // 04:00Z
assert.strictEqual(v.nextTransitions[0].at, at('2026-08-24T04:00:00Z'));
assert.ok(v.bestWindow && v.bestWindow.start === at('2026-08-24T04:00:00Z'));

const wk = getState(d('2026-08-29T02:00:00Z')); // weekend off-peak
assert.strictEqual(wk.isWeekend, true);
assert.strictEqual(wk.isOffPeak, true);

console.log('all schedule tests passed');
