import * as THREE from 'three';
import { TRACK_WIDTH, TRACK_LENGTH, WAYPOINTS } from './shared-track.js';

const CHECKPOINTS = [
  { id: 0, x: 0, z: -200, r: 15 },
  { id: 1, x: 30, z: 0, r: 15 },
  { id: 2, x: 0, z: 200, r: 15 },
  { id: 3, x: -30, z: 0, r: 15 }
];

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
      color: isPlayer ? 0x1a1a2e : 0x2e1a2e,
      emissive: color,
      emissiveIntensity: 0.3,
      roughness: 0.3,
      metalness: 0.8
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.8,
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

    const lightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1
    });
    const leftLight = new THREE.Mesh(lightGeo, lightMat);
    leftLight.position.set(-0.6, 0.5, 2.1);
    this.mesh.add(leftLight);

    const rightLight = new THREE.Mesh(lightGeo, lightMat);
    rightLight.position.set(0.6, 0.5, 2.1);
    this.mesh.add(rightLight);

    // Starting position: bottom of oval (waypoint[0] is at z=-200, x=0)
    // Place player on left side, AI on right side of track
    const startX = isPlayer ? -8 : 8;
    this.mesh.position.set(startX, 0, -200);
    this.startX = startX;

    scene.add(this.mesh);
  }

  update(input, dt = 1 / 60) {
    const s = dt * 60;

    if (this.finished) return;

    if (input.forward) {
      this.velocity += this.acceleration * s;
    }
    if (input.backward) {
      this.velocity -= this.acceleration * 0.5 * s;
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
      if (this.nextCheckpoint === 0 && !this.finished) {
        this.lap++;
        if (this.lap >= this.totalLaps) {
          this.finished = true;
        }
      }
      this.nextCheckpoint = (this.nextCheckpoint + 1) % CHECKPOINTS.length;
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
  }
}
