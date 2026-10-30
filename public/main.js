// public/main.js
// The shell: holds each world's state, feeds pointer events to the
// gesture machine and carries out its effects, runs the settle loop, and
// draws. What an operation does is decided in world.js; what a touch
// means, in gesture.js; where gloops sit, in layout.js; how a split or
// combine looks while it happens, in transition.js.
//
// Touch can do everything the buttons do; the buttons stay as a fallback.
// Buttons apply to the selection, and what an operation makes becomes the
// new selection, so pressing Split again splits the pieces.

import { createWorld, combine, split, regroup, setUnit, clearUnit, measure, totalVolume, FINITE, INFINITE } from './world.js';
import { toNumber, format, equals } from './rational.js';
import { body, placeBirths, settle, targetScale, easeScale, hitTest, lassoSelect, groupByProximity, toScreen, cameraFor, zoomAt, panBy, DEFAULT_VIEW, isDefaultView } from './layout.js';
import { createTransitions, transitionFrame, neck } from './transition.js';
import { step, pending, IDLE } from './gesture.js';

const MIN_TOUCH_PX = 22; // every gloop is touchable across at least this radius
const EDGE_PX = 1.5;
const LIMITS = { k: [2, 20], g: [2, 20], m: [1, 19] };

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

const screen = { width: 1, height: 1, dpr: 1 };
const controls = { k: 2, g: 2, m: 1 };
const sessions = { [FINITE]: fresh(FINITE), [INFINITE]: fresh(INFINITE) };
let kind = FINITE;
let autoScale = null;
let gesture = IDLE;
let palette = {};

function fresh(worldKind) {
    const world = createWorld(worldKind);
    return {
        world,
        bodies: world.gloops.map((g) => body(g.id, toNumber(g.volume))),
        view: DEFAULT_VIEW,
        transitions: [],
        history: [],
        future: [],
        selected: new Set(),
        leftover: new Set(),
        message: '',
    };
}

const session = () => sessions[kind];
const wantedScale = () => targetScale(toNumber(totalVolume(session().world)), screen.width, screen.height);
const camera = () => cameraFor(session().view, autoScale ?? wantedScale(), screen.width, screen.height);
const now = () => performance.now() / 1000;

// Applies an operation's result: a refusal becomes the status message;
// anything else is recorded for undo, becomes the current state, and
// starts its transitions.
function apply(result, leftover = []) {
    const s = session();
    if (result.refused) {
        s.message = result.refused;
        return refresh();
    }
    s.history.push(snapshot(s));
    s.future = [];
    const born = result.born.map((kid) => ({ ...kid, volume: toNumber(kid.volume) }));
    s.transitions = [...s.transitions, ...createTransitions(s.bodies, born, now())];
    s.world = result.world;
    s.bodies = placeBirths(s.bodies, born);
    if (born.length) s.selected = new Set(born.map((kid) => kid.id));
    s.leftover = new Set(leftover);
    s.message = leftover.length ? `${leftover.length} left over` : '';
    refresh();
}

const snapshot = (s) => ({ world: s.world, bodies: s.bodies, selected: new Set(s.selected) });

// Steps back or forward through a world's history.
function travel(from, to) {
    const s = session();
    const next = s[from].pop();
    if (!next) return;
    s[to].push(snapshot(s));
    Object.assign(s, next, { transitions: [], leftover: new Set(), message: '' });
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
    regroup: () => regroupNearby(selection(), controls.g, controls.m),
    unit() {
        const s = session();
        const ids = selection();
        apply(ids.length === 1 ? setUnit(s.world, ids[0]) : clearUnit(s.world));
    },
    undo: () => travel('history', 'future'),
    redo: () => travel('future', 'history'),
    reset() {
        sessions[kind] = fresh(kind);
        refresh();
    },
    fit() {
        session().view = DEFAULT_VIEW;
        refresh();
    },
};

// Operation 4 on gloops grouped by nearness; what can't be grouped is the
// remainder.
function regroupNearby(ids, g, m) {
    const { groups, remainder } = groupByProximity(session().bodies, ids, g);
    if (!groups.length) return apply({ refused: `Select at least ${g} gloops to regroup.` });
    apply(regroup(session().world, groups, m), remainder);
}

// A long press makes a gloop the unit, or clears the unit if the gloop
// already measures 1.
function toggleUnit(id) {
    const { world } = session();
    const volume = world.gloops.find((g) => g.id === id)?.volume;
    const isUnit = world.unit && volume && equals(volume, world.unit);
    apply(isUnit ? clearUnit(world) : setUnit(world, id));
}

for (const [id, run] of Object.entries(actions)) $(id).addEventListener('click', run);

