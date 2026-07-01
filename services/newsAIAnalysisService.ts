// services/newsAIAnalysisService.ts
import { queryAIWithTemplate, StreamCallback } from './aiService';
import { getById, TEMPLATE_IDS as BASE_TEMPLATE_IDS } from './promptTemplateService';
import { AIConfiguration } from './aiConfigService';
import { MarketFund, FundSector, StockPosition } from '../types';
import { FastNewsItem } from '../types/fastNewsTypes';

// 导出 TEMPLATE_IDS 常量（包含新增的快讯分析模板）
export const TEMPLATE_IDS = {
  NEWS_IMPACT_ANALYSIS: BASE_TEMPLATE_IDS.NEWS_IMPACT_ANALYSIS,
};

/**
 * 加载快讯影响分析模板
 * @returns 模板对象，如果未加载则返回 null
 */
export async function loadNewsAnalysisTemplate() {
  return getById(TEMPLATE_IDS.NEWS_IMPACT_ANALYSIS);
}

/**
 * 格式化基金持仓信息（包含 profile 数据）
 * 用于 AI 分析模板的 portfolioWithProfile 变量
 * @param funds 基金列表
 * @returns 格式化后的基金信息字符串
 */
export function formatPortfolioWithProfile(funds: MarketFund[]): string {
  if (!funds || funds.length === 0) {
    return '暂无持仓基金';
  }

  return funds.map((fund, index) => {
    const ticker = fund.info.ticker;
    const profile = ticker.profile;

    const lines = [
      `${index + 1}. ${ticker.name} (${ticker.symbol})`
    ];

    if (profile) {
      if (profile.fund_type) {
        lines.push(`   - 类型：${profile.fund_type}`);
      }

      if (profile.sectors && profile.sectors.length > 0) {
        const sectorNames = profile.sectors.map((s: FundSector) => s.name).join('、');
        lines.push(`   - 板块：${sectorNames}`);
      }

      if (profile.stock_positions && profile.stock_positions.length > 0) {
        const topPositions = profile.stock_positions.slice(0, 5);
        const positionStr = topPositions
          .map((p: StockPosition) => `${p.stock_name}(${p.percentage.toFixed(2)}%)`)
          .join('、');
        lines.push(`   - 主要持仓：${positionStr}`);
      }
    } else {
      lines.push(`   - 暂无持仓信息`);
    }

    return lines.join('\n');
  }).join('\n\n');
}

/**
 * 分析财经快讯对用户持有基金的影响
 * @param config AI 配置
 * @param news 快讯数据
 * @param funds 用户持有的基金列表
 * @param onChunk 可选的流式回调
 * @returns AI 分析结果
 */
export async function analyzeNewsImpact(
  config: AIConfiguration,
  news: FastNewsItem,
  funds: MarketFund[],
  onChunk?: StreamCallback
): Promise<{ content: string; success: boolean; error?: string }> {
  const template = getById(TEMPLATE_IDS.NEWS_IMPACT_ANALYSIS);

  if (!template) {
    console.error('[newsAIAnalysisService] 模板未找到');
    return {
      content: '未找到启用的快讯分析模板',
      success: false,
      error: '未找到启用的快讯分析模板'
    };
  }

  const portfolioWithProfile = formatPortfolioWithProfile(funds);
  const newsLevel = news.titleColor === 3 ? '重要' : '普通';
  const newsSummary = news.summary || '无摘要';

  const variables = {
    newsTitle: news.title,
    newsSummary,
    newsTime: news.showTime,
    newsLevel,
    portfolioWithProfile
  };

  try {
    const result = await queryAIWithTemplate(config, template, variables, onChunk);

    return result;
  } catch (error: any) {
    return {
      content: '',
      success: false,
      error: error.message || 'AI请求异常'
    };
  }
}