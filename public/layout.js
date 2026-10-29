// public/layout.js
// Where gloops sit and how they are seen, as pure functions over plain
// values. Positions are in world units, where a gloop of volume 1 has
// radius 1, so a gloop's radius is √volume: area is volume, honestly.
//
// A body is { id, x, y, r }. How a body grows or shrinks during a split
// or combine is transition.js's business, not the physics'.

const GAP = 1.04; // bodies rest this far apart, as a multiple of touching
const PULL = 2; // per second, the fraction of its distance a body drifts toward the middle
const ITERATIONS = 4;
const FILL = 0.3; // the share of the view the whole world's area covers
const MAX_WHOLE = 0.4; // the whole, merged into one, never has a radius past this share of the view's short side

export const body = (id, volume, x = 0, y = 0) => ({ id, x, y, r: Math.sqrt(volume) });

// The bodies after births: each born gloop's parents are removed, and the
// new gloops start where their parents were. A family of several (a
// split) starts in a ring inside the parents' outline; a single gloop (a
// combine) starts at their area-weighted centre.
// born is [{ id, volume, from }] with volume a plain number.
export function placeBirths(bodies, born) {
    const byId = new Map(bodies.map((b) => [b.id, b]));
    const families = new Map();
    for (const kid of born) {
        const key = kid.from.join(',');
        if (!families.has(key)) families.set(key, []);
        families.get(key).push(kid);
    }
    const babies = [];
    for (const kids of families.values()) {
        const parents = kids[0].from.map((id) => byId.get(id)).filter(Boolean);
        const area = parents.reduce((s, p) => s + p.r ** 2, 0);
        const cx = area ? parents.reduce((s, p) => s + p.x * p.r ** 2, 0) / area : 0;
        const cy = area ? parents.reduce((s, p) => s + p.y * p.r ** 2, 0) / area : 0;
        const outline = Math.sqrt(area);
        kids.forEach((kid, i) => {
            const r = Math.sqrt(kid.volume);
            const spread = kids.length === 1 ? 0 : Math.max(outline - r, r * 0.5);
            const angle = (2 * Math.PI * i) / kids.length + 0.3;
            babies.push({ id: kid.id, x: cx + spread * Math.cos(angle), y: cy + spread * Math.sin(angle), r });
        });
    }
    const gone = new Set(born.flatMap((kid) => kid.from));
    return [...bodies.filter((b) => !gone.has(b.id)), ...babies];
}

// One frame of settling: every body drifts toward the middle, and
// overlapping bodies push apart, the smaller moving more. The pinned body
// (the one being dragged) stays put.
export function settle(bodies, dt, pinnedId = null) {
    const pull = Math.min(1, dt * PULL);
    const next = bodies.map((b) => (b.id === pinnedId ? { ...b } : { ...b, x: b.x * (1 - pull), y: b.y * (1 - pull) }));
    for (let i = 0; i < ITERATIONS; i++) separate(next, pinnedId);
    return next;
}

// Pushes overlapping bodies apart in place. A grid with cells as wide as
// the biggest body keeps this near linear.
function separate(bodies, pinnedId) {
    if (bodies.length < 2) return;
    const cell = 2 * GAP * Math.max(...bodies.map((b) => b.r));
    if (!(cell > 0)) return;
    const grid = new Map();
    const key = (cx, cy) => `${cx},${cy}`;
    bodies.forEach((b, i) => {
        const k = key(Math.floor(b.x / cell), Math.floor(b.y / cell));
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
    });
    bodies.forEach((a, i) => {
        const cx = Math.floor(a.x / cell);
        const cy = Math.floor(a.y / cell);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (const j of grid.get(key(cx + dx, cy + dy)) ?? []) {
                    if (j > i) pushApart(a, bodies[j], i + j, pinnedId);
                }
            }
        }
    });
}

function pushApart(a, b, seed, pinnedId) {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let d = Math.hypot(dx, dy);
    const min = (a.r + b.r) * GAP;
    if (d >= min) return;
    if (d < 1e-9) {
        // Bodies on the same spot part in a direction fixed by their order.
        dx = Math.cos(seed * 2.399963);
        dy = Math.sin(seed * 2.399963);
        d = 0;
    } else {
        dx /= d;
        dy /= d;
    }
    const overlap = min - d;
    const areas = a.r ** 2 + b.r ** 2;
    const wa = a.id === pinnedId ? 0 : b.id === pinnedId ? 1 : areas ? b.r ** 2 / areas : 0.5;
    const wb = b.id === pinnedId ? 0 : 1 - wa;
    a.x -= dx * overlap * wa;
    a.y -= dy * overlap * wa;
    b.x += dx * overlap * wb;
    b.y += dy * overlap * wb;
}

