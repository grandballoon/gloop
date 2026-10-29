// public/world.js
// The functional core: a world is a set of gloops, and the operations are
// pure functions from one world to the next. Where gloops sit is not
// here; layout.js and the shell own positions.
//
// A finite gloop has an exact volume, its share of the whole. An infinite
// gloop has no volume: every one is the same, so its volume is always 1
// and only the count of gloops changes.
//
// Every operation returns either { world, born } or { refused }, where
// refused is a sentence for the learner. born lists each new gloop as
// { id, volume, from }: the ids it came from, which are gone from the new
// world, so the shell can place it where its parents were.

import { ONE, div, divInt, sum } from './rational.js';

export const FINITE = 'finite';
export const INFINITE = 'infinite';

export function createWorld(kind) {
    return { kind, gloops: [{ id: 1, volume: ONE }], nextId: 2, unit: null };
}

// Combine k gloops into one.
export function combine(world, ids) {
    if (ids.length < 2) return { refused: 'Select at least two gloops to combine.' };
    const refused = checkIds(world, ids);
    if (refused) return { refused };
    return replace(world, [{ from: ids, volumes: pieces(world, sum(volumesOf(world, ids)), 1) }]);
}

// Split each selected gloop into k. One selected gloop is operation 2;
// several is operation 3.
export function split(world, ids, k) {
    if (ids.length < 1) return { refused: 'Select a gloop to split.' };
    if (!Number.isInteger(k) || k < 2) return { refused: 'A gloop splits into at least two.' };
    const refused = checkIds(world, ids);
    if (refused) return { refused };
    const volumes = volumesOf(world, ids);
    return replace(world, ids.map((id, i) => ({ from: [id], volumes: pieces(world, volumes[i], k) })));
}

// Combine each group, then split it into m: operation 4. Every group has
// the same size g, and m is fewer than g.
export function regroup(world, groups, m) {
    if (groups.length < 1) return { refused: 'Select a group to regroup.' };
    const g = groups[0].length;
    if (groups.some((group) => group.length !== g)) return { refused: 'Every group must be the same size.' };
    if (!Number.isInteger(m) || m < 1 || m >= g) return { refused: `Groups of ${g} regroup into fewer than ${g}.` };
    const refused = checkIds(world, groups.flat());
    if (refused) return { refused };
    return replace(world, groups.map((group) => ({ from: group, volumes: pieces(world, sum(volumesOf(world, group)), m) })));
}

// Declare a finite gloop's volume to be 1. Every label is relative to it.
export function setUnit(world, id) {
    if (world.kind !== FINITE) return { refused: 'Infinite gloops have no volume to measure.' };
    const refused = checkIds(world, [id]);
    if (refused) return { refused };
    return { world: { ...world, unit: volumesOf(world, [id])[0] }, born: [] };
}

export function clearUnit(world) {
    return { world: { ...world, unit: null }, born: [] };
}

// A volume measured in the world's unit, or null when there is no unit.
export const measure = (world, volume) => (world.unit ? div(volume, world.unit) : null);

export const totalVolume = (world) => sum(world.gloops.map((g) => g.volume));

// k gloops made from a volume: in the finite world they share it out; in
// the infinite world they are k more gloops, each like every other.
function pieces(world, volume, k) {
    const each = world.kind === FINITE ? divInt(volume, k) : ONE;
    return Array.from({ length: k }, () => each);
}

function volumesOf(world, ids) {
    const byId = new Map(world.gloops.map((g) => [g.id, g.volume]));
    return ids.map((id) => byId.get(id));
}

function checkIds(world, ids) {
    const present = new Set(world.gloops.map((g) => g.id));
    if (ids.some((id) => !present.has(id))) return 'That gloop is gone.';
    if (new Set(ids).size !== ids.length) return 'A gloop can only be used once.';
    return null;
}

// The world with each family's parents replaced by its new gloops.
function replace(world, families) {
    let nextId = world.nextId;
    const born = families.flatMap(({ from, volumes }) => volumes.map((volume) => ({ id: nextId++, volume, from })));
    const gone = new Set(families.flatMap((f) => f.from));
    const gloops = [...world.gloops.filter((g) => !gone.has(g.id)), ...born.map(({ id, volume }) => ({ id, volume }))];
    return { world: { ...world, gloops, nextId }, born };
}
