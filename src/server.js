import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? 'index.html' : req.url.replace(/^\//, '');

  // Route /src/* to src/ and /lib/* to lib/
  if (filePath.startsWith('src/')) {
    filePath = path.join(__dirname, filePath);
  } else if (filePath.startsWith('lib/')) {
    filePath = path.join(__dirname, '..', filePath);
  } else {
    filePath = path.join(__dirname, '..', 'public', filePath);
  }

  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
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

const TRACK_LENGTH = 300;
const WAYPOINTS = [];
for (let i = 0; i < TRACK_LENGTH; i += 25) {
  WAYPOINTS.push({ x: 0, z: i - TRACK_LENGTH / 2 });
}
WAYPOINTS.push({ x: 10, z: TRACK_LENGTH / 2 });
for (let i = 0; i <= 20; i++) {
  const angle = (Math.PI * i) / 20;
  WAYPOINTS.push({
    x: 10 + Math.cos(angle) * 12,
    z: TRACK_LENGTH / 2 + Math.sin(angle) * 12
  });
}
WAYPOINTS.push({ x: 0, z: TRACK_LENGTH / 2 });
for (let i = 0; i < TRACK_LENGTH; i += 25) {
  WAYPOINTS.push({ x: 0, z: TRACK_LENGTH / 2 - i });
}
WAYPOINTS.push({ x: -10, z: -TRACK_LENGTH / 2 });
for (let i = 0; i <= 20; i++) {
  const angle = (Math.PI * i) / 20;
  WAYPOINTS.push({
    x: -10 + Math.cos(angle + Math.PI) * 12,
    z: -TRACK_LENGTH / 2 + Math.sin(angle + Math.PI) * 12
  });
}
WAYPOINTS.push({ x: 0, z: -TRACK_LENGTH / 2 });

function updateAIState() {
  if (aiState === null) {
    aiState = { x: 5, y: 0, z: -140, waypointIndex: 0 };
  }

  const pos = aiState;
  const target = WAYPOINTS[pos.waypointIndex];
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const distToWaypoint = Math.hypot(dx, dz);

  if (distToWaypoint < 5) {
    pos.waypointIndex = (pos.waypointIndex + 1) % WAYPOINTS.length;
  }

  const targetAngle = Math.atan2(dx, dz);
  let angleDiff = targetAngle - aiRotation;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  aiRotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 0.045);
  const velocity = 0.8;

  aiState.x += Math.sin(aiRotation) * velocity;
  aiState.z += Math.cos(aiRotation) * velocity;

  if (aiState.z >= 0 && aiState.prevZ < 0) {
    aiLap++;
    if (aiLap > 3) {
      aiFinished = true;
    }
  }
  aiState.prevZ = aiState.z;
}

function broadcastToRoom(roomId, message, excludeWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  const msgStr = JSON.stringify(message);
  room.players.forEach(ws => {
    if (ws !== excludeWs && ws.readyState === 1) {
      ws.send(msgStr);
    }
  });
}

function broadcastAIPositions() {
  updateAIState();

  const aiMessage = JSON.stringify({
    type: 'ai_position',
    x: aiState.x,
    y: aiState.y,
    z: aiState.z,
    rotation: aiRotation,
    lap: aiLap,
    finished: aiFinished
  });

  aiModeClients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(aiMessage);
    }
  });
}

let aiInterval = null;

function startAIBroadcast() {
  if (aiInterval) return;
  aiLap = 1;
  aiFinished = false;
  aiRotation = 0;
  aiState = { x: 5, y: 0, z: -140, waypointIndex: 0 };
  aiInterval = setInterval(broadcastAIPositions, 50);
}

function stopAIBroadcast() {
  if (aiInterval) {
    clearInterval(aiInterval);
    aiInterval = null;
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.roomId = null;
  ws.playerIndex = null;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'start-ai') {
        ws.roomId = 'ai';
        aiModeClients.add(ws);
        ws.send(JSON.stringify({ type: 'go', playerIndex: 0 }));
        startAIBroadcast();
        return;
      }

      if (msg.type === 'join') {
        let assigned = false;

        for (const [roomId, room] of rooms.entries()) {
          if (room.players.length === 1 && !room.started) {
            room.players.push(ws);
            ws.roomId = roomId;
            ws.playerIndex = 1;
            room.started = true;

            room.players[0].send(JSON.stringify({ type: 'go', playerIndex: 0 }));
            ws.send(JSON.stringify({ type: 'go', playerIndex: 1 }));
            assigned = true;
            break;
          }
        }

        if (!assigned) {
          const newRoomId = `room_${Date.now()}`;
          rooms.set(newRoomId, {
            players: [ws],
            started: false
          });
          ws.roomId = newRoomId;
          ws.playerIndex = 0;
          ws.send(JSON.stringify({ type: 'waiting' }));
        }
        return;
      }

      if (msg.type === 'position') {
        if (ws.roomId === 'ai') {
          aiModeClients.forEach(client => {
            if (client !== ws && client.readyState === 1) {
              client.send(JSON.stringify({
                type: 'opponent',
                x: msg.x,
                y: msg.y,
                z: msg.z,
                rotation: msg.rotation,
                lap: msg.lap,
                finished: msg.finished
              }));
            }
          });
        } else if (ws.roomId) {
          broadcastToRoom(ws.roomId, {
            type: 'opponent',
            x: msg.x,
            y: msg.y,
            z: msg.z,
            rotation: msg.rotation,
            lap: msg.lap,
            finished: msg.finished
          }, ws);
        }
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });

  ws.on('close', () => {
    aiModeClients.delete(ws);

    if (ws.roomId && ws.roomId !== 'ai') {
      const room = rooms.get(ws.roomId);
      if (room) {
        broadcastToRoom(ws.roomId, { type: 'opponent_left' });
        if (room.players.length <= 2) {
          rooms.delete(ws.roomId);
        }
      }
    }

    if (aiModeClients.size === 0) {
      stopAIBroadcast();
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
  stopAIBroadcast();
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
