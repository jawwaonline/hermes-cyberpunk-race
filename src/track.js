import * as THREE from 'three';
import { TRACK_WIDTH, WAYPOINTS, BOOST_PADS } from './shared-track.js';

const CHECKPOINTS = [];

for (let i = 0; i < 4; i++) {
  const idx = Math.floor((i / 4) * WAYPOINTS.length);
  const wp = WAYPOINTS[idx];
  CHECKPOINTS.push({ id: i, x: wp.x, z: wp.z, y: wp.y, r: 15 });
}

export { TRACK_WIDTH, WAYPOINTS, BOOST_PADS, CHECKPOINTS };

export const BARRIER_HEIGHT = 2;

const CYAN = 0x00F5FF;
const MAGENTA = 0xFF006E;
const PURPLE = 0x9D4EDD;
const DEEP_BLUE = 0x0A0E27;
const TRACK_COLOR = 0x0A0E27;

function computeTrackTangent(waypoints, i) {
  const n = waypoints.length;
  const next = i + 1 < n ? i + 1 : 0;
  const dx = waypoints[next].x - waypoints[i].x;
  const dz = waypoints[next].z - waypoints[i].z;
  const dy = waypoints[next].y - waypoints[i].y;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) {
    // Degenerate case (duplicate waypoint at closure). Fall back to a
    // forward tangent from the previous waypoint, or zero vector if at i=0.
    const prev = i > 0 ? i - 1 : 0;
    const pdx = waypoints[i].x - waypoints[prev].x;
    const pdz = waypoints[i].z - waypoints[prev].z;
    const pdy = waypoints[i].y - waypoints[prev].y;
    const plen = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz) || 1;
    return { x: pdx / plen, y: pdy / plen, z: pdz / plen };
  }
  return { x: dx / len, y: dy / len, z: dz / len };
}

function computeTrackNormal(i, waypoints) {
  const t = computeTrackTangent(waypoints, i);
  const horizontal = Math.sqrt(t.x * t.x + t.z * t.z);
  const bankAngle = Math.atan2(t.y, horizontal);
  const bankedNormal = {
    x: -t.z * Math.cos(bankAngle * 0.3),
    y: Math.sin(bankAngle * 0.3) + 0.5,
    z: t.x * Math.cos(bankAngle * 0.3)
  };
  const len = Math.sqrt(bankedNormal.x ** 2 + bankedNormal.y ** 2 + bankedNormal.z ** 2);
  return { x: bankedNormal.x / len, y: bankedNormal.y / len, z: bankedNormal.z / len };
}

