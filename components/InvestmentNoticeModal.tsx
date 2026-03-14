import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Ticker, VirtualTradeResult, HistoricalPoint, ValuationData } from '../types';
import { fetchFundHistory } from '../services/fundService';
import { runVirtualTrade } from '../services/virtualTradeEngine';
import {
  trendFollowingStrategy
} from '../services/virtualTradeStrategies/trendFollowing';
import {
  meanReversionStrategy
} from '../services/virtualTradeStrategies/meanReversion';
import {
  constantMixStrategy
} from '../services/virtualTradeStrategies/constantMix';
import { defaultVirtualCash } from '../services/strategyConfig';
import ThumbsUpIcon from './ThumbsUpIcon';
import { computeMultipleSMAs } from '../utils/movingAverage';
import { toLocalDateKey } from '../utils/priceResolver';
import { getUnitsForDate } from '../utils/positionHelper';
import { computeProfitTimeline } from '../utils/profitCalculator';
import useTrades from '../hooks/useTrades';
import { adjustProfitTimelineForDisplay } from '../utils/profitAdjustment';
import { formatMoneyWithSeparators } from '../utils/format';
import { resolvePreferredPrice } from '../utils/priceResolver';
import { calculateRealProfit, getStoredPosition, getTradesForFund } from '../utils/realProfitCalculator';


interface InvestmentNoticeModalProps {
  portfolio: Ticker[];
  onClose: () => void;
  onSelectFund: (symbol: string) => void;
  marketData?: Record<string, ValuationData>; // Add optional market data to pass to virtual trade engine
}

// Define strategy type for navigation
type StrategyType = 'trendFollowing' | 'meanReversion' | 'constantMix';

interface InvestmentRecommendation {
  fund: Ticker;
  trendFollowing: VirtualTradeResult['todayTip'];
  meanReversion: VirtualTradeResult['todayTip'];
  constantMix: VirtualTradeResult['todayTip'];
  trendFollowingProfit: number;
  meanReversionProfit: number;
  constantMixProfit: number;
  realProfit: number | null; // New field for real trading P&L
  realProfitLoading: boolean; // Flag for loading state
}

