import React from 'react';
import { createPortal } from 'react-dom';
import { FundProfile } from '../types';
import { formatPercent } from '../utils/format';

const SUBMODAL_Z_INDEX = 150;

interface FundProfileModalProps {
  profile: FundProfile;
  fundName: string;
  onClose: () => void;
}

// 股票持仓表格子组件
const StockPositionsTable: React.FC<{ data: FundProfile['stock_positions']; compact?: boolean }> = ({ data, compact = false }) => {
  const paddingClass = compact ? 'py-1.5' : 'py-2';

  return data.length > 0 ? (
    <table className="text-sm w-64">
      <thead>
        <tr className="border-b border-gray-200">
          <th className={`text-left ${paddingClass} text-gray-500 font-medium`}>股票名称</th>
          <th className={`text-right ${paddingClass} text-gray-500 font-medium w-16`}>持仓占比</th>
        </tr>
      </thead>
      <tbody>
        {data.map((pos, idx) => (
          <tr key={idx} className="border-b border-gray-100">
            <td className={`${paddingClass} text-gray-800`}>{pos.stock_name}</td>
            <td className={`${paddingClass} text-right text-gray-800`}>{formatPercent(pos.percentage)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p className="text-sm text-gray-400">暂无持仓数据</p>
  );
};

const FundProfileModal: React.FC<FundProfileModalProps> = ({ profile, fundName, onClose }) => {
  // 判断是否有左边内容（类型或板块）
  const hasLeftContent = profile.fund_type || (profile.sectors && profile.sectors.length > 0);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: SUBMODAL_Z_INDEX }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{fundName} - 基金详情</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 60px)' }}>
          {/* 上部区域：左右布局 */}
          {hasLeftContent && (
            <div className="flex gap-6 mb-6">
              {/* 左边：类型和板块信息 */}
              <div className="flex-shrink-0 w-1/3">
                {/* 基金类型 */}
                {profile.fund_type && (
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-700 mb-2 flex items-center text-sm">
                      <i className="fas fa-tag text-blue-500 mr-1.5 text-xs" />
                      基金类型
                    </h4>
                    <span className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-sm font-medium">
                      {profile.fund_type}
                    </span>
                  </div>
                )}

                {/* 板块信息 */}
                {profile.sectors && profile.sectors.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2 flex items-center text-sm">
                      <i className="fas fa-layer-group text-purple-500 mr-1.5 text-xs" />
                      板块信息
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.sectors.map((sector, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium"
                        >
                          {sector.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 右边：股票持仓 */}
              <div className="flex-grow">
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center text-sm">
                  <i className="fas fa-chart-pie text-blue-500 mr-1.5 text-xs" />
                  股票持仓
                </h4>
                <StockPositionsTable data={profile.stock_positions} compact />
              </div>
            </div>
          )}

          {/* 如果没有左边内容，单独显示股票持仓 */}
          {!hasLeftContent && (
            <div className="mb-6">
              <h4 className="font-semibold text-gray-700 mb-3 flex items-center">
                <i className="fas fa-chart-pie text-blue-500 mr-2 text-sm" />
                股票持仓
              </h4>
              <StockPositionsTable data={profile.stock_positions} />
            </div>
          )}

          {/* 阶段盈亏 */}
          <div>
            <h4 className="font-semibold text-gray-700 mb-3 flex items-center">
              <i className="fas fa-chart-line text-green-500 mr-2 text-sm" />
              阶段盈亏
            </h4>
            {profile.stage_increase.length > 0 ? (
              <div className="grid grid-cols-4 gap-3">
                {profile.stage_increase.map((stage, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">{stage.stage}</div>
                    <div className={`font-bold ${
                      stage.increase_percentage > 0 ? 'text-red-600' :
                      stage.increase_percentage < 0 ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      {stage.increase_percentage > 0 ? '+' : ''}{formatPercent(stage.increase_percentage)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">暂无阶段盈亏数据</p>
            )}
          </div>

          {/* 更新时间 */}
          <div className="mt-4 text-xs text-gray-400 text-right">
            数据更新时间：{new Date(profile.fetched_at).toLocaleString()}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FundProfileModal;