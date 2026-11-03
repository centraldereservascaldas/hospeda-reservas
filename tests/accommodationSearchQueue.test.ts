import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { scheduleAccommodationSearch } from '../src/services/accommodationSearchQueue.ts';

const dom = new JSDOM('');
Object.assign(globalThis, { document: dom.window.document });
let visibility = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
const originalConnection = Object.getOwnPropertyDescriptor(navigator, 'connection');
const connection = Object.assign(new EventTarget(), { saveData: false });
Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

afterEach(() => {
  visibility = 'visible';
  connection.saveData = false;
  document.dispatchEvent(new dom.window.Event('visibilitychange'));
  connection.dispatchEvent(new Event('change'));
});

test('reacts to hidden tabs and resumes visible work when the tab returns', async () => {
  visibility = 'hidden';
  let calls = 0;
  const pending = scheduleAccommodationSearch(
    { destination: 'hidden' },
    async () => {
      calls++;
      return 'visible';
    },
    { priority: 'visible' },
  );
  await flush();
  assert.equal(calls, 0);
  visibility = 'visible';
  document.dispatchEvent(new dom.window.Event('visibilitychange'));
  assert.equal(await pending, 'visible');
  assert.equal(calls, 1);
});

test('pauses anticipation for data saver while allowing visible or explicit demand', async () => {
  connection.saveData = true;
  connection.dispatchEvent(new Event('change'));
  let prefetchCalls = 0;
  const pending = scheduleAccommodationSearch(
    { destination: 'saver-prefetch' },
    async () => {
      prefetchCalls++;
      return 'prefetched';
    },
    { priority: 'prefetch' },
  );
  assert.equal(
    await scheduleAccommodationSearch({ destination: 'saver-visible' }, async () => 'visible', {
      priority: 'visible',
    }),
    'visible',
  );
  assert.equal(prefetchCalls, 0);
  connection.saveData = false;
  connection.dispatchEvent(new Event('change'));
  assert.equal(await pending, 'prefetched');
});

test('an explicit consumer can reuse the same work queued by a hidden tab', async () => {
  visibility = 'hidden';
  document.dispatchEvent(new dom.window.Event('visibilitychange'));
  let calls = 0;
  const visible = scheduleAccommodationSearch(
    {},
    async () => {
      calls++;
      return 'shared';
    },
    { priority: 'visible' },
  );
  await flush();
  assert.equal(calls, 0);
  const explicit = scheduleAccommodationSearch(
    { from: '', to: '', guests: 1, limit: 12, skip: 0, cities: [] },
    async () => {
      throw new Error('duplicate');
    },
    { priority: 'interactive' },
  );
  assert.deepEqual(await Promise.all([visible, explicit]), ['shared', 'shared']);
  assert.equal(calls, 1);
});

test.after(() => {
  if (originalConnection) Object.defineProperty(navigator, 'connection', originalConnection);
  else Reflect.deleteProperty(navigator, 'connection');
});