const InvestmentNoticeModal: React.FC<InvestmentNoticeModalProps> = ({
  portfolio,
  onClose,
  onSelectFund,
  marketData
}) => {
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<InvestmentRecommendation[]>([]);

  useEffect(() => {
    let cancelled = false;

    // Use setTimeout to move the heavy computation off the initial render
    const fetchAndProcessData = async () => {
      try {
        // First, get all fund histories and prepare for processing with VirtualTradeModal-consistent parameters
        const fundDataPromises = portfolio.map(async (fund) => {
          try {
            const history = await fetchFundHistory(fund.symbol);

            if (history.length === 0) {
              // Skip fund with no history data
              return null;
            }

            // Sort history ascending
            const sortedHistory = [...history].sort((a, b) => a.date - b.date);

            // Get stored position config following VirtualTradeModal's logic
            const getStoredStartDate = () => {
              try {
                const rawKey = `fund_position_${fund.symbol}`;
                const padKey = `fund_position_${String(fund.symbol).padStart(6, '0')}`;
                const raw = localStorage.getItem(rawKey) || localStorage.getItem(padKey);
                if (!raw) return null;
                const cfg = JSON.parse(raw);
                return cfg && typeof cfg.startDate === 'string' && cfg.startDate ? cfg.startDate : null;
              } catch (e) {
                return null;
              }
            };

            // Use VirtualTradeModal's default start date logic: localStorage start date or 90 days ago
            const getFallbackStartDate = () => {
              const d = new Date();
              d.setDate(d.getDate() - 90);
              return toLocalDateKey(d);
            };

            const getDefaultStartDate = () => {
              const stored = getStoredStartDate();
              if (stored) return stored;
              return getFallbackStartDate();
            };

            // Determine the start date to use following VirtualTradeModal's logic
            const virtualTradeStartDate = getDefaultStartDate();

            // Clamp to history bounds to ensure date is valid for this fund
            const clampDateToHistoryBounds = (date: string, sourceHistory: HistoricalPoint[] | null) => {
              if (!sourceHistory || sourceHistory.length === 0) return date;
              const sorted = [...sourceHistory].sort((a, b) => (a.date as number) - (b.date as number));
              const earliestIso = toLocalDateKey(sorted[0].date);
              const latestIso = toLocalDateKey(sorted[sourceHistory.length - 1].date);
              if (date < earliestIso) return earliestIso;
              if (date > latestIso) return latestIso;
              return date;
            };

            const finalStartDate = clampDateToHistoryBounds(virtualTradeStartDate, sortedHistory);

            // Calculate initialShares following VirtualTradeModal's auto-fill logic
            let initialShares = 0;
            try {
              const units = await getUnitsForDate(fund.symbol, finalStartDate, defaultVirtualCash);
              initialShares = units || 0;
            } catch (e) {
              console.error(`Failed to calculate initial shares for ${fund.symbol}:`, e);
              // Fallback: calculate based on defaultVirtualCash and start NAV
              const startDatePoint = sortedHistory.find(h => toLocalDateKey(h.date) === finalStartDate);
              if (startDatePoint && startDatePoint.value > 0) {
                initialShares = defaultVirtualCash / startDatePoint.value;
              }
            }

            return {
              fund,
              history: sortedHistory,
              startDate: finalStartDate,  // Use VirtualTradeModal's default date logic
              initialShares  // Use VirtualTradeModal's shares calculation logic
            };
          } catch (err) {
            console.error(`Error getting shares for fund ${fund.symbol}:`, err);
            return null;
          }
        });

        // Wait for all fund data to be prepared
        const fundShareData = await Promise.all(fundDataPromises);

        // Filter out null results
        const validFundData = fundShareData.filter(Boolean);

        const results: InvestmentRecommendation[] = [];

        // Process funds one by one with the already obtained shares data
        for (const fundData of validFundData) {
          if (!fundData || cancelled) continue;

          const { fund, history: sortedHistory, startDate, initialShares } = fundData;

          // Get valuation data for this fund if marketData is provided
          const valuation = marketData ? marketData[fund.symbol] : null;

          try {
// Precompute SMAs for this history to share between strategies (similar to VirtualTradeModal)
            // Note: We're no longer using local cache here since we removed the cache in runVirtualTrade
            // The computeMultipleSMAs function handles the calculations directly

            // Get stored position config following VirtualTradeModal's logic
            const getStoredStartDate = () => {
              try {
                const rawKey = `fund_position_${fund.symbol}`;
                const padKey = `fund_position_${String(fund.symbol).padStart(6, '0')}`;
                const raw = localStorage.getItem(rawKey) || localStorage.getItem(padKey);
                if (!raw) return null;
                const cfg = JSON.parse(raw);
                return cfg && typeof cfg.startDate === 'string' && cfg.startDate ? cfg.startDate : null;
              } catch (e) {
                return null;
              }
            };

            // Use VirtualTradeModal's default start date logic: localStorage start date or 90 days ago
            const getFallbackStartDate = () => {
              const d = new Date();
              d.setDate(d.getDate() - 90);
              return toLocalDateKey(d);
            };

            const getDefaultStartDate = () => {
              const stored = getStoredStartDate();
              if (stored) return stored;
              return getFallbackStartDate();
            };

            // Determine the start date to use following VirtualTradeModal's logic
            const virtualTradeStartDate = getDefaultStartDate();

            // Clamp to history bounds to ensure date is valid for this fund
            const clampDateToHistoryBounds = (date: string, sourceHistory: HistoricalPoint[] | null) => {
              if (!sourceHistory || sourceHistory.length === 0) return date;
              const sorted = [...sourceHistory].sort((a, b) => (a.date as number) - (b.date as number));
              const earliestIso = toLocalDateKey(sorted[0].date);
              const latestIso = toLocalDateKey(sorted[sourceHistory.length - 1].date);
              if (date < earliestIso) return earliestIso;
              if (date > latestIso) return latestIso;
              return date;
            };

            const finalStartDate = clampDateToHistoryBounds(virtualTradeStartDate, sortedHistory);

            // Calculate initialShares following VirtualTradeModal's auto-fill logic
            // This matches the same logic used in VirtualTradeModal's useEffect for shares auto-fill
            let finalInitialShares = 0;
            try {
              const units = await getUnitsForDate(fund.symbol, finalStartDate, defaultVirtualCash);
              finalInitialShares = units || 0;
            } catch (e) {
              console.error(`Failed to calculate initial shares for ${fund.symbol}:`, e);
              // Fallback: calculate based on defaultVirtualCash and start NAV
              const startDatePoint = sortedHistory.find(h => toLocalDateKey(h.date) === finalStartDate);
              if (startDatePoint && startDatePoint.value > 0) {
                finalInitialShares = defaultVirtualCash / startDatePoint.value;
              }
            }

            // Calculate initialCash following VirtualTradeModal's logic
            let finalInitialCash = defaultVirtualCash; // Default fallback
            try {
              // Read fullCapacity from localStorage following VirtualTradeModal's logic
              let fullCapacity = 0;
              try {
                const rawKey = `fund_position_${fund.symbol}`;
                const padKey = `fund_position_${String(fund.symbol).padStart(6, '0')}`;
                const raw = localStorage.getItem(rawKey) || localStorage.getItem(padKey);
                if (raw) {
                  const cfg = JSON.parse(raw);
                  fullCapacity = Number(cfg.fullCapacity) || 0;
                }
              } catch (e) {
                // ignore
              }

              if (fullCapacity > 0) {
                // Get current shares on startDate (finalInitialShares as calculated above)
                const shares = finalInitialShares || 0;
                // Get NAV on startDate
                const startDatePoint = sortedHistory.find(h => toLocalDateKey(h.date) === finalStartDate);
                const nav = startDatePoint ? startDatePoint.value : null;

                if (nav !== null && nav > 0) {
                  const cash = (fullCapacity - shares) * nav;
                  finalInitialCash = Math.max(cash, 0);
                }
              }
            } catch (e) {
              console.error(`Failed to calculate initial cash for ${fund.symbol}:`, e);
              // Keep default value
            }

            const currentPrice = sortedHistory[sortedHistory.length - 1]?.value;

            // Run all strategies with parameters matching VirtualTradeModal's default behavior

            const trendResult = runVirtualTrade(trendFollowingStrategy, sortedHistory, {
              startDate: finalStartDate,  // Use VirtualTradeModal's default date logic
              initialCash: finalInitialCash,  // Use VirtualTradeModal's cash calculation logic
              initialShares: finalInitialShares,  // Use VirtualTradeModal's shares calculation logic
              currentPrice: valuation?.currentPrice ?? currentPrice,
              realtimeDate: valuation?.realtimeDate ?? toLocalDateKey(new Date()),
              previousPrice: valuation?.previousPrice ?? null, // Use valuation.previousPrice like VirtualTradeModal
              netWorthDate: valuation?.netWorthDate,
            });

            const meanRevResult = runVirtualTrade(meanReversionStrategy, sortedHistory, {
              startDate: finalStartDate,  // Use VirtualTradeModal's default date logic
              initialCash: finalInitialCash,  // Use VirtualTradeModal's cash calculation logic
              initialShares: finalInitialShares,  // Use VirtualTradeModal's shares calculation logic
              currentPrice: valuation?.currentPrice ?? currentPrice,
              realtimeDate: valuation?.realtimeDate ?? toLocalDateKey(new Date()),
              previousPrice: valuation?.previousPrice ?? null, // Use valuation.previousPrice like VirtualTradeModal
              netWorthDate: valuation?.netWorthDate,
            });

            const constMixResult = runVirtualTrade(constantMixStrategy, sortedHistory, {
              startDate: finalStartDate,  // Use VirtualTradeModal's default date logic
              initialCash: finalInitialCash,  // Use VirtualTradeModal's cash calculation logic
              initialShares: finalInitialShares,  // Use VirtualTradeModal's shares calculation logic
              currentPrice: valuation?.currentPrice ?? currentPrice,
              realtimeDate: valuation?.realtimeDate ?? toLocalDateKey(new Date()),
              previousPrice: valuation?.previousPrice ?? null, // Use valuation.previousPrice like VirtualTradeModal
              netWorthDate: valuation?.netWorthDate,
            });

            // Get market data for this fund if marketData is provided
            const fundMarketData = marketData ? marketData[fund.symbol] : null;

            // Calculate real profit for this fund using shared utility
            const storedPosition = getStoredPosition(fund.symbol);
            const trades = getTradesForFund(fund.symbol);
            const realProfit = await calculateRealProfit(
              fund.symbol,
              finalStartDate,
              sortedHistory,
              storedPosition,
              trades,
              fundMarketData
            );

            // Create recommendation record using the parameters consistent with VirtualTradeModal
            const recommendation: InvestmentRecommendation = {
              fund,
              trendFollowing: trendResult.todayTip,
              meanReversion: meanRevResult.todayTip,
              constantMix: constMixResult.todayTip,
              trendFollowingProfit: trendResult.summary.totalProfit,
              meanReversionProfit: meanRevResult.summary.totalProfit,
              constantMixProfit: constMixResult.summary.totalProfit,
              realProfit, // Add the calculated real profit
              realProfitLoading: false, // Initially not loading since it's calculated synchronously
            };

            results.push(recommendation);

          } catch (err) {
            // Continue with other funds
          }

          // Yield to main thread periodically to keep UI responsive
          if (results.length % 5 === 0) { // Every 5 funds
            await new Promise(resolve => setTimeout(resolve, 0));
            if (cancelled) return;
          }
        }

        if (!cancelled) {
          // Filter out funds where all strategies recommend hold
          const filteredResults = results.filter(rec => {
            return !(
              (rec.trendFollowing?.action === 'hold' || rec.trendFollowing === null) &&
              (rec.meanReversion?.action === 'hold' || rec.meanReversion === null) &&
              (rec.constantMix?.action === 'hold' || rec.constantMix === null)
            );
          });

          setRecommendations(filteredResults);
        }
      } catch (err) {
        console.error('Error in InvestmentNoticeModal:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    // Start processing after a small delay to ensure UI renders first
    const timer = setTimeout(fetchAndProcessData, 10);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [portfolio]);

  // Calculate best strategy for each fund
  const recommendationsWithBest = useMemo(() => {
    const result = recommendations.map(rec => {
      // Only consider strategies that have a buy/sell recommendation (not hold)
      const validProfits = [
        { name: 'trendFollowing', profit: rec.trendFollowingProfit, action: rec.trendFollowing?.action },
        { name: 'meanReversion', profit: rec.meanReversionProfit, action: rec.meanReversion?.action },
        { name: 'constantMix', profit: rec.constantMixProfit, action: rec.constantMix?.action },
      ].filter(item => item.action !== 'hold'); // Only consider non-hold strategies

      // If no valid strategies (all holds), then no best strategy
      if (validProfits.length === 0) {
        return {
          ...rec,
          bestStrategy: null,
        };
      }

      // Find strategy with highest profit among valid strategies
      const bestStrategy = validProfits.reduce((max, current) =>
        current.profit > max.profit ? current : max
      );

      return {
        ...rec,
        bestStrategy: bestStrategy.name,
      };
    });

    return result;
  }, [recommendations]);

  // Navigate to virtual trade modal for a specific fund and strategy
  const goToVirtualTrade = (fundSymbol: string, fundName: string, strategy: StrategyType) => {
    // This would trigger navigation to the virtual trade modal
    // In a real implementation, this might update a URL hash or trigger a state change
    onSelectFund(`${fundSymbol}?name=${encodeURIComponent(fundName)}&tab=${strategy}`); // Include fund name and strategy
  };

  // Render recommendation cell with proper styling
  const renderRecommendationCell = (tip: VirtualTradeResult['todayTip'], fundSymbol: string, fundName: string, strategy: StrategyType) => {
    if (!tip) {
      return <span className="text-black">-</span>;
    }

    if (tip.action === 'hold') {
      return <span className="text-black">-</span>;
    }

    const displayShares = tip.shares.toFixed(2);
    const isBuy = tip.action === 'buy';
    const actionText = isBuy ? '买入' : '卖出';
    const displayContent = `${actionText} ${displayShares} 份`;

    return (
      <a
        href="#"
        className={`${isBuy ? 'text-green-600' : 'text-red-600'} underline`}
        onClick={(e) => {
          e.preventDefault();
          goToVirtualTrade(fundSymbol, fundName, strategy);
        }}
      >
        {displayContent}
      </a>
    );
  };

  const renderCellWithThumbsUp = (tip: VirtualTradeResult['todayTip'], fundSymbol: string, fundName: string, strategy: StrategyType, isBest: boolean) => {
    const cellContent = renderRecommendationCell(tip, fundSymbol, fundName, strategy);

    // Only show thumbs up for strategies that recommend buy/sell (not hold) and is the best strategy
    if (tip && tip.action !== 'hold' && isBest) {
      return (
        <div className="flex items-center justify-start">
          {cellContent}
          <ThumbsUpIcon className="ml-1 text-amber-500" title="当前收益最高" />
        </div>
      );
    }

    return cellContent;
  };

  const renderRealProfitCell = (realProfit: number | null) => {
    if (realProfit === null) {
      return <span className="text-gray-400">—</span>;
    }

    const formattedValue = formatMoneyWithSeparators(realProfit, 2);
    const isPositive = realProfit > 0;
    const isNegative = realProfit < 0;

    return (
      <span className={isPositive ? 'text-red-600' : isNegative ? 'text-green-600' : ''}>
        {formattedValue}
      </span>
    );
  };

  const content = (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col" style={{ maxWidth: '64rem', maxHeight: '90vh' }} role="dialog" aria-modal="true">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold">今日投资提示</h3>
          <div className="flex items-center gap-2">
            <button aria-label="关闭投资提示窗口" className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100" onClick={onClose}>
              <i className="fas fa-times" />
            </button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-6">
              <i className="fas fa-circle-notch animate-spin text-red-500 text-3xl" />
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-3">正在计算投资建议...</p>
            </div>
          ) : recommendationsWithBest.length === 0 ? (
            <div className="text-sm text-gray-600">没有符合条件的投资建议</div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                以下是根据预设的交易策略计算出的投资提示，供您参考。请注意，虚拟交易的结果仅供参考，实际投资决策请谨慎考虑。
              </p>

              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="overflow-y-auto" style={{ maxHeight: '500px' }}>
                  <table className="w-full text-sm table-fixed border-collapse">
                    <colgroup>
                      <col style={{ width: '15%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '15%' }} />
                      <col style={{ width: '20%' }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-gray-50">
                      <tr className="border-b border-gray-200">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">基金名称</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">趋势追踪</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">均值回归</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">恒定混合</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">实盘盈亏</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recommendationsWithBest.map((rec, index) => (
                        <tr key={`${rec.fund.symbol}-${index}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td
                            className="px-3 py-2 text-left text-xs text-gray-700 cursor-pointer hover:underline truncate max-w-[150px]"
                            onClick={() => onSelectFund(rec.fund.symbol)}
                            title={rec.fund.name || rec.fund.symbol}
                          >
                            {rec.fund.name || rec.fund.symbol}
                          </td>
                          <td className="px-3 py-2 text-left text-xs">
                            {renderCellWithThumbsUp(
                              rec.trendFollowing,
                              rec.fund.symbol,
                              rec.fund.name || rec.fund.symbol,
                              'trendFollowing',
                              rec.bestStrategy === 'trendFollowing'
                            )}
                          </td>
                          <td className="px-3 py-2 text-left text-xs">
                            {renderCellWithThumbsUp(
                              rec.meanReversion,
                              rec.fund.symbol,
                              rec.fund.name || rec.fund.symbol,
                              'meanReversion',
                              rec.bestStrategy === 'meanReversion'
                            )}
                          </td>
                          <td className="px-3 py-2 text-left text-xs">
                            {renderCellWithThumbsUp(
                              rec.constantMix,
                              rec.fund.symbol,
                              rec.fund.name || rec.fund.symbol,
                              'constantMix',
                              rec.bestStrategy === 'constantMix'
                            )}
                          </td>
                          <td className="px-3 py-2 text-left text-xs">
                            {renderRealProfitCell(rec.realProfit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-10 bg-gray-50">
                      <tr className="border-t border-gray-200">
                        <td colSpan={5} className="px-3 py-2 text-left text-xs font-bold text-gray-700">
                          总计：{recommendationsWithBest.length}条记录
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default InvestmentNoticeModal;