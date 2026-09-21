import dayjs from 'dayjs';
import { db } from './db';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

// 导出数据格式接口
interface ExportData {
  exportTime: string;
  exportType: 'full' | 'incremental' | 'range';
  lastSyncTime?: string;
  data: {
    entries: any[];
    goals: any[];
    categories: any[];
  };
  metadata: {
    totalEntries: number;
    totalGoals: number;
    totalCategories: number;
    version: string;
  };
}

/** 清理 categories：过滤软删除记录 */
const cleanCategories = (categories: any[]): any[] =>
  categories.filter(c => !c.deleted);

// 获取上次同步时间
const getLastSyncTime = async (): Promise<Date | null> => {
  const metadata = await db.syncMetadata.get('lastSyncTime');
  if (metadata && metadata.value) {
    return new Date(metadata.value as string);
  }
  return null;
};

// 更新同步时间
const updateLastSyncTime = async (time: Date): Promise<void> => {
  await db.syncMetadata.put({
    key: 'lastSyncTime',
    value: time.toISOString(),
    updatedAt: new Date()
  });
};

// 全量导出 JSON
export const exportFullJSON = async () => {
  const allEntries = await db.entries.toArray();
  const allGoals = await db.goals.toArray();
  const allCategories = await db.categories.toArray();
  
  // 过滤已删除的记录
  const entries = allEntries.filter(e => !e.deleted);
  const goals = allGoals.filter(g => !g.deleted);
  const categories = cleanCategories(allCategories);
  
  const exportTime = new Date();
  
  const exportData: ExportData = {
    exportTime: exportTime.toISOString(),
    exportType: 'full',
    data: {
      entries,
      goals,
      categories
    },
    metadata: {
      totalEntries: entries.length,
      totalGoals: goals.length,
      totalCategories: categories.length,
      version: '1.0'
    }
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const filename = `time-tracker-full-${dayjs().format('YYYY-MM-DD-HHmmss')}.json`;
  
  // 更新同步时间
  await updateLastSyncTime(exportTime);
  
  await shareOrDownloadJSON(dataStr, filename);
};

// 增量导出 JSON（只导出自上次同步后的新数据）
export const exportIncrementalJSON = async () => {
  const lastSyncTime = await getLastSyncTime();
  const exportTime = new Date();
  
  if (!lastSyncTime) {
    // 如果没有上次同步时间，执行全量导出
    return exportFullJSON();
  }
  
  // 获取自上次同步后创建或更新的记录（排除已删除的）
  const entries = await db.entries
    .filter(entry => {
      if (entry.deleted) return false;
      const entryUpdatedAt = entry.updatedAt || entry.createdAt;
      return entryUpdatedAt > lastSyncTime;
    })
    .toArray();
    
  const goals = await db.goals
    .filter(goal => {
      if (goal.deleted) return false;
      const goalUpdatedAt = goal.updatedAt || goal.createdAt;
      return goalUpdatedAt > lastSyncTime;
    })
    .toArray();
  
  const allCategories = await db.categories.toArray();
  const categories = cleanCategories(allCategories);

  const exportData: ExportData = {
    exportTime: exportTime.toISOString(),
    exportType: 'incremental',
    lastSyncTime: lastSyncTime.toISOString(),
    data: {
      entries,
      goals,
      categories
    },
    metadata: {
      totalEntries: entries.length,
      totalGoals: goals.length,
      totalCategories: categories.length,
      version: '1.0'
    }
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const filename = `time-tracker-sync-${dayjs().format('YYYY-MM-DD-HHmmss')}.json`;
  
  // 更新同步时间
  await updateLastSyncTime(exportTime);
  
  await shareOrDownloadJSON(dataStr, filename);
};

// 共享或下载 JSON 文件的辅助函数
const shareOrDownloadJSON = async (dataStr: string, filename: string) => {
  // 检测是否在原生应用环境（Capacitor）
  const isNative = Capacitor.isNativePlatform();
  
  if (isNative) {
    try {
      // 使用 Capacitor Filesystem 保存文件
      const result = await Filesystem.writeFile({
        path: filename,
        data: dataStr,
        directory: Directory.Cache,
        encoding: Encoding.UTF8
      });
      
      // 使用 Capacitor Share 分享文件
      await Share.share({
        title: '时间追踪数据',
        text: '导出的时间追踪记录',
        url: result.uri,
        dialogTitle: '分享时间追踪数据'
      });
      
      return;
    } catch (error) {
      console.error('Native export failed:', error);
      // 继续尝试 Web 方案
    }
  }
  
  // Web 环境：尝试使用 Web Share API
  const blob = new Blob([dataStr], { type: 'application/json' });
  
  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: 'application/json' });
      const canShare = navigator.canShare({ files: [file] });
      
      if (canShare) {
        await navigator.share({
          files: [file],
          title: '时间追踪数据',
          text: '导出的时间追踪记录'
        });
        return;
      }
    } catch (error) {
      // 如果用户取消分享或分享失败，继续尝试下载
      console.log('Share failed, trying download:', error);
    }
  }
  
  // 降级方案：传统下载
  downloadBlob(blob, filename);
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  
  // 对于移动端，添加事件监听来确保下载触发
  document.body.appendChild(a);
  
  // iOS Safari 需要延迟触发
  setTimeout(() => {
    a.click();
    
    // 延迟清理，确保下载开始
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }, 0);
};

