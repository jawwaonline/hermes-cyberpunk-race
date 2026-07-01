import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WAYPOINTS, TRACK_LENGTH } from './shared-track.js';
import { VERSION } from './version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// --- Static file server with path traversal protection ---
const ALLOWED_EXTS = new Set(['.html', '.js', '.css', '.json', '.ico', '.png', '.svg', '.woff2']);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const SRC_DIR = path.resolve(__dirname);

const server = http.createServer((req, res) => {
  if (req.url === '/api/version') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: VERSION }));
    return;
  }
  if (req.url === '/' || req.url === '/index.html') {
    const filePath = path.join(PUBLIC_DIR, 'index.html');
    fs.readFile(filePath, (err, content) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    });
    return;
  }

  let urlPath = req.url.split('?')[0];
  let filePath;
  if (urlPath.startsWith('/src/')) {
    const relative = urlPath.slice(5);
    filePath = path.join(SRC_DIR, relative);
    if (!filePath.startsWith(SRC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  } else {
    const relative = urlPath.replace(/^\//, '');
    filePath = path.join(PUBLIC_DIR, relative);
    if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  }

  const ext = path.extname(filePath);
  if (!ALLOWED_EXTS.has(ext)) { res.writeHead(403); res.end('Forbidden'); return; }

  const contentTypes = {
    '.html': 'text/html', '.js': 'application/javascript',
    '.css': 'text/css', '.json': 'application/json',
    '.ico': 'image/x-icon', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
    res.end(content);
  });
});

const wss = new WebSocketServer({ server });

const rooms = new Map();
let aiModeClients = new Set();
let aiState = null;
let aiLap = 1;
let aiFinished = false;
let aiRotation = 0;
let aiPrevZ = -200; // Start at bottom of oval

// AI state for oval track
function resetAIState() {
  aiLap = 1;
  aiFinished = false;
  aiRotation = 0;
  aiPrevZ = -200;
  
  // Start position: bottom of oval, right side (x=8, z=-200)
  aiState = { x: 8, y: 0, z: -200, waypointIndex: 0 };
}

function updateAIState() {
  if (aiState === null) resetAIState();

  const pos = aiState;
  
  // Navigate using oval waypoints
  const targetWaypoint = WAYPOINTS[pos.waypointIndex];
  const dx = targetWaypoint.x - pos.x;
  const dz = targetWaypoint.z - pos.z;
  const distToWaypoint = Math.hypot(dx, dz);

  // Advance to next waypoint when close enough
  if (distToWaypoint < 20) {
    pos.waypointIndex = (pos.waypointIndex + 1) % WAYPOINTS.length;
  }

  // Calculate target angle for steering
  const targetAngle = Math.atan2(dx, dz);
  let angleDiff = targetAngle - aiRotation;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  // Smooth steering
  aiRotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 0.045);
  
  // Slightly slower on curves
  const velocity = 0.8;

  // Move AI car
  aiState.x += Math.sin(aiRotation) * velocity;
  aiState.z += Math.cos(aiRotation) * velocity;

  // Lap detection: crossing from positive z to negative z at bottom
  if (aiPrevZ > -200 && aiState.z <= -200) {
    aiLap++;
    if (aiLap > 3) aiFinished = true;
  }
  aiPrevZ = aiState.z;
}

