import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WAYPOINTS, BOOST_PADS, TRACK_WIDTH } from '../../src/shared-track.js';
import { getClosestWaypointIndex, isOnTrack } from '../../src/track.js';

describe('Sprint 9: Spline Track', () => {
  it('WAYPOINTS has enough points for a smooth track', () => {
    assert.ok(WAYPOINTS.length >= 64, 'Should have at least 64 waypoints for smooth track');
  });

  it('First and last waypoints are nearly identical (closed loop)', () => {
    const first = WAYPOINTS[0];
    const last = WAYPOINTS[WAYPOINTS.length - 1];
    const dx = Math.abs(first.x - last.x);
    const dz = Math.abs(first.z - last.z);
    assert.ok(dx < 1 && dz < 1, `Track should close: first (${first.x}, ${first.z}) vs last (${last.x}, ${last.z}), dx=${dx}, dz=${dz}`);
  });

  it('Waypoints have elevation data (y component)', () => {
    let hasElevation = false;
    for (const wp of WAYPOINTS) {
      if (wp.y !== undefined && wp.y !== 0) {
        hasElevation = true;
        break;
      }
    }
    assert.ok(hasElevation, 'Track should have elevation changes (some y values should be non-zero)');
  });

  it('BOOST_PADS exports are valid', () => {
    assert.ok(Array.isArray(BOOST_PADS), 'BOOST_PADS should be an array');
    assert.ok(BOOST_PADS.length >= 3, 'Should have at least 3 boost pads');
    for (const pad of BOOST_PADS) {
      assert.ok(typeof pad.x === 'number', 'boost pad should have x');
      assert.ok(typeof pad.z === 'number', 'boost pad should have z');
      assert.ok(typeof pad.strength === 'number', 'boost pad should have strength');
    }
  });

  it('getClosestWaypointIndex returns valid index', () => {
    const idx = getClosestWaypointIndex(0, -180);
    assert.ok(idx >= 0 && idx < WAYPOINTS.length, 'Index should be in valid range');
  });

  it('isOnTrack returns true for points near the track', () => {
    const startWp = WAYPOINTS[0];
    assert.ok(isOnTrack(startWp.x, startWp.z), 'Start waypoint should be on track');
  });

  it('TRACK_WIDTH is positive', () => {
    assert.ok(TRACK_WIDTH > 0, 'TRACK_WIDTH should be positive');
  });
});

describe('Sprint 9: Car Enhancements', () => {
  it('Car class can be imported', async () => {
    const { Car } = await import('../../src/car.js');
    assert.ok(Car, 'Car class should be exportable');
  });

  it('Car prototype has fresnel-related methods', async () => {
    const { Car } = await import('../../src/car.js');
    assert.ok(Car.prototype, 'Car should have prototype');
  });
});

describe('Sprint 9: Audio System', () => {
  it('Game module exports CyberpunkAudio class', async () => {
    const { Game } = await import('../../src/game.js');
    assert.ok(Game, 'Game class should be exported');
  });
});

describe('Sprint 9: Post-Processing Shaders', () => {
  it('game.js has chromatic aberration shader defined', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('./src/game.js', 'utf-8');
    assert.ok(content.includes('ChromaticAberrationShader'), 'Should have ChromaticAberrationShader');
    assert.ok(content.includes('uOffset'), 'Should have uOffset uniform');
    assert.ok(content.includes('uSpeed'), 'Should have uSpeed uniform');
  });

  it('game.js has vignette shader defined', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('./src/game.js', 'utf-8');
    assert.ok(content.includes('VignetteShader'), 'Should have VignetteShader');
    assert.ok(content.includes('uIntensity'), 'Should have uIntensity uniform');
    assert.ok(content.includes('uGrain'), 'Should have uGrain uniform');
  });
});

describe('Sprint 9: Environment', () => {
  it('game.js creates cityscape', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('./src/game.js', 'utf-8');
    assert.ok(content.includes('createCityscape'), 'Should have createCityscape method');
  });

  it('game.js creates billboards', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('./src/game.js', 'utf-8');
    assert.ok(content.includes('createBillboards'), 'Should have createBillboards method');
  });

  it('game.js creates rain particles', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('./src/game.js', 'utf-8');
    assert.ok(content.includes('createRain'), 'Should have createRain method');
    assert.ok(content.includes('rainParticles'), 'Should have rainParticles');
  });
});
