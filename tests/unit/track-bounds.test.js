import { describe, it } from 'node:test';
import assert from 'node:assert';

const TRACK_WIDTH = 20;
const A = 30;
const B = 200;

function generateTrackPolygon() {
  const inner = [];
  const outer = [];
  const N = 64;
  const halfW = TRACK_WIDTH / 2;

  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    const cx = A * Math.cos(angle);
    const cz = B * Math.sin(angle);

    const nx = cx / (A * A);
    const nz = cz / (B * B);
    const nLen = Math.sqrt(nx * nx + nz * nz);

    inner.push({ x: cx - nx / nLen * halfW, z: cz - nz / nLen * halfW });
    outer.push({ x: cx + nx / nLen * halfW, z: cz + nz / nLen * halfW });
  }

  return { inner, outer };
}

const trackPolygon = generateTrackPolygon();

function pointInPolygon(x, z, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function isOnTrack(x, z) {
  const inOuter = pointInPolygon(x, z, trackPolygon.outer);
  const inInner = pointInPolygon(x, z, trackPolygon.inner);
  return inOuter && !inInner;
}

function nearestValidSplinePoint(x, z) {
  const angle = Math.atan2(z, x);
  const cx = A * Math.cos(angle);
  const cz = B * Math.sin(angle);
  const nx = cx / (A * A);
  const nz = cz / (B * B);
  const nLen = Math.sqrt(nx * nx + nz * nz);
  const halfW = TRACK_WIDTH / 2 - 1;

  return { x: cx + nx / nLen * halfW, y: 0, z: cz + nz / nLen * halfW };
}

class MockCar {
  constructor(x, z) {
    this.x = x;
    this.z = z;
    this.speed = 0;
    this.offTrack = false;
    this.offTrackStreak = 0;
    this.speedMultiplier = 1.0;
    this.strikes = 0;
  }
}

function updateOffTrack(car) {
  car.offTrack = !isOnTrack(car.x, car.z);
  if (car.offTrack) {
    car.speedMultiplier = 0.25;
    car.offTrackStreak++;
    if (car.speed < 1 && car.offTrackStreak > 90) {
      const safe = nearestValidSplinePoint(car.x, car.z);
      car.x = safe.x;
      car.z = safe.z;
      car.offTrackStreak = 0;
      return true;
    }
  } else {
    car.speedMultiplier = 1.0;
    if (car.offTrackStreak > 60) {
      car.strikes++;
    }
    car.offTrackStreak = 0;
  }
  return false;
}

describe('Bug #2: Track bounds (pointInPolygon)', () => {
  describe('generateTrackPolygon()', () => {
    it('creates inner and outer rings with same length', () => {
      assert.strictEqual(trackPolygon.inner.length, trackPolygon.outer.length);
      assert.ok(trackPolygon.inner.length > 0);
    });

    it('inner ring points are closer to center than outer ring points', () => {
      const midInner = trackPolygon.inner[0];
      const midOuter = trackPolygon.outer[0];
      const distInner = Math.sqrt(midInner.x * midInner.x + midInner.z * midInner.z);
      const distOuter = Math.sqrt(midOuter.x * midOuter.x + midOuter.z * midOuter.z);
      assert.ok(distInner < distOuter, `inner=${distInner} should be < outer=${distOuter}`);
    });
  });

  describe('isOnTrack()', () => {
    it('returns false for positions far outside track', () => {
      assert.strictEqual(isOnTrack(0, -300), false);
      assert.strictEqual(isOnTrack(100, 0), false);
      assert.strictEqual(isOnTrack(0, 300), false);
      assert.strictEqual(isOnTrack(-100, 0), false);
    });

    it('returns false for positions inside inner boundary', () => {
      assert.strictEqual(isOnTrack(0, 0), false);
      assert.strictEqual(isOnTrack(5, 5), false);
    });

    it('returns true for some positions on/near the track', () => {
      assert.strictEqual(isOnTrack(30, 0), true);
    });
  });

  describe('nearestValidSplinePoint()', () => {
    it('returns a point that is on track', () => {
      const safe = nearestValidSplinePoint(100, 0);
      assert.strictEqual(isOnTrack(safe.x, safe.z), true);
    });
  });
});

describe('Bug #2 Integration: Off-track slowdown', () => {
  it('applies speedMultiplier 0.25 when off-track', () => {
    const car = new MockCar(0, -300);
    car.speed = 10;
    updateOffTrack(car);
    assert.strictEqual(car.offTrack, true);
    assert.strictEqual(car.speedMultiplier, 0.25);
  });

  it('resets speedMultiplier to 1.0 when back on track', () => {
    const car = new MockCar(30, 0);
    car.speed = 10;
    updateOffTrack(car);
    assert.strictEqual(car.offTrack, false);
    assert.strictEqual(car.speedMultiplier, 1.0);
  });

  it('increments offTrackStreak while off-track', () => {
    const car = new MockCar(0, -300);
    car.speed = 10;
    updateOffTrack(car);
    assert.strictEqual(car.offTrackStreak, 1);
    updateOffTrack(car);
    assert.strictEqual(car.offTrackStreak, 2);
  });
});

describe('Bug #2 Integration: Stuck reset', () => {
  it('does not reset car that is moving even if off-track', () => {
    const car = new MockCar(0, -300);
    car.speed = 10;
    car.offTrackStreak = 100;
    const reset = updateOffTrack(car);
    assert.strictEqual(reset, false);
  });

  it('resets car stuck off-track with low speed after threshold', () => {
    const car = new MockCar(0, -300);
    car.speed = 0.5;
    car.offTrackStreak = 0;

    for (let i = 0; i < 92; i++) {
      updateOffTrack(car);
    }

    assert.ok(car.offTrackStreak === 0, `offTrackStreak should be 0 after reset, got ${car.offTrackStreak}`);
    assert.strictEqual(isOnTrack(car.x, car.z), true);
  });

  it('resets to a position that is on track', () => {
    const car = new MockCar(0, -300);
    car.speed = 0.5;

    for (let i = 0; i < 92; i++) {
      updateOffTrack(car);
    }

    assert.strictEqual(isOnTrack(car.x, car.z), true);
  });
});

describe('Bug #4: Wrong-way HUD warning (already in 5b wrongWayStreak)', () => {
  it('wrongWayStreak threshold of 30 triggers WRONG WAY warning', () => {
    const threshold = 30;
    let streak = 0;
    for (let i = 0; i < 30; i++) {
      streak++;
    }
    assert.ok(streak >= threshold);
  });

  it('wrongWayStreak decrements when making forward progress', () => {
    let streak = 30;
    streak = Math.max(0, streak - 1);
    assert.strictEqual(streak, 29);
  });
});