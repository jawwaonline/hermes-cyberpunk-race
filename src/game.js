import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createTrack, createFinishLine, createCheckpointRings, updateCheckpointRings, flashCheckpoint, updateTrackShader, WAYPOINTS } from './track.js';
import { Car } from './car.js';
import { Controls } from './controls.js';

const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uOffset: { value: 0.003 },
    uSpeed: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uOffset;
    uniform float uSpeed;
    varying vec2 vUv;
    void main() {
      float offset = uOffset * uSpeed;
      vec4 cr = texture2D(tDiffuse, vUv + vec2(offset, 0.0));
      vec4 cg = texture2D(tDiffuse, vUv);
      vec4 cb = texture2D(tDiffuse, vUv - vec2(offset, 0.0));
      gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);
    }
  `
};

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.4 },
    uGrain: { value: 0.05 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uGrain;
    varying vec2 vUv;
    float random(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vignette = 1.0 - smoothstep(0.3, 0.9, dist) * uIntensity;
      float grain = random(vUv + fract(vec2(uGrain, uGrain))) * uGrain;
      color.rgb *= vignette;
      color.rgb += grain - uGrain * 0.5;
      gl_FragColor = color;
    }
  `
};

class CyberpunkAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.musicGain = null;
    this.muted = false;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);

      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 80;

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 300;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.15;

      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);
      this.engineOsc.start();

      this.startMusic();
      this.initialized = true;
    } catch (e) {
      console.warn('WebAudio not available:', e);
    }
  }

  startMusic() {
    if (!this.ctx) return;
    const bpm = 120;
    const beatDur = 60 / bpm;

    const notes = [
      { f: 220, t: 0 }, { f: 261.6, t: 0.25 }, { f: 329.6, t: 0.5 }, { f: 261.6, t: 0.75 },
      { f: 196, t: 1 }, { f: 220, t: 1.25 }, { f: 261.6, t: 1.5 }, { f: 196, t: 1.75 },
      { f: 174.6, t: 2 }, { f: 220, t: 2.25 }, { f: 261.6, t: 2.5 }, { f: 329.6, t: 2.75 },
      { f: 293.7, t: 3 }, { f: 261.6, t: 3.25 }, { f: 220, t: 3.5 }, { f: 196, t: 3.75 },
    ];

    const playVoice = (detune) => {
      const gain = this.ctx.createGain();
      gain.gain.value = 0.04;
      gain.connect(this.masterGain);

      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.detune.value = detune;
      osc.frequency.value = 110;

      const seq = (time) => {
        for (const n of notes) {
          osc.frequency.setValueAtTime(n.f, time + n.t * beatDur * 4);
        }
        osc.frequency.setValueAtTime(notes[0].f, time + 4 * beatDur * 4);
      };

      seq(this.ctx.currentTime);
      osc.start();
      return osc;
    };

    playVoice(0);
    playVoice(-15);
    playVoice(15);
  }

  updateEngine(speed) {
    if (!this.engineOsc || !this.ctx) return;
    const normSpeed = speed / 300;
    this.engineOsc.frequency.setTargetAtTime(60 + normSpeed * 200, this.ctx.currentTime, 0.1);
    this.engineFilter.frequency.setTargetAtTime(200 + normSpeed * 800, this.ctx.currentTime, 0.1);
  }

  playCheckpoint() {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playLapComplete() {
    if (!this.ctx || this.muted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + i * 0.08 + 0.15);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(this.ctx.currentTime + i * 0.08);
      osc.stop(this.ctx.currentTime + i * 0.08 + 0.15);
    });
  }

  playCrash() {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.3, this.ctx.currentTime, 0.1);
    }
    return this.muted;
  }
}

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
    this.audio = new CyberpunkAudio();
    this.chromaticPass = null;
    this.vignettePass = null;
    this.rainParticles = null;
    this.cityscape = null;
    this.billboards = [];
    this.speedLines = [];

    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0A0E27);
    this.scene.fog = new THREE.FogExp2(0x0A0E27, 0.003);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
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
      0.7, 0.4, 0.6
    );
    this.composer.addPass(bloomPass);

    this.chromaticPass = new ShaderPass(ChromaticAberrationShader);
    this.composer.addPass(this.chromaticPass);

    this.vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignettePass);

    this.composer.addPass(new FilmPass(0.12, false));
    this.composer.addPass(new OutputPass());

    const ambientLight = new THREE.AmbientLight(0x1a1a3e, 0.5);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x9D4EDD, 0.5);
    dirLight.position.set(50, 100, 50);
    this.scene.add(dirLight);

    const pointLight1 = new THREE.PointLight(0x00F5FF, 2, 200);
    pointLight1.position.set(-30, 30, 0);
    this.scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xFF006E, 2, 200);
    pointLight2.position.set(30, 30, 0);
    this.scene.add(pointLight2);

    this.createSynthwaveSun();
    this.createCityscape();
    this.createBillboards();
    this.createRain();
    this.createDirectionalArrow();

    this.track = createTrack(this.scene);
    this.finishLine = createFinishLine(this.scene);
    this.checkpointRings = createCheckpointRings(this.scene);

    this.controls = new Controls();

    window.addEventListener('resize', () => this.onResize());

    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        const muted = this.audio.toggleMute();
        muteBtn.textContent = muted ? 'UNMUTE' : 'MUTE';
      });
    }
  }

  createSynthwaveSun() {
    const sunGroup = new THREE.Group();
    sunGroup.name = 'synthwaveSun';

    const sunGeo = new THREE.SphereGeometry(100, 32, 32);
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
    sun.position.set(0, 50, -600);
    sunGroup.add(sun);
    this.scene.add(sunGroup);
    this.sunMaterial = sunMat;
  }

  createCityscape() {
    const cityGroup = new THREE.Group();
    cityGroup.name = 'cityscape';

    const buildingColors = [0x0A0E27, 0x151535, 0x1A1A3E, 0x0F1528];

    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const radius = 350 + Math.random() * 100;
      const width = 15 + Math.random() * 30;
      const height = 50 + Math.random() * 150;
      const depth = 15 + Math.random() * 30;

      const buildingGeo = new THREE.BoxGeometry(width, height, depth);
      const buildingMat = new THREE.MeshStandardMaterial({
        color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
        roughness: 0.9,
        metalness: 0.1
      });
      const building = new THREE.Mesh(buildingGeo, buildingMat);

      building.position.set(
        Math.cos(angle) * radius,
        height / 2 - 5,
        Math.sin(angle) * radius
      );
      cityGroup.add(building);

      const windowRows = Math.floor(height / 8);
      const windowCols = Math.floor(width / 6);
      for (let row = 0; row < windowRows; row++) {
        for (let col = 0; col < windowCols; col++) {
          if (Math.random() > 0.4) {
            const windowGeo = new THREE.BoxGeometry(2, 3, 0.1);
            const windowMat = new THREE.MeshBasicMaterial({
              color: Math.random() > 0.5 ? 0x00F5FF : 0xFF006E,
              transparent: true,
              opacity: 0.3 + Math.random() * 0.4,
              toneMapped: false
            });
            const win = new THREE.Mesh(windowGeo, windowMat);
            win.position.set(
              building.position.x - width / 2 + 3 + col * 6,
              building.position.y - height / 2 + 5 + row * 8,
              building.position.z + depth / 2 + 0.1
            );
            cityGroup.add(win);
          }
        }
      }
    }

    this.scene.add(cityGroup);
    this.cityscape = cityGroup;
  }

  createBillboards() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 512, 256);
    gradient.addColorStop(0, '#FF006E');
    gradient.addColorStop(1, '#9D4EDD');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 256);

    ctx.font = 'bold 60px Arial';
    ctx.fillStyle = '#00F5FF';
    ctx.textAlign = 'center';
    ctx.fillText('CYBER', 256, 100);
    ctx.fillText('RACER', 256, 170);

    ctx.font = '30px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('★ HIGH SPEED ★', 256, 220);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const billboardPositions = [
      { x: 100, y: 25, z: -150, rot: 0.3 },
      { x: -90, y: 30, z: 100, rot: -0.5 },
      { x: 60, y: 35, z: 150, rot: 0.8 },
      { x: -70, y: 20, z: -80, rot: 0.2 },
    ];

    for (const pos of billboardPositions) {
      const billboardGroup = new THREE.Group();

      const frameGeo = new THREE.BoxGeometry(40, 20, 1);
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x1A1A2E,
        emissive: 0x9D4EDD,
        emissiveIntensity: 0.3
      });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      billboardGroup.add(frame);

      const screenGeo = new THREE.PlaneGeometry(38, 18);
      const screenMat = new THREE.MeshBasicMaterial({
        map: texture.clone(),
        toneMapped: false
      });
      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.z = 0.6;
      billboardGroup.add(screen);

      const legGeo = new THREE.BoxGeometry(2, 20, 2);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x1A1A2E });
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.y = -20;
      billboardGroup.add(leg);

      billboardGroup.position.set(pos.x, pos.y, pos.z);
      billboardGroup.rotation.y = pos.rot;
      this.scene.add(billboardGroup);
      this.billboards.push({ group: billboardGroup, screen: screen, offset: Math.random() * Math.PI * 2 });
    }
  }

  createRain() {
    const rainCount = 200;
    const rainGeo = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];

    for (let i = 0; i < rainCount; i++) {
      positions.push(
        (Math.random() - 0.5) * 400,
        Math.random() * 200,
        (Math.random() - 0.5) * 400
      );
      velocities.push(0, -5 - Math.random() * 5, 0);
    }

    rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const rainMat = new THREE.PointsMaterial({
      color: 0x8888AA,
      size: 0.5,
      transparent: true,
      opacity: 0.4,
      toneMapped: false
    });

    this.rainParticles = new THREE.Points(rainGeo, rainMat);
    this.rainParticles.userData.velocities = velocities;
    this.scene.add(this.rainParticles);
  }

  updateRain() {
    if (!this.rainParticles) return;
    const positions = this.rainParticles.geometry.attributes.position.array;
    const velocities = this.rainParticles.userData.velocities;
    const playerPos = this.playerCar ? this.playerCar.mesh.position : new THREE.Vector3();

    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3] += velocities[i * 3] * 0.01;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * 0.1;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * 0.01;

      if (positions[i * 3 + 1] < -10) {
        positions[i * 3] = playerPos.x + (Math.random() - 0.5) * 300;
        positions[i * 3 + 1] = 200;
        positions[i * 3 + 2] = playerPos.z + (Math.random() - 0.5) * 300;
      }
    }
    this.rainParticles.geometry.attributes.position.needsUpdate = true;
  }

  createDirectionalArrow() {
    const group = new THREE.Group();
    group.name = 'directionalArrow';

    const shaftGeo = new THREE.CylinderGeometry(0.6, 0.6, 6, 8);
    const headGeo = new THREE.ConeGeometry(2.0, 3, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00F5FF,
      transparent: true,
      opacity: 0.9,
      toneMapped: false
    });
    const shaft = new THREE.Mesh(shaftGeo, mat);
    shaft.position.y = 3;
    shaft.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(headGeo, mat);
    head.position.z = 4.5;
    head.rotation.x = Math.PI / 2;
    group.add(shaft, head);

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

    arrow.position.set(playerCar.mesh.position.x, playerCar.mesh.position.y + 10, playerCar.mesh.position.z);
    arrow.lookAt(nextCp.x, nextCp.mesh ? nextCp.mesh.position.y : nextCp.y + 3, nextCp.z);

    const dist = Math.hypot(nextCp.x - playerCar.mesh.position.x, nextCp.z - playerCar.mesh.position.z);
    arrow.visible = dist > 8;

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
    this.audio.init();
    this.animate();
  }

  animate() {
    if (!this.isRunning) return;

    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const input = this.controls.getInput();
    const prevPlayerCp = this.playerCar.nextCheckpoint;
    this.playerCar.update(input, dt);
    this.playerCar.checkLap();
    if (this.playerCar.nextCheckpoint !== prevPlayerCp) {
      flashCheckpoint(this.checkpointRings, prevPlayerCp, now);
      this.audio.playCheckpoint();
      if (prevPlayerCp === 0) {
        this.audio.playLapComplete();
      }
    }

    this.updateCamera();

    if (this.aiCar) {
      this.updateAI(dt);
      if (!this.aiCar.finished) {
        const prevAiCp = this.aiCar.nextCheckpoint;
        this.aiCar.update({ forward: true, backward: false, left: false, right: false }, dt);
        this.aiCar.checkLap();
        if (this.aiCar.nextCheckpoint !== prevAiCp) {
          flashCheckpoint(this.checkpointRings, prevAiCp, now);
        }
      }

      if (this.playerCar.checkCollision(this.aiCar)) {
        this.playerCar.applyCollisionResponse(this.aiCar);
        this.audio.playCrash();
      }
    }

    this.runCollisionTick();

    updateCheckpointRings(this.checkpointRings, now, this.playerCar.nextCheckpoint);
    this.updateDirectionalArrow(this.playerCar);

    if (this.sunMaterial) {
      this.sunMaterial.uniforms.uTime.value = now * 0.001;
    }

    if (this.track && this.track.group) {
      updateTrackShader(this.track.group, now * 0.001, this.playerCar.mesh.position);
    }

    const speed = this.playerCar.getSpeed();
    this.audio.updateEngine(speed);

    if (this.chromaticPass) {
      const speedRatio = speed / 300;
      this.chromaticPass.uniforms.uOffset.value = 0.002 + speedRatio * 0.006;
      this.chromaticPass.uniforms.uSpeed.value = speedRatio;
    }

    this.updateRain();

    for (const bb of this.billboards) {
      bb.group.position.y += Math.sin(now * 0.001 + bb.offset) * 0.01;
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

    const s = dt * 60;
    this.aiCar.rotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 0.05 * s);
    this.aiCar.velocity = 1.0;
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
      carPos.y + cameraOffset.y,
      carPos.z + cameraOffset.z
    );

    this.camera.position.lerp(targetPos, 0.08);
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

    const nextCp = (this.playerCar.nextCheckpoint || 0) + 1;
    const nextLabel = document.getElementById('next-cp-label');
    if (nextLabel) nextLabel.textContent = `Next: CP${nextCp}`;

    const wrongWayEl = document.getElementById('hud-wrongway');
    if (wrongWayEl) {
      wrongWayEl.classList.toggle('visible', this.playerCar.wrongWayStreak > 30);
    }

    const vignetteEl = document.getElementById('off-track-vignette');
    if (vignetteEl) {
      vignetteEl.classList.toggle('visible', !!this.playerCar.offTrack);
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
