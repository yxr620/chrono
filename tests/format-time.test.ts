import assert from 'node:assert/strict';
import test from 'node:test';

import { formatTimestamp, formatRelativeTime } from '../src/utils/formatTime';

test('formatTimestamp returns "未同步" for null', () => {
  assert.equal(formatTimestamp(null), '未同步');
});

test('formatTimestamp formats a number as zh-CN 24h', () => {
  // 2026-01-02 03:04:05 local
  const ts = new Date(2026, 0, 2, 3, 4, 5).getTime();
  const out = formatTimestamp(ts);
  assert.ok(out.includes('2026'), `expected year in ${out}`);
  assert.ok(out.includes('03:04:05'), `expected HH:mm:ss in ${out}`);
});

test('formatRelativeTime returns "从未同步" for null', () => {
  assert.equal(formatRelativeTime(null), '从未同步');
});

test('formatRelativeTime returns "刚刚" for sub-minute deltas', () => {
  const now = Date.now();
  assert.equal(formatRelativeTime(now - 30_000), '刚刚');
});

test('formatRelativeTime falls back to absolute when older than 30 days', () => {
  const fortyDaysAgo = Date.now() - 40 * 24 * 60 * 60 * 1000;
  const out = formatRelativeTime(fortyDaysAgo);
  // absolute fallback has a year prefix
  assert.ok(/\d{4}/.test(out), `expected absolute date in ${out}`);
});
