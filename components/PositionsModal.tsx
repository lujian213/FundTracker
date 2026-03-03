import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ticker, ValuationData } from '../types';
import { computePositions, PositionEntry } from '../utils/positionHelper';

interface Props {
  portfolio: Ticker[];
  marketData: Record<string, ValuationData>;
  onClose: () => void;
  onSelectFund: (symbol: string) => void;
}

// Format a number with thousands separator and 2 decimal places
function fmtMoney(v: number): string {
  try {
    return new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

// Compute SVG arc path for a pie slice.
// cx,cy = center; r = radius; startAngle,endAngle in radians.
function pieSlicePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

interface SliceInfo {
  entry: PositionEntry;
  startAngle: number;
  endAngle: number;
  path: string;
}

const PIE_CX = 110;
const PIE_CY = 110;
const PIE_R = 100;

const PositionsModal: React.FC<Props> = ({ portfolio, marketData, onClose, onSelectFund }) => {
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);

  const { entries, totalMarketValue } = useMemo(
    () => computePositions(portfolio, marketData),
    [portfolio, marketData]
  );

  // Build pie slices
  const slices = useMemo<SliceInfo[]>(() => {
    if (entries.length === 0) return [];
    let angle = -Math.PI / 2; // start from top
    return entries.map((entry) => {
      const sweep = entry.ratio * 2 * Math.PI;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      return {
        entry,
        startAngle: start,
        endAngle: end,
        path: pieSlicePath(PIE_CX, PIE_CY, PIE_R, start, end),
      };
    });
  }, [entries]);

  const hoveredEntry = entries.find((e) => e.symbol === hoveredSymbol) ?? null;

  const content = (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"
        style={{ maxWidth: '56rem', maxHeight: '90vh' }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header — fixed */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold">基金持仓</h3>
          <button
            aria-label="关闭持仓窗口"
            className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100"
            onClick={onClose}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Body — no outer scroll; each inner region scrolls independently */}
        <div className="flex flex-col min-h-0 flex-1 p-6 gap-6 overflow-hidden">

          {/* Summary line */}
          <div className="text-sm text-gray-600 font-medium flex-shrink-0">
            <span className="font-bold text-gray-800">{entries.length}只基金</span>
            <span className="mx-2 text-gray-400">·</span>
            市场总价值：<span className="font-bold text-gray-800">{fmtMoney(totalMarketValue)}元</span>
          </div>

          {/* Pie chart + legend — fixed height, legend scrolls */}
          <div className="flex items-start gap-6 flex-shrink-0">
            {/* SVG pie */}
            <div className="flex-shrink-0">
              {entries.length === 0 ? (
                <div
                  className="flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-full"
                  style={{ width: PIE_CX * 2, height: PIE_CY * 2 }}
                >
                  无持仓数据
                </div>
              ) : (
                <svg
                  width={PIE_CX * 2}
                  height={PIE_CY * 2}
                  viewBox={`0 0 ${PIE_CX * 2} ${PIE_CY * 2}`}
                  style={{ overflow: 'visible' }}
                >
                  {slices.map((s) => (
                    <path
                      key={s.entry.symbol}
                      d={s.path}
                      fill={s.entry.color}
                      stroke="white"
                      strokeWidth={2}
                      opacity={hoveredSymbol === null || hoveredSymbol === s.entry.symbol ? 1 : 0.55}
                      style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                      onMouseEnter={() => setHoveredSymbol(s.entry.symbol)}
                      onMouseLeave={() => setHoveredSymbol(null)}
                      onClick={() => onSelectFund(s.entry.symbol)}
                    >
                      <title>
                        {s.entry.name}（{s.entry.symbol}）{'\n'}
                        市场价值：{fmtMoney(s.entry.marketValue)}元{'\n'}
                        占比：{(s.entry.ratio * 100).toFixed(2)}%
                      </title>
                    </path>
                  ))}
                  {hoveredEntry && (
                    <>
                      <text x={PIE_CX} y={PIE_CY - 10} textAnchor="middle"
                        style={{ fontSize: '11px', fill: '#374151', fontWeight: 600, pointerEvents: 'none' }}>
                        {(hoveredEntry.ratio * 100).toFixed(2)}%
                      </text>
                      <text x={PIE_CX} y={PIE_CY + 6} textAnchor="middle"
                        style={{ fontSize: '10px', fill: '#6b7280', pointerEvents: 'none' }}>
                        {fmtMoney(hoveredEntry.marketValue)}元
                      </text>
                    </>
                  )}
                </svg>
              )}
            </div>

            {/* Legend — scrolls independently, height matches pie */}
            <div className="flex-1 min-w-0 flex flex-col gap-1.5 overflow-y-auto pr-1"
              style={{ maxHeight: PIE_CY * 2 }}>
              {entries.length === 0 && <p className="text-sm text-gray-400">无持仓数据</p>}
              {entries.map((e) => (
                <button
                  key={e.symbol}
                  title={`${e.name}（${e.symbol}）`}
                  onClick={() => onSelectFund(e.symbol)}
                  onMouseEnter={() => setHoveredSymbol(e.symbol)}
                  onMouseLeave={() => setHoveredSymbol(null)}
                  className="flex items-center gap-2 text-left hover:bg-gray-50 rounded px-1 py-0.5 w-full min-w-0 transition-colors"
                  style={{ opacity: hoveredSymbol === null || hoveredSymbol === e.symbol ? 1 : 0.55 }}
                >
                  <span className="flex-shrink-0 rounded-sm"
                    style={{ width: 10, height: 10, background: e.color }} />
                  <span className="text-xs text-gray-700 truncate min-w-0">
                    {e.name}（{e.symbol}）
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Table — takes remaining space, thead fixed, tbody scrolls */}
          {entries.length > 0 && (
            <div className="border border-gray-100 rounded-xl flex flex-col min-h-0 flex-1" style={{ overflow: 'hidden' }}>
              {/* Single table — thead/tfoot sticky, tbody scrolls inside the wrapper */}
              <div className="overflow-y-auto flex-1 min-h-0">
                <table className="w-full text-sm table-fixed border-collapse">
                  <colgroup>
                    <col style={{ width: '42%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '16%' }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">基金名称</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">持仓份额</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">市场价值</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.symbol}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                        onMouseEnter={() => setHoveredSymbol(e.symbol)}
                        onMouseLeave={() => setHoveredSymbol(null)}
                      >
                        <td className="px-3 py-2 text-left">
                          <button
                            className="flex items-center gap-1.5 text-left w-full min-w-0 hover:text-blue-600 transition-colors"
                            title={`${e.name}（${e.symbol}）`}
                            onClick={() => onSelectFund(e.symbol)}
                          >
                            <span className="flex-shrink-0 rounded-sm"
                              style={{ width: 8, height: 8, background: e.color }} />
                            <span className="truncate text-xs text-gray-700">
                              {e.name}（{e.symbol}）
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-700">{fmtMoney(e.currentShares)}</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-700">{fmtMoney(e.marketValue)}</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-700">{(e.ratio * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10 bg-gray-50">
                    <tr className="border-t border-gray-200">
                      <td className="px-3 py-2 text-left text-xs font-bold text-gray-700">总计：{entries.length}条记录</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right text-xs font-bold text-gray-700">{fmtMoney(totalMarketValue)}</td>
                      <td className="px-3 py-2 text-right text-xs font-bold text-gray-700">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <i className="fas fa-chart-pie text-4xl mb-3 opacity-30" />
              <p className="text-sm">无持仓数据</p>
              <p className="text-xs mt-1 opacity-60">请先在基金详情页配置仓位信息</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default PositionsModal;










