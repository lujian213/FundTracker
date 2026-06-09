import { queryAIWithTemplate, AIResponse } from './aiService';
import { getAIConfig } from './aiConfigService';
import { getById, TEMPLATE_IDS, PromptTemplate } from './promptTemplateService';

export interface BackgroundJobPrompt {
  id: string;
  name: string;
  type: 'strategy' | 'calendar_holiday_china' | 'calendar_holiday_hk' | 'calendar_holiday_us' | 'calendar_holiday_sg';
  template: string;
  maxTokens?: number;
  temperature?: number;
  enableWebSearch?: boolean;
}

/** 旧 type 到新 id 的映射 */
const TYPE_TO_ID_MAP: Record<string, string> = {
  'strategy': TEMPLATE_IDS.BG_STRATEGY,
  'calendar_holiday_china': TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_CHINA,
  'calendar_holiday_hk': TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_HK,
  'calendar_holiday_us': TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_US,
  'calendar_holiday_sg': TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_SG,
};

/** 新 id 到旧 type 的映射 */
const ID_TO_TYPE_MAP: Record<string, BackgroundJobPrompt['type']> = {
  [TEMPLATE_IDS.BG_STRATEGY]: 'strategy',
  [TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_CHINA]: 'calendar_holiday_china',
  [TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_HK]: 'calendar_holiday_hk',
  [TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_US]: 'calendar_holiday_us',
  [TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_SG]: 'calendar_holiday_sg',
};

/**
 * 根据旧 type 获取后台任务模板
 */
export function getBackgroundJobPromptByType(type: BackgroundJobPrompt['type']): BackgroundJobPrompt | null {
  const id = TYPE_TO_ID_MAP[type];
  if (!id) return null;

  const template = getById(id);
  if (!template) return null;

  return {
    id: template.id,
    name: template.name,
    type: ID_TO_TYPE_MAP[template.id] || type,
    template: template.template,
    maxTokens: template.maxTokens,
    temperature: template.temperature,
    enableWebSearch: template.enableWebSearch,
  };
}

/**
 * 获取所有后台任务模板
 * @deprecated 使用 getBackgroundJobPromptByType 按类型获取
 */
export function loadBackgroundJobPrompts(): BackgroundJobPrompt[] {
  const types: BackgroundJobPrompt['type'][] = [
    'strategy',
    'calendar_holiday_china', 'calendar_holiday_hk', 'calendar_holiday_us', 'calendar_holiday_sg'
  ];

  const result: BackgroundJobPrompt[] = [];
  for (const type of types) {
    const prompt = getBackgroundJobPromptByType(type);
    if (prompt) {
      result.push(prompt);
    }
  }
  return result;
}