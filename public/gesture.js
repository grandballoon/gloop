// public/gesture.js
// Touch, as a pure state machine: a pointer event and the current state
// give a new state and a list of effects for the shell to carry out. What
// is under a point comes from the context's hitAt(point, excludeId), so
// the machine never sees bodies or the camera. Every event carries a time
// in seconds, and the shell sends a tick each frame so a held finger can
// become a long press.
//
// One finger: tap a gloop to toggle it, hold it to make it the unit, or
// drag it and drop it on another to combine the two. Drag across empty
// space to lasso, tap it to clear the selection, and double-tap it to
// select everything.
//
// Several fingers on gloops form a hand, and the number of fingers is the
// number in the operation:
// - Spread k fingers apart to split into k. Spreading further dials k up,
//   one piece for every DIAL_STEP pixels past DIAL_FREE.
// - Pinch fingers together to combine the gloops under them.
// - Pinch g fingers together, lift some, and spread the m that are left
//   to regroup g into m.
// A hand acts on the whole selection when a finger lands on a selected
// gloop, and on the touched gloops otherwise. Nothing happens until a
// finger lifts, so moving back cancels; pending(state, time) says what
// would happen, for the shell to preview.
//
// Several fingers on empty space zoom and pan. A quick tap of two fingers
// undoes, and of three redoes.
//
// Effects: toggle { id }, clear, all, unit { id }, lasso { path },
// drag { id, dx, dy }, combine { ids }, split { ids, k },
// regroup { ids, g, m }, pan { dx, dy }, zoom { focus, factor }, undo, redo.

export const TAP_SLOP = 8; // pixels a finger may wander and still tap
export const TAP_TIME = 0.3; // seconds a multi-finger tap may last
export const DOUBLE_TAP_TIME = 0.35; // seconds between the taps of a double tap
export const DOUBLE_TAP_SLOP = 30; // pixels between them
export const LONG_PRESS = 0.5; // seconds a finger holds a gloop to make it the unit
export const SPREAD = 1.5; // a hand spreads to this multiple of its first size,
export const SPREAD_PX = 20; // and by at least this many pixels, to split
export const PINCH = 0.6; // it pinches to this multiple,
export const PINCH_PX = 12; // and by at least this many pixels, to combine
export const DIAL_FREE = 40; // pixels of spread past the threshold before k dials up
export const DIAL_STEP = 20; // pixels of spread per extra piece
export const MAX_PIECES = 20;

export const IDLE = { mode: 'idle', pointers: {} };

const HOLD_SHOWN = 0.25; // a long press is previewed once this share of it has passed
const MIN_SIZE = 4; // pixels: the smallest a hand is taken to be

export function step(state, event, context) {
    const { type, pointerId: id, point, time } = event;
    if (type === 'tick') return tick(state, time);
    if (type === 'down') return down(state, id, point, time, context);
    if (!(id in state.pointers)) return unchanged(state);
    if (type === 'move') return move({ ...state, pointers: { ...state.pointers, [id]: point } }, point, context);
    const { [id]: _, ...pointers } = state.pointers;
    return lift(state, pointers, type === 'up', time);
}

// What the current touch would do if it ended now, for the shell to
// preview: hold { id, progress }, split { ids, k, at }, combine { ids, at },
// regroup { ids, g, m, at }, or null.
export function pending(state, time) {
    if (state.mode === 'press') {
        const progress = (time - state.began) / LONG_PRESS;
        return progress >= HOLD_SHOWN ? { type: 'hold', id: state.id, progress: Math.min(1, progress) } : null;
    }
    if (state.mode !== 'hand') return null;
    const at = centroid(Object.values(state.pointers));
    switch (state.phase) {
        case 'split':
            return { type: 'split', ids: state.targets, k: pieces(state), at };
        case 'gather':
            return { type: 'combine', ids: state.targets, at };
        case 'regroup':
            return { type: 'regroup', ids: state.targets, g: state.g, m: count(state), at };
        default:
            return null;
    }
}

function tick(state, time) {
    if (state.mode !== 'press' || time - state.began < LONG_PRESS) return unchanged(state);
    return { state: spent(state.pointers, null), effects: [{ type: 'unit', id: state.id }] };
}

