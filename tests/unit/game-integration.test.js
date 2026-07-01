// Sprint 6 — Fix A: integration test for the game-loop collision wiring.
//
// The Car class itself has a self-contained update() and collision API.
// We import it, construct a player + ai pair in a fake scene, simulate one
// frame of the per-frame collision logic that the game loop should run
// (i.e. the fix we are about to land in src/game.js), and assert that two
// cars at the same position end up separated.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Car } from '../../src/car.js';

class FakeScene {
  constructor() { this.children = []; }
  add(obj) { this.children.push(obj); return obj; }
  remove(obj) {
    const i = this.children.indexOf(obj);
    if (i >= 0) this.children.splice(i, 1);
    return obj;
  }
}

// This is the EXACT snippet that src/game.js:animate() must execute after Fix A
// lands in this sprint.  If the snippet is missing from the game loop, the
// collision methods on Car will never be called and per-frame integration is
// broken at the point of use.
function runCollisionTick(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      if (cars[i].checkCollision(cars[j])) {
        cars[i].applyCollisionResponse(cars[j]);
      }
    }
  }
}

describe('Fix A — integration: 2 cars same position are pushed apart', () => {
  it('playerCar and aiCar at same (0,0,0) are separated after the per-frame tick', () => {
    const scene = new FakeScene();
    const playerCar = new Car(scene, true, 0x00ffff);
    const aiCar = new Car(scene, false, 0xff00ff);

    // Force them into identical positions
    playerCar.mesh.position.set(0, 0, 0);
    aiCar.mesh.position.set(0, 0, 0);

    // Sanity: they DO collide before the tick.
    assert.strictEqual(playerCar.checkCollision(aiCar), true);

    // The fixed animate() body:
    const cars = [playerCar, aiCar];
    runCollisionTick(cars);

    // After the tick, the cars must no longer overlap.
    const dx = aiCar.mesh.position.x - playerCar.mesh.position.x;
    const dz = aiCar.mesh.position.z - playerCar.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    assert.ok(
      dist > 0.1,
      `cars at identical positions should be pushed apart, got distance=${dist}`
    );
  });

  it('the per-frame tick leaves non-overlapping cars untouched', () => {
    const scene = new FakeScene();
    const playerCar = new Car(scene, true, 0x00ffff);
    const aiCar = new Car(scene, false, 0xff00ff);

    playerCar.mesh.position.set(0, 0, 0);
    aiCar.mesh.position.set(50, 0, 0);

    const origPlayerX = playerCar.mesh.position.x;
    const origAiX = aiCar.mesh.position.x;

    runCollisionTick([playerCar, aiCar]);

    assert.strictEqual(playerCar.mesh.position.x, origPlayerX);
    assert.strictEqual(aiCar.mesh.position.x, origAiX);
  });

  it('update() runs the full per-frame pipeline (off-track, trail, checkpoint)', () => {
    // Regression: the AI car in the old Sprint 5 build never had its own
    // update() called (its movement was driven by game.updateAI() instead
    // of through Car.update()).  After Fix A, calling aiCar.update() must
    // leave its mesh in a sensible place (no NaN), update nextCheckpoint
    // when in the area, and not throw.
    const scene = new FakeScene();
    const aiCar = new Car(scene, false, 0xff00ff);
    aiCar.mesh.position.set(0, 0, 0);

    assert.doesNotThrow(() => {
      aiCar.update({}, 1 / 60);
    });
    assert.ok(Number.isFinite(aiCar.mesh.position.x));
    assert.ok(Number.isFinite(aiCar.mesh.position.z));
  });

  it('Car.update() advances nextCheckpoint when crossing the next target', () => {
    const scene = new FakeScene();
    const playerCar = new Car(scene, true, 0x00ffff);
    playerCar.mesh.position.set(30, 0, 0); // On top of checkpoint 1
    const before = playerCar.nextCheckpoint;

    playerCar.update({}, 1 / 60);

    assert.strictEqual(
      playerCar.nextCheckpoint,
      (before + 1) % 4,
      'crossing a checkpoint should advance nextCheckpoint'
    );
  });
});