for (const tab of document.querySelectorAll('[data-world]')) {
    tab.addEventListener('click', () => {
        kind = tab.dataset.world;
        gesture = IDLE;
        autoScale = null;
        refresh();
        palette = readPalette();
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
    $('redo').disabled = !s.future.length;
    $('fit').hidden = isDefaultView(s.view);
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
    return { bg: read('--bg'), surface: read('--surface'), text: read('--text'), line: read('--line'), fill: read('--gloop-fill'), edge: read('--gloop-edge'), select: read('--select') };
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => (palette = readPalette()));

// Touch.

const pointAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

function feed(type, e) {
    const s = session();
    const cam = camera();
    const context = { hitAt: (p, excludeId) => hitTest(s.bodies, cam, p, MIN_TOUCH_PX, excludeId), selected: new Set(selection()) };
    const event = e ? { type, pointerId: e.pointerId, point: pointAt(e), time: now() } : { type, time: now() };
    const { state, effects } = step(gesture, event, context);
    gesture = state;
    for (const effect of effects) perform(effect);
}

// Carries out one effect from the gesture machine.
function perform(effect) {
    const s = session();
    const cam = camera();
    switch (effect.type) {
        case 'toggle':
            if (s.selected.has(effect.id)) s.selected.delete(effect.id);
            else s.selected.add(effect.id);
            s.message = '';
            return refresh();
        case 'all':
            return actions.all();
        case 'clear':
        case 'lasso':
            s.selected = new Set(effect.type === 'lasso' ? lassoSelect(s.bodies, cam, effect.path) : []);
            s.message = '';
            return refresh();
        case 'drag':
            s.bodies = s.bodies.map((b) => (b.id === effect.id ? { ...b, x: b.x + effect.dx / cam.scale, y: b.y + effect.dy / cam.scale } : b));
            return;
        case 'combine':
            return apply(combine(s.world, effect.ids));
        case 'split':
            return apply(split(s.world, effect.ids, effect.k));
        case 'regroup':
            return regroupNearby(effect.ids, effect.g, effect.m);
        case 'unit':
            return toggleUnit(effect.id);
        case 'undo':
        case 'redo':
            return actions[effect.type]();
        case 'pan':
            s.view = panBy(s.view, cam, effect.dx, effect.dy);
            return refresh();
        case 'zoom':
            s.view = zoomAt(s.view, cam, effect.focus, effect.factor);
            return refresh();
    }
}

canvas.addEventListener('pointerdown', (e) => {
    feed('down', e);
    // Capture keeps a finger's moves coming when it leaves the canvas. It
    // is best-effort: a pointer the browser no longer tracks cannot be
    // captured, and the gesture still works without it.
    try {
        canvas.setPointerCapture(e.pointerId);
    } catch {}
});
canvas.addEventListener('pointermove', (e) => feed('move', e));
canvas.addEventListener('pointerup', (e) => feed('up', e));
canvas.addEventListener('pointercancel', (e) => feed('cancel', e));

// A trackpad pinch (or a wheel with Ctrl or ⌘) zooms; any other wheel or
// two-finger trackpad scroll pans.
canvas.addEventListener(
    'wheel',
    (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) perform({ type: 'zoom', focus: pointAt(e), factor: Math.exp(-e.deltaY * 0.01) });
        else perform({ type: 'pan', dx: -e.deltaX, dy: -e.deltaY });
    },
    { passive: false },
);

// The loop.

function resize() {
    const rect = canvas.getBoundingClientRect();
    screen.width = rect.width;
    screen.height = rect.height;
    screen.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * screen.dpr);
    canvas.height = Math.round(rect.height * screen.dpr);
}

new ResizeObserver(resize).observe(canvas);

let last = performance.now();
function frame(time) {
    const dt = Math.min(0.05, (time - last) / 1000);
    last = time;
    feed('tick');
    const s = session();
    autoScale = autoScale == null ? wantedScale() : easeScale(autoScale, wantedScale(), dt);
    s.bodies = settle(s.bodies, dt, gesture.mode === 'drag' ? gesture.id : null);
    const shapes = transitionFrame(s.transitions, s.bodies, now());
    s.transitions = shapes.live;
    draw(shapes);
    requestAnimationFrame(frame);
}

