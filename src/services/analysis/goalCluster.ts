/**
 * 目标聚类算法
 * 
 * 基于关键词相似度的简单聚类实现，用于目标深度分析功能。
 * 
 * ## 核心算法
 * 
 * ### 1. 分词 (tokenize)
 * - 中文：提取连续汉字，生成 bigram（二字组合）
 * - 英文：按空格/符号分割，转小写
 * - 过滤停用词（如"的"、"了"、"app"等）
 * 
 * ### 2. Jaccard 相似度
 * ```
 * similarity = |A ∩ B| / |A ∪ B|
 * ```
 * 
 * ### 3. Union-Find 聚类
 * 相似度 >= 阈值时，将两个目标合并到同一簇。
 * 
 * ## 相似度阈值
 * | 模式     | 阈值 | 适用场景   |
 * |----------|------|------------|
 * | loose    | 0.2  | 宽松匹配   |
 * | standard | 0.35 | 默认       |
 * | strict   | 0.5  | 严格匹配   |
 * 
 * ## 已知限制
 * 1. 短词匹配问题：极短的目标名（如 "vldb"）可能无法与较长的相关目标正确聚类
 * 2. 未关联事件的「关联」功能为 TODO 占位
 * 
 * @see goalAnalysisProcessor.ts - 数据处理与统计指标计算
 * @see GoalAnalysisPage.tsx - UI 展示组件
 */

import type { Goal } from '../db';
import type { GoalCluster, ClusterRule, ClusterSettings } from '../../types/goalAnalysis';

// 默认聚类设置
export const DEFAULT_CLUSTER_SETTINGS: ClusterSettings = {
  sensitivity: 'standard',
  rules: [],
};

// 相似度阈值配置
const SIMILARITY_THRESHOLDS = {
  loose: 0.2,
  standard: 0.35,
  strict: 0.5,
};

// 停用词列表（这些词不参与相似度计算）
const STOP_WORDS = new Set([
  '的', '了', '和', '与', '或', '在', '是', '有', '个', '这', '那',
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for',
  '完成', '继续', '开始', '进行', '准备', '计划',
]);

/**
 * 分词函数
 * 简单的中英文分词，提取有意义的关键词
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  
  // 统一小写
  const normalized = text.toLowerCase().trim();
  
  // 分割：按空格、标点符号分割
  const tokens = normalized
    .split(/[\s,，。.、;；:：!！?？(（)）[\]【】{}<>《》""''`~·\-_+=|\\/@#$%^&*]+/)
    .filter(Boolean);
  
  const result: string[] = [];
  
  for (const token of tokens) {
    // 过滤停用词
    if (STOP_WORDS.has(token)) continue;
    
    // 过滤太短的词（1个字符）
    if (token.length <= 1) continue;
    
    // 检测是否包含中文
    const hasChinese = /[\u4e00-\u9fa5]/.test(token);
    
    if (hasChinese) {
      // 中文：按字拆分，保留2字以上的组合
      // 简单方法：保留整个词，同时也尝试拆分
      if (token.length >= 2) {
        result.push(token);
        
        // 对于较长的中文词，也添加二字组合
        if (token.length > 2) {
          for (let i = 0; i < token.length - 1; i++) {
            const bigram = token.slice(i, i + 2);
            if (!STOP_WORDS.has(bigram)) {
              result.push(bigram);
            }
          }
        }
      }
    } else {
      // 英文：保留整个词
      if (token.length >= 2) {
        result.push(token);
      }
    }
  }
  
  return [...new Set(result)]; // 去重
}

/**
 * 计算 Jaccard 相似度
 */
export function jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  
  let intersection = 0;
  set1.forEach(item => {
    if (set2.has(item)) intersection++;
  });
  
  const union = set1.size + set2.size - intersection;
  
  return union > 0 ? intersection / union : 0;
}

/**
 * 计算两个目标名称的相似度
 */
