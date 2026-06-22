import { useCallback, useEffect, useRef, useState } from 'react';
import mqtt from 'mqtt';

/**
 * MQTT connection hook for both host and guest, backed by the public
 * test.mosquitto.org broker.
 *
 * Topics (room is the namespace key):
 *   servertunes/<room>/state      host publishes playback state (retained)
 *   servertunes/<room>/host       host presence "online" (retained, LWT clears)
 *   servertunes/<room>/presence   guest heartbeat / bye messages (NOT retained)
 *
 * Guest presence uses heartbeats instead of retained messages so a fresh
 * host never inherits "ghost" listeners from previous sessions.
 *
 * NOTE: this is a public broker. The room password is an app-level check
 * embedded in payloads; anyone subscribed to the topic can read messages.
 *
 * Returns: { status, error, guestCount, send, close }
 */
const BROKER_URL = 'wss://test.mosquitto.org:8081/mqtt';

const stateTopic = (room) => `servertunes/${room}/state`;
const hostTopic = (room) => `servertunes/${room}/host`;
const presenceTopic = (room) => `servertunes/${room}/presence`;

const HEARTBEAT_INTERVAL = 5000; // guests publish "hello" every 5s
const PRESENCE_TIMEOUT = 12000;  // host drops guests after 12s of silence
const SWEEP_INTERVAL = 3000;     // host prunes stale guests every 3s

