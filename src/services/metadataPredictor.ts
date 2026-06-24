/**
 * Smart Metadata Prediction
 *
 * Local, conservative category and goal prediction from recent completed history.
 * Legacy categoryId/goalId are only populated for high-confidence predictions.
 */

import { db, type Goal } from './db';

// ============ Types ============

export type PredictionConfidence = 'high' | 'medium' | 'low' | null;

export type PredictionReason =
    | 'exactActivity'
    | 'strongActivityMatch'
    | 'directGoalToken'
    | 'weakMatch'
    | 'noMatch';

export interface MetadataPredictionField {
    id: string | null;
    confidence: PredictionConfidence;
    reason: PredictionReason;
    score?: number;
}

export interface PredictionResult {
    category: MetadataPredictionField;
    goal: MetadataPredictionField;
    categoryId: string | null;
    goalId: string | null;
}

type ActivityMatch = 'exact' | 'strong' | 'weak' | 'none';

interface TextProfile {
    normalized: string;
    fragments: Set<string>;
}

interface ActivityStats {
    activity: TextProfile;
    categoryFreq: Map<string, number>;
    goalNameFreq: Map<string, number>;
}

interface GoalProfile {
    goal: Goal;
    name: TextProfile;
}

interface RankedFrequency {
    key: string;
    count: number;
}

// ============ Text normalization ============

const PUNCTUATION_OR_SPACE = /[\s\p{P}\p{S}]+/gu;
const TOKEN_PATTERN = /[a-z0-9]+|\p{Script=Han}+/gu;

function normalizeText(value: string): string {
    return value
        .normalize('NFKC')
        .toLowerCase()
        .trim()
        .replace(PUNCTUATION_OR_SPACE, ' ')
        .trim();
}

function toTextProfile(value: string): TextProfile {
    const normalized = normalizeText(value);
    return {
        normalized,
        fragments: extractSignificantFragments(normalized),
    };
}

function extractSignificantFragments(normalized: string): Set<string> {
    const fragments = new Set<string>();
    const tokens = normalized.match(TOKEN_PATTERN) ?? [];

    for (const token of tokens) {
        if (/^[a-z0-9]+$/.test(token)) {
            if (token.length >= 2) {
                fragments.add(token);
            }
            continue;
        }

        const chars = Array.from(token);
        if (chars.length < 2) {
            continue;
        }

        fragments.add(token);
        for (let i = 0; i < chars.length - 1; i += 1) {
            fragments.add(chars[i] + chars[i + 1]);
        }
    }

    return fragments;
}

function hasFragmentOverlap(a: TextProfile, b: TextProfile): boolean {
    return overlapScore(a.fragments, b.fragments) > 0;
}

function overlapScore(a: Set<string>, b: Set<string>): number {
    let score = 0;
    for (const fragment of a) {
        if (b.has(fragment)) {
            score += fragment.length;
        }
    }
    return score;
}

function codePointLength(value: string): number {
    return Array.from(value.replace(/\s+/g, '')).length;
}

function isSingleChineseChar(value: string): boolean {
    return /^\p{Script=Han}$/u.test(value.trim());
}

function hasSubstringRelationship(a: string, b: string): boolean {
    return a.includes(b) || b.includes(a);
}

function hasSafeSubstringRelationship(a: string, b: string): boolean {
    if (!hasSubstringRelationship(a, b)) {
        return false;
    }

    const shorter = codePointLength(a) <= codePointLength(b) ? a : b;
    return codePointLength(shorter) >= 2 && !isSingleChineseChar(shorter);
}

function classifyActivityMatch(input: TextProfile, historical: TextProfile): ActivityMatch {
    if (!input.normalized || !historical.normalized) {
        return 'none';
    }

    if (input.normalized === historical.normalized) {
        return 'exact';
    }

    if (hasFragmentOverlap(input, historical)) {
        return 'strong';
    }

    if (hasSubstringRelationship(input.normalized, historical.normalized)) {
        return hasSafeSubstringRelationship(input.normalized, historical.normalized)
            ? 'strong'
            : 'weak';
    }

    return 'none';
}

// ============ Cache ============

let activityCache: Map<string, ActivityStats> | null = null;
let cacheBuiltAt = 0;

const CACHE_TTL = 60_000;
const HISTORY_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

