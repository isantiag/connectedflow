/**
 * WebSocket handler for live data streaming and signal change notifications.
 *
 * - Streams live data events from hardware adapters to connected clients
 * - Broadcasts signal change notifications via Redis pub/sub
 */

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveDataWsDeps {
  /** Subscribe to live data events. Returns an unsubscribe function. */
  onLiveData?: (listener: (event: unknown) => void) => () => void;
  /** Redis-backed pub/sub for signal change notifications. */
  redisSubscriber?: {
    subscribe(channel: string): Promise<void>;
    on(event: 'message', handler: (channel: string, message: string) => void): void;
    unsubscribe(channel: string): Promise<void>;
  };
}

const SIGNAL_CHANGE_CHANNEL = 'signal:changes';

// ---------------------------------------------------------------------------
// WebSocket route registration
// ---------------------------------------------------------------------------

export async function registerLiveDataWs(
  app: FastifyInstance,
  deps: LiveDataWsDeps,
): Promise<void> {
  const clients = new Set<WebSocket>();

  // Subscribe to Redis signal change channel if available
  if (deps.redisSubscriber) {
    await deps.redisSubscriber.subscribe(SIGNAL_CHANGE_CHANNEL);
    deps.redisSubscriber.on('message', (_channel: string, message: string) => {
      broadcast(clients, { type: 'signal:change', data: JSON.parse(message) });
    });
  }

  // Subscribe to live data events if available
  let unsubLiveData: (() => void) | undefined;
  if (deps.onLiveData) {
    unsubLiveData = deps.onLiveData((event) => {
      broadcast(clients, { type: 'live:data', data: event });
    });
  }

  app.get('/ws/live', { websocket: true }, (socket: WebSocket) => {
    clients.add(socket);

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Clients can send subscription filters (future extension)
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
    });
  });

  // Cleanup on server close
  app.addHook('onClose', async () => {
    unsubLiveData?.();
    if (deps.redisSubscriber) {
      await deps.redisSubscriber.unsubscribe(SIGNAL_CHANGE_CHANNEL);
    }
    for (const client of clients) {
      client.close();
    }
    clients.clear();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function broadcast(clients: Set<WebSocket>, message: unknown): void {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(payload);
    }
  }
}
