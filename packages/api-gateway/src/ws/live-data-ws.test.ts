/**
 * Tests for WebSocket live data handler — broadcast and Redis pub/sub wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { registerLiveDataWs, type LiveDataWsDeps } from './live-data-ws.js';

describe('Live Data WebSocket', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('registers /ws/live route', async () => {
    app = Fastify();
    await app.register(websocket);
    await registerLiveDataWs(app, {});
    await app.ready();

    // Verify the route exists by checking the route map
    const routes = app.printRoutes();
    expect(routes).toContain('ws/live');
  });

  it('subscribes to Redis channel when redisSubscriber is provided', async () => {
    const subscribe = vi.fn().mockResolvedValue(undefined);
    const on = vi.fn();
    const unsubscribe = vi.fn().mockResolvedValue(undefined);

    const deps: LiveDataWsDeps = {
      redisSubscriber: { subscribe, on, unsubscribe },
    };

    app = Fastify();
    await app.register(websocket);
    await registerLiveDataWs(app, deps);
    await app.ready();

    expect(subscribe).toHaveBeenCalledWith('signal:changes');
    expect(on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('registers live data listener when onLiveData is provided', async () => {
    const unsubscribe = vi.fn();
    const onLiveData = vi.fn().mockReturnValue(unsubscribe);

    const deps: LiveDataWsDeps = { onLiveData };

    app = Fastify();
    await app.register(websocket);
    await registerLiveDataWs(app, deps);
    await app.ready();

    expect(onLiveData).toHaveBeenCalledWith(expect.any(Function));
  });

  it('cleans up on server close', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const unsubLiveData = vi.fn();

    const deps: LiveDataWsDeps = {
      redisSubscriber: {
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        unsubscribe,
      },
      onLiveData: vi.fn().mockReturnValue(unsubLiveData),
    };

    app = Fastify();
    await app.register(websocket);
    await registerLiveDataWs(app, deps);
    await app.ready();
    await app.close();

    expect(unsubscribe).toHaveBeenCalledWith('signal:changes');
    expect(unsubLiveData).toHaveBeenCalled();
  });
});
