// Neon Bay itself: a sun-soaked grid city on a bay.
// Builds all static geometry from three.js primitives and canvas textures
// (no external assets), and exports the collision boxes and the road
// network the traffic AI drives on.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRng, clamp, dist2D, resolveCircleBox } from './util.js';

const HALF = CONFIG.cityHalf;
const SPACING = CONFIG.roadSpacing;
const ROAD_W = CONFIG.roadWidth;
const CITY_SEED = 20261120;

// Facade colours for the buildings, picked per building.
const FACADE_PALETTE = [
  '#e8b04b', '#d97b6c', '#7fb3d5', '#a8c686', '#c9a0dc',
  '#e07856', '#6fc2b8', '#f2e3c6', '#9aa5b1', '#e8c468',
  '#5fb8a6', '#d98ab0',
];

// ---------------------------------------------------------------------------
// Road helpers
// ---------------------------------------------------------------------------

/** Road centre-lines run at ..., -80, -40, 0, 40, 80, ... */
export function roadCoords() {
  const coords = [];
  for (let c = -HALF + SPACING; c <= HALF - SPACING; c += SPACING) coords.push(c);
  return coords;
}

/** True when (x, z) is on asphalt (within a road, ignoring intersections). */
export function onRoad(x, z) {
  const distToRoadX = Math.abs((((x + SPACING / 2) % SPACING) + SPACING) % SPACING - SPACING / 2);
  const distToRoadZ = Math.abs((((z + SPACING / 2) % SPACING) + SPACING) % SPACING - SPACING / 2);
  return distToRoadX < ROAD_W / 2 + 1 || distToRoadZ < ROAD_W / 2 + 1;
}

/** Nearest road centre-line coordinate to a value. */
export function nearestRoad(value) {
  return Math.round(value / SPACING) * SPACING;
}

// ---------------------------------------------------------------------------
// Canvas textures (all art is generated — nothing is fetched)
// ---------------------------------------------------------------------------

