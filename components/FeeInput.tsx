import React, { useState, useCallback, useRef, useEffect } from 'react';
import { getTradesForSymbol } from '../hooks/useTrades';
import { calculateFee } from '../utils/feeCalculator';

export interface FeeInputProps {
  symbol: string;
  type: 'buy' | 'sell';
  price: number;
  total?: number; // 买入时必需
  shares?: number; // 卖出时必需
  value: number;
  onChange: (fee: number) => void;
  disabled?: boolean;
  compact?: boolean; // 紧凑模式
}

/**
 * 手续费输入组件
 * - 支持手动输入手续费
 * - 支持根据历史交易自动计算手续费
 * - 显示临时提示信息
 */
export function FeeInput({
  symbol,
  type,
  price,
  total,
  shares,
  value,
  onChange,
  disabled = false,
  compact = false,
}: FeeInputProps) {
  const [toastMessage, setToastMessage] = useState<string>('');
  const timerRef = useRef<number | null>(null);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 显示临时提示
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setToastMessage('');
    }, 3000);
  }, []);

  // 点击计算器按钮
  const handleAutoCalculate = useCallback(() => {
    try {
      // 检查必要参数
      if (type === 'buy' && total === undefined) {
        showToast('买入交易需要提供交易总额');
        return;
      }
      if (type === 'sell' && shares === undefined) {
        showToast('卖出交易需要提供份额');
        return;
      }

      // 获取历史交易
      const historicalTrades = getTradesForSymbol(symbol);

      // 计算手续费 - 使用运行时验证替代类型断言
      const fee = type === 'buy'
        ? calculateFee({ historicalTrades, type, price, total: total! })
        : calculateFee({ historicalTrades, type, price, shares: shares! });

      // 调用 onChange
      onChange(fee);

      // 显示提示
      if (fee === 0) {
        showToast('无历史手续费记录，已设为0');
      } else {
        showToast(`已根据历史记录计算: ${fee.toFixed(2)}元`);
      }
    } catch (error) {
      console.error('FeeInput: 计算手续费失败', error);
      showToast('计算手续费失败，请手动输入');
    }
  }, [symbol, type, price, total, shares, onChange, showToast]);

  return (
    <div className="relative">
      {/* 输入框容器 */}
      <div className="relative flex items-center">
        {/* 输入框 */}
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          disabled={disabled}
          className={`fee-input w-full px-2 py-1 pr-12 border rounded text-right ${
            compact ? 'text-xs' : 'h-8 text-sm'
          } ${
            disabled ? 'bg-gray-50 text-gray-500' : 'border-gray-200'
          }`}
          placeholder="手续费"
        />

        {/* 计算器按钮 */}
        <button
          type="button"
          onClick={handleAutoCalculate}
          disabled={disabled || (type === 'buy' && total === undefined) || (type === 'sell' && shares === undefined)}
          className="absolute right-1 px-2 py-1 text-gray-500 hover:text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
          title="自动计算手续费"
          aria-label="自动计算手续费"
        >
          <i className="fas fa-calculator text-xs"></i>
        </button>
      </div>

      {/* 临时提示 */}
      {toastMessage && (
        <div className="absolute z-50 mt-1 px-2 py-1 text-xs text-white bg-gray-700 rounded shadow-lg whitespace-nowrap">
          {toastMessage}
        </div>
      )}
    </div>
  );
}