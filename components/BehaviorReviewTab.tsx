import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BehaviorAnalysis, OverallFundRow, BehaviorScore } from '../types';
import { calculateBehaviorAnalysis, calculateBehaviorAnalysisByPeriod } from '../utils/behaviorAnalysis';
import { getTradesForSymbol } from '../hooks/useTrades';
import { fetchFundHistory } from '../services/fundService';
import BehaviorDetailModal from './BehaviorDetailModal';

// 历史净值缓存（避免重复获取）
const navHistoryCache = new Map<string, { date: number; value: number; equityReturn: number }[]>();

// 获取历史净值（带缓存）
async function getNavHistoryWithCache(symbol: string): Promise<{ date: number; value: number; equityReturn: number }[] | null> {
  // 检查缓存
  if (navHistoryCache.has(symbol)) {
    return navHistoryCache.get(symbol)!;
  }

  // 获取数据
  const history = await fetchFundHistory(symbol);
  if (!history || history.length === 0) {
    return null;
  }

  // 转换并缓存
  const navHistory = history.map(h => ({
    date: h.date as number,
    value: h.value,
    equityReturn: h.equityReturn || 0
  }));

  navHistoryCache.set(symbol, navHistory);
  return navHistory;
}

interface BehaviorReviewTabProps {
  symbols?: string[];
  fromDate: string | null;
  toDate: string | null;
  tableRows: OverallFundRow[];
  allFundRows?: OverallFundRow[]; // 完整的基金列表（用于显示基金名称，不受时间范围过滤）
  onSelectFund?: (symbol: string) => void;
  selectedFund: string | null;
  onSelectedFundChange: (symbol: string | null) => void;
}

// 辅助函数：获取评级标签
function getGradeLabel(score: number): string {
  if (score >= 90) return '优秀';
  if (score >= 75) return '良好';
  if (score >= 60) return '一般';
  return '较差';
}

