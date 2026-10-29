// test/gesture_test.mjs
//
// What a touch means (public/gesture.js): taps, drags, lassos, pinches,
// spreads, and camera zoom and pan, fed through the machine one pointer
// event at a time.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/gesture_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { step, IDLE } = await import('../public/gesture.js');

// Gloops 1 and 2 are circles of radius 20 at (100, 100) and (200, 100).
const gloops = [
    { id: 1, x: 100, y: 100 },
    { id: 2, x: 200, y: 100 },
];
const hitAt = (p, excludeId = null) => gloops.find((g) => g.id !== excludeId && Math.hypot(p.x - g.x, p.y - g.y) <= 20)?.id ?? null;

// Runs events through the machine and collects every effect.
function run(events, selected = []) {
    let state = IDLE;
    const effects = [];
    for (const [type, pointerId, x, y] of events) {
        const out = step(state, { type, pointerId, point: { x, y } }, { hitAt, selected: new Set(selected) });
        state = out.state;
        effects.push(...out.effects);
    }
    return { state, effects };
}

test('a tap on a gloop toggles it', () => {
    const { state, effects } = run([['down', 1, 102, 98], ['move', 1, 104, 99], ['up', 1, 104, 99]]);
    assert.deepEqual(effects, [{ type: 'toggle', id: 1 }]);
    assert.deepEqual(state, IDLE);
});

test('a tap on empty space clears the selection', () => {
    assert.deepEqual(run([['down', 1, 400, 400], ['up', 1, 400, 400]]).effects, [{ type: 'clear' }]);
});

test('a stroke on empty space lassos', () => {
    const { effects } = run([['down', 1, 50, 50], ['move', 1, 250, 50], ['move', 1, 250, 150], ['up', 1, 250, 150]]);
    assert.equal(effects.length, 1);
    assert.equal(effects[0].type, 'lasso');
    assert.equal(effects[0].path.length, 3);
});

test('dragging a gloop moves it, and dropping it on another combines them', () => {
    const { effects } = run([['down', 1, 100, 100], ['move', 1, 150, 100], ['move', 1, 195, 100], ['up', 1, 195, 100]]);
    assert.deepEqual(effects, [
        { type: 'drag', id: 1, dx: 50, dy: 0 },
        { type: 'drag', id: 1, dx: 45, dy: 0 },
        { type: 'combine', ids: [1, 2] },
    ]);
});

test('dropping a gloop on empty space only moves it', () => {
    const { effects } = run([['down', 1, 100, 100], ['move', 1, 100, 300], ['up', 1, 100, 300]]);
    assert.deepEqual(effects, [{ type: 'drag', id: 1, dx: 0, dy: 200 }]);
});

test('spreading two fingers on a gloop splits it, once', () => {
    const { effects } = run([['down', 1, 95, 100], ['down', 2, 105, 100], ['move', 2, 120, 100], ['move', 2, 160, 100], ['up', 1, 95, 100], ['up', 2, 160, 100]]);
    assert.deepEqual(effects, [{ type: 'split', ids: [1] }]);
});

test('pinching two gloops together combines them', () => {
    const { effects } = run([['down', 1, 100, 100], ['down', 2, 200, 100], ['move', 1, 160, 100], ['move', 2, 170, 100], ['up', 1, 160, 100], ['up', 2, 170, 100]]);
    assert.deepEqual(effects, [{ type: 'combine', ids: [1, 2] }]);
});

test('a two-finger gesture on a selected gloop acts on the whole selection', () => {
    const { effects } = run([['down', 1, 95, 100], ['down', 2, 105, 100], ['move', 2, 200, 100]], [1, 5, 6]);
    assert.deepEqual(effects, [{ type: 'split', ids: [1, 5, 6] }]);
});

test('two fingers on empty space zoom and pan', () => {
    const { effects } = run([['down', 1, 400, 400], ['down', 2, 500, 400], ['move', 2, 600, 400]]);
    assert.deepEqual(effects, [
        { type: 'pan', dx: 50, dy: 0 },
        { type: 'zoom', focus: { x: 500, y: 400 }, factor: 2 },
    ]);
});

test('a second finger during a drag is ignored, and lifting it ends nothing', () => {
    const { state, effects } = run([['down', 1, 100, 100], ['move', 1, 150, 100], ['down', 2, 400, 400], ['move', 2, 500, 400], ['up', 2, 500, 400], ['move', 1, 195, 100], ['up', 1, 195, 100]]);
    assert.deepEqual(effects.map((e) => e.type), ['drag', 'drag', 'combine']);
    assert.deepEqual(state, IDLE);
});

test('lifting one finger of a pinch ends the gesture until both are up', () => {
    const { state, effects } = run([['down', 1, 400, 400], ['down', 2, 500, 400], ['up', 1, 400, 400], ['move', 2, 700, 400]]);
    assert.deepEqual(effects, []);
    assert.equal(state.mode, 'spent');
});

test('a third finger is ignored', () => {
    const { effects } = run([['down', 1, 400, 400], ['down', 2, 500, 400], ['down', 3, 100, 100], ['move', 3, 300, 100]]);
    assert.deepEqual(effects, []);
});
