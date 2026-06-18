/**
 * ServerTunes sync server.
 *
 * This is the process the HOST runs on their machine. It listens on a TCP port
 * (the one you port-forward) and relays playback state from the host's browser
 * to every connected invitee. It never streams audio/video bytes itself - it
 * only relays small JSON "what is playing and where" messages so that every
 * client can play the same YouTube video locally, in sync.
 *
 * Run with:  npm run server         (defaults to port 8080)
 *            PORT=9000 npm run server
 *
 * Message protocol (JSON over WebSocket):
 *   client -> server: { type: 'register', role: 'host'|'guest', room, password }
 *   host   -> server: { type: 'state',  payload: {...} }
 *   server -> client: { type: 'registered', role, guestCount }
 *   server -> guest:  { type: 'state', payload }
 *   server -> host:   { type: 'guestCount', count }
 *   server -> client: { type: 'error', message }
 *   server -> guest:  { type: 'hostLeft' }
 */

import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8080;

const wss = new WebSocketServer({ port: PORT });

/**
 * rooms: Map<roomName, {
 *   password: string,
 *   host: WebSocket | null,
 *   guests: Set<WebSocket>,
 *   lastState: object | null,
 * }>
 */
const rooms = new Map();

function getRoom(name) {
  if (!rooms.has(name)) {
    rooms.set(name, { password: '', host: null, guests: new Set(), lastState: null });
  }
  return rooms.get(name);
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcastGuestCount(room) {
  send(room.host, { type: 'guestCount', count: room.guests.size });
}

wss.on('connection', (ws) => {
  ws.meta = { role: null, room: null };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: 'Invalid JSON' });
    }

    if (msg.type === 'register') {
      const roomName = (msg.room || 'main').trim() || 'main';
      const room = getRoom(roomName);

      if (msg.role === 'host') {
        // First host to register claims the room and sets its password.
        if (room.host && room.host.readyState === room.host.OPEN) {
          return send(ws, { type: 'error', message: 'A host is already running this room.' });
        }
        room.host = ws;
        room.password = msg.password || '';
        ws.meta = { role: 'host', room: roomName };
        send(ws, { type: 'registered', role: 'host', guestCount: room.guests.size });
        return;
      }

      // guest
      if ((room.password || '') !== (msg.password || '')) {
        return send(ws, { type: 'error', message: 'Wrong room password.' });
      }
      room.guests.add(ws);
      ws.meta = { role: 'guest', room: roomName };
      send(ws, { type: 'registered', role: 'guest', guestCount: room.guests.size });
      // Bring the new guest up to date immediately.
      if (room.lastState) send(ws, { type: 'state', payload: room.lastState });
      broadcastGuestCount(room);
      return;
    }

    if (msg.type === 'state') {
      const room = rooms.get(ws.meta.room);
      if (!room || ws.meta.role !== 'host') return;
      room.lastState = msg.payload;
      for (const guest of room.guests) {
        send(guest, { type: 'state', payload: msg.payload });
      }
      return;
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.meta.room);
    if (!room) return;

    if (ws.meta.role === 'host') {
      room.host = null;
      room.lastState = null;
      for (const guest of room.guests) send(guest, { type: 'hostLeft' });
    } else if (ws.meta.role === 'guest') {
      room.guests.delete(ws);
      broadcastGuestCount(room);
    }

    // Clean up empty rooms.
    if (!room.host && room.guests.size === 0) {
      rooms.delete(ws.meta.room);
    }
  });
});

wss.on('listening', () => {
  console.log(`ServerTunes sync server listening on ws://0.0.0.0:${PORT}`);
  console.log('Invitees connect using your public IP and this port.');
});
