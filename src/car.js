import * as THREE from 'three';

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

    this.mesh.position.set(isPlayer ? -5 : 5, 0, -140);

    scene.add(this.mesh);
  }

  update(input) {
    if (this.finished) return;

    if (input.forward) {
      this.velocity += this.acceleration;
    }
    if (input.backward) {
      this.velocity -= this.acceleration * 0.5;
    }

    this.velocity *= this.friction;
    this.velocity = Math.max(-this.maxSpeed * 0.3, Math.min(this.maxSpeed, this.velocity));

    if (Math.abs(this.velocity) > 0.01) {
      if (input.left) {
        this.rotation += this.turnSpeed * (this.velocity > 0 ? 1 : -1);
      }
      if (input.right) {
        this.rotation -= this.turnSpeed * (this.velocity > 0 ? 1 : -1);
      }
    }

    this.mesh.position.x += Math.sin(this.rotation) * this.velocity;
    this.mesh.position.z += Math.cos(this.rotation) * this.velocity;
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

  checkLap(trackLength) {
    const z = this.mesh.position.z;
    const prevZ = this.mesh.position.z - Math.cos(this.rotation) * this.velocity;

    if (prevZ < 0 && z >= 0 && Math.abs(this.mesh.position.x) < 12) {
      if (this.lastCheckpoint > trackLength / 2) {
        this.lap++;
        this.lastCheckpoint = 0;
        if (this.lap > this.totalLaps) {
          this.finished = true;
        }
      }
    }

    this.lastCheckpoint = Math.max(this.lastCheckpoint, z);
  }

  getProgress(trackLength) {
    return (this.lap - 1) * trackLength + Math.max(0, this.lastCheckpoint);
  }

  reset() {
    this.velocity = 0;
    this.rotation = 0;
    this.lap = 1;
    this.finished = false;
    this.lastCheckpoint = 0;
    this.mesh.position.set(this.isPlayer ? -5 : 5, 0, -140);
    this.mesh.rotation.y = 0;
  }
}
