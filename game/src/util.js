// Small helpers shared by every module of Velora Bay: seeded random numbers,
// angles, clamping and the circle-versus-rectangle tests the physics uses.

export const TAU = Math.PI * 2;

/** A tiny deterministic PRNG: the same seed always deals the same numbers. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed turn from angle a to angle b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Move angle a toward b by at most step radians. */
export function turnToward(a, b, step) {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/** Pick one entry of an array with the given rng. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** A float in [lo, hi) from the rng. */
export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

/** An integer in [lo, hi] from the rng. */
export function irange(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** True when a circle overlaps an axis-aligned rectangle. */
export function circleHitsRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/**
 * Push a circle out of a rectangle it overlaps. Returns true when it moved.
 * Call it once per rectangle after each move; it slides along walls naturally.
 */
export function pushCircleOutOfRect(pos, r, rect) {
  const nx = clamp(pos.x, rect.x, rect.x + rect.w);
  const ny = clamp(pos.y, rect.y, rect.y + rect.h);
  let dx = pos.x - nx;
  let dy = pos.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    pos.x += dx * push;
    pos.y += dy * push;
    return true;
  }
  // Centre inside the rectangle: push out along the shallowest side.
  const left = pos.x - rect.x;
  const right = rect.x + rect.w - pos.x;
  const top = pos.y - rect.y;
  const bottom = rect.y + rect.h - pos.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) pos.x = rect.x - r;
  else if (m === right) pos.x = rect.x + rect.w + r;
  else if (m === top) pos.y = rect.y - r;
  else pos.y = rect.y + rect.h + r;
  return true;
}

/** Format a dollar amount with commas, e.g. 1234 -> "$1,234". */
export function money(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

/** Format seconds as M:SS. */
export function clock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
