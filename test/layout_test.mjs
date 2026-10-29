// test/layout_test.mjs
//
// Where gloops sit (public/layout.js): births, settling, the camera and
// the learner's view, touch, and grouping a selection by nearness.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/layout_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { body, placeBirths, settle, targetScale, hitTest, lassoSelect, groupByProximity, toScreen, toWorld, cameraFor, zoomAt, panBy, DEFAULT_VIEW, isDefaultView, MAX_ZOOM } = await import('../public/layout.js');

const cam = (scale, width, height) => ({ scale, width, height, cx: 0, cy: 0 });

const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

test('a split starts inside its parent and replaces it', () => {
    const bodies = placeBirths([body(1, 1, 5, 0)], [2, 3, 4, 5].map((id) => ({ id, volume: 0.25, from: [1] })));
    assert.deepEqual(bodies.map((b) => b.id), [2, 3, 4, 5]);
    for (const b of bodies) {
        assert.equal(b.r, 0.5);
        assert.ok(Math.hypot(b.x - 5, b.y) + b.r <= 1 + 1e-9);
    }
});

test('a combine starts at the area-weighted centre of its parents', () => {
    const parents = [body(1, 3, 0, 0), body(2, 1, 4, 0), body(3, 1, 9, 9)];
    const bodies = placeBirths(parents, [{ id: 4, volume: 4, from: [1, 2] }]);
    const kid = bodies.find((b) => b.id === 4);
    assert.deepEqual(bodies.map((b) => b.id), [3, 4]);
    assert.ok(near(kid.x, 1) && near(kid.y, 0));
    assert.equal(kid.r, 2);
});

test('settling pushes overlapping gloops apart and holds the pinned one', () => {
    let bodies = [body(1, 1, 0, 0), body(2, 1, 0.5, 0)];
    for (let i = 0; i < 60; i++) bodies = settle(bodies, 1 / 60, 1);
    const [a, b] = bodies;
    assert.deepEqual([a.x, a.y], [0, 0]);
    assert.ok(Math.hypot(b.x - a.x, b.y - a.y) >= 2 - 1e-6);
});

test('gloops on the same spot still part', () => {
    let bodies = [body(1, 1), body(2, 1), body(3, 1)];
    for (let i = 0; i < 120; i++) bodies = settle(bodies, 1 / 60);
    for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) assert.ok(Math.hypot(bodies[i].x - bodies[j].x, bodies[i].y - bodies[j].y) >= 2 - 1e-3);
    }
});

test('the scale depends only on the total, and the whole always fits', () => {
    assert.equal(targetScale(1, 800, 600), targetScale(1, 800, 600));
    const scale = targetScale(1, 375, 700);
    assert.ok(scale * 2 <= 375);
    assert.ok(targetScale(4, 800, 600) < targetScale(1, 800, 600));
});

test('screen and world positions round-trip', () => {
    const camera = { scale: 40, width: 300, height: 200, cx: 3, cy: -1 };
    const p = toWorld(toScreen({ x: 1.5, y: -2 }, camera), camera);
    assert.ok(near(p.x, 1.5) && near(p.y, -2));
    assert.deepEqual(toScreen({ x: 3, y: -1 }, camera), { x: 150, y: 100 });
});

test('zooming keeps the world point under the focus in place', () => {
    const camera = cameraFor(DEFAULT_VIEW, 50, 400, 300);
    const focus = { x: 320, y: 40 };
    const before = toWorld(focus, camera);
    const view = zoomAt(DEFAULT_VIEW, camera, focus, 3);
    const after = toWorld(focus, cameraFor(view, 50, 400, 300));
    assert.equal(view.zoom, 3);
    assert.ok(near(after.x, before.x) && near(after.y, before.y));
    assert.equal(zoomAt(view, camera, focus, 1000).zoom, MAX_ZOOM);
});

test('panning moves the world with the finger', () => {
    const camera = cameraFor(DEFAULT_VIEW, 50, 400, 300);
    const view = panBy(DEFAULT_VIEW, camera, 100, -50);
    assert.deepEqual(toScreen({ x: 0, y: 0 }, cameraFor(view, 50, 400, 300)), { x: 300, y: 100 });
    assert.ok(isDefaultView(DEFAULT_VIEW) && !isDefaultView(view));
});

test('a tiny gloop is touchable across the minimum radius', () => {
    const camera = cam(100, 400, 400);
    const bodies = [body(1, 0.0001, 0, 0)];
    assert.equal(hitTest(bodies, camera, { x: 215, y: 200 }, 22), 1);
    assert.equal(hitTest(bodies, camera, { x: 230, y: 200 }, 22), null);
    assert.equal(hitTest(bodies, camera, { x: 200, y: 200 }, 22, 1), null);
});

test('a lasso selects the gloops whose centres it encloses', () => {
    const camera = cam(10, 200, 200);
    const bodies = [body(1, 1, 0, 0), body(2, 1, 5, 0), body(3, 1, -8, 0)];
    const square = [{ x: 90, y: 90 }, { x: 160, y: 90 }, { x: 160, y: 110 }, { x: 90, y: 110 }];
    assert.deepEqual(lassoSelect(bodies, camera, square), [1, 2]);
});

test('a selection groups by nearness and leaves a remainder', () => {
    const bodies = [0, 1, 10, 11, 20].map((x, i) => body(i + 1, 1, x, 0));
    const { groups, remainder } = groupByProximity(bodies, [5, 4, 3, 2, 1], 2);
    assert.deepEqual(groups, [[1, 2], [3, 4]]);
    assert.deepEqual(remainder, [5]);
});
