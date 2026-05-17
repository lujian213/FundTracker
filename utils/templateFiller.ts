/**
 * 模板填充结果
 */
export interface FillTemplateResult {
  success: boolean;
  content: string;
  missingPlaceholders?: string[];
  error?: string;
}

/**
 * 模板上下文 - 简单的 key-value map
 */
export type TemplateContext = Record<string, string | number | object>;

/**
 * 填充模板占位符，检测缺失值
 * 单次扫描，O(n)复杂度
 */
export function fillTemplate(template: string, context: TemplateContext): FillTemplateResult {
  const missing: string[] = [];

  const content = template.replace(/\{([^}]+)\}/g, (match, key) => {
    if (context[key] === undefined || context[key] === null) {
      if (!missing.includes(key)) missing.push(key);
      return match;
    }
    const rawValue = context[key];
    return typeof rawValue === 'object' && rawValue !== null
      ? JSON.stringify(rawValue)
      : String(rawValue);
  });

  if (missing.length > 0) {
    return {
      success: false,
      content: template,
      missingPlaceholders: missing,
      error: `缺少占位符值: ${missing.map(p => `{${p}}`).join(', ')}`,
    };
  }

  return { success: true, content };
}