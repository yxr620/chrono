import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WheelTimePicker } from '../src/components/common/WheelTimePicker';
import { generateDateItems } from '../src/components/common/wheelTimePickerDates';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('wheel date labels stay English when the global dayjs locale is Chinese', async () => {
  const previousLocale = dayjs.locale();
  try {
    dayjs.locale('zh-cn');

    const labels = generateDateItems(dayjs('2026-05-16T12:00:00')).map((item) => item.label);

    assert.ok(labels.includes('Fri 05/15'));
    assert.ok(labels.includes('Today 05/16'));
    assert.ok(labels.includes('Sun 05/17'));
    assert.doesNotMatch(labels.join(' '), /周|星期/);
  } finally {
    dayjs.locale(previousLocale);
  }
});

test('wheel date range is anchored to the viewed date instead of today', () => {
  const items = generateDateItems(
    dayjs('2026-05-24T12:00:00'),
    dayjs('2026-06-26T12:00:00')
  );

  assert.equal(items[0].value, '2026-05-09');
  assert.equal(items.at(-1)?.value, '2026-06-08');
  assert.ok(items.some((item) => item.value === '2026-05-24'));
  assert.ok(!items.some((item) => item.value === '2026-06-11'));
});

test('wheel time picker renders dates around the selected value when today differs', (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-06-26T12:00:00+08:00'),
  });

  const markup = renderToStaticMarkup(
    React.createElement(WheelTimePicker, {
      value: new Date('2026-05-24T10:30:00+08:00'),
      onChange: () => {},
      isDark: false,
    })
  );

  assert.match(markup, /Sun 05\/24/);
  assert.doesNotMatch(markup, /Thu 06\/11/);
});

test('formatRelativeTime does not mutate the global dayjs locale', async () => {
  const source = await readFile(
    path.join(rootDir, 'src/utils/formatTime.ts'),
    'utf8'
  );

  assert.doesNotMatch(source, /dayjs\.locale\(['"]zh-cn['"]\)/);
  assert.match(source, /\.locale\(['"]zh-cn['"]\)\.fromNow\(\)/);
});
