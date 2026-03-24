import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { Ticker, VirtualTradeResult, HistoricalPoint, ValuationData } from '../types';
import { fetchFundHistory } from '../services/fundService';
import { runVirtualTrade } from '../services/virtualTradeEngine';
import { defaultVirtualCash, strategyConfig } from '../services/strategyConfig';
import ThumbsUpIcon from './ThumbsUpIcon';
import { SimpleTooltip } from './SimpleTooltip';
import { computeMultipleSMAs } from '../utils/movingAverage';
import { toLocalDateKey } from '../utils/priceResolver';
import { getUnitsForDate } from '../utils/positionHelper';
import { computeProfitTimeline } from '../utils/profitCalculator';
import useTrades from '../hooks/useTrades';
import { adjustProfitTimelineForDisplay } from '../utils/profitAdjustment';
import { formatMoneyWithSeparators } from '../utils/format';
import { resolvePreferredPrice } from '../utils/priceResolver';
import { calculateRealProfit, getStoredPosition, getTradesForFund } from '../utils/realProfitCalculator';
import { loadAllStrategies } from '../services/strategyRegistry';


interface InvestmentNoticeModalProps {
  portfolio: Ticker[];
  onClose: () => void;
  onSelectFund: (symbol: string) => void;
  marketData?: Record<string, ValuationData>; // Add optional market data to pass to virtual trade engine
}

type StrategyType = string; // Dynamic strategy type instead of hardcoded ones

interface InvestmentRecommendation {
  fund: Ticker;
  realProfit: number | null; // New field for real trading P&L
  realProfitLoading: boolean; // Flag for loading state
  bestStrategy?: string | null; // This will be computed in the useMemo
  [key: string]: any; // Allow dynamic strategy properties (strategyName and strategyNameProfit)
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
        // Load strategies once when component mounts
        const allStrategies = await loadAllStrategies();
        const strategyMap: Record<string, any> = {};
        allStrategies.forEach(s => {
          strategyMap[s.key] = s.strategy;
        });

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
            // Use the dynamically loaded strategies instead of hardcoded ones
            const strategyResults: Record<string, VirtualTradeResult> = {};

            for (const [key, strategy] of Object.entries(strategyMap)) {
              try {
                strategyResults[key] = runVirtualTrade(strategy, sortedHistory, {
                  startDate: finalStartDate,  // Use VirtualTradeModal's default date logic
                  initialCash: finalInitialCash,  // Use VirtualTradeModal's cash calculation logic
                  initialShares: finalInitialShares,  // Use VirtualTradeModal's shares calculation logic
                  currentPrice: valuation?.currentPrice ?? currentPrice,
                  realtimeDate: valuation?.realtimeDate ?? toLocalDateKey(new Date()),
                  previousPrice: valuation?.previousPrice ?? null, // Use valuation.previousPrice like VirtualTradeModal
                  netWorthDate: valuation?.netWorthDate,
                });
              } catch (error) {
                console.error(`Error running strategy ${key} for fund ${fund.symbol}:`, error);
                // Provide a default result if strategy fails
                strategyResults[key] = { timeline: [], summary: { initialTotal: 0, finalTotal: 0, totalProfit: 0 }, todayTip: null };
              }
            }

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

            // Create recommendation record using the dynamically obtained results
            // Ensure it follows the expected interface for compatibility with UI
            const recommendation: InvestmentRecommendation = {
              fund,
              realProfit, // Add the calculated real profit
              realProfitLoading: false, // Initially not loading since it's calculated synchronously
            };

            // Add strategy results dynamically
            for (const [key, result] of Object.entries(strategyResults)) {
              // Store strategy recommendation and profit dynamically
              (recommendation as any)[key] = result.todayTip;
              (recommendation as any)[`${key}Profit`] = result.summary.totalProfit;
            }

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
            // Get all strategy keys from the recommendation (those ending in 'Profit')
            const strategyKeys = Object.keys(rec).filter(key =>
              key.endsWith('Profit') && key !== 'realProfit' // Exclude realProfit
            ).map(key => key.replace('Profit', '')); // Get the base strategy names

