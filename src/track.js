import * as THREE from 'three';

export const TRACK_WIDTH = 20;
export const TRACK_LENGTH = 300;
export const BARRIER_HEIGHT = 2;

const CYAN = 0x00ffff;
const MAGENTA = 0xff00ff;
const YELLOW = 0xffff00;

export function createTrack(scene) {
  const trackGroup = new THREE.Group();
  trackGroup.name = 'track';

  const groundGeo = new THREE.PlaneGeometry(400, 400);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0f,
    roughness: 0.9,
    metalness: 0.1
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  trackGroup.add(ground);

  const barrierMatCyan = new THREE.MeshStandardMaterial({
    color: CYAN,
    emissive: CYAN,
    emissiveIntensity: 0.8,
    roughness: 0.2,
    metalness: 0.8
  });
  const barrierMatMagenta = new THREE.MeshStandardMaterial({
    color: MAGENTA,
    emissive: MAGENTA,
    emissiveIntensity: 0.8,
    roughness: 0.2,
    metalness: 0.8
  });

  const straightLength = TRACK_LENGTH;
  const curveRadius = TRACK_WIDTH + 4;

  const barrierGeo = new THREE.BoxGeometry(1, BARRIER_HEIGHT, 1);

  const createBarrier = (x, z, material, rotY = 0) => {
    const barrier = new THREE.Mesh(barrierGeo, material);
    barrier.position.set(x, BARRIER_HEIGHT / 2, z);
    barrier.rotation.y = rotY;
    return barrier;
  };

  const leftBarriers = new THREE.Group();
  const rightBarriers = new THREE.Group();

  for (let i = 0; i < straightLength; i += 4) {
    leftBarriers.add(createBarrier(-TRACK_WIDTH / 2 - 0.5, i - straightLength / 2, barrierMatCyan));
    rightBarriers.add(createBarrier(TRACK_WIDTH / 2 + 0.5, i - straightLength / 2, barrierMatMagenta));
  }

  const curveSegments = 20;
  for (let i = 0; i <= curveSegments; i++) {
    const angle = (Math.PI * i) / curveSegments;
    const x = -curveRadius + Math.cos(angle) * curveRadius;
    const z = straightLength / 2 + Math.sin(angle) * curveRadius;
    leftBarriers.add(createBarrier(x, z, barrierMatCyan));
  }
  for (let i = 0; i <= curveSegments; i++) {
    const angle = (Math.PI * i) / curveSegments;
    const x = curveRadius + Math.cos(angle) * curveRadius;
    const z = straightLength / 2 + Math.sin(angle) * curveRadius;
    rightBarriers.add(createBarrier(x, z, barrierMatMagenta));
  }

  for (let i = 0; i < straightLength; i += 4) {
    leftBarriers.add(createBarrier(-TRACK_WIDTH / 2 - 0.5, -i + straightLength / 2, barrierMatCyan));
    rightBarriers.add(createBarrier(TRACK_WIDTH / 2 + 0.5, -i + straightLength / 2, barrierMatMagenta));
  }

  for (let i = 0; i <= curveSegments; i++) {
    const angle = (Math.PI * i) / curveSegments;
    const x = curveRadius + Math.cos(angle + Math.PI) * curveRadius;
    const z = -straightLength / 2 + Math.sin(angle + Math.PI) * curveRadius;
    leftBarriers.add(createBarrier(x, z, barrierMatCyan));
  }
  for (let i = 0; i <= curveSegments; i++) {
    const angle = (Math.PI * i) / curveSegments;
    const x = -curveRadius + Math.cos(angle + Math.PI) * curveRadius;
    const z = -straightLength / 2 + Math.sin(angle + Math.PI) * curveRadius;
    rightBarriers.add(createBarrier(x, z, barrierMatMagenta));
  }

  trackGroup.add(leftBarriers);
  trackGroup.add(rightBarriers);

  const pillarGeo = new THREE.CylinderGeometry(0.3, 0.3, 8, 8);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    emissive: YELLOW,
    emissiveIntensity: 0.3
  });

  for (let i = 0; i < straightLength; i += 30) {
    const pillar1 = new THREE.Mesh(pillarGeo, pillarMat);
    pillar1.position.set(-TRACK_WIDTH / 2 - 3, 4, i - straightLength / 2);
    trackGroup.add(pillar1);

    const pillar2 = new THREE.Mesh(pillarGeo, pillarMat);
    pillar2.position.set(TRACK_WIDTH / 2 + 3, 4, i - straightLength / 2);
    trackGroup.add(pillar2);

    const lightGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const light1 = new THREE.Mesh(lightGeo, barrierMatCyan);
    light1.position.set(-TRACK_WIDTH / 2 - 3, 8.5, i - straightLength / 2);
    trackGroup.add(light1);

    const light2 = new THREE.Mesh(lightGeo, barrierMatMagenta);
    light2.position.set(TRACK_WIDTH / 2 + 3, 8.5, i - straightLength / 2);
    trackGroup.add(light2);
  }

  scene.add(trackGroup);

  return {
    group: trackGroup,
    length: straightLength,
    width: TRACK_WIDTH,
    curveRadius
  };
}

