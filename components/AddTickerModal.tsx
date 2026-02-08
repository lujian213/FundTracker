
import React, { useState } from 'react';
import { MarketType } from '../types';

interface AddTickerModalProps {
  onClose: () => void;
  onAdd: (symbols: string[], type: MarketType) => Promise<void>;
  isLoading: boolean;
  progress?: string;
}

export const AddTickerModal: React.FC<AddTickerModalProps> = ({ onClose, onAdd, isLoading, progress }) => {
  const [inputValue, setInputValue] = useState('');
  const [addType, setAddType] = useState<MarketType>(MarketType.FUND);
  const [isBatchMode, setIsBatchMode] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    let codes: string[] = [];
    if (addType === MarketType.FUND) {
      codes = inputValue
        .split(/[\s,\n,，]+/)
        .map(c => c.trim())
        .filter(c => /^\d{5,6}$/.test(c));
    } else {
      // 指数格式比较多样，通常是 1.000001, 0.399001, 124.HSTECH 等
      codes = inputValue
        .split(/[\s,\n,，]+/)
        .map(c => c.trim())
        .filter(c => c.length > 0);
    }

    if (codes.length > 0) {
      onAdd(codes, addType);
    } else {
      alert(addType === MarketType.FUND ? "请输入有效的基金代码（5-6位数字）" : "请输入有效的指数代码");
    }
  };

  const SUGGESTED_INDICES = [
    { name: '上证指数', code: '1.000001' },
    { name: '深证成指', code: '0.399001' },
    { name: '创业板指', code: '0.399006' },
    { name: '恒生指数', code: '100.HSI' },
    { name: '恒生科技', code: '124.HSTECH' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl transition-all scale-in duration-200">
        <div className={`px-6 py-4 flex justify-between items-center transition-colors ${addType === MarketType.FUND ? 'bg-red-600' : 'bg-blue-600'}`}>
          <div>
            <h3 className="text-white font-bold">{addType === MarketType.FUND ? '添加基金' : '添加指数'}</h3>
            <p className="text-[10px] text-white/60">数据同步自天天基金/东方财富</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-6">
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setAddType(MarketType.FUND)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${addType === MarketType.FUND ? 'bg-white shadow-sm text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              公募基金
            </button>
            <button
              type="button"
              onClick={() => setAddType(MarketType.INDEX)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${addType === MarketType.INDEX ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              大盘指数
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
                {addType === MarketType.FUND ? '输入代码 (空格/逗号分隔批量)' : '输入 secid 代码 (如 1.000001)'}
              </label>

              <textarea
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={addType === MarketType.FUND ? "例如: 012328, 000001..." : "例如: 1.000001"}
                rows={addType === MarketType.FUND ? 3 : 2}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-red-500 outline-none transition-all text-sm font-mono leading-relaxed"
              />

              {addType === MarketType.INDEX && (
                <div className="mt-4">
                  <p className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-tight">常用指数推荐</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_INDICES.map(idx => (
                      <button
                        key={idx.code}
                        type="button"
                        onClick={() => setInputValue(idx.code)}
                        className="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] rounded-md hover:bg-blue-100 transition-colors border border-blue-100"
                      >
                        {idx.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-gray-400 mt-4 px-2 space-y-1">
                {addType === MarketType.FUND ? (
                  <p>💡 请输入6位数字代码。系统将抓取最新估值。</p>
                ) : (
                  <p>💡 指数代码需带前缀，上证加 <span className="font-bold">1.</span>，深证/创业板加 <span className="font-bold">0.</span></p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className={`w-full text-white font-bold py-4 rounded-xl disabled:opacity-50 transition-all shadow-lg flex items-center justify-center space-x-2 ${addType === MarketType.FUND ? 'bg-red-600 hover:bg-red-700 shadow-red-100' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'}`}
            >
              {isLoading ? (
                <div className="flex flex-center space-x-2">
                  <i className="fas fa-circle-notch animate-spin"></i>
                  <span>正在添加...</span>
                </div>
              ) : (
                <span>完成并添加</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