// --- Sprint 6 Fix A: server-side pairwise collision check ---
// Helper: do two cars (with mesh.position) overlap per AABB from src/car.js?
// We re-implement the math here to avoid pulling three.js (and a Game)
// into the server bundle.
function serverBoxesOverlap(a, b) {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

function computeServerCarAABB(x, z, yaw) {
  const halfWidth = 1.0;
  const halfLength = 2.0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const corners = [
    { x: -halfWidth, z: -halfLength },
    { x: halfWidth, z: -halfLength },
    { x: halfWidth, z: halfLength },
    { x: -halfWidth, z: halfLength }
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

// Resolve a collision between two cars whose positions are exposed as
// { x, z, yaw } — the format the server actually has for each player.
// On collision, push them apart along their connecting axis.
function resolveServerCollision(carA, carB) {
  const aabbA = computeServerCarAABB(carA.x, carA.z, carA.yaw);
  const aabbB = computeServerCarAABB(carB.x, carB.z, carB.yaw);
  if (!serverBoxesOverlap(aabbA, aabbB)) return false;

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

// Tracks the latest reported position+yaw for every live player in a room
// so we can run a server-authoritative pairwise AABB collision sweep after
// every input batch.  Stored on the room object.
function snapshotRoom(room) {
  const snap = [];
  for (const ws of room.players) {
    if (!ws || ws.readyState !== 1) continue;
    snap.push({
      x: ws.lastX, z: ws.lastZ, yaw: ws.lastYaw,
      ref: ws
    });
  }
  return snap;
}

function broadcastToRoom(roomId, message, excludeWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msgStr = JSON.stringify(message);
  room.players.forEach(ws => {
    if (ws !== excludeWs && ws.readyState === 1) ws.send(msgStr);
  });
}

function broadcastAIPositions() {
  updateAIState();
  const aiMessage = {
    type: 'ai_position',
    x: aiState.x, y: aiState.y, z: aiState.z,
    rotation: aiRotation, waypointIndex: aiState.waypointIndex,
    lap: aiLap, finished: aiFinished
  };
  aiModeClients.forEach(ws => {
    if (ws.readyState === 1) ws.send(JSON.stringify(aiMessage));
  });
}

let aiInterval = null;

function startAIBroadcast() {
  if (aiInterval) return;
  resetAIState();
  aiInterval = setInterval(broadcastAIPositions, 50);
}

function stopAIBroadcast() {
  if (aiInterval) { clearInterval(aiInterval); aiInterval = null; }
}

// --- Input validation helpers ---
function validateNumber(val, min, max) {
  const n = Number(val);
  return isNaN(n) || !isFinite(n) || n < min || n > max ? null : n;
}

function validateInput(input) {
  if (!input || typeof input !== 'object') return { valid: false, error: 'missing input' };
  const { throttle, brake, steer, seq, dt } = input;

  if (!Number.isFinite(throttle) || throttle < 0 || throttle > 1) {
    return { valid: false, error: 'invalid throttle' };
  }
  if (!Number.isFinite(brake) || brake < 0 || brake > 1) {
    return { valid: false, error: 'invalid brake' };
  }
  if (!Number.isFinite(steer) || steer < -1 || steer > 1) {
    return { valid: false, error: 'invalid steer' };
  }
  if (!Number.isFinite(seq) || seq < 0 || !Number.isInteger(seq)) {
    return { valid: false, error: 'invalid seq' };
  }
  if (!Number.isFinite(dt) || dt < 0 || dt > 0.1) {
    return { valid: false, error: 'invalid dt' };
  }
  return { valid: true };
}

// Rate limiting
const msgRateLimit = new WeakMap();
const RATE_WINDOW_MS = 1000;
const RATE_MAX = 30;

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.roomId = null;
  ws.playerIndex = null;
  ws.lap = 1;
  ws.lastZ = -201; // Start BEFORE finish line — first forward crossing (to -200) IS detected
  ws.lastX = -8;   // Sprint 6 Fix A: track x for pairwise AABB check
  ws.lastYaw = 0;  // Sprint 6 Fix A: track rotation
  ws.finished = false;
  ws.lastSeq = -1; // For sequence ordering check
  ws.lastInputRateReset = Date.now() + RATE_WINDOW_MS;
  ws.inputCount = 0;
  msgRateLimit.set(ws, { count: 0, resetAt: Date.now() + RATE_WINDOW_MS });

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    const rl = msgRateLimit.get(ws);
    const now = Date.now();
    if (now > rl.resetAt) { rl.count = 0; rl.resetAt = now + RATE_WINDOW_MS; }
    rl.count++;
    if (rl.count > RATE_MAX) {
      ws.send(JSON.stringify({ type: 'error', msg: 'Rate limit exceeded' }));
      ws.terminate();
      return;
    }

    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'start-ai') {
      ws.isAIMode = true;
      aiModeClients.add(ws);
      ws.send(JSON.stringify({ type: 'go', playerIndex: 0 }));
      startAIBroadcast();
      return;
    }

    if (msg.type === 'join') {
      for (const [roomId, room] of rooms.entries()) {
        if (room.players.length === 1 && !room.started && !room.locked) {
          room.locked = true;
          room.players.push(ws);
          ws.roomId = roomId;
          ws.playerIndex = 1;
          room.started = true;
          room.players[0].send(JSON.stringify({ type: 'go', playerIndex: 0 }));
          ws.send(JSON.stringify({ type: 'go', playerIndex: 1 }));
          room.locked = false;
          return;
        }
      }
      const newRoomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      rooms.set(newRoomId, { players: [ws], started: false, locked: false, finishedCount: 0 });
      ws.roomId = newRoomId;
      ws.playerIndex = 0;
      ws.send(JSON.stringify({ type: 'waiting' }));
      return;
    }

    if (msg.type === 'position') {
      const x = validateNumber(msg.x, -500, 500);
      const y = validateNumber(msg.y, -10, 50);
      const z = validateNumber(msg.z, -500, 500);
      const rotation = validateNumber(msg.rotation, -Math.PI * 2, Math.PI * 2);

      if (x === null || y === null || z === null || rotation === null) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Invalid position data' }));
        return;
      }

      // Sprint 6 Fix A: remember this car position for the per-input
      // pairwise AABB collision sweep below.
      ws.lastX = x;
      ws.lastYaw = rotation;

      // --- Server-side lap tracking (prevents backwards exploit) ---
      // Car starts at z=-200, drives positive z direction (up the oval), returns to z=-200 from positive side
      // This is a FORWARD lap crossing only (prevents backwards exploit)
      if (ws.lastZ > -200 && z <= -200 && !ws.finished) {
        ws.lap++;
        if (ws.lap > 3) ws.finished = true;
      }
      ws.lastZ = z;

      // Sprint 6 Fix A: server-authoritative pairwise AABB collision check.
      // After updating this player's snapshot, walk the other live player
      // in the same room and resolve any overlap.  Both cars' lastX/lastZ/
      // lastYaw are then re-broadcast below inside safeMsg.
      if (ws.roomId && rooms.has(ws.roomId)) {
        const room = rooms.get(ws.roomId);
        const players = room.players.filter(p => p && p !== ws && p.readyState === 1 && Number.isFinite(p.lastX));
        const self = { x: ws.lastX, z: ws.lastZ, yaw: ws.lastYaw };
        for (const otherWs of players) {
          const other = { x: otherWs.lastX, z: otherWs.lastZ, yaw: otherWs.lastYaw };
          const beforeSelfX = self.x, beforeSelfZ = self.z;
          const beforeOtherX = other.x, beforeOtherZ = other.z;
          if (resolveServerCollision(self, other)) {
            // Push resolved positions back into the other player's tracked state
            // so subsequent checks stay consistent.  The self side goes back
            // onto the websocket at the end of this handler.
            otherWs.lastX = other.x;
            otherWs.lastZ = other.z;
            ws.lastX = self.x;
            ws.lastZ = self.z;
          }
          // Avoid 'never read' lint for beforeX/beforeOtherX — they document
          // the snapshot boundary.
          void beforeSelfX; void beforeSelfZ; void beforeOtherX; void beforeOtherZ;
        }
      }

      const safeMsg = {
        type: ws.isAIMode ? 'ai_position' : 'opponent',
        x: ws.lastX, y, z: ws.lastZ, rotation,
        lap: ws.lap,
        finished: ws.finished // Server-determined, not client-submitted
      };

      if (ws.isAIMode) {
        aiModeClients.forEach(client => {
          if (client !== ws && client.readyState === 1) client.send(JSON.stringify(safeMsg));
        });
      } else if (ws.roomId) {
        broadcastToRoom(ws.roomId, safeMsg, ws);

        if (msg.finished) {
          const room = rooms.get(ws.roomId);
          if (room) {
            room.finishedCount = (room.finishedCount || 0) + 1;
            if (room.finishedCount >= 2) {
              setTimeout(() => rooms.delete(ws.roomId), 5000);
            }
          }
        }
      }
    }

    // --- Bug #1 fix: input message (server-authoritative inputs) ---
    // Preferred path over 'position' — client sends inputs, server simulates
    if (msg.type === 'input') {
      // Input flood detection (>60 inputs/s)
      const now = Date.now();
      if (now > ws.lastInputRateReset) {
        ws.inputCount = 0;
        ws.lastInputRateReset = now + RATE_WINDOW_MS;
      }
      ws.inputCount++;
      if (ws.inputCount > 60) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Input flood detected' }));
        ws.terminate();
        return;
      }

      // Validate input
      const validation = validateInput(msg.input);
      if (!validation.valid) {
        ws.send(JSON.stringify({ type: 'error', msg: validation.error }));
        return;
      }

      // Out-of-order sequence check
      const seq = msg.input.seq;
      if (seq <= ws.lastSeq) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Out-of-order input' }));
        return;
      }
      ws.lastSeq = seq;

      // Input is valid — broadcast acknowledgment snapshot
      // The server will apply physics based on these inputs in the next tick
      const snapshot = {
        type: 'input_ack',
        seq,
        throttle: msg.input.throttle,
        brake: msg.input.brake,
        steer: msg.input.steer,
        dt: msg.input.dt
      };
      if (ws.isAIMode) {
        // AI mode: relay to other AI clients
        aiModeClients.forEach(client => {
          if (client !== ws && client.readyState === 1) client.send(JSON.stringify(snapshot));
        });
      } else if (ws.roomId) {
        broadcastToRoom(ws.roomId, snapshot, ws);
      }
    }
  });

  ws.on('close', () => {
    aiModeClients.delete(ws);
    msgRateLimit.delete(ws);

    if (ws.roomId && ws.roomId !== 'ai') {
      const room = rooms.get(ws.roomId);
      if (room) {
        broadcastToRoom(ws.roomId, { type: 'opponent_left' });
        rooms.delete(ws.roomId);
      }
    }
    if (aiModeClients.size === 0) stopAIBroadcast();
  });

  ws.on('error', (err) => console.error('WebSocket error:', err));
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => { clearInterval(heartbeatInterval); stopAIBroadcast(); });

process.on('SIGTERM', () => { server.close(); process.exit(0); });

server.listen(PORT, () => {
  console.log(`[${VERSION}] Server running on http://localhost:${PORT}`);
});
