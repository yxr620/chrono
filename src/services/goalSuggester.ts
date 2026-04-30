/**
 * 晨间目标智能建议 (Morning Goal Suggestion)
 *
 * 混合优先级策略，模拟用户真实的目标设定心理：
 *
 *   优先级 1 —— 昨天设定了但完全没有投入时间的目标（"未完成的事"）
 *   优先级 2 —— 前天设定了但完全没有投入时间的目标
 *   优先级 3 —— 最近 7 天内高频使用的目标（日常习惯）
 *
 * 三个来源去重合并后，按优先级排列，返回 Top 5。
 */

import { db } from './db';
import dayjs from 'dayjs';

const MAX_SUGGESTIONS = 5;
const FREQUENCY_LOOKBACK_DAYS = 7;
const CHECK_LOOKBACK_DAYS = 14;

/**
 * 获取某天设定了目标但完全没有投入时间的目标名列表
 * "没有投入时间" = 该目标 id 在 entries 表中找不到任何关联的已完成记录
 *
 * 仅针对 'time' 型目标。check 型目标不与 entries 关联，没有"未完成时间"的语义。
 */
async function getUnfulfilledGoals(dateStr: string): Promise<string[]> {
    const allGoals = await db.goals.toArray();
    const dayGoals = allGoals.filter(
        g => !g.deleted && g.date === dateStr && (g.type ?? 'time') === 'time'
    );
    if (dayGoals.length === 0) return [];

    const allEntries = await db.entries.toArray();
    // 该日期所有已完成的记录的 goalId 集合
    const fulfilledGoalIds = new Set(
        allEntries
            .filter(e => !e.deleted && e.endTime !== null && e.goalId)
            .filter(e => {
                const entryDate = dayjs(e.startTime).format('YYYY-MM-DD');
                return entryDate === dateStr;
            })
            .map(e => e.goalId!)
    );

    // 返回没有任何时间投入的目标名
    return dayGoals
        .filter(g => !fulfilledGoalIds.has(g.id!))
        .map(g => g.name.trim());
}

/**
 * 获取最近 N 天内高频使用的目标名（按出现天数降序）
 * 仅针对 'time' 型目标。
 */
async function getFrequentGoals(excludeNames: Set<string>): Promise<string[]> {
    const today = dayjs().format('YYYY-MM-DD');
    const startDate = dayjs().subtract(FREQUENCY_LOOKBACK_DAYS, 'day').format('YYYY-MM-DD');

    const allGoals = await db.goals.toArray();
    const recentGoals = allGoals.filter(g =>
        !g.deleted &&
        (g.type ?? 'time') === 'time' &&
        g.date >= startDate &&
        g.date < today
    );

    // 统计每个目标名出现的天数
    const nameToDateSet = new Map<string, Set<string>>();
    for (const g of recentGoals) {
        const normalized = g.name.trim();
        if (!normalized || excludeNames.has(normalized)) continue;
        if (!nameToDateSet.has(normalized)) {
            nameToDateSet.set(normalized, new Set());
        }
        nameToDateSet.get(normalized)!.add(g.date);
    }

    return [...nameToDateSet.entries()]
        .sort((a, b) => b[1].size - a[1].size)
        .map(([name]) => name);
}

/**
 * 推荐今日目标（混合优先级策略）
 * @param existingNames 今天已创建的目标名称列表
 * @returns 推荐的目标名称数组，按优先级排序
 */
export async function suggestGoals(existingNames: string[]): Promise<string[]> {
    const existingLower = new Set(existingNames.map(n => n.toLowerCase().trim()));
    const isExcluded = (name: string) => existingLower.has(name.toLowerCase().trim());

    const result: string[] = [];
    const added = new Set<string>(); // 去重用（小写）

    const addIfNew = (name: string) => {
        const key = name.toLowerCase().trim();
        if (!isExcluded(name) && !added.has(key)) {
            added.add(key);
            result.push(name);
        }
    };

    // 优先级 1：昨天没有投入时间的目标
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const yesterdayUnfulfilled = await getUnfulfilledGoals(yesterday);
    for (const name of yesterdayUnfulfilled) addIfNew(name);

    // 优先级 2：前天没有投入时间的目标
    const dayBefore = dayjs().subtract(2, 'day').format('YYYY-MM-DD');
    const dayBeforeUnfulfilled = await getUnfulfilledGoals(dayBefore);
    for (const name of dayBeforeUnfulfilled) addIfNew(name);

    // 优先级 3：最近 7 天高频目标
    if (result.length < MAX_SUGGESTIONS) {
        const frequent = await getFrequentGoals(added);
        for (const name of frequent) {
            if (result.length >= MAX_SUGGESTIONS) break;
            addIfNew(name);
        }
    }

    return result.slice(0, MAX_SUGGESTIONS);
}

/**
 * 推荐今日打卡目标（check 型）
 * 策略：取最近 N 天内出现频率最高的 check 型目标名，排除当天已存在的同名项。
 */
export async function suggestCheckGoals(existingNames: string[]): Promise<string[]> {
    const today = dayjs().format('YYYY-MM-DD');
    const startDate = dayjs().subtract(CHECK_LOOKBACK_DAYS, 'day').format('YYYY-MM-DD');

    const existingLower = new Set(existingNames.map(n => n.toLowerCase().trim()));

    const allGoals = await db.goals.toArray();
    const recent = allGoals.filter(g =>
        !g.deleted &&
        (g.type ?? 'time') === 'check' &&
        g.date >= startDate &&
        g.date < today
    );

    const nameToDateSet = new Map<string, Set<string>>();
    for (const g of recent) {
        const normalized = g.name.trim();
        if (!normalized || existingLower.has(normalized.toLowerCase())) continue;
        if (!nameToDateSet.has(normalized)) {
            nameToDateSet.set(normalized, new Set());
        }
        nameToDateSet.get(normalized)!.add(g.date);
    }

    return [...nameToDateSet.entries()]
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, MAX_SUGGESTIONS)
        .map(([name]) => name);
}