/** Building facade: flat colour with a grid of windows, some lit. */
function facadeTexture(baseColor, litRatio, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  // Subtle vertical shading so flat walls read as 3D.
  const shade = g.createLinearGradient(0, 0, 128, 0);
  shade.addColorStop(0, 'rgba(255,255,255,0.10)');
  shade.addColorStop(0.5, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = shade;
  g.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 244; y += 20) {
    for (let x = 10; x < 118; x += 18) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? (rng() < 0.5 ? '#ffd98a' : '#9fd8ff') : 'rgba(10,16,28,0.85)';
      g.fillRect(x, y, 11, 13);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Neon sign: glowing text on a dark panel. */
function signTexture(text, color, bg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.font = 'bold 64px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 26;
  g.fillStyle = color;
  g.fillText(text, 256, 66);
  // Crisp white core over the glow.
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Ground tile: pavement blocks, asphalt cross, lane dashes, crosswalk. */
function groundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  // Pavement blocks.
  g.fillStyle = '#8f8a80';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  // Asphalt cross (roads run along both edges of the tile).
  g.fillStyle = '#33363d';
  g.fillRect(0, 0, 512, 76);
  g.fillRect(0, 436, 512, 76);
  g.fillRect(0, 0, 76, 512);
  g.fillRect(436, 0, 76, 512);
  // Centre dashes.
  g.fillStyle = '#e8d24a';
  for (let i = 8; i < 512; i += 32) {
    g.fillRect(i, 34, 16, 5);
    g.fillRect(34, i, 5, 16);
  }
  // Crosswalk stripes at the intersection.
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 5; i++) {
    g.fillRect(84 + i * 14, 8, 7, 60);
    g.fillRect(8, 84 + i * 14, 60, 7);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((HALF * 2) / SPACING, (HALF * 2) / SPACING);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// The city
// ---------------------------------------------------------------------------

export class City {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {minX, maxX, minZ, maxZ} for buildings / props
    this.buildings = []; // meshes (kept for bounds / debugging)
    this.rng = makeRng(CITY_SEED);
    this.buildLights();
    this.buildGround();
    this.buildBlocks();
    this.buildBeach();
    this.buildProps();
    this.buildSigns();
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a6f4d, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe7b0, 2.3);
    sun.position.set(120, 180, 60);
    this.scene.add(sun);
    this.scene.add(sun.target);
    // Warm late-afternoon sky + haze.
    this.scene.background = new THREE.Color(0x87bfe8);
    this.scene.fog = new THREE.Fog(0x9fc6e8, 200, 520);
  }

  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2, HALF * 2),
      new THREE.MeshLambertMaterial({ map: groundTexture() }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
  }

  buildBlocks() {
    const rng = this.rng;
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
    const roads = roadCoords();
    // Buildings sit at block CENTRES (roads run on multiples of 40,
    // block centres are offset by half a spacing).
    for (const cx of roads) {
      for (const cz of roads) {
        const bx = cx + SPACING / 2;
        const bz = cz + SPACING / 2;
        // Keep the central square open and the dockyard / beach clear.
        if (bx === 20 && bz === 20) continue; // square
        if (bz >= 120 && bx <= -80) continue; // dockyard
        if (bz >= 160) continue; // beach strip
        const w = CONFIG.blockSize * (0.7 + rng() * 0.3);
        const d = CONFIG.blockSize * (0.7 + rng() * 0.3);
        const h = 8 + rng() * rng() * 46; // a few towers, mostly low-rise
        const color = FACADE_PALETTE[Math.floor(rng() * FACADE_PALETTE.length)];
        const mat = new THREE.MeshLambertMaterial({ map: facadeTexture(color, 0.35, rng) });
        const building = new THREE.Mesh(boxGeo, mat);
        building.scale.set(w, h, d);
        building.position.set(bx + (rng() - 0.5) * 3, h / 2, bz + (rng() - 0.5) * 3);
        this.scene.add(building);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w * 0.9, 0.8, d * 0.9);
        roof.position.set(building.position.x, h + 0.4, building.position.z);
        this.scene.add(roof);
        this.buildings.push(building);
        const halfW = w / 2;
        const halfD = d / 2;
        this.colliders.push({
          minX: building.position.x - halfW,
          maxX: building.position.x + halfW,
          minZ: building.position.z - halfD,
          maxZ: building.position.z + halfD,
        });
        // Rooftop AC box for silhouette variety.
        if (rng() < 0.6) {
          const ac = new THREE.Mesh(boxGeo, roofMat);
          ac.scale.set(3, 1.6, 2.4);
          ac.position.set(
            building.position.x + (rng() - 0.5) * w * 0.4,
            h + 1.6,
            building.position.z + (rng() - 0.5) * d * 0.4,
          );
          this.scene.add(ac);
        }
      }
    }
    // Central square: a wide fountain + open space at (20, 20).
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 9, 1.4, 24),
      new THREE.MeshLambertMaterial({ color: 0x7fb8d8 }),
    );
    plaza.position.set(20, 0.7, 20);
    this.scene.add(plaza);
    this.colliders.push({ minX: 12, maxX: 28, minZ: 12, maxZ: 28 });
    const jet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 1.4, 6, 8),
      new THREE.MeshLambertMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.7 }),
    );
    jet.position.set(20, 4, 20);
    this.scene.add(jet);
  }

  buildBeach() {
    // Sand strip + bay water south of the city, with a wooden pier.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2, 44),
      new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.05, HALF - 22);
    this.scene.add(sand);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 300),
      new THREE.MeshLambertMaterial({ color: 0x2a7fa8 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.4, HALF + 130);
    this.scene.add(water);
    // Pier at x = -160 (Pier 9) reaching into the bay.
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 70), pierMat);
    pier.position.set(-160, 0.6, HALF + 12);
    this.scene.add(pier);
    const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 3, 6);
    for (let z = HALF - 18; z < HALF + 44; z += 8) {
      for (const px of [-165, -155]) {
        const post = new THREE.Mesh(postGeo, pierMat);
        post.position.set(px, 0, z);
        this.scene.add(post);
      }
    }
    // Boardwalk fence along the beach edge.
    const railMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    const railGeo = new THREE.BoxGeometry(18, 0.25, 0.25);
    const fencePostGeo = new THREE.BoxGeometry(0.3, 1.2, 0.3);
    for (let x = -HALF + 10; x < HALF; x += 20) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(x, 1.1, HALF - 44);
      this.scene.add(rail);
      const post = new THREE.Mesh(fencePostGeo, railMat);
      post.position.set(x, 0.6, HALF - 44);
      this.scene.add(post);
    }
  }

  buildProps() {
    const rng = this.rng;
    // Palm trees along the beach and around the plaza.
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
    const leafGeo = new THREE.ConeGeometry(1.1, 4.5, 4);
    const spots = [];
    for (let x = -180; x <= 180; x += 24) spots.push([x, HALF - 38]);
    for (let i = 0; i < 8; i++) spots.push([(rng() - 0.5) * 60, (rng() - 0.5) * 60]);
    for (const [x, z] of spots) {
      if (dist2D(x, z, 20, 20) < 14) continue; // keep the fountain clear
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 3.5, z);
      trunk.rotation.z = (rng() - 0.5) * 0.2;
      this.scene.add(trunk);
      for (let k = 0; k < 5; k++) {
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        const angle = (k / 5) * Math.PI * 2;
        leaf.position.set(x + Math.cos(angle) * 1.6, 7.2, z + Math.sin(angle) * 1.6);
        leaf.rotation.z = Math.cos(angle) * 1.1;
        leaf.rotation.x = -Math.sin(angle) * 1.1;
        this.scene.add(leaf);
      }
      this.colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
    }
    // Street lamps at every other intersection.
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
    const lampMat = new THREE.MeshLambertMaterial({
      color: 0xffe9a8,
      emissive: 0xffdf80,
      emissiveIntensity: 0.9,
    });
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 7, 6);
    const lampGeo = new THREE.SphereGeometry(0.55, 8, 6);
    for (const rx of roadCoords()) {
      for (const rz of roadCoords()) {
        if ((rx + rz) % 80 !== 0) continue;
        const lx = rx + ROAD_W / 2 + 1;
        const lz = rz + ROAD_W / 2 + 1;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(lx, 3.5, lz);
        this.scene.add(pole);
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(lx, 7.2, lz);
        this.scene.add(lamp);
      }
    }
    // Dockyard crates (south-west) — cover for the final mission.
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xb08a3e });
    const crateMat2 = new THREE.MeshLambertMaterial({ color: 0x5a7a9a });
    const crateGeo = new THREE.BoxGeometry(4, 4, 4);
    for (let i = 0; i < 18; i++) {
      const cx = -160 + rng() * 70;
      const cz = 120 + rng() * 36;
      const crate = new THREE.Mesh(crateGeo, rng() < 0.5 ? crateMat : crateMat2);
      crate.position.set(cx, 2, cz);
      crate.rotation.y = rng() * Math.PI;
      this.scene.add(crate);
      this.colliders.push({ minX: cx - 2.4, maxX: cx + 2.4, minZ: cz - 2.4, maxZ: cz + 2.4 });
    }
  }

  buildSigns() {
    // Glowing neon signs over key locations — the city's character.
    const signs = [
      { text: 'NEON BAY', pos: [0, 26, -20], color: '#ff5ad0', bg: '#1a1030', w: 34 },
      { text: "MARLA'S", pos: [40, 18, -120], color: '#59f7ff', bg: '#0a1a24', w: 18 },
      { text: 'SUNSET CLUB', pos: [160, 16, 120], color: '#ffb347', bg: '#241024', w: 22 },
      { text: 'PIER 9', pos: [-160, 10, 178], color: '#7dff8a', bg: '#0a2418', w: 14 },
      { text: 'PAINT SHOP', pos: [120, 14, -40], color: '#ff6b6b', bg: '#241014', w: 18 },
      { text: 'BAYFRONT', pos: [-80, 12, 178], color: '#59f7ff', bg: '#0a1a24', w: 20 },
    ];
    for (const sign of signs) {
      const tex = signTexture(sign.text, sign.color, sign.bg);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(sign.w, sign.w / 4),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      mesh.position.set(sign.pos[0], sign.pos[1], sign.pos[2]);
      // Face the nearest road.
      mesh.rotation.y = sign.pos[0] >= 0 ? -Math.PI / 2 : Math.PI / 2;
      if (Math.abs(sign.pos[2]) > Math.abs(sign.pos[0])) {
        mesh.rotation.y = sign.pos[2] > 0 ? Math.PI : 0;
      }
      this.scene.add(mesh);
    }
  }

  /**
   * Push a circle out of every collider it overlaps, then clamp it to the
   * playable area (the bay extends a little further south than the city).
   * Returns [x, z].
   */
  resolveCollisions(x, z, r) {
    let nx = x;
    let nz = z;
    for (const box of this.colliders) {
      if (nx > box.minX - r && nx < box.maxX + r && nz > box.minZ - r && nz < box.maxZ + r) {
        [nx, nz] = resolveCircleBox(nx, nz, r, box);
      }
    }
    return [clamp(nx, -HALF + 2, HALF + 2), clamp(nz, -HALF + 2, HALF + 130)];
  }
}
