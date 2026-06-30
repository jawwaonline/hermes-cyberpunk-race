import * as THREE from 'three';
import { createTrack, createFinishLine, WAYPOINTS, TRACK_LENGTH } from './track.js';
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
    this.scene.background = new THREE.Color(0x0a0a0f);
    this.scene.fog = new THREE.Fog(0x0a0a0f, 50, 300);

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
    this.container.appendChild(this.renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x111122, 0.5);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight.position.set(50, 100, 50);
    this.scene.add(dirLight);

    const pointLight1 = new THREE.PointLight(0x00ffff, 1, 100);
    pointLight1.position.set(-20, 20, 0);
    this.scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xff00ff, 1, 100);
    pointLight2.position.set(20, 20, 0);
    this.scene.add(pointLight2);

    this.track = createTrack(this.scene);
    this.finishLine = createFinishLine(this.scene);

    this.controls = new Controls();

    window.addEventListener('resize', () => this.onResize());
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
    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // cap at 100ms to avoid spiral of death
    this.lastTime = now;

    const input = this.controls.getInput();
    this.playerCar.update(input, dt);
    this.playerCar.checkLap(TRACK_LENGTH);

    this.updateCamera();

    if (this.aiCar) {
      this.updateAI(dt);
      this.aiCar.checkLap(TRACK_LENGTH);

      this.playerProgress = this.playerCar.getProgress(TRACK_LENGTH);
      this.aiProgress = this.aiCar.getProgress(TRACK_LENGTH);
    }

    this.renderer.render(this.scene, this.camera);

    if (this.playerCar.finished) {
      this.isRunning = false;
      this.onRaceEnd(true);
    } else if (this.aiCar && this.aiCar.finished) {
      this.isRunning = false;
      this.onRaceEnd(false);
    }
  }

  updateAI(dt) {
    if (!this.aiCar || this.aiCar.finished) return;

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
    this.aiCar.velocity = 0.8;

    this.aiCar.mesh.position.x += Math.sin(this.aiCar.rotation) * this.aiCar.velocity * s;
    this.aiCar.mesh.position.z += Math.cos(this.aiCar.rotation) * this.aiCar.velocity * s;
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

  setOpponentPosition(x, y, z, rotation) {
    if (!this.aiCar) {
      this.aiCar = new Car(this.scene, false, 0xff00ff);
      this.aiCar.totalLaps = 3;
      this.aiCar.aiWaypointIndex = 0;
    }
    this.aiCar.setPosition(x, y, z, rotation);
  }

  updateHUD() {
    if (!this.playerCar) return;

    const lap = this.playerCar.lap;
    document.getElementById('lap-current').textContent =
      lap > this.playerCar.totalLaps ? 'FINISH!' : `${lap}/${this.playerCar.totalLaps}`;
    document.getElementById('speed-display').textContent = Math.round(this.playerCar.getSpeed());

    if (this.aiCar) {
      const playerProg = this.playerProgress;
      const aiProg = this.aiProgress;
      document.getElementById('pos-display').textContent = playerProg >= aiProg ? '1st' : '2nd';
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
