import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestScheduler } from '../src/services/requestScheduler.ts';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function controlled() {
  const calls: Array<{
    name: string;
    signal: AbortSignal;
    resolve: (value: string) => void;
    reject: (reason: unknown) => void;
  }> = [];
  let live = 0;
  let maxLive = 0;
  const task =
    (name: string, ignoreAbort = false) =>
    (signal: AbortSignal) => {
      live += 1;
      maxLive = Math.max(maxLive, live);
      let abort = () => {};
      return new Promise<string>((resolve, reject) => {
        abort = () => reject(signal.reason);
        if (!ignoreAbort) signal.addEventListener('abort', abort, { once: true });
        calls.push({ name, signal, resolve, reject });
      }).finally(() => {
        signal.removeEventListener('abort', abort);
        live -= 1;
      });
    };
  return { calls, task, maxLive: () => maxLive };
}

test('limits active work to two and starts queued requests in FIFO order within a priority', async () => {
  const queue = new RequestScheduler(2);
  const work = controlled();
  const a = queue.schedule('a', work.task('a'));
  const b = queue.schedule('b', work.task('b'));
  const c = queue.schedule('c', work.task('c'));
  await flush();
  assert.deepEqual(
    work.calls.map((c) => c.name),
    ['a', 'b'],
  );
  work.calls[0]!.resolve('A');
  assert.equal(await a, 'A');
  await flush();
  assert.deepEqual(
    work.calls.map((c) => c.name),
    ['a', 'b', 'c'],
  );
  work.calls[1]!.resolve('B');
  work.calls[2]!.resolve('C');
  assert.deepEqual(await Promise.all([b, c]), ['B', 'C']);
  assert.equal(work.maxLive(), 2);
});

test('shares a pending key and detaches one consumer without aborting the other', async () => {
  const queue = new RequestScheduler();
  const work = controlled();
  const controller = new AbortController();
  const first = queue.schedule('same', work.task('shared'), { signal: controller.signal });
  const second = queue.schedule('same', work.task('must-not-start'));
  await flush();
  controller.abort();
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(work.calls.length, 1);
  assert.equal(work.calls[0]!.signal.aborted, false);
  work.calls[0]!.resolve('shared-result');
  assert.equal(await second, 'shared-result');
});

