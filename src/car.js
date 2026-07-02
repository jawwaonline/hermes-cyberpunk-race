import * as THREE from 'three';
import { TRACK_WIDTH, WAYPOINTS, BOOST_PADS } from './shared-track.js';
import { getClosestWaypointIndex, isOnTrack } from './track.js';

const CHECKPOINTS = [];
for (let i = 0; i < 4; i++) {
  const idx = Math.floor((i / 4) * WAYPOINTS.length);
  const wp = WAYPOINTS[idx];
  CHECKPOINTS.push({ id: i, x: wp.x, z: wp.z, y: wp.y, r: 15 });
}

function wrapDelta(d) {
  if (d > 0.5) return d - 1;
  if (d < -0.5) return d + 1;
  return d;
}

function nearestValidSplinePoint(x, z) {
  const idx = getClosestWaypointIndex(x, z);
  const wp = WAYPOINTS[idx];
  return { x: wp.x, y: wp.y, z: wp.z };
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

const fresnelVertShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fresnelFragShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform vec3 uEmissive;
  uniform float uTime;
  uniform float uSpeed;
  void main() {
    float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 3.0);
    vec3 baseColor = uColor;
    float pulse = sin(uTime * 3.0 + uSpeed * 10.0) * 0.5 + 0.5;
    float wirePulse = 0.5 + 0.5 * pulse;
    vec3 rimColor = uEmissive * fresnel * wirePulse * 2.0;
    vec3 finalColor = baseColor + rimColor;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

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
    this.boostPadActive = false;
    this.boostPadTimer = 0;
    this.thrusterParticles = [];
    this.currentRoll = 0;
    this.currentPitch = 0;

    const carColor = new THREE.Color(color);

    this.mesh = new THREE.Group();

    const fresnelMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x1A1A2E) },
        uEmissive: { value: carColor },
        uTime: { value: 0 },
        uSpeed: { value: 0 }
      },
      vertexShader: fresnelVertShader,
      fragmentShader: fresnelFragShader
    });
    this.fresnelMat = fresnelMat;

    const bodyGeo = new THREE.BufferGeometry();
    const bodyVerts = [];
    bodyVerts.push(-1, 0, -2,  1, 0, -2,  1, 0.6, -2);
    bodyVerts.push(-1, 0, -2,  1, 0.6, -2,  -1, 0.6, -2);
    bodyVerts.push(-1, 0, 2,  1, 0, 2,  1, 0.6, 2);
    bodyVerts.push(-1, 0, 2,  1, 0.6, 2,  -1, 0.6, 2);
    bodyVerts.push(-1, 0, -2,  -1, 0, 2,  -1, 0.6, 2);
    bodyVerts.push(-1, 0, -2,  -1, 0.6, 2,  -1, 0.6, -2);
    bodyVerts.push(1, 0, -2,  1, 0, 2,  1, 0.6, 2);
    bodyVerts.push(1, 0, -2,  1, 0.6, 2,  1, 0.6, -2);
    bodyVerts.push(-1, 0.6, -2,  1, 0.6, -2,  1, 0.6, 2);
    bodyVerts.push(-1, 0.6, -2,  1, 0.6, 2,  -1, 0.6, 2);
    bodyVerts.push(-1, 0, -2,  1, 0, -2,  1, 0, 2);
    bodyVerts.push(-1, 0, -2,  1, 0, 2,  -1, 0, 2);
    bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(bodyVerts, 3));
    bodyGeo.computeVertexNormals();
    const body = new THREE.Mesh(bodyGeo, fresnelMat);
    body.position.y = 0.4;
    this.mesh.add(body);

    const accentMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
      toneMapped: false
    });

    const accentGeo = new THREE.BoxGeometry(2.1, 0.05, 4.1);
    const accent = new THREE.Mesh(accentGeo, accentMat);
    accent.position.y = 0.2;
    this.mesh.add(accent);

    const wireGeo = new THREE.EdgesGeometry(bodyGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.6
    });
    const wireframe = new THREE.LineSegments(wireGeo, wireMat);
    wireframe.position.y = 0.4;
    this.mesh.add(wireframe);
    this.wireframe = wireframe;

    const cabinGeo = new THREE.BufferGeometry();
    const cabinVerts = [];
    cabinVerts.push(-0.7, 0, -0.8,  0.7, 0, -0.8,  0.7, 0.5, -0.8);
    cabinVerts.push(-0.7, 0, -0.8,  0.7, 0.5, -0.8,  -0.7, 0.5, -0.8);
    cabinVerts.push(-0.7, 0, 0.8,  0.7, 0, 0.8,  0.7, 0.5, 0.8);
    cabinVerts.push(-0.7, 0, 0.8,  0.7, 0.5, 0.8,  -0.7, 0.5, 0.8);
    cabinVerts.push(-0.7, 0, -0.8,  -0.7, 0, 0.8,  -0.7, 0.5, 0.8);
    cabinVerts.push(-0.7, 0, -0.8,  -0.7, 0.5, 0.8,  -0.7, 0.5, -0.8);
    cabinVerts.push(0.7, 0, -0.8,  0.7, 0, 0.8,  0.7, 0.5, 0.8);
    cabinVerts.push(0.7, 0, -0.8,  0.7, 0.5, 0.8,  0.7, 0.5, -0.8);
    cabinGeo.setAttribute('position', new THREE.Float32BufferAttribute(cabinVerts, 3));
    cabinGeo.computeVertexNormals();
    const cabin = new THREE.Mesh(cabinGeo, fresnelMat.clone());
    cabin.position.set(0, 0.85, -0.2);
    this.mesh.add(cabin);

    const frontGeo = new THREE.BoxGeometry(1.8, 0.2, 0.3);
    const front = new THREE.Mesh(frontGeo, accentMat);
    front.position.set(0, 0.4, 1.9);
    this.mesh.add(front);

    const lightGeo = new THREE.BoxGeometry(0.3, 0.15, 0.1);
    const lightMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false
    });
    const leftLight = new THREE.Mesh(lightGeo, lightMat);
    leftLight.position.set(-0.6, 0.4, 2.05);
    this.mesh.add(leftLight);

    const rightLight = new THREE.Mesh(lightGeo, lightMat);
    rightLight.position.set(0.6, 0.4, 2.05);
    this.mesh.add(rightLight);

    const thrusterGeo = new THREE.CylinderGeometry(0.15, 0.25, 0.6, 8);
    const thrusterMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      toneMapped: false
    });
    const leftThruster = new THREE.Mesh(thrusterGeo, thrusterMat);
    leftThruster.position.set(-0.6, 0.4, -2.1);
    leftThruster.rotation.x = Math.PI / 2;
    this.mesh.add(leftThruster);
    this.leftThruster = leftThruster;

    const rightThruster = new THREE.Mesh(thrusterGeo, thrusterMat.clone());
    rightThruster.position.set(0.6, 0.4, -2.1);
    rightThruster.rotation.x = Math.PI / 2;
    this.mesh.add(rightThruster);
    this.rightThruster = rightThruster;

    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.8,
      metalness: 0.3
    });
    const wheelPositions = [
      { x: -1.1, y: 0.1, z: 1.2 },
      { x: 1.1, y: 0.1, z: 1.2 },
      { x: -1.1, y: 0.1, z: -1.2 },
      { x: 1.1, y: 0.1, z: -1.2 }
    ];
    this.wheels = [];
    for (const pos of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(pos.x, pos.y, pos.z);
      wheel.rotation.z = Math.PI / 2;
      this.mesh.add(wheel);
      this.wheels.push(wheel);
    }

    this.trailPositions = [];
    this.trailMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.7,
      toneMapped: false
    });

    const startIdx = getClosestWaypointIndex(0, -180);
    const startWp = WAYPOINTS[startIdx];
    const nextWp = WAYPOINTS[(startIdx + 1) % WAYPOINTS.length];
    const startAngle = Math.atan2(nextWp.x - startWp.x, nextWp.z - startWp.z);

    const startX = isPlayer ? startWp.x - 3 : startWp.x + 3;
    this.mesh.position.set(startX, startWp.y, startWp.z);
    this.startX = startX;
    this.startAngle = startAngle;
    this.rotation = startAngle;

    scene.add(this.mesh);
  }

  checkBoostPads() {
    const pos = this.mesh.position;
    for (const pad of BOOST_PADS) {
      const dx = pos.x - pad.x;
      const dz = pos.z - pad.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 5 && pos.y >= pad.y - 1 && pos.y <= pad.y + 2) {
        this.boostPadTimer = 60;
        this.boostPadActive = true;
        this.speedMultiplier = pad.strength;
      }
    }
  }

  update(input, dt = 1 / 60) {
    const s = dt * 60;

    if (this.finished) return;

    if (this.boostPadTimer > 0) {
      this.boostPadTimer--;
      if (this.boostPadTimer === 0) {
        this.boostPadActive = false;
        this.speedMultiplier = 1.0;
      }
    }

    this.checkBoostPads();

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

    this.velocity = Math.max(-this.maxSpeed * 0.3, Math.min(this.maxSpeed * this.speedMultiplier, this.velocity));

    const targetRoll = 0;
    const targetPitch = 0;

    if (Math.abs(this.velocity) > 0.01) {
      const dir = this.velocity > 0 ? 1 : -1;
      if (input.left) {
        this.rotation += this.turnSpeed * s * dir;
        this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, -0.1 * dir, 0.1);
      } else if (input.right) {
        this.rotation -= this.turnSpeed * s * dir;
        this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, 0.1 * dir, 0.1);
      } else {
        this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, 0, 0.1);
      }
      if (input.forward) {
        this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, -0.05, 0.1);
      } else if (input.backward) {
        this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, 0.05, 0.1);
      } else {
        this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, 0, 0.1);
      }
    } else {
      this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, 0, 0.1);
      this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, 0, 0.1);
    }

    this.mesh.position.x += Math.sin(this.rotation) * this.velocity * s;
    this.mesh.position.z += Math.cos(this.rotation) * this.velocity * s;
    this.mesh.rotation.y = this.rotation;
    this.mesh.rotation.z = this.currentRoll;
    this.mesh.rotation.x = this.currentPitch;

    // Sprint 10 fix: keep the car on the track surface in 3D (banked/elevated).
    // Without this, the car stays at the start Y forever and "floats" through
    // any elevation changes in the Catmull-Rom spline.
    const wpIdx = getClosestWaypointIndex(this.mesh.position.x, this.mesh.position.z);
    const wp = WAYPOINTS[wpIdx];
    if (wp) {
      // Snap Y with a small lerp so it doesn't pop on the first frame
      this.mesh.position.y = THREE.MathUtils.lerp(this.mesh.position.y, wp.y, 0.3);
    }

    const wheelRot = this.velocity * s * 2;
    for (const wheel of this.wheels) {
      wheel.rotation.x += wheelRot;
    }

    const thrusterIntensity = input.forward ? 1.0 : 0.3;
    const thrusterScale = 0.8 + thrusterIntensity * 0.4;
    this.leftThruster.scale.set(1, thrusterScale, 1);
    this.rightThruster.scale.set(1, thrusterScale, 1);
    this.leftThruster.material.opacity = 0.5 + thrusterIntensity * 0.5;
    this.rightThruster.material.opacity = 0.5 + thrusterIntensity * 0.5;

    if (this.fresnelMat) {
      this.fresnelMat.uniforms.uTime.value = performance.now() * 0.001;
      this.fresnelMat.uniforms.uSpeed.value = speed / 300;
    }

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

      const safe = nearestValidSplinePoint(x, z);
      const dx = safe.x - x;
      const dz = safe.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.01) {
        const step = Math.min(0.6, dist * 0.15);
        this.mesh.position.x += (dx / dist) * step;
        this.mesh.position.z += (dz / dist) * step;
        this.mesh.position.y = THREE.MathUtils.lerp(this.mesh.position.y, safe.y, 0.1);
      }

      if (Math.abs(this.velocity) * 300 < 1 && this.offTrackStreak > 90) {
        this.mesh.position.x = safe.x;
        this.mesh.position.z = safe.z;
        this.offTrackStreak = 0;
      }
    } else {
      if (this.speedMultiplier < 1.0 && !this.boostPadActive) {
        this.speedMultiplier = 1.0;
      }
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

  getWaypointIndex() {
    return getClosestWaypointIndex(this.mesh.position.x, this.mesh.position.z);
  }

  getTrackAngle() {
    return this.getWaypointIndex() / WAYPOINTS.length * Math.PI * 2;
  }

  updateCheckpointAndProgress() {
    const x = this.mesh.position.x;
    const z = this.mesh.position.z;
    const wpIdx = this.getWaypointIndex();
    const wp = WAYPOINTS[wpIdx];

    const cp = CHECKPOINTS[this.nextCheckpoint];
    const dx = x - cp.x;
    const dz = z - cp.z;
    if (dx * dx + dz * dz < cp.r * cp.r) {
      const tangent = (idx) => {
        const next = (idx + 1) % WAYPOINTS.length;
        return Math.atan2(
          WAYPOINTS[next].x - WAYPOINTS[idx].x,
          WAYPOINTS[next].z - WAYPOINTS[idx].z
        );
      };
      const tangentAngle = tangent(wpIdx);
      const vx = Math.sin(this.rotation);
      const vz = Math.cos(this.rotation);
      const tx = Math.sin(tangentAngle);
      const tz = Math.cos(tangentAngle);
      const dot = vx * tx + vz * tz;
      if (dot > 0) {
        if (this.nextCheckpoint === 0 && !this.finished) {
          this.lap++;
          if (this.lap >= this.totalLaps) {
            this.finished = true;
          }
        }
        this.nextCheckpoint = (this.nextCheckpoint + 1) % CHECKPOINTS.length;
      }
    }

    this.t = wpIdx / WAYPOINTS.length;
    const dt_progress = wrapDelta(this.t - this.lastT);
    if (dt_progress < -0.05) {
      this.wrongWayStreak++;
    } else {
      this.wrongWayStreak = Math.max(0, this.wrongWayStreak - 1);
    }
    this.lastT = this.t;
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
    return this.lap + this.t;
  }

  getRacePosition() {
    return this.lap + this.t;
  }

  reset() {
    this.velocity = 0;
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
    this.boostPadActive = false;
    this.boostPadTimer = 0;
    this.currentRoll = 0;
    this.currentPitch = 0;

    const startIdx = getClosestWaypointIndex(0, -180);
    const startWp = WAYPOINTS[startIdx];
    this.mesh.position.set(this.startX, startWp.y, startWp.z);
    this.rotation = this.startAngle;
    this.mesh.rotation.set(0, this.startAngle, 0);
    this.trailPositions = [];
    if (this.trailMesh) {
      this.mesh.remove(this.trailMesh);
      this.trailMesh.geometry.dispose();
      this.trailMesh = null;
    }
  }
}