// Pixels per world unit. It depends only on the world's total volume, so
// the finite world, whose total never changes, is never rescaled, and a
// split never makes the pieces look bigger than the whole they came from.
export function targetScale(totalVolume, width, height) {
    const byArea = Math.sqrt((FILL * width * height) / (Math.PI * totalVolume));
    const byWhole = (MAX_WHOLE * Math.min(width, height)) / Math.sqrt(totalVolume);
    return Math.min(byArea, byWhole);
}

export const easeScale = (scale, target, dt) => scale + (target - scale) * Math.min(1, dt * 3);

// A camera is { scale, width, height, cx, cy }: pixels per world unit, the
// view's size, and the world point at the view's centre.
export const toScreen = (p, cam) => ({ x: cam.width / 2 + (p.x - cam.cx) * cam.scale, y: cam.height / 2 + (p.y - cam.cy) * cam.scale });
export const toWorld = (p, cam) => ({ x: (p.x - cam.width / 2) / cam.scale + cam.cx, y: (p.y - cam.height / 2) / cam.scale + cam.cy });

// A learner's view sits on top of the automatic scale: a zoom factor, and
// the world point at the view's centre.
export const DEFAULT_VIEW = { zoom: 1, cx: 0, cy: 0 };
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 32;

export const cameraFor = (view, autoScale, width, height) => ({ scale: autoScale * view.zoom, width, height, cx: view.cx, cy: view.cy });

export const isDefaultView = (view) => view.zoom === 1 && view.cx === 0 && view.cy === 0;

// The view zoomed by `factor` about a screen point, which stays over the
// same world point.
export function zoomAt(view, cam, focus, factor) {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
    const at = toWorld(focus, cam);
    const scale = (cam.scale * zoom) / view.zoom;
    return { zoom, cx: at.x - (focus.x - cam.width / 2) / scale, cy: at.y - (focus.y - cam.height / 2) / scale };
}

// The view moved so the world follows a drag of (dx, dy) screen pixels.
export const panBy = (view, cam, dx, dy) => ({ ...view, cx: view.cx - dx / cam.scale, cy: view.cy - dy / cam.scale });

// The id of the body under a screen point, or null. Every body can be
// touched across at least minPx, however small it is drawn; where touch
// areas overlap, the body whose centre is relatively nearest wins.
export function hitTest(bodies, cam, point, minPx, excludeId = null) {
    let best = null;
    let bestScore = 1;
    for (const b of bodies) {
        if (b.id === excludeId) continue;
        const c = toScreen(b, cam);
        const score = Math.hypot(point.x - c.x, point.y - c.y) / Math.max(b.r * cam.scale, minPx);
        if (score < bestScore) {
            best = b.id;
            bestScore = score;
        }
    }
    return best;
}

// The ids of the bodies whose centres are inside a screen polygon.
export function lassoSelect(bodies, cam, polygon) {
    return bodies.filter((b) => insidePolygon(toScreen(b, cam), polygon)).map((b) => b.id);
}

export function insidePolygon(p, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

// The selection cut into groups of g by nearness: the leftmost gloop not
// yet grouped takes its g − 1 nearest neighbours, until fewer than g are
// left. Those are the remainder.
export function groupByProximity(bodies, ids, g) {
    const at = new Map(bodies.map((b) => [b.id, b]));
    let left = ids.filter((id) => at.has(id)).sort((a, b) => at.get(a).x - at.get(b).x || a - b);
    const groups = [];
    while (left.length >= g) {
        const seed = at.get(left[0]);
        const distance = (id) => Math.hypot(at.get(id).x - seed.x, at.get(id).y - seed.y);
        const group = [...left].sort((a, b) => distance(a) - distance(b) || a - b).slice(0, g);
        groups.push(group);
        left = left.filter((id) => !group.includes(id));
    }
    return { groups, remainder: left };
}
