import { setTimeout as sleep } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { RenderQueue, RenderTimeout } from './render-queue.js';

// add-walkin-visit-checkout task 9.6 — ADR-013 decision 7: one render at a time, interactive renders
// ahead of queued background ones, a timeout per render after which the queue goes on.
describe('RenderQueue', () => {
  it('runs one render at a time', async () => {
    const queue = new RenderQueue();
    let active = 0;
    let most = 0;
    const work = async () => {
      active += 1;
      most = Math.max(most, active);
      await sleep(20);
      active -= 1;
    };
    await Promise.all(
      [1, 2, 3, 4].map(() => queue.run(work, { priority: 'background', timeoutMs: 1000 })),
    );
    expect(most).toBe(1);
  });

  it('an interactive render overtakes the queued background renders', async () => {
    const queue = new RenderQueue();
    const order: string[] = [];
    const job = (name: string) => async () => {
      order.push(name);
      await sleep(10);
    };
    const all = [
      queue.run(job('job 1'), { priority: 'background', timeoutMs: 1000 }),
      queue.run(job('job 2'), { priority: 'background', timeoutMs: 1000 }),
      queue.run(job('job 3'), { priority: 'background', timeoutMs: 1000 }),
      queue.run(job('request'), { priority: 'interactive', timeoutMs: 1000 }),
    ];
    await Promise.all(all);
    // job 1 was already running; the request goes before jobs 2 and 3.
    expect(order).toStrictEqual(['job 1', 'request', 'job 2', 'job 3']);
  });

  it('a render past its timeout is refused, cleaned up, and the queue goes on', async () => {
    const queue = new RenderQueue();
    let cleaned = false;
    const slow = queue.run(() => sleep(500), {
      priority: 'background',
      timeoutMs: 50,
      onTimeout: () => {
        cleaned = true;
        return Promise.resolve();
      },
    });
    const next = queue.run(() => Promise.resolve('next'), {
      priority: 'background',
      timeoutMs: 1000,
    });
    await expect(slow).rejects.toBeInstanceOf(RenderTimeout);
    expect(cleaned).toBe(true);
    await expect(next).resolves.toBe('next');
  });

  it('a failing render does not stop the queue', async () => {
    const queue = new RenderQueue();
    const bad = queue.run(() => Promise.reject(new Error('crash')), {
      priority: 'interactive',
      timeoutMs: 1000,
    });
    const good = queue.run(() => Promise.resolve(1), { priority: 'background', timeoutMs: 1000 });
    await expect(bad).rejects.toThrow('crash');
    await expect(good).resolves.toBe(1);
  });
});
