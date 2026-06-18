import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * WebSocket connection hook for both host and guest.
 *
 * Host:  opens ws://localhost:<port>, registers as host, and uses send()
 *        to broadcast playback state.
 * Guest: opens ws://<host>:<port>, registers as guest, and receives state
 *        through the onState callback.
 *
 * Params:
 *   role        'host' | 'guest'
 *   host        hostname/ip (guests). Hosts always use localhost.
 *   port        number
 *   room        room name
 *   password    room password
 *   onState     (payload) => void   called when a state message arrives (guest)
 *   enabled     when false the socket stays closed
 *
 * Returns: { status, error, guestCount, send, close }
 */
export default function useConnection({
  role,
  host,
  port,
  room = 'main',
  password = '',
  onState,
  onHostLeft,
  enabled = true,
}) {
  const [status, setStatus] = useState('idle'); // idle|connecting|connected|error|closed
  const [error, setError] = useState('');
  const [guestCount, setGuestCount] = useState(0);

  const wsRef = useRef(null);
  const onStateRef = useRef(onState);
  const onHostLeftRef = useRef(onHostLeft);
  const reconnectRef = useRef(null);
  const closedByUserRef = useRef(false);

  // Keep callback refs fresh without re-opening the socket.
  useEffect(() => { onStateRef.current = onState; }, [onState]);
  useEffect(() => { onHostLeftRef.current = onHostLeft; }, [onHostLeft]);

  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }, []);

  const close = useCallback(() => {
    closedByUserRef.current = true;
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }
    setStatus('closed');
  }, []);

  useEffect(() => {
    if (!enabled || !role) return undefined;
    if (role === 'guest' && !host) return undefined;

    closedByUserRef.current = false;
    const target = role === 'host' ? 'localhost' : host;
    const url = `ws://${target}:${port}`;

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setStatus('connecting');
      setError('');

      let ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        setError(`Could not open connection: ${e.message}`);
        setStatus('error');
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'register', role, room, password }));
      };

      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        switch (msg.type) {
          case 'registered':
            setStatus('connected');
            if (typeof msg.guestCount === 'number') setGuestCount(msg.guestCount);
            break;
          case 'guestCount':
            setGuestCount(msg.count);
            break;
          case 'state':
            if (onStateRef.current) onStateRef.current(msg.payload);
            break;
          case 'hostLeft':
            if (onHostLeftRef.current) onHostLeftRef.current();
            setError('The host ended the session.');
            setStatus('closed');
            break;
          case 'error':
            setError(msg.message || 'Server error');
            setStatus('error');
            break;
          default:
            break;
        }
      };

      ws.onerror = () => {
        setError(
          role === 'host'
            ? `Cannot reach the sync server at ${url}. Did you run "npm run server"?`
            : `Cannot reach the host at ${url}. Check the IP, port, and that the host is online.`,
        );
        setStatus('error');
      };

      ws.onclose = () => {
        if (closedByUserRef.current || cancelled) return;
        setStatus('closed');
        // Guests try to reconnect a few seconds later (host may restart).
        if (role === 'guest') {
          reconnectRef.current = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
    };
  }, [enabled, role, host, port, room, password]);

  return { status, error, guestCount, send, close };
}
