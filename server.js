import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = parseInt(process.env.PORT || '3000', 10);

await app.prepare();

const server = createServer(async (req, res) => {
  try {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  } catch (err) {
    console.error('Error:', err);
    res.statusCode = 500;
    res.end('Error');
  }
});

const wss = new WebSocketServer({ noServer: true });

// Track connected users: userId -> ws
const users = new Map();

server.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url);

  // Only handle our calls WebSocket
  if (pathname === '/api/ws/calls') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      let userId = null;

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          
          if (msg.type === 'register') {
            userId = msg.payload.studentId;
            users.set(userId, ws);
            console.log(`[WS] ${userId} registered (${users.size} online)`);
            
            ws.send(JSON.stringify({ type: 'registered' }));
            broadcastPresence();
          } 
          else if (msg.type === 'offer') {
            const { calleeId, callerId, callId, offer, callerName } = msg.payload;
            const calleeWs = users.get(calleeId);
            
            console.log(`[WS] Offer from ${callerId} to ${calleeId}:`, calleeWs ? 'forwarding' : 'CALLEE NOT ONLINE');
            
            if (calleeWs && calleeWs.readyState === 1) {
              // Transform offer into incoming-call for receiver
              calleeWs.send(JSON.stringify({
                type: 'incoming-call',
                payload: { callId, callerId, callerName, offer }
              }));
            }
          } 
          else if (msg.type === 'answer') {
            const { callerId } = msg.payload;
            const callerWs = users.get(callerId);
            
            console.log(`[WS] Answer to ${callerId}:`, callerWs ? 'forwarding' : 'CALLER NOT ONLINE');
            
            if (callerWs && callerWs.readyState === 1) {
              callerWs.send(JSON.stringify(msg));
            } else {
              console.error(`[WS] Cannot forward answer - caller ws state:`, callerWs?.readyState);
            }
          } 
          else if (msg.type === 'candidate') {
            const { from } = msg.payload;
            
            // Forward to ALL other users
            let forwarded = 0;
            for (const [id, ws] of users.entries()) {
              if (id !== from && ws.readyState === 1) {
                ws.send(JSON.stringify(msg));
                forwarded++;
              }
            }
            if (forwarded === 0) {
              console.warn(`[WS] No peers to forward candidate from ${from}`);
            }
          }
          else if (msg.type === 'end') {
            const { callId } = msg.payload;
            for (const ws of users.values()) {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify(msg));
              }
            }
          }
        } catch (err) {
          console.error('[WS] Error:', err.message);
        }
      });

      ws.on('close', () => {
        if (userId) {
          users.delete(userId);
          console.log(`[WS] ${userId} disconnected (${users.size} online)`);
          broadcastPresence();
        }
      });

      ws.on('error', (err) => console.error('[WS] Error:', err.message));
    });
  } else {
    // Let all other upgrades (including HMR) fail gracefully
    socket.destroy();
  }
});

function broadcastPresence() {
  const online = Array.from(users.keys()).map(id => ({ id, status: 'active' }));
  const msg = JSON.stringify({ type: 'presence-update', online });
  
  for (const ws of users.values()) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

server.listen(PORT, () => {
  console.log(`[Server] Ready on http://localhost:${PORT}`);
  console.log('[WebSocket] Listening on ws://localhost:3000/api/ws/calls');
});

