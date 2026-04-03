import React from 'react';
import { createPortal } from 'react-dom';
import { FundProfile } from '../types';

const SUBMODAL_Z_INDEX = 150;

interface FundProfileModalProps {
  profile: FundProfile;
  fundName: string;
  onClose: () => void;
}

const FundProfileModal: React.FC<FundProfileModalProps> = ({ profile, fundName, onClose }) => {
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
          {/* 股票持仓 */}
          <div className="mb-6">
            <h4 className="font-semibold text-gray-700 mb-3 flex items-center">
              <i className="fas fa-chart-pie text-blue-500 mr-2 text-sm" />
              股票持仓
            </h4>
            {profile.stock_positions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-gray-500 font-medium">股票名称</th>
                      <th className="text-right py-2 text-gray-500 font-medium">持仓占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.stock_positions.map((pos, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-2 text-gray-800">{pos.stock_name}</td>
                        <td className="py-2 text-right text-gray-800">{pos.percentage.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">暂无持仓数据</p>
            )}
          </div>

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
                      {stage.increase_percentage > 0 ? '+' : ''}{stage.increase_percentage.toFixed(2)}%
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