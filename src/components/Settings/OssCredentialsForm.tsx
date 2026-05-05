import { useEffect, useState } from 'react';
import { IonButton, IonIcon, useIonAlert } from '@ionic/react';
import { informationCircleOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { useAppToast } from '../../hooks/useAppToast';
import { useSyncStore } from '../../stores/syncStore';
import { getOSSConfig, isOSSConfigured } from '../../services/oss';
import {
  clearOSSConfig,
  getSavedOSSConfig,
  saveOSSConfig,
  type OSSConfig,
} from '../../services/syncConfig';

type ConfigSource = 'manual' | 'env' | 'none';

const EMPTY_CONFIG: OSSConfig = {
  region: '',
  bucket: '',
  accessKeyId: '',
  accessKeySecret: '',
};

export const OssCredentialsForm: React.FC = () => {
  const checkConfig = useSyncStore((state) => state.checkConfig);
  const [presentAlert] = useIonAlert();
  const [presentToast] = useAppToast();
  const [isConfigured, setIsConfigured] = useState(false);
  const [configSource, setConfigSource] = useState<ConfigSource>('none');
  const [ossForm, setOSSForm] = useState<OSSConfig>(EMPTY_CONFIG);

  useEffect(() => {
    const configured = isOSSConfigured();
    setIsConfigured(configured);

    const saved = getSavedOSSConfig();
    if (saved) {
      setOSSForm(saved);
      setConfigSource('manual');
      return;
    }

    const envConfig = getOSSConfig();
    const hasEnv = !!(envConfig.accessKeyId || envConfig.bucket || envConfig.region !== 'oss-cn-hangzhou');
    if (hasEnv) {
      setOSSForm({
        region: envConfig.region,
        bucket: envConfig.bucket,
        accessKeyId: envConfig.accessKeyId,
        accessKeySecret: envConfig.accessKeySecret,
      });
      setConfigSource('env');
      return;
    }

    setOSSForm(EMPTY_CONFIG);
    setConfigSource('none');
  }, []);

  const showToast = (message: string, color: 'success' | 'danger') => {
    presentToast({ message, duration: 2000, position: 'top', color });
  };

  const handleSaveOSSConfig = () => {
    if (!ossForm.bucket || !ossForm.accessKeyId || !ossForm.accessKeySecret) {
      showToast('请填写必要的 OSS 配置', 'danger');
      return;
    }

    const config: OSSConfig = {
      region: ossForm.region || 'oss-cn-hangzhou',
      bucket: ossForm.bucket,
      accessKeyId: ossForm.accessKeyId,
      accessKeySecret: ossForm.accessKeySecret,
    };

    saveOSSConfig(config);
    setOSSForm(config);
    setIsConfigured(true);
    setConfigSource('manual');
    checkConfig();
    showToast('OSS 配置已保存', 'success');
  };

  const handleClearOSSConfig = () => {
    presentAlert({
      header: '清除 OSS 配置',
      message: '清除后将回退到 .env 环境变量配置。如果 .env 中没有配置，同步功能将被禁用。确定继续？',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确定清除',
          handler: () => {
            clearOSSConfig();

            const envConfig = getOSSConfig();
            const hasEnv = !!(envConfig.accessKeyId || envConfig.bucket);
            if (hasEnv) {
              setOSSForm({
                region: envConfig.region,
                bucket: envConfig.bucket,
                accessKeyId: envConfig.accessKeyId,
                accessKeySecret: envConfig.accessKeySecret,
              });
              setConfigSource('env');
            } else {
              setOSSForm(EMPTY_CONFIG);
              setConfigSource('none');
            }

            const configured = isOSSConfigured();
            setIsConfigured(configured);
            checkConfig();
            showToast('OSS 配置已清除', 'success');
          },
        },
      ],
    });
  };

  return (
    <div>
      {configSource === 'env' && (
        <div className="settings-banner settings-banner-info">
          <IonIcon icon={informationCircleOutline} aria-hidden="true" />
          <span>当前使用 .env 环境变量配置，修改后将保存为应用内配置</span>
        </div>
      )}
      {configSource === 'manual' && isConfigured && (
        <div className="settings-banner settings-banner-success">
          <IonIcon icon={checkmarkCircleOutline} aria-hidden="true" />
          <span>当前使用应用内手动配置</span>
        </div>
      )}
      {!isConfigured && configSource === 'none' && (
        <div className="settings-banner settings-banner-muted">
          请输入阿里云 OSS 配置信息以启用同步功能
        </div>
      )}

      <div className="settings-input-group">
        <div>
          <label className="settings-input-label">Region</label>
          <input
            type="text"
            className="settings-input-field"
            value={ossForm.region}
            onChange={(event) => setOSSForm((current) => ({ ...current, region: event.target.value }))}
            placeholder="oss-cn-hangzhou"
          />
        </div>
        <div>
          <label className="settings-input-label">Bucket</label>
          <input
            type="text"
            className="settings-input-field"
            value={ossForm.bucket}
            onChange={(event) => setOSSForm((current) => ({ ...current, bucket: event.target.value }))}
            placeholder="your-bucket-name"
          />
        </div>
        <div>
          <label className="settings-input-label">AccessKey ID</label>
          <input
            type="password"
            className="settings-input-field"
            value={ossForm.accessKeyId}
            onChange={(event) => setOSSForm((current) => ({ ...current, accessKeyId: event.target.value }))}
            placeholder="your-access-key-id"
          />
        </div>
        <div>
          <label className="settings-input-label">AccessKey Secret</label>
          <input
            type="password"
            className="settings-input-field"
            value={ossForm.accessKeySecret}
            onChange={(event) => setOSSForm((current) => ({ ...current, accessKeySecret: event.target.value }))}
            placeholder="your-access-key-secret"
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <IonButton expand="block" onClick={handleSaveOSSConfig} className="settings-action-button" style={{ flex: 1 }}>
          💾 保存配置
        </IonButton>
        {isConfigured && (
          <IonButton
            expand="block"
            fill="outline"
            color="danger"
            onClick={handleClearOSSConfig}
            className="settings-action-button"
            style={{ flex: 1 }}
          >
            🗑️ 清除配置
          </IonButton>
        )}
      </div>
    </div>
  );
};