// test/transition_test.mjs
//
// How splits and combines look while they happen (public/transition.js):
// ghosts shrink as new gloops grow, the drawn area stays the same, and
// necks join circles that are close.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/transition_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createTransitions, transitionFrame, neck, DURATION } = await import('../public/transition.js');

const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
const area = (circles) => circles.reduce((s, c) => s + c.r ** 2, 0);

// One gloop of radius 1 at the origin, split into four of radius 1/2.
const parent = [{ id: 1, x: 0, y: 0, r: 1 }];
const born = [2, 3, 4, 5].map((id) => ({ id, volume: 0.25, from: [1] }));
const kids = [2, 3, 4, 5].map((id, i) => ({ id, x: Math.cos(i) * 0.5, y: Math.sin(i) * 0.5, r: 0.5 }));

test('each family of born gloops is one transition', () => {
    const transitions = createTransitions(
        [...parent, { id: 6, x: 3, y: 0, r: 1 }],
        [...born, { id: 7, volume: 0.5, from: [6] }, { id: 8, volume: 0.5, from: [6] }],
        10,
    );
    assert.deepEqual(transitions, [
        { start: 10, ghosts: [{ x: 0, y: 0, r: 1 }], kids: [2, 3, 4, 5] },
        { start: 10, ghosts: [{ x: 3, y: 0, r: 1 }], kids: [7, 8] },
    ]);
});

test('a transition starts as its parent and ends as its new gloops', () => {
    const transitions = createTransitions(parent, born, 0);
    const first = transitionFrame(transitions, kids, 0);
    assert.ok(near(first.ghosts[0].r, 1));
    assert.deepEqual([...first.radii.values()], [0, 0, 0, 0]);
    const done = transitionFrame(transitions, kids, DURATION);
    assert.deepEqual(done.live, []);
    assert.deepEqual(done.ghosts, []);
});

test('the drawn area never changes during a finite split', () => {
    const transitions = createTransitions(parent, born, 0);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const frame = transitionFrame(transitions, kids, t * DURATION);
        const grown = [...frame.radii.values()].map((r) => ({ r }));
        assert.ok(near(area([...frame.ghosts, ...grown]), 1), `at ${t}`);
    }
});

test('ghosts of a combine slide toward the new gloop', () => {
    const parents = [{ id: 1, x: -2, y: 0, r: 1 }, { id: 2, x: 2, y: 0, r: 1 }];
    const transitions = createTransitions(parents, [{ id: 3, volume: 2, from: [1, 2] }], 0);
    const kid = [{ id: 3, x: 0, y: 0, r: Math.SQRT2 }];
    const half = transitionFrame(transitions, kid, DURATION / 2);
    assert.deepEqual(half.ghosts.map((g) => g.x), [-1, 1]);
    assert.equal(half.necks.length, 2);
});

test('a transition whose new gloops are gone draws nothing', () => {
    const frame = transitionFrame(createTransitions(parent, born, 0), [], DURATION / 2);
    assert.deepEqual(frame.ghosts, []);
    assert.equal(frame.live.length, 1);
});

test('a neck joins nearby circles and not distant or nested ones', () => {
    const n = neck({ x: 0, y: 0, r: 1 }, { x: 2.2, y: 0, r: 1 });
    assert.ok(n);
    for (const p of [n.p1, n.p2]) assert.ok(near(Math.hypot(p.x, p.y), 1));
    for (const p of [n.p3, n.p4]) assert.ok(near(Math.hypot(p.x - 2.2, p.y), 1));
    assert.ok(n.p1.y > 0 && n.p2.y < 0);
    assert.equal(neck({ x: 0, y: 0, r: 1 }, { x: 10, y: 0, r: 1 }), null);
    assert.equal(neck({ x: 0, y: 0, r: 2 }, { x: 0.5, y: 0, r: 1 }), null);
    assert.equal(neck({ x: 0, y: 0, r: 0 }, { x: 1, y: 0, r: 1 }), null);
});