            // Check if all strategies recommend hold (or are null)
            const allHold = strategyKeys.every(strategyKey => {
              const action = rec[strategyKey]?.action;
              return action === 'hold' || rec[strategyKey] === null;
            });

            return !allHold; // Keep funds where not all strategies recommend hold
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

  // Get available strategy names from configuration to use for table rendering
  const availableStrategyKeys = useMemo(() => {
    if (recommendations.length > 0) {
      // Extract strategy keys from the first recommendation by checking for properties that end with 'Profit' but aren't 'realProfit'
      const firstRec = recommendations[0];
      return Object.keys(firstRec).filter(key =>
        key.endsWith('Profit') && key !== 'realProfit' && key !== 'realProfitLoading'
      ).map(key => key.replace('Profit', ''));
    }
    // Fallback: get from config
    return []; // No default strategies since they should be dynamically determined
  }, [recommendations]);

  // Calculate best strategy for each fund (highest profit among ALL strategies)
  const recommendationsWithBest = useMemo(() => {
    const result = recommendations.map(rec => {
      // Find all strategy profit fields (those ending in 'Profit')
      const strategyProfitFields = Object.keys(rec).filter(key =>
        key.endsWith('Profit') && key !== 'realProfit' // Exclude realProfit
      );

      // Build profit array for all strategies (including hold)
      const allProfits = strategyProfitFields.map(key => {
        const strategyName = key.replace('Profit', ''); // Get base name
        return {
          name: strategyName,
          profit: rec[key]
        };
      });

      // If no strategies exist, then no best strategy
      if (allProfits.length === 0) {
        return {
          ...rec,
          bestStrategy: null,
        };
      }

      // Find strategy with highest profit among ALL strategies (including hold strategies)
      const bestStrategy = allProfits.reduce((max, current) =>
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
  const renderRecommendationCell = (
    tip: VirtualTradeResult['todayTip'],
    fundSymbol: string,
    fundName: string,
    strategy: StrategyType,
    strategyProfit: number // Add this new parameter
  ) => {
    // If no tip, just show dash
    if (!tip) {
      // Format and display profit only
      const formattedProfit = formatMoneyWithSeparators(strategyProfit, 2);
      const profitClass = strategyProfit > 0 ? 'text-red-600' : strategyProfit < 0 ? 'text-green-600' : '';

      return (
        <div className="flex flex-col">
          <span className={`inline whitespace-nowrap text-xs ${profitClass}`}>策略总盈亏：{formattedProfit}</span>
          <span className="text-black">-</span>
        </div>
      );
    }

    // If hold action, just show dash
    if (tip.action === 'hold') {
      const formattedProfit = formatMoneyWithSeparators(strategyProfit, 2);
      const profitClass = strategyProfit > 0 ? 'text-red-600' : strategyProfit < 0 ? 'text-green-600' : '';

      return (
        <div className="flex flex-col">
          <span className={`inline whitespace-nowrap text-xs ${profitClass}`}>策略总盈亏：{formattedProfit}</span>
          <span className="text-black">-</span>
        </div>
      );
    }

    // Format tip and profit
    const displayShares = tip.shares.toFixed(2);
    const isBuy = tip.action === 'buy';
    const actionText = isBuy ? '买入' : '卖出';
    const displayContent = `${actionText} ${displayShares} 份`;

    const formattedProfit = formatMoneyWithSeparators(strategyProfit, 2);
    const profitClass = strategyProfit > 0 ? 'text-red-600' : strategyProfit < 0 ? 'text-green-600' : '';

    return (
      <div className="flex flex-col">
        <span className={`inline whitespace-nowrap text-xs ${profitClass}`}>策略总盈亏：{formattedProfit}</span>
        <a
          href="#"
          className={`${isBuy ? 'text-green-600' : 'text-red-600'} underline text-xs`}
          onClick={(e) => {
            e.preventDefault();
            goToVirtualTrade(fundSymbol, fundName, strategy);
          }}
        >
          {displayContent}
        </a>
      </div>
    );
  };

  const renderCellWithThumbsUp = (
    tip: VirtualTradeResult['todayTip'],
    fundSymbol: string,
    fundName: string,
    strategy: StrategyType,
    isBest: boolean,
    strategyProfit: number,
    recommendation?: { strategy_id: string; reason: string }  // 新增参数
  ) => {
    const isRecommendedForThisStrategy =
      recommendation &&
      recommendation.strategy_id === strategy &&
      availableStrategyKeys.includes(recommendation.strategy_id);

    // 如果有图标要显示，返回图标列内容；否则返回 null
    if (isRecommendedForThisStrategy || isBest) {
      return (
        <div className="flex flex-col items-start gap-1">
          {isRecommendedForThisStrategy && (
            <SimpleTooltip content={recommendation!.reason}>
              <i className="fas fa-star text-amber-500 cursor-help" title="AI 推荐策略" />
            </SimpleTooltip>
          )}
          {isBest && (
            <ThumbsUpIcon className="text-amber-500" title="当前收益最高" />
          )}
        </div>
      );
    }
    return null;
  };

  const renderRecommendationCellOnly = (
    tip: VirtualTradeResult['todayTip'],
    fundSymbol: string,
    fundName: string,
    strategy: StrategyType,
    strategyProfit: number
  ) => {
    return renderRecommendationCell(tip, fundSymbol, fundName, strategy, strategyProfit);
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
                      {availableStrategyKeys.map((strategyKey, idx) => (
                        <Fragment key={`col-group-${strategyKey}`}>
                          <col style={{ width: `${60 / availableStrategyKeys.length}%` }} />
                          <col style={{ width: '3%' }} />
                        </Fragment>
                      ))}
                      <col style={{ width: '15%' }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-gray-50">
                      <tr className="border-b border-gray-200">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">基金名称</th>
                        {availableStrategyKeys.map((strategyKey) => {
                          // Get the strategy meta to display the Chinese name
                          const strategyMeta = strategyConfig[strategyKey];
                          const displayName = strategyMeta?.name || strategyKey;
                          return (
                            <Fragment key={`header-group-${strategyKey}`}>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                                {displayName}
                              </th>
                              <th className="px-1 py-2 text-left text-xs font-semibold text-gray-500"></th>
                            </Fragment>
                          );
                        })}
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
                          {availableStrategyKeys.map((strategyKey) => {
                            const strategyTip = (rec as any)[strategyKey]; // Use type assertion to handle dynamic property access
                            const strategyProfit = (rec as any)[`${strategyKey}Profit`]; // Get stored profit
                            const isBestStrategy = rec.bestStrategy === strategyKey;

                            // 高亮条件：今日操作不为"不操作" + 是最佳策略 + 策略总盈亏 > 实盘盈亏
                            const shouldHighlight =
                              strategyTip !== null &&
                              strategyTip?.action !== 'hold' &&
                              isBestStrategy &&
                              strategyProfit > (rec.realProfit ?? -Infinity);

                            return (
                              <Fragment key={`cell-group-${rec.fund.symbol}-${strategyKey}`}>
                                <td
                                  className={`px-3 py-2 text-left text-xs ${shouldHighlight ? 'border-2 border-amber-400 bg-amber-50' : ''}`}
                                >
                                  {renderRecommendationCellOnly(
                                    strategyTip,
                                    rec.fund.symbol,
                                    rec.fund.name || rec.fund.symbol,
                                    strategyKey,
                                    strategyProfit
                                  )}
                                </td>
                                <td className="px-1 py-2 text-left text-xs align-top">
                                  {renderCellWithThumbsUp(
                                    strategyTip,
                                    rec.fund.symbol,
                                    rec.fund.name || rec.fund.symbol,
                                    strategyKey,
                                    isBestStrategy,
                                    strategyProfit,
                                    rec.fund.recommended_strategy
                                  )}
                                </td>
                              </Fragment>
                            );
                          })}
                          <td className="px-3 py-2 text-left text-xs align-top">
                            {renderRealProfitCell(rec.realProfit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-10 bg-gray-50">
                      <tr className="border-t border-gray-200">
                        <td colSpan={2 + availableStrategyKeys.length * 2} className="px-3 py-2 text-left text-xs font-bold text-gray-700">
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