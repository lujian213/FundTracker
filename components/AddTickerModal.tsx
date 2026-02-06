
import React, { useState } from 'react';

interface AddTickerModalProps {
  onClose: () => void;
  onAdd: (symbols: string[]) => Promise<void>;
  isLoading: boolean;
  progress?: string;
}

export const AddTickerModal: React.FC<AddTickerModalProps> = ({ onClose, onAdd, isLoading, progress }) => {
  const [inputValue, setInputValue] = useState('');
  const [isBatchMode, setIsBatchMode] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // Split by comma, space, or newline. Support 5 or 6 digits.
    const codes = inputValue
      .split(/[\s,\n]+/)
      .map(c => c.trim())
      .filter(c => /^\d{5,6}$/.test(c));

    if (codes.length > 0) {
      onAdd(codes);
    } else {
      alert("请输入有效的基金代码（5-6位数字）");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl transition-all scale-in duration-200">
        <div className="bg-red-600 px-6 py-4 flex justify-between items-center">
          <div>
            <h3 className="text-white font-bold">添加基金 / 股票</h3>
            <p className="text-[10px] text-white/60">支持大陆 (6位) 及 香港 (5位) 代码</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-6">
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setIsBatchMode(false)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${!isBatchMode ? 'bg-white shadow-sm text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              单个代码
            </button>
            <button
              type="button"
              onClick={() => setIsBatchMode(true)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${isBatchMode ? 'bg-white shadow-sm text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              批量导入
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
                {isBatchMode ? '输入代码列表 (空格或逗号分隔)' : '请输入 5-6 位代码'}
              </label>

              {isBatchMode ? (
                <textarea
                  autoFocus
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="例如: 012328, 000001, 00700..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-red-500 outline-none transition-all text-sm font-mono leading-relaxed"
                />
              ) : (
                <input
                  autoFocus
                  type="text"
                  maxLength={6}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ''))}
                  placeholder="例如: 012328"
                  className="w-full px-4 py-4 rounded-xl border-2 border-gray-100 focus:border-red-500 outline-none transition-all text-xl font-mono text-center tracking-widest"
                />
              )}

              <div className="text-[10px] text-gray-400 mt-4 px-2 space-y-1">
                <p>💡 请输入正确的代码，系统将自动从天天基金抓取名称。</p>
                <p>💡 示例：<span className="font-bold">012328</span> (基金) 或 <span className="font-bold">00700</span> (腾讯)</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="w-full bg-red-600 text-white font-bold py-4 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all shadow-lg shadow-red-100 flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <div className="flex flex-col items-center">
                  <div className="flex items-center space-x-2">
                    <i className="fas fa-circle-notch animate-spin"></i>
                    <span>正在处理...</span>
                  </div>
                  {progress && <span className="text-[10px] opacity-70 mt-1 font-normal">{progress}</span>}
                </div>
              ) : (
                <span>立即添加</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
