// Neon Bay — the city itself: ground, roads, buildings, neon, docks.
// Buildings are placed only inside the blocks between the avenues, with a
// margin, so none ever lands on a road or an intersection. Windows are a
// single InstancedMesh (a few thousand lit windows, one draw call) and the
// building bodies are another, which keeps the frame rate healthy.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRng, pick, range } from './util.js';

const SHOP_NAMES = [
  'BAY BAR', 'CORAL MOTEL', 'TIDE TACOS', 'NEON LAUNDRY', 'VESPER DOCKS',
  'PALMETTO CAFE', 'FOUNDRY AUTO', 'LUMEN ARCADE', 'MARA\u2019S GARAGE',
  'SUNSET PAWN', 'QUAY SEAFOOD', 'HOTEL MIRAMAR',
];
const SIGN_COLOURS = ['#ff5fd0', '#37c8ff', '#ff7a4d', '#7dff8a', '#ffc94d', '#c77dff'];

// A glowing text sign drawn on a canvas — no image files needed.
export function makeSignTexture(text, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0a0a14';
  g.fillRect(0, 0, 512, 128);
  g.font = 'bold 64px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = colour;
  g.shadowBlur = 28;
  g.fillStyle = colour;
  g.fillText(text, 256, 66);
  g.shadowBlur = 8;
  g.fillStyle = '#ffffff';
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, seed, lowFx) {
  const rng = makeRng(seed);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'NeonBayCity';
  const half = CONFIG.cityHalf;

  // --- Sky, light, fog: a warm dusk over the bay. ---
  scene.background = new THREE.Color(CONFIG.colours.sky);
  scene.fog = new THREE.Fog(0x2a3550, 90, 320);
  const sun = new THREE.DirectionalLight(0xffb37a, 1.6);
  sun.position.set(60, 90, -40);
  sun.castShadow = !lowFx;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -130;
  sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130;
  sun.shadow.camera.bottom = -130;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x2a2118, 0.9));
  const duskGlow = new THREE.PointLight(0xff5fd0, 60, 60);
  duskGlow.position.set(0, 12, 0);
  scene.add(duskGlow);

  // --- Ground, water, roads. ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 80, half * 2 + 80),
    new THREE.MeshStandardMaterial({ color: CONFIG.colours.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(60, half * 2 + 80),
    new THREE.MeshStandardMaterial({ color: CONFIG.colours.water, roughness: 0.2, metalness: 0.4 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(half + 30, 0.05, 0);
  group.add(water);

  const roadMat = new THREE.MeshStandardMaterial({ color: CONFIG.colours.road, roughness: 0.95 });
  const walkMat = new THREE.MeshStandardMaterial({ color: CONFIG.colours.sidewalk, roughness: 1 });
  for (const a of CONFIG.avenues) {
    for (const vertical of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, CONFIG.roadHalf * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = vertical ? Math.PI / 2 : 0;
      road.position.set(vertical ? a : 0, 0.06, vertical ? 0 : a);
      road.receiveShadow = true;
      group.add(road);
      // Sidewalk strips flanking each avenue.
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 3), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.rotation.z = vertical ? Math.PI / 2 : 0;
        walk.position.set(
          vertical ? a + side * (CONFIG.roadHalf + 1.5) : 0,
          0.08,
          vertical ? 0 : a + side * (CONFIG.roadHalf + 1.5),
        );
        group.add(walk);
      }
    }
  }

  // --- Lumen Square plaza and fountain at the centre. ---
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 16, 0.3, 32),
    new THREE.MeshStandardMaterial({ color: 0x4a4f5e, roughness: 0.8 }),
  );
  plaza.position.set(0, 0.15, 0);
  plaza.receiveShadow = true;
  group.add(plaza);
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5.6, 1.1, 24),
    new THREE.MeshStandardMaterial({ color: 0x9fb4cc, roughness: 0.3, metalness: 0.3 }),
  );
  basin.position.set(0, 0.55, 0);
  group.add(basin);
  const fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 4.4, 0.2, 24),
    new THREE.MeshStandardMaterial({ color: 0x37c8ff, roughness: 0.1, metalness: 0.5, emissive: 0x0a4a66 }),
  );
  fountainWater.position.set(0, 1.05, 0);
  group.add(fountainWater);
  const jet = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 3.4, 12),
    new THREE.MeshStandardMaterial({ color: 0x9fe4ff, transparent: true, opacity: 0.55, emissive: 0x37c8ff }),
  );
  jet.position.set(0, 2.6, 0);
  jet.name = 'fountainJet';
  group.add(jet);
  colliders.push({ minX: -6, maxX: 6, minZ: -6, maxZ: 6 });

  return { group, colliders, rng, sun };
}

