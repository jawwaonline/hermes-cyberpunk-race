import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createTrack, createFinishLine, createCheckpointRings, updateCheckpointRings, flashCheckpoint, WAYPOINTS, TRACK_LENGTH } from './track.js';
import { Car } from './car.js';
import { Controls } from './controls.js';

export class Game {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.playerCar = null;
    this.aiCar = null;
    this.controls = null;
    this.track = null;
    this.finishLine = null;
    this.isRunning = false;
    this.lastTime = 0;
    this.mode = 'ai';
    this.aiProgress = 0;
    this.playerProgress = 0;

    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0A0E27);
    this.scene.fog = new THREE.Fog(0x0A0E27, 80, 400);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 15, -25);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.4, 0.85, 0.0
    );
    this.composer.addPass(bloomPass);
    this.composer.addPass(new FilmPass(0.25, false));
    this.composer.addPass(new OutputPass());

    const ambientLight = new THREE.AmbientLight(0x1a1a3e, 0.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x9D4EDD, 0.4);
    dirLight.position.set(50, 100, 50);
    this.scene.add(dirLight);

    const pointLight1 = new THREE.PointLight(0x00F5FF, 1.5, 150);
    pointLight1.position.set(-20, 25, 0);
    this.scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xFF006E, 1.5, 150);
    pointLight2.position.set(20, 25, 0);
    this.scene.add(pointLight2);

    this.createSynthwaveSun();
    this.createDirectionalArrow();

    this.track = createTrack(this.scene);
    this.finishLine = createFinishLine(this.scene);
    this.checkpointRings = createCheckpointRings(this.scene);

    this.controls = new Controls();

    window.addEventListener('resize', () => this.onResize());
  }

  createSynthwaveSun() {
    const sunGroup = new THREE.Group();
    sunGroup.name = 'synthwaveSun';

    const sunGeo = new THREE.SphereGeometry(120, 32, 32);
    const sunMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        void main() {
          vec2 uv = vUv;
          float y = uv.y;
          vec3 topColor = vec3(0.07, 0.05, 0.24);
          vec3 midColor = vec3(1.0, 0.0, 0.43);
          vec3 botColor = vec3(1.0, 0.9, 0.0);
          vec3 color;
          if (y > 0.5) {
            color = mix(midColor, topColor, (y - 0.5) * 2.0);
          } else {
            color = mix(botColor, midColor, y * 2.0);
          }
          float stripes = step(0.5, y) * step(mod(y * 30.0 - uTime * 0.3, 1.0), 0.5);
          color = mix(color, vec3(0.04, 0.03, 0.15), stripes * 0.7);
          float glow = 1.0 - smoothstep(0.0, 0.5, y);
          color += glow * 0.3;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide
    });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(0, 0, -400);
    sunGroup.add(sun);
    this.scene.add(sunGroup);
    this.sunMaterial = sunMat;
  }

  // Sprint 6 Fix D: a giant 3D arrow that hovers above the player car
  // and points at the next checkpoint.  When the player is going the
  // wrong way (wrongWayStreak > 30) the arrow is red and pulses.
  createDirectionalArrow() {
    const group = new THREE.Group();
    group.name = 'directionalArrow';

    // Cone + cylinder, like a fat arrow.  Faces -Z by default (so we
    // rotate it via lookAt() to point at the next checkpoint).
    const shaftGeo = new THREE.CylinderGeometry(0.6, 0.6, 6, 8);
    const headGeo  = new THREE.ConeGeometry(2.0, 3, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00F5FF,
      transparent: true,
      opacity: 0.9,
      toneMapped: false
    });
    const shaft = new THREE.Mesh(shaftGeo, mat);
    shaft.position.y = 3;
    shaft.rotation.x = Math.PI / 2; // align along Z
    const head = new THREE.Mesh(headGeo, mat);
    head.position.z = 4.5; // tip of the arrow
    head.rotation.x = Math.PI / 2;
    group.add(shaft, head);

    // Carry the colour and visibility on the group so we can toggle.
    group.userData.mat = mat;
    group.userData.lastWrongWay = false;

    this.scene.add(group);
    this.directionalArrow = group;
  }

  updateDirectionalArrow(playerCar) {
    if (!this.directionalArrow || !playerCar) return;
    const arrow = this.directionalArrow;
    const checkpoints = this.checkpointRings.userData.checkpoints;
    const nextCp = checkpoints[playerCar.nextCheckpoint];
    // Place the arrow above the player car and aim at next checkpoint.
    const px = playerCar.mesh.position.x;
    const pz = playerCar.mesh.position.z;
    arrow.position.set(px, 8, pz);
    const dx = nextCp.x - px;
    const dz = nextCp.z - pz;
    // lookAt-style rotation: arrow's -Z axis should point at the target.
    arrow.rotation.y = Math.atan2(dx, dz);
    // Hide when close to checkpoint (< 8 units) — driver knows where to go.
    const dist = Math.hypot(dx, dz);
    arrow.visible = dist > 8;

    // Pulse red when going the wrong way.
    const wrongWay = playerCar.wrongWayStreak > 30;
    if (wrongWay !== arrow.userData.lastWrongWay) {
      arrow.userData.mat.color.setHex(wrongWay ? 0xFF006E : 0x00F5FF);
      arrow.userData.lastWrongWay = wrongWay;
    }
    const pulse = 1 + 0.15 * Math.sin(performance.now() * 0.01);
    arrow.scale.set(pulse, pulse, pulse);
  }

  startMode(mode) {
    this.mode = mode;
    this.isRunning = true;

    if (this.playerCar) this.scene.remove(this.playerCar.mesh);
    if (this.aiCar) this.scene.remove(this.aiCar.mesh);

    this.playerCar = new Car(this.scene, true, 0x00ffff);
    this.playerCar.totalLaps = 3;

    if (mode === 'ai') {
      this.aiCar = new Car(this.scene, false, 0xff00ff);
      this.aiCar.totalLaps = 3;
      this.aiCar.aiWaypointIndex = 0;
    }

    this.lastTime = performance.now();
    this.animate();
  }

  animate() {
    if (!this.isRunning) return;

    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const input = this.controls.getInput();
    // Sprint 6 Fix B: snapshot nextCheckpoint before update() so we can
    // detect a "just crossed" event and flash the corresponding ring.
    const prevPlayerCp = this.playerCar.nextCheckpoint;
    this.playerCar.update(input, dt);
    this.playerCar.checkLap();
    if (this.playerCar.nextCheckpoint !== prevPlayerCp) {
      flashCheckpoint(this.checkpointRings, prevPlayerCp, now);
    }

    this.updateCamera();

    if (this.aiCar) {
      this.updateAI(dt);
      // Sprint 6 Fix A: drive the AI car's full per-frame pipeline so
      // it benefits from off-track slowdown, trail, and checkpoint
      // logic.  Previously the AI was moved manually here and the
      // new update() / checkLap() pipeline was never invoked.
      // The AI's throttle intent is supplied by updateAI() via velocity;
      // we pass a synthetic forward=input into update() so the standard
      // physics pipeline moves the mesh.
      if (!this.aiCar.finished) {
        const prevAiCp = this.aiCar.nextCheckpoint;
        this.aiCar.update({ forward: true, backward: false, left: false, right: false }, dt);
        this.aiCar.checkLap();
        if (this.aiCar.nextCheckpoint !== prevAiCp) {
          flashCheckpoint(this.checkpointRings, prevAiCp, now);
        }
      }

      this.playerProgress = this.playerCar.getProgress();
      this.aiProgress = this.aiCar.getProgress();
    }

    // === Sprint 6 Fix A: pairwise AABB collision sweep ===
    // The collision logic lives in src/car.js but the game loop never
    // called it.  Walk every pair of live cars and resolve any overlap.
    this.runCollisionTick();

    // Sprint 6 Fix B: per-frame checkpoint ring update (color/scale).
    updateCheckpointRings(this.checkpointRings, now);

    // Sprint 6 Fix D: 3D arrow above player car pointing to next checkpoint.
    this.updateDirectionalArrow(this.playerCar);

    if (this.sunMaterial) {
      this.sunMaterial.uniforms.uTime.value = now * 0.001;
    }

    this.updateHUD();
    this.composer.render();

    if (this.playerCar.finished) {
      this.isRunning = false;
      this.onRaceEnd(true);
    } else if (this.aiCar && this.aiCar.finished) {
      this.isRunning = false;
      this.onRaceEnd(false);
    }
  }

  // Sprint 6 Fix A: pairwise collision sweep across all live cars.
  // Extracted from animate() so it can be invoked from tests or other
  // entrypoints without spinning up the full animate() loop.
  runCollisionTick() {
    const cars = [];
    if (this.playerCar && !this.playerCar.finished) cars.push(this.playerCar);
    if (this.aiCar && !this.aiCar.finished) cars.push(this.aiCar);
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        if (cars[i].checkCollision(cars[j])) {
          cars[i].applyCollisionResponse(cars[j]);
        }
      }
    }
  }

  updateAI(dt) {
    if (!this.aiCar || this.aiCar.finished || this.aiCar.playerIsAI) return;

    // Ensure aiWaypointIndex exists on car
    if (this.aiCar.aiWaypointIndex === undefined) {
      this.aiCar.aiWaypointIndex = 0;
    }

    const pos = this.aiCar.mesh.position;
    let nearestDist = Infinity;
    let nearestIdx = this.aiCar.aiWaypointIndex;

    for (let i = 0; i < WAYPOINTS.length; i++) {
      const wp = WAYPOINTS[i];
      const dist = Math.hypot(pos.x - wp.x, pos.z - wp.z);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }
    this.aiCar.aiWaypointIndex = nearestIdx;

    const nextIndex = (this.aiCar.aiWaypointIndex + 1) % WAYPOINTS.length;
    const nextWaypoint = WAYPOINTS[nextIndex];

    const dx = nextWaypoint.x - pos.x;
    const dz = nextWaypoint.z - pos.z;
    const targetAngle = Math.atan2(dx, dz);

    let angleDiff = targetAngle - this.aiCar.rotation;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const s = dt * 60; // scale to 60fps baseline
    this.aiCar.rotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 0.05 * s);
    // Sprint 6 Fix A: only set the desired target speed here; the actual
    // mesh position update is now performed by aiCar.update() in the
    // animate() loop so both cars share the same physics pipeline.
    this.aiCar.velocity = 1.05; // Competitive: player maxSpeed is 1.2, AI should challenge but not dominate
    this.aiCar.mesh.rotation.y = this.aiCar.rotation;
  }

  updateCamera() {
    if (!this.playerCar) return;

    const carPos = this.playerCar.mesh.position;
    const carRot = this.playerCar.rotation;

    const cameraOffset = new THREE.Vector3(
      -Math.sin(carRot) * 20,
      12,
      -Math.cos(carRot) * 20
    );

    const targetPos = new THREE.Vector3(
      carPos.x + cameraOffset.x,
      cameraOffset.y,
      carPos.z + cameraOffset.z
    );

    this.camera.position.lerp(targetPos, 0.1);
    this.camera.lookAt(carPos.x, carPos.y + 2, carPos.z);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  onRaceEnd(playerWon) {
    const endScreen = document.getElementById('end-screen');
    const endTitle = document.getElementById('end-title');

    if (playerWon) {
      endScreen.className = 'win';
      endTitle.textContent = 'WINNER';
    } else {
      endScreen.className = 'lose';
      endTitle.textContent = 'GAME OVER';
    }
    endScreen.style.display = 'flex';
  }

  getPlayerState() {
    if (!this.playerCar) return null;
    return {
      x: this.playerCar.mesh.position.x,
      y: this.playerCar.mesh.position.y,
      z: this.playerCar.mesh.position.z,
      rotation: this.playerCar.rotation,
      lap: this.playerCar.lap,
      finished: this.playerCar.finished
    };
  }

  getAiState() {
    if (!this.aiCar) return null;
    return {
      x: this.aiCar.mesh.position.x,
      y: this.aiCar.mesh.position.y,
      z: this.aiCar.mesh.position.z,
      rotation: this.aiCar.rotation,
      lap: this.aiCar.lap,
      finished: this.aiCar.finished
    };
  }

  setOpponentPosition(x, y, z, rotation, waypointIndex) {
    if (!this.aiCar) {
      this.aiCar = new Car(this.scene, false, 0xff00ff);
      this.aiCar.totalLaps = 3;
      this.aiCar.aiWaypointIndex = 0;
    }
    this.aiCar.setPosition(x, y, z, rotation);
    this.aiCar.playerIsAI = true;
    if (waypointIndex !== undefined) {
      this.aiCar.aiWaypointIndex = waypointIndex;
    }
  }

  updateHUD() {
    if (!this.playerCar) return;

    const lap = Math.min(this.playerCar.lap + 1, this.playerCar.totalLaps);
    document.getElementById('lap-current').textContent = lap;
    document.getElementById('lap-total').textContent = this.playerCar.totalLaps;
    document.getElementById('speed-display').textContent = Math.round(this.playerCar.getSpeed());

    if (this.aiCar) {
      const playerProg = this.playerCar.getRacePosition();
      const aiProg = this.aiCar.getRacePosition();
      const pos = playerProg >= aiProg ? 1 : 2;
      document.getElementById('pos-display').textContent = pos.toString().padStart(2, '0');
    }

    // === Sprint 6 UX: lap progress bar (Mario Kart 8 style) ===
    // Map car.t (progress 0..1) + lap to a percentage 0..100% across
    // the bar.  Each lap fills the bar once.
    const totalLaps = this.playerCar.totalLaps || 3;
    const pProg = (this.playerCar.lap - 1) + (this.playerCar.t || 0);
    const aProg = this.aiCar ? (this.aiCar.lap - 1) + (this.aiCar.t || 0) : 0;
    const total = Math.max(pProg, aProg, 1);
    const pPct = Math.min(100, (pProg / totalLaps) * 100);
    const aPct = Math.min(100, (aProg / totalLaps) * 100);
    const fill = document.getElementById('progress-fill');
    const pDot = document.getElementById('progress-player');
    const aDot = document.getElementById('progress-ai');
    if (fill) fill.style.width = Math.max(pPct, aPct) + '%';
    if (pDot) pDot.style.left = pPct + '%';
    if (aDot) aDot.style.left = aPct + '%';
    // Highlight the current next-checkpoint marker in pink
    const nextCp = (this.playerCar.nextCheckpoint || 0) + 1;
    const nextLabel = document.getElementById('next-cp-label');
    if (nextLabel) nextLabel.textContent = `Next: CP${nextCp}`;

    const wrongWayEl = document.getElementById('hud-wrongway');
    if (wrongWayEl) {
      wrongWayEl.classList.toggle('visible', this.playerCar.wrongWayStreak > 30);
    }
  }

  restart() {
    if (this.playerCar) this.playerCar.reset();
    if (this.aiCar) {
      this.aiCar.reset();
      this.aiCar.aiWaypointIndex = 0;
    }
    this.lastTime = performance.now();
    this.isRunning = true;
    this.animate();
  }

  destroy() {
    this.isRunning = false;
    this.controls.destroy();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
