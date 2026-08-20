import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Bind dynamically to Render's PORT environment variable
const PORT = parseInt(process.env.PORT || '3000', 10);

await app.prepare();

const server = createServer(async (req, res) => {
  try {
    const parsedUrl = parse(req.url, true);

    // Endpoint for uptime monitors (UptimeRobot, cron-job.org) to keep Render awake
    if (parsedUrl.pathname === '/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      return res.end('OK');
    }

    await handle(req, res, parsedUrl);
  } catch (err) {
    console.error('Error:', err);
    res.statusCode = 500;
    res.end('Error');
  }
});

const wss = new WebSocketServer({ noServer: true });

// Track connected users: userId -> { ws, name, isAlive }
const users = new Map();

server.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url);

  // Only handle our calls WebSocket
  if (pathname === '/api/ws/calls') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      let userId = null;
      let userName = null;

      // Mark connection as alive for heartbeat check
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);

          if (msg.type === 'register') {
            userId = msg.payload.studentId;
            userName = msg.payload.studentName || msg.payload.studentId;
            users.set(userId, { ws, name: userName });
            console.log(`[WS] ${userId} (${userName}) registered (${users.size} online)`);

            ws.send(JSON.stringify({ type: 'registered' }));
            broadcastPresence();
          } 
          else if (msg.type === 'offer') {
            const { calleeId, callerId, callId, offer, callerName, callType } = msg.payload;
            const calleeUser = users.get(calleeId);
            const calleeWs = calleeUser?.ws;

            console.log(`[WS] Offer from ${callerId} to ${calleeId}:`, calleeWs ? 'forwarding' : 'CALLEE NOT ONLINE');

            if (calleeWs && calleeWs.readyState === WebSocket.OPEN) {
              calleeWs.send(JSON.stringify({
                type: 'incoming-call',
                payload: { callId, callerId, callerName, offer, callType }
              }));
            }
          } 
          else if (msg.type === 'answer') {
            const { callerId } = msg.payload;
            const callerUser = users.get(callerId);
            const callerWs = callerUser?.ws;

            console.log(`[WS] Answer to ${callerId}:`, callerWs ? 'forwarding' : 'CALLER NOT ONLINE');

            if (callerWs && callerWs.readyState === WebSocket.OPEN) {
              callerWs.send(JSON.stringify(msg));
            } else {
              console.error(`[WS] Cannot forward answer - caller ws state:`, callerWs?.readyState);
            }
          } 
          else if (msg.type === 'candidate') {
            const { from } = msg.payload;

            let forwarded = 0;
            for (const [id, user] of users.entries()) {
              if (id !== from && user.ws.readyState === WebSocket.OPEN) {
                user.ws.send(JSON.stringify(msg));
                forwarded++;
              }
            }
            if (forwarded === 0) {
              console.warn(`[WS] No peers to forward candidate from ${from}`);
            }
          } 
          else if (msg.type === 'end') {
            for (const user of users.values()) {
              if (user.ws.readyState === WebSocket.OPEN) {
                user.ws.send(JSON.stringify(msg));
              }
            }
          }
        } catch (err) {
          console.error('[WS] Error parsing message:', err.message);
        }
      });

      ws.on('close', () => {
        if (userId) {
          users.delete(userId);
          console.log(`[WS] ${userId} disconnected (${users.size} online)`);
          broadcastPresence();
        }
      });

      ws.on('error', (err) => console.error('[WS] Socket error:', err.message));
    });
  } else {
    socket.destroy();
  }
});

function broadcastPresence() {
  const online = Array.from(users.entries()).map(([id, user]) => ({
    id,
    name: user.name,
    status: 'active'
  }));
  const msg = JSON.stringify({ type: 'presence-update', online });

  for (const user of users.values()) {
    if (user.ws.readyState === WebSocket.OPEN) user.ws.send(msg);
  }
}

// Heartbeat ping/pong interval to terminate dead connections
const interval = setInterval(() => {
  for (const [id, user] of users.entries()) {
    if (user.ws.isAlive === false) {
      user.ws.terminate();
      users.delete(id);
      broadcastPresence();
      continue;
    }
    user.ws.isAlive = false;
    user.ws.ping();
  }
}, 30000);

wss.on('close', () => clearInterval(interval));

// '0.0.0.0' binds to all network interfaces required by Render
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Ready on port ${PORT}`);
});