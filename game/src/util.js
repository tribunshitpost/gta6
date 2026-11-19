// Neon Bay — small shared helpers: maths, random numbers, collisions.
// Nothing here knows about three.js; it is pure logic used by every system.
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed angle difference, so turning never spins the long way.
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function turnToward(current, target, maxStep) {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Deterministic seeded random, so a ?seed= value replays the same city.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

// Circle (player, car, pedestrian) pushed out of an axis-aligned box.
// Returns true when a collision happened, and writes the corrected
// position back into the object passed in.
export function resolveCircleAABB(pos, radius, box) {
  const cx = clamp(pos.x, box.minX, box.maxX);
  const cz = clamp(pos.z, box.minZ, box.maxZ);
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return false;
  if (d2 > 0.000001) {
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * radius;
    pos.z = cz + (dz / d) * radius;
  } else {
    // Centre is inside the box: push out along the smallest penetration.
    const left = pos.x - box.minX;
    const right = box.maxX - pos.x;
    const top = pos.z - box.minZ;
    const bottom = box.maxZ - pos.z;
    const m = Math.min(left, right, top, bottom);
    if (m === left) pos.x = box.minX - radius;
    else if (m === right) pos.x = box.maxX + radius;
    else if (m === top) pos.z = box.minZ - radius;
    else pos.z = box.maxZ + radius;
  }
  return true;
}

// Run a circle against every collider in a list; returns hit count.
export function resolveAllColliders(pos, radius, colliders) {
  let hits = 0;
  for (const box of colliders) {
    if (resolveCircleAABB(pos, radius, box)) hits += 1;
  }
  return hits;
}

// Format dollars with a thousands separator, e.g. $1,250.
export function money(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// A point is on a road when it sits within one avenue's half-width of
// either a vertical or a horizontal avenue line.
export function onRoad(x, z, avenues, roadHalf) {
  for (const a of avenues) {
    if (Math.abs(x - a) <= roadHalf || Math.abs(z - a) <= roadHalf) return true;
  }
  return false;
}

// Smoothstep easing for camera moves and marker pulses.
export function smoothstep(t) {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