const newClientId = (role) =>
  `servertunes-${role}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

export default function useConnection({
  role,
  room = 'main',
  password = '',
  onState,
  onHostLeft,
  enabled = true,
}) {
  const [status, setStatus] = useState('idle'); // idle|connecting|connected|error|closed
  const [error, setError] = useState('');
  const [guestCount, setGuestCount] = useState(0);

  const clientRef = useRef(null);
  const onStateRef = useRef(onState);
  const onHostLeftRef = useRef(onHostLeft);
  const closedByUserRef = useRef(false);
  const guestsRef = useRef(new Map()); // host only: clientId -> lastSeen ms
  const heartbeatTimerRef = useRef(null);
  const sweepTimerRef = useRef(null);

  useEffect(() => { onStateRef.current = onState; }, [onState]);
  useEffect(() => { onHostLeftRef.current = onHostLeft; }, [onHostLeft]);

  const send = useCallback((obj) => {
    const c = clientRef.current;
    if (!c || !c.connected || role !== 'host') return false;
    const payload = JSON.stringify({ ...obj, password });
    c.publish(stateTopic(room), payload, { qos: 0, retain: true });
    return true;
  }, [role, room, password]);

  const close = useCallback(() => {
    closedByUserRef.current = true;
    const c = clientRef.current;
    if (!c) { setStatus('closed'); return; }

    if (role === 'host') {
      c.publish(hostTopic(room), '', { qos: 0, retain: true });
      c.publish(stateTopic(room), '', { qos: 0, retain: true });
    } else if (role === 'guest') {
      c.publish(presenceTopic(room), JSON.stringify({ type: 'bye', id: c.options.clientId }));
    }
    c.end(false, () => {
      clientRef.current = null;
      setStatus('closed');
    });
  }, [role, room]);

  useEffect(() => {
    if (!enabled || !role) return undefined;

    closedByUserRef.current = false;
    guestsRef.current = new Map();
    setError('');
    setStatus('connecting');
    setGuestCount(0);

    const clientId = newClientId(role);

    // Only the host needs LWT (to clear its retained 'online' on unclean drop).
    // Guest disappearance is handled by heartbeat timeout on the host side.
    const will = role === 'host'
      ? { topic: hostTopic(room), payload: '', retain: true, qos: 0 }
      : undefined;

    let client;
    try {
      client = mqtt.connect(BROKER_URL, {
        clientId,
        clean: true,
        reconnectPeriod: role === 'guest' ? 3000 : 0,
        connectTimeout: 8000,
        ...(will ? { will } : {}),
      });
    } catch (e) {
      setError(`Could not open broker connection: ${e.message}`);
      setStatus('error');
      return undefined;
    }
    clientRef.current = client;

    client.on('connect', () => {
      if (role === 'host') {
        client.subscribe(presenceTopic(room), { qos: 0 }, (err) => {
          if (err) {
            setError(`Subscribe failed: ${err.message}`);
            setStatus('error');
            return;
          }
          client.publish(hostTopic(room), 'online', { qos: 0, retain: true });
          setStatus('connected');

          // Sweep stale guests on a timer.
          sweepTimerRef.current = setInterval(() => {
            const now = Date.now();
            let changed = false;
            for (const [id, lastSeen] of guestsRef.current) {
              if (now - lastSeen > PRESENCE_TIMEOUT) {
                guestsRef.current.delete(id);
                changed = true;
              }
            }
            if (changed) setGuestCount(guestsRef.current.size);
          }, SWEEP_INTERVAL);
        });
      } else {
        client.subscribe([stateTopic(room), hostTopic(room)], { qos: 0 }, (err) => {
          if (err) {
            setError(`Subscribe failed: ${err.message}`);
            setStatus('error');
            return;
          }
          setStatus('connected');

          const beat = () => {
            if (!client.connected) return;
            client.publish(
              presenceTopic(room),
              JSON.stringify({ type: 'hello', id: clientId }),
              { qos: 0, retain: false },
            );
          };
          beat(); // announce immediately so the host counts us right away
          heartbeatTimerRef.current = setInterval(beat, HEARTBEAT_INTERVAL);
        });
      }
    });

    client.on('reconnect', () => {
      if (!closedByUserRef.current) setStatus('connecting');
    });

    client.on('close', () => {
      if (closedByUserRef.current) return;
      setStatus('connecting');
    });

    client.on('error', (err) => {
      setError(`Broker error: ${err.message || err}`);
      setStatus('error');
    });

    client.on('message', (topic, payload) => {
      const text = payload.toString();

      if (role === 'host') {
        if (topic === presenceTopic(room)) {
          let msg;
          try { msg = JSON.parse(text); } catch { return; }
          if (!msg || !msg.id) return;

          if (msg.type === 'bye') {
            if (guestsRef.current.delete(msg.id)) {
              setGuestCount(guestsRef.current.size);
            }
          } else if (msg.type === 'hello') {
            const isNew = !guestsRef.current.has(msg.id);
            guestsRef.current.set(msg.id, Date.now());
            if (isNew) setGuestCount(guestsRef.current.size);
          }
        }
        return;
      }

      // guest
            if (topic === stateTopic(room)) {
        if (!text) return; // empty retained = host cleared
        let msg;
        try { msg = JSON.parse(text); } catch { return; }
        if ((msg.password || '') !== (password || '')) {
          setError('Wrong room password.');
          setStatus('error');
          return;
        }
        if (onStateRef.current && msg.payload) onStateRef.current(msg.payload);
        return;
      }
      if (topic === hostTopic(room)) {
        if (text !== 'online') {
          if (onHostLeftRef.current) onHostLeftRef.current();
          setError('The host ended the session.');
          setStatus('closed');
        }
      }
    });

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (sweepTimerRef.current) {
        clearInterval(sweepTimerRef.current);
        sweepTimerRef.current = null;
      }
      try {
        if (role === 'host') {
          client.publish(hostTopic(room), '', { qos: 0, retain: true });
          client.publish(stateTopic(room), '', { qos: 0, retain: true });
        } else if (role === 'guest') {
          client.publish(
            presenceTopic(room),
            JSON.stringify({ type: 'bye', id: clientId }),
          );
        }
      } catch { /* ignore */ }
      try { client.end(true); } catch { /* ignore */ }
      clientRef.current = null;
    };
  }, [enabled, role, room, password]);

  return { status, error, guestCount, send, close };
}