export function createTrack(scene) {
  const trackGroup = new THREE.Group();
  trackGroup.name = 'track';

  const groundGeo = new THREE.PlaneGeometry(800, 800);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x050510,
    roughness: 0.95,
    metalness: 0.05
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  trackGroup.add(ground);

  const numSegments = 200;
  const halfW = TRACK_WIDTH / 2;
  const vertices = [];
  const indices = [];
  const uvs = [];
  const colors = [];

  const gridVertShader = `
    varying vec2 vUv;
    varying vec3 vWorldPos;
    void main() {
      vUv = uv;
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const gridFragShader = `
    varying vec2 vUv;
    varying vec3 vWorldPos;
    uniform float uTime;
    uniform vec3 uPlayerPos;
    void main() {
      vec2 worldUV = vWorldPos.xz * 0.05;
      float scroll = uTime * 0.5;
      vec2 scrolledUV = worldUV + vec2(0.0, scroll);
      float lineX = abs(fract(scrolledUV.x * 2.0) - 0.5) * 2.0;
      float lineZ = abs(fract(scrolledUV.y * 2.0) - 0.5) * 2.0;
      float grid = 1.0 - smoothstep(0.85, 1.0, max(lineX, lineZ));
      vec3 baseColor = vec3(0.04, 0.05, 0.15);
      vec3 lineColor = vec3(0.0, 0.96, 1.0) * 0.3;
      vec3 finalColor = mix(baseColor, lineColor, grid * 0.5);
      float distToPlayer = length(vWorldPos.xz - uPlayerPos.xz);
      float fadeStart = 50.0;
      float fadeEnd = 150.0;
      float fade = 1.0 - smoothstep(fadeStart, fadeEnd, distToPlayer);
      gl_FragColor = vec4(finalColor, fade * 0.8 + 0.2);
    }
  `;

  for (let i = 0; i <= numSegments; i++) {
    const wp = WAYPOINTS[i % WAYPOINTS.length];
    const t = computeTrackTangent(WAYPOINTS, i % WAYPOINTS.length);
    const n = computeTrackNormal(i % WAYPOINTS.length, WAYPOINTS);
    const rightX = -t.z;
    const rightZ = t.x;

    const leftX = wp.x + rightX * halfW;
    const leftZ = wp.z + rightZ * halfW;
    const rightX2 = wp.x - rightX * halfW;
    const rightZ2 = wp.z - rightZ * halfW;

    vertices.push(leftX, wp.y, leftZ);
    vertices.push(rightX2, wp.y, rightZ2);

    uvs.push(0, i / numSegments);
    uvs.push(1, i / numSegments);

    const speed = 0.3 + Math.sin(i * 0.1) * 0.1;
    colors.push(0.04, 0.05, 0.15);
    colors.push(0.04, 0.05, 0.15);
  }

  for (let i = 0; i < numSegments; i++) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  const trackGeo = new THREE.BufferGeometry();
  trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  trackGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  trackGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  trackGeo.setIndex(indices);
  trackGeo.computeVertexNormals();

  const trackMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPlayerPos: { value: new THREE.Vector3() }
    },
    vertexShader: gridVertShader,
    fragmentShader: gridFragShader,
    side: THREE.DoubleSide,
    transparent: true
  });

  const trackSurface = new THREE.Mesh(trackGeo, trackMat);
  trackSurface.name = 'trackSurface';
  trackGroup.add(trackSurface);
  trackGroup.userData.trackMat = trackMat;

  const barrierMatCyan = new THREE.MeshStandardMaterial({
    color: CYAN,
    emissive: CYAN,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.8
  });

  const barrierMatMagenta = new THREE.MeshStandardMaterial({
    color: MAGENTA,
    emissive: MAGENTA,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.8
  });

  const barrierGeo = new THREE.BoxGeometry(0.8, BARRIER_HEIGHT, 1.5);
  const barrierSegCount = 120;

  for (let i = 0; i < barrierSegCount; i++) {
    const idx = Math.floor((i / barrierSegCount) * WAYPOINTS.length);
    const wp = WAYPOINTS[idx % WAYPOINTS.length];
    const nextIdx = (idx + 1) % WAYPOINTS.length;
    const t = computeTrackTangent(WAYPOINTS, idx);
    const rightX = -t.z;
    const rightZ = t.x;

    const outerX = wp.x + rightX * (halfW + 1);
    const outerZ = wp.z + rightZ * (halfW + 1);
    const innerX = wp.x - rightX * (halfW + 1);
    const innerZ = wp.z - rightZ * (halfW + 1);

    const outerBarrier = new THREE.Mesh(barrierGeo, barrierMatCyan);
    outerBarrier.position.set(outerX, wp.y + BARRIER_HEIGHT / 2, outerZ);
    outerBarrier.rotation.y = Math.atan2(t.x, t.z);
    trackGroup.add(outerBarrier);

    const innerBarrier = new THREE.Mesh(barrierGeo, barrierMatMagenta);
    innerBarrier.position.set(innerX, wp.y + BARRIER_HEIGHT / 2, innerZ);
    innerBarrier.rotation.y = Math.atan2(t.x, t.z);
    trackGroup.add(innerBarrier);

    const edgeGeo = new THREE.BoxGeometry(0.2, 0.3, 1.5);
    const edgeMat = new THREE.MeshBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.9,
      toneMapped: false
    });
    const outerEdge = new THREE.Mesh(edgeGeo, edgeMat);
    outerEdge.position.set(outerX, wp.y + BARRIER_HEIGHT + 0.15, outerZ);
    outerEdge.rotation.y = Math.atan2(t.x, t.z);
    trackGroup.add(outerEdge);

    const innerEdge = new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({
      color: MAGENTA,
      transparent: true,
      opacity: 0.9,
      toneMapped: false
    }));
    innerEdge.position.set(innerX, wp.y + BARRIER_HEIGHT + 0.15, innerZ);
    innerEdge.rotation.y = Math.atan2(t.x, t.z);
    trackGroup.add(innerEdge);
  }

  const pillarGeo = new THREE.CylinderGeometry(0.3, 0.3, 10, 8);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x1A1A2E,
    emissive: PURPLE,
    emissiveIntensity: 0.4
  });

  const PILLAR_COUNT = 20;
  for (let i = 0; i < PILLAR_COUNT; i++) {
    const idx = Math.floor((i / PILLAR_COUNT) * WAYPOINTS.length);
    const wp = WAYPOINTS[idx];
    const t = computeTrackTangent(WAYPOINTS, idx);
    const rightX = -t.z;
    const rightZ = t.x;

    const pillarPos = new THREE.Vector3(
      wp.x + rightX * (halfW + 3),
      wp.y / 2 + 5,
      wp.z + rightZ * (halfW + 3)
    );

    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.copy(pillarPos);
    pillar.position.y = wp.y / 2 + 5;
    trackGroup.add(pillar);

    const lightGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const light = new THREE.Mesh(lightGeo, barrierMatCyan);
    light.position.set(pillarPos.x, wp.y + 10, pillarPos.z);
    trackGroup.add(light);
  }

  const boostGeo = new THREE.BoxGeometry(4, 0.1, 8);
  const boostMat = new THREE.MeshBasicMaterial({
    color: 0x00FF88,
    transparent: true,
    opacity: 0.8,
    toneMapped: false
  });

    for (const pad of BOOST_PADS) {
    const boost = new THREE.Mesh(boostGeo, boostMat.clone());
    boost.position.set(pad.x, pad.y + 0.1, pad.z);
    boost.rotation.y = pad.angle;
    boost.userData.isBoostPad = true;
    boost.userData.strength = pad.strength;
    trackGroup.add(boost);

    const arrowGeo = new THREE.ConeGeometry(0.8, 2, 4);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0x00FF88,
      transparent: true,
      opacity: 0.9,
      toneMapped: false
    });
    for (let a = 0; a < 3; a++) {
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.position.set(pad.x + Math.cos(pad.angle) * (a * 2 - 2), pad.y + 0.3, pad.z + Math.sin(pad.angle) * (a * 2 - 2));
      arrow.rotation.x = Math.PI / 2;
      arrow.rotation.z = -pad.angle;
      trackGroup.add(arrow);
    }
  }

  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 2);
  arrowShape.lineTo(1.2, -1);
  arrowShape.lineTo(0.4, -0.5);
  arrowShape.lineTo(0.4, -2);
  arrowShape.lineTo(-0.4, -2);
  arrowShape.lineTo(-0.4, -0.5);
  arrowShape.lineTo(-1.2, -1);
  arrowShape.closePath();

  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  const arrowMat = new THREE.MeshBasicMaterial({
    color: 0x00F5FF,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  const ARROW_INTERVAL = 8;
  for (let i = 0; i < WAYPOINTS.length; i += ARROW_INTERVAL) {
    const wp = WAYPOINTS[i];
    const nextWp = WAYPOINTS[(i + 1) % WAYPOINTS.length];
    const dx = nextWp.x - wp.x;
    const dz = nextWp.z - wp.z;
    const angle = Math.atan2(dx, dz);

    const arrow = new THREE.Mesh(arrowGeo, arrowMat.clone());
    arrow.position.set(wp.x, wp.y + 0.15, wp.z);
    arrow.rotation.x = -Math.PI / 2;
    arrow.rotation.z = -angle;
    trackGroup.add(arrow);
  }

  const neonStripMatCyan = new THREE.MeshBasicMaterial({
    color: 0x00F5FF,
    transparent: true,
    opacity: 0.6,
    toneMapped: false
  });
  const neonStripMatPink = new THREE.MeshBasicMaterial({
    color: 0xFF006E,
    transparent: true,
    opacity: 0.6,
    toneMapped: false
  });

  const STRIP_SEGMENTS = 100;
  for (let side = -1; side <= 1; side += 2) {
    const stripVertices = [];
    const stripIndices = [];
    const halfW = TRACK_WIDTH / 2 + 0.5;

    for (let i = 0; i <= STRIP_SEGMENTS; i++) {
      const idx = Math.floor((i / STRIP_SEGMENTS) * WAYPOINTS.length);
      const wp = WAYPOINTS[idx % WAYPOINTS.length];
      const t = computeTrackTangent(WAYPOINTS, idx);
      const rightX = -t.z;
      const rightZ = t.x;

      const x = wp.x + rightX * halfW * side;
      const z = wp.z + rightZ * halfW * side;
      stripVertices.push(x, wp.y + 0.2, z);
    }

    for (let i = 0; i < STRIP_SEGMENTS; i++) {
      const base = i;
      stripIndices.push(base, base + 1, base + STRIP_SEGMENTS + 1);
      stripIndices.push(base + 1, base + STRIP_SEGMENTS + 2, base + STRIP_SEGMENTS + 1);
    }

    const stripGeo = new THREE.BufferGeometry();
    stripGeo.setAttribute('position', new THREE.Float32BufferAttribute(stripVertices, 3));
    stripGeo.setIndex(stripIndices);
    stripGeo.computeVertexNormals();

    const strip = new THREE.Mesh(stripGeo, side === -1 ? neonStripMatCyan : neonStripMatPink);
    trackGroup.add(strip);
  }

  scene.add(trackGroup);

  return {
    group: trackGroup,
    length: WAYPOINTS.length,
    width: TRACK_WIDTH
  };
}

export function createFinishLine(scene) {
  const gateGroup = new THREE.Group();
  gateGroup.name = 'finishLine';

  const startWp = WAYPOINTS[0];
  const nextWp = WAYPOINTS[1];
  const dx = nextWp.x - startWp.x;
  const dz = nextWp.z - startWp.z;
  const angle = Math.atan2(dx, dz);
  const rightX = -Math.sin(angle);
  const rightZ = Math.cos(angle);

  const postGeo = new THREE.BoxGeometry(1, 12, 1);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.8
  });

  const leftPost = new THREE.Mesh(postGeo, postMat);
  leftPost.position.set(
    startWp.x + rightX * (TRACK_WIDTH / 2 + 1),
    startWp.y + 6,
    startWp.z + rightZ * (TRACK_WIDTH / 2 + 1)
  );
  gateGroup.add(leftPost);

  const rightPost = new THREE.Mesh(postGeo, postMat);
  rightPost.position.set(
    startWp.x - rightX * (TRACK_WIDTH / 2 + 1),
    startWp.y + 6,
    startWp.z - rightZ * (TRACK_WIDTH / 2 + 1)
  );
  gateGroup.add(rightPost);

  const stripeGeo = new THREE.BoxGeometry(TRACK_WIDTH + 4, 0.5, 1);
  const stripeMatWhite = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const stripeMatBlack = new THREE.MeshStandardMaterial({ color: 0x000000 });

  for (let i = 0; i < 8; i++) {
    const stripe = new THREE.Mesh(stripeGeo, i % 2 === 0 ? stripeMatWhite : stripeMatBlack);
    stripe.position.set(startWp.x, startWp.y + 11.5, startWp.z - 3 + i * 1);
    stripe.rotation.y = angle;
    gateGroup.add(stripe);
  }

  const glowVertShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const glowFragShader = `
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      float pulse = 0.7 + 0.3 * sin(uTime * 4.0);
      vec3 cyan = vec3(0.0, 0.96, 1.0);
      vec3 pink = vec3(1.0, 0.0, 0.43);
      float mixFactor = sin(uTime * 2.0) * 0.5 + 0.5;
      vec3 color = mix(cyan, pink, mixFactor);
      float stripe = step(0.5, fract(vUv.x * 8.0));
      color = mix(color, vec3(1.0), stripe * 0.5);
      gl_FragColor = vec4(color * pulse, 0.9);
    }
  `;
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: glowVertShader,
    fragmentShader: glowFragShader,
    transparent: true,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const glowGeo = new THREE.BoxGeometry(TRACK_WIDTH + 4, 0.3, 3);
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(startWp.x, startWp.y + 13, startWp.z);
  glow.rotation.y = angle;
  glow.name = 'finishGlow';
  gateGroup.add(glow);

  const stripGeo = new THREE.BoxGeometry(TRACK_WIDTH + 6, 0.1, 0.3);
  const stripMat = new THREE.MeshBasicMaterial({
    color: 0x00F5FF,
    transparent: true,
    opacity: 0.8,
    toneMapped: false
  });
  for (let side = -1; side <= 1; side += 2) {
    const strip = new THREE.Mesh(stripGeo, stripMat.clone());
    strip.position.set(
      startWp.x + rightX * (TRACK_WIDTH / 2 + 1.5) * side,
      startWp.y + 0.1,
      startWp.z + rightZ * (TRACK_WIDTH / 2 + 1.5) * side
    );
    strip.rotation.y = angle;
    gateGroup.add(strip);
  }

  scene.add(gateGroup);
  return gateGroup;
}

export function updateFinishLine(finishLine, time) {
  const glow = finishLine.getObjectByName('finishGlow');
  if (glow && glow.material.uniforms) {
    glow.material.uniforms.uTime.value = time;
  }
}

export function createCheckpointRings(scene) {
  const group = new THREE.Group();
  group.name = 'checkpoints';
  group.userData.rings = [];
  group.userData.checkpoints = CHECKPOINTS;

  for (const cp of CHECKPOINTS) {
    const ringGeo = new THREE.TorusGeometry(12, 0.4, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00F5FF,
      transparent: true,
      opacity: 0.85,
      toneMapped: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(cp.x, cp.y + 3, cp.z);
    ring.rotation.x = Math.PI / 2;
    ring.userData.checkpointId = cp.id;
    ring.userData.flashUntil = 0;
    ring.userData.baseScale = 1;
    group.add(ring);
    group.userData.rings.push(ring);

    const ring2 = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
    ring2.position.set(cp.x, cp.y + 3, cp.z);
    ring2.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    group.add(ring2);
  }

  scene.add(group);
  return group;
}

export function flashCheckpoint(ringGroup, checkpointId, now = performance.now()) {
  for (const r of ringGroup.userData.rings) {
    if (r.userData.checkpointId === checkpointId) {
      r.userData.flashUntil = now + 500;
    }
  }
}

export function updateCheckpointRings(ringGroup, now = performance.now(), nextCheckpoint = -1) {
  const getIntensity = (i) => {
    if (i === nextCheckpoint) return 1.0;
    if (nextCheckpoint >= 0 && i === (nextCheckpoint + 1) % ringGroup.userData.checkpoints.length) return 0.4;
    return 0.2;
  };

  for (const r of ringGroup.userData.rings) {
    const flashing = now < (r.userData.flashUntil || 0);
    if (flashing) {
      r.material.color.setHex(0xFF006E);
      const t = (r.userData.flashUntil - now) / 500;
      const s = 1.0 + 0.4 * t;
      r.scale.set(s, s, s);
    } else {
      r.material.color.setHex(0x00F5FF);
      r.scale.set(1, 1, 1);
      const id = r.userData.checkpointId;
      const target = getIntensity(id);
      const pulse = target + 0.3 * Math.sin(now * 0.004) * (target > 0.5 ? 1 : 0);
      r.material.opacity = 0.4 + 0.5 * pulse;
    }
  }
}

export function getClosestWaypointIndex(x, z) {
  let nearestDist = Infinity;
  let nearestIdx = 0;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const wp = WAYPOINTS[i];
    const dist = Math.hypot(wp.x - x, wp.z - z);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  }
  return nearestIdx;
}

export function isOnTrack(x, z) {
  const idx = getClosestWaypointIndex(x, z);
  const wp = WAYPOINTS[idx];
  const dist = Math.hypot(wp.x - x, wp.z - z);
  return dist < TRACK_WIDTH / 2 + 2;
}

/**
 * Get the interpolated Y height at an arbitrary (x,z) position on the track.
 * Projects the position onto the nearest segment between two consecutive
 * waypoints and interpolates Y, giving smooth transitions even at high speed.
 * Returns wp.y directly when segment length is too small to interpolate.
 */
export function getTrackYAtPosition(x, z) {
  const idx = getClosestWaypointIndex(x, z);
  const wp = WAYPOINTS[idx];
  const wpNext = WAYPOINTS[(idx + 1) % WAYPOINTS.length];
  if (!wp || !wpNext) return wp ? wp.y : 0;
  const tdx = wpNext.x - wp.x;
  const tdz = wpNext.z - wp.z;
  const segLenSq = tdx * tdx + tdz * tdz;
  if (segLenSq < 0.01) return wp.y;
  const dx = x - wp.x;
  const dz = z - wp.z;
  const t = Math.max(0, Math.min(1, (dx * tdx + dz * tdz) / segLenSq));
  return wp.y + (wpNext.y - wp.y) * t;
}

export function updateTrackShader(trackGroup, time, playerPos) {
  if (trackGroup.userData.trackMat) {
    trackGroup.userData.trackMat.uniforms.uTime.value = time;
    trackGroup.userData.trackMat.uniforms.uPlayerPos.value.copy(playerPos);
  }
}
