// utils/fundNameMatcher.ts
// 基金名称模糊匹配

import { getAllFundInfos, getFundInfo } from '../services/marketFundService';

/**
 * 匹配结果
 */
export interface FundMatchResult {
  matched: boolean;           // 是否匹配成功
  symbol?: string;            // 匹配到的基金代码
  matchedName?: string;       // 匹配到的系统基金名称
  similarity?: number;        // 相似度分数（0-1）
  hasPosition?: boolean;      // 是否有仓位配置
}

/**
 * 计算两个字符串的相似度（基于编辑距离）
 *
 * 使用Levenshtein距离算法，返回归一化的相似度分数（0-1）
 * 1表示完全相同，0表示完全不同
 *
 * @param str1 字符串1
 * @param str2 字符串2
 * @returns 相似度分数（0-1）
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;

  // 清理字符串：移除空格和常见差异字符
  const clean1 = str1.replace(/\s+/g, '').replace(/[()（）]/g, '');
  const clean2 = str2.replace(/\s+/g, '').replace(/[()（）]/g, '');

  if (clean1 === clean2) return 1;
  if (clean1.length === 0 || clean2.length === 0) return 0;

  // 计算编辑距离
  const distance = levenshteinDistance(clean1, clean2);

  // 归一化：相似度 = 1 - distance / max_length
  const maxLength = Math.max(clean1.length, clean2.length);
  return 1 - distance / maxLength;
}

/**
 * 计算Levenshtein编辑距离
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // 创建DP表
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  // 初始化边界
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // 计算编辑距离
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // 删除
          dp[i][j - 1] + 1,      // 插入
          dp[i - 1][j - 1] + 1   // 替换
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * 根据基金名称模糊匹配系统中的基金
 *
 * 匹配逻辑：
 * 1. 同时计算与基金名称(name)和常用名称(displayName)的相似度
 * 2. 取最高相似度作为该基金的匹配分数
 * 3. 找出所有基金中相似度最高的作为最佳匹配
 * 4. 如果最佳匹配的相似度高于阈值，返回匹配成功
 *
 * @param ocrFundName OCR识别的基金名称
 * @param threshold 相似度阈值（默认0.75）
 * @returns FundMatchResult 匹配结果
 */
export function matchFundByName(
  ocrFundName: string,
  threshold: number = 0.75
): FundMatchResult {
  if (!ocrFundName) {
    return { matched: false, similarity: 0 };
  }

  // 获取系统中的所有基金信息
  const allFunds = getAllFundInfos();

  if (allFunds.length === 0) {
    return { matched: false, similarity: 0 };
  }

  // 计算与每个基金的相似度，找出最佳匹配
  let bestMatch: FundMatchResult = { matched: false, similarity: 0 };

  for (const fundInfo of allFunds) {
    const systemName = fundInfo.ticker.name;
    const aliasName = fundInfo.position?.aliasName;
    const symbol = fundInfo.ticker.symbol;

    // 计算 name 和 aliasName 的相似度，取最高值
    const nameSimilarity = calculateSimilarity(ocrFundName, systemName);
    const aliasNameSimilarity = aliasName
      ? calculateSimilarity(ocrFundName, aliasName)
      : 0;
    const similarity = Math.max(nameSimilarity, aliasNameSimilarity);

    // 如果相似度高于当前最佳匹配，更新
    if (similarity > bestMatch.similarity!) {
      bestMatch = {
        matched: similarity >= threshold,
        symbol,
        matchedName: systemName,  // 始终返回系统基金名称
        similarity,
        hasPosition: (fundInfo.position?.fullCapacity ?? 0) > 0,
      };
    }
  }

  // 如果最佳匹配的相似度低于阈值，返回不匹配
  if (bestMatch.similarity! < threshold) {
    return {
      matched: false,
      symbol: bestMatch.symbol,
      matchedName: bestMatch.matchedName,
      similarity: bestMatch.similarity,
    };
  }

  return bestMatch;
}

/**
 * 根据基金代码精确匹配
 *
 * @param fundCode 基金代码（6位数字）
 * @returns FundMatchResult 匹配结果
 */
export function matchFundByCode(fundCode: string): FundMatchResult {
  if (!fundCode || !/^\d{6}$/.test(fundCode)) {
    return { matched: false, similarity: 0 };
  }

  const fundInfo = getFundInfo(fundCode);
  if (fundInfo) {
    return {
      matched: true,
      symbol: fundCode,
      matchedName: fundInfo.ticker.name,
      similarity: 1,
      hasPosition: (fundInfo.position?.fullCapacity ?? 0) > 0,
    };
  }

  return { matched: false, similarity: 0 };
}

/**
 * 根据基金代码精确匹配（用于测试和调试）
 *
 * @param ocrFundName OCR识别的基金名称
 * @returns FundMatchResult 匹配结果
 */
export function matchFundExact(ocrFundName: string): FundMatchResult {
  if (!ocrFundName) {
    return { matched: false, similarity: 0 };
  }

  const cleanName = ocrFundName.replace(/\s+/g, '');

  const allFunds = getAllFundInfos();

  for (const fundInfo of allFunds) {
    const systemName = fundInfo.ticker.name.replace(/\s+/g, '');

    if (cleanName === systemName) {
      return {
        matched: true,
        symbol: fundInfo.ticker.symbol,
        matchedName: fundInfo.ticker.name,
        similarity: 1,
        hasPosition: (fundInfo.position?.fullCapacity ?? 0) > 0,
      };
    }
  }

  return { matched: false, similarity: 0 };
}