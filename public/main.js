// public/main.js
// The shell: holds each world's state, turns touches and buttons into
// operations, runs the settle loop, and draws. What an operation does is
// decided in world.js; where gloops sit, in layout.js.
//
// Touch: tap a gloop to select or deselect it, drag across empty space
// to lasso a selection, tap empty space to clear it, and drag one gloop
// onto another to combine the two. Buttons apply to the selection, and
// what an operation makes becomes the new selection, so pressing Split
// again splits the pieces.

import { createWorld, combine, split, regroup, setUnit, clearUnit, measure, totalVolume, FINITE, INFINITE } from './world.js';
import { toNumber, format } from './rational.js';
import { body, placeBirths, settle, targetScale, easeScale, hitTest, lassoSelect, groupByProximity, toWorld, toScreen } from './layout.js';

const MIN_TOUCH_PX = 22; // every gloop is touchable across at least this radius
const TAP_SLOP_PX = 8;
const LIMITS = { k: [2, 20], g: [2, 20], m: [1, 19] };

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

const view = { width: 1, height: 1, dpr: 1 };
const controls = { k: 2, g: 2, m: 1 };
const sessions = { [FINITE]: fresh(FINITE), [INFINITE]: fresh(INFINITE) };
let kind = FINITE;
let scale = null;
let gesture = null;
let palette = {};

function fresh(worldKind) {
    const world = createWorld(worldKind);
    return {
        world,
        bodies: world.gloops.map((g) => body(g.id, toNumber(g.volume))),
        history: [],
        selected: new Set(),
        leftover: new Set(),
        message: '',
    };
}

const session = () => sessions[kind];
const camera = () => ({ scale, width: view.width, height: view.height });

// Applies an operation's result: a refusal becomes the status message;
// anything else is recorded for undo and becomes the current state.
function apply(result, leftover = []) {
    const s = session();
    if (result.refused) {
        s.message = result.refused;
        return refresh();
    }
    s.history.push({ world: s.world, bodies: s.bodies, selected: new Set(s.selected) });
    s.world = result.world;
    s.bodies = placeBirths(s.bodies, result.born.map((kid) => ({ ...kid, volume: toNumber(kid.volume) })));
    if (result.born.length) s.selected = new Set(result.born.map((kid) => kid.id));
    s.leftover = new Set(leftover);
    s.message = leftover.length ? `${leftover.length} left over` : '';
    refresh();
}

const selection = () => [...session().selected].filter((id) => session().world.gloops.some((g) => g.id === id));

const actions = {
    all() {
        const s = session();
        s.selected = new Set(s.world.gloops.map((g) => g.id));
        refresh();
    },
    combine: () => apply(combine(session().world, selection())),
    split: () => apply(split(session().world, selection(), controls.k)),
    regroup() {
        const { groups, remainder } = groupByProximity(session().bodies, selection(), controls.g);
        if (!groups.length) return apply({ refused: `Select at least ${controls.g} gloops to regroup.` });
        apply(regroup(session().world, groups, controls.m), remainder);
    },
    unit() {
        const s = session();
        const ids = selection();
        apply(ids.length === 1 ? setUnit(s.world, ids[0]) : clearUnit(s.world));
    },
    undo() {
        const s = session();
        const last = s.history.pop();
        if (!last) return;
        Object.assign(s, last, { leftover: new Set(), message: '' });
        refresh();
    },
    reset() {
        sessions[kind] = fresh(kind);
        refresh();
    },
};

for (const [id, run] of Object.entries(actions)) $(id).addEventListener('click', run);

for (const tab of document.querySelectorAll('[data-world]')) {
    tab.addEventListener('click', () => {
        kind = tab.dataset.world;
        gesture = null;
        scale = null;
        refresh();
    });
}

for (const stepper of document.querySelectorAll('.stepper')) {
    const name = stepper.dataset.name;
    for (const button of stepper.querySelectorAll('button')) {
        button.addEventListener('click', () => {
            controls[name] += Number(button.dataset.step);
            clampControls();
            refresh();
        });
    }
}

function clampControls() {
    for (const [name, [low, high]] of Object.entries(LIMITS)) controls[name] = Math.min(high, Math.max(low, controls[name]));
    controls.m = Math.min(controls.m, controls.g - 1);
}

// Brings the page's text and buttons in line with the state.
function refresh() {
    const s = session();
    const count = s.world.gloops.length;
    const picked = selection().length;
    document.body.className = `world-${kind}`;
    palette = readPalette();
    for (const tab of document.querySelectorAll('[data-world]')) tab.setAttribute('aria-selected', String(tab.dataset.world === kind));
    for (const stepper of document.querySelectorAll('.stepper')) {
        const name = stepper.dataset.name;
        const [low, high] = LIMITS[name];
        const max = name === 'm' ? controls.g - 1 : high;
        stepper.querySelector('output').textContent = controls[name];
        stepper.querySelector('[data-step="-1"]').disabled = controls[name] <= low;
        stepper.querySelector('[data-step="1"]').disabled = controls[name] >= max;
    }
    $('all').disabled = picked === count;
    $('combine').disabled = picked < 2;
    $('split').disabled = picked < 1;
    $('regroup').disabled = picked < controls.g;
    $('unit').textContent = picked !== 1 && s.world.unit ? 'Clear unit' : 'Set unit';
    $('unit').disabled = picked !== 1 && !s.world.unit;
    $('unit').hidden = kind !== FINITE;
    $('undo').disabled = !s.history.length;
    const parts = [`${count} ${count === 1 ? 'gloop' : 'gloops'}`];
    if (picked) parts.push(`${picked} selected`);
    const total = measure(s.world, totalVolume(s.world));
    if (total) parts.push(`total ${format(total)}`);
    if (s.message) parts.push(s.message);
    $('status').textContent = parts.join(' · ');
}

