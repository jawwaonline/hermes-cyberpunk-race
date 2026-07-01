import * as THREE from 'three';
import { TRACK_WIDTH, TRACK_LENGTH, WAYPOINTS } from './shared-track.js';

export { TRACK_WIDTH, TRACK_LENGTH, WAYPOINTS };

export const BARRIER_HEIGHT = 2;

const CYAN = 0x00F5FF;
const MAGENTA = 0xFF006E;
const PURPLE = 0x9D4EDD;
const YELLOW = 0xFFFF00;
const TRACK_COLOR = 0x0A0E27;
const DEEP_BLUE = 0x0A0E27;

export function createTrack(scene) {
  const trackGroup = new THREE.Group();
  trackGroup.name = 'track';

  // === GROUND PLANE ===
  const groundGeo = new THREE.PlaneGeometry(600, 600);
  const groundMat = new THREE.MeshStandardMaterial({
    color: DEEP_BLUE,
    roughness: 0.9,
    metalness: 0.1
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  trackGroup.add(ground);

  // === TRACK SURFACE (ELLIPTICAL OVAL) ===
  const aOuter = 30 + TRACK_WIDTH / 2; // x outer radius
  const bOuter = 200 + TRACK_WIDTH / 2; // z outer radius
  const aInner = 30 - TRACK_WIDTH / 2; // x inner radius
  const bInner = 200 - TRACK_WIDTH / 2; // z inner radius

  // Create track surface as a custom geometry (donut/ring shape)
  const trackGeo = new THREE.BufferGeometry();
  const vertices = [];
  const indices = [];
  
  const segments = 64;
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    
    // Outer edge
    vertices.push(aOuter * cosT, 0, bOuter * sinT);
    // Inner edge
    vertices.push(aInner * cosT, 0, bInner * sinT);
  }
  
  for (let i = 0; i < segments; i++) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }
  
  trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  trackGeo.setIndex(indices);
  trackGeo.computeVertexNormals();
  
  const trackMat = new THREE.MeshStandardMaterial({
    color: TRACK_COLOR,
    roughness: 0.7,
    metalness: 0.3,
    side: THREE.DoubleSide
  });
  
  const trackSurface = new THREE.Mesh(trackGeo, trackMat);
  trackSurface.position.y = 0.01;
  trackGroup.add(trackSurface);

  // === TRACK CENTER LINE (dashed) ===
  const centerLineMat = new THREE.MeshStandardMaterial({
    color: 0x333344,
    roughness: 0.5,
    metalness: 0.5
  });
  
  const A = 30; // centerline x radius
  const B = 200; // centerline z radius
  
  for (let i = 0; i < 32; i++) {
    const t = (i / 32) * Math.PI * 2;
    const x = A * Math.cos(t);
    const z = B * Math.sin(t);
    
    const dashGeo = new THREE.BoxGeometry(0.5, 0.05, 4);
    const dash = new THREE.Mesh(dashGeo, centerLineMat);
    dash.position.set(x, 0.02, z);
    // Orient tangent to ellipse
    const tangentAngle = Math.atan2(B * Math.cos(t), -A * Math.sin(t));
    dash.rotation.y = -t + Math.PI / 2;
    trackGroup.add(dash);
  }

  // === BARRIER MATERIALS ===
  const barrierMatCyan = new THREE.MeshStandardMaterial({
    color: CYAN,
    emissive: CYAN,
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0.8
  });
  const barrierMatMagenta = new THREE.MeshStandardMaterial({
    color: MAGENTA,
    emissive: MAGENTA,
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0.8
  });

  const barrierGeo = new THREE.BoxGeometry(1, BARRIER_HEIGHT, 1);

  // === BARRIERS ALONG OVAL ===
  const BARRIER_SEGMENTS = 48;
  for (let i = 0; i < BARRIER_SEGMENTS; i++) {
    const t = (i / BARRIER_SEGMENTS) * Math.PI * 2;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    
    // Outer barrier (cyan) - on outer edge
    const xOuter = (30 + TRACK_WIDTH / 2 + 0.5) * cosT;
    const zOuter = (200 + TRACK_WIDTH / 2 + 0.5) * sinT;
    const barrier1 = new THREE.Mesh(barrierGeo, barrierMatCyan);
    barrier1.position.set(xOuter, BARRIER_HEIGHT / 2, zOuter);
    trackGroup.add(barrier1);
    
    // Inner barrier (magenta) - on inner edge
    const xInner = (30 - TRACK_WIDTH / 2 - 0.5) * cosT;
    const zInner = (200 - TRACK_WIDTH / 2 - 0.5) * sinT;
    const barrier2 = new THREE.Mesh(barrierGeo, barrierMatMagenta);
    barrier2.position.set(xInner, BARRIER_HEIGHT / 2, zInner);
    trackGroup.add(barrier2);

    // === Sprint 6 Fix C: invisible collider wall segments ===
    // Same x/z as the visible barrier, but with visible=false and a
    // userData tag so the game loop can resolve wall hits.
    const colliderGeo = new THREE.BoxGeometry(1.2, BARRIER_HEIGHT, 1.2);
    const colliderMat = new THREE.MeshBasicMaterial({ visible: false });
    const wallOuter = new THREE.Mesh(colliderGeo, colliderMat);
    wallOuter.position.set(xOuter, BARRIER_HEIGHT / 2, zOuter);
    wallOuter.userData.isWall = true;
    wallOuter.userData.normalAngle = t; // radial outward normal
    trackGroup.add(wallOuter);
    const wallInner = new THREE.Mesh(colliderGeo.clone(), colliderMat);
    wallInner.position.set(xInner, BARRIER_HEIGHT / 2, zInner);
    wallInner.userData.isWall = true;
    wallInner.userData.normalAngle = t + Math.PI; // radial inward
    trackGroup.add(wallInner);
  }

  // === SUPPORT PILLARS WITH LIGHTS ===
  const pillarGeo = new THREE.CylinderGeometry(0.3, 0.3, 8, 8);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x1A1A2E,
    emissive: PURPLE,
    emissiveIntensity: 0.5
  });

  const PILLAR_COUNT = 16;
  for (let i = 0; i < PILLAR_COUNT; i++) {
    const t = (i / PILLAR_COUNT) * Math.PI * 2;
    
    // Outer pillar position
    const pillar1Pos = new THREE.Vector3(
      (30 + TRACK_WIDTH / 2 + 2) * Math.cos(t),
      4,
      (200 + TRACK_WIDTH / 2 + 2) * Math.sin(t)
    );
    const pillar1 = new THREE.Mesh(pillarGeo, pillarMat);
    pillar1.position.copy(pillar1Pos);
    trackGroup.add(pillar1);

    // Light on outer pillar
    const lightGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const light1 = new THREE.Mesh(lightGeo, barrierMatCyan);
    light1.position.set(pillar1Pos.x, 8.5, pillar1Pos.z);
    trackGroup.add(light1);

    // Inner pillar (opposite side)
    const pillar2Pos = new THREE.Vector3(
      (30 - TRACK_WIDTH / 2 - 2) * Math.cos(t),
      4,
      (200 - TRACK_WIDTH / 2 - 2) * Math.sin(t)
    );
    const pillar2 = new THREE.Mesh(pillarGeo, pillarMat);
    pillar2.position.copy(pillar2Pos);
    trackGroup.add(pillar2);

    // Light on inner pillar
    const light2 = new THREE.Mesh(lightGeo, barrierMatMagenta);
    light2.position.set(pillar2Pos.x, 8.5, pillar2Pos.z);
    trackGroup.add(light2);
  }

  scene.add(trackGroup);

  return {
    group: trackGroup,
    length: TRACK_LENGTH,
    width: TRACK_WIDTH
  };
}

