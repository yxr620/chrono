/**
 * 智能分类与目标预选 (Smart Metadata Prediction)
 *
 * 根据用户历史记录，在输入活动名称时自动预测最可能的类别和目标。
 * 纯本地统计，零延迟、零成本、离线可用。
 *
 * 策略：
 *   类别：精确匹配 → 子串匹配 → 无结果不预选
 *   目标：历史频率匹配 → 直接活动名-目标名 token 匹配 → 无结果不预选
 */

import { db, type Goal } from './db';

// ============ 类型 ============

export interface PredictionResult {
    categoryId: string | null;   // 预测的类别 ID
    goalId: string | null;       // 预测的目标 ID（今日目标中的）
    confidence: 'exact' | 'fuzzy' | null; // 匹配方式，用于 UI 可选展示
}

// ============ 文本相似度工具 ============

/**
 * 将字符串拆分为 token（按空格和常见标点分词）
 * "优化 APP bug" → ["优化", "app", "bug"]
 * "开发APP" → ["开发app"]  (无空格则为整体)
 *
 * 对中文单字也做拆分，这样 "优化" 和 "优化APP" 能匹配
 */
function tokenize(s: string): string[] {
    const normalized = s.toLowerCase().trim();
    // 先按空格 / 标点拆分
    const parts = normalized.split(/[\s,，、;；:：·\-_/]+/).filter(Boolean);
    // 对每个 part，将连续的中文字符逐字拆开，与英文/数字 token 分开
    const tokens: string[] = [];
    for (const part of parts) {
        // 匹配：连续的非中文（英文/数字等）作为一个 token，每个中文字符作为单独 token
        const subTokens = part.match(/[a-z0-9]+|[\u4e00-\u9fff]/g);
        if (subTokens) {
            tokens.push(...subTokens);
        } else {
            tokens.push(part);
        }
    }
    return tokens;
}

/**
 * 计算两个字符串的相似度 (0~1)
 * 使用 token 级别的 Jaccard 系数
 * 
 * 例:
 *   "优化 APP", "开发 APP"  → tokens: [优,化,app] vs [开,发,app] → 交集{app} / 并集{优,化,开,发,app} = 1/5 = 0.2
 *   "优化 APP", "看论文"    → tokens: [优,化,app] vs [看,论,文] → 0/6 = 0
 *   "读论文", "读论文"      → 1.0
 *   "开发APP", "优化APP"    → [开,发,app] vs [优,化,app] → 1/5 = 0.2
 */
function tokenSimilarity(a: string, b: string): number {
    const tokensA = new Set(tokenize(a));
    const tokensB = new Set(tokenize(b));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const t of tokensA) {
        if (tokensB.has(t)) intersection++;
    }
    const union = new Set([...tokensA, ...tokensB]).size;
    return union === 0 ? 0 : intersection / union;
}

/**
 * 检查两个字符串是否共享至少一个"有区分力"的 token（长度 ≥ 2）
 *
 * 单个中文字（"看"、"学"）太泛，不足以建立匹配关系。
 * 但 "comp8015"、"app"、"论文" 这类 ≥ 2 字符的 token 有很强的辨识度。
 *
 * 例:
 *   "看 COMP8015 PPT" vs "学习 COMP8015 课程" → 共享 "comp8015" (len=8) → true
 *   "优化 APP" vs "开发 APP"                  → 共享 "app" (len=3) → true
 *   "看论文" vs "学习 COMP8015 课程"           → 无共享长 token → false
 */
function hasSignificantTokenOverlap(a: string, b: string): boolean {
    const tokensA = tokenize(a);
    const tokensB = new Set(tokenize(b));
    // 只看长度 ≥ 2 的 token（过滤掉单个中文字等泛化 token）
    return tokensA.some(t => t.length >= 2 && tokensB.has(t));
}

// ============ 核心预测逻辑 ============

// 内存缓存：activity → categoryId 频率映射
let categoryCache: Map<string, Map<string, number>> | null = null;
// 内存缓存：activity → goalName 频率映射
let goalNameCache: Map<string, Map<string, number>> | null = null;
// 缓存构建时间
let cacheBuiltAt = 0;
const CACHE_TTL = 60_000; // 1 分钟缓存有效期

/**
 * 构建/刷新预测缓存
 * 从全量历史记录中统计 activity → categoryId / goalName 的频率分布
 */
async function ensureCache(): Promise<void> {
    if (categoryCache && goalNameCache && Date.now() - cacheBuiltAt < CACHE_TTL) {
        return; // 缓存仍有效
    }

    const allEntries = await db.entries.toArray();
    const validEntries = allEntries.filter(e => !e.deleted && e.endTime !== null);

    // 预加载所有 goal 做 id → name 映射
    const allGoals = await db.goals.toArray();
    const goalMap = new Map<string, string>();
    for (const g of allGoals) {
        if (g.id && !g.deleted) goalMap.set(g.id, g.name);
    }

    const catMap = new Map<string, Map<string, number>>();
    const gnMap = new Map<string, Map<string, number>>();

    for (const entry of validEntries) {
        const act = entry.activity.trim();
        if (!act) continue;

        // 统计 category 频率
        if (entry.categoryId) {
            if (!catMap.has(act)) catMap.set(act, new Map());
            const freq = catMap.get(act)!;
            freq.set(entry.categoryId, (freq.get(entry.categoryId) || 0) + 1);
        }

        // 统计 goalName 频率
        if (entry.goalId) {
            const goalName = goalMap.get(entry.goalId);
            if (goalName) {
                if (!gnMap.has(act)) gnMap.set(act, new Map());
                const freq = gnMap.get(act)!;
                freq.set(goalName, (freq.get(goalName) || 0) + 1);
            }
        }
    }

    categoryCache = catMap;
    goalNameCache = gnMap;
    cacheBuiltAt = Date.now();
}

/**
 * 从频率 Map 中获取最高频的 key
 */
function topKey(freqMap: Map<string, number> | undefined): string | null {
    if (!freqMap || freqMap.size === 0) return null;
    let best: string | null = null;
    let bestCount = 0;
    for (const [key, count] of freqMap) {
        if (count > bestCount) {
            best = key;
            bestCount = count;
        }
    }
    return best;
}

/**
 * 预测类别 ID
 * 优先精确匹配，其次子串匹配
 */
function predictCategory(activityInput: string): { categoryId: string | null; confidence: 'exact' | 'fuzzy' | null } {
    if (!categoryCache) return { categoryId: null, confidence: null };

    const input = activityInput.trim();
    if (!input) return { categoryId: null, confidence: null };

    // 1. 精确匹配
    const exactFreq = categoryCache.get(input);
    const exactTop = topKey(exactFreq);
    if (exactTop) return { categoryId: exactTop, confidence: 'exact' };

    // 2. 子串模糊匹配：合并所有包含 input 或被 input 包含的活动的频率
    const inputLower = input.toLowerCase();
    const mergedFreq = new Map<string, number>();

    for (const [act, freq] of categoryCache) {
        const actLower = act.toLowerCase();
        if (actLower.includes(inputLower) || inputLower.includes(actLower)) {
            for (const [catId, count] of freq) {
                mergedFreq.set(catId, (mergedFreq.get(catId) || 0) + count);
            }
        }
    }

    const fuzzyTop = topKey(mergedFreq);
    if (fuzzyTop) return { categoryId: fuzzyTop, confidence: 'fuzzy' };

    return { categoryId: null, confidence: null };
}

/**
 * 预测目标 ID
 * 路径 A：从历史 goalName 频率中获取最高频的，然后在今日目标中做模糊匹配
 * 路径 B（兜底）：直接将活动输入文本与今日目标名做 token 匹配
 */
function predictGoal(
    activityInput: string,
    todayGoals: Goal[],
): string | null {
    const input = activityInput.trim();
    // check 型目标不参与时间记录关联，因此预测时直接排除
    const candidateGoals = todayGoals.filter(g => (g.type ?? 'time') !== 'check');
    if (!input || candidateGoals.length === 0) return null;

    const SIMILARITY_THRESHOLD = 0.2; // Jaccard 阈值

    // ── 路径 A：基于历史频率的匹配 ──
    if (goalNameCache) {
        const mergedGoalFreq = new Map<string, number>();
        const inputLower = input.toLowerCase();

        for (const [act, freq] of goalNameCache) {
            const actLower = act.toLowerCase();
            const isMatch = act === input || actLower.includes(inputLower) || inputLower.includes(actLower);
            if (isMatch) {
                for (const [goalName, count] of freq) {
                    const weight = act === input ? count * 3 : count;
                    mergedGoalFreq.set(goalName, (mergedGoalFreq.get(goalName) || 0) + weight);
                }
            }
        }

        if (mergedGoalFreq.size > 0) {
            const candidates = [...mergedGoalFreq.entries()].sort((a, b) => b[1] - a[1]);

            for (const [histGoalName] of candidates) {
                // 精确名称匹配
                const exactGoal = candidateGoals.find(
                    g => g.name.toLowerCase().trim() === histGoalName.toLowerCase().trim()
                );
                if (exactGoal) return exactGoal.id!;

                // 模糊匹配
                let bestGoal: Goal | null = null;
                let bestSim = 0;
                for (const g of candidateGoals) {
                    const sim = tokenSimilarity(histGoalName, g.name);
                    if (sim > bestSim && sim >= SIMILARITY_THRESHOLD) {
                        bestSim = sim;
                        bestGoal = g;
                    }
                }
                if (bestGoal) return bestGoal.id!;
            }
        }
    }

    // ── 路径 B（兜底）：直接将活动输入与今日目标名做 token 匹配 ──
    // 适用于全新活动（无历史记录），但输入和目标名共享关键词的场景
    // 例: 输入 "看 COMP8015 PPT"，今日目标 "学习 COMP8015 课程" → 共享 "comp8015"
    let bestDirectGoal: Goal | null = null;
    let bestDirectSim = 0;

    for (const g of candidateGoals) {
        // 优先检查：是否有区分力的 token 重叠（如 comp8015、app 等）
        const hasOverlap = hasSignificantTokenOverlap(input, g.name);
        const sim = tokenSimilarity(input, g.name);

        // 满足任一条件即视为匹配：Jaccard 达标 或 有显著 token 重叠
        if (hasOverlap || sim >= SIMILARITY_THRESHOLD) {
            // 有显著 token 重叠时给一个保底分以便优先排序
            const effectiveSim = hasOverlap ? Math.max(sim, 0.3) : sim;
            if (effectiveSim > bestDirectSim) {
                bestDirectSim = effectiveSim;
                bestDirectGoal = g;
            }
        }
    }

    return bestDirectGoal?.id ?? null;
}

// ============ 公开 API ============

/**
 * 预测活动名称对应的类别和目标
 * @param activityInput 用户当前输入的活动名称
 * @param todayGoals 今天的目标列表
 * @returns 预测结果
 */
export async function predictMetadata(
    activityInput: string,
    todayGoals: Goal[],
): Promise<PredictionResult> {
    await ensureCache();

    const { categoryId, confidence } = predictCategory(activityInput);
    const goalId = predictGoal(activityInput, todayGoals);

    return { categoryId, goalId, confidence };
}

/**
 * 手动使缓存失效（在增删改记录后调用）
 */
export function invalidatePredictionCache(): void {
    cacheBuiltAt = 0;
}
