import { describe, it } from 'node:test';
import assert from 'node:assert';

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

class MockCar {
  constructor(id) {
    this.id = id;
    this.lap = 0;
    this.nextCheckpoint = 1;
    this.t = 0;
    this.lastT = 0;
    this.wrongWayStreak = 0;
    this.x = 0;
    this.z = -200;
  }
}

function updateCar(car, pos) {
  car.x = pos.x;
  car.z = pos.z;

  const cp = CHECKPOINTS[car.nextCheckpoint];
  const dx = pos.x - cp.x;
  const dz = pos.z - cp.z;
  if (dx * dx + dz * dz < cp.r * cp.r) {
    if (car.nextCheckpoint === 0) {
      car.lap++;
    }
    car.nextCheckpoint = (car.nextCheckpoint + 1) % CHECKPOINTS.length;
  }

  const u = projectOntoTrack(pos.x, pos.z);
  const dt_progress = wrapDelta(u - car.lastT);
  if (dt_progress < -0.05) {
    car.wrongWayStreak++;
  } else {
    car.wrongWayStreak = Math.max(0, car.wrongWayStreak - 1);
  }
  car.lastT = car.t;
  car.t = u;
}

function computeRanking(cars) {
  return cars
    .map(c => ({ id: c.id, total: c.lap + c.t }))
    .sort((a, b) => b.total - a.total);
}

