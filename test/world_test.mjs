// test/world_test.mjs
//
// The core (public/world.js, public/rational.js): the four operations in
// both worlds, with exact volumes.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/world_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createWorld, combine, split, regroup, setUnit, clearUnit, measure, totalVolume, FINITE, INFINITE } = await import('../public/world.js');
const { rat, ONE, format, toNumber } = await import('../public/rational.js');

const volumes = (world) => world.gloops.map((g) => format(g.volume));
const ids = (world) => world.gloops.map((g) => g.id);

test('rationals stay in lowest terms', () => {
    assert.deepEqual(rat(2, 4), rat(1, 2));
    assert.deepEqual(rat(6, -4), rat(-3, 2));
    assert.equal(format(rat(3, 1)), '3');
});

test('a ratio of huge parts still converts to a number', () => {
    assert.equal(toNumber(rat(2n ** 3000n + 1n, 2n ** 2999n)), 2);
    assert.equal(toNumber(rat(1, 4)), 0.25);
});

test('each world starts as one gloop of volume 1', () => {
    for (const kind of [FINITE, INFINITE]) {
        const world = createWorld(kind);
        assert.deepEqual(volumes(world), ['1']);
        assert.equal(world.unit, null);
    }
});

test('a finite split shares the volume out', () => {
    const { world, born } = split(createWorld(FINITE), [1], 3);
    assert.deepEqual(volumes(world), ['1/3', '1/3', '1/3']);
    assert.deepEqual(born.map((b) => b.from), [[1], [1], [1]]);
});

test('an infinite split makes more of the same gloop', () => {
    const { world } = split(createWorld(INFINITE), [1], 3);
    assert.deepEqual(volumes(world), ['1', '1', '1']);
});

test('an infinite combine makes one gloop like every other', () => {
    const ones = split(createWorld(INFINITE), [1], 5).world;
    const { world } = combine(ones, ids(ones).slice(0, 3));
    assert.deepEqual(volumes(world), ['1', '1', '1']);
});

test('three thirds recombine to exactly one', () => {
    const { world } = split(createWorld(FINITE), [1], 3);
    const merged = combine(world, ids(world)).world;
    assert.deepEqual(volumes(merged), ['1']);
});

test('splitting several gloops splits each of them', () => {
    const halves = split(createWorld(FINITE), [1], 2).world;
    const { world, born } = split(halves, ids(halves), 3);
    assert.equal(world.gloops.length, 6);
    assert.deepEqual(new Set(volumes(world)), new Set(['1/6']));
    assert.deepEqual(born.map((b) => b.from[0]), [2, 2, 2, 3, 3, 3]);
});

test('the finite total never changes', () => {
    let world = createWorld(FINITE);
    world = split(world, [1], 7).world;
    world = combine(world, ids(world).slice(0, 3)).world;
    world = split(world, ids(world), 2).world;
    world = regroup(world, [ids(world).slice(0, 3)], 2).world;
    assert.deepEqual(totalVolume(world), ONE);
});

test('a finite regroup combines each group, then shares it out', () => {
    const sixths = split(createWorld(FINITE), [1], 6).world;
    const [a, b, c, d, e, f] = ids(sixths);
    const { world, born } = regroup(sixths, [[a, b, c], [d, e, f]], 2);
    assert.deepEqual(volumes(world), ['1/4', '1/4', '1/4', '1/4']);
    assert.deepEqual(born.map((kid) => kid.from), [[a, b, c], [a, b, c], [d, e, f], [d, e, f]]);
});

test('an infinite regroup changes only the count', () => {
    const ones = split(createWorld(INFINITE), [1], 3).world;
    const { world } = regroup(ones, [ids(ones)], 2);
    assert.deepEqual(volumes(world), ['1', '1']);
});

test('a regroup leaves gloops outside the groups alone', () => {
    const ones = split(createWorld(INFINITE), [1], 7).world;
    const [a, b, c, d, e, f, g] = ids(ones);
    const { world } = regroup(ones, [[a, b], [c, d], [e, f]], 1);
    assert.deepEqual(ids(world)[0], g);
    assert.equal(world.gloops.length, 4);
});

test('operations refuse what they cannot do', () => {
    const world = split(createWorld(FINITE), [1], 4).world;
    const [a, b, c] = ids(world);
    assert.ok(combine(world, [a]).refused);
    assert.ok(combine(world, [a, a]).refused);
    assert.ok(combine(world, [a, 99]).refused);
    assert.ok(split(world, [], 2).refused);
    assert.ok(split(world, [a], 1).refused);
    assert.ok(split(world, [a], 2.5).refused);
    assert.ok(regroup(world, [], 1).refused);
    assert.ok(regroup(world, [[a, b], [c]], 1).refused);
    assert.ok(regroup(world, [[a, b]], 2).refused);
    assert.ok(regroup(world, [[a, b]], 0).refused);
});

test('a unit measures every volume', () => {
    const thirds = split(createWorld(FINITE), [1], 3).world;
    const unit = setUnit(thirds, ids(thirds)[0]).world;
    assert.equal(format(measure(unit, unit.gloops[1].volume)), '1');
    assert.equal(format(measure(unit, totalVolume(unit))), '3');
    assert.equal(measure(clearUnit(unit).world, totalVolume(unit)), null);
});

test('infinite gloops have no volume to measure', () => {
    assert.ok(setUnit(createWorld(INFINITE), 1).refused);
});
