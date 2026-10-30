// test/gesture_test.mjs
// What a touch means (public/gesture.js): taps, holds, drags, lassos,
// hands of several fingers that split, combine and regroup, camera zoom
// and pan, and multi-finger taps, fed through the machine one pointer
// event at a time.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/gesture_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { step, pending, IDLE, LONG_PRESS, MAX_PIECES } = await import('../public/gesture.js');

// Gloops 1 to 4 are circles of radius 20 along y = 100, 100 pixels apart.
const gloops = [1, 2, 3, 4].map((id) => ({ id, x: id * 100, y: 100 }));
const hitAt = (p, excludeId = null) => gloops.find((g) => g.id !== excludeId && Math.hypot(p.x - g.x, p.y - g.y) <= 20)?.id ?? null;

// Runs events through the machine and collects every effect. An event is
// [type, pointerId, x, y, time], and time defaults to 0.
function run(events, selected = [], state = IDLE) {
    const effects = [];
    for (const [type, pointerId, x, y, time = 0] of events) {
        const out = step(state, { type, pointerId, point: { x, y }, time }, { hitAt, selected: new Set(selected) });
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

test('holding a gloop makes it the unit, once', () => {
    const { effects } = run([['down', 1, 100, 100], ['tick', 0, 0, 0, LONG_PRESS / 2], ['tick', 0, 0, 0, LONG_PRESS], ['tick', 0, 0, 0, 1], ['up', 1, 100, 100, 1]]);
    assert.deepEqual(effects, [{ type: 'unit', id: 1 }]);
});

test('a hold is previewed once it is under way', () => {
    const { state } = run([['down', 1, 100, 100]]);
    assert.equal(pending(state, 0), null);
    assert.deepEqual(pending(state, LONG_PRESS / 2), { type: 'hold', id: 1, progress: 0.5 });
});

test('a tap on empty space clears the selection, and a double tap selects all', () => {
    assert.deepEqual(run([['down', 1, 400, 400], ['up', 1, 400, 400]]).effects, [{ type: 'clear' }]);
    const twice = [['down', 1, 400, 400, 0], ['up', 1, 400, 400, 0.05], ['down', 1, 405, 400, 0.2], ['up', 1, 405, 400, 0.25]];
    assert.deepEqual(run(twice).effects, [{ type: 'clear' }, { type: 'all' }]);
    const slow = [['down', 1, 400, 400, 0], ['up', 1, 400, 400, 0.05], ['down', 1, 400, 400, 1], ['up', 1, 400, 400, 1.05]];
    assert.deepEqual(run(slow).effects, [{ type: 'clear' }, { type: 'clear' }]);
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

test('spreading two fingers on a gloop splits it in two when a finger lifts', () => {
    const { state, effects } = run([['down', 1, 95, 100], ['down', 2, 105, 100], ['move', 2, 120, 100], ['move', 2, 160, 100]]);
    assert.deepEqual(effects, []);
    assert.deepEqual(pending(state, 0), { type: 'split', ids: [1], k: 2, at: { x: 127.5, y: 100 } });
    const done = run([['up', 1, 95, 100], ['up', 2, 160, 100]], [], state);
    assert.deepEqual(done.effects, [{ type: 'split', ids: [1], k: 2 }]);
    assert.deepEqual(done.state, IDLE);
});

test('spreading k fingers splits into k', () => {
    const five = [0, 1, 2, 3, 4].map((i) => ({ x: 90 + i * 5, y: 100 }));
    const events = [
        ...five.map((p, i) => ['down', i + 1, p.x, p.y]),
        ...five.map((p, i) => ['move', i + 1, 100 + (p.x - 100) * 6, p.y]),
        ['up', 1, 0, 0],
    ];
    assert.deepEqual(run(events).effects, [{ type: 'split', ids: [1], k: 5 }]);
});

test('spreading further dials up the number of pieces, to a limit', () => {
    const start = [['down', 1, 95, 100], ['down', 2, 105, 100]];
    const at = (x) => pending(run([...start, ['move', 2, x, 100]]).state, 0)?.k;
    // The hand starts 5 wide; past 25 it splits, and past 65 it dials.
    assert.equal(at(150), 2);
    assert.equal(at(95 + 2 * 66), 3);
    assert.equal(at(95 + 2 * 86), 4);
    assert.equal(at(5000), MAX_PIECES);
});

test('moving back before lifting cancels a split', () => {
    const { effects } = run([['down', 1, 95, 100], ['down', 2, 105, 100], ['move', 2, 160, 100], ['move', 2, 110, 100], ['up', 1, 95, 100], ['up', 2, 110, 100]]);
    assert.deepEqual(effects, []);
});

test('pinching fingers on gloops together combines them when the hand lifts', () => {
    const { effects } = run([['down', 1, 100, 100], ['down', 2, 200, 100], ['move', 1, 160, 100], ['move', 2, 170, 100], ['up', 1, 160, 100], ['up', 2, 170, 100]]);
    assert.deepEqual(effects, [{ type: 'combine', ids: [1, 2] }]);
});

test('three fingers on three gloops combine all three', () => {
    const { effects } = run([['down', 1, 100, 100], ['down', 2, 200, 100], ['down', 3, 300, 100], ['move', 1, 190, 100], ['move', 3, 210, 100], ['move', 2, 200, 100]]);
    assert.deepEqual(effects, []);
    const { state } = run([['down', 1, 100, 100], ['down', 2, 200, 100], ['down', 3, 300, 100], ['move', 1, 190, 100], ['move', 3, 210, 100]]);
    assert.deepEqual(pending(state, 0).ids, [1, 2, 3]);
});

test('pinching in three gloops, lifting a finger and spreading two regroups 3 into 2', () => {
    const { state, effects } = run([
        ['down', 1, 100, 100], ['down', 2, 200, 100], ['down', 3, 300, 100],
        ['move', 1, 195, 100], ['move', 3, 205, 100],
        ['up', 3, 205, 100],
        ['move', 1, 150, 100], ['move', 2, 250, 100],
    ]);
    assert.deepEqual(effects, []);
    assert.equal(pending(state, 0).type, 'regroup');
    const done = run([['up', 1, 150, 100], ['up', 2, 250, 100]], [], state);
    assert.deepEqual(done.effects, [{ type: 'regroup', ids: [1, 2, 3], g: 3, m: 2 }]);
});

test('a pinched hand that lifts without spreading combines', () => {
    const { effects } = run([
        ['down', 1, 100, 100], ['down', 2, 200, 100], ['down', 3, 300, 100],
        ['move', 1, 195, 100], ['move', 3, 205, 100],
        ['up', 3, 205, 100], ['up', 1, 195, 100], ['up', 2, 200, 100],
    ]);
    assert.deepEqual(effects, [{ type: 'combine', ids: [1, 2, 3] }]);
});

test('a hand on a selected gloop acts on the whole selection, with the fingers as the group size', () => {
    const spreadOut = run([['down', 1, 95, 100], ['down', 2, 105, 100], ['move', 2, 200, 100], ['up', 2, 200, 100]], [1, 5, 6]);
    assert.deepEqual(spreadOut.effects, [{ type: 'split', ids: [1, 5, 6], k: 2 }]);
    const regrouped = run([
        ['down', 1, 70, 100], ['down', 2, 100, 100], ['down', 3, 130, 100],
        ['move', 1, 95, 100], ['move', 3, 105, 100],
        ['up', 3, 105, 100],
        ['move', 1, 40, 100], ['move', 2, 160, 100],
        ['up', 1, 40, 100],
    ], [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(regrouped.effects, [{ type: 'regroup', ids: [1, 2, 3, 4, 5, 6], g: 3, m: 2 }]);
});

test('fingers on empty space zoom and pan', () => {
    const { effects } = run([['down', 1, 400, 400], ['down', 2, 500, 400], ['move', 2, 600, 400]]);
    assert.deepEqual(effects, [
        { type: 'pan', dx: 50, dy: 0 },
        { type: 'zoom', focus: { x: 500, y: 400 }, factor: 2 },
    ]);
});

test('a quick tap of two fingers undoes, and of three redoes', () => {
    const tap = (n, end) => [
        ...Array.from({ length: n }, (_, i) => ['down', i + 1, 400 + i * 60, 400, 0]),
        ...Array.from({ length: n }, (_, i) => ['up', i + 1, 400 + i * 60, 400, end]),
    ];
    assert.deepEqual(run(tap(2, 0.1)).effects, [{ type: 'undo' }]);
    assert.deepEqual(run(tap(3, 0.1)).effects, [{ type: 'redo' }]);
    assert.deepEqual(run(tap(2, 1)).effects, []);
});

test('a second finger during a drag is ignored, and lifting it ends nothing', () => {
    const { state, effects } = run([['down', 1, 100, 100], ['move', 1, 150, 100], ['down', 2, 400, 400], ['move', 2, 500, 400], ['up', 2, 500, 400], ['move', 1, 195, 100], ['up', 1, 195, 100]]);
    assert.deepEqual(effects.map((e) => e.type), ['drag', 'drag', 'combine']);
    assert.deepEqual(state, IDLE);
});

test('lifting a finger of the camera ends the gesture until every finger is up', () => {
    const { state, effects } = run([['down', 1, 400, 400], ['down', 2, 500, 400], ['move', 2, 600, 400, 0.1], ['up', 1, 400, 400, 0.2], ['move', 2, 700, 400, 0.3]]);
    assert.equal(effects.length, 2);
    assert.equal(state.mode, 'spent');
});