async function ensureCache(): Promise<void> {
    if (activityCache && Date.now() - cacheBuiltAt < CACHE_TTL) {
        return;
    }

    const cutoff = Date.now() - HISTORY_WINDOW_MS;
    const recentEntries = await db.entries
        .where('endTime')
        .aboveOrEqual(new Date(cutoff))
        .toArray();
    const validEntries = recentEntries.filter(entry => {
        if (entry.deleted || entry.endTime === null) {
            return false;
        }

        return new Date(entry.endTime).getTime() >= cutoff;
    });

    const allGoals = await db.goals.toArray();
    const goalNameById = new Map<string, string>();
    for (const goal of allGoals) {
        if (goal.id && !goal.deleted && (goal.type ?? 'time') !== 'check') {
            goalNameById.set(goal.id, goal.name);
        }
    }

    const nextCache = new Map<string, ActivityStats>();

    for (const entry of validEntries) {
        const activity = toTextProfile(entry.activity);
        if (!activity.normalized) {
            continue;
        }

        let stats = nextCache.get(activity.normalized);
        if (!stats) {
            stats = {
                activity,
                categoryFreq: new Map<string, number>(),
                goalNameFreq: new Map<string, number>(),
            };
            nextCache.set(activity.normalized, stats);
        }

        if (entry.categoryId) {
            increment(stats.categoryFreq, entry.categoryId);
        }

        if (entry.goalId) {
            const goalName = goalNameById.get(entry.goalId);
            if (goalName) {
                increment(stats.goalNameFreq, normalizeText(goalName));
            }
        }
    }

    activityCache = nextCache;
    cacheBuiltAt = Date.now();
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
    map.set(key, (map.get(key) ?? 0) + amount);
}

function mergeFrequencies(target: Map<string, number>, source: Map<string, number>): void {
    for (const [key, count] of source) {
        increment(target, key, count);
    }
}

// ============ Prediction helpers ============

function emptyField(reason: PredictionReason = 'noMatch'): MetadataPredictionField {
    return {
        id: null,
        confidence: reason === 'weakMatch' ? 'low' : null,
        reason,
    };
}

function rankedFrequencies(freqMap: Map<string, number>): RankedFrequency[] {
    return [...freqMap.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);
}

function splitActivityMatches(input: TextProfile): {
    exact: ActivityStats | null;
    strong: ActivityStats[];
    hasWeak: boolean;
} {
    const matches = {
        exact: null as ActivityStats | null,
        strong: [] as ActivityStats[],
        hasWeak: false,
    };

    if (!activityCache) {
        return matches;
    }

    for (const stats of activityCache.values()) {
        const match = classifyActivityMatch(input, stats.activity);
        if (match === 'exact') {
            matches.exact = stats;
        } else if (match === 'strong') {
            matches.strong.push(stats);
        } else if (match === 'weak') {
            matches.hasWeak = true;
        }
    }

    return matches;
}

function predictCategoryFromMatches(matches: ReturnType<typeof splitActivityMatches>): MetadataPredictionField {
    if (matches.exact && matches.exact.categoryFreq.size > 0) {
        const [top] = rankedFrequencies(matches.exact.categoryFreq);
        return {
            id: top.key,
            confidence: 'high',
            reason: 'exactActivity',
            score: top.count,
        };
    }

    const mergedStrong = new Map<string, number>();
    for (const stats of matches.strong) {
        mergeFrequencies(mergedStrong, stats.categoryFreq);
    }

    if (mergedStrong.size > 0) {
        const [top, second] = rankedFrequencies(mergedStrong);
        const confidence: PredictionConfidence = top.count > (second?.count ?? 0) ? 'high' : 'medium';
        return {
            id: top.key,
            confidence,
            reason: 'strongActivityMatch',
            score: top.count,
        };
    }

    return matches.hasWeak ? emptyField('weakMatch') : emptyField();
}

function toGoalProfiles(todayGoals: Goal[]): GoalProfile[] {
    return todayGoals
        .filter(goal => goal.id && !goal.deleted && (goal.type ?? 'time') !== 'check')
        .map(goal => ({
            goal,
            name: toTextProfile(goal.name),
        }))
        .filter(profile => profile.name.normalized);
}

