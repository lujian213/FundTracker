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
  sideBySide?: boolean;  // 是否并排显示（与B窗口同时显示）
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
  marketData = {},
  sideBySide = false
}) => {
  const [draftData, setDraftData] = useState<Record<string, DraftEntry>>({});
  const [copied, setCopied] = useState(false);
  const [selectedFunds, setSelectedFunds] = useState<Set<string>>(new Set()); // 选中的基金

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

  // 切换单个基金的选中状态
  const toggleFundSelection = (fundSymbol: string) => {
    setSelectedFunds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fundSymbol)) {
        newSet.delete(fundSymbol);
      } else {
        newSet.add(fundSymbol);
      }
      return newSet;
    });
  };

  // 全选/取消全选（只选择有金额的行）
  const toggleSelectAll = () => {
    const fundsWithAmount = fundsWithPositions
      .filter(fund => {
        const entry = draftData[fund.symbol];
        return entry && entry.operation !== '不操作' && entry.amount;
      })
      .map(fund => fund.symbol);

    setSelectedFunds(prev => {
      // 如果所有有金额的基金都已选中，则取消全选
      if (fundsWithAmount.every(sym => prev.has(sym))) {
        return new Set();
      }
      // 否则全选所有有金额的基金
      return new Set(fundsWithAmount);
    });
  };

  const handleCopyToClipboard = () => {
    // Format the content according to the specified format
    // 只复制被选中的记录
    const todayTips = fundsWithPositions
      .map(fund => draftData[fund.symbol])
      .filter(entry => entry && entry.operation !== '不操作' && entry.amount && selectedFunds.has(entry.fundSymbol))
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
    const valuation = enhancedValuation || marketData[fundSymbol];

    if (!valuation || !valuation.currentPrice) return '-';

    const shares = amount / valuation.currentPrice;
    return formatCurrency(shares, 2);
  };

  const getGainLoss = (fundSymbol: string): string => {
    // Use enhanced valuation from cacheService which includes validation logic
    const enhancedValuation = cacheService.getValuation(fundSymbol);

    // If enhanced valuation is not available, fallback to marketData
    const valuation = enhancedValuation || marketData[fundSymbol];

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
    const valuation = enhancedValuation || marketData[fundSymbol];

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
    <div className="fixed inset-0 z-[130] flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onClose} />
      <div
        className="relative bg-white w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col pointer-events-auto h-[61.95vh] transition-transform duration-300 ease-in-out"
        style={{ transform: sideBySide ? 'translateX(calc(-50vw + 28rem + 32px))' : 'translateX(0)' }}
      >
        <div className="px-6 pt-3 pb-1 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold">投资计划草稿</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyToClipboard}
              className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100"
              title={copied ? '已复制' : '复制内容到剪贴板'}
            >
              <i className={`fas fa-${copied ? 'check text-green-500' : 'copy'}`}></i>
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

        <div className="px-6 pt-2 pb-1 flex-shrink-0">
          <p className="text-xs text-gray-600">
            这是您的投资计划草稿，用于规划今天的投资操作。计划仅保存当天，第二天会自动清空。
          </p>
        </div>

        <div className="px-6 flex-1 min-h-0 pb-1">
          <div className="border border-gray-100 rounded-xl overflow-hidden h-full flex flex-col">
            <div className="overflow-x-auto flex-1" style={{ overflowY: 'auto' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="border-b border-gray-200" style={{ height: '35px' }}>
                    <th className="px-2 py-1 text-center text-xs font-semibold text-gray-500 min-w-[28px] w-[28px]">
                      <input
                        type="checkbox"
                        checked={(() => {
                          const fundsWithAmount = fundsWithPositions.filter(fund => {
                            const entry = draftData[fund.symbol];
                            return entry && entry.operation !== '不操作' && entry.amount;
                          });
                          return fundsWithAmount.length > 0 && fundsWithAmount.every(fund => selectedFunds.has(fund.symbol));
                        })()}
                        onChange={toggleSelectAll}
                        className="w-3 h-3 cursor-pointer"
                        title="全选/取消全选有金额的记录"
                      />
                    </th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[140px] w-[140px]">基金名称</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[90px] w-[90px]">实时估值</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[90px] w-[90px]">前值</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[80px] w-[80px]">涨跌幅</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[100px] w-[100px]">操作</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[100px] w-[100px]">金额</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[100px] w-[100px]">份额</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[40px] w-[40px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {fundsWithPositions.length > 0 ? (
                    fundsWithPositions.map((fund, index) => {
                      const entry = draftData[fund.symbol] || { operation: '不操作', amount: '' };

                      // Try to get enhanced valuation from cacheService first, fallback to marketData
                      const enhancedValuation = cacheService.getValuation(fund.symbol);
                      const valuation = enhancedValuation || marketData[fund.symbol];

                      return (
                        <tr key={fund.symbol} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`} style={{ height: '40px' }}>
                          {/* 复选框列 - 只有有金额的行才能选中 */}
                          <td className="px-1 py-1 text-center">
                            {entry.operation !== '不操作' && entry.amount ? (
                              <input
                                type="checkbox"
                                checked={selectedFunds.has(fund.symbol)}
                                onChange={() => toggleFundSelection(fund.symbol)}
                                className="w-3 h-3 cursor-pointer"
                              />
                            ) : (
                              <span className="text-gray-300 text-xs">-</span>
                            )}
                          </td>
                          <td
                            className="px-2 py-1 text-left text-xs text-gray-700 cursor-pointer hover:underline truncate max-w-[140px] overflow-hidden"
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

                          <td className="px-2 py-1 text-left text-xs">
                            <div className="truncate flex items-center" style={{ maxWidth: '90px' }}>
                              {(() => {
                                // Use enhanced valuation from cacheService which includes validation logic
                                const enhancedValuation = cacheService.getValuation(fund.symbol);

                                // If enhanced valuation is not available, fallback to marketData
                                const valuation = enhancedValuation || marketData[fund.symbol];

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

                          <td className="px-2 py-1 text-left text-xs">
                            <div className="truncate flex items-center" style={{ maxWidth: '90px' }}>
                              {(() => {
                                // Use enhanced valuation from cacheService which includes validation logic
                                const enhancedValuation = cacheService.getValuation(fund.symbol);

                                // If enhanced valuation is not available, fallback to marketData
                                const valuation = enhancedValuation || marketData[fund.symbol];

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

                          <td className={`px-2 py-1 text-left text-xs font-medium ${getGainLossColor(fund.symbol)}`}>
                            <div className="truncate" style={{ maxWidth: '80px' }}>
                              {getGainLoss(fund.symbol)}
                            </div>
                          </td>

                          <td className="px-2 py-1 text-left text-xs">
                            <select
                              value={entry.operation}
                              onChange={(e) => handleOperationChange(fund.symbol, e.target.value as '买入' | '卖出' | '不操作')}
                              className="w-[80px] p-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            >
                              <option value="不操作">不操作</option>
                              <option value="买入">买入</option>
                              <option value="卖出">卖出</option>
                            </select>
                          </td>

                          <td className="px-2 py-1 text-left text-xs">
                            <div className="w-[80px] h-full flex items-center">
                              {entry.operation === '不操作' ? (
                                <span className="text-gray-400 text-xs">-</span>
                              ) : (
                                <input
                                  type="text"
                                  value={entry.amount}
                                  onChange={(e) => handleAmountChange(fund.symbol, e.target.value)}
                                  placeholder="金额"
                                  className="w-full p-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              )}
                            </div>
                          </td>

                          <td className="px-2 py-1 text-left text-xs">
                            <div className="truncate" style={{ maxWidth: '80px' }}>
                              {calculateShares(fund.symbol)}
                            </div>
                          </td>

                          <td className="px-2 py-1 text-center text-xs">
                            <button
                              onClick={() => handleReset(fund.symbol)}
                              className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                              title="重置"
                            >
                              <i className="fas fa-undo text-xs"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-2 text-center text-sm text-gray-500" style={{ height: '40px' }}>
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
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
          <div className="flex justify-end space-x-6">
            <span>买入：{buyCount}只 / {formatCurrency(buyTotal, 2)}</span>
            <span>卖出：{sellCount}只 / {formatCurrency(sellTotal, 2)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default InvestmentDraftModal;