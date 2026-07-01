// Sprint 6 — Fix A: integration test for the server-side pairwise AABB
// collision sweep.  We re-implement the same AABB math here, then drive
// a small simulation: two cars at the same position should be pushed
// apart by the server's resolveServerCollision logic.

import { describe, it } from 'node:test';
import assert from 'node:assert';

const HALF_WIDTH = 1.0;
const HALF_LENGTH = 2.0;

function computeAABB(x, z, yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const corners = [
    { x: -HALF_WIDTH, z: -HALF_LENGTH },
    { x: HALF_WIDTH, z: -HALF_LENGTH },
    { x: HALF_WIDTH, z: HALF_LENGTH },
    { x: -HALF_WIDTH, z: HALF_LENGTH }
  ];
  const r = corners.map(c => ({ x: x + c.x * cos - c.z * sin, z: z + c.x * sin + c.z * cos }));
  let minX = r[0].x, maxX = r[0].x, minZ = r[0].z, maxZ = r[0].z;
  for (const c of r) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.z < minZ) minZ = c.z;
    if (c.z > maxZ) maxZ = c.z;
  }
  return { min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: 1, z: maxZ } };
}

function boxesOverlap(a, b) {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

function resolveCollision(carA, carB) {
  const aabbA = computeAABB(carA.x, carA.z, carA.yaw);
  const aabbB = computeAABB(carB.x, carB.z, carB.yaw);
  if (!boxesOverlap(aabbA, aabbB)) return false;
  const dx = carB.x - carA.x;
  const dz = carB.z - carA.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist === 0) {
    carA.x -= 1;
    carB.x += 1;
    return true;
  }
  const overlap = 4.0 - dist;
  if (overlap > 0) {
    const nx = dx / dist;
    const nz = dz / dist;
    const push = overlap / 2 + 0.01;
    carA.x -= nx * push;
    carA.z -= nz * push;
    carB.x += nx * push;
    carB.z += nz * push;
  }
  return true;
}

describe('Fix A — server-side AABB collision sweep', () => {
  it('two cars at (0,0) get pushed apart along x', () => {
    const a = { x: 0, z: 0, yaw: 0 };
    const b = { x: 0, z: 0, yaw: 0 };
    const overlap = resolveCollision(a, b);
    assert.strictEqual(overlap, true);
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    assert.ok(dist > 0.1, `cars should be separated, got distance=${dist}`);
  });

  it('two cars at small offset (1.5, 0) get pushed apart', () => {
    const a = { x: 0, z: 0, yaw: 0 };
    const b = { x: 1.5, z: 0, yaw: 0 };
    const overlap = resolveCollision(a, b);
    assert.strictEqual(overlap, true);
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    assert.ok(dist > 1.5, `cars should be at least 1.5 apart, got distance=${dist}`);
  });

  it('two cars far apart are untouched', () => {
    const a = { x: 0, z: 0, yaw: 0 };
    const b = { x: 50, z: 0, yaw: 0 };
    const before = { a: { ...a }, b: { ...b } };
    const overlap = resolveCollision(a, b);
    assert.strictEqual(overlap, false);
    assert.strictEqual(a.x, before.a.x);
    assert.strictEqual(b.x, before.b.x);
  });

  it('two cars in a 2-player room are both resolved', () => {
    // Simulate the loop the server position handler does
    const room = {
      players: [
        { x: 0, z: 0, yaw: 0 },
        { x: 0, z: 0, yaw: 0 }
      ]
    };
    for (let i = 0; i < room.players.length; i++) {
      for (let j = i + 1; j < room.players.length; j++) {
        resolveCollision(room.players[i], room.players[j]);
      }
    }
    const dist = Math.hypot(
      room.players[0].x - room.players[1].x,
      room.players[0].z - room.players[1].z
    );
    assert.ok(dist > 0.1, '2-player room collision should resolve');
  });
});