// 导入策略
export const ImportStrategy = {
  MERGE: 'merge' as const,           // 合并：保留现有数据，只添加新数据（基于ID）
  REPLACE: 'replace' as const,       // 替换：清空现有数据，导入新数据
  SKIP_DUPLICATES: 'skip' as const   // 跳过：遇到重复ID时跳过
};

export type ImportStrategyType = typeof ImportStrategy[keyof typeof ImportStrategy];

// 导入结果接口
export interface ImportResult {
  success: boolean;
  message: string;
  details: {
    entriesImported: number;
    goalsImported: number;
    categoriesImported: number;
    entriesSkipped: number;
    goalsSkipped: number;
    categoriesSkipped: number;
    errors: string[];
  };
}

// 验证导出数据格式
const validateExportData = (data: any): { valid: boolean; error?: string } => {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: '无效的JSON格式' };
  }

  if (!data.data || !data.data.entries || !Array.isArray(data.data.entries)) {
    return { valid: false, error: '缺少必需的entries数据' };
  }

  if (!data.data.goals || !Array.isArray(data.data.goals)) {
    return { valid: false, error: '缺少必需的goals数据' };
  }

  if (!data.data.categories || !Array.isArray(data.data.categories)) {
    return { valid: false, error: '缺少必需的categories数据' };
  }

  return { valid: true };
};

