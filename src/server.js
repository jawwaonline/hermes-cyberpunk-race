import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WAYPOINTS, TRACK_LENGTH } from './shared-track.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// --- Static file server with path traversal protection ---
const ALLOWED_EXTS = new Set(['.html', '.js', '.css', '.json', '.ico', '.png', '.svg', '.woff2']);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const SRC_DIR = path.resolve(__dirname);

const server = http.createServer((req, res) => {
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
    rotation: aiRotation, lap: aiLap, finished: aiFinished
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

// Rate limiting
const msgRateLimit = new WeakMap();
const RATE_WINDOW_MS = 1000;
const RATE_MAX = 30;

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.roomId = null;
  ws.playerIndex = null;
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
      ws.roomId = 'ai';
      aiModeClients.add(ws);
      ws.send(JSON.stringify({ type: 'go', playerIndex: 0 }));
      startAIBroadcast();
      return;
    }

    if (msg.type === 'join') {
      for (const [roomId, room] of rooms.entries()) {
        if (room.players.length === 1 && !room.started) {
          room.players.push(ws);
          ws.roomId = roomId;
          ws.playerIndex = 1;
          room.started = true;
          room.players[0].send(JSON.stringify({ type: 'go', playerIndex: 0 }));
          ws.send(JSON.stringify({ type: 'go', playerIndex: 1 }));
          return;
        }
      }
      const newRoomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      rooms.set(newRoomId, { players: [ws], started: false });
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
      const lap = validateNumber(msg.lap, 0, 10);

      if (x === null || y === null || z === null || rotation === null || lap === null) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Invalid position data' }));
        return;
      }

      const safeMsg = { type: 'opponent', x, y, z, rotation, lap, finished: false };

      if (ws.roomId === 'ai') {
        aiModeClients.forEach(client => {
          if (client !== ws && client.readyState === 1) client.send(JSON.stringify(safeMsg));
        });
      } else if (ws.roomId) {
        broadcastToRoom(ws.roomId, safeMsg, ws);
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
  console.log(`Server running on http://localhost:${PORT}`);
});