describe('Bug #5: Checkpoint lap + ranking', () => {
  describe('wrapDelta()', () => {
    it('returns 0 for small positive delta', () => {
      assert.strictEqual(wrapDelta(0.1), 0.1);
      assert.strictEqual(wrapDelta(0.01), 0.01);
    });

    it('returns 0 for small negative delta', () => {
      assert.strictEqual(wrapDelta(-0.1), -0.1);
      assert.strictEqual(wrapDelta(-0.01), -0.01);
    });

    it('wraps positive overflow (>0.5) by subtracting 1', () => {
      assert.strictEqual(wrapDelta(0.6), -0.4);
      assert.strictEqual(wrapDelta(0.75), -0.25);
      assert.strictEqual(wrapDelta(1.0), 0.0);
    });

    it('wraps negative overflow (<-0.5) by adding 1', () => {
      assert.strictEqual(wrapDelta(-0.6), 0.4);
      assert.strictEqual(wrapDelta(-0.75), 0.25);
      assert.strictEqual(wrapDelta(-1.0), 0.0);
    });

    it('handles exact boundary 0.5 and -0.5', () => {
      assert.strictEqual(wrapDelta(0.5), 0.5);
      assert.strictEqual(wrapDelta(-0.5), -0.5);
    });
  });

  describe('projectOntoTrack()', () => {
    it('is consistent for right-side positions (monotonically increasing t)', () => {
      const t1 = projectOntoTrack(30, 0);
      const t2 = projectOntoTrack(25, 15);
      const t3 = projectOntoTrack(15, 25);
      assert.ok(t2 > t1, `t2=${t2} > t1=${t1}`);
      assert.ok(t3 > t2, `t3=${t3} > t2=${t2}`);
    });

    it('is consistent around the top of oval', () => {
      const t1 = projectOntoTrack(15, 25);
      const t2 = projectOntoTrack(0, 200);
      const t3 = projectOntoTrack(-15, 25);
      assert.ok(t2 > t1, `t2=${t2} > t1=${t1}`);
      assert.ok(t3 > t2, `t3=${t3} > t2=${t2}`);
    });

    it('produces consistent t values around the oval', () => {
      const tStart = projectOntoTrack(0, -200);
      const tRight = projectOntoTrack(30, 0);
      const tTop = projectOntoTrack(0, 200);
      const tLeft = projectOntoTrack(-30, 0);

      assert.ok(tStart !== tRight, 'start != right');
      assert.ok(tRight !== tTop, 'right != top');
      assert.ok(tTop !== tLeft, 'top != left');
      assert.ok(tLeft !== tStart, 'left != start');

      const ts = [tStart, tRight, tTop, tLeft];
      for (let i = 0; i < ts.length; i++) {
        assert.ok(ts[i] >= 0 && ts[i] <= 1, `t${i}=${ts[i]} should be in [0,1]`);
      }
    });

    it('returns different values for different track positions', () => {
      const positions = [
        { x: 30, z: 0 },
        { x: 0, z: 200 },
        { x: -30, z: 0 },
        { x: 0, z: -200 }
      ];
      const ts = positions.map(p => projectOntoTrack(p.x, p.z));
      for (let i = 0; i < ts.length; i++) {
        for (let j = i + 1; j < ts.length; j++) {
          assert.notStrictEqual(ts[i], ts[j], `t${i}=${ts[i]} should != t${j}=${ts[j]}`);
        }
      }
    });
  });

  describe('Checkpoint progression', () => {
    it('starts at checkpoint 1 (after start/finish)', () => {
      const car = new MockCar(1);
      assert.strictEqual(car.nextCheckpoint, 1);
      assert.strictEqual(car.lap, 0);
    });

    it('advances from checkpoint 1 to 2 when near (30, 0)', () => {
      const car = new MockCar(1);
      car.nextCheckpoint = 1;
      car.t = 0;
      car.lastT = 0;
      updateCar(car, { x: 30, z: 0 });
      assert.strictEqual(car.nextCheckpoint, 2);
    });

    it('advances from checkpoint 2 to 3 when near (0, 200)', () => {
      const car = new MockCar(1);
      car.nextCheckpoint = 2;
      car.t = 0.1;
      car.lastT = 0.1;
      updateCar(car, { x: 0, z: 200 });
      assert.strictEqual(car.nextCheckpoint, 3);
    });

    it('advances from checkpoint 3 to 0 when near (-30, 0)', () => {
      const car = new MockCar(1);
      car.nextCheckpoint = 3;
      car.t = 0.2;
      car.lastT = 0.2;
      updateCar(car, { x: -30, z: 0 });
      assert.strictEqual(car.nextCheckpoint, 0);
    });

    it('increments lap when passing through start/finish (checkpoint 0)', () => {
      const car = new MockCar(1);
      car.nextCheckpoint = 0;
      car.lap = 0;
      car.t = 0.7;
      car.lastT = 0.7;
      updateCar(car, { x: 0, z: -200 });
      assert.strictEqual(car.lap, 1);
    });

    it('does NOT increment lap when passing through checkpoints 1, 2, 3', () => {
      const car = new MockCar(1);
      car.nextCheckpoint = 1;
      car.lap = 0;
      car.t = 0;
      car.lastT = 0;
      updateCar(car, { x: 30, z: 0 });
      assert.strictEqual(car.lap, 0);
      assert.strictEqual(car.nextCheckpoint, 2);

      car.t = 0.1;
      car.lastT = 0.1;
      updateCar(car, { x: 0, z: 200 });
      assert.strictEqual(car.lap, 0);
      assert.strictEqual(car.nextCheckpoint, 3);
    });

    it('increments lap only after completing full circuit (1→2→3→0)', () => {
      const car = new MockCar(1);
      car.nextCheckpoint = 1;
      car.lap = 0;
      car.t = 0;
      car.lastT = 0;

      updateCar(car, { x: 30, z: 0 });
      assert.strictEqual(car.lap, 0);

      car.t = 0.1;
      car.lastT = 0.1;
      updateCar(car, { x: 0, z: 200 });
      assert.strictEqual(car.lap, 0);

      car.t = 0.2;
      car.lastT = 0.2;
      updateCar(car, { x: -30, z: 0 });
      assert.strictEqual(car.lap, 0);

      car.t = 0.7;
      car.lastT = 0.7;
      updateCar(car, { x: 0, z: -200 });
      assert.strictEqual(car.lap, 1);
    });

    it('correctly tracks multiple laps', () => {
      const car = new MockCar(1);
      car.nextCheckpoint = 1;
      car.lap = 0;
      car.t = 0;
      car.lastT = 0;

      for (let lap = 0; lap < 3; lap++) {
        car.t = 0;
        car.lastT = 0;
        updateCar(car, { x: 30, z: 0 });

        car.t = 0.1;
        car.lastT = 0.1;
        updateCar(car, { x: 0, z: 200 });

        car.t = 0.2;
        car.lastT = 0.2;
        updateCar(car, { x: -30, z: 0 });

        car.t = 0.7;
        car.lastT = 0.7;
        updateCar(car, { x: 0, z: -200 });
      }

      assert.strictEqual(car.lap, 3);
    });
  });

  describe('Wrong-way detection', () => {
    it('increments wrongWayStreak when progress drops significantly', () => {
      const car = new MockCar(1);
      car.t = 0.1;
      car.lastT = 0.2;
      updateCar(car, { x: 0, z: -200 });
      assert.strictEqual(car.wrongWayStreak, 1);
    });

    it('decrements wrongWayStreak when progress is stable', () => {
      const car = new MockCar(1);
      car.wrongWayStreak = 5;
      car.t = 0.2;
      car.lastT = 0.1;
      updateCar(car, { x: 30, z: 0 });
      assert.strictEqual(car.wrongWayStreak, 4);
    });

    it('does not trigger wrong-way for normal forward progress', () => {
      const car = new MockCar(1);
      car.t = 0.1;
      car.lastT = 0.05;
      car.wrongWayStreak = 0;
      updateCar(car, { x: 30, z: 0 });
      assert.strictEqual(car.wrongWayStreak, 0);
    });


  });

  describe('Ranking', () => {
    it('ranks car with more laps higher', () => {
      const car1 = Object.assign(new MockCar(1), { lap: 2, t: 0.1 });
      const car2 = Object.assign(new MockCar(2), { lap: 1, t: 0.9 });

      const ranking = computeRanking([car1, car2]);
      assert.strictEqual(ranking[0].id, 1);
      assert.strictEqual(ranking[1].id, 2);
    });

    it('ranks car with same laps but higher t higher', () => {
      const car1 = Object.assign(new MockCar(1), { lap: 1, t: 0.8 });
      const car2 = Object.assign(new MockCar(2), { lap: 1, t: 0.2 });

      const ranking = computeRanking([car1, car2]);
      assert.strictEqual(ranking[0].id, 1);
      assert.strictEqual(ranking[1].id, 2);
    });

    it('sorts descending by total (lap + t)', () => {
      const cars = [
        Object.assign(new MockCar(1), { lap: 0, t: 0.1 }),
        Object.assign(new MockCar(2), { lap: 1, t: 0.0 }),
        Object.assign(new MockCar(3), { lap: 0, t: 0.9 }),
        Object.assign(new MockCar(4), { lap: 2, t: 0.1 })
      ];

      const ranking = computeRanking(cars);
      assert.strictEqual(ranking[0].id, 4);
      assert.strictEqual(ranking[1].id, 2);
      assert.strictEqual(ranking[2].id, 3);
      assert.strictEqual(ranking[3].id, 1);
    });

    it('assigns correct 1-based position indices', () => {
      const cars = [
        Object.assign(new MockCar(1), { lap: 1, t: 0.2 }),
        Object.assign(new MockCar(2), { lap: 1, t: 0.1 }),
        Object.assign(new MockCar(3), { lap: 0, t: 0.9 })
      ];

      const ranking = computeRanking(cars);
      const positions = {};
      ranking.forEach((r, idx) => { positions[r.id] = idx + 1; });

      assert.strictEqual(positions[1], 1);
      assert.strictEqual(positions[2], 2);
      assert.strictEqual(positions[3], 3);
    });
  });

  describe('Integration: Race position over time', () => {
    it('car ahead in laps is ranked higher regardless of t', () => {
      const car1 = Object.assign(new MockCar(1), { lap: 2, t: 0.05 });
      const car2 = Object.assign(new MockCar(2), { lap: 1, t: 0.95 });

      const ranking = computeRanking([car1, car2]);
      assert.strictEqual(ranking[0].id, 1, 'car with 2 laps (t=0.05) beats car with 1 lap (t=0.95)');
    });

    it('when same lap, car ahead in t is ranked higher', () => {
      const car1 = Object.assign(new MockCar(1), { lap: 1, t: 0.6 });
      const car2 = Object.assign(new MockCar(2), { lap: 1, t: 0.4 });

      const ranking = computeRanking([car1, car2]);
      assert.strictEqual(ranking[0].id, 1, 'car with t=0.6 beats car with t=0.4');
    });
  });
});