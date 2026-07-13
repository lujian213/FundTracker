import React, { useState, useEffect } from 'react';
import { getSystemParams, saveSystemParams } from '../../services/systemConfigService';
import { getRiskThresholds, saveRiskThresholds, resetRiskThresholds } from '../../services/riskThresholdService';
import { RiskThresholds } from '../../types';
import RiskThresholdSliders, { MultiSlider } from './RiskThresholdSliders';

interface ParamConfig {
  key: 'ocrConcurrency';
  label: string;
  description: string;
  defaultValue: number;
  min: number;
  max: number;
}

const PARAM_CONFIGS: ParamConfig[] = [
  {
    key: 'ocrConcurrency',
    label: 'OCR 并发数量',
    description: '同时处理图片的数量。数值越大处理越快，但占用资源越多。建议：低端设备 1-2，普通设备 3-4，高性能设备 5-8。',
    defaultValue: 3,
    min: 1,
    max: 8,
  },
];

const SystemParamsPanel: React.FC = () => {
  const [params, setParams] = useState(() => getSystemParams());
  const [riskThresholds, setRiskThresholds] = useState<RiskThresholds>(() => getRiskThresholds());

  useEffect(() => {
    setParams(getSystemParams());
    setRiskThresholds(getRiskThresholds());
  }, []);

  const handleChange = (key: 'ocrConcurrency', value: number) => {
    const newParams = { ...params, [key]: value };
    setParams(newParams);
    saveSystemParams(newParams);
  };

  const handleRiskThresholdsChange = (newThresholds: RiskThresholds) => {
    setRiskThresholds(newThresholds);
    saveRiskThresholds(newThresholds);
  };

  const handleResetRiskThresholds = () => {
    resetRiskThresholds();
    setRiskThresholds(getRiskThresholds());
  };

  return (
    <div className="space-y-6">
      {/* 系统参数 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-sliders-h text-blue-500 mr-2"></i>
          运行参数
        </h3>

        <div className="space-y-6">
          {PARAM_CONFIGS.map(config => (
            <div key={config.key} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{config.label}</span>
                <span className="relative group cursor-pointer">
                  <i className="fas fa-question-circle text-blue-500 hover:text-blue-600 text-xs"></i>
                  <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-48 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-normal z-10">
                    {config.description}
                  </span>
                </span>
              </div>

              <MultiSlider
                values={[params[config.key]]}
                labels={['当前']}
                colors={['#3b82f6']}
                min={config.min}
                max={config.max}
                unit=""
                onChange={(index, value) => handleChange(config.key, value)}
                valueDisplayMode="below"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 风险预警阈值 */}
      <div className="bg-white rounded-xl border border-blue-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-exclamation-triangle text-orange-500 mr-2"></i>
          风险预警阈值
        </h3>

        <RiskThresholdSliders
          riskThresholds={riskThresholds}
          onChange={handleRiskThresholdsChange}
        />

        {/* 重置按钮 */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={handleResetRiskThresholds}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <i className="fas fa-undo text-xs"></i>
            重置为默认值
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemParamsPanel;