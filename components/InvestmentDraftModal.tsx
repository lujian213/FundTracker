import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Ticker, ValuationData, BackupPosition, HistoricalPoint, MarketIndex } from '../types';
import { fetchFundData } from '../services/fundService';  // Import fetchFundData
import { toLocalDateKey } from '../utils/priceResolver';
import * as cacheService from '../services/cacheService';  // Import cacheService for enhanced valuation
import AIInvestmentDraftModal from './AIInvestmentDraftModal';
import { DraftEntry, AIAdviceEntry, generateAIInvestmentAdvice, hasDraftAction } from '../services/aiInvestmentDraftService';
import { getActiveAIConfig, hasUsableAIConfig } from '../services/aiConfigService';
import { ConfirmDialog } from './ConfirmDialog';
import SimpleTooltip from './SimpleTooltip';
import { formatMoneyWithSeparators } from '../utils/format';
import { getDraftModalHeight, saveDraftModalHeight } from '../services/userPreferenceService';
import { loadInvestmentDraft, saveInvestmentDraft, saveAllDraftsToStorage } from '../services/appDataService';

// 防抖延迟时间（毫秒）
const DEBOUNCE_DELAY = 500;

interface InvestmentDraftModalProps {
  portfolio: Ticker[];
  onClose: () => void;
  onSelectFund?: (symbol: string) => void;  // Optional callback to select a fund
  marketData?: Record<string, ValuationData>;
  sideBySide?: boolean;  // 是否并排显示（与B窗口同时显示）
  fundHistories?: Record<string, HistoricalPoint[]>;
  indexHistories?: Record<string, HistoricalPoint[]>;
  marketIndices?: MarketIndex[];
  globalIndices?: MarketIndex[];
}

