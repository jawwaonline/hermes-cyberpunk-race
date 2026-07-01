import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WAYPOINTS, TRACK_LENGTH, TRACK_WIDTH } from '../../src/shared-track.js';

describe('shared-track.js exports', () => {
  it('WAYPOINTS is a non-empty array', () => {
    assert.ok(Array.isArray(WAYPOINTS), 'WAYPOINTS should be an array');
    assert.ok(WAYPOINTS.length > 0, 'WAYPOINTS should not be empty');
  });

  it('TRACK_LENGTH is a positive number', () => {
    assert.ok(typeof TRACK_LENGTH === 'number', 'TRACK_LENGTH should be a number');
    assert.ok(TRACK_LENGTH > 0, 'TRACK_LENGTH should be positive');
  });

  it('TRACK_WIDTH is a positive number', () => {
    assert.ok(typeof TRACK_WIDTH === 'number', 'TRACK_WIDTH should be a number');
    assert.ok(TRACK_WIDTH > 0, 'TRACK_WIDTH should be positive');
  });

  it('Waypoints have required x/z properties', () => {
    for (const wp of WAYPOINTS) {
      assert.ok('x' in wp, 'waypoint should have x');
      assert.ok('z' in wp, 'waypoint should have z');
      assert.ok(typeof wp.x === 'number', 'waypoint.x should be a number');
      assert.ok(typeof wp.z === 'number', 'waypoint.z should be a number');
    }
  });

  it('Waypoints form a closed loop (first == last)', () => {
    const first = WAYPOINTS[0];
    const last = WAYPOINTS[WAYPOINTS.length - 1];
    // For a closed oval, first and last should be near each other
    const dx = Math.abs(first.x - last.x);
    const dz = Math.abs(first.z - last.z);
    assert.ok(dx < 1 && dz < 1, 'Track should be closed: first and last waypoint should be near each other');
  });
});
