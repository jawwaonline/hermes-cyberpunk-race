// Sprint 6 — Fix A: integration test asserting that src/game.js:animate()
// actually CALLS the collision methods on cars.  This is the wiring test
// the previous Sprint 5 run was missing — logic existed in car.js but the
// game loop never invoked it, so the unit suite passed while gameplay was
// broken.
//
// We do this by static analysis of the source: parse game.js and look for
// the call expressions inside animate().  This catches the regression where
// the call is removed (or commented out) without breaking the unit tests.
//
// We also walk src/server.js for the same wire-up on the server-side tick.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GAME_JS = path.resolve(__dirname, '../../src/game.js');
const SERVER_JS = path.resolve(__dirname, '../../src/server.js');

function readSrc(p) {
  return readFileSync(p, 'utf-8');
}

// Walk balanced braces starting at the open `{` after `animate(`.
function extractAnimateBody(source) {
  const sig = 'animate()';
  const idx = source.indexOf(`function ${sig}`);
  if (idx === -1) {
    // class method shorthand:  animate() {
    const m = source.match(/(?:^|\s)animate\s*\(\s*\)\s*\{/m);
    if (!m) return null;
    return extractBody(source, m.index + m[0].length - 1);
  }
  return extractBody(source, idx + source.slice(idx).indexOf('{'));
}

function extractBody(source, openBraceIdx) {
  let depth = 0;
  for (let i = openBraceIdx; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(openBraceIdx + 1, i);
    }
  }
  return null;
}

describe('Fix A — integration: src/game.js:animate() wires up the new Car pipeline', () => {
  const source = readSrc(GAME_JS);
  const body = extractAnimateBody(source);

  it('animate() body exists and is non-trivial', () => {
    assert.ok(body, 'animate() body must be parseable');
    assert.ok(body.length > 100, `animate() body seems too short (${body.length} chars)`);
  });

  it('animate() invokes playerCar.update()', () => {
    assert.match(body, /this\.playerCar\.update\s*\(/,
      'animate() must call this.playerCar.update(...) to drive the new off-track + checkpoint + collision pipeline');
  });

  it('animate() invokes runCollisionTick() which performs the pairwise AABB sweep', () => {
    // The collision API lives in src/car.js:checkCollision/.applyCollisionResponse.
    // The loop is dispatched via a helper method (runCollisionTick) so the
    // server tick can reuse it.  We accept either the inline call inside
    // animate() OR the helper invocation — both are valid implementations
    // of "the loop calls the collision API".
    assert.match(body, /\b(runCollisionTick|checkCollision)\s*\(/,
      'animate() must invoke the pairwise AABB collision sweep');
  });

  it('runCollisionTick (or equivalent) calls checkCollision + applyCollisionResponse', () => {
    // Pull the runCollisionTick helper body out of game.js and assert it
    // wires up the full Car pipeline.  Skip comments by searching for the
    // method definition rather than the first textual occurrence.
    const defRe = /runCollisionTick\s*\(\s*\)\s*\{/g;
    const m = defRe.exec(source);
    assert.ok(m, 'src/game.js must define runCollisionTick');
    const openIdx = m.index + m[0].length - 1;
    const tickBody = extractBody(source, openIdx);
    assert.ok(tickBody, 'runCollisionTick body must parse');
    assert.match(tickBody, /\.checkCollision\s*\(/, 'runCollisionTick must call .checkCollision');
    assert.match(tickBody, /\.applyCollisionResponse\s*\(/, 'runCollisionTick must call .applyCollisionResponse');
  });

  it('runCollisionTick iterates over multiple cars in a pairwise collision sweep', () => {
    const defRe = /runCollisionTick\s*\(\s*\)\s*\{/g;
    const m = defRe.exec(source);
    assert.ok(m, 'src/game.js must define runCollisionTick');
    const openIdx = m.index + m[0].length - 1;
    const tickBody = extractBody(source, openIdx);
    assert.ok(tickBody, 'runCollisionTick body must parse');
    assert.match(tickBody, /for\s*\([\s\S]*?j\s*=\s*i\s*\+\s*1[\s\S]*?\)/,
      'runCollisionTick must loop pairwise (j = i + 1) over all live cars');
  });
});

describe('Fix A — integration: src/server.js: position handler runs the AABB sweep', () => {
  const source = readSrc(SERVER_JS);

  it('server.js keeps an AABB-aware position snapshot on each websocket', () => {
    assert.match(source, /ws\.lastX\s*=/, 'ws must track lastX');
    assert.match(source, /ws\.lastYaw\s*=/, 'ws must track lastYaw');
    assert.match(source, /ws\.lastZ\s*=/, 'ws must track lastZ');
  });

  it('server.js pairs each player against the other live player in the room', () => {
    // The position handler must iterate over other players in the same
    // room and call resolveServerCollision on each pair.  We just look
    // for the helper name + the iteration pattern + the call.
    assert.match(source, /resolveServerCollision\s*\(/,
      'src/server.js must call resolveServerCollision(...)');
    assert.match(source, /room\.players/,
      'src/server.js must walk room.players');
  });
});
