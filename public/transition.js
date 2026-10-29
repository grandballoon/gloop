// public/transition.js
// How a split or combine looks while it happens, as pure functions of a
// transition and the time.
//
// A transition is one family: the parents an operation used up, kept as
// ghost circles, and the ids of the gloops it made. Over DURATION the
// ghosts slide to where the new gloops are and shrink, while the new
// gloops grow from nothing, joined to the ghosts by necks so the family
// reads as one fluid body pulling apart or flowing together. Areas are
// eased, not radii: a ghost's area falls as 1 − e while a new gloop's
// rises as e, so in the finite world the drawn total never changes.

export const DURATION = 0.42; // seconds

const ease = (t) => t * t * (3 - 2 * t);

// One transition per family of born gloops, with ghosts taken from the
// bodies as they were before the operation.
export function createTransitions(bodies, born, now) {
    const byId = new Map(bodies.map((b) => [b.id, b]));
    const families = new Map();
    for (const kid of born) {
        const key = kid.from.join(',');
        if (!families.has(key)) families.set(key, { from: kid.from, kids: [] });
        families.get(key).kids.push(kid.id);
    }
    return [...families.values()].map(({ from, kids }) => ({
        start: now,
        ghosts: from.map((id) => byId.get(id)).filter(Boolean).map(({ x, y, r }) => ({ x, y, r })),
        kids,
    }));
}

// What the running transitions add to a frame at `now`: ghost circles,
// the radius each growing gloop is drawn at, and the necks joining ghosts
// to gloops, all in world units; plus the transitions still running.
export function transitionFrame(transitions, bodies, now) {
    const byId = new Map(bodies.map((b) => [b.id, b]));
    const frame = { ghosts: [], radii: new Map(), necks: [], live: [] };
    for (const tr of transitions) {
        const t = (now - tr.start) / DURATION;
        if (t >= 1) continue;
        frame.live.push(tr);
        const e = ease(Math.max(0, t));
        const kids = tr.kids.map((id) => byId.get(id)).filter(Boolean);
        if (!kids.length) continue;
        const cx = kids.reduce((s, k) => s + k.x, 0) / kids.length;
        const cy = kids.reduce((s, k) => s + k.y, 0) / kids.length;
        const grown = kids.map((k) => {
            const r = k.r * Math.sqrt(e);
            frame.radii.set(k.id, r);
            return { x: k.x, y: k.y, r };
        });
        const ghosts = tr.ghosts.map((g) => ({ x: g.x + (cx - g.x) * e, y: g.y + (cy - g.y) * e, r: g.r * Math.sqrt(1 - e) }));
        frame.ghosts.push(...ghosts);
        for (const g of ghosts) for (const k of grown) frame.necks.push([g, k]);
    }
    return frame;
}

// The neck joining two nearby circles, as the outline points and Bézier
// handles of a metaball bridge, or null when the circles are too far
// apart, one is inside the other, or either has no size. The outline runs
// p1 → (h1, h3) → p3, across b to p4, → (h4, h2) → p2, and back across a.
// `spread` is how far round each circle the neck attaches, from 0 to 1.
export function neck(a, b, spread = 0.5, handleSize = 2.4) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (a.r <= 0 || b.r <= 0 || d > a.r + b.r * 2.5 || d <= Math.abs(a.r - b.r)) return null;
    const overlapping = d < a.r + b.r;
    const u1 = overlapping ? Math.acos((a.r ** 2 + d ** 2 - b.r ** 2) / (2 * a.r * d)) : 0;
    const u2 = overlapping ? Math.acos((b.r ** 2 + d ** 2 - a.r ** 2) / (2 * b.r * d)) : 0;
    const between = Math.atan2(b.y - a.y, b.x - a.x);
    const maxSpread = Math.acos((a.r - b.r) / d);
    const angle1 = between + u1 + (maxSpread - u1) * spread;
    const angle2 = between - u1 - (maxSpread - u1) * spread;
    const angle3 = between + Math.PI - u2 - (Math.PI - u2 - maxSpread) * spread;
    const angle4 = between - Math.PI + u2 + (Math.PI - u2 - maxSpread) * spread;
    const p1 = polar(a, angle1, a.r);
    const p2 = polar(a, angle2, a.r);
    const p3 = polar(b, angle3, b.r);
    const p4 = polar(b, angle4, b.r);
    const handle = Math.min(spread * handleSize, Math.hypot(p3.x - p1.x, p3.y - p1.y) / (a.r + b.r)) * Math.min(1, (d * 2) / (a.r + b.r));
    return {
        p1,
        p2,
        p3,
        p4,
        h1: polar(p1, angle1 - Math.PI / 2, a.r * handle),
        h2: polar(p2, angle2 + Math.PI / 2, a.r * handle),
        h3: polar(p3, angle3 + Math.PI / 2, b.r * handle),
        h4: polar(p4, angle4 - Math.PI / 2, b.r * handle),
    };
}

const polar = (c, angle, r) => ({ x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) });