function findHistoricalGoalNameMatch(
    goalNameFreq: Map<string, number>,
    candidateGoals: GoalProfile[],
    activityMatch: Extract<ActivityMatch, 'exact' | 'strong'>,
): MetadataPredictionField | null {
    const ranked = rankedFrequencies(goalNameFreq);

    for (const historical of ranked) {
        const exactGoal = candidateGoals.find(
            candidate => candidate.name.normalized === historical.key,
        );
        if (exactGoal) {
            return {
                id: exactGoal.goal.id!,
                confidence: 'high',
                reason: activityMatch === 'exact' ? 'exactActivity' : 'strongActivityMatch',
                score: historical.count,
            };
        }
    }

    let best: { goal: GoalProfile; count: number; score: number } | null = null;
    let topGoalIds = new Set<string>();
    for (const historical of ranked) {
        const historicalProfile = toTextProfile(historical.key);
        for (const candidate of candidateGoals) {
            const score = overlapScore(historicalProfile.fragments, candidate.name.fragments);
            if (score <= 0) {
                continue;
            }

            if (
                !best ||
                historical.count > best.count ||
                (historical.count === best.count && score > best.score)
            ) {
                best = { goal: candidate, count: historical.count, score };
                topGoalIds = new Set([candidate.goal.id!]);
            } else if (
                historical.count === best.count &&
                score === best.score
            ) {
                topGoalIds.add(candidate.goal.id!);
            }
        }
    }

    if (!best) {
        return null;
    }

    if (topGoalIds.size > 1) {
        return {
            id: null,
            confidence: 'medium',
            reason: activityMatch === 'exact' ? 'exactActivity' : 'strongActivityMatch',
            score: best.score,
        };
    }

    return {
        id: best.goal.goal.id!,
        confidence: activityMatch === 'exact' ? 'high' : 'medium',
        reason: activityMatch === 'exact' ? 'exactActivity' : 'strongActivityMatch',
        score: best.score,
    };
}

function predictDirectGoal(input: TextProfile, candidateGoals: GoalProfile[]): MetadataPredictionField | null {
    let best: { goal: GoalProfile; score: number } | null = null;
    let topScoreMatches = 0;

    for (const candidate of candidateGoals) {
        const score = overlapScore(input.fragments, candidate.name.fragments);
        if (score <= 0) {
            continue;
        }

        if (!best || score > best.score) {
            best = { goal: candidate, score };
            topScoreMatches = 1;
        } else if (score === best.score) {
            topScoreMatches += 1;
        }
    }

    if (!best) {
        return null;
    }

    if (topScoreMatches > 1) {
        return {
            id: null,
            confidence: 'medium',
            reason: 'directGoalToken',
            score: best.score,
        };
    }

    return {
        id: best.goal.goal.id!,
        confidence: 'high',
        reason: 'directGoalToken',
        score: best.score,
    };
}

function predictGoalFromMatches(
    input: TextProfile,
    candidateGoals: GoalProfile[],
    matches: ReturnType<typeof splitActivityMatches>,
): MetadataPredictionField {
    if (!input.normalized || candidateGoals.length === 0) {
        return emptyField(matches.hasWeak ? 'weakMatch' : 'noMatch');
    }

    if (matches.exact && matches.exact.goalNameFreq.size > 0) {
        const exactResult = findHistoricalGoalNameMatch(matches.exact.goalNameFreq, candidateGoals, 'exact');
        if (exactResult) {
            return exactResult;
        }
    }

    const mergedStrong = new Map<string, number>();
    for (const stats of matches.strong) {
        mergeFrequencies(mergedStrong, stats.goalNameFreq);
    }

    if (mergedStrong.size > 0) {
        const strongResult = findHistoricalGoalNameMatch(mergedStrong, candidateGoals, 'strong');
        if (strongResult) {
            return strongResult;
        }
    }

    const directResult = predictDirectGoal(input, candidateGoals);
    if (directResult) {
        return directResult;
    }

    return matches.hasWeak ? emptyField('weakMatch') : emptyField();
}

// ============ Public API ============

export async function predictMetadata(
    activityInput: string,
    todayGoals: Goal[],
): Promise<PredictionResult> {
    await ensureCache();

    const input = toTextProfile(activityInput);
    const matches = splitActivityMatches(input);
    const category = predictCategoryFromMatches(matches);
    const goal = predictGoalFromMatches(input, toGoalProfiles(todayGoals), matches);

    return {
        category,
        goal,
        categoryId: category.confidence === 'high' ? category.id : null,
        goalId: goal.confidence === 'high' ? goal.id : null,
    };
}

export function invalidatePredictionCache(): void {
    activityCache = null;
    cacheBuiltAt = 0;
}
