/**
 * AI 服务商预设配置
 * 所有厂商均兼容 OpenAI /v1/chat/completions 协议
 */

export interface AIProvider {
  id: string;
  name: string;
  baseURL: string;
  models: string[];
  placeholder: string;  // apiKey 输入提示
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'qwen',
    name: '阿里云百炼',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen3.6-max-preview', 'qwen3.6-plus', 'qwen3.6-flash'],
    placeholder: 'sk-...',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-3-pro-preview'],
    placeholder: 'AIza...',
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4-long', 'glm-4'],
    placeholder: '...',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-auto', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    placeholder: 'sk-...',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseURL: 'https://api.minimax.chat/v1',
    models: ['MiniMax-Text-01', 'abab6.5s-chat'],
    placeholder: 'eyJ...',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o', 'o4-mini'],
    placeholder: 'sk-...',
  },
  {
    id: 'custom',
    name: '自定义',
    baseURL: '',
    models: [],
    placeholder: '',
  },
];

/** 根据 id 查找 provider */
export function getProvider(id: string): AIProvider | undefined {
  return AI_PROVIDERS.find(p => p.id === id);
}
