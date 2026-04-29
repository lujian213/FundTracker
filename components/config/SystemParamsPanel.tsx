import React, { useState, useEffect } from 'react';
import { getSystemParams, saveSystemParams } from '../../services/systemConfigService';

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

  useEffect(() => {
    setParams(getSystemParams());
  }, []);

  const handleChange = (key: 'ocrConcurrency', value: number) => {
    const newParams = { ...params, [key]: value };
    setParams(newParams);
    saveSystemParams(newParams);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-sliders-h text-blue-500 mr-2"></i>
          系统参数
        </h3>

        <div className="space-y-6">
          {PARAM_CONFIGS.map(config => (
            <div key={config.key} className="flex flex-col gap-2">
              {/* 标签 + 问号提示 */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{config.label}</span>
                <span className="relative group cursor-pointer">
                  <i className="fas fa-question-circle text-blue-500 hover:text-blue-600 text-xs"></i>
                  {/* 自定义 tooltip */}
                  <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-40 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-normal z-10">
                    {config.description}
                  </span>
                </span>
              </div>

              {/* 滑块 */}
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={config.min}
                  max={config.max}
                  value={params[config.key]}
                  onChange={(e) => handleChange(config.key, parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-sm text-gray-600 w-8">{params[config.key]}</span>
              </div>

              {/* 范围提示 */}
              <div className="text-xs text-gray-500">
                范围: {config.min} - {config.max}，当前: {params[config.key]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SystemParamsPanel;