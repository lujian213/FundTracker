/**
 * 策略参数计算器
 * 使用 expr-eval 库进行表达式计算
 */

import { Parser } from 'expr-eval';
import { VirtualStrategyContext, StrategyParam, StrategyParams } from '../types';

const parser = new Parser();

// 表达式解析缓存，避免重复解析相同表达式
const parseCache = new Map<string, any>();

/**
 * 计算策略参数值
 * - 如果 value 是表达式字符串 ${...}，计算表达式
 * - 否则，按目标类型转换
 *
 * @param param 策略参数配置
 * @param ctx 策略上下文（包含 cash, shares, startNav 等）
 * @returns 计算后的值（number/bool/string）
 */
export function evaluateStrategyParameter(param: StrategyParam, ctx: VirtualStrategyContext): any {
  const { value, type } = param;

  // 1. 如果是表达式字符串 ${...}，计算表达式
  if (typeof value === 'string') {
    const match = value.match(/^\$\{(.+)\}$/);
    if (match) {
      const expr = match[1].trim();
      try {
        // 使用缓存的解析结果
        let parsed = parseCache.get(expr);
        if (!parsed) {
          parsed = parser.parse(expr);
          parseCache.set(expr, parsed);
        }
        // 为可选对象提供默认值，防止 undefined 变量错误
        const evalCtx = {
          ...ctx,
          fundConfig: ctx.fundConfig || {},
          userConfig: ctx.userConfig || {},
        };
        const result = parsed.evaluate(evalCtx as Record<string, any>);
        return convertToType(result, type);
      } catch (error: any) {
        throw new Error(`表达式计算失败: "${expr}" - ${error.message}`);
      }
    }
  }

  // 2. 非表达式，按目标类型转换
  return convertToType(value, type);
}

/**
 * 将值转换为目标类型
 */
function convertToType(value: any, type: "string" | "number" | "bool"): any {
  switch (type) {
    case "number":
      if (typeof value === "number") return value;
      const num = Number(value);
      if (isNaN(num)) throw new Error(`无法转换为数字: "${value}"`);
      return num;
    case "bool":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === "1") return true;
      if (value === "false" || value === "0") return false;
      return Boolean(value);
    case "string":
      return String(value);
  }
}

/**
 * 批量计算策略参数
 */
export function evaluateStrategyParams(params: StrategyParams, ctx: VirtualStrategyContext): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, param] of Object.entries(params)) {
    result[key] = evaluateStrategyParameter(param, ctx);
  }
  return result;
}

export default { evaluateStrategyParameter, evaluateStrategyParams };