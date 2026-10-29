// public/rational.js
// Exact non-negative rationals over BigInt, always in lowest terms.
// Gloop volumes are never floats: three thirds must recombine to exactly one.

function gcd(a, b) {
    while (b) [a, b] = [b, a % b];
    return a;
}

export function rat(n, d = 1n) {
    n = BigInt(n);
    d = BigInt(d);
    if (d === 0n) throw new RangeError('zero denominator');
    if (d < 0n) [n, d] = [-n, -d];
    const g = gcd(n < 0n ? -n : n, d);
    return { n: n / g, d: d / g };
}

export const ZERO = rat(0);
export const ONE = rat(1);

export const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sum = (xs) => xs.reduce(add, ZERO);
export const mulInt = (a, k) => rat(a.n * BigInt(k), a.d);
export const divInt = (a, k) => rat(a.n, a.d * BigInt(k));
export const div = (a, b) => rat(a.n * b.d, a.d * b.n);
export const equals = (a, b) => a.n === b.n && a.d === b.d;

// An approximation for drawing. Both parts are shifted down first, so
// volumes past the range of a double still give a finite ratio.
export function toNumber(a) {
    const bits = Math.max(a.n.toString(2).length, a.d.toString(2).length);
    const excess = BigInt(Math.max(0, bits - 1000));
    return Number(a.n >> excess) / Number(a.d >> excess);
}

export const format = (a) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`);