export function goalSimilarity(goal1: string, goal2: string): number {
  const tokens1 = tokenize(goal1);
  const tokens2 = tokenize(goal2);
  
  // Jaccard 相似度
  const jaccard = jaccardSimilarity(tokens1, tokens2);
  
  // 额外检查：完全包含关系
  const name1 = goal1.toLowerCase();
  const name2 = goal2.toLowerCase();
  
  if (name1.includes(name2) || name2.includes(name1)) {
    // 包含关系给予更高的相似度
    return Math.max(jaccard, 0.6);
  }
  
  return jaccard;
}

/**
 * 应用用户自定义规则进行聚类
 */
function applyCustomRules(goals: Goal[], rules: ClusterRule[]): Map<string, GoalCluster> {
  const clusters = new Map<string, GoalCluster>();
  const assignedGoalIds = new Set<string>();
  
  // 按优先级排序规则
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);
  
  for (const rule of sortedRules) {
    const matchedGoals: Goal[] = [];
    const matchedIds: string[] = [];
    
    for (const goal of goals) {
      if (assignedGoalIds.has(goal.id!)) continue;
      
      const goalName = goal.name.toLowerCase();
      const matched = rule.keywords.some(keyword => 
        goalName.includes(keyword.toLowerCase())
      );
      
      if (matched) {
        matchedGoals.push(goal);
        matchedIds.push(goal.id!);
        assignedGoalIds.add(goal.id!);
      }
    }
    
    if (matchedGoals.length > 0) {
      clusters.set(rule.id, {
        id: rule.id,
        name: rule.name,
        keywords: rule.keywords,
        goalIds: matchedIds,
        goals: matchedGoals,
        isManual: true,
      });
    }
  }
  
  return clusters;
}

/**
 * 使用 Union-Find 进行自动聚类
 */
function autoCluster(
  goals: Goal[],
  excludeIds: Set<string>,
  threshold: number
): GoalCluster[] {
  // 过滤掉已分配的目标
  const unassignedGoals = goals.filter(g => !excludeIds.has(g.id!));
  
  if (unassignedGoals.length === 0) return [];
  
  // 初始化 Union-Find
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();
  
  for (const goal of unassignedGoals) {
    parent.set(goal.id!, goal.id!);
    rank.set(goal.id!, 0);
  }
  
  function find(x: string): string {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }
  
  function union(x: string, y: string): void {
    const rootX = find(x);
    const rootY = find(y);
    
    if (rootX === rootY) return;
    
    const rankX = rank.get(rootX)!;
    const rankY = rank.get(rootY)!;
    
    if (rankX < rankY) {
      parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      parent.set(rootY, rootX);
    } else {
      parent.set(rootY, rootX);
      rank.set(rootX, rankX + 1);
    }
  }
  
  // 计算相似度并合并
  for (let i = 0; i < unassignedGoals.length; i++) {
    for (let j = i + 1; j < unassignedGoals.length; j++) {
      const goal1 = unassignedGoals[i];
      const goal2 = unassignedGoals[j];
      
      const similarity = goalSimilarity(goal1.name, goal2.name);
      
      if (similarity >= threshold) {
        union(goal1.id!, goal2.id!);
      }
    }
  }
  
  // 收集聚类结果
  const clusterMap = new Map<string, Goal[]>();
  
  for (const goal of unassignedGoals) {
    const root = find(goal.id!);
    if (!clusterMap.has(root)) {
      clusterMap.set(root, []);
    }
    clusterMap.get(root)!.push(goal);
  }
  
  // 转换为 GoalCluster 格式
  const clusters: GoalCluster[] = [];
  let clusterIndex = 0;
  
  for (const [_rootId, clusterGoals] of clusterMap) {
    // 选择最具代表性的名称（最短的或出现最多的关键词）
    const representativeName = selectRepresentativeName(clusterGoals);
    const allKeywords = extractClusterKeywords(clusterGoals);
    
    clusters.push({
      id: `auto_${clusterIndex++}`,
      name: representativeName,
      keywords: allKeywords,
      goalIds: clusterGoals.map(g => g.id!),
      goals: clusterGoals,
      isManual: false,
    });
  }
  
  return clusters;
}

/**
 * 选择聚类的代表性名称
 */