function down(state, id, point, time, context) {
    const pointers = { ...state.pointers, [id]: point };
    switch (state.mode) {
        case 'idle': {
            const hit = context.hitAt(point);
            if (hit == null) return unchanged({ mode: 'lasso', pointers, primary: id, path: [point], began: time, lastTap: state.lastTap });
            return unchanged({ mode: 'press', pointers, primary: id, id: hit, start: point, began: time });
        }
        case 'press':
        case 'lasso': {
            const first = state.mode === 'press' ? state.start : state.path[0];
            const starts = { [state.primary]: first, [id]: point };
            return unchanged(several(pointers, starts, state.began, context));
        }
        case 'hand':
            if (state.phase === 'gather' || state.phase === 'regroup') return unchanged(state);
            return unchanged(several(pointers, { ...state.starts, [id]: point }, state.began, context, state));
        case 'camera':
            return unchanged(camera(pointers, { ...state.starts, [id]: point }, state.began, state.moved));
        default:
            // A finger that lands during a drag or after a gesture has
            // acted is never tracked.
            return unchanged(state);
    }
}

// Two or more fingers: a hand if any touches a gloop, the camera if not.
function several(pointers, starts, began, { hitAt, selected }, previous = null) {
    const points = Object.values(starts);
    const moved = movedFrom(pointers, starts) || Boolean(previous?.moved);
    const touched = [...new Set([...points, centroid(points)].map((p) => hitAt(p)).filter((hit) => hit != null))];
    if (!touched.length) return camera(pointers, starts, began, moved);
    const onSelection = touched.some((hit) => selected.has(hit));
    const size = Math.max(spread(Object.values(pointers)), MIN_SIZE);
    return { mode: 'hand', phase: 'open', pointers, starts, began, moved, touched, onSelection, targets: onSelection ? [...selected] : touched, size, peak: Object.keys(pointers).length };
}

function camera(pointers, starts, began, moved) {
    const points = Object.values(pointers);
    return { mode: 'camera', pointers, starts, began, moved, mid: centroid(points), size: spread(points), peak: points.length };
}

function move(state, point, { hitAt }) {
    switch (state.mode) {
        case 'press':
            if (distance(point, state.start) <= TAP_SLOP) return unchanged(state);
            return dragTo({ ...state, mode: 'drag', last: state.start }, point, hitAt);
        case 'drag':
            return dragTo(state, point, hitAt);
        case 'lasso':
            return unchanged({ ...state, path: [...state.path, point] });
        case 'hand':
            return unchanged(shape({ ...state, moved: state.moved || movedFrom(state.pointers, state.starts) }));
        case 'camera':
            return look(state);
        case 'spent':
            return unchanged(state.tap && movedFrom(state.pointers, state.starts) ? { ...state, tap: null } : state);
        default:
            return unchanged(state);
    }
}

// Moves a hand between its phases as it spreads and pinches. Each
// threshold is crossed back at the halfway point to it, so a hand resting
// near one does not flicker.
function shape(hand) {
    const size = spread(Object.values(hand.pointers));
    switch (hand.phase) {
        case 'open':
            if (size >= spreadAt(hand.size)) return { ...hand, phase: 'split' };
            if (size <= pinchAt(hand.size) && hand.targets.length >= 2) return gather(hand);
            return hand;
        case 'split':
            if (size <= pinchAt(hand.size) && hand.targets.length >= 2) return gather(hand);
            return size < (hand.size + spreadAt(hand.size)) / 2 ? { ...hand, phase: 'open' } : hand;
        case 'gather':
            if (count(hand) === hand.g) return size > (hand.size + pinchAt(hand.size)) / 2 ? { ...hand, phase: 'open' } : hand;
            return count(hand) >= 2 && count(hand) < hand.g && size >= spreadAt(hand.liftSize) ? { ...hand, phase: 'regroup' } : hand;
        case 'regroup':
            return size < (hand.liftSize + spreadAt(hand.liftSize)) / 2 ? { ...hand, phase: 'gather' } : hand;
        default:
            return hand;
    }
}

// A pinched hand. On a selection, the fingers are the group size; on
// touched gloops, the touched gloops are the one group.
function gather(hand) {
    const g = hand.onSelection ? count(hand) : hand.touched.length;
    return { ...hand, phase: 'gather', g, liftSize: hand.size };
}