// 从JSON文件导入数据
export const importFromJSON = async (
  file: File,
  strategy: ImportStrategyType = ImportStrategy.MERGE
): Promise<ImportResult> => {
  const result: ImportResult = {
    success: false,
    message: '',
    details: {
      entriesImported: 0,
      goalsImported: 0,
      categoriesImported: 0,
      entriesSkipped: 0,
      goalsSkipped: 0,
      categoriesSkipped: 0,
      errors: []
    }
  };

  try {
    // 读取文件内容
    const fileContent = await file.text();
    const importData = JSON.parse(fileContent);

    // 验证数据格式
    const validation = validateExportData(importData);
    if (!validation.valid) {
      result.message = validation.error || '数据格式验证失败';
      return result;
    }

    // 如果是替换策略，先清空数据库
    if (strategy === ImportStrategy.REPLACE) {
      await db.entries.clear();
      await db.goals.clear();
      // 注意：不清空categories，保留预设类别；导入数据会覆盖/新增
    }

    // 获取现有数据（用于检查重复）
    const existingEntryIds = new Set(
      (await db.entries.toArray()).map(e => e.id)
    );
    const existingGoalIds = new Set(
      (await db.goals.toArray()).map(g => g.id)
    );
    const existingCategoryIds = new Set(
      (await db.categories.toArray()).map(c => c.id)
    );

    // 导入 categories
    for (const category of importData.data.categories) {
      try {
        // 跳过已删除的记录
        if ((category as any).deleted) {
          result.details.categoriesSkipped++;
          continue;
        }
        
        // 保留 color 字段（自定义类别的颜色存储在 DB 中）
        
        // 确保日期字段是Date对象
        const categoryData = {
          ...category,
          createdAt: category.createdAt ? new Date(category.createdAt) : new Date()
        };

        if (strategy === ImportStrategy.SKIP_DUPLICATES && existingCategoryIds.has(category.id)) {
          result.details.categoriesSkipped++;
          continue;
        }

        if (strategy === ImportStrategy.MERGE && existingCategoryIds.has(category.id)) {
          // 合并策略：更新现有类别
          await db.categories.update(category.id, categoryData);
        } else {
          // 添加新类别
          await db.categories.put(categoryData);
        }
        result.details.categoriesImported++;
      } catch (error) {
        result.details.errors.push(`导入类别失败 (${category.id}): ${error}`);
      }
    }

    // 导入 goals
    for (const goal of importData.data.goals) {
      try {
        // 跳过已删除的记录
        if ((goal as any).deleted) {
          result.details.goalsSkipped++;
          continue;
        }
        
        // 确保日期字段是Date对象
        const goalData = {
          ...goal,
          createdAt: goal.createdAt ? new Date(goal.createdAt) : new Date(),
          updatedAt: goal.updatedAt ? new Date(goal.updatedAt) : new Date()
        };

        if (strategy === ImportStrategy.SKIP_DUPLICATES && existingGoalIds.has(goal.id)) {
          result.details.goalsSkipped++;
          continue;
        }

        if (strategy === ImportStrategy.MERGE && existingGoalIds.has(goal.id)) {
          // 合并策略：更新现有目标
          await db.goals.update(goal.id, goalData);
        } else {
          // 添加新目标
          await db.goals.put(goalData);
        }
        result.details.goalsImported++;
      } catch (error) {
        result.details.errors.push(`导入目标失败 (${goal.id}): ${error}`);
      }
    }

    // 导入 entries
    for (const entry of importData.data.entries) {
      try {
        // 跳过已删除的记录
        if ((entry as any).deleted) {
          result.details.entriesSkipped++;
          continue;
        }
        
        // 确保日期字段是Date对象
        const entryData = {
          ...entry,
          startTime: new Date(entry.startTime),
          endTime: entry.endTime ? new Date(entry.endTime) : null,
          createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date(),
          updatedAt: entry.updatedAt ? new Date(entry.updatedAt) : new Date()
        };

        if (strategy === ImportStrategy.SKIP_DUPLICATES && existingEntryIds.has(entry.id)) {
          result.details.entriesSkipped++;
          continue;
        }

        if (strategy === ImportStrategy.MERGE && existingEntryIds.has(entry.id)) {
          // 合并策略：更新现有记录
          await db.entries.update(entry.id, entryData);
        } else {
          // 添加新记录
          await db.entries.put(entryData);
        }
        result.details.entriesImported++;
      } catch (error) {
        result.details.errors.push(`导入记录失败 (${entry.id}): ${error}`);
      }
    }

    // 构建结果消息
    const total = result.details.entriesImported + result.details.goalsImported + result.details.categoriesImported;
    const skipped = result.details.entriesSkipped + result.details.goalsSkipped + result.details.categoriesSkipped;
    
    if (total > 0) {
      result.success = true;
      result.message = `成功导入 ${total} 条数据`;
      if (skipped > 0) {
        result.message += `，跳过 ${skipped} 条重复数据`;
      }
      if (result.details.errors.length > 0) {
        result.message += `，${result.details.errors.length} 条失败`;
      }
    } else {
      result.message = '没有数据被导入';
      if (result.details.errors.length > 0) {
        result.message = `导入失败：${result.details.errors.length} 个错误`;
      }
    }

    return result;
  } catch (error) {
    result.success = false;
    result.message = `导入失败: ${error instanceof Error ? error.message : '未知错误'}`;
    result.details.errors.push(String(error));
    return result;
  }
};