function readPalette() {
    const style = getComputedStyle(document.body);
    const read = (name) => style.getPropertyValue(name).trim();
    return { bg: read('--bg'), text: read('--text'), muted: read('--muted'), fill: read('--gloop-fill'), edge: read('--gloop-edge'), select: read('--select') };
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => (palette = readPalette()));

// Touch.

const pointAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

canvas.addEventListener('pointerdown', (e) => {
    if (gesture) return;
    canvas.setPointerCapture(e.pointerId);
    const p = pointAt(e);
    const id = hitTest(session().bodies, camera(), p, MIN_TOUCH_PX);
    if (id == null) {
        gesture = { type: 'lasso', pointerId: e.pointerId, path: [p] };
        return;
    }
    const b = session().bodies.find((it) => it.id === id);
    const at = toWorld(p, camera());
    gesture = { type: 'press', pointerId: e.pointerId, id, start: p, grab: { x: b.x - at.x, y: b.y - at.y }, target: null };
});

canvas.addEventListener('pointermove', (e) => {
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const p = pointAt(e);
    if (gesture.type === 'lasso') {
        gesture.path.push(p);
        return;
    }
    if (gesture.type === 'press' && Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > TAP_SLOP_PX) gesture.type = 'drag';
    if (gesture.type !== 'drag') return;
    const at = toWorld(p, camera());
    const s = session();
    s.bodies = s.bodies.map((b) => (b.id === gesture.id ? { ...b, x: at.x + gesture.grab.x, y: at.y + gesture.grab.y } : b));
    gesture.target = hitTest(s.bodies, camera(), p, MIN_TOUCH_PX, gesture.id);
});

canvas.addEventListener('pointerup', (e) => {
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const done = gesture;
    gesture = null;
    const s = session();
    if (done.type === 'press') {
        if (s.selected.has(done.id)) s.selected.delete(done.id);
        else s.selected.add(done.id);
        s.message = '';
        return refresh();
    }
    if (done.type === 'drag') {
        if (done.target != null) apply(combine(s.world, [done.id, done.target]));
        return;
    }
    const xs = done.path.map((p) => p.x);
    const ys = done.path.map((p) => p.y);
    const drawn = Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) > TAP_SLOP_PX * 2;
    s.selected = new Set(drawn ? lassoSelect(s.bodies, camera(), done.path) : []);
    s.message = '';
    refresh();
});

canvas.addEventListener('pointercancel', (e) => {
    if (gesture?.pointerId === e.pointerId) gesture = null;
});

// The loop.

function resize() {
    const rect = canvas.getBoundingClientRect();
    view.width = rect.width;
    view.height = rect.height;
    view.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * view.dpr);
    canvas.height = Math.round(rect.height * view.dpr);
}

new ResizeObserver(resize).observe(canvas);

let last = performance.now();
function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const s = session();
    const wanted = targetScale(toNumber(totalVolume(s.world)), view.width, view.height);
    scale = scale == null ? wanted : easeScale(scale, wanted, dt);
    s.bodies = settle(s.bodies, dt, gesture?.type === 'drag' ? gesture.id : null);
    draw();
    requestAnimationFrame(frame);
}

function draw() {
    const s = session();
    const cam = camera();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, view.width, view.height);
    const volumes = new Map(s.world.gloops.map((g) => [g.id, g.volume]));
    const target = gesture?.type === 'drag' ? gesture.target : null;
    for (const b of s.bodies) {
        const c = toScreen(b, cam);
        const r = Math.max(b.r * cam.scale, 0.75);
        circle(c, r);
        ctx.fillStyle = palette.fill;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = palette.edge;
        ctx.stroke();
        if (s.selected.has(b.id) || b.id === target) ring(c, r + 3, 3, b.id === target ? [6, 4] : []);
        else if (s.leftover.has(b.id)) ring(c, r + 3, 2, [3, 4]);
        const label = volumes.has(b.id) ? measure(s.world, volumes.get(b.id)) : null;
        if (label && r >= 14) {
            ctx.fillStyle = palette.text;
            ctx.font = `${Math.round(Math.min(28, Math.max(11, r * 0.45)))}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(format(label), c.x, c.y);
        }
    }
    if (gesture?.type === 'lasso' && gesture.path.length > 1) {
        ctx.beginPath();
        gesture.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = palette.select;
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function circle(c, r) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
}

function ring(c, r, width, dash) {
    circle(c, r);
    ctx.setLineDash(dash);
    ctx.lineWidth = width;
    ctx.strokeStyle = palette.select;
    ctx.stroke();
    ctx.setLineDash([]);
}

resize();
refresh();
requestAnimationFrame(frame);