const InvestmentDraftModal: React.FC<InvestmentDraftModalProps> = ({
  portfolio,
  onClose,
  onSelectFund,
  marketData = {},
  sideBySide = false,
  fundHistories,
  indexHistories,
  marketIndices,
  globalIndices
}) => {
  const [draftData, setDraftData] = useState<Record<string, DraftEntry>>({});
  const [copied, setCopied] = useState(false);
  const [selectedFunds, setSelectedFunds] = useState<Set<string>>(new Set()); // 选中的基金
  const [aiAdvice, setAIAdvice] = useState<Record<string, AIAdviceEntry>>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');
  const [aiAdviceLoading, setAIAdviceLoading] = useState(false);

  const [modalHeight, setModalHeight] = useState<number | null>(() => getDraftModalHeight());
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);
  const modalHeightRef = useRef<number | null>(null);

  // 监听详情窗口高度变化
  useEffect(() => {
    const checkHeight = () => {
      const detailHeight = (window as any).__detailModalHeight;
      if (detailHeight && Math.abs(detailHeight - (modalHeight || 0)) > 0.5) {
        setModalHeight(detailHeight);
        modalHeightRef.current = detailHeight;
      }
    };

    // 初始检查
    checkHeight();

    // 定期检查（在详情窗口打开后）
    const interval = setInterval(checkHeight, 100);
    return () => {
      clearInterval(interval);
      // 仅在组件卸载时保存最终高度
      if (modalHeightRef.current !== null) {
        saveDraftModalHeight(modalHeightRef.current);
      }
    };
  }, [modalHeight]);

  // Initialize draft data from localStorage and filter for funds with fullCapacity
  useEffect(() => {
    const today = toLocalDateKey(new Date());

    try {
      const existingData = loadInvestmentDraft(today);

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
          amount: '',
          note: ''
        };
      });

      setDraftData(initialDraftData);
    } catch (e) {
      console.error('Error initializing draft data:', e);
    }
  }, [portfolio]);

  // Save draft data with debounce
  // 内存缓存即时更新，localStorage 写入防抖
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftDataRef = useRef(draftData);
  draftDataRef.current = draftData;

  useEffect(() => {
    const today = toLocalDateKey(new Date());

    // 即时更新内存缓存
    saveInvestmentDraft(today, draftData);

    // 防抖写入 localStorage
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
    }

    draftSaveTimerRef.current = setTimeout(() => {
      saveAllDraftsToStorage();
    }, DEBOUNCE_DELAY);

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        // 组件卸载时立即保存
        saveAllDraftsToStorage();
      }
    };
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

  const handleNoteChange = (fundSymbol: string, note: string) => {
    setDraftData(prev => ({
      ...prev,
      [fundSymbol]: {
        ...prev[fundSymbol],
        note
      }
    }));
  };

  const handleAddValuationToNote = (fundSymbol: string) => {
    const enhancedValuation = cacheService.getValuation(fundSymbol);
    const valuation = enhancedValuation || marketData[fundSymbol];

    if (valuation && typeof valuation.changePercentage === 'number') {
      const changePercent = valuation.changePercentage;
      const sign = changePercent >= 0 ? '+' : '';
      setDraftData(prev => ({
        ...prev,
        [fundSymbol]: {
          ...prev[fundSymbol],
          note: `${sign}${changePercent.toFixed(2)}%`
        }
      }));
    }
  };

  const handleReset = (fundSymbol: string) => {
    setDraftData(prev => {
      const resetEntry: DraftEntry = {
        fundSymbol,
        operation: '不操作',
        amount: '',
        note: ''
      };

      return {
        ...prev,
        [fundSymbol]: resetEntry
      };
    });
  };

  const hasTableData = () => {
    return Object.values(draftData).some(hasDraftAction);
  };

  const handleAIAdviceClick = () => {
    if (hasTableData()) {
      setShowConfirmDialog(true);
    } else {
      executeAIAdvice();
    }
  };

  const handleConfirmClear = () => {
    setShowConfirmDialog(false);
    executeAIAdvice();
  };

  const executeAIAdvice = async () => {
    // 检查AI配置
    if (!hasUsableAIConfig()) {
      setErrorDialogMessage('AI未配置，请在系统设置中配置AI参数');
      setShowErrorDialog(true);
      return;
    }

    const config = getActiveAIConfig();
    if (!config) {
      setErrorDialogMessage('未找到激活的AI配置');
      setShowErrorDialog(true);
      return;
    }

    setAIAdviceLoading(true);

    // 清空表格数据
    const clearedDraftData: Record<string, DraftEntry> = {};
    fundsWithPositions.forEach(fund => {
      clearedDraftData[fund.symbol] = {
        fundSymbol: fund.symbol,
        operation: '不操作',
        amount: '',
        note: ''
      };
    });
    setDraftData(clearedDraftData);
    setAIAdvice({});
    setSelectedFunds(new Set());

    try {
      const result = await generateAIInvestmentAdvice(
        config,
        portfolio,
        fundHistories || {},
        indexHistories || {},
        marketIndices || [],
        globalIndices || [],
        marketData
      );

      if (!result.success) {
        setErrorDialogMessage(result.error || 'AI调用失败');
        setShowErrorDialog(true);
        return;
      }

      // 填充AI建议到表格
      const newDraftData: Record<string, DraftEntry> = { ...clearedDraftData };
      const newAIAdvice: Record<string, AIAdviceEntry> = {};

      for (const advice of result.advice) {
        const symbol = advice.fundCode;
        if (newDraftData[symbol]) {
          // 获取涨跌幅填充到注释
          const valuation = marketData[symbol];
          const changePercent = valuation?.changePercentage;
          const noteValue = typeof changePercent === 'number'
            ? `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`
            : '';

          newDraftData[symbol] = {
            fundSymbol: symbol,
            operation: advice.operation,
            amount: String(advice.amount),
            note: noteValue
          };
          newAIAdvice[symbol] = advice;
        }
      }

      setDraftData(newDraftData);
      setAIAdvice(newAIAdvice);
    } catch (e) {
      setErrorDialogMessage('AI调用失败，请检查网络连接或稍后重试');
      setShowErrorDialog(true);
    } finally {
      setAIAdviceLoading(false);
    }
  };

  // 修改重置函数，清除AI建议
  const handleResetWithAIAdvice = (fundSymbol: string) => {
    handleReset(fundSymbol);
    setAIAdvice(prev => {
      const newAdvice = { ...prev };
      delete newAdvice[fundSymbol];
      return newAdvice;
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
    return formatMoneyWithSeparators(shares, 2);
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

  useEffect(() => {
    if (sideBySide) {
      const modal = document.querySelector('.investment-draft-modal-content') as HTMLElement;
      if (modal) {
        const rect = modal.getBoundingClientRect();
        // 将草稿窗口宽度存储到 window 对象，供基金详情窗口使用
        (window as any).__draftModalWidth = rect.width;
      }
    }
  }, [sideBySide, modalHeight]);

  // 动态计算并排显示时的偏移量
  const [draftOffset, setDraftOffset] = useState<number>(0);

  useEffect(() => {
    if (sideBySide) {
      const calculateOffset = () => {
        const draftModal = document.querySelector('.investment-draft-modal-content') as HTMLElement;
        const detailWidth = (window as any).__detailModalWidth;
        if (draftModal && detailWidth) {
          const draftWidth = draftModal.getBoundingClientRect().width;
          // 草稿窗口需要向左偏移 detailWidth/2，使两个窗口整体居中
          setDraftOffset(detailWidth / 2);
        }
      };

      // 初始计算
      calculateOffset();

      // 监听详情窗口宽度变化
      const interval = setInterval(calculateOffset, 100);
      return () => clearInterval(interval);
    } else {
      setDraftOffset(0);
    }
  }, [sideBySide]);

  const content = (
    <div className="fixed inset-0 z-[130] flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onClose} />
      <div
        className="investment-draft-modal-content relative bg-white w-full max-w-[880px] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col pointer-events-auto transition-transform duration-300 ease-in-out"
        style={{
          transform: sideBySide ? `translateX(-${draftOffset}px)` : 'translateX(0)',
          height: modalHeight ? `${modalHeight}px` : '90vh',
          maxHeight: '90vh'
        }}
      >
        <div className="px-6 pt-3 pb-1 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold">投资计划草稿</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAIAdviceClick}
              disabled={aiAdviceLoading}
              className={`w-8 h-8 rounded-full flex items-center justify-center ${aiAdviceLoading ? 'bg-blue-100 text-blue-400' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
              title="AI辅助"
            >
              <i className={`fas ${aiAdviceLoading ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}></i>
            </button>
            <button
              onClick={() => setShowAIAnalysis(true)}
              disabled={aiAdviceLoading}
              className={`w-8 h-8 rounded-full flex items-center justify-center ${aiAdviceLoading ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
              title="AI分析"
            >
              <i className="fas fa-robot"></i>
            </button>
            <button
              onClick={handleCopyToClipboard}
              disabled={aiAdviceLoading}
              className={`w-8 h-8 rounded-full flex items-center justify-center ${aiAdviceLoading ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
              title={copied ? '已复制' : '复制内容到剪贴板'}
            >
              <i className={`fas fa-${copied ? 'check text-green-500' : 'copy'}`}></i>
            </button>
            <button
              aria-label="关闭投资计划窗口"
              disabled={aiAdviceLoading}
              className={`w-8 h-8 rounded-full flex items-center justify-center ${aiAdviceLoading ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
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
            <div className="overflow-hidden flex-1" style={{ overflowY: 'auto' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="border-b border-gray-200" style={{ height: '35px' }}>
                    <th className="px-2 py-1 text-center text-xs font-semibold text-gray-500 min-w-[20px] w-[20px]">
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
                    <th className="px-1 py-1 text-center text-xs font-semibold text-gray-500 min-w-[20px] w-[20px]"></th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[140px] w-[140px]">基金名称</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[90px] w-[90px]">实时估值</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[90px] w-[90px]">前值</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[70px] w-[70px]">涨跌幅</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[70px] w-[70px]">操作</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[70px] w-[70px]">金额</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[70px] w-[70px]">份额</th>
                    <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 min-w-[70px] w-[70px]">注释</th>
                    <th className="px-1 py-1 text-left text-xs font-semibold text-gray-500 min-w-[56px] w-[56px]"></th>
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
                                disabled={aiAdviceLoading}
                                className={`w-3 h-3 ${aiAdviceLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                              />
                            ) : (
                              <span className="text-gray-300 text-xs">-</span>
                            )}
                          </td>
                          {/* 提示列 */}
                          <td className="px-1 py-1 text-center">
                            {aiAdvice[fund.symbol] && (
                              <SimpleTooltip content={aiAdvice[fund.symbol].reason}>
                                <i className="fas fa-info-circle text-blue-500 text-xs cursor-pointer"></i>
                              </SimpleTooltip>
                            )}
                          </td>
                          <td
                            className={`px-2 py-1 text-left text-xs text-gray-700 truncate max-w-[140px] overflow-hidden ${aiAdviceLoading ? '' : 'cursor-pointer hover:underline'}`}
                            onClick={() => {
                              if (aiAdviceLoading) return;
                              // Save current state before navigating
                              const today = toLocalDateKey(new Date());
                              saveInvestmentDraft(today, draftData);
                              saveAllDraftsToStorage();

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
                                      {formatMoneyWithSeparators(valuation.currentPrice, 4)}
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
                                      {formatMoneyWithSeparators(valuation.previousPrice, 4)}
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
                            <div className="truncate" style={{ maxWidth: '70px' }}>
                              {getGainLoss(fund.symbol)}
                            </div>
                          </td>

                          <td className="px-2 py-1 text-left text-xs">
                            <select
                              value={entry.operation}
                              onChange={(e) => handleOperationChange(fund.symbol, e.target.value as '买入' | '卖出' | '不操作')}
                              disabled={aiAdviceLoading}
                              className={`w-[70px] p-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white ${aiAdviceLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <option value="不操作">不操作</option>
                              <option value="买入">买入</option>
                              <option value="卖出">卖出</option>
                            </select>
                          </td>

                          <td className="px-2 py-1 text-left text-xs">
                            <div className="w-[70px] h-full flex items-center">
                              {entry.operation === '不操作' ? (
                                <span className="text-gray-400 text-xs">-</span>
                              ) : (
                                <input
                                  type="text"
                                  value={entry.amount}
                                  onChange={(e) => handleAmountChange(fund.symbol, e.target.value)}
                                  placeholder="金额"
                                  disabled={aiAdviceLoading}
                                  className={`w-full p-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 ${aiAdviceLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                />
                              )}
                            </div>
                          </td>

                          <td className="px-2 py-1 text-left text-xs">
                            <div className="truncate" style={{ maxWidth: '70px' }}>
                              {calculateShares(fund.symbol)}
                            </div>
                          </td>

                          <td className="px-2 py-1 text-left text-xs">
                            <input
                              type="text"
                              value={entry.note || ''}
                              onChange={(e) => handleNoteChange(fund.symbol, e.target.value)}
                              placeholder="注释"
                              disabled={aiAdviceLoading}
                              className={`w-full p-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 ${aiAdviceLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                          </td>

                          <td className="px-1 py-1 text-center text-xs">
                            <div className="flex flex-row items-center justify-center gap-1">
                              <button
                                onClick={() => handleAddValuationToNote(fund.symbol)}
                                disabled={aiAdviceLoading}
                                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${aiAdviceLoading ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                                title="添加涨跌幅到注释"
                              >
                                <i className="fas fa-plus text-xs"></i>
                              </button>
                              <button
                                onClick={() => handleResetWithAIAdvice(fund.symbol)}
                                disabled={aiAdviceLoading}
                                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${aiAdviceLoading ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                                title="重置"
                              >
                                <i className="fas fa-undo text-xs"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={11} className="px-4 py-2 text-center text-sm text-gray-500" style={{ height: '40px' }}>
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
            <span>买入：{buyCount}只 / {formatMoneyWithSeparators(buyTotal, 2)}</span>
            <span>卖出：{sellCount}只 / {formatMoneyWithSeparators(sellTotal, 2)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  // AI分析浮窗
  const aiModalContent = (
    <AIInvestmentDraftModal
      isVisible={showAIAnalysis}
      onClose={() => setShowAIAnalysis(false)}
      draftData={draftData}
      portfolio={portfolio}
      fundHistories={fundHistories || {}}
      indexHistories={indexHistories || {}}
      marketIndices={marketIndices || []}
      globalIndices={globalIndices || []}
      marketData={marketData}
    />
  );

  return (
    <>
      {createPortal(content, document.body)}
      {createPortal(aiModalContent, document.body)}
      {createPortal(
        <ConfirmDialog
          isOpen={showConfirmDialog}
          title="清空数据警告"
          message="表格中已有数据，执行AI辅助将清空所有数据。是否继续？"
          onConfirm={handleConfirmClear}
          onCancel={() => setShowConfirmDialog(false)}
          confirmText="继续"
          cancelText="取消"
          type="info"
        />,
        document.body
      )}
      {createPortal(
        <ConfirmDialog
          isOpen={showErrorDialog}
          title="AI辅助失败"
          message={errorDialogMessage}
          onConfirm={() => setShowErrorDialog(false)}
          onCancel={() => setShowErrorDialog(false)}
          confirmText="关闭"
          singleButton
          type="info"
        />,
        document.body
      )}
    </>
  );
};

export default InvestmentDraftModal;