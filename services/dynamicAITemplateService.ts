// Dynamic AI Template Service to load templates from configuration file
import { AITemplate } from '../types/aiConfigTypes';

// 内存缓存 - 页面加载后只加载一次
let cachedTemplates: AITemplate[] | null = null;

async function loadAITemplatesFromConfig(): Promise<AITemplate[]> {
  try {
    const response = await fetch('./assets/config/ai-model-templates.json');
    const data = await response.json();

    if (data && data.templates && Array.isArray(data.templates)) {
      return data.templates;
    } else {
      console.error('Invalid template data structure:', data);
      return getDefaultTemplates();
    }
  } catch (error) {
    console.error('Failed to load AI templates from config:', error);
    return getDefaultTemplates();
  }
}

function getDefaultTemplates(): AITemplate[] {
  return [
    { id: 'openai-gpt4', name: 'OpenAI GPT-4', apiEndpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4' },
    { id: 'openai-gpt35', name: 'OpenAI GPT-3.5 Turbo', apiEndpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-3.5-turbo' },
    { id: 'anthropic-claude', name: 'Anthropic Claude 3', apiEndpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-3-sonnet-20240229' },
    { id: 'google-gemini', name: 'Google Gemini Pro', apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', model: 'gemini-pro' },
    { id: 'ali-qwen', name: '阿里通义千问', apiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-max' },
    { id: 'deepseek', name: 'DeepSeek Chat', apiEndpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
    { id: 'custom-template', name: '自定义模型配置', apiEndpoint: '', model: 'gpt-4' }
  ];
}

/**
 * 异步获取 AI 模板（首次调用从配置文件加载，后续返回内存缓存）
 */
export async function getAITemplatesAsync(): Promise<AITemplate[]> {
  if (cachedTemplates) {
    return cachedTemplates;
  }
  cachedTemplates = await loadAITemplatesFromConfig();
  return cachedTemplates;
}

/**
 * 同步获取 AI 模板（返回内存缓存或默认模板）
 */
export function getAITemplatesSync(): AITemplate[] {
  return cachedTemplates || getDefaultTemplates();
}

/**
 * 刷新 AI 模板缓存（重新从配置文件加载）
 */
export async function refreshAITemplatesCache(): Promise<AITemplate[]> {
  cachedTemplates = await loadAITemplatesFromConfig();
  return cachedTemplates;
}