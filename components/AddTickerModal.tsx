import React, { useState } from 'react';
import { MarketType } from '../types';
import AlertModal from './AlertModal';
import { convertIndexCode, INDEX_NAME_MAP } from '../src/utils/indexUrlHelper';
import { useModalBodyStyle } from '../hooks/useModalBodyStyle';

interface AddTickerModalProps {
  onClose: () => void;
  onAdd: (symbols: string[], type: MarketType) => Promise<void>;
  isLoading: boolean;
  progress?: string;
}

type TabType = 'fund' | 'index';

export const AddTickerModal: React.FC<AddTickerModalProps> = ({ onClose, onAdd, isLoading, progress }) => {
  useModalBodyStyle();
  const [activeTab, setActiveTab] = useState<TabType>('fund');
  const [tabInputs, setTabInputs] = useState<Record<TabType, string>>({
    fund: '',
    index: ''
  });
  const [alertInfo, setAlertInfo] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: ''
  });

  const updateCurrentInput = (value: string) => {
    setTabInputs(prev => ({
      ...prev,
      [activeTab]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rawValue = tabInputs[activeTab].trim();
    if (!rawValue) return;

    const parts = rawValue.split(/[\s,\n,，]+/).map(p => p.trim()).filter(p => p.length > 0);

    if (activeTab === 'fund') {
      // Allow 4-6 digit codes from UI and normalize them to 6 digits before calling onAdd
      const rawCodes = parts.filter(c => /^\d{4,6}$/.test(c));
      const codes = rawCodes.map(c => c.padStart(6, '0'));
      if (codes.length > 0) {
        onAdd(codes, MarketType.FUND);
      } else {
        setAlertInfo({ isOpen: true, message: "请输入有效的基金代码（4-6位数字）" });
      }
    } else {
      // Index tab - 使用统一的代码转换函数
      const codes = parts.map(c => convertIndexCode(c));

      // 验证指数代码格式：必须是 "数字.字母或数字组合" 格式
      const validIndexPattern = /^\d+\.[A-Za-z0-9]+$/;
      const validCodes = codes.filter(c => validIndexPattern.test(c));

      if (validCodes.length > 0) {
        onAdd(validCodes, MarketType.INDEX);
        // 如果有无效代码，显示提示
        if (validCodes.length < codes.length) {
          setAlertInfo({ isOpen: true, message: `部分代码格式无效，已添加 ${validCodes.length} 个有效代码` });
        }
      } else {
        setAlertInfo({ isOpen: true, message: "请输入有效的行情代码（如 100.NDX 或 1.000001）" });
      }
    }
  };

  const handleSuggestionClick = (code: string) => {
    const currentInput = tabInputs[activeTab];
    const trimmed = currentInput.trimEnd();

    if (trimmed === '') {
      updateCurrentInput(code);
    } else {
      const lastChar = currentInput.slice(-1);
      const separator = /[\s,，]/.test(lastChar) ? '' : ' ';
      updateCurrentInput(currentInput + separator + code);
    }
  };

  const SUGGESTIONS = {
    fund: [
      { name: '沪深300', code: '000961' },
      { name: '中证500', code: '160119' },
      { name: '蓝筹精选', code: '005827' },
      { name: '纳指100', code: '270042' },
      { name: '招商白酒', code: '161725' },
      { name: '中欧医疗', code: '003095' },
    ],
    index: [
      // 国内指数
      { name: INDEX_NAME_MAP['1.000001'] || '上证指数', code: '1.000001' },
      { name: INDEX_NAME_MAP['0.399001'] || '深证成指', code: '0.399001' },
      { name: INDEX_NAME_MAP['0.399006'] || '创业板指', code: '0.399006' },
      { name: INDEX_NAME_MAP['100.HSI'] || '恒生指数', code: '100.HSI' },
      // 全球指数
      { name: INDEX_NAME_MAP['100.NDX'] || '纳斯达克100', code: '100.NDX' },
      { name: INDEX_NAME_MAP['100.SPX'] || '标普500', code: '100.SPX' },
    ]
  };

  const currentSuggestions = SUGGESTIONS[activeTab];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl transition-all scale-in duration-200">
        <div className={`px-6 py-4 flex justify-between items-center transition-colors ${activeTab === 'fund' ? 'bg-red-600' : 'bg-blue-600'}`}>
          <div>
            <h3 className="text-white font-bold">
              {activeTab === 'fund' ? '添加基金' : '添加指数'}
            </h3>
            <p className="text-[10px] text-white/60">实时同步 东方财富/天天基金</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-6">
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setActiveTab('fund')}
              className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${activeTab === 'fund' ? 'bg-white shadow-sm text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              公募基金
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('index')}
              className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${activeTab === 'index' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              指数行情
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
                请输入代码 (支持空格分隔)
              </label>

              <textarea
                autoFocus
                value={tabInputs[activeTab]}
                onChange={(e) => updateCurrentInput(e.target.value)}
                placeholder={activeTab === 'fund' ? "例如: 000001 012345" : "例如: 100.NDX 1.000001"}
                rows={2}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-gray-300 outline-none transition-all text-sm font-mono leading-relaxed bg-gray-50/30"
              />

              <div className="mt-4">
                <p className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-tight">常用推荐 (点击追加)</p>
                <div className="grid grid-cols-3 gap-2">
                  {currentSuggestions.map(idx => (
                    <button
                      key={idx.code}
                      type="button"
                      onClick={() => handleSuggestionClick(idx.code)}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border transition-all text-center group ${activeTab === 'fund' ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'}`}
                    >
                      <span className="text-[10px] font-bold truncate w-full">{idx.name}</span>
                      <span className="text-[8px] opacity-60 font-mono mt-0.5">{idx.code}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !tabInputs[activeTab].trim()}
              className={`w-full text-white font-bold py-4 rounded-xl disabled:opacity-50 transition-all shadow-lg flex items-center justify-center space-x-2 ${activeTab === 'fund' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isLoading ? (
                <i className="fas fa-circle-notch animate-spin"></i>
              ) : (
                <span>添加代码</span>
              )}
            </button>
          </form>
        </div>
      </div>

      <AlertModal
        isOpen={alertInfo.isOpen}
        message={alertInfo.message}
        onClose={() => setAlertInfo({ isOpen: false, message: '' })}
      />
    </div>
  );
};