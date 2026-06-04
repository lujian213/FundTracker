// utils/jsonParseUtils.ts
/**
 * AI 响应 JSON 解析工具
 * 用于统一处理 AI 返回的 JSON 响应，包括：
 * - Markdown 代码块提取
 * - 常见 JSON 格式错误修复
 * - 错误日志和截断检测
 */

/**
 * JSON 解析配置选项
 */
export interface JsonParseOptions {
  /** 日志前缀，用于错误日志 */
  logPrefix: string;
  /** 错误上下文描述，如 "日历AI响应"、"策略推荐响应" */
  errorContext: string;
  /** 是否移除 JavaScript 风格注释，默认 false */
  removeComments?: boolean;
  /** 是否修复未加引号的属性名，默认 false */
  fixUnquotedProps?: boolean;
  /** 是否修复未加引号的字符串值，默认 false */
  fixUnquotedValues?: boolean;
  /** 需要修复引号的属性名列表（用于 fixUnquotedValues） */
  valuePropsToFix?: string[];
}

/**
 * 从 Markdown 代码块中提取 JSON 内容
 * 支持两种格式：
 * 1. ```json ... ```（带 json 标签）
 * 2. ``` ... ```（不带标签）
 */
export function extractJsonFromMarkdown(response: string): string {
  let cleaned = response.trim();

  // 尝试匹配带 json 标签的代码块
  const codeBlockMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // 尝试匹配不带标签的代码块
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3).trim();
    }
  }

  return cleaned;
}

/**
 * 移除 JavaScript 风格的注释
 * 包括单行注释和多行注释
 */
export function removeJsComments(response: string): string {
  let cleaned = response;
  // 移除单行注释
  cleaned = cleaned.replace(/\/\/[^\n\r]*$/gm, '');
  // 移除多行注释
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  return cleaned;
}

/**
 * 移除尾随逗号
 * 修复 JSON 中对象和数组末尾的逗号
 */
export function removeTrailingCommas(response: string): string {
  return response.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * 修复未加引号的属性名
 * 将 {name: "value"} 转换为 {"name": "value"}
 */
export function fixUnquotedPropertyNames(response: string): string {
  return response.replace(
    /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g,
    (match, prefix, propName, colon) => {
      // 如果属性名已经被引号包裹，不处理
      if (prefix.endsWith('"') || prefix.endsWith("'")) {
        return match;
      }
      return `${prefix}"${propName}"${colon}`;
    }
  );
}

/**
 * 修复未加引号的字符串值
 * 将 "description":香港 转换为 "description":"香港"
 * @param response JSON 字符串
 * @param props 需要修复的属性名列表
 */
export function fixUnquotedStringValues(response: string, props: string[]): string {
  const propsPattern = props.join('|');
  return response.replace(
    new RegExp(`"(?:${propsPattern})":([^,\\[\\]{}\\n\\r]+)([,}\\]\\n\\r])`, 'g'),
    (match, value, suffix) => {
      // 如果值已经被引号包裹，不处理
      if (value.trim().startsWith('"') || value.trim().startsWith("'")) {
        return match;
      }
      return match.replace(value, `"${value.trim()}"`);
    }
  );
}

/**
 * 记录 JSON 解析错误日志
 * 包括错误信息、响应末尾内容和截断检测
 */
export function logJsonParseError(
  prefix: string,
  error: Error,
  response: string,
  showTruncationHint: boolean = true
): void {
  const errorMsg = error.message;
  const responseEnd = response.slice(-100);

  console.error(`[${prefix}] JSON解析失败，错误: ${errorMsg}`);
  console.error(`[${prefix}] 响应末尾100字符: ...${responseEnd}`);
  console.error(`[${prefix}] 响应总长度: ${response.length}字符`);

  // 检查是否可能是截断
  if (showTruncationHint && !response.endsWith(']') && !response.endsWith('}')) {
    console.error(`[${prefix}] 可能是截断问题：JSON末尾未正确闭合`);
  }
}

/**
 * 检测 JSON 是否可能被截断
 */
export function isJsonTruncated(response: string): boolean {
  const trimmed = response.trim();
  return !trimmed.endsWith(']') && !trimmed.endsWith('}');
}

/**
 * 解析 AI 返回的 JSON 响应
 * 统一处理空响应、Markdown 提取、格式修复和错误日志
 *
 * @param response AI 返回的原始响应字符串
 * @param options 解析配置选项
 * @returns 解析后的 JSON 数组
 * @throws 解析失败时抛出异常
 */
export function parseAIJsonResponse(
  response: string,
  options: JsonParseOptions
): unknown[] {
  let cleanedResponse = response.trim();

  // 1. 检查空响应
  if (!cleanedResponse) {
    throw new Error(`解析${options.errorContext}失败: 响应为空`);
  }

  // 2. 从 Markdown 代码块提取 JSON
  cleanedResponse = extractJsonFromMarkdown(cleanedResponse);

  // 3. 可选：移除注释
  if (options.removeComments) {
    cleanedResponse = removeJsComments(cleanedResponse);
  }

  // 4. 移除尾随逗号
  cleanedResponse = removeTrailingCommas(cleanedResponse);

  // 5. 可选：修复属性名
  if (options.fixUnquotedProps) {
    cleanedResponse = fixUnquotedPropertyNames(cleanedResponse);
  }

  // 6. 可选：修复字符串值
  if (options.fixUnquotedValues && options.valuePropsToFix && options.valuePropsToFix.length > 0) {
    cleanedResponse = fixUnquotedStringValues(cleanedResponse, options.valuePropsToFix);
  }

  // 7. 移除多余空白
  cleanedResponse = cleanedResponse.trim();

  // 8. 解析 JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanedResponse);
  } catch (e) {
    logJsonParseError(options.logPrefix, e as Error, cleanedResponse);
    throw new Error(`解析${options.errorContext}失败: JSON解析错误 - ${(e as Error).message}`);
  }

  // 9. 检查是否为数组
  if (!Array.isArray(parsed)) {
    throw new Error(`解析${options.errorContext}失败: AI返回的不是数组格式`);
  }

  return parsed;
}