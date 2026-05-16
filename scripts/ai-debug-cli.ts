import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { AI_PROVIDERS } from '../src/services/ai/providers';
import { resolveAIDefaultConfig } from '../src/services/ai/envDefaults';

type ParsedArgs = {
  provider?: string;
  model?: string;
  baseURL?: string;
  apiKey?: string;
  dataFile?: string;
  verbose: boolean;
};

type ExportJSON = {
  data?: {
    entries?: any[];
    goals?: any[];
    categories?: any[];
  };
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { verbose: false };

  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    const next = argv[i + 1];

    if (current === '--provider' && next) {
      parsed.provider = next;
      i++;
    } else if (current === '--model' && next) {
      parsed.model = next;
      i++;
    } else if ((current === '--base-url' || current === '--baseURL') && next) {
      parsed.baseURL = next;
      i++;
    } else if (current === '--api-key' && next) {
      parsed.apiKey = next;
      i++;
    } else if (current === '--data' && next) {
      parsed.dataFile = next;
      i++;
    } else if (current === '--verbose') {
      parsed.verbose = true;
    }
  }

  return parsed;
}

function printUsage() {
  console.log(`
AI Assistant Debug CLI

Usage:
  npm run ai:debug -- [options]

Options:
  --provider <id>      指定服务商（qwen/gemini/glm/kimi/minimax/openai/custom）
  --model <name>       指定模型名称
  --base-url <url>     指定 OpenAI 兼容 Base URL
  --api-key <key>      指定 API Key
  --data <file>        加载导出的 JSON 数据文件（exportFullJSON / exportToJSON）
  --verbose            打印完整调试信息（prompt/tool 结果等）

Environment (.env):
  VITE_AI_PROVIDER_ID / VITE_AI_PROVIDER
  VITE_AI_MODEL
  VITE_AI_BASE_URL
  VITE_AI_API_KEY
  AI_PROVIDER_ID / AI_PROVIDER / AI_MODEL / AI_BASE_URL / AI_API_KEY（CLI 兼容）
`);
}

function printHeader(providerId: string, model: string, baseURL: string, dataFile?: string) {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                      AI Assistant Debug CLI                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`Provider : ${providerId}`);
  console.log(`Model    : ${model || '(未设置)'}`);
  console.log(`Base URL : ${baseURL || '(未设置)'}`);
  console.log(`Data     : ${dataFile ? path.resolve(dataFile) : '未加载（可用 --data 指定）'}`);
  console.log('');
  console.log('命令：/help /config /verbose on|off /clear /exit');
  console.log('');
}

function normalizeDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

async function loadDataIntoIndexedDB(dataFile: string): Promise<void> {
  const abs = path.resolve(dataFile);
  const raw = await fs.readFile(abs, 'utf8');
  const parsed = JSON.parse(raw) as ExportJSON;
  const entries = parsed.data?.entries || [];
  const goals = parsed.data?.goals || [];
  const categories = parsed.data?.categories || [];

  const { db } = await import('../src/services/db');

  await db.transaction('rw', db.entries, db.goals, db.categories, async () => {
    await db.entries.clear();
    await db.goals.clear();
    await db.categories.clear();

    const normalizedCategories = categories.map((c: any, idx) => ({
      ...c,
      id: String(c.id || `cat-${idx}`),
      name: String(c.name || '未命名类别'),
      order: typeof c.order === 'number' ? c.order : idx + 1,
      createdAt: normalizeDate(c.createdAt),
      updatedAt: normalizeDate(c.updatedAt),
    }));

    const normalizedGoals = goals.map((g: any, idx) => ({
      ...g,
      id: String(g.id || `goal-${idx}`),
      name: String(g.name || '未命名目标'),
      date: String(g.date || new Date().toISOString().slice(0, 10)),
      createdAt: normalizeDate(g.createdAt),
      updatedAt: normalizeDate(g.updatedAt),
    }));

    const normalizedEntries = entries.map((e: any, idx) => ({
      ...e,
      id: String(e.id || `entry-${idx}`),
      activity: String(e.activity || '未命名活动'),
      startTime: normalizeDate(e.startTime),
      endTime: e.endTime ? normalizeDate(e.endTime) : null,
      createdAt: normalizeDate(e.createdAt),
      updatedAt: normalizeDate(e.updatedAt),
      categoryId: e.categoryId ?? null,
      goalId: e.goalId ?? null,
    }));

    if (normalizedCategories.length) await db.categories.bulkPut(normalizedCategories);
    if (normalizedGoals.length) await db.goals.bulkPut(normalizedGoals);
    if (normalizedEntries.length) await db.entries.bulkPut(normalizedEntries);
  });

  console.log(`已加载数据：entries=${entries.length}, goals=${goals.length}, categories=${categories.length}`);
}

