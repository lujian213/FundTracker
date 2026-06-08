import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TradeDifference, SyncDifferenceType } from '../types/syncTypes';
import { compareTrades, applySyncUpdates, applyReverseSyncUpdates } from '../services/syncService';
import { getEggfundFunds, getHistoricalTrades } from '../services/eggfundService';
import { getTradesForFund } from '../utils/realProfitCalculator';
import TradeManager from '../components/TradeManager';
import { ValuationData } from '../types';
import { getSyncConfig, getSyncFilterConfig, saveSyncFilterConfig } from '../services/systemConfigService';
import * as marketFundService from '../services/marketFundService';

type SyncDirection = 'forward' | 'reverse';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedDifferences: TradeDifference[]) => void;
  onError?: (errorMessage: string) => void; // 新增：同步出错时的回调
  // 添加市场数据以供交易管理器使用
  marketData?: Record<string, ValuationData>;
}

const SyncConfirmationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  onError,
  marketData = {}
}) => {
  const [differences, setDifferences] = useState<TradeDifference[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('正在初始化...');
  const [selectedItems, setSelectedItems] = useState<TradeDifference[]>([]);
  const [selectedFunds, setSelectedFunds] = useState<string[]>([]);
  const [availableFunds, setAvailableFunds] = useState<{code: string, name: string}[]>([]);
  const [filterDate, setFilterDate] = useState<string>('');
  const [selectedTypes, setSelectedTypes] = useState<SyncDifferenceType[]>([]);
  const [earliestDate, setEarliestDate] = useState<string>('');
  const [syncMessage, setSyncMessage] = useState<string>('');
  // 存储从eggfund获取的原始数据，以便同步后重复使用
  const [eggfundData, setEggfundData] = useState<Record<string, any[]>>({});
  // 存储过滤条件
  const [filterConfig, setFilterConfig] = useState({
    selectedFunds: [] as string[],
    filterDate: '',
    selectedTypes: [] as SyncDifferenceType[]
  });
  // 控制是否显示特定基金的交易管理器
  const [showTradeManager, setShowTradeManager] = useState<string | null>(null);
  const [syncDirection, setSyncDirection] = useState<SyncDirection>('forward');

  // Initialize the earliest date on component mount
  useEffect(() => {
    // 使用 marketFundService 获取基金列表和持仓数据
    const fundInfos = marketFundService.getAllFundInfos();

    // Find the earliest start date across all funds
    let earliest = '';
    for (const info of fundInfos) {
      if (info.position?.startDate) {
        if (!earliest || info.position.startDate < earliest) {
          earliest = info.position.startDate;
        }
      }
    }

    setEarliestDate(earliest);
    setFilterDate(earliest); // Set the default date to the earliest date
  }, []);

  // Load and apply saved filter settings when modal opens
  useEffect(() => {
    if (isOpen) {
      // Load saved filter configuration
      const savedFilterConfig = getSyncFilterConfig();
      if (savedFilterConfig) {
        setFilterConfig({
          selectedFunds: savedFilterConfig.selectedFunds,
          filterDate: savedFilterConfig.filterDate,
          selectedTypes: savedFilterConfig.selectedTypes as SyncDifferenceType[]
        });
        // Apply the saved filters
        setSelectedFunds(savedFilterConfig.selectedFunds || []);
        setFilterDate(savedFilterConfig.filterDate || '');
        setSelectedTypes((savedFilterConfig.selectedTypes || []) as SyncDifferenceType[]);
      }

      loadDifferences();
    } else {
      // Reset state when modal closes
      setDifferences([]);
      setSelectedItems([]);
      setSelectedFunds([]);
      setAvailableFunds([]);
      setFilterDate(earliestDate); // Reset to earliest date
      setLoading(false);
      setLoadingMessage('正在初始化...');
    }
  }, [isOpen]);

  const loadDifferences = async () => {
    await fetchSyncData({ closeOnNoMatch: true });
  };

  // Handle fund selection
  const handleFundToggle = (fundCode: string) => {
    setSelectedFunds(prev =>
      prev.includes(fundCode)
        ? prev.filter(code => code !== fundCode)
        : [...prev, fundCode]
    );
  };

  // Handle type selection
  const handleTypeToggle = (type: SyncDifferenceType) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  // Handle select all funds
  const handleSelectAllFunds = () => {
    setSelectedFunds(availableFunds.map(f => f.code));
  };

  // Handle reset funds
  const handleResetFunds = () => {
    setSelectedFunds([]);
  };

  // Handle reset types
  const handleResetTypes = () => {
    setSelectedTypes([]);
  };

  // Handle reset date
  const handleResetDate = () => {
    setFilterDate('');  // Clear the date field instead of resetting to earliest date
  };

  // Handle save filter settings
  const handleSaveFilterSettings = () => {
    const configToSave = {
      selectedFunds,
      filterDate,
      selectedTypes
    };
    saveSyncFilterConfig(configToSave);
    setSyncMessage('过滤条件已保存');

    // Clear the message after 2 seconds
    setTimeout(() => {
      if (syncMessage === '过滤条件已保存') {
        setSyncMessage('');
      }
    }, 2000);
  };

  // 应用过滤器
  const filteredDifferences = useMemo(() => {
    return differences.filter(diff => {
      // 基金代码过滤
      if (selectedFunds.length > 0 && !selectedFunds.includes(diff.symbol)) {
        return false;
      }

      // 日期过滤
      if (filterDate && diff.date < filterDate) {
        return false;
      }

      // 类型过滤
      if (selectedTypes.length > 0 && !selectedTypes.includes(diff.type)) {
        return false;
      }

      return true;
    });
  }, [differences, selectedFunds, filterDate, selectedTypes]);

  // 处理复选框变化
  const handleItemToggle = (item: TradeDifference) => {
    setSelectedItems(prev => {
      const exists = prev.some(i => i.date === item.date && i.symbol === item.symbol);
      if (exists) {
        return prev.filter(i => !(i.date === item.date && i.symbol === item.symbol));
      } else {
        return [...prev, item];
      }
    });
  };

  // 重新从eggfund同步数据并刷新表格
  const handleRefreshSync = async () => {
    // 防止在已有操作进行时再次触发
    if (loading) {
      return;
    }
    setSyncMessage('');
    await fetchSyncData({ closeOnNoMatch: false, isRefresh: true });
  };

  /**
   * 从 eggfund 获取数据并与本地数据对比
   * @param options.closeOnNoMatch - 找不到匹配基金时是否关闭窗口
   * @param options.isRefresh - 是否为刷新操作（影响提示文案）
   */
  const fetchSyncData = async (options: { closeOnNoMatch: boolean; isRefresh?: boolean }) => {
    const { closeOnNoMatch, isRefresh = false } = options;
    const actionPrefix = isRefresh ? '重新' : '';

    try {
      setLoading(true);

      // Get sync configuration
      const syncConfig = getSyncConfig();
      if (!syncConfig.eggfundUsername || !syncConfig.eggfundPassword) {
        setSyncMessage('请先在"同步配置"中设置 Eggfund 账户信息');
        setLoading(false);
        if (closeOnNoMatch) {
          setTimeout(() => onClose(), 1500);
        }
        return;
      }

      const { eggfundUsername, eggfundPassword } = syncConfig;

      // Step 1: Get all funds from eggfund
      setLoadingMessage(`正在${actionPrefix}获取 Eggfund 基金列表...`);
      const eggfundFunds = await getEggfundFunds(eggfundUsername, eggfundPassword);

      // Step 2: Get current portfolio from marketFundService
      const tickers = marketFundService.getAllTickers();

      // Step 3: Find intersection of funds
      const intersectingFunds = eggfundFunds.filter((fund: any) =>
        tickers.some((pf) => pf.symbol === fund.id)
      ).map((fund: any) => ({ code: fund.id, name: fund.name }));

      if (intersectingFunds.length === 0) {
        setSyncMessage('未找到与本地基金组合匹配的基金，无法进行同步');
        setLoading(false);
        if (closeOnNoMatch) {
          setTimeout(() => onClose(), 1500);
        }
        return;
      }

      // Set available funds for the filter
      setAvailableFunds(intersectingFunds);

      // Step 4: 批量并行处理，每批5个基金
      const BATCH_SIZE = 5;
      setLoadingMessage(`正在${actionPrefix}获取 ${intersectingFunds.length} 个基金的交易记录...`);

      // Store the eggfund data for potential reuse after sync
      const allEggfundData: Record<string, any[]> = {};
      const allDifferences: TradeDifference[] = [];

      // 分批处理
      const batches: { code: string; name: string }[][] = [];
      for (let i = 0; i < intersectingFunds.length; i += BATCH_SIZE) {
        batches.push(intersectingFunds.slice(i, i + BATCH_SIZE));
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        setLoadingMessage(`正在处理批次 ${batchIndex + 1}/${batches.length} (${batch.length} 个基金)...`);

        // 并行处理当前批次
        const batchResults = await Promise.all(
          batch.map(async (fundInfo) => {
            const fundCode = fundInfo.code;

            // Get local trades
            const localTrades = getTradesForFund(fundCode);

            // Get external trades from eggfund
            try {
              const externalTrades = await getHistoricalTrades(eggfundUsername, eggfundPassword, fundCode);

              // Compare and get differences
              const fundDifferences = compareTrades(localTrades, externalTrades, fundCode);

              return { fundCode, externalTrades, fundDifferences };
            } catch (error) {
              console.error(`Error fetching trades for fund ${fundCode}:`, error);
              return { fundCode, externalTrades: [], fundDifferences: [] };
            }
          })
        );

        // 收集结果
        for (const result of batchResults) {
          if (result.externalTrades.length > 0 || result.fundDifferences.length > 0) {
            allEggfundData[result.fundCode] = result.externalTrades;
            allDifferences.push(...result.fundDifferences);
          }
        }
      }

      // Save the eggfund data for reuse after sync
      setEggfundData(allEggfundData);
      setDifferences(allDifferences);
    } catch (error) {
      console.error(`Error during ${actionPrefix}sync process:`, error);
      setSyncMessage(`${actionPrefix}同步过程中发生错误，请检查网络连接和账户信息`);
    } finally {
      setLoading(false);
    }
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedItems.length === filteredDifferences.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems([...filteredDifferences]);
    }
  };

  // 确认同步
  const handleConfirm = async () => {
    if (selectedItems.length > 0) {
      try {
        setSyncMessage('正在同步...');

        if (syncDirection === 'forward') {
          // 正向同步：更新本地数据
          applySyncUpdates(selectedItems);
          setSyncMessage(`成功同步 ${selectedItems.length} 个交易差异`);

          // 使用之前存储的eggfund数据重新计算差异
          const allDifferences: TradeDifference[] = [];
          const tickers = marketFundService.getAllTickers();

          Object.entries(eggfundData).forEach(([fundCode, externalTrades]) => {
            if (tickers.some((pf) => pf.symbol === fundCode)) {
              const localTrades = getTradesForFund(fundCode);
              const fundDifferences = compareTrades(localTrades, externalTrades, fundCode);
              allDifferences.push(...fundDifferences);
            }
          });

          setDifferences(allDifferences);
          setSelectedItems([]);
        } else {
          // 反向同步：更新 Eggfund 数据
          const syncConfig = getSyncConfig();
          if (!syncConfig.eggfundUsername || !syncConfig.eggfundPassword) {
            setSyncMessage('请先在"同步配置"中设置 Eggfund 账户信息');
            return;
          }

          const result = await applyReverseSyncUpdates(
            selectedItems,
            syncConfig.eggfundUsername,
            syncConfig.eggfundPassword
          );

          if (result.failed > 0) {
            setSyncMessage(`同步部分失败：成功 ${result.success}，失败 ${result.failed}`);
            console.error('同步失败详情:', result.errors);
          } else {
            setSyncMessage(`成功同步 ${result.success} 个交易差异到 Eggfund`);
          }

          // 刷新 Eggfund 数据并重新计算差异
          await fetchSyncData({ closeOnNoMatch: false, isRefresh: true });
          setSelectedItems([]);
        }
      } catch (error: any) {
        console.error('同步过程中出现错误:', error);

        if (error.message.includes('认证失败')) {
          setSyncMessage('认证失败：请检查 Eggfund 账户配置');
        } else if (error.message.includes('网络')) {
          setSyncMessage('网络连接失败，请检查网络后重试');
        } else {
          setSyncMessage(`同步失败: ${error.message}`);
        }
      }
    }
  };

  // 检查是否所有显示的项都被选中
  const isAllSelected = filteredDifferences.length > 0 &&
                        selectedItems.length === filteredDifferences.length;

  /**
   * 根据同步方向映射差异类型的显示文本和颜色
   */
  function getMappedTypeInfo(
    originalType: SyncDifferenceType,
    direction: SyncDirection
  ): { label: string; color: string } {
    const forwardMap = {
      new: { label: '新增', color: 'bg-green-100 text-green-800' },
      modified: { label: '修改', color: 'bg-yellow-100 text-yellow-800' },
      deleted: { label: '删除', color: 'bg-red-100 text-red-800' }
    };

    const reverseMap = {
      new: { label: '删除', color: 'bg-red-100 text-red-800' },
      modified: { label: '修改', color: 'bg-yellow-100 text-yellow-800' },
      deleted: { label: '新增', color: 'bg-green-100 text-green-800' }
    };

    return direction === 'forward' ? forwardMap[originalType] : reverseMap[originalType];
  }

  if (!isOpen) {
    return null;
  }

  // 如果正在显示交易管理器，则渲染交易管理器
  if (showTradeManager) {
    const fundData = marketData[showTradeManager];
    const fundInfo = availableFunds.find(f => f.code === showTradeManager);

    return createPortal(
      <TradeManager
        symbol={showTradeManager}
        name={fundInfo?.name}
        currentPrice={fundData?.currentPrice || 0}
        previousPrice={fundData?.previousPrice || 0}
        realtimeDate={fundData?.lastUpdated || null}
        netWorthDate={fundData?.netWorthDate || null}
        onClose={() => setShowTradeManager(null)}
      />,
      document.body
    );
  }

  if (loading) {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"></div>
        <div className="relative bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="px-6 py-8 flex flex-col items-center justify-center">
            <div className="flex items-center w-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3 flex-shrink-0"></div>
              <p className="text-gray-700 text-sm truncate">{loadingMessage}</p>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-confirmation-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={!loading ? onClose : undefined} // 当loading为true时，不响应点击
        style={!loading ? {} : { pointerEvents: 'none' }} // 当loading为true时，禁用鼠标事件
      />

      {/* Modal body */}
      <div className="relative bg-white rounded-3xl w-full max-w-6xl min-w-[800px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"
           style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 id="sync-confirmation-title" className="text-base font-bold text-gray-800">
            交易同步确认
          </h2>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefreshSync}
              disabled={loading}
              className={`w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:text-gray-600'}`}
              aria-label="重新同步"
              title="重新同步"
            >
              <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              disabled={loading}  // 在loading期间禁用关闭按钮
              className={`w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:text-gray-600'}`}
              aria-label="关闭"
            >
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">
                基金
              </label>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleSelectAllFunds}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={handleResetFunds}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  重置
                </button>
              </div>
            </div>
            <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-xl p-2">
              {availableFunds.map((fund) => (
                <div key={fund.code} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`fund-${fund.code}`}
                    checked={selectedFunds.includes(fund.code)}
                    onChange={() => handleFundToggle(fund.code)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor={`fund-${fund.code}`} className="ml-2 text-xs truncate max-w-[calc(100%-20px)]">
                    {fund.name}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div> {/* Restore original width for date filter */}
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="filter-date" className="text-xs font-medium text-gray-700">
                日期从
              </label>
              <button
                type="button"
                onClick={handleResetDate}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                重置
              </button>
            </div>
            <input
              id="filter-date"
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div> {/* Restore original width for type filter */}
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">
                差异类型
              </label>
              <button
                type="button"
                onClick={handleResetTypes}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                重置
              </button>
            </div>
            <div className="border border-gray-200 rounded-xl p-2 mb-2">
              {(['new', 'modified', 'deleted'] as SyncDifferenceType[]).map((type) => (
                <div key={type} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`type-${type}`}
                    checked={selectedTypes.includes(type)}
                    onChange={() => handleTypeToggle(type)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor={`type-${type}`} className="ml-2 text-xs">
                    {type === 'new' ? '新增' : type === 'modified' ? '修改' : '删除'}
                  </label>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleSaveFilterSettings}
              className="w-full text-xs text-center text-blue-600 hover:text-blue-800 py-1 border border-blue-200 rounded-xl"
            >
              保存过滤条件
            </button>
            {/* 同步方向开关 */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg mt-2">
              <span className="text-xs font-medium text-gray-700">同步方向</span>
              <div className="flex items-center space-x-2">
                <span className={`text-xs ${syncDirection === 'forward' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
                  同步到FundTracker
                </span>
                <button
                  type="button"
                  onClick={() => setSyncDirection(prev => prev === 'forward' ? 'reverse' : 'forward')}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    syncDirection === 'reverse' ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                  role="switch"
                  aria-checked={syncDirection === 'reverse'}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    syncDirection === 'reverse' ? 'translate-x-4' : 'translate-x-1'
                  }`} />
                </button>
                <span className={`text-xs ${syncDirection === 'reverse' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
                  同步到eggfund
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Table header */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center text-xs font-medium text-gray-700">
          <div className="w-8 flex items-center justify-center">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={handleSelectAll}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 grid grid-cols-12 gap-2">
            <div className="col-span-2">基金</div>
            <div className="col-span-2">日期</div>
            <div className="col-span-2">差异类型</div>
            <div className="col-span-3">Eggfund 交易详情</div>
            <div className="col-span-3">本地交易详情</div>
          </div>
        </div>

        {/* Table body */}
        <div className="overflow-y-auto flex-grow" style={{ maxHeight: '40vh' }}>
          {filteredDifferences.length === 0 ? (
            <div className="p-8 text-center text-sm">
              {/* 如果有错误信息，优先显示错误 */}
              {syncMessage && syncMessage.includes('错误') || syncMessage.includes('失败') || syncMessage.includes('请先') ? (
                <div className="text-red-600 bg-red-50 rounded-lg px-4 py-3">
                  <i className="fas fa-exclamation-circle mr-2"></i>
                  {syncMessage}
                </div>
              ) : (
                <div className="text-gray-500">
                  {differences.length === 0 ? '本地交易记录与 Eggfund 一致，无需同步' : '没有找到符合条件的交易差异'}
                </div>
              )}
            </div>
          ) : (
            filteredDifferences.map((diff, index) => {
              const isSelected = selectedItems.some(
                item => item.date === diff.date && item.symbol === diff.symbol
              );

              // 根据差异类型和同步方向设置样式
              const mappedTypeInfo = getMappedTypeInfo(diff.type, syncDirection);
              const typeLabel = mappedTypeInfo.label;
              const typeColor = mappedTypeInfo.color;

              // Get fund name from available funds
              const fundInfo = availableFunds.find(f => f.code === diff.symbol);
              const fundName = fundInfo ? fundInfo.name : diff.symbol;

              return (
                <div
                  key={`${diff.date}-${diff.symbol}`}
                  className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    isSelected ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="px-6 py-2 flex items-center text-sm">
                    <div className="w-8 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleItemToggle(diff)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-2 flex items-center">
                        <button
                          onClick={() => setShowTradeManager(diff.symbol)}
                          className="font-medium text-xs whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                          title={fundName}
                        >
                          {fundName}
                        </button>
                      </div>
                      <div className="col-span-2 flex items-center">
                        <span className="text-xs">{diff.date}</span>
                      </div>
                      <div className="col-span-2 flex items-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
                          {typeLabel}
                        </span>
                      </div>
                      <div className="col-span-3 text-xs">
                        {diff.externalData && (
                          <div>
                            {diff.externalData.trades.map((trade, idx) => (
                              <div key={idx} className="mb-1 last:mb-0">
                                <span className={trade.type === 'buy' ? 'text-green-600' : 'text-red-600'}>
                                  {trade.type === 'buy' ? '买入' : '卖出'}：{trade.shares.toFixed(2)}份，手续费：{trade.fee.toFixed(2)}
                                </span>
                              </div>
                            ))}
                            {diff.externalData.trades.length > 0 && (
                              <div className="font-medium mt-1">
                                方向:{diff.externalData.netDirection === 'buy' ? '买' : diff.externalData.netDirection === 'sell' ? '卖' : '持'}，净份额:{diff.externalData.netShares.toFixed(2)}，总费用:{diff.externalData.totalFees.toFixed(2)}
                              </div>
                            )}
                          </div>
                        )}
                        {!diff.externalData && diff.type === 'deleted' && (
                          <div className="text-gray-500">无外部记录</div>
                        )}
                      </div>
                      <div className="col-span-3 text-xs">
                        {diff.localData && (
                          <div>
                            {diff.localData.trades.map((trade, idx) => (
                              <div key={idx} className="mb-1 last:mb-0">
                                <span className={trade.type === 'buy' ? 'text-green-600' : 'text-red-600'}>
                                  {trade.type === 'buy' ? '买入' : '卖出'}：{trade.shares.toFixed(2)}份，手续费：{trade.fee.toFixed(2)}
                                </span>
                              </div>
                            ))}
                            {diff.localData.trades.length > 0 && (
                              <div className={`font-medium mt-1 ${
                                diff.type === 'modified' && diff.differenceDetails?.some(d => d.type === 'direction' || d.type === 'netShares' || d.type === 'fees')
                                  ? 'bg-yellow-100' : ''
                              }`}>
                                方向:<span className={
                                  diff.type === 'modified' && diff.differenceDetails?.some(d => d.type === 'direction' && d.localValue !== d.externalValue)
                                    ? 'bg-yellow-200 px-1 rounded' : ''
                                }>
                                  {diff.localData.netDirection === 'buy' ? '买' : diff.localData.netDirection === 'sell' ? '卖' : '持'}
                                </span>，净份额:<span className={
                                  diff.type === 'modified' && diff.differenceDetails?.some(d => d.type === 'netShares' && Math.abs(d.localValue - d.externalValue) > 0.001)
                                    ? 'bg-yellow-200 px-1 rounded' : ''
                                }>
                                  {diff.localData.netShares.toFixed(2)}
                                </span>，总费用:<span className={
                                  diff.type === 'modified' && diff.differenceDetails?.some(d => d.type === 'fees' && Math.abs(d.localValue - d.externalValue) > 0.001)
                                    ? 'bg-yellow-200 px-1 rounded' : ''
                                }>
                                  {diff.localData.totalFees.toFixed(2)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {!diff.localData && diff.type === 'new' && (
                          <div className="text-gray-500">无本地记录</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-4 flex flex-col space-y-3">
          {/* 预留空间给同步消息显示 */}
          <div className="h-6 flex items-center">
            {syncMessage && (
              <div className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-1.5 truncate max-w-full">
                {syncMessage}
              </div>
            )}
          </div>
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              显示 {filteredDifferences.length} 项，已选中 {selectedItems.length} 项
            </div>
            <button
              onClick={handleConfirm}
              disabled={selectedItems.length === 0}
              className={`px-5 py-2.5 text-sm font-bold rounded-xl transition-colors ${
                selectedItems.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              确认同步 ({selectedItems.length})
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SyncConfirmationModal;