test('removes a cancelled queued job without issuing its request', async () => {
  const queue = new RequestScheduler(1);
  const work = controlled();
  const blocker = queue.schedule('blocker', work.task('blocker'));
  const controller = new AbortController();
  const pending = queue.schedule('queued', work.task('must-not-start'), {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await flush();
  work.calls[0]!.resolve('done');
  await blocker;
  await flush();
  assert.equal(work.calls.length, 1);
});

test('aborts work with no consumers and permits a fresh subscription to the same key', async () => {
  const queue = new RequestScheduler(1);
  const work = controlled();
  const controller = new AbortController();
  const first = queue.schedule('same', work.task('old'), { signal: controller.signal });
  await flush();
  controller.abort();
  await assert.rejects(first, { name: 'AbortError' });
  const next = queue.schedule('same', work.task('new'));
  await flush();
  assert.equal(work.calls[0]!.signal.aborted, true);
  assert.deepEqual(
    work.calls.map((c) => c.name),
    ['old', 'new'],
  );
  work.calls[1]!.resolve('new');
  assert.equal(await next, 'new');
  assert.equal(work.maxLive(), 1);
});

test('preempts background work for an explicit action then resumes its consumers', async () => {
  const queue = new RequestScheduler(2);
  const work = controlled();
  const a = queue.schedule('promo-a', work.task('promo-a'), { priority: 'prefetch' });
  const b = queue.schedule('promo-b', work.task('promo-b'), { priority: 'visible' });
  await flush();
  const user = queue.schedule('user', work.task('user'), { priority: 'interactive' });
  await flush();
  assert.equal(work.calls[0]!.signal.aborted, true);
  assert.equal(work.calls[1]!.signal.aborted, false);
  assert.equal(work.calls[2]!.name, 'user');
  work.calls[2]!.resolve('user');
  await user;
  await flush();
  assert.equal(work.calls[3]!.name, 'promo-a');
  work.calls[1]!.resolve('B');
  work.calls[3]!.resolve('A');
  assert.deepEqual(await Promise.all([a, b]), ['A', 'B']);
  assert.equal(work.maxLive(), 2);
});

test('promotes identical visible work instead of cancelling it when a user needs it', async () => {
  const queue = new RequestScheduler(1);
  const work = controlled();
  const visible = queue.schedule('same', work.task('same'), { priority: 'visible' });
  await flush();
  const user = queue.schedule('same', work.task('duplicate'), { priority: 'interactive' });
  await flush();
  assert.equal(work.calls.length, 1);
  assert.equal(work.calls[0]!.signal.aborted, false);
  work.calls[0]!.resolve('result');
  assert.deepEqual(await Promise.all([visible, user]), ['result', 'result']);
});

test('waits for an aborted task to settle before reusing its slot and discards its stale result', async () => {
  const queue = new RequestScheduler(1);
  const work = controlled();
  const background = queue.schedule('background', work.task('background', true), {
    priority: 'prefetch',
  });
  await flush();
  const user = queue.schedule('user', work.task('user'));
  await flush();
  assert.equal(work.calls.length, 1);
  assert.equal(work.calls[0]!.signal.aborted, true);
  work.calls[0]!.resolve('obsolete');
  await flush();
  assert.equal(work.calls[1]!.name, 'user');
  work.calls[1]!.resolve('user');
  await user;
  await flush();
  work.calls[2]!.resolve('fresh');
  assert.equal(await background, 'fresh');
  assert.equal(work.maxLive(), 1);
});

test('pauses hidden background work and only pauses prefetch for data saver', async () => {
  const queue = new RequestScheduler(2);
  const work = controlled();
  queue.setBackgroundPaused(true);
  const visible = queue.schedule('visible', work.task('visible'), { priority: 'visible' });
  const prefetch = queue.schedule('prefetch', work.task('prefetch'), { priority: 'prefetch' });
  const user = queue.schedule('user', work.task('user'));
  await flush();
  assert.deepEqual(
    work.calls.map((c) => c.name),
    ['user'],
  );
  work.calls[0]!.resolve('user');
  await user;
  queue.setPrefetchPaused(true);
  queue.setBackgroundPaused(false);
  await flush();
  assert.deepEqual(
    work.calls.map((c) => c.name),
    ['user', 'visible'],
  );
  work.calls[1]!.resolve('visible');
  await visible;
  await flush();
  assert.equal(work.calls.length, 2);
  queue.setPrefetchPaused(false);
  await flush();
  work.calls[2]!.resolve('prefetch');
  assert.equal(await prefetch, 'prefetch');
});

test('pausing an active background request keeps its consumer pending until a fresh attempt resumes', async () => {
  const queue = new RequestScheduler();
  const work = controlled();
  const pending = queue.schedule('promo', work.task('promo'), { priority: 'visible' });
  await flush();
  queue.setBackgroundPaused(true);
  await flush();
  assert.equal(work.calls[0]!.signal.aborted, true);
  assert.equal(work.calls.length, 1);
  queue.setBackgroundPaused(false);
  await flush();
  work.calls[1]!.resolve('resumed');
  assert.equal(await pending, 'resumed');
});

test('recovers after shared request failure without keeping a rejected promise in the queue', async () => {
  const queue = new RequestScheduler();
  let attempts = 0;
  const task = async () => {
    attempts += 1;
    throw new Error('provider unavailable');
  };
  const a = queue.schedule('same', task);
  const b = queue.schedule('same', task);
  await Promise.all([
    assert.rejects(a, /provider unavailable/),
    assert.rejects(b, /provider unavailable/),
  ]);
  assert.equal(attempts, 1);
  assert.equal(await queue.schedule('same', async () => 'retry'), 'retry');
});

test('rejects pre-cancelled consumers and invalid concurrency without starting work', async () => {
  assert.throws(() => new RequestScheduler(0), /positive integer/);
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    new RequestScheduler().schedule(
      'cancelled',
      async () => {
        calls++;
        return 1;
      },
      { signal: controller.signal },
    ),
    { name: 'AbortError' },
  );
  assert.equal(calls, 0);
});

test('starts explicit, visible and speculative queued work in priority order', async () => {
  const queue = new RequestScheduler(1);
  const work = controlled();
  const blocker = queue.schedule('blocker', work.task('blocker'));
  await flush();
  const prefetch = queue.schedule('prefetch', work.task('prefetch'), { priority: 'prefetch' });
  const visible = queue.schedule('visible', work.task('visible'), { priority: 'visible' });
  const explicit = queue.schedule('explicit', work.task('explicit'), { priority: 'interactive' });
  work.calls[0]!.resolve('blocker');
  await blocker;
  await flush();
  assert.equal(work.calls[1]!.name, 'explicit');
  work.calls[1]!.resolve('explicit');
  await explicit;
  await flush();
  assert.equal(work.calls[2]!.name, 'visible');
  work.calls[2]!.resolve('visible');
  await visible;
  await flush();
  assert.equal(work.calls[3]!.name, 'prefetch');
  work.calls[3]!.resolve('prefetch');
  await prefetch;
});
