import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readProjectFile = (relativePath: string) =>
  readFile(path.join(rootDir, relativePath), 'utf8');

const walk = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return [full];
    })
  );
  return files.flat();
};

const cssBlock = (source: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, 's'));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[0];
};

test('fontsource variable fonts load before app global CSS', async () => {
  const main = await readProjectFile('src/main.tsx');

  const notoImport = 'import "@fontsource-variable/noto-sans-sc/wght.css";';
  const monoImport = 'import "@fontsource-variable/jetbrains-mono/wght.css";';
  const appCssImport = "import './index.css'";

  assert.match(main, /@fontsource-variable\/noto-sans-sc\/wght\.css/);
  assert.match(main, /@fontsource-variable\/jetbrains-mono\/wght\.css/);
  assert.ok(main.indexOf(notoImport) < main.indexOf(appCssImport));
  assert.ok(main.indexOf(monoImport) < main.indexOf(appCssImport));
});

test('font loading does not allow Google Fonts CDN sources', async () => {
  const html = await readProjectFile('index.html');

  assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  assert.doesNotMatch(html, /fonts\.gstatic\.com/);
});

test('global font tokens map text, number, code, and legacy names', async () => {
  const css = await readProjectFile('src/index.css');

  assert.match(css, /--app-text-family:\s*"Noto Sans SC Variable",\s*sans-serif;/);
  assert.match(css, /--app-number-family:\s*"JetBrains Mono Variable",\s*"Noto Sans SC Variable",\s*monospace;/);
  assert.match(css, /--app-code-family:\s*var\(--app-number-family\);/);
  assert.match(css, /--app-font-family:\s*var\(--app-text-family\);/);
  assert.match(css, /--app-mono-family:\s*var\(--app-number-family\);/);
  assert.match(css, /\.numeric-text,\s*\.tabular-nums\s*\{[^}]*font-family:\s*var\(--app-number-family\);/s);
});

test('ionic hosts inherit the bundled text font', async () => {
  const css = await readProjectFile('src/App.css');

  assert.match(cssBlock(css, 'html'), /--ion-font-family:\s*var\(--app-text-family\);/);
  assert.match(css, /ion-app,\s*ion-content,\s*ion-modal,/);
  assert.match(css, /font-family:\s*var\(--app-text-family\);/);
});

test('record list and sync numeric displays use the numeric font', async () => {
  const entryListCss = await readProjectFile('src/components/EntryList/EntryList.css');
  const syncCss = await readProjectFile('src/components/common/SyncIndicator.css');

  assert.match(cssBlock(entryListCss, '.entry-item-duration'), /font-family:\s*var\(--app-number-family\);/);
  assert.match(cssBlock(entryListCss, '.entry-time-range'), /font-family:\s*var\(--app-number-family\);/);
  assert.match(cssBlock(syncCss, '.sync-indicator-done .sync-count'), /font-family:\s*var\(--app-number-family\);/);
});

test('analysis pages apply number font to key metric and date surfaces', async () => {
  const dashboardCss = await readProjectFile('src/components/Dashboard/Dashboard.css');
  const trendCss = await readProjectFile('src/components/TrendPage/TrendPage.css');
  const goalCss = await readProjectFile('src/components/GoalAnalysisPage/GoalAnalysisPage.css');

  assert.match(cssBlock(dashboardCss, '.dashboard-lead-value'), /font-family:\s*var\(--app-number-family\);/);
  assert.match(cssBlock(dashboardCss, '.date-input'), /font-family:\s*var\(--app-number-family\);/);
  assert.match(cssBlock(trendCss, '.trend-chart-stats'), /font-family:\s*var\(--app-number-family\);/);
  assert.match(cssBlock(trendCss, '.trend-summary-details'), /font-family:\s*var\(--app-number-family\);/);
  assert.match(cssBlock(goalCss, '.goal-header-meta'), /font-family:\s*var\(--app-number-family\);/);
  assert.match(cssBlock(goalCss, '.goal-detail-meta'), /font-family:\s*var\(--app-number-family\);/);
});

test('component sources do not reference legacy font tokens', async () => {
  const componentsDir = path.join(rootDir, 'src/components');
  const files = (await walk(componentsDir)).filter((f) => /\.(tsx?|css)$/.test(f));

  const offenders: string[] = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (/--app-mono-family|--app-font-family/.test(content)) {
      offenders.push(path.relative(rootDir, file));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Legacy font tokens (--app-mono-family / --app-font-family) must be migrated to ` +
      `--app-number-family / --app-code-family / --app-text-family. ` +
      `Offending files:\n${offenders.join('\n')}`
  );
});