export function createFinishLine(scene) {
  const gateGroup = new THREE.Group();
  gateGroup.name = 'finishLine';

  // Finish line at the bottom of the oval (z = -200)
  const FINISH_Z = -200;
  
  const postGeo = new THREE.BoxGeometry(1, 10, 1);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.5
  });

  // Posts at the track edges
  const leftPost = new THREE.Mesh(postGeo, postMat);
  leftPost.position.set(-TRACK_WIDTH / 2 - 1, 5, FINISH_Z);
  gateGroup.add(leftPost);

  const rightPost = new THREE.Mesh(postGeo, postMat);
  rightPost.position.set(TRACK_WIDTH / 2 + 1, 5, FINISH_Z);
  gateGroup.add(rightPost);

  // Checkered banner
  const stripeGeo = new THREE.BoxGeometry(TRACK_WIDTH + 4, 0.5, 1);
  const stripeMatWhite = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const stripeMatBlack = new THREE.MeshStandardMaterial({ color: 0x000000 });

  for (let i = 0; i < 8; i++) {
    const stripe = new THREE.Mesh(stripeGeo, i % 2 === 0 ? stripeMatWhite : stripeMatBlack);
    stripe.position.set(0, 9.5, -3 + i * 1);
    gateGroup.add(stripe);
  }

  // Glow effect
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.6
  });
  const glowGeo = new THREE.BoxGeometry(TRACK_WIDTH + 4, 0.2, 2);
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(0, 10.2, FINISH_Z);
  gateGroup.add(glow);

  scene.add(gateGroup);

  return gateGroup;
}

