import * as THREE from 'three';
import { TRACK_WIDTH, TRACK_LENGTH, WAYPOINTS } from './shared-track.js';

const CHECKPOINTS = [
  { id: 0, x: 0, z: -200, r: 15 },
  { id: 1, x: 30, z: 0, r: 15 },
  { id: 2, x: 0, z: 200, r: 15 },
  { id: 3, x: -30, z: 0, r: 15 }
];

const A = 30;
const B = 200;

function wrapDelta(d) {
  if (d > 0.5) return d - 1;
  if (d < -0.5) return d + 1;
  return d;
}

function projectOntoTrack(x, z) {
  const angle = Math.atan2(z, x);
  let t = (angle + Math.PI / 2) / (Math.PI * 2);
  if (t < 0) t += 1;
  return t;
}

const trackPolygon = (function() {
  const inner = [];
  const outer = [];
  const N = 64;
  const halfW = TRACK_WIDTH / 2;

  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    const cx = A * Math.cos(angle);
    const cz = B * Math.sin(angle);

    const nx = cx / (A * A);
    const nz = cz / (B * B);
    const nLen = Math.sqrt(nx * nx + nz * nz);

    inner.push({ x: cx - nx / nLen * halfW, z: cz - nz / nLen * halfW });
    outer.push({ x: cx + nx / nLen * halfW, z: cz + nz / nLen * halfW });
  }

  return { inner, outer };
})();

function pointInPolygon(x, z, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function isOnTrack(x, z) {
  const inOuter = pointInPolygon(x, z, trackPolygon.outer);
  const inInner = pointInPolygon(x, z, trackPolygon.inner);
  return inOuter && !inInner;
}

function nearestValidSplinePoint(x, z) {
  const angle = Math.atan2(z, x);
  const cx = A * Math.cos(angle);
  const cz = B * Math.sin(angle);
  const nx = cx / (A * A);
  const nz = cz / (B * B);
  const nLen = Math.sqrt(nx * nx + nz * nz);
  const halfW = TRACK_WIDTH / 2 - 1;

  return { x: cx + nx / nLen * halfW, y: 0, z: cz + nz / nLen * halfW };
}

function computeCarAABB(x, z, yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const halfWidth = 1.0;
  const halfLength = 2.0;

  const corners = [
    { x: -halfWidth, z: -halfLength },
    { x: halfWidth, z: -halfLength },
    { x: halfWidth, z: halfLength },
    { x: -halfWidth, z: halfLength }
  ];

  const rotated = corners.map(c => ({
    x: x + c.x * cos - c.z * sin,
    z: z + c.x * sin + c.z * cos
  }));

  let minX = rotated[0].x, maxX = rotated[0].x;
  let minZ = rotated[0].z, maxZ = rotated[0].z;

  for (const c of rotated) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minZ = Math.min(minZ, c.z);
    maxZ = Math.max(maxZ, c.z);
  }

  return { min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: 0.6, z: maxZ } };
}

function boxesOverlap(a, b) {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

function checkCarCollision(carA, carB) {
  const aabbA = computeCarAABB(carA.mesh.position.x, carA.mesh.position.z, carA.rotation);
  const aabbB = computeCarAABB(carB.mesh.position.x, carB.mesh.position.z, carB.rotation);
  return boxesOverlap(aabbA, aabbB);
}

function applyCollisionResponse(carA, carB) {
  const dx = carB.mesh.position.x - carA.mesh.position.x;
  const dz = carB.mesh.position.z - carA.mesh.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist === 0) {
    carA.mesh.position.x -= 1;
    carB.mesh.position.x += 1;
    return;
  }

  const overlap = 4.0 - dist;
  if (overlap > 0) {
    const nx = dx / dist;
    const nz = dz / dist;
    const push = overlap / 2 + 0.01;
    carA.mesh.position.x -= nx * push;
    carA.mesh.position.z -= nz * push;
    carB.mesh.position.x += nx * push;
    carB.mesh.position.z += nz * push;
  }
}

