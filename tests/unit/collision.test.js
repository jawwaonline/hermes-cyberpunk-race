import { describe, it } from 'node:test';
import assert from 'node:assert';

function boxesOverlap(a, b) {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

function computeCarAABB(x, z, yaw, halfWidth = 1.0, halfLength = 2.0, height = 0.6) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);

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

  return {
    min: { x: minX, y: 0, z: minZ },
    max: { x: maxX, y: height, z: maxZ }
  };
}

function checkCarCollision(carA, carB) {
  const aabbA = computeCarAABB(carA.x, carA.z, carA.yaw || 0);
  const aabbB = computeCarAABB(carB.x, carB.z, carB.yaw || 0);
  return boxesOverlap(aabbA, aabbB);
}

function applyCollisionResponse(carA, carB) {
  const dx = carB.x - carA.x;
  const dz = carB.z - carA.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist === 0) {
    carA.x -= 1;
    carB.x += 1;
    return;
  }

  const overlap = 2.0 - dist;
  if (overlap > 0) {
    const nx = dx / dist;
    const nz = dz / dist;
    const push = overlap / 2 + 0.01;
    carA.x -= nx * push;
    carA.z -= nz * push;
    carB.x += nx * push;
    carB.z += nz * push;
  }
}

describe('Bug #3: AABB collision detection', () => {
  describe('boxesOverlap()', () => {
    it('returns true for overlapping boxes', () => {
      const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } };
      const b = { min: { x: 1, y: 1, z: 1 }, max: { x: 3, y: 3, z: 3 } };
      assert.strictEqual(boxesOverlap(a, b), true);
    });

    it('returns false for non-overlapping boxes', () => {
      const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } };
      const b = { min: { x: 3, y: 3, z: 3 }, max: { x: 5, y: 5, z: 5 } };
      assert.strictEqual(boxesOverlap(a, b), false);
    });

    it('returns true for touching boxes', () => {
      const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } };
      const b = { min: { x: 2, y: 2, z: 2 }, max: { x: 4, y: 4, z: 4 } };
      assert.strictEqual(boxesOverlap(a, b), true);
    });
  });

  describe('computeCarAABB()', () => {
    it('computes AABB for axis-aligned car', () => {
      const aabb = computeCarAABB(0, 0, 0);
      assert.ok(aabb.min.x < aabb.max.x);
      assert.ok(aabb.min.y < aabb.max.y);
      assert.ok(aabb.min.z < aabb.max.z);
    });

    it('computes AABB for rotated car (45 degrees)', () => {
      const aabb = computeCarAABB(0, 0, Math.PI / 4);
      assert.ok(aabb.max.x - aabb.min.x > 0);
      assert.ok(aabb.max.z - aabb.min.z > 0);
    });

    it('AABB covers car dimensions (2x4 units)', () => {
      const aabb = computeCarAABB(0, 0, 0);
      const width = aabb.max.x - aabb.min.x;
      const length = aabb.max.z - aabb.min.z;
      assert.ok(width >= 2, `width=${width} should be >= 2`);
      assert.ok(length >= 4, `length=${length} should be >= 4`);
    });
  });

  describe('checkCarCollision()', () => {
    it('detects collision between two cars at same position', () => {
      const carA = { x: 0, z: 0, yaw: 0 };
      const carB = { x: 0, z: 0, yaw: 0 };
      assert.strictEqual(checkCarCollision(carA, carB), true);
    });

    it('detects no collision between two cars far apart', () => {
      const carA = { x: 0, z: 0, yaw: 0 };
      const carB = { x: 20, z: 0, yaw: 0 };
      assert.strictEqual(checkCarCollision(carA, carB), false);
    });

    it('detects collision between two cars at small offset', () => {
      const carA = { x: 0, z: 0, yaw: 0 };
      const carB = { x: 1.5, z: 0, yaw: 0 };
      assert.strictEqual(checkCarCollision(carA, carB), true);
    });

    it('detects no collision when cars barely miss', () => {
      const carA = { x: 0, z: 0, yaw: 0 };
      const carB = { x: 3.5, z: 0, yaw: 0 };
      assert.strictEqual(checkCarCollision(carA, carB), false);
    });

    it('detects collision when cars at 90-degree angles', () => {
      const carA = { x: 0, z: 0, yaw: 0 };
      const carB = { x: 1.5, z: 0, yaw: Math.PI / 2 };
      assert.strictEqual(checkCarCollision(carA, carB), true);
    });

    it('detects no collision for cars side by side', () => {
      const carA = { x: 0, z: 0, yaw: 0 };
      const carB = { x: 0, z: 5, yaw: 0 };
      assert.strictEqual(checkCarCollision(carA, carB), false);
    });
  });

  describe('applyCollisionResponse()', () => {
    it('separates colliding cars', () => {
      const carA = { x: 0, z: 0, yaw: 0 };
      const carB = { x: 1.5, z: 0, yaw: 0 };

      assert.strictEqual(checkCarCollision(carA, carB), true);

      applyCollisionResponse(carA, carB);

      assert.strictEqual(checkCarCollision(carA, carB), false);
    });

    it('handles cars at same position', () => {
      const carA = { x: 0, z: 0, yaw: 0 };
      const carB = { x: 0, z: 0, yaw: 0 };

      applyCollisionResponse(carA, carB);

      assert.notStrictEqual(carA.x, carB.x);
    });

    it('does not affect non-colliding cars', () => {
      const carA = { x: 0, z: 0, yaw: 0 };
      const carB = { x: 20, z: 0, yaw: 0 };
      const origAx = carA.x, origAz = carA.z;
      const origBx = carB.x, origBz = carB.z;

      applyCollisionResponse(carA, carB);

      assert.strictEqual(carA.x, origAx);
      assert.strictEqual(carA.z, origAz);
      assert.strictEqual(carB.x, origBx);
      assert.strictEqual(carB.z, origBz);
    });
  });

  describe('Integration: Two-car collision scenario', () => {
    it('cars approaching trigger collision', () => {
      const carA = { x: 0, z: 0, yaw: 0 };
      const carB = { x: 2, z: 0, yaw: Math.PI };
      assert.strictEqual(checkCarCollision(carA, carB), true);
    });

    it('cars side by side do not collide', () => {
      const carA = { x: 0, z: 0, yaw: 0 };
      const carB = { x: 0, z: 5, yaw: 0 };
      assert.strictEqual(checkCarCollision(carA, carB), false);
    });

    it('collision response resolves overlap', () => {
      const carA = { x: 0, z: 0, yaw: 0 };
      const carB = { x: 1.5, z: 0, yaw: 0 };

      applyCollisionResponse(carA, carB);

      const dx = Math.abs(carB.x - carA.x);
      const dz = Math.abs(carB.z - carA.z);
      assert.ok(dx > 1.5 || dz > 0, 'cars should be separated');
    });
  });
});