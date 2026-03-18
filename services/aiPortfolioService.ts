// services/aiPortfolioService.ts
import { queryAI, PromptTemplate } from './aiService';
import { AIConfiguration } from './aiConfigService';

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
 * 加载投资组合分析模板
 */
export async function loadPortfolioAnalysisTemplate(): Promise<PromptTemplate | null> {
  try {
    const response = await fetch('./assets/config/ai-portfolio-analysis-templates.json', { cache: 'no-store' });

    if (!response.ok) {
      console.error(`Failed to load portfolio templates: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data && data.templates && Array.isArray(data.templates)) {
      // 返回第一个启用的模板
      const enabledTemplate = data.templates.find((t: PromptTemplate) => t.enabled);
      return enabledTemplate || null;
    }

    return null;
  } catch (error) {
    console.error('Failed to load portfolio analysis templates:', error);
    return null;
  }
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
 */
export async function analyzePortfolio(
  config: AIConfiguration,
  portfolioData: PortfolioItem[]
): Promise<{ content: string; success: boolean; error?: string }> {
  // 加载模板
  const template = await loadPortfolioAnalysisTemplate();

  if (!template) {
    return {
      content: '未找到启用的投资组合分析模板',
      success: false,
      error: '未找到启用的投资组合分析模板'
    };
  }

  // 格式化投资组合数据
  const portfolioText = formatPortfolioData(portfolioData);

  // 替换模板变量
  const prompt = template.template.replace(/{portfolio}/g, portfolioText);

  // 调用AI
  return queryAI(config, prompt);
}