export function createFinishLine(scene) {
  const gateGroup = new THREE.Group();
  gateGroup.name = 'finishLine';

  const postGeo = new THREE.BoxGeometry(1, 10, 1);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.5
  });

  const leftPost = new THREE.Mesh(postGeo, postMat);
  leftPost.position.set(-TRACK_WIDTH / 2 - 1, 5, 0);
  gateGroup.add(leftPost);

  const rightPost = new THREE.Mesh(postGeo, postMat);
  rightPost.position.set(TRACK_WIDTH / 2 + 1, 5, 0);
  gateGroup.add(rightPost);

  const stripeGeo = new THREE.BoxGeometry(TRACK_WIDTH + 4, 0.5, 1);
  const stripeMatWhite = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const stripeMatBlack = new THREE.MeshStandardMaterial({ color: 0x000000 });

  for (let i = 0; i < 8; i++) {
    const stripe = new THREE.Mesh(stripeGeo, i % 2 === 0 ? stripeMatWhite : stripeMatBlack);
    stripe.position.set(0, 9.5, -3 + i * 1);
    gateGroup.add(stripe);
  }

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.6
  });
  const glowGeo = new THREE.BoxGeometry(TRACK_WIDTH + 4, 0.2, 2);
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(0, 10.2, 0);
  gateGroup.add(glow);

  scene.add(gateGroup);

  return gateGroup;
}

export const WAYPOINTS = [];
for (let i = 0; i < TRACK_LENGTH; i += 25) {
  WAYPOINTS.push({ x: 0, z: i - TRACK_LENGTH / 2 });
}
WAYPOINTS.push({ x: TRACK_WIDTH / 2, z: TRACK_LENGTH / 2 });
for (let i = 0; i <= 20; i++) {
  const angle = (Math.PI * i) / 20;
  WAYPOINTS.push({
    x: Math.cos(angle) * (TRACK_WIDTH / 2 + 2),
    z: TRACK_LENGTH / 2 + Math.sin(angle) * (TRACK_WIDTH / 2 + 2)
  });
}
WAYPOINTS.push({ x: 0, z: TRACK_LENGTH / 2 });
for (let i = 0; i < TRACK_LENGTH; i += 25) {
  WAYPOINTS.push({ x: 0, z: TRACK_LENGTH / 2 - i });
}
WAYPOINTS.push({ x: -TRACK_WIDTH / 2, z: -TRACK_LENGTH / 2 });
for (let i = 0; i <= 20; i++) {
  const angle = (Math.PI * i) / 20;
  WAYPOINTS.push({
    x: Math.cos(angle + Math.PI) * (TRACK_WIDTH / 2 + 2),
    z: -TRACK_LENGTH / 2 + Math.sin(angle + Math.PI) * (TRACK_WIDTH / 2 + 2)
  });
}
WAYPOINTS.push({ x: 0, z: -TRACK_LENGTH / 2 });
