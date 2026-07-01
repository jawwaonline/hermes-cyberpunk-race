import * as THREE from 'three';
import { TRACK_WIDTH, TRACK_LENGTH, WAYPOINTS } from './shared-track.js';

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
    this.lap = 1;
    this.finished = false;
    this.totalLaps = 3;
    this.lastCheckpoint = 0;
    // Start at -201 so first forward crossing of -200 (from -201 to -199) IS detected
    // Using -201 not -200 because car starts AT -200 — prevZ==-200 && z==-200 would not trigger
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
  // Check if car crossed the finish line (at z = -200)
  // For oval track, lap completion when car crosses from positive z (north) to z <= -200 (south)
  // This is a FORWARD crossing only — prevents backwards exploit
  checkLap() {
    const z = this.mesh.position.z;
    const prevZ = this.lastZ;

    // Detect forward crossing: prevZ > -200 (above finish line) AND z <= -200 (at/below finish line)
    // AND car must have been moving forward (positive z velocity before crossing)
    if (prevZ > -200 && z <= -200 && !this.finished) {
      this.lap++;
      if (this.lap > this.totalLaps) {
        this.finished = true;
      }
    }

    // Track direction: positive velocity = moving forward (increasing z)
    // wasMovingForward is true when car was moving in the positive z direction
    const velocityZ = Math.cos(this.rotation) * this.velocity;
    this.wasMovingForward = velocityZ > 0;
    this.lastZ = z;
  }

  // Get progress around track (0 to 1 representing one lap)
  getProgress() {
    const angle = this.getTrackAngle();
    return angle / (Math.PI * 2);
  }

  // Get racing position comparison
  getRacePosition() {
    // Compare laps first, then track progress
    const progress = (this.lap - 1) + this.getProgress();
    return progress;
  }

  reset() {
    this.velocity = 0;
    this.rotation = 0;
    this.lap = 1;
    this.finished = false;
    this.lastCheckpoint = 0;
    this.lastZ = -201; // Same as constructor — start position NOT on finish line
    this.wasMovingForward = false;
    this.mesh.position.set(this.startX, 0, -200);
    this.mesh.rotation.y = 0;
  }
}
