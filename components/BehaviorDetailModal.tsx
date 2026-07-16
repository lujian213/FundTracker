import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BehaviorAnalysis, TradeRecord, OverallFundRow, BehaviorScore } from '../types';
import { formatDateDisplay } from '../utils/dateFormat';
import { formatMoneyWithSeparators } from '../utils/format';

interface BehaviorDetailModalProps {
  type: 'score' | 'frequency' | 'emotion' | 'timing';
  analysis: BehaviorAnalysis;
  tableRows?: OverallFundRow[];
  previousScore?: BehaviorScore | null; // 上期评分（用于对比）
  onClose: () => void;
}

// 可折叠的Section组件
const CollapsibleSection: React.FC<{
  title: string;
  count?: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, count, isOpen, onToggle, children }) => {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full px-3 py-2 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
        onClick={onToggle}
      >
        <span className="text-sm font-medium text-gray-700">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-xs text-gray-500">({count}条)</span>
          )}
        </span>
        <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'} text-gray-400 text-xs`} />
      </button>
      {isOpen && (
        <div className="p-3 bg-white">
          {children}
        </div>
      )}
    </div>
  );
};

// 交易记录表格组件（复用）
const TradeTable: React.FC<{
  trades: Array<TradeRecord & { reason?: string }>;
  getFundName: (trade: TradeRecord) => string;
  showReason?: boolean;
}> = ({ trades, getFundName, showReason = false }) => {
  if (trades.length === 0) {
    return <div className="text-xs text-gray-400 text-center py-2">无</div>;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-gray-400">
          <th className="py-1 pr-2">日期</th>
          <th className="py-1 pr-2">基金</th>
          <th className="py-1 pr-2">类型</th>
          <th className="py-1 pr-2 text-right">份额</th>
          <th className="py-1 pr-2 text-right">价格</th>
          <th className="py-1 text-right">总额</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((trade, i) => {
          const total = trade.shares * trade.price;
          const fundName = getFundName(trade);
          const fullReason = showReason && trade.reason ? `${fundName}：${trade.reason}` : undefined;
          return (
            <tr
              key={i}
              className={`border-t border-gray-100 ${showReason ? 'cursor-help' : ''}`}
              title={fullReason}
            >
              <td className="py-1.5 pr-2">{formatDateDisplay(trade.date)}</td>
              <td className="py-1.5 pr-2 text-gray-500 max-w-[100px] truncate">{fundName}</td>
              <td className="py-1.5 pr-2">
                <span className={trade.type === 'buy' ? 'text-green-600' : 'text-red-600'}>
                  {trade.type === 'buy' ? '买入' : '卖出'}
                </span>
              </td>
              <td className="py-1.5 pr-2 text-right">{formatMoneyWithSeparators(trade.shares)}</td>
              <td className="py-1.5 pr-2 text-right">{trade.price.toFixed(4)}</td>
              <td className="py-1.5 text-right text-gray-600">{formatMoneyWithSeparators(total)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const BehaviorDetailModal: React.FC<BehaviorDetailModalProps> = ({
  type,
  analysis,
  tableRows = [],
  previousScore = null,
  onClose
}) => {
  // 根据类型确定默认展开的section
  const getDefaultSection = () => {
    switch (type) {
      case 'score': return 'dimensions';
      case 'frequency': return 'trades';
      case 'emotion': return 'chase';
      case 'timing': return 'good';
      default: return '';
    }
  };

  // 当前展开的section，默认展开第一个
  const [openSection, setOpenSection] = useState<string>(getDefaultSection);

  // 切换section展开状态
  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? '' : section);
  };

  // 缓存排序后的交易列表（避免渲染时排序）
  const sortedFrequencyTrades = useMemo(() =>
    [...analysis.frequency.trades].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50),
    [analysis.frequency.trades]
  );

  const sortedChaseTrades = useMemo(() =>
    [...analysis.emotion.chaseHighSellLow].sort((a, b) => b.date.localeCompare(a.date)),
    [analysis.emotion.chaseHighSellLow]
  );

  const sortedFrequentTrades = useMemo(() =>
    [...analysis.emotion.frequentLossTrade].sort((a, b) => b.date.localeCompare(a.date)),
    [analysis.emotion.frequentLossTrade]
  );

  const sortedFomoTrades = useMemo(() =>
    [...analysis.emotion.fomoBuy].sort((a, b) => b.date.localeCompare(a.date)),
    [analysis.emotion.fomoBuy]
  );

  const sortedGoodTrades = useMemo(() =>
    [...analysis.timing.good].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50),
    [analysis.timing.good]
  );

  const sortedNormalTrades = useMemo(() =>
    [...analysis.timing.normal].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50),
    [analysis.timing.normal]
  );

  const sortedBadTrades = useMemo(() =>
    [...analysis.timing.bad].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50),
    [analysis.timing.bad]
  );

  // 获取基金名称
  const getFundName = (trade: TradeRecord): string => {
    const symbol = (trade as any).symbol;
    if (symbol) {
      const row = tableRows.find(r => r.symbol === symbol);
      if (row) {
        return `${row.name} (${String(symbol).padStart(6, '0')})`;
      }
      return String(symbol).padStart(6, '0');
    }
    return '';
  };

  const getTitle = () => {
    switch (type) {
      case 'score': return '行为评分详情';
      case 'frequency': return '交易频率详情';
      case 'emotion': return '情绪化交易详情';
      case 'timing': return '时机评分详情';
    }
  };

  const renderScoreDetail = () => {
    // 计算对比变化
    const getChangeDisplay = (change: number) => {
      if (change > 0) return { text: `+${change}`, color: 'text-green-600', icon: '↑' };
      if (change < 0) return { text: `${change}`, color: 'text-red-600', icon: '↓' };
      return { text: '0', color: 'text-gray-500', icon: '→' };
    };

    const totalChange = previousScore ? analysis.score.total - previousScore.total : null;
    const timingChange = previousScore ? analysis.score.timing - previousScore.timing : null;
    const emotionChange = previousScore ? analysis.score.emotion - previousScore.emotion : null;
    const disciplineChange = previousScore ? analysis.score.discipline - previousScore.discipline : null;

    return (
      <div className="space-y-3">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-center mb-2">
            <div className="text-4xl font-bold text-green-600">
              {analysis.score.total}分
              {totalChange !== null && (
                <span className={`text-lg ml-2 ${getChangeDisplay(totalChange).color}`}>
                  {getChangeDisplay(totalChange).icon} {getChangeDisplay(totalChange).text}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-600 mt-1">总分（满分100分）</div>
          </div>
        </div>

        {/* 历史对比区域 */}
        {previousScore && (
          <CollapsibleSection
            title="历史对比"
            isOpen={openSection === 'comparison'}
            onToggle={() => toggleSection('comparison')}
          >
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-2">与历史数据对比</div>
              <div className="space-y-2">
                {[
                  { label: '总分', change: totalChange, current: analysis.score.total },
                  { label: '时机选择', change: timingChange, current: analysis.score.timing },
                  { label: '情绪控制', change: emotionChange, current: analysis.score.emotion },
                  { label: '交易纪律', change: disciplineChange, current: analysis.score.discipline }
                ].map(item => item.change !== null && (
                  <div key={item.label} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{item.label}</span>
                    <span className={getChangeDisplay(item.change).color}>
                      {getChangeDisplay(item.change).icon} {getChangeDisplay(item.change).text}分
                    </span>
                  </div>
                ))}
              </div>
              {totalChange !== null && totalChange > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-xs text-green-600">
                    💡 评分提升{totalChange}分，继续保持！
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="评分维度"
          isOpen={openSection === 'dimensions'}
          onToggle={() => toggleSection('dimensions')}
        >
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">时机选择</div>
              <div className="text-xl font-bold text-blue-600">
                {analysis.score.timing}分
                {timingChange !== null && (
                  <span className={`text-xs ml-1 ${getChangeDisplay(timingChange).color}`}>
                    {getChangeDisplay(timingChange).icon}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-1">满分50分</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">情绪控制</div>
              <div className="text-xl font-bold text-orange-600">
                {analysis.score.emotion}分
                {emotionChange !== null && (
                  <span className={`text-xs ml-1 ${getChangeDisplay(emotionChange).color}`}>
                    {getChangeDisplay(emotionChange).icon}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-1">满分30分</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">交易纪律</div>
              <div className="text-xl font-bold text-purple-600">
                {analysis.score.discipline}分
                {disciplineChange !== null && (
                  <span className={`text-xs ml-1 ${getChangeDisplay(disciplineChange).color}`}>
                    {getChangeDisplay(disciplineChange).icon}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-1">满分20分</div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="评分说明"
          isOpen={openSection === 'explanation'}
          onToggle={() => toggleSection('explanation')}
        >
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• <strong>时机选择</strong>：低位买入、高位卖出得分高，追涨杀跌得分低</li>
            <li>• <strong>情绪控制</strong>：追涨杀跌、频繁调仓、FOMO买入会扣分</li>
            <li>• <strong>交易纪律</strong>：定期定投、规律仓位管理得分高</li>
          </ul>
        </CollapsibleSection>
      </div>
    );
  };

  const renderFrequencyDetail = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">买入次数</div>
          <div className="text-xl font-bold text-red-600">{analysis.frequency.buyCount}次</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">卖出次数</div>
          <div className="text-xl font-bold text-green-600">{analysis.frequency.sellCount}次</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">总交易次数</div>
          <div className="text-lg font-bold">{analysis.frequency.trades.length}次</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">手续费率</div>
          <div className="text-lg font-bold">{analysis.frequency.feeRate.toFixed(2)}%</div>
        </div>
      </div>

      {analysis.frequency.trades.length > 0 && (
        <CollapsibleSection
          title="交易记录（最近50条）"
          count={analysis.frequency.trades.length}
          isOpen={openSection === 'trades'}
          onToggle={() => toggleSection('trades')}
        >
          <TradeTable trades={sortedFrequencyTrades} getFundName={getFundName} />
        </CollapsibleSection>
      )}
    </div>
  );

  const renderEmotionDetail = () => {
    return (
      <div className="space-y-3">
        <CollapsibleSection
          title="追涨杀跌（追涨买入或亏损杀跌）"
          count={analysis.emotion.chaseHighSellLow.length}
          isOpen={openSection === 'chase'}
          onToggle={() => toggleSection('chase')}
        >
          <TradeTable trades={sortedChaseTrades} getFundName={getFundName} showReason />
        </CollapsibleSection>

        <CollapsibleSection
          title="频繁调仓（持有<7天且亏损）"
          count={analysis.emotion.frequentLossTrade.length}
          isOpen={openSection === 'frequent'}
          onToggle={() => toggleSection('frequent')}
        >
          <TradeTable trades={sortedFrequentTrades} getFundName={getFundName} showReason />
        </CollapsibleSection>

        <CollapsibleSection
          title="FOMO买入（涨幅>5%后买入）"
          count={analysis.emotion.fomoBuy.length}
          isOpen={openSection === 'fomo'}
          onToggle={() => toggleSection('fomo')}
        >
          <TradeTable trades={sortedFomoTrades} getFundName={getFundName} showReason />
        </CollapsibleSection>

        <CollapsibleSection
          title="影响说明"
          isOpen={openSection === 'impact'}
          onToggle={() => toggleSection('impact')}
        >
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• <strong>追涨杀跌</strong>：涨幅{'>'}3%后买入（买入价{'>'}上次卖出价），或跌幅{'>'}3%时亏损卖出</li>
            <li>• <strong>频繁调仓</strong>：持有{'<'}7天且亏损卖出</li>
            <li>• <strong>FOMO买入</strong>：涨幅{'>'}5%后买入</li>
          </ul>
        </CollapsibleSection>
      </div>
    );
  };

  const renderTimingDetail = () => {
    return (
      <div className="space-y-3">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-3xl font-bold text-blue-600">{analysis.timing.avgScore}分</div>
          <div className="text-xs text-gray-600 mt-1">平均时机评分</div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-green-50 border border-green-200 rounded p-2">
            <div className="text-lg font-bold text-green-600">{analysis.timing.good.length}</div>
            <div className="text-xs text-gray-500">好（≥80分）</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded p-2">
            <div className="text-lg font-bold text-gray-600">{analysis.timing.normal.length}</div>
            <div className="text-xs text-gray-500">一般（40-79分）</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded p-2">
            <div className="text-lg font-bold text-red-600">{analysis.timing.bad.length}</div>
            <div className="text-xs text-gray-500">差（{'<'}40分）</div>
          </div>
        </div>

        <CollapsibleSection
          title="时机好的交易（最近50条）"
          count={analysis.timing.good.length}
          isOpen={openSection === 'good'}
          onToggle={() => toggleSection('good')}
        >
          <TradeTable trades={sortedGoodTrades} getFundName={getFundName} />
        </CollapsibleSection>

        <CollapsibleSection
          title="时机一般的交易（最近50条）"
          count={analysis.timing.normal.length}
          isOpen={openSection === 'normal'}
          onToggle={() => toggleSection('normal')}
        >
          <TradeTable trades={sortedNormalTrades} getFundName={getFundName} />
        </CollapsibleSection>

        <CollapsibleSection
          title="时机差的交易（最近50条）"
          count={analysis.timing.bad.length}
          isOpen={openSection === 'bad'}
          onToggle={() => toggleSection('bad')}
        >
          <TradeTable trades={sortedBadTrades} getFundName={getFundName} />
        </CollapsibleSection>

        <CollapsibleSection
          title="评分规则"
          isOpen={openSection === 'rules'}
          onToggle={() => toggleSection('rules')}
        >
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• <strong>买入</strong>：净值在30天内的百分位 {'<'} 30% → 90分，30-70% → 60分，{'> '}70% → 30分</li>
            <li>• <strong>卖出</strong>：净值在30天内的百分位 {'>'} 70% → 90分，30-70% → 60分，{'<'} 30% → 30分</li>
          </ul>
        </CollapsibleSection>
      </div>
    );
  };

  const content = (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden" style={{ maxWidth: '700px', width: '700px', height: '70vh' }}>
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-base font-bold">{getTitle()}</h3>
          <button
            type="button"
            className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100"
            onClick={onClose}
            aria-label="关闭"
          >
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="p-4 overflow-y-scroll flex-1" style={{ scrollbarGutter: 'stable' }}>
          {type === 'score' && renderScoreDetail()}
          {type === 'frequency' && renderFrequencyDetail()}
          {type === 'emotion' && renderEmotionDetail()}
          {type === 'timing' && renderTimingDetail()}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default BehaviorDetailModal;