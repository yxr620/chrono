import { useRef, useState } from 'react';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonSpinner,
  useIonAlert,
} from '@ionic/react';
import { exportFullJSON, exportIncrementalJSON, importFromJSON, ImportStrategy } from '../../services/export';
import { db } from '../../services/db';
import { useEntryStore } from '../../stores/entryStore';
import { useGoalStore } from '../../stores/goalStore';
import { useCategoryStore } from '../../stores/categoryStore';
import { useAppToast } from '../../hooks/useAppToast';

export const BackupSection: React.FC = () => {
  const [importStrategy, setImportStrategy] = useState<typeof ImportStrategy.MERGE | typeof ImportStrategy.REPLACE>(ImportStrategy.MERGE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [presentToast, dismissToast] = useAppToast();
  const [presentAlert] = useIonAlert();
  const [isLoading, setIsLoading] = useState(false);

  const { loadEntries } = useEntryStore();
  const { loadGoals } = useGoalStore();
  const { loadCategories } = useCategoryStore();

  const showToast = (message: string, color: 'success' | 'danger' | 'warning' = 'success', duration = 2000) => {
    presentToast({ message, duration, position: 'top', color });
  };

  const showLoadingToast = async (message: string) => {
    await dismissToast().catch(() => undefined);
    await presentToast({ message, duration: 0, position: 'top', color: 'warning' });
  };

  const hideLoadingToast = async () => {
    await dismissToast().catch(() => undefined);
  };

  const handleExportFullJSON = async () => {
    try {
      setIsLoading(true);
      await showLoadingToast('导出全量中…');
      await exportFullJSON();
      await hideLoadingToast();
      showToast('全量导出成功', 'success');
    } catch (error) {
      await hideLoadingToast();
      showToast('导出失败', 'danger');
      console.error('Export Full JSON failed:', error);
    } finally {
      await hideLoadingToast();
      setIsLoading(false);
    }
  };

  const handleExportIncrementalJSON = async () => {
    try {
      setIsLoading(true);
      await showLoadingToast('导出增量中…');
      await exportIncrementalJSON();
      await hideLoadingToast();
      showToast('增量导出成功', 'success');
    } catch (error) {
      await hideLoadingToast();
      showToast('导出失败', 'danger');
      console.error('Export Incremental JSON failed:', error);
    } finally {
      await hideLoadingToast();
      setIsLoading(false);
    }
  };

  const handleCopyJSON = async () => {
    try {
      const entries = await db.entries.toArray();
      const dataStr = JSON.stringify(entries, null, 2);
      await navigator.clipboard.writeText(dataStr);
      showToast('已复制到剪贴板', 'success');
    } catch (error) {
      showToast('复制失败', 'danger');
      console.error('Copy JSON failed:', error);
    }
  };

  const handleImportClick = () => {
    presentAlert({
      header: '选择导入策略',
      message: '请选择数据导入策略',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '合并导入（推荐）',
          handler: () => {
            setImportStrategy(ImportStrategy.MERGE);
            setTimeout(() => fileInputRef.current?.click(), 100);
          }
        },
        {
          text: '替换导入',
          role: 'destructive',
          handler: () => {
            presentAlert({
              header: '确认替换',
              message: '替换模式会清空所有现有数据！此操作无法撤销。确定要继续吗？',
              buttons: [
                { text: '取消', role: 'cancel' },
                {
                  text: '确认替换',
                  role: 'destructive',
                  handler: () => {
                    setImportStrategy(ImportStrategy.REPLACE);
                    setTimeout(() => fileInputRef.current?.click(), 100);
                  }
                }
              ]
            });
          }
        }
      ]
    });
  };

  const refreshAllStores = async () => {
    await Promise.all([
      loadEntries(),
      loadGoals(),
      loadCategories(),
    ]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      await showLoadingToast('导入中…');

      const result = await importFromJSON(file, importStrategy);

      await hideLoadingToast();

      if (result.success) {
        showToast(result.message, 'success', 3000);

        setTimeout(() => {
          const skipped = result.details.entriesSkipped + result.details.goalsSkipped + result.details.categoriesSkipped;
          const detailsMessage = [
            '导入成功：',
            `时间记录: ${result.details.entriesImported} 条`,
            `目标: ${result.details.goalsImported} 条`,
            `类别: ${result.details.categoriesImported} 条`,
            skipped > 0 ? `跳过重复数据: ${skipped} 条` : '',
            result.details.errors.length > 0 ? `${result.details.errors.length} 个错误` : '',
          ].filter(Boolean).join('\n');

          presentAlert({
            header: '导入完成',
            message: detailsMessage,
            buttons: ['确定']
          });
        }, 500);

        await refreshAllStores();
      } else {
        showToast(result.message, 'danger', 3000);

        if (result.details.errors.length > 0) {
          const errorMessage = result.message + '\n\n错误详情：\n' +
            result.details.errors.slice(0, 5).join('\n') +
            (result.details.errors.length > 5 ? `\n... 还有 ${result.details.errors.length - 5} 个错误` : '');

          presentAlert({
            header: '导入失败',
            message: errorMessage,
            buttons: ['确定']
          });
        }
      }
    } catch (error) {
      await hideLoadingToast();
      showToast('导入失败', 'danger');
      console.error('Import failed:', error);
    } finally {
      await hideLoadingToast();
      setIsLoading(false);
      e.target.value = '';
    }
  };

  return (
    <IonCard className="settings-card">
      <IonCardContent className="settings-card-content">
        <h3 className="settings-card-title">数据备份</h3>
        <div className="settings-button-stack">
          <IonButton
            expand="block"
            color="success"
            onClick={handleImportClick}
            disabled={isLoading}
            className="settings-action-button"
          >
            {isLoading ? <IonSpinner name="dots" /> : '导入数据'}
          </IonButton>
          <p className="settings-button-hint">从之前导出的 JSON 文件中恢复数据</p>

          <IonButton
            expand="block"
            color="primary"
            onClick={handleExportIncrementalJSON}
            disabled={isLoading}
            className="settings-action-button"
          >
            {isLoading ? <IonSpinner name="dots" /> : '增量导出（推荐）'}
          </IonButton>
          <p className="settings-button-hint">只导出自上次同步后的新数据</p>

          <IonButton
            expand="block"
            fill="outline"
            onClick={handleExportFullJSON}
            disabled={isLoading}
            className="settings-action-button"
          >
            {isLoading ? <IonSpinner name="dots" /> : '全量导出'}
          </IonButton>
          <p className="settings-button-hint">导出所有记录和目标数据</p>

          <IonButton
            expand="block"
            fill="clear"
            color="medium"
            onClick={handleCopyJSON}
            disabled={isLoading}
            className="settings-action-button settings-action-button-link"
          >
            复制 JSON 到剪贴板
          </IonButton>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </IonCardContent>
    </IonCard>
  );
};