function selectRepresentativeName(goals: Goal[]): string {
  if (goals.length === 0) return '未命名';
  if (goals.length === 1) return goals[0].name;
  
  // 提取所有关键词及其频率
  const keywordFreq = new Map<string, number>();
  
  for (const goal of goals) {
    const tokens = tokenize(goal.name);
    for (const token of tokens) {
      keywordFreq.set(token, (keywordFreq.get(token) || 0) + 1);
    }
  }
  
  // 找出最高频的关键词
  let maxFreq = 0;
  let topKeywords: string[] = [];
  
  keywordFreq.forEach((freq, keyword) => {
    if (freq > maxFreq) {
      maxFreq = freq;
      topKeywords = [keyword];
    } else if (freq === maxFreq) {
      topKeywords.push(keyword);
    }
  });
  
  // 选择包含最高频关键词且最短的目标名称
  const candidateGoals = goals.filter(g => {
    const tokens = tokenize(g.name);
    return topKeywords.some(kw => tokens.includes(kw));
  });
  
  if (candidateGoals.length > 0) {
    candidateGoals.sort((a, b) => a.name.length - b.name.length);
    return candidateGoals[0].name;
  }
  
  // 兜底：返回最短的名称
  const sorted = [...goals].sort((a, b) => a.name.length - b.name.length);
  return sorted[0].name;
}

/**
 * 提取聚类的关键词
 */
function extractClusterKeywords(goals: Goal[]): string[] {
  const keywordFreq = new Map<string, number>();
  
  for (const goal of goals) {
    const tokens = tokenize(goal.name);
    for (const token of tokens) {
      keywordFreq.set(token, (keywordFreq.get(token) || 0) + 1);
    }
  }
  
  // 按频率排序，取前10个
  const sorted = Array.from(keywordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([keyword]) => keyword);
  
  return sorted;
}

/**
 * 主聚类函数
 */
export function clusterGoals(
  goals: Goal[],
  settings: ClusterSettings = DEFAULT_CLUSTER_SETTINGS
): GoalCluster[] {
  if (goals.length === 0) return [];
  
  // 1. 首先应用用户自定义规则
  const manualClusters = applyCustomRules(goals, settings.rules);
  const assignedIds = new Set<string>();
  
  manualClusters.forEach(cluster => {
    cluster.goalIds.forEach(id => assignedIds.add(id));
  });
  
  // 2. 对剩余目标进行自动聚类
  const threshold = SIMILARITY_THRESHOLDS[settings.sensitivity];
  const autoClusters = autoCluster(goals, assignedIds, threshold);
  
  // 3. 合并结果
  const allClusters = [...manualClusters.values(), ...autoClusters];
  
  // 4. 按目标数量排序
  allClusters.sort((a, b) => b.goals.length - a.goals.length);
  
  return allClusters;
}

/**
 * 检测事件是否可能属于某个聚类
 * 返回匹配度最高的聚类及置信度
 */
export function matchEventToCluster(
  activity: string,
  clusters: GoalCluster[]
): { clusterId: string; clusterName: string; confidence: number; keywords: string[] } | null {
  if (!activity || clusters.length === 0) return null;
  
  const activityTokens = tokenize(activity);
  if (activityTokens.length === 0) return null;
  
  let bestMatch: { clusterId: string; clusterName: string; confidence: number; keywords: string[] } | null = null;
  
  for (const cluster of clusters) {
    // 计算与聚类关键词的相似度
    const similarity = jaccardSimilarity(activityTokens, cluster.keywords);
    
    // 找出匹配的关键词
    const matchedKeywords = activityTokens.filter(t => cluster.keywords.includes(t));
    
    if (similarity > 0.2 && matchedKeywords.length > 0) {
      if (!bestMatch || similarity > bestMatch.confidence) {
        bestMatch = {
          clusterId: cluster.id,
          clusterName: cluster.name,
          confidence: similarity,
          keywords: matchedKeywords,
        };
      }
    }
  }
  
  return bestMatch;
}

/**
 * 生成聚类的显示颜色
 * 基于聚类ID生成稳定的颜色
 */
export function getClusterColor(_clusterId: string, index: number): string {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#f97316', // orange
    '#6366f1', // indigo
  ];
  
  return colors[index % colors.length];
}
