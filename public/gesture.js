// public/gesture.js
// Touch, as a pure state machine: a pointer event and the current state
// give a new state and a list of effects for the shell to carry out. What
// is under a point comes from the context's hitAt(point, excludeId), so
// the machine never sees bodies or the camera.
//
// One finger: tap a gloop to toggle it, or drag it and drop it on another
// to combine the two; drag across empty space to lasso, or tap it to
// clear the selection.
// Two fingers on gloops: pinch together to combine, spread apart to split.
// That acts on the whole selection when a finger is on a selected gloop,
// and on the touched gloops otherwise.
// Two fingers on empty space: zoom and pan.
// A third finger is ignored, and once a two-finger gesture has acted or a
// finger has lifted, nothing more happens until every finger is up.
//
// Effects: toggle { id }, clear, lasso { path }, drag { id, dx, dy },
// combine { ids }, split { ids }, pan { dx, dy }, zoom { focus, factor }.

export const TAP_SLOP = 8; // pixels a finger may wander and still tap
export const SPREAD = 1.5; // spreading two fingers to this multiple of their first distance splits
export const PINCH = 0.6; // pinching them to this multiple combines

export const IDLE = { mode: 'idle', pointers: {} };

const ONE_FINGER = new Set(['press', 'drag', 'lasso']);

export function step(state, event, context) {
    const { type, pointerId: id, point } = event;
    if (type === 'down') return down(state, id, point, context);
    if (!(id in state.pointers)) return unchanged(state);
    if (type === 'move') return move(state, id, point, context);
    const { [id]: _, ...pointers } = state.pointers;
    const rest = Object.keys(pointers).length ? { mode: 'spent', pointers } : IDLE;
    if (ONE_FINGER.has(state.mode) && id !== state.primary) return unchanged({ ...state, pointers });
    return { state: rest, effects: type === 'up' ? finish(state) : [] };
}

function down(state, id, point, { hitAt, selected }) {
    const count = Object.keys(state.pointers).length;
    if (count >= 2) return unchanged(state);
    const pointers = { ...state.pointers, [id]: point };
    if (count === 0) {
        const hit = hitAt(point);
        if (hit == null) return unchanged({ mode: 'lasso', pointers, primary: id, path: [point] });
        return unchanged({ mode: 'press', pointers, primary: id, id: hit, start: point });
    }
    if (state.mode === 'press' || state.mode === 'lasso') return unchanged(twoFingers(pointers, hitAt, selected));
    return unchanged({ ...state, pointers });
}

function move(state, id, point, { hitAt }) {
    const pointers = { ...state.pointers, [id]: point };
    if (ONE_FINGER.has(state.mode) && id !== state.primary) return unchanged({ ...state, pointers });
    switch (state.mode) {
        case 'press':
            if (distance(point, state.start) <= TAP_SLOP) return unchanged({ ...state, pointers });
            return dragTo({ ...state, mode: 'drag', last: state.start }, pointers, point, hitAt);
        case 'drag':
            return dragTo(state, pointers, point, hitAt);
        case 'lasso':
            return unchanged({ ...state, pointers, path: [...state.path, point] });
        case 'pinch':
            return pinch(state, pointers);
        case 'camera':
            return camera(state, pointers);
        default:
            return unchanged({ ...state, pointers });
    }
}

function finish(state) {
    switch (state.mode) {
        case 'press':
            return [{ type: 'toggle', id: state.id }];
        case 'drag':
            return state.target == null ? [] : [{ type: 'combine', ids: [state.id, state.target] }];
        case 'lasso':
            return drawn(state.path) ? [{ type: 'lasso', path: state.path }] : [{ type: 'clear' }];
        default:
            return [];
    }
}

function dragTo(state, pointers, point, hitAt) {
    const effects = [{ type: 'drag', id: state.id, dx: point.x - state.last.x, dy: point.y - state.last.y }];
    return { state: { ...state, pointers, last: point, target: hitAt(point, state.id) }, effects };
}

function twoFingers(pointers, hitAt, selected) {
    const [a, b] = Object.values(pointers);
    const mid = midpoint(a, b);
    const touched = [...new Set([hitAt(a), hitAt(b), hitAt(mid)].filter((hit) => hit != null))];
    if (!touched.length) return { mode: 'camera', pointers, mid, span: distance(a, b) };
    const targets = touched.some((hit) => selected.has(hit)) ? [...selected] : touched;
    return { mode: 'pinch', pointers, targets, span: Math.max(distance(a, b), 1) };
}

function pinch(state, pointers) {
    const [a, b] = Object.values(pointers);
    const ratio = distance(a, b) / state.span;
    if (ratio >= SPREAD) return { state: { mode: 'spent', pointers }, effects: [{ type: 'split', ids: state.targets }] };
    if (ratio <= PINCH) return { state: { mode: 'spent', pointers }, effects: [{ type: 'combine', ids: state.targets }] };
    return unchanged({ ...state, pointers });
}

function camera(state, pointers) {
    const [a, b] = Object.values(pointers);
    const mid = midpoint(a, b);
    const span = distance(a, b);
    const effects = [{ type: 'pan', dx: mid.x - state.mid.x, dy: mid.y - state.mid.y }];
    if (state.span > 0 && span > 0) effects.push({ type: 'zoom', focus: mid, factor: span / state.span });
    return { state: { ...state, pointers, mid, span }, effects };
}

// Whether a lasso path is a real stroke rather than a tap.
function drawn(path) {
    const xs = path.map((p) => p.x);
    const ys = path.map((p) => p.y);
    return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) > TAP_SLOP * 2;
}

const unchanged = (state) => ({ state, effects: [] });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