function truncate(text: string, maxLen = 1600): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n...(${text.length} chars total)`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  (globalThis as any).indexedDB = indexedDB;
  (globalThis as any).IDBKeyRange = IDBKeyRange;

  const envDefaults = resolveAIDefaultConfig(process.env as Record<string, unknown>, AI_PROVIDERS);
  const providerId = (args.provider || envDefaults.providerId).toLowerCase();
  const provider = AI_PROVIDERS.find(p => p.id === providerId);

  const config = {
    baseURL: args.baseURL || envDefaults.baseURL || provider?.baseURL || '',
    apiKey: args.apiKey || envDefaults.apiKey || '',
    model: args.model || envDefaults.model || provider?.models[0] || '',
  };

  if (!config.baseURL || !config.model || !config.apiKey) {
    console.error('AI 配置不完整：请在 .env 中设置 VITE_AI_BASE_URL / VITE_AI_MODEL / VITE_AI_API_KEY，或通过命令行参数传入。');
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (args.dataFile) {
    try {
      await loadDataIntoIndexedDB(args.dataFile);
    } catch (error: any) {
      console.error(`加载数据文件失败: ${error?.message || String(error)}`);
      process.exitCode = 1;
      return;
    }
  }

  // Seed the zustand stores so the gateway returns this CLI's config.
  // toolCallEngine now reads via gateway.getAiClientConfig() rather than
  // taking config as an argument, so the CLI has to plant the config first.
  const { useAIStore } = await import('../src/stores/aiStore');
  const { useFeatureModeStore } = await import('../src/stores/featureModeStore');
  useFeatureModeStore.setState({ modes: { ai: 'byo', sync: 'disabled' } } as any);
  useAIStore.setState({
    config: { providerId, baseURL: config.baseURL, apiKey: config.apiKey, model: config.model },
    isConfigured: () => true,
  } as any);

  const { runToolCallLoop } = await import('../src/services/ai/toolCallEngine');

  let verbose = args.verbose;
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  printHeader(providerId, config.model, config.baseURL, args.dataFile);

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    while (true) {
      const query = (await rl.question('You> ')).trim();
      if (!query) continue;

      if (query === '/exit' || query === '/quit') {
        break;
      }

      if (query === '/help') {
        printUsage();
        continue;
      }

      if (query === '/config') {
        console.log(`provider=${providerId}`);
        console.log(`model=${config.model}`);
        console.log(`baseURL=${config.baseURL}`);
        console.log(`apiKey=${config.apiKey ? '已设置' : '未设置'}`);
        console.log(`verbose=${verbose ? 'on' : 'off'}`);
        continue;
      }

      if (query === '/clear') {
        history.length = 0;
        console.log('历史已清空。');
        continue;
      }

      if (query.startsWith('/verbose')) {
        const part = query.split(/\s+/)[1];
        if (part === 'on') verbose = true;
        if (part === 'off') verbose = false;
        console.log(`verbose=${verbose ? 'on' : 'off'}`);
        continue;
      }

      console.log('');
      console.log('─── 开始调试 ───────────────────────────────────────────────');

      const recentHistory = history.slice(-6);
      let chunkStarted = false;

      try {
        const result = await runToolCallLoop(
          query,
          recentHistory,
          {
            onPhase: (phase, detail, debugInfo) => {
              const title = detail ? `${phase} | ${detail}` : phase;
              console.log(`\n[PHASE] ${title}`);
              if (verbose && debugInfo) {
                console.log('----- debug -----');
                console.log(truncate(typeof debugInfo === 'string' ? debugInfo : JSON.stringify(debugInfo, null, 2)));
                console.log('-----------------');
              }
            },
            onToolCall: (info) => {
              console.log(`\n[TOOL] ${info.name}`);
              console.log(`[ARGS] ${JSON.stringify(info.args, null, 2)}`);
              if (verbose) {
                console.log(`[RESULT]\n${truncate(info.result)}`);
              } else {
                console.log(`[RESULT] ${truncate(info.result, 220).replace(/\n/g, ' ')}`);
              }
            },
            onThinking: (delta) => {
              if (!verbose) return;
              const text = delta.replace(/\s+/g, ' ').trim();
              if (text) {
                console.log(`[THINKING] ${truncate(text, 280)}`);
              }
            },
            onChunk: (delta) => {
              if (!chunkStarted) {
                process.stdout.write('\nAssistant> ');
                chunkStarted = true;
              }
              process.stdout.write(delta);
            },
          },
        );

        if (!chunkStarted) {
          process.stdout.write(`\nAssistant> ${result.content}`);
        }

        process.stdout.write('\n\n');
        history.push({ role: 'user', content: query });
        history.push({ role: 'assistant', content: result.content || '' });
      } catch (error: any) {
        console.error(`\n请求失败: ${error?.message || String(error)}\n`);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((error: any) => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
