// Shared helpers for Neon Bay: deterministic RNG, small math utilities,
// and circle-vs-box collision. Pure functions only — no DOM, no three.js,
// so every helper here can be reasoned about (and tested) in isolation.

/** Deterministic RNG (mulberry32). Fixed seeds make screenshot scenes reproducible. */
export function makeRng(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clamp `value` into the inclusive range [low, high]. */
export function clamp(value, low, high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

/** Linear interpolation between `a` and `b` at parameter `t`. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Flat (2D) distance between two points on the ground plane. */
export function dist2D(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

/** Wrap an angle into the range [-PI, PI]. */
export function wrapAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Turn `current` toward `target` by at most `maxStep` radians, taking the
 * shortest way around the circle. Returns the new angle (never overshoots).
 */
export function turnToward(current, target, maxStep) {
  const delta = wrapAngle(target - current);
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

/**
 * Axis-aligned collision box: { minX, maxX, minZ, maxZ }.
 * True when a circle of radius `r` centred at (x, z) overlaps the box.
 */
export function circleHitsBox(x, z, r, box) {
  const nearestX = clamp(x, box.minX, box.maxX);
  const nearestZ = clamp(z, box.minZ, box.maxZ);
  const dx = x - nearestX;
  const dz = z - nearestZ;
  return dx * dx + dz * dz < r * r;
}

/**
 * Push a circle (x, z, r) out of a box it overlaps and return the corrected
 * [x, z]. When the centre is already inside the box, push out along the
 * axis with the smallest penetration so the escape is the shortest one.
 */
export function resolveCircleBox(x, z, r, box) {
  const nearestX = clamp(x, box.minX, box.maxX);
  const nearestZ = clamp(z, box.minZ, box.maxZ);
  const dx = x - nearestX;
  const dz = z - nearestZ;
  const distSq = dx * dx + dz * dz;
  if (distSq >= r * r) return [x, z];

  if (distSq > 1e-8) {
    const d = Math.sqrt(distSq);
    return [nearestX + (dx / d) * r, nearestZ + (dz / d) * r];
  }

  const toLeft = x - box.minX;
  const toRight = box.maxX - x;
  const toTop = z - box.minZ;
  const toBottom = box.maxZ - z;
  const smallest = Math.min(toLeft, toRight, toTop, toBottom);
  if (smallest === toLeft) return [box.minX - r, z];
  if (smallest === toRight) return [box.maxX + r, z];
  if (smallest === toTop) return [x, box.minZ - r];
  return [x, box.maxZ + r];
}

/** Format an amount of money as "$1,250" (whole dollars, US grouping). */
export function fmtMoney(amount) {
  return '$' + Math.floor(amount).toLocaleString('en-US');
}

/** Format a speed in world units/second as "137 km/h" for the speedometer. */
export function fmtSpeed(unitsPerSecond) {
  return Math.round(Math.abs(unitsPerSecond) * 3.6) + ' km/h';
}