export class Car {
  constructor(scene, isPlayer = true, color = 0x00ffff) {
    this.scene = scene;
    this.isPlayer = isPlayer;
    this.velocity = 0;
    this.maxSpeed = 1.2;
    this.acceleration = 0.03;
    this.friction = 0.98;
    this.turnSpeed = 0.04;
    this.rotation = 0;
    this.lap = 0;
    this.finished = false;
    this.totalLaps = 3;
    this.nextCheckpoint = 1;
    this.t = 0;
    this.lastT = 0;
    this.wrongWayStreak = 0;
    this.offTrack = false;
    this.offTrackStreak = 0;
    this.speedMultiplier = 1.0;
    this.strikes = 0;
    this.lastZ = -201;
    this.wasMovingForward = false;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1A1A2E,
      emissive: 0xFF006E,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.85
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      metalness: 0.9
    });

    this.mesh = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(2, 0.6, 4);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    this.mesh.add(body);

    const cabinGeo = new THREE.BoxGeometry(1.6, 0.5, 2);
    const cabin = new THREE.Mesh(cabinGeo, bodyMat);
    cabin.position.set(0, 1, -0.3);
    this.mesh.add(cabin);

    const accentGeo = new THREE.BoxGeometry(2.2, 0.1, 4.2);
    const accent = new THREE.Mesh(accentGeo, accentMat);
    accent.position.y = 0.3;
    this.mesh.add(accent);

    const frontGeo = new THREE.BoxGeometry(1.8, 0.3, 0.3);
    const front = new THREE.Mesh(frontGeo, accentMat);
    front.position.set(0, 0.5, 2);
    this.mesh.add(front);

    const wireframeMat = new THREE.MeshBasicMaterial({
      color: color,
      wireframe: true,
      transparent: true,
      opacity: 0.9
    });
    const bodyWire = new THREE.Mesh(bodyGeo.clone(), wireframeMat);
    bodyWire.position.y = 0.5;
    this.mesh.add(bodyWire);
    const cabinWire = new THREE.Mesh(cabinGeo.clone(), wireframeMat);
    cabinWire.position.set(0, 1, -0.3);
    this.mesh.add(cabinWire);

    const lightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2
    });
    const leftLight = new THREE.Mesh(lightGeo, lightMat);
    leftLight.position.set(-0.6, 0.5, 2.1);
    this.mesh.add(leftLight);

    const rightLight = new THREE.Mesh(lightGeo, lightMat);
    rightLight.position.set(0.6, 0.5, 2.1);
    this.mesh.add(rightLight);

    this.trailPositions = [];
    this.trailMesh = null;
    this.trailMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.85
    });

    const startX = isPlayer ? -8 : 8;
    this.mesh.position.set(startX, 0, -200);
    this.startX = startX;

    scene.add(this.mesh);
  }

  update(input, dt = 1 / 60) {
    const s = dt * 60;

    if (this.finished) return;

    const speed = Math.abs(this.velocity) * 300;

    if (input.forward) {
      this.velocity += this.acceleration * s * this.speedMultiplier;
    }
    if (input.backward) {
      this.velocity -= this.acceleration * 0.5 * s * this.speedMultiplier;
    }

    const frictionSteps = Math.round(s);
    for (let i = 0; i < frictionSteps; i++) {
      this.velocity *= this.friction;
    }

    this.velocity = Math.max(-this.maxSpeed * 0.3, Math.min(this.maxSpeed, this.velocity));

    if (Math.abs(this.velocity) > 0.01) {
      const dir = this.velocity > 0 ? 1 : -1;
      if (input.left) this.rotation += this.turnSpeed * s * dir;
      if (input.right) this.rotation -= this.turnSpeed * s * dir;
    }

    this.mesh.position.x += Math.sin(this.rotation) * this.velocity * s;
    this.mesh.position.z += Math.cos(this.rotation) * this.velocity * s;
    this.mesh.rotation.y = this.rotation;

    this.updateTrail();
    this.updateOffTrack();
    this.updateCheckpointAndProgress();
  }

  updateTrail() {
    const pos = this.mesh.position;
    this.trailPositions.push(new THREE.Vector3(pos.x, pos.y + 0.3, pos.z));
    if (this.trailPositions.length > 30) {
      this.trailPositions.shift();
    }
    if (this.trailMesh) {
      this.mesh.remove(this.trailMesh);
      this.trailMesh.geometry.dispose();
    }
    if (this.trailPositions.length > 2) {
      const curve = new THREE.CatmullRomCurve3(this.trailPositions);
      const tubeGeo = new THREE.TubeGeometry(curve, this.trailPositions.length * 2, 0.08, 6, false);
      this.trailMesh = new THREE.Mesh(tubeGeo, this.trailMat);
      this.mesh.add(this.trailMesh);
    }
  }

  updateOffTrack() {
    const x = this.mesh.position.x;
    const z = this.mesh.position.z;

    this.offTrack = !isOnTrack(x, z);
    if (this.offTrack) {
      this.speedMultiplier = 0.25;
      this.offTrackStreak++;

      // Sprint 6 Fix C: actively push the car back toward the nearest
      // valid track point while it is off-track.  The previous behaviour
      // only snapped the car after it had been STUCK for 90 ticks
      // (~1.5 s), which let a fast car drive far outside the track.
      // The push is small per frame so it still feels like a wall.
      const safe = nearestValidSplinePoint(x, z);
      const dx = safe.x - x;
      const dz = safe.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.01) {
        // Move 15% of the way back each frame; cap at 0.6 units.
        const step = Math.min(0.6, dist * 0.15);
        this.mesh.position.x += (dx / dist) * step;
        this.mesh.position.z += (dz / dist) * step;
      }

      if (Math.abs(this.velocity) * 300 < 1 && this.offTrackStreak > 90) {
        this.mesh.position.x = safe.x;
        this.mesh.position.z = safe.z;
        this.offTrackStreak = 0;
      }
    } else {
      this.speedMultiplier = 1.0;
      if (this.offTrackStreak > 60) {
        this.strikes++;
      }
      this.offTrackStreak = 0;
    }
  }

  getPosition() {
    return {
      x: this.mesh.position.x,
      y: this.mesh.position.y,
      z: this.mesh.position.z,
      rotation: this.rotation
    };
  }

  setPosition(x, y, z, rotation) {
    this.mesh.position.set(x, y, z);
    this.rotation = rotation;
    this.mesh.rotation.y = rotation;
  }

  getSpeed() {
    return Math.abs(this.velocity) * 300;
  }

  // Get current angle on the elliptical track (0 to 2*PI)
  getTrackAngle() {
    const x = this.mesh.position.x;
    const z = this.mesh.position.z;
    const A = 30; // x-axis radius
    const B = 200; // z-axis radius
    
    // Calculate angle from ellipse center
    let angle = Math.atan2(z / B, x / A);
    if (angle < 0) angle += Math.PI * 2;
    return angle;
  }
  updateCheckpointAndProgress() {
    const x = this.mesh.position.x;
    const z = this.mesh.position.z;

    const cp = CHECKPOINTS[this.nextCheckpoint];
    const dx = x - cp.x;
    const dz = z - cp.z;
    if (dx * dx + dz * dz < cp.r * cp.r) {
      // Direction validation: only count as a real pass if the car is
      // moving in the *correct* direction around the oval.
      // The correct direction at any checkpoint is tangent to the
      // ellipse in the +angle direction (counter-clockwise on the x-z
      // plane when looking from +y). Compute the tangent vector at
      // the car's current angle and check the dot product with the
      // car's velocity. If < 0, the car is going the wrong way.
      const carAngle = this.getTrackAngle();
      const tangentX = -Math.sin(carAngle) * A;
      const tangentZ =  Math.cos(carAngle) * B;
      const tlen = Math.hypot(tangentX, tangentZ);
      const tx = tangentX / tlen;
      const tz = tangentZ / tlen;
      const vx = Math.sin(this.rotation) * this.velocity;
      const vz = Math.cos(this.rotation) * this.velocity;
      const dot = vx * tx + vz * tz;
      if (dot > 0) {  // moving in the correct direction (any non-zero positive component)
        if (this.nextCheckpoint === 0 && !this.finished) {
          this.lap++;
          if (this.lap >= this.totalLaps) {
            this.finished = true;
          }
        }
        this.nextCheckpoint = (this.nextCheckpoint + 1) % CHECKPOINTS.length;
      }
      // If dot <= 0, the car is going backwards through the checkpoint;
      // we ignore this and let it pass through visually but don't
      // advance. After 60 frames of wrong-way the existing
      // wrongWayStreak counter handles the HUD warning.
    }

    const u = projectOntoTrack(x, z);
    const dt_progress = wrapDelta(u - this.lastT);
    if (dt_progress < -0.05) {
      this.wrongWayStreak++;
    } else {
      this.wrongWayStreak = Math.max(0, this.wrongWayStreak - 1);
    }
    this.lastT = this.t;
    this.t = u;

    const velocityZ = Math.cos(this.rotation) * this.velocity;
    this.wasMovingForward = velocityZ > 0;
    this.lastZ = z;
  }

  checkLap() {
    this.updateCheckpointAndProgress();
  }

  checkCollision(otherCar) {
    return checkCarCollision(this, otherCar);
  }

  applyCollisionResponse(otherCar) {
    applyCollisionResponse(this, otherCar);
  }

  getProgress() {
    return this.t;
  }

  getRacePosition() {
    return this.lap + this.t;
  }

  reset() {
    this.velocity = 0;
    this.rotation = 0;
    this.lap = 0;
    this.finished = false;
    this.nextCheckpoint = 1;
    this.t = 0;
    this.lastT = 0;
    this.wrongWayStreak = 0;
    this.offTrack = false;
    this.offTrackStreak = 0;
    this.speedMultiplier = 1.0;
    this.strikes = 0;
    this.lastZ = -201;
    this.wasMovingForward = false;
    this.mesh.position.set(this.startX, 0, -200);
    this.mesh.rotation.y = 0;
    this.trailPositions = [];
    if (this.trailMesh) {
      this.mesh.remove(this.trailMesh);
      this.trailMesh.geometry.dispose();
      this.trailMesh = null;
    }
  }
}
