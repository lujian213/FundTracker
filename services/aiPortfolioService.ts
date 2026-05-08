// services/aiPortfolioService.ts
import { queryAI, StreamCallback } from './aiService';
import { getById, TEMPLATE_IDS } from './promptTemplateService';
import { PromptTemplate } from '../types/promptTemplateTypes';
import { AIConfiguration } from './aiConfigService';
import { toLocalDateKey } from '../utils/priceResolver';
import { formatDateDisplay } from '../utils/dateFormat';

/**
 * 投资组合项数据结构
 */
export interface PortfolioItem {
  symbol: string;        // 基金代码
  name: string;          // 基金名称
  position: number;      // 持仓份额
  marketValue: number;   // 市场价值
  ratio: number;         // 占比 (0-1)
  costPrice?: number;    // 持仓成本（保留字段）
}


/**
 * 格式化投资组合数据为文本
 */
export function formatPortfolioData(items: PortfolioItem[]): string {
  if (!items || items.length === 0) {
    return '暂无持仓数据';
  }

  return items.map((item, index) => {
    const lines = [
      `${index + 1}. ${item.name} (${item.symbol})`,
      `   - 持仓份额: ${item.position.toFixed(2)}份`,
      `   - 市场价值: ${item.marketValue.toFixed(2)}元`,
      `   - 占比: ${(item.ratio * 100).toFixed(2)}%`
    ];

    if (item.costPrice !== undefined && item.costPrice !== null) {
      lines.push(`   - 持仓成本: ${item.costPrice.toFixed(4)}元/份`);
    }

    return lines.join('\n');
  }).join('\n\n');
}

/**
 * 执行投资组合分析
 * @param onChunk 可选的流式回调，每次收到新内容时调用
 */
export async function analyzePortfolio(
  config: AIConfiguration,
  portfolioData: PortfolioItem[],
  onChunk?: StreamCallback
): Promise<{ content: string; success: boolean; error?: string }> {
  // 获取模板
  const template = getById(TEMPLATE_IDS.PORTFOLIO_ANALYSIS);

  if (!template) {
    return {
      content: '未找到启用的投资组合分析模板',
      success: false,
      error: '未找到启用的投资组合分析模板'
    };
  }

  // 格式化投资组合数据
  const portfolioText = formatPortfolioData(portfolioData);

  // 获取当前日期
  const currentDate = formatDateDisplay(toLocalDateKey(new Date()));

  // 替换模板变量
  const prompt = template.template
    .replace(/{currentDate}/g, currentDate)
    .replace(/{portfolio}/g, portfolioText);

  // 调用AI，传递流式回调
  return queryAI(config, prompt, undefined, onChunk);
}