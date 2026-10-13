import assert from 'node:assert/strict';
import test from 'node:test';
import { scrollIntoViewRespectingMotion, type MotionScrollTarget } from '../src/utils/motion.ts';

test('uses automatic scrolling when reduced motion is preferred', () => {
  let receivedOptions: Parameters<MotionScrollTarget['scrollIntoView']>[0] | undefined;
  const target: MotionScrollTarget = {
    scrollIntoView: (options) => {
      receivedOptions = options;
    },
  };

  scrollIntoViewRespectingMotion(target, { block: 'start' }, true);

  assert.deepEqual(receivedOptions, { block: 'start', behavior: 'auto' });
});

test('keeps smooth scrolling when reduced motion is not preferred', () => {
  let receivedOptions: Parameters<MotionScrollTarget['scrollIntoView']>[0] | undefined;
  const target: MotionScrollTarget = {
    scrollIntoView: (options) => {
      receivedOptions = options;
    },
  };

  scrollIntoViewRespectingMotion(target, {}, false);

  assert.deepEqual(receivedOptions, { behavior: 'smooth' });
});
