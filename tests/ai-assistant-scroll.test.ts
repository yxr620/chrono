import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAssistantMessagesNearBottom,
  scrollAssistantMessagesToBottom,
} from '../src/components/AIAssistant/scrollBehavior';

test('AI assistant detects whether the message scroller is close enough to the bottom', () => {
  const scroller = {
    scrollHeight: 1200,
    clientHeight: 500,
    scrollTop: 660,
  } as HTMLElement;

  assert.equal(isAssistantMessagesNearBottom(scroller, 48), true);

  scroller.scrollTop = 500;
  assert.equal(isAssistantMessagesNearBottom(scroller, 48), false);
});

test('AI assistant scrolls its own message container to the latest full height', () => {
  const calls: Array<ScrollToOptions> = [];
  const scroller = {
    scrollHeight: 900,
    scrollTop: 0,
    scrollTo(options: ScrollToOptions) {
      calls.push(options);
    },
  } as HTMLElement;

  scrollAssistantMessagesToBottom(scroller);
  scroller.scrollHeight = 1280;
  scrollAssistantMessagesToBottom(scroller, 'smooth');

  assert.deepEqual(calls, [
    { top: 900, behavior: 'auto' },
    { top: 1280, behavior: 'smooth' },
  ]);
});
