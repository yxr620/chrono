import React, { useState } from 'react';
import { useAIStore } from '../../stores/aiStore';
import { AI_PROVIDERS } from '../../services/ai/providers';

export const AiProviderForm: React.FC = () => {
  const {
    config,
    providerConfigs,
    customModels,
    updateConfig,
    setProvider,
    addCustomModel,
    removeCustomModel,
  } = useAIStore();
  const [newModelName, setNewModelName] = useState('');

  const currentProvider = AI_PROVIDERS.find((provider) => provider.id === config.providerId);
  const providerCustomModels = customModels[config.providerId] || [];
  const presetModels = currentProvider?.models || [];
  const allModels = [...presetModels, ...providerCustomModels.filter((model) => !presetModels.includes(model))];

  const handleAddModel = () => {
    const nextModel = newModelName.trim();
    if (!nextModel) {
      return;
    }

    addCustomModel(nextModel);
    updateConfig({ model: nextModel });
    setNewModelName('');
  };

  const handleRemoveModel = (modelName: string) => {
    removeCustomModel(modelName);

    if (modelName === config.model) {
      const fallbackModel = presetModels[0] || providerCustomModels.filter((model) => model !== modelName)[0] || '';
      updateConfig({ model: fallbackModel });
    }
  };

  return (
    <div className="settings-input-group">
      <div>
        <label className="settings-input-label">服务商</label>
        <select
          className="settings-input-field"
          value={config.providerId}
          onChange={(event) => setProvider(event.target.value)}
        >
          {AI_PROVIDERS.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}{providerConfigs[provider.id]?.apiKey ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="settings-input-label">API Key</label>
        <input
          type="password"
          className="settings-input-field"
          value={config.apiKey}
          onChange={(event) => updateConfig({ apiKey: event.target.value })}
          placeholder={currentProvider?.placeholder || '输入 API Key'}
        />
        <div className="service-form__hint">密钥仅存储在本地，不会上传到 Chrono 服务端。</div>
      </div>

      <div>
        <label className="settings-input-label">模型</label>
        <select
          className="settings-input-field"
          value={config.model}
          onChange={(event) => updateConfig({ model: event.target.value })}
        >
          {!allModels.includes(config.model) && config.model && (
            <option value={config.model}>{config.model}</option>
          )}
          {allModels.length === 0 && <option value="">暂无预设模型，请手动添加</option>}
          {allModels.map((model) => (
            <option key={model} value={model}>
              {model}{providerCustomModels.includes(model) ? ' ★' : ''}
            </option>
          ))}
        </select>

        {providerCustomModels.length > 0 && (
          <div className="service-form__chips">
            {providerCustomModels.map((model) => (
              <button
                key={model}
                type="button"
                className={`service-form__chip${model === config.model ? ' service-form__chip--active' : ''}`}
                onClick={() => updateConfig({ model })}
              >
                <span>{model}</span>
                <span
                  className="service-form__chip-remove"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemoveModel(model);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      handleRemoveModel(model);
                    }
                  }}
                >
                  删除
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="service-form__actions">
          <input
            type="text"
            className="settings-input-field"
            value={newModelName}
            onChange={(event) => setNewModelName(event.target.value)}
            placeholder="输入自定义模型名称"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAddModel();
              }
            }}
          />
          <button
            type="button"
            className="service-form__button"
            onClick={handleAddModel}
            disabled={!newModelName.trim()}
          >
            保存模型
          </button>
        </div>
      </div>

      <div>
        <label className="settings-input-label">Base URL</label>
        <input
          type="text"
          className="settings-input-field"
          value={config.baseURL}
          onChange={(event) => updateConfig({ baseURL: event.target.value })}
          placeholder="https://..."
        />
        <div className="service-form__hint">可接入 Ollama 本地模型或其他 OpenAI 兼容代理。</div>
      </div>
    </div>
  );
};