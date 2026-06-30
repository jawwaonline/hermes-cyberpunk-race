// Stub server — full implementation via OpenCode
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3000;
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    console.log('received:', data.toString());
    ws.send('pong');
  });
  ws.send('connected');
});

console.log(`WS server running on ws://localhost:${PORT}`);