// === CHECKPOINT RINGS (Fix B) ===
// 4 cyan torus rings at the 4 CHECKPOINTS positions. When a car
// crosses one, the ring flashes magenta + briefly enlarges.
const CHECKPOINTS = [
  { id: 0, x: 0,   z: -200, r: 15 },
  { id: 1, x: 30,  z: 0,    r: 15 },
  { id: 2, x: 0,   z: 200,  r: 15 },
  { id: 3, x: -30, z: 0,    r: 15 }
];

export function createCheckpointRings(scene) {
  const group = new THREE.Group();
  group.name = 'checkpoints';
  group.userData.rings = [];
  group.userData.checkpoints = CHECKPOINTS;

  for (const cp of CHECKPOINTS) {
    // Two stacked tori for a thicker neon look
    const ringGeo = new THREE.TorusGeometry(12, 0.4, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00F5FF,            // cyan
      transparent: true,
      opacity: 0.85,
      toneMapped: false          // unaffected by tone-mapping for max neon
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(cp.x, 3, cp.z);
    ring.rotation.x = Math.PI / 2; // face up (so the ring is horizontal)
    ring.userData.checkpointId = cp.id;
    ring.userData.flashUntil = 0;
    ring.userData.baseScale = 1;
    group.add(ring);
    group.userData.rings.push(ring);

    // A second torus rotated 90° for a more visible "tube" silhouette
    const ring2 = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
    ring2.position.set(cp.x, 3, cp.z);
    ring2.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    group.add(ring2);
  }

  scene.add(group);
  return group;
}

// Trigger a flash on the ring just hit.
export function flashCheckpoint(ringGroup, checkpointId, now = performance.now()) {
  for (const r of ringGroup.userData.rings) {
    if (r.userData.checkpointId === checkpointId) {
      r.userData.flashUntil = now + 500; // 500ms flash
    }
  }
}

// Per-frame update: any ring whose flashUntil is in the future pulses
// pink + slightly larger; all others stay cyan.
// Wipeout-style: the *next* ring (nextCheckpoint index) gets full pulse,
// the *following* ring (nextCheckpoint+1) gets 0.4 intensity,
// all others get 0.2 (so the player sees a clear "follow this" hierarchy).
export function updateCheckpointRings(ringGroup, now = performance.now(), nextCheckpoint = -1) {
  // Compute target intensity for each ring index
  const getIntensity = (i) => {
    if (i === nextCheckpoint) return 1.0;        // NEXT — full glow
    if (nextCheckpoint >= 0 && i === (nextCheckpoint + 1) % ringGroup.userData.checkpoints.length) return 0.4;  // FOLLOWING
    return 0.2;                                  // others
  };

  for (const r of ringGroup.userData.rings) {
    const flashing = now < (r.userData.flashUntil || 0);
    if (flashing) {
      r.material.color.setHex(0xFF006E); // magenta
      const t = (r.userData.flashUntil - now) / 500;
      const s = 1.0 + 0.4 * t;
      r.scale.set(s, s, s);
    } else {
      r.material.color.setHex(0x00F5FF); // cyan
      r.scale.set(1, 1, 1);
      // Wipeout-style 3-level pulse on the NEXT ring
      const id = r.userData.checkpointId;
      const target = getIntensity(id);
      const pulse = target + 0.3 * Math.sin(now * 0.004) * (target > 0.5 ? 1 : 0);
      r.material.opacity = 0.4 + 0.5 * pulse; // 0.4 (dim) → 0.9 (full pulse)
    }
  }
}