function lift(state, pointers, up, time) {
    const left = Object.keys(pointers).length;
    const rest = (tap) => (left ? spent(pointers, tap, state) : IDLE);
    switch (state.mode) {
        case 'press':
        case 'drag':
        case 'lasso':
            return up ? finish(state, time) : unchanged(IDLE);
        case 'hand':
            if (state.phase === 'gather') {
                if (left) return unchanged({ ...state, pointers, liftSize: Math.max(spread(Object.values(pointers)), MIN_SIZE) });
                return { state: IDLE, effects: up ? [{ type: 'combine', ids: state.targets }] : [] };
            }
            if (state.phase === 'split') return { state: rest(null), effects: up ? [{ type: 'split', ids: state.targets, k: pieces(state) }] : [] };
            if (state.phase === 'regroup') return { state: rest(null), effects: up ? [{ type: 'regroup', ids: state.targets, g: state.g, m: count(state) }] : [] };
            return unchanged(rest(state.moved ? null : state.peak));
        case 'camera':
            return unchanged(rest(state.moved ? null : state.peak));
        case 'spent': {
            if (left) return unchanged({ ...state, pointers });
            const quick = up && state.tap != null && time - state.began <= TAP_TIME;
            return { state: IDLE, effects: quick ? tapped(state.tap) : [] };
        }
        default:
            return unchanged(IDLE);
    }
}

// The fingers still down after a gesture has acted or broken up. tap is
// how many fingers took part, while the gesture can still be a tap.
function spent(pointers, tap, from = {}) {
    return { mode: 'spent', pointers, starts: from.starts ?? {}, began: from.began, tap };
}

const tapped = (fingers) => (fingers === 2 ? [{ type: 'undo' }] : fingers === 3 ? [{ type: 'redo' }] : []);

function finish(state, time) {
    switch (state.mode) {
        case 'press':
            return { state: IDLE, effects: [{ type: 'toggle', id: state.id }] };
        case 'drag':
            return { state: IDLE, effects: state.target == null ? [] : [{ type: 'combine', ids: [state.id, state.target] }] };
        default: {
            if (drawn(state.path)) return { state: IDLE, effects: [{ type: 'lasso', path: state.path }] };
            const point = state.path[0];
            const last = state.lastTap;
            if (last && time - last.time <= DOUBLE_TAP_TIME && distance(point, last.point) <= DOUBLE_TAP_SLOP) return { state: IDLE, effects: [{ type: 'all' }] };
            return { state: { ...IDLE, lastTap: { point, time } }, effects: [{ type: 'clear' }] };
        }
    }
}

function dragTo(state, point, hitAt) {
    const effects = [{ type: 'drag', id: state.id, dx: point.x - state.last.x, dy: point.y - state.last.y }];
    return { state: { ...state, last: point, target: hitAt(point, state.id) }, effects };
}

function look(state) {
    const points = Object.values(state.pointers);
    const mid = centroid(points);
    const size = spread(points);
    const effects = [{ type: 'pan', dx: mid.x - state.mid.x, dy: mid.y - state.mid.y }];
    if (state.size > 0 && size > 0) effects.push({ type: 'zoom', focus: mid, factor: size / state.size });
    return { state: { ...state, mid, size, moved: state.moved || movedFrom(state.pointers, state.starts) }, effects };
}

// How many pieces a spreading hand makes: one per finger, and more as it
// spreads past the free distance.
function pieces(hand) {
    const beyond = spread(Object.values(hand.pointers)) - spreadAt(hand.size) - DIAL_FREE;
    return Math.min(MAX_PIECES, count(hand) + Math.max(0, Math.floor(beyond / DIAL_STEP) + 1));
}

const spreadAt = (size) => Math.max(size * SPREAD, size + SPREAD_PX);
const pinchAt = (size) => Math.min(size * PINCH, size - PINCH_PX);
const count = (state) => Object.keys(state.pointers).length;

// Whether a lasso path is a real stroke rather than a tap.
function drawn(path) {
    const xs = path.map((p) => p.x);
    const ys = path.map((p) => p.y);
    return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) > TAP_SLOP * 2;
}

const movedFrom = (pointers, starts) => Object.entries(pointers).some(([id, p]) => starts[id] && distance(p, starts[id]) > TAP_SLOP);

// The mean distance of the points from their centre.
function spread(points) {
    const c = centroid(points);
    return points.reduce((s, p) => s + distance(p, c), 0) / points.length;
}

function centroid(points) {
    const n = points.length;
    return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
}

const unchanged = (state) => ({ state, effects: [] });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
