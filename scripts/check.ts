import assert from 'node:assert/strict';
import { cutIndices, spansFromCuts } from '../src/lib/cuts.ts';
import { parseSse } from '../api/locate.ts';
import { cleanPlan, extractJson } from '../api/plan.ts';

// Deux coupes nettes au milieu d'un travelling (écarts soutenus de ~12) : le travelling n'est pas une coupe.
const diffs = [0, 3, 3, 12, 12, 12, 80, 4, 4, 12, 12, 70, 5];
assert.deepEqual(cutIndices(diffs), [6, 11]);
assert.deepEqual(cutIndices([0, 90, 95, 2]), [1]); // un fondu/flash de deux échantillons = une seule coupe
assert.deepEqual(spansFromCuts([6, 11], 0.25, 3.25), [{ start: 0, end: 1.5 }, { start: 1.5, end: 2.75 }, { start: 2.75, end: 3.25 }]);
assert.deepEqual(spansFromCuts([], 0.25, 5), [{ start: 0, end: 5 }]);

assert.equal(parseSse('event: complete\ndata: [1,2]\n').event, 'complete');
assert.deepEqual(cleanPlan(extractJson('ok {"echelle":" PM ","angle":3} fin')).echelle, 'PM');
console.log('check OK');