// Draws every gloop, ghost and neck as one fluid: first all of them a
// little larger in the edge colour, then all of them in the fill colour,
// so overlapping shapes show a single outline.
function draw(shapes) {
    const s = session();
    const cam = camera();
    ctx.setTransform(screen.dpr, 0, 0, screen.dpr, 0, 0);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, screen.width, screen.height);
    const onScreen = (c) => ({ ...toScreen(c, cam), r: c.r * cam.scale });
    const gloops = s.bodies.map((b) => {
        const growing = shapes.radii.get(b.id);
        return { id: b.id, ...onScreen({ ...b, r: growing ?? b.r }), settled: growing == null };
    });
    const circles = [...gloops.map((g) => ({ ...g, r: g.settled ? Math.max(g.r, 0.75) : g.r })), ...shapes.ghosts.map(onScreen)];
    const necks = shapes.necks.map(([a, b]) => [onScreen(a), onScreen(b)]);
    for (const [color, grow] of [[palette.edge, EDGE_PX], [palette.fill, 0]]) {
        ctx.fillStyle = color;
        for (const c of circles) fillCircle(c, c.r + grow);
        for (const [a, b] of necks) fillNeck(neck({ ...a, r: a.r + grow }, { ...b, r: b.r + grow }));
    }
    const target = gesture.mode === 'drag' ? gesture.target : null;
    const volumes = new Map(s.world.gloops.map((g) => [g.id, g.volume]));
    for (const g of gloops) {
        if (s.selected.has(g.id) || g.id === target) ring(g, g.r + 3, 3, g.id === target ? [6, 4] : []);
        else if (s.leftover.has(g.id)) ring(g, g.r + 3, 2, [3, 4]);
        const label = volumes.has(g.id) ? measure(s.world, volumes.get(g.id)) : null;
        if (label && g.r >= 14) {
            ctx.fillStyle = palette.text;
            ctx.font = `${Math.round(Math.min(28, Math.max(11, g.r * 0.45)))}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(format(label), g.x, g.y);
        }
    }
    const intent = pending(gesture, now());
    if (intent) preview(intent, new Map(gloops.map((g) => [g.id, g])));
    if (gesture.mode === 'lasso' && gesture.path.length > 1) {
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

// Shows what a touch will do when its fingers lift: a filling ring for a
// long press; for a hand, the pieces a split will cut, rings on what a
// combine or regroup will use, and the numbers, above the fingers.
function preview(intent, onScreen) {
    if (intent.type === 'hold') {
        const g = onScreen.get(intent.id);
        if (!g) return;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r + 7, -Math.PI / 2, -Math.PI / 2 + intent.progress * Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = palette.select;
        ctx.stroke();
        return;
    }
    const targets = intent.ids.map((id) => onScreen.get(id)).filter(Boolean);
    if (intent.type === 'split') {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = palette.edge;
        for (const g of targets.filter((t) => t.r >= 6)) {
            ctx.beginPath();
            for (let i = 0; i < intent.k; i++) {
                const angle = -Math.PI / 2 + (i * Math.PI * 2) / intent.k;
                ctx.moveTo(g.x, g.y);
                ctx.lineTo(g.x + Math.cos(angle) * g.r, g.y + Math.sin(angle) * g.r);
            }
            ctx.stroke();
        }
    } else {
        for (const g of targets) ring(g, g.r + 3, 2, [6, 4]);
    }
    const text = { split: `1 → ${intent.k}`, combine: `${intent.ids.length} → 1`, regroup: `${intent.g} → ${intent.m}` }[intent.type];
    badge(text, intent.at);
}

// A label in a pill, above a point and kept on screen.
function badge(text, at) {
    ctx.font = '600 22px system-ui, sans-serif';
    const width = ctx.measureText(text).width + 28;
    const height = 40;
    const x = Math.min(Math.max(at.x - width / 2, 8), screen.width - width - 8);
    const y = Math.min(Math.max(at.y - 110, 8), screen.height - height - 8);
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, height / 2);
    ctx.fillStyle = palette.surface;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = palette.line;
    ctx.stroke();
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y + height / 2);
}

function fillCircle(c, r) {
    if (r <= 0) return;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
}

function fillNeck(n) {
    if (!n) return;
    ctx.beginPath();
    ctx.moveTo(n.p1.x, n.p1.y);
    ctx.bezierCurveTo(n.h1.x, n.h1.y, n.h3.x, n.h3.y, n.p3.x, n.p3.y);
    ctx.lineTo(n.p4.x, n.p4.y);
    ctx.bezierCurveTo(n.h4.x, n.h4.y, n.h2.x, n.h2.y, n.p2.x, n.p2.y);
    ctx.closePath();
    ctx.fill();
}

function ring(c, r, width, dash) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.setLineDash(dash);
    ctx.lineWidth = width;
    ctx.strokeStyle = palette.select;
    ctx.stroke();
    ctx.setLineDash([]);
}

resize();
refresh();
palette = readPalette();
requestAnimationFrame(frame);
