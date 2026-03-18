import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Ticker, ValuationData, BackupPosition } from '../types';
import { fetchFundData } from '../services/fundService';  // Import fetchFundData
import { toLocalDateKey } from '../utils/priceResolver';
import * as cacheService from '../services/cacheService';  // Import cacheService for enhanced valuation

interface InvestmentDraftModalProps {
  portfolio: Ticker[];
  onClose: () => void;
  onSelectFund?: (symbol: string) => void;  // Optional callback to select a fund
  marketData?: Record<string, ValuationData>;
}

interface DraftEntry {
  fundSymbol: string;
  operation: '买入' | '卖出' | '不操作';
  amount: string;
}

const InvestmentDraftModal: React.FC<InvestmentDraftModalProps> = ({
  portfolio,
  onClose,
  onSelectFund,
  marketData = {}
}) => {
  const [draftData, setDraftData] = useState<Record<string, DraftEntry>>({});
  const [copied, setCopied] = useState(false);

  // Initialize draft data from localStorage and filter for funds with fullCapacity
  useEffect(() => {
    const today = toLocalDateKey(new Date());
    const storedKey = `investment_draft_${today}`;

    try {
      const stored = localStorage.getItem(storedKey);
      const existingData = stored ? JSON.parse(stored) : {};

      // Filter portfolio to only include funds that have position configuration with fullCapacity
      const fundsWithPositions = portfolio.filter(fund => {
        try {
          const rawKey = `fund_position_${fund.symbol}`;
          const padKey = `fund_position_${String(fund.symbol).padStart(6, '0')}`;
          const raw = localStorage.getItem(rawKey) || localStorage.getItem(padKey);
          if (raw) {
            const cfg: BackupPosition = JSON.parse(raw);
            return cfg && typeof cfg.fullCapacity === 'number' && cfg.fullCapacity > 0;
          }
        } catch (e) {
          return false;
        }
        return false;
      });

      // Initialize draft data with existing data or default values
      const initialDraftData: Record<string, DraftEntry> = {};

      fundsWithPositions.forEach(fund => {
        initialDraftData[fund.symbol] = existingData[fund.symbol] || {
          fundSymbol: fund.symbol,
          operation: '不操作',
          amount: ''
        };
      });

      setDraftData(initialDraftData);
    } catch (e) {
      console.error('Error initializing draft data:', e);
    }
  }, [portfolio]);

  // Effect to update calculations when marketData changes (to reflect live updates)
  useEffect(() => {
    // Only reset refreshedMarketData when new marketData comes in from parent
    // This will trigger re-calculation of all dependent values (gain/loss, shares, etc.)
    setRefreshedMarketData(marketData || {});
  }, [marketData]);

  // Save draft data to localStorage whenever it changes
  useEffect(() => {
    const today = toLocalDateKey(new Date());
    const storedKey = `investment_draft_${today}`;

    try {
      localStorage.setItem(storedKey, JSON.stringify(draftData));
    } catch (e) {
      console.error('Error saving draft data:', e);
    }
  }, [draftData]);

  // Effect to update calculations when marketData changes (to reflect live updates)
  useEffect(() => {
    // Only reset refreshedMarketData when new marketData comes in from parent
    // This will trigger re-calculation of all dependent values (gain/loss, shares, etc.)
    setRefreshedMarketData(marketData || {});
  }, [marketData]);

  // Filter portfolio to only include funds with fullCapacity and sort by gain/loss percentage
  const fundsWithPositions = [...portfolio].filter(fund => {
    try {
      const rawKey = `fund_position_${fund.symbol}`;
      const padKey = `fund_position_${String(fund.symbol).padStart(6, '0')}`;
      const raw = localStorage.getItem(rawKey) || localStorage.getItem(padKey);
      if (raw) {
        const cfg: BackupPosition = JSON.parse(raw);
        return cfg && typeof cfg.fullCapacity === 'number' && cfg.fullCapacity > 0;
      }
    } catch (e) {
      return false;
    }
    return false;
  }).sort((a, b) => {
    const today = toLocalDateKey(new Date());

    // 使用 cacheService.getValuation 获取增强估值数据，与表格显示逻辑一致
    const valA = cacheService.getValuation(a.symbol) || marketData[a.symbol];
    const valB = cacheService.getValuation(b.symbol) || marketData[b.symbol];

    // 判断是否有当日估值：realtimeDate 等于今天日期
    const hasTodayValuationA = valA?.realtimeDate === today;
    const hasTodayValuationB = valB?.realtimeDate === today;

    // A类（有当日估值）排在B类（无当日估值）前面
    if (hasTodayValuationA && !hasTodayValuationB) return -1;
    if (!hasTodayValuationA && hasTodayValuationB) return 1;

    // 同类内部按涨跌幅降序排序（最高涨幅在前）
    const changeA = valA?.changePercentage ?? -9999;
    const changeB = valB?.changePercentage ?? -9999;
    return changeB - changeA;
  });

  const handleOperationChange = (fundSymbol: string, operation: '买入' | '卖出' | '不操作') => {
    setDraftData(prev => ({
      ...prev,
      [fundSymbol]: {
        ...prev[fundSymbol],
        operation,
        ...(operation === '不操作' ? { amount: '' } : {})
      }
    }));
  };

  const handleAmountChange = (fundSymbol: string, amount: string) => {
    // Only allow numeric input
    if (/^\d*\.?\d*$/.test(amount) || amount === '') {
      setDraftData(prev => ({
        ...prev,
        [fundSymbol]: {
          ...prev[fundSymbol],
          amount
        }
      }));
    }
  };

  const handleReset = (fundSymbol: string) => {
    setDraftData(prev => {
      const resetEntry: DraftEntry = {
        fundSymbol,
        operation: '不操作',
        amount: ''
      };

      const newData = {
        ...prev,
        [fundSymbol]: resetEntry
      };

      // Also save to localStorage immediately to ensure consistency
      const today = toLocalDateKey(new Date());
      const storedKey = `investment_draft_${today}`;
      try {
        localStorage.setItem(storedKey, JSON.stringify(newData));
      } catch (e) {
        console.error('Error saving draft data after reset:', e);
      }

      return newData;
    });
  };

  const handleCopyToClipboard = () => {
    // Format the content according to the specified format
    const todayTips = fundsWithPositions
      .map(fund => draftData[fund.symbol])
      .filter(entry => entry && entry.operation !== '不操作' && entry.amount)
      .map(entry => {
        const fund = portfolio.find(f => f.symbol === entry.fundSymbol);
        const fundName = fund?.name || entry.fundSymbol;
        const amount = Number(entry.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const shares = calculateShares(entry.fundSymbol);
        return `${fundName}: ${entry.operation} ${amount}，预计份额 ${shares}`;
      })
      .join('\n');

    const formattedContent = `今日操作\n\n${todayTips}`;

    navigator.clipboard.writeText(formattedContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  };

  // State to track refresh status
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshedMarketData, setRefreshedMarketData] = useState<Record<string, ValuationData> | undefined>();

  // Refresh valuation data by resetting to the latest marketData passed to the component
  // This preserves user inputs while ensuring we display the most recently available cached data
  const handleRefresh = () => {
    setIsRefreshing(true);
    try {
      // Reset to use the latest marketData passed from parent component
      // This represents the most recently cached data without additional network calls
      setRefreshedMarketData(marketData || {});
    } catch (error) {
      console.error("Error during refresh:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatCurrency = (value: number, decimals: number = 2): string => {
    if (isNaN(value) || !isFinite(value)) return '-';

    return value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  const formatDateMMDD = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
      const day = String(date.getDate()).padStart(2, '0');
      return `${month}/${day}`;
    } catch {
      return '--/--';
    }
  };


  // Calculate buy/sell counts and totals
  const { buyCount, sellCount, buyTotal, sellTotal } = useMemo(() => {
    let buyCount = 0;
    let sellCount = 0;
    let buyTotal = 0;
    let sellTotal = 0;

    for (const fund of fundsWithPositions) {
      const entry = draftData[fund.symbol];
      if (entry) {
        if (entry.operation === '买入' && entry.amount) {
          buyCount++;
          const amount = parseFloat(entry.amount);
          if (!isNaN(amount)) {
            buyTotal += amount;
          }
        } else if (entry.operation === '卖出' && entry.amount) {
          sellCount++;
          const amount = parseFloat(entry.amount);
          if (!isNaN(amount)) {
            sellTotal += amount;
          }
        }
      }
    }

    return { buyCount, sellCount, buyTotal, sellTotal };
  }, [draftData, fundsWithPositions]);

  const calculateShares = (fundSymbol: string): string => {
    const entry = draftData[fundSymbol];
    if (!entry || entry.operation === '不操作' || !entry.amount) return '-';

    const amount = parseFloat(entry.amount);
    if (isNaN(amount)) return '-';

    // Use enhanced valuation from cacheService which includes validation logic
    const enhancedValuation = cacheService.getValuation(fundSymbol);

    // If enhanced valuation is not available, fallback to marketData
    const valuation = enhancedValuation || (refreshedMarketData || marketData || {})[fundSymbol];

    if (!valuation || !valuation.currentPrice) return '-';

    const shares = amount / valuation.currentPrice;
    return formatCurrency(shares, 2);
  };

  const getGainLoss = (fundSymbol: string): string => {
    // Use enhanced valuation from cacheService which includes validation logic
    const enhancedValuation = cacheService.getValuation(fundSymbol);

    // If enhanced valuation is not available, fallback to marketData
    const valuation = enhancedValuation || (refreshedMarketData || marketData || {})[fundSymbol];

    if (!valuation) return '-';

    // Use the changePercentage directly to ensure consistency with sorting
    if (typeof valuation.changePercentage === 'number') {
      const changePercentage = valuation.changePercentage;
      return `${changePercentage >= 0 ? '+' : ''}${changePercentage.toFixed(2)}%`;
    }

    // Fallback to calculation if changePercentage is not available
    if (!valuation.currentPrice || !valuation.previousPrice) return '-';

    const gainLoss = ((valuation.currentPrice - valuation.previousPrice) / valuation.previousPrice) * 100;
    return `${gainLoss >= 0 ? '+' : ''}${gainLoss.toFixed(2)}%`;
  };

  const getGainLossColor = (fundSymbol: string): string => {
    // Use enhanced valuation from cacheService which includes validation logic
    const enhancedValuation = cacheService.getValuation(fundSymbol);

    // If enhanced valuation is not available, fallback to marketData
    const valuation = enhancedValuation || (refreshedMarketData || marketData || {})[fundSymbol];

    if (!valuation) return 'text-gray-400';

    // Use the changePercentage directly to ensure consistency with sorting
    if (typeof valuation.changePercentage === 'number') {
      const changePercentage = valuation.changePercentage;
      return changePercentage >= 0 ? 'text-red-600' : 'text-green-600';
    }

    // Fallback to calculation if changePercentage is not available
    if (!valuation.currentPrice || !valuation.previousPrice) return 'text-gray-400';

    const gainLoss = ((valuation.currentPrice - valuation.previousPrice) / valuation.previousPrice) * 100;
    return gainLoss >= 0 ? 'text-red-600' : 'text-green-600';
  };

  const content = (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-6xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold">投资计划草稿</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center"
              title={isRefreshing ? '正在刷新...' : '刷新估值数据'}
            >
              <i className={`fas fa-sync ${isRefreshing ? 'animate-spin' : ''}`}></i>
            </button>
            <button
              onClick={handleCopyToClipboard}
              className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center"
              title={copied ? '已复制' : '复制内容到剪贴板'}
            >
              <i className={`fas fa-${copied ? 'check' : 'copy'}`}></i>
            </button>
            <button
              aria-label="关闭投资计划窗口"
              className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100"
              onClick={onClose}
            >
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        <div className="p-6 flex-1 min-h-0">
          <p className="text-sm text-gray-600 mb-4">
            这是您的投资计划草稿，用于规划今天的投资操作。计划仅保存当天，第二天会自动清空。
          </p>

          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="border-b border-gray-200" style={{ height: '35px' }}>
                    <th className="px-4 py-1 text-left text-xs font-semibold text-gray-500 min-w-[140px] w-[140px]">基金名称</th>
                    <th className="px-4 py-1 text-left text-xs font-semibold text-gray-500 min-w-[100px] w-[100px]">实时估值</th>
                    <th className="px-4 py-1 text-left text-xs font-semibold text-gray-500 min-w-[100px] w-[100px]">前值</th>
                    <th className="px-4 py-1 text-left text-xs font-semibold text-gray-500 min-w-[80px] w-[80px]">涨跌幅</th>
                    <th className="px-4 py-1 text-left text-xs font-semibold text-gray-500 min-w-[100px] w-[100px]">操作</th>
                    <th className="px-4 py-1 text-left text-xs font-semibold text-gray-500 min-w-[100px] w-[100px]">金额</th>
                    <th className="px-4 py-1 text-left text-xs font-semibold text-gray-500 min-w-[100px] w-[100px]">份额</th>
                    <th className="px-4 py-1 text-left text-xs font-semibold text-gray-500 min-w-[80px] w-[80px]">重置</th>
                  </tr>
                </thead>
                <tbody>
                  {fundsWithPositions.length > 0 ? (
                    fundsWithPositions.map((fund, index) => {
                      const entry = draftData[fund.symbol] || { operation: '不操作', amount: '' };
                      // Use refreshed market data if available, otherwise use original marketData
                      const currentMarketData = refreshedMarketData || marketData || {};

                      // Try to get enhanced valuation from cacheService first, fallback to marketData
                      const enhancedValuation = cacheService.getValuation(fund.symbol);
                      const valuation = enhancedValuation || currentMarketData[fund.symbol];

                      return (
                        <tr key={fund.symbol} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`} style={{ height: '40px' }}>
                          <td
                            className="px-4 py-1 text-left text-xs text-gray-700 cursor-pointer hover:underline truncate max-w-[140px] overflow-hidden"
                            onClick={() => {
                              // Save current state before navigating
                              const today = toLocalDateKey(new Date());
                              const storedKey = `investment_draft_${today}`;
                              try {
                                localStorage.setItem(storedKey, JSON.stringify(draftData));
                              } catch (e) {
                                console.error('Error saving draft data:', e);
                              }

                              // Trigger the callback to select the fund, which will open fund details
                              if (onSelectFund) {
                                onSelectFund(fund.symbol);
                              }
                            }}
                            title={fund.name || fund.symbol}
                          >
                            <div className="truncate" style={{ maxWidth: '140px' }}>{fund.name || fund.symbol}</div>
                          </td>

                          <td className="px-4 py-1 text-left text-xs">
                            <div className="truncate flex items-center" style={{ maxWidth: '100px' }}>
                              {(() => {
                                // Use enhanced valuation from cacheService which includes validation logic
                                const enhancedValuation = cacheService.getValuation(fund.symbol);

                                // If enhanced valuation is not available, fallback to marketData
                                const valuation = enhancedValuation || (refreshedMarketData || marketData || {})[fund.symbol];

                                if (valuation && valuation.currentPrice) {
                                  return (
                                    <>
                                      {formatCurrency(valuation.currentPrice, 4)}
                                      <span className={valuation.realtimeDate !== toLocalDateKey(new Date()) ? 'bg-yellow-200 px-1 rounded ml-1 text-[9px]' : 'ml-1 text-[9px]'}>
                                        ({valuation.realtimeDate ? formatDateMMDD(valuation.realtimeDate) : '-'})
                                      </span>
                                    </>
                                  );
                                } else {
                                  return '-';
                                }
                              })()}
                            </div>
                          </td>

                          <td className="px-4 py-1 text-left text-xs">
                            <div className="truncate flex items-center" style={{ maxWidth: '100px' }}>
                              {(() => {
                                // Use enhanced valuation from cacheService which includes validation logic
                                const enhancedValuation = cacheService.getValuation(fund.symbol);

                                // If enhanced valuation is not available, fallback to marketData
                                const valuation = enhancedValuation || (refreshedMarketData || marketData || {})[fund.symbol];

                                if (valuation && valuation.previousPrice) {
                                  return (
                                    <>
                                      {formatCurrency(valuation.previousPrice, 4)}
                                      <span className="ml-1 text-[9px]">
                                        ({valuation.netWorthDate ? formatDateMMDD(valuation.netWorthDate) : '-'})
                                      </span>
                                    </>
                                  );
                                } else {
                                  return '-';
                                }
                              })()}
                            </div>
                          </td>

                          <td className={`px-4 py-1 text-left text-xs font-medium ${getGainLossColor(fund.symbol)}`}>
                            <div className="truncate" style={{ maxWidth: '80px' }}>
                              {getGainLoss(fund.symbol)}
                            </div>
                          </td>

                          <td className="px-4 py-1 text-left text-xs">
                            <select
                              value={entry.operation}
                              onChange={(e) => handleOperationChange(fund.symbol, e.target.value as '买入' | '卖出' | '不操作')}
                              className="w-[100px] p-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            >
                              <option value="不操作">不操作</option>
                              <option value="买入">买入</option>
                              <option value="卖出">卖出</option>
                            </select>
                          </td>

                          <td className="px-4 py-1 text-left text-xs">
                            <div className="w-[100px] h-full flex items-center">
                              {entry.operation === '不操作' ? (
                                <span className="text-gray-400 text-xs">-</span>
                              ) : (
                                <input
                                  type="text"
                                  value={entry.amount}
                                  onChange={(e) => handleAmountChange(fund.symbol, e.target.value)}
                                  placeholder="输入金额"
                                  className="w-full p-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-1 text-left text-xs">
                            <div className="truncate" style={{ maxWidth: '100px' }}>
                              {calculateShares(fund.symbol)}
                            </div>
                          </td>

                          <td className="px-4 py-1 text-left text-xs">
                            <button
                              onClick={() => handleReset(fund.symbol)}
                              className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors whitespace-nowrap"
                            >
                              重置
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-2 text-center text-sm text-gray-500" style={{ height: '40px' }}>
                        没有配置仓位的基金
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Summary section - buy and sell counts and totals */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-700 flex justify-end">
          <div className="flex space-x-8">
            <span>买入基金：{buyCount}只</span>
            <span>买入总额：{formatCurrency(buyTotal, 2)}</span>
            <span>卖出基金：{sellCount}只</span>
            <span>卖出总额：{formatCurrency(sellTotal, 2)}</span>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
          <p>注：投资计划草稿仅保存当天数据，第二天会自动清空。</p>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default InvestmentDraftModal;