// --- Buildings: one InstancedMesh for bodies, one for lit windows. ---
export function buildBuildings(group, colliders, rng, lowFx) {
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  bodyGeo.translate(0, 0.5, 0);
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
  const windowGeo = new THREE.PlaneGeometry(1.1, 1.4);
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const palette = [0x5a6b8a, 0x7a6a8a, 0x8a7a5a, 0x4a5a6a, 0x9a8a7a, 0x6a7a5a];

  const bodies = [];
  const windows = [];
  const avenues = CONFIG.avenues;
  const bounds = [-CONFIG.cityHalf, ...avenues, CONFIG.cityHalf];
  // Blocks are the cells between neighbouring avenue lines.
  for (let ix = 0; ix < bounds.length - 1; ix++) {
    for (let iz = 0; iz < bounds.length - 1; iz++) {
      const x0 = bounds[ix] + CONFIG.roadHalf + CONFIG.blockMargin;
      const x1 = bounds[ix + 1] - CONFIG.roadHalf - CONFIG.blockMargin;
      const z0 = bounds[iz] + CONFIG.roadHalf + CONFIG.blockMargin;
      const z1 = bounds[iz + 1] - CONFIG.roadHalf - CONFIG.blockMargin;
      if (x1 - x0 < 8 || z1 - z0 < 8) continue;
      // The central plaza block stays open — no buildings on the fountain.
      if (x0 < 18 && x1 > -18 && z0 < 18 && z1 > -18) continue;
      const perBlock = 1 + Math.floor(rng() * 2);
      for (let b = 0; b < perBlock; b++) {
        const bw = range(rng, 8, Math.min(20, x1 - x0));
        const bd = range(rng, 8, Math.min(20, z1 - z0));
        const bx = range(rng, x0 + bw / 2, x1 - bw / 2);
        const bz = range(rng, z0 + bd / 2, z1 - bd / 2);
        // Taller towers near the plaza, lower blocks toward the edges.
        const distCentre = Math.sqrt(bx * bx + bz * bz);
        const h = range(rng, 8, 34) * (1.25 - distCentre / 320) + 4;
        bodies.push({ x: bx, z: bz, w: bw, d: bd, h });
        colliders.push({ minX: bx - bw / 2, maxX: bx + bw / 2, minZ: bz - bd / 2, maxZ: bz + bd / 2 });
        // Lit windows on the two street-facing sides, capped overall.
        if (!lowFx || windows.length < 900) {
          const floors = Math.max(2, Math.floor(h / 4));
          const cols = Math.max(2, Math.floor(bw / 3.4));
          for (let f = 0; f < floors; f++) {
            for (let c = 0; c < cols; c++) {
              if (rng() < 0.45) continue;
              const wy = 2.6 + f * 3.6;
              const wx = bx - bw / 2 + 1.8 + c * 3.4;
              windows.push({ x: wx, y: wy, z: bz + bd / 2 + 0.06, ry: 0 });
              windows.push({ x: wx, y: wy, z: bz - bd / 2 - 0.06, ry: Math.PI });
            }
          }
        }
      }
    }
  }

  const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, bodies.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  bodies.forEach((b, i) => {
    p.set(b.x, 0, b.z);
    s.set(b.w, b.h, b.d);
    m.compose(p, q, s);
    bodyMesh.setMatrixAt(i, m);
    bodyMesh.setColorAt(i, col.setHex(pick(rng, palette)));
  });
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.instanceMatrix.needsUpdate = true;
  if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
  group.add(bodyMesh);

  const winMesh = new THREE.InstancedMesh(windowGeo, windowMat, Math.max(1, windows.length));
  windows.forEach((w, i) => {
    p.set(w.x, w.y, w.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.ry);
    s.set(1, 1, 1);
    m.compose(p, q, s);
    winMesh.setMatrixAt(i, m);
    const lit = rng();
    winMesh.setColorAt(i, col.setHSL(0.11 + rng() * 0.05, 0.8, 0.55 + lit * 0.25));
  });
  winMesh.instanceMatrix.needsUpdate = true;
  if (winMesh.instanceColor) winMesh.instanceColor.needsUpdate = true;
  group.add(winMesh);
  return bodies.length;
}

// --- Neon signs, palms, crates, docks, streetlights, fence lot. ---
export function buildProps(group, colliders, rng, lowFx) {
  const signs = [];
  for (let i = 0; i < SHOP_NAMES.length; i++) {
    const name = SHOP_NAMES[i];
    const colour = SIGN_COLOURS[i % SIGN_COLOURS.length];
    const tex = makeSignTexture(name, colour);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 2.5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: false }),
    );
    // Signs hang on avenue-facing walls around the plaza and Coral Row.
    const angle = (i / SHOP_NAMES.length) * Math.PI * 2;
    const rx = Math.cos(angle) * 26;
    const rz = Math.sin(angle) * 26;
    sign.position.set(rx, 7 + (i % 3) * 2.5, rz);
    sign.lookAt(0, sign.position.y, 0);
    group.add(sign);
    signs.push(sign);
  }
  // District name signs high over each district centre.
  for (const d of CONFIG.districts) {
    const tex = makeSignTexture(d.name.toUpperCase(), '#' + d.tint.toString(16).padStart(6, '0'));
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    sign.position.set(d.x, 16, d.z);
    group.add(sign);
  }
  return signs;
}

// --- Street furniture: palms, crates, dock containers, lamps, fence. ---
export function buildStreetFurniture(group, colliders, rng, lowFx) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8a4a, roughness: 1 });
  const palmCount = lowFx ? 18 : 40;
  for (let i = 0; i < palmCount; i++) {
    const avenue = pick(rng, CONFIG.avenues);
    const along = range(rng, -105, 105);
    const side = rng() > 0.5 ? 1 : -1;
    const px = avenue + side * (CONFIG.roadHalf + 3.4);
    const pz = along;
    if (Math.abs(px) < 20 && Math.abs(pz) < 20) continue;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5, 6), trunkMat);
    trunk.position.set(px, 2.5, pz);
    trunk.castShadow = true;
    group.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.6, 7), leafMat);
    leaves.position.set(px, 5.6, pz);
    group.add(leaves);
    colliders.push({ minX: px - 0.4, maxX: px + 0.4, minZ: pz - 0.4, maxZ: pz + 0.4 });
  }

  // Crates near the docks and the Foundry, with collision boxes.
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1 });
  const crateSpots = [
    [96, -78], [100, -70], [92, -84], [86, 76], [78, 88], [-100, 40], [-104, 48],
  ];
  for (const [cx, cz] of crateSpots) {
    const h = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < h; k++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), crateMat);
      crate.position.set(cx, 0.9 + k * 1.8, cz);
      crate.rotation.y = rng() * 0.6;
      crate.castShadow = true;
      group.add(crate);
    }
    colliders.push({ minX: cx - 1, maxX: cx + 1, minZ: cz - 1, maxZ: cz + 1 });
  }

  // Dock containers and a crane at Vesper Quay.
  const containerCols = [0x2a6a8a, 0x8a2a2a, 0x3a7a3a, 0xc78a2a];
  for (let i = 0; i < 10; i++) {
    const cx = 96 + (rng() - 0.5) * 14;
    const cz = -88 + i * 4.4;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(6, 2.6, 2.6),
      new THREE.MeshStandardMaterial({ color: pick(rng, containerCols), roughness: 0.9 }),
    );
    box.position.set(cx, 1.3, cz);
    box.rotation.y = (rng() - 0.5) * 0.2;
    box.castShadow = true;
    group.add(box);
    colliders.push({ minX: cx - 3.2, maxX: cx + 3.2, minZ: cz - 1.5, maxZ: cz + 1.5 });
  }
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xd8a02a, roughness: 0.7 });
  const craneBase = new THREE.Mesh(new THREE.BoxGeometry(3, 18, 3), craneMat);
  craneBase.position.set(108, 9, -60);
  group.add(craneBase);
  const craneArm = new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 1.2), craneMat);
  craneArm.position.set(99, 17.5, -60);
  group.add(craneArm);
  colliders.push({ minX: 106.5, maxX: 109.5, minZ: -61.5, maxZ: -58.5 });

  // The fence lot: a yellow-marked patch in the Foundry District.
  const fence = CONFIG.places.fenceLot;
  const lot = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 12),
    new THREE.MeshStandardMaterial({ color: 0xc7a02a, roughness: 1 }),
  );
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(fence.x, 0.09, fence.z);
  group.add(lot);
  const fenceSign = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 2),
    new THREE.MeshBasicMaterial({ map: makeSignTexture('FENCE — CASH FOR CARS', '#ffc94d') }),
  );
  fenceSign.position.set(fence.x, 6, fence.z - 6.5);
  group.add(fenceSign);

  // Street lamps along the avenues, with warm glowing heads.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampCount = lowFx ? 10 : 24;
  for (let i = 0; i < lampCount; i++) {
    const avenue = pick(rng, CONFIG.avenues);
    const along = range(rng, -100, 100);
    const side = rng() > 0.5 ? 1 : -1;
    const lx = avenue + side * (CONFIG.roadHalf + 0.8);
    const lz = along;
    if (Math.abs(lx) < 18 && Math.abs(lz) < 18) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampMat);
    pole.position.set(lx, 3, lz);
    group.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampGlowMat);
    head.position.set(lx, 6.1, lz);
    group.add(head);
  }
}

// Free parking spots where stealable cars sit, all on road shoulders
// and clear of intersections and building colliders.
export function parkingSpots(rng) {
  const spots = [];
  const candidates = [
    [-45, -67, 0], [-45, -22, Math.PI], [0, -67, Math.PI / 2], [45, -22, 0],
    [-90, 22, Math.PI / 2], [-67, 45, 0], [22, 45, Math.PI], [67, 0, Math.PI / 2],
    [90, 67, 0], [-22, 90, Math.PI], [45, 90, Math.PI / 2], [-67, -90, 0],
  ];
  for (const [x, z, rot] of candidates) spots.push({ x, z, rot });
  return spots;
}
