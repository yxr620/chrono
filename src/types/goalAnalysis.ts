/**
 * 目标分析模块类型定义
 */

import type { Goal } from '../services/db';

/** 目标聚类 */
export interface GoalCluster {
  id: string;                    // 聚类ID
  name: string;                  // 聚类名称（如 "App 开发"）
  keywords: string[];            // 关键词列表
  goalIds: string[];             // 包含的原始目标ID
  goals: Goal[];                 // 包含的原始目标对象
  isManual: boolean;             // 是否手动创建的规则
}

/** 聚类统计 */
export interface ClusterStats {
  clusterId: string;
  clusterName: string;
  totalDuration: number;         // 总时长（分钟）
  activeDays: number;            // 活跃天数
  avgDailyDuration: number;      // 日均时长（分钟，活跃日）
  lastActiveDate: Date | null;   // 最后活动日期
  firstActiveDate: Date | null;  // 首次活动日期
  longestStreak: number;         // 最长连续天数
  entryCount: number;            // 记录数
  activeGoalCount: number;       // 当前范围内有投入的原始目标数
}

/** 未关联事件推荐 */
export interface UnlinkedEventSuggestion {
  entryId: string;
  activity: string;
  date: string;
  duration: number;
  suggestedClusterId: string;
  suggestedClusterName: string;
  confidence: number;            // 0-1 置信度
  keywords: string[];            // 匹配到的关键词
}

/** 聚类规则（用户自定义） */
export interface ClusterRule {
  id: string;
  name: string;                  // 聚类名称
  keywords: string[];            // 匹配关键词
  priority: number;              // 优先级（数字越小优先级越高）
  createdAt: Date;
  updatedAt: Date;
}

/** 聚类设置 */
export interface ClusterSettings {
  sensitivity: 'loose' | 'standard' | 'strict';  // 聚类灵敏度
  rules: ClusterRule[];                          // 用户自定义规则
}

/** 目标分析筛选条件 */
export interface GoalAnalysisFilters {
  dateRange: {
    start: Date;
    end: Date;
  };
  clusterIds?: string[];         // 可选：只看特定聚类
}

/** 时间投入概览统计 */
export interface OverviewStats {
  totalDuration: number;         // 总投入时长（分钟）
  dailyAvgDuration: number;      // 日均投入时长（分钟）
  goalCoverageRate: number;      // 有效时间型目标投入占全部记录的比例（0-1）
  activeClusters: number;        // 活跃聚类数（有时间记录的）
  totalEntries: number;          // 总记录数
  daysInRange: number;           // 日期范围天数
}

/** 目标时间分布项 */
export interface GoalDistributionItem {
  clusterId: string;
  clusterName: string;
  totalDuration: number;         // 总时长（分钟）
  percentage: number;            // 占比（0-1）
  color: string;                 // 展示颜色
}

/** 目标分析整体结果 */
export interface GoalAnalysisResult {
  clusters: GoalCluster[];
  stats: ClusterStats[];
  unlinkedSuggestions: UnlinkedEventSuggestion[];
  overviewStats: OverviewStats;
  distribution: GoalDistributionItem[];
}

/** 子目标详情（展开聚类时显示） */
export interface SubGoalDetail {
  goalId: string;
  goalName: string;
  date: string;
  duration: number;              // 时长（分钟）
  entryCount: number;            // 记录数
}

/** 目标对比数据 */
export interface GoalComparisonData {
  clusterId: string;
  clusterName: string;
  totalDuration: number;
  activeDays: number;
  avgDailyDuration: number;
  longestStreak: number;
  thisWeekDuration: number;
}
