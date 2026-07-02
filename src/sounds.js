// Web Audio API sound manager for Cyberpunk Race
// No external assets needed — all sounds are synthesized oscillators

class Sounds {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.muted = false;
    this.initialized = false;

    // Tracked nodes for cleanup
    this.activeOscillators = [];
    this.activeTimeouts = [];
    this.menuMusicInterval = null;

    // Engine sound nodes
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
  }

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch (e) {
      console.warn('WebAudio not available:', e);
    }
  }

  startEngine() {
    if (!this.ctx || this.engineOsc) return;
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
    this.activeOscillators.push(this.engineOsc);
  }

  updateEngine(speed) {
    if (!this.engineOsc || !this.ctx) return;
    const normSpeed = speed / 300;
    this.engineOsc.frequency.setTargetAtTime(
      60 + normSpeed * 200, this.ctx.currentTime, 0.1
    );
    this.engineFilter.frequency.setTargetAtTime(
      200 + normSpeed * 800, this.ctx.currentTime, 0.1
    );
  }

  // --- 8-bit/chiptune cyberpunk menu melody ---
  playMenuMusic() {
    if (!this.ctx || this.muted) return;
    this.stopMenuMusic();

    const bpm = 140;
    const beatDur = 60 / bpm;

    // Melody notes: frequency, beat offset, duration in beats
    const melody = [
      { f: 220,     t: 0,    d: 0.25 },
      { f: 277.18,  t: 0.25, d: 0.25 },
      { f: 329.63,  t: 0.5,  d: 0.25 },
      { f: 277.18,  t: 0.75, d: 0.25 },
      { f: 261.63,  t: 1.0,  d: 0.25 },
      { f: 329.63,  t: 1.25, d: 0.25 },
      { f: 349.23,  t: 1.5,  d: 0.5  },
      { f: 329.63,  t: 2.0,  d: 0.25 },
      { f: 261.63,  t: 2.25, d: 0.25 },
      { f: 220,     t: 2.5,  d: 0.25 },
      { f: 261.63,  t: 2.75, d: 0.25 },
      { f: 329.63,  t: 3.0,  d: 0.5  },
      { f: 349.23,  t: 3.5,  d: 0.25 },
      { f: 440,     t: 3.75, d: 0.25 },
      { f: 392,     t: 4.0,  d: 0.5  },
      { f: 349.23,  t: 4.5,  d: 0.25 },
      { f: 329.63,  t: 4.75, d: 0.25 },
    ];

    const bassNotes = [
      { f: 110,    t: 0  },
      { f: 110,    t: 2  },
      { f: 103.83, t: 2.5 },
      { f: 98,     t: 3  },
      { f: 110,    t: 4  },
    ];

    const scheduleLoop = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      for (const note of melody) {
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = note.f;
        const gain = this.ctx.createGain();
        const startT = now + note.t * beatDur;
        gain.gain.setValueAtTime(0.08, startT);
        gain.gain.exponentialRampToValueAtTime(0.01, startT + note.d * beatDur);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(startT);
        osc.stop(startT + note.d * beatDur + 0.05);
        this.activeOscillators.push(osc);
      }

      for (const n of bassNotes) {
        const bosc = this.ctx.createOscillator();
        bosc.type = 'sawtooth';
        bosc.frequency.value = n.f;
        const bgain = this.ctx.createGain();
        const bStart = now + n.t * beatDur;
        bgain.gain.setValueAtTime(0.06, bStart);
        bgain.gain.exponentialRampToValueAtTime(0.01, bStart + 0.5);
        bosc.connect(bgain);
        bgain.connect(this.masterGain);
        bosc.start(bStart);
        bosc.stop(bStart + 0.55);
        this.activeOscillators.push(bosc);
      }
    };

    const loopDuration = 5 * beatDur * 1000;
    scheduleLoop();
    this.menuMusicInterval = setInterval(scheduleLoop, loopDuration);
  }

  stopMenuMusic() {
    if (this.menuMusicInterval) {
      clearInterval(this.menuMusicInterval);
      this.menuMusicInterval = null;
    }
  }

  // --- Clean stop of ALL sounds ---
  stopAll() {
    this.stopMenuMusic();

    for (const t of this.activeTimeouts) {
      clearTimeout(t);
    }
    this.activeTimeouts = [];

    for (const osc of this.activeOscillators) {
      try { osc.stop(); } catch (e) { /* already stopped */ }
    }
    this.activeOscillators = [];

    if (this.engineOsc) {
      try { this.engineOsc.stop(); } catch (e) { /* already stopped */ }
      this.engineOsc = null;
      this.engineGain = null;
      this.engineFilter = null;
    }

    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.initialized = false;
  }

  // --- One-shot sound effects ---

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
    this.activeOscillators.push(osc);
  }

  playLapComplete() {
    if (!this.ctx || this.muted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const delay = i * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + delay + 0.15);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(this.ctx.currentTime + delay);
      osc.stop(this.ctx.currentTime + delay + 0.15);
      this.activeOscillators.push(osc);
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
    this.activeOscillators.push(osc);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : 0.3, this.ctx.currentTime, 0.1
      );
    }
    return this.muted;
  }
}

// Singleton — shared by game.js and client.js so there's one AudioContext
export const sounds = new Sounds();