const BehaviorReviewTab: React.FC<BehaviorReviewTabProps> = ({
  symbols,
  fromDate,
  toDate,
  tableRows,
  allFundRows = [],
  onSelectFund,
  selectedFund,
  onSelectedFundChange
}) => {
  // 行为分析结果
  const [analysis, setAnalysis] = useState<BehaviorAnalysis | null>(null);
  const [previousScore, setPreviousScore] = useState<BehaviorScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 详情浮层状态
  const [detailType, setDetailType] = useState<'score' | 'frequency' | 'emotion' | 'timing' | null>(null);

  // 预计算基金名称查找Map（避免渲染时O(n)查找）
  const allFundRowsMap = useMemo(() => {
    const map = new Map<string, OverallFundRow>();
    for (const row of allFundRows) {
      map.set(row.symbol, row);
    }
    return map;
  }, [allFundRows]);

  const tableRowsMap = useMemo(() => {
    const map = new Map<string, OverallFundRow>();
    for (const row of tableRows) {
      map.set(row.symbol, row);
    }
    return map;
  }, [tableRows]);

  // 获取选中的基金名称
  const selectedFundName = useMemo(() => {
    if (!selectedFund) return '';
    const row = allFundRowsMap.get(selectedFund) || tableRowsMap.get(selectedFund);
    return row ? `${row.name} (${String(selectedFund).padStart(6, '0')})` : String(selectedFund).padStart(6, '0');
  }, [selectedFund, allFundRowsMap, tableRowsMap]);

  // 获取行为分析数据
  useEffect(() => {
    let mounted = true;

    const fetchAnalysis = async () => {
      setLoading(true);
      setError(null);

      try {
        // 确定要分析的基金
        const targetSymbol = selectedFund;

        if (!targetSymbol) {
          // 整体组合分析
          const allSymbols = symbols || tableRows.map(r => r.symbol);
          if (!allSymbols || allSymbols.length === 0) {
            if (mounted) {
              setAnalysis(null);
              setLoading(false);
            }
            return;
          }

          // 并行获取所有基金的历史净值数据
          const fundDataMap = new Map<string, {
            trades: typeof getTradesForSymbol extends (s: string) => infer R ? R : never;
            navHistory: { date: number; value: number; equityReturn: number }[];
          }>();

          await Promise.all(allSymbols.map(async (symbol) => {
            const trades = getTradesForSymbol(symbol) || [];
            if (trades.length === 0) return;

            const navHistory = await getNavHistoryWithCache(symbol);
            if (!navHistory) return;

            fundDataMap.set(symbol, { trades, navHistory });
          }));

          if (fundDataMap.size === 0) {
            if (mounted) {
              setAnalysis(null);
              setLoading(false);
            }
            return;
          }

          // 计算当前评分
          const dateRange = (fromDate && toDate) ? { from: fromDate, to: toDate } : undefined;
          const allAnalyses: BehaviorAnalysis[] = [];
          let totalBuyCount = 0;
          let totalSellCount = 0;
          let totalFeeRate = 0;
          let fundCount = 0;

          for (const [symbol, data] of fundDataMap.entries()) {
            const result = calculateBehaviorAnalysis(
              data.trades.map(t => ({
                id: t.id || `${t.date}-${t.type}`,
                date: t.date,
                type: t.type,
                shares: t.shares,
                price: t.price || 0,
                fee: t.fee || 0,
                symbol
              })),
              data.navHistory,
              dateRange
            );

            if (result.frequency.trades.length > 0) {
              allAnalyses.push(result);
              totalBuyCount += result.frequency.buyCount;
              totalSellCount += result.frequency.sellCount;
              totalFeeRate += result.frequency.feeRate;
              fundCount++;
            }
          }

          if (allAnalyses.length === 0) {
            if (mounted) {
              setAnalysis(null);
              setLoading(false);
            }
            return;
          }

          // 汇总分析结果
          const avgTimingScore = allAnalyses.reduce((sum, a) => sum + a.timing.avgScore, 0) / allAnalyses.length;
          const avgTiming = Math.round(avgTimingScore * 0.5);
          const avgEmotion = Math.round(allAnalyses.reduce((sum, a) => sum + a.score.emotion, 0) / allAnalyses.length);
          const avgDiscipline = Math.round(allAnalyses.reduce((sum, a) => sum + a.score.discipline, 0) / allAnalyses.length);

          const portfolioAnalysis: BehaviorAnalysis = {
            score: {
              total: avgTiming + avgEmotion + avgDiscipline,
              timing: avgTiming,
              emotion: avgEmotion,
              discipline: avgDiscipline
            },
            frequency: {
              buyCount: totalBuyCount,
              sellCount: totalSellCount,
              avgHoldingDays: 0,
              feeRate: fundCount > 0 ? totalFeeRate / fundCount : 0,
              trades: allAnalyses.flatMap(a => a.frequency.trades)
            },
            emotion: {
              chaseHighSellLow: allAnalyses.flatMap(a => a.emotion.chaseHighSellLow),
              frequentLossTrade: allAnalyses.flatMap(a => a.emotion.frequentLossTrade),
              fomoBuy: allAnalyses.flatMap(a => a.emotion.fomoBuy)
            },
            timing: {
              avgScore: Math.round(avgTimingScore),
              good: allAnalyses.flatMap(a => a.timing.good),
              normal: allAnalyses.flatMap(a => a.timing.normal),
              bad: allAnalyses.flatMap(a => a.timing.bad),
              details: allAnalyses.flatMap(a => a.timing.details)
            }
          };

          // 计算历史对比（使用缓存的数据）
          if (fromDate) {
            const previousAnalyses: BehaviorAnalysis[] = [];

            for (const [symbol, data] of fundDataMap.entries()) {
              const previousTrades = data.trades.filter(t => t.date < fromDate);
              if (previousTrades.length === 0) continue;

              const earliestDate = previousTrades.reduce((min, t) => t.date < min ? t.date : min, previousTrades[0].date);

              const prevAnalysis = calculateBehaviorAnalysisByPeriod(
                previousTrades.map(t => ({
                  id: t.id || `${t.date}-${t.type}`,
                  date: t.date,
                  type: t.type,
                  shares: t.shares,
                  price: t.price || 0,
                  fee: t.fee || 0,
                  symbol
                })),
                data.navHistory,
                earliestDate,
                fromDate
              );

              if (prevAnalysis.frequency.trades.length > 0) {
                previousAnalyses.push(prevAnalysis);
              }
            }

            if (previousAnalyses.length > 0) {
              const avgPrevTiming = previousAnalyses.reduce((sum, a) => sum + a.timing.avgScore, 0) / previousAnalyses.length;
              const avgPrevTimingScore = Math.round(avgPrevTiming * 0.5);
              const avgPrevEmotion = Math.round(previousAnalyses.reduce((sum, a) => sum + a.score.emotion, 0) / previousAnalyses.length);
              const avgPrevDiscipline = Math.round(previousAnalyses.reduce((sum, a) => sum + a.score.discipline, 0) / previousAnalyses.length);

              const previousPortfolioScore: BehaviorScore = {
                total: avgPrevTimingScore + avgPrevEmotion + avgPrevDiscipline,
                timing: avgPrevTimingScore,
                emotion: avgPrevEmotion,
                discipline: avgPrevDiscipline
              };

              if (mounted) {
                setPreviousScore(previousPortfolioScore);
              }
            } else {
              if (mounted) {
                setPreviousScore(null);
              }
            }
          }

          if (mounted) {
            setAnalysis(portfolioAnalysis);
            setLoading(false);
          }
          return;
        }

        // 单个基金分析
        const trades = getTradesForSymbol(targetSymbol) || [];
        if (trades.length === 0) {
          if (mounted) {
            setAnalysis(null);
            setLoading(false);
          }
          return;
        }

        // 获取历史净值数据（使用缓存）
        const navHistory = await getNavHistoryWithCache(targetSymbol);
        if (!navHistory) {
          if (mounted) {
            setError('无法获取历史净值数据');
            setLoading(false);
          }
          return;
        }

        // 计算行为分析
        const dateRange = (fromDate && toDate) ? { from: fromDate, to: toDate } : undefined;
        const result = calculateBehaviorAnalysis(
          trades.map(t => ({
            id: t.id || `${t.date}-${t.type}`,
            date: t.date,
            type: t.type,
            shares: t.shares,
            price: t.price || 0,
            fee: t.fee || 0,
            symbol: targetSymbol
          })),
          navHistory,
          dateRange
        );

        // 检查结果是否有效
        if (result.frequency.trades.length === 0) {
          if (mounted) {
            setAnalysis(null);
            setPreviousScore(null);
            setLoading(false);
          }
          return;
        }

        // 计算历史对比（使用缓存的数据）
        if (fromDate) {
          const previousTrades = trades.filter(t => t.date < fromDate);
          if (previousTrades.length > 0) {
            const earliestDate = previousTrades.reduce((min, t) => t.date < min ? t.date : min, previousTrades[0].date);

            const previousAnalysis = calculateBehaviorAnalysisByPeriod(
              previousTrades.map(t => ({
                id: t.id || `${t.date}-${t.type}`,
                date: t.date,
                type: t.type,
                shares: t.shares,
                price: t.price || 0,
                fee: t.fee || 0,
                symbol: targetSymbol
              })),
              navHistory,
              earliestDate,
              fromDate
            );

            if (mounted) {
              setPreviousScore(previousAnalysis.score);
            }
          } else {
            if (mounted) {
              setPreviousScore(null);
            }
          }
        }

        if (mounted) {
          setAnalysis(result);
          setLoading(false);
        }
      } catch (e: any) {
        if (mounted) {
          setError(e?.message || '获取行为分析数据失败');
          setLoading(false);
        }
      }
    };

    fetchAnalysis();

    return () => { mounted = false; };
  }, [selectedFund, symbols, tableRows, fromDate, toDate]);

  // 处理重置
  const handleReset = () => {
    onSelectedFundChange(null);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {/* 模式指示器 */}
        <div className="bg-blue-50 px-3 py-2 rounded-lg flex justify-between items-center" style={{ height: '34px' }}>
          <span className="text-sm">
            当前显示：<strong className="font-medium">
              {selectedFund ? selectedFundName : '整体组合'}
            </strong>的行为分析
          </span>
          <button
            type="button"
            onClick={handleReset}
            className={`text-xs text-blue-600 bg-transparent border border-blue-600 px-3 py-1 rounded transition-all hover:bg-blue-50 ${
              selectedFund ? 'visible' : 'invisible'
            }`}
          >
            重置
          </button>
        </div>

        {/* 加载中提示 */}
        <div className="flex items-center justify-center bg-white border border-gray-200 rounded-lg" style={{ minHeight: '140px' }}>
          <div className="text-center text-gray-500">加载中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {/* 模式指示器 */}
        <div className="bg-blue-50 px-3 py-2 rounded-lg flex justify-between items-center" style={{ height: '34px' }}>
          <span className="text-sm">
            当前显示：<strong className="font-medium">
              {selectedFund ? selectedFundName : '整体组合'}
            </strong>的行为分析
          </span>
          <button
            type="button"
            onClick={handleReset}
            className={`text-xs text-blue-600 bg-transparent border border-blue-600 px-3 py-1 rounded transition-all hover:bg-blue-50 ${
              selectedFund ? 'visible' : 'invisible'
            }`}
          >
            重置
          </button>
        </div>

        {/* 错误提示 */}
        <div className="flex items-center justify-center bg-white border border-gray-200 rounded-lg" style={{ minHeight: '140px' }}>
          <div className="text-center text-red-500">{error}</div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="space-y-4">
        {/* 模式指示器 */}
        <div className="bg-blue-50 px-3 py-2 rounded-lg flex justify-between items-center" style={{ height: '34px' }}>
          <span className="text-sm">
            当前显示：<strong className="font-medium">
              {selectedFund ? selectedFundName : '整体组合'}
            </strong>的行为分析
          </span>
          <button
            type="button"
            onClick={handleReset}
            className={`text-xs text-blue-600 bg-transparent border border-blue-600 px-3 py-1 rounded transition-all hover:bg-blue-50 ${
              selectedFund ? 'visible' : 'invisible'
            }`}
          >
            重置
          </button>
        </div>

        {/* 无交易记录提示 - 占位区域，保持高度一致 */}
        <div className="flex items-center justify-center bg-white border border-gray-200 rounded-lg" style={{ minHeight: '140px' }}>
          <div className="flex flex-col items-center justify-center text-gray-400">
            <i className="fas fa-folder-open text-3xl mb-3" />
            <p className="text-sm font-medium">
              {selectedFund ? '该基金暂无交易记录' : '整体组合暂无交易记录'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 模式指示器 */}
      <div className="bg-blue-50 px-3 py-2 rounded-lg flex justify-between items-center" style={{ height: '34px' }}>
        <span className="text-sm">
          当前显示：<strong className="font-medium">
            {selectedFund ? selectedFundName : '整体组合'}
          </strong>的行为分析
        </span>
        <button
          type="button"
          onClick={handleReset}
          className={`text-xs text-blue-600 bg-transparent border border-blue-600 px-3 py-1 rounded transition-all hover:bg-blue-50 ${
            selectedFund ? 'visible' : 'invisible'
          }`}
        >
          重置
        </button>
      </div>

      {/* 卡片区 */}
      <div className="flex gap-3">
        {/* 行为评分卡片 */}
        <div
          className="flex-1 bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow flex flex-col"
          style={{ minHeight: '140px' }}
          onClick={() => setDetailType('score')}
        >
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-2">行为评分</div>
            <div className="text-2xl font-bold text-green-600">
              {analysis?.score.total ?? '--'}分
              {previousScore && (
                <span className={`text-sm ml-2 ${
                  analysis && analysis.score.total > previousScore.total ? 'text-green-600' :
                  analysis && analysis.score.total < previousScore.total ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {analysis && analysis.score.total > previousScore.total && '↑'}
                  {analysis && analysis.score.total < previousScore.total && '↓'}
                  {analysis && analysis.score.total === previousScore.total && '→'}
                  {analysis && analysis.score.total !== previousScore.total &&
                    ` ${analysis.score.total > previousScore.total ? '+' : ''}${analysis.score.total - previousScore.total}`
                  }
                </span>
              )}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              {analysis ? getGradeLabel(analysis.score.total) : '--'}
            </div>
            {previousScore ? (
              <div className="text-xs text-gray-400 mt-2">
                历史: {previousScore.total}分
              </div>
            ) : fromDate ? (
              <div className="text-xs text-gray-400 mt-2">
                数据量不足
              </div>
            ) : null}
          </div>
          <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
            点击查看详情
          </div>
        </div>

        {/* 交易频率卡片 */}
        <div
          className="flex-1 bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow flex flex-col"
          style={{ minHeight: '140px' }}
          onClick={() => setDetailType('frequency')}
        >
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-2">交易频率</div>
            <div className="text-lg font-bold">
              买入{analysis?.frequency.buyCount ?? 0}次
            </div>
            <div className="text-sm text-gray-600 mt-1">
              卖出{analysis?.frequency.sellCount ?? 0}次
            </div>
          </div>
          <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
            点击查看详情
          </div>
        </div>

        {/* 情绪识别卡片 */}
        <div
          className="flex-1 bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow flex flex-col"
          style={{ minHeight: '140px' }}
          onClick={() => setDetailType('emotion')}
        >
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-2">情绪化交易</div>
            <div className="text-sm text-red-600 mt-1">
              追涨杀跌: {analysis?.emotion.chaseHighSellLow.length ?? 0}次
            </div>
            <div className="text-sm text-orange-600 mt-1">
              频繁调仓: {analysis?.emotion.frequentLossTrade.length ?? 0}次
            </div>
            <div className="text-sm text-yellow-600 mt-1">
              FOMO买入: {analysis?.emotion.fomoBuy.length ?? 0}次
            </div>
          </div>
          <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
            点击查看详情
          </div>
        </div>

        {/* 时机评分卡片 */}
        <div
          className="flex-1 bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow flex flex-col"
          style={{ minHeight: '140px' }}
          onClick={() => setDetailType('timing')}
        >
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-2">时机评分</div>
            <div className="text-2xl font-bold text-blue-600">
              {analysis?.timing.avgScore ?? '--'}分
            </div>
            <div className="text-xs mt-2">
              <span className="text-green-600">好: {analysis?.timing.good.length ?? 0}</span>
              {' | '}
              <span className="text-gray-600">一般: {analysis?.timing.normal.length ?? 0}</span>
              {' | '}
              <span className="text-red-600">差: {analysis?.timing.bad.length ?? 0}</span>
            </div>
          </div>
          <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
            点击查看详情
          </div>
        </div>
      </div>

      {/* 详情浮层 */}
      {detailType && analysis && (
        <BehaviorDetailModal
          type={detailType}
          analysis={analysis}
          tableRows={tableRows}
          previousScore={previousScore}
          onClose={() => setDetailType(null)}
        />
      )}
    </div>
  );
};

export default BehaviorReviewTab;