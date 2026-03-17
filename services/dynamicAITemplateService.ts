// Dynamic AI Template Service to load templates from configuration file
import { AITemplate } from '../types/aiConfigTypes';

// 使用动态导入加载AI模板配置
async function loadAITemplatesFromConfig(): Promise<AITemplate[]> {
  try {
    // 从配置文件加载AI模板
    const response = await fetch('/assets/config/ai-model-templates.json');
    const data = await response.json();

    if (data && data.templates && Array.isArray(data.templates)) {
      return data.templates;
    } else {
      console.error('Invalid template data structure:', data);
      return [];
    }
  } catch (error) {
    console.error('Failed to load AI templates from config:', error);
    // 返回默认模板作为后备方案
    return [
      {
        id: 'openai-gpt4',
        name: 'OpenAI GPT-4',
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4'
      },
      {
        id: 'openai-gpt35',
        name: 'OpenAI GPT-3.5 Turbo',
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-3.5-turbo'
      },
      {
        id: 'anthropic-claude',
        name: 'Anthropic Claude 3',
        apiEndpoint: 'https://api.anthropic.com/v1/messages',
        model: 'claude-3-sonnet-20240229'
      },
      {
        id: 'google-gemini',
        name: 'Google Gemini Pro',
        apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        model: 'gemini-pro'
      },
      {
        id: 'ali-qwen',
        name: '阿里通义千问',
        apiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        model: 'qwen-max'
      },
      {
        id: 'deepseek',
        name: 'DeepSeek Chat',
        apiEndpoint: 'https://api.deepseek.com/chat/completions',
        model: 'deepseek-chat'
      },
      {
        id: 'custom-template',
        name: '自定义模型配置',
        apiEndpoint: '',
        model: 'gpt-4'
      }
    ];
  }
}

// 缓存模板以避免重复请求
let cachedTemplates: AITemplate[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

/**
 * 异步获取AI模板
 */
export async function getAITemplatesAsync(): Promise<AITemplate[]> {
  const now = Date.now();

  // 如果缓存存在且未过期，则返回缓存
  if (cachedTemplates && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedTemplates;
  }

  // 否则从配置加载并更新缓存
  cachedTemplates = await loadAITemplatesFromConfig();
  cacheTimestamp = now;
  return cachedTemplates;
}

/**
 * 同步获取AI模板（用于需要同步调用的场景）
 * 注意：这会返回缓存的模板或默认模板，不保证是最新的
 */
export function getAITemplatesSync(): AITemplate[] {
  if (cachedTemplates) {
    return cachedTemplates;
  }

  // 尝试从localStorage获取缓存
  try {
    const cachedData = localStorage.getItem('ai_templates_cached_data');
    if (cachedData) {
      const { templates, timestamp } = JSON.parse(cachedData);
      const now = Date.now();

      // 如果缓存未过期，则使用缓存数据
      if (timestamp && (now - timestamp) < CACHE_DURATION) {
        return templates;
      }
    }
  } catch (e) {
    console.warn('Could not read cached templates:', e);
  }

  // 返回默认模板
  return [
    {
      id: 'openai-gpt4',
      name: 'OpenAI GPT-4',
      apiEndpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4'
    },
    {
      id: 'openai-gpt35',
      name: 'OpenAI GPT-3.5 Turbo',
      apiEndpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-3.5-turbo'
    },
    {
      id: 'anthropic-claude',
      name: 'Anthropic Claude 3',
      apiEndpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-3-sonnet-20240229'
    },
    {
      id: 'google-gemini',
      name: 'Google Gemini Pro',
      apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      model: 'gemini-pro'
    },
    {
      id: 'ali-qwen',
      name: '阿里通义千问',
      apiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      model: 'qwen-max'
    },
    {
      id: 'deepseek',
      name: 'DeepSeek Chat',
      apiEndpoint: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-chat'
    },
    {
      id: 'custom-template',
      name: '自定义模型配置',
      apiEndpoint: '',
      model: 'gpt-4'
    }
  ];
}

/**
 * 刷新AI模板缓存
 */
export async function refreshAITemplatesCache(): Promise<AITemplate[]> {
  cachedTemplates = await loadAITemplatesFromConfig();
  cacheTimestamp = Date.now();

  // 同时更新localStorage缓存
  try {
    const cacheData = {
      templates: cachedTemplates,
      timestamp: cacheTimestamp
    };
    localStorage.setItem('ai_templates_cached_data', JSON.stringify(cacheData));
  } catch (e) {
    console.warn('Could not save templates to cache:', e);
  }

  return cachedTemplates;
}