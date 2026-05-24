import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
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

test('formatRelativeTime does not mutate the global dayjs locale', async () => {
  const source = await readFile(
    path.join(rootDir, 'src/utils/formatTime.ts'),
    'utf8'
  );

  assert.doesNotMatch(source, /dayjs\.locale\(['"]zh-cn['"]\)/);
  assert.match(source, /\.locale\(['"]zh-cn['"]\)\.fromNow\(\)/);
});
