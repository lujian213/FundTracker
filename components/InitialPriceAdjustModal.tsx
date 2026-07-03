// components/InitialPriceAdjustModal.tsx
import React, { useState, useMemo } from 'react';
import { fmtNumber, fmtNav } from '../utils/format';
import { useModalBodyStyle } from '../hooks/useModalBodyStyle';

interface InitialPriceAdjustModalProps {
  symbol: string;
  fundName: string;
  currentProfit: number;
  currentInitialPrice: number | null;
  initialPosition: number;
  totalShares: number;
  currentPrice: number;
  sellAmount: number;
  buyAmount: number;
  onSave: (newInitialPrice: number) => void;
  onClose: () => void;
  zIndex?: number;
}

/**
 * 根据参考盈利和参考价格反推初始价格
 *
 * 公式：
 * 盈利 = (当前份额 × 当前价格) + 卖出总额 - 买入总额 - (初始份额 × 初始价格)
 *
 * 反推：
 * 初始价格 = ((当前份额 × 参考价格) + 卖出总额 - 买入总额 - 参考盈利) / 初始份额
 */
function calculateSuggestedInitialPrice(params: {
  totalShares: number;
  referencePrice: number;
  sellAmount: number;
  buyAmount: number;
  initialPosition: number;
  referenceProfit: number;
}): number | null {
  const { totalShares, referencePrice, sellAmount, buyAmount, initialPosition, referenceProfit } = params;

  if (initialPosition <= 0) return null;

  const numerator = (totalShares * referencePrice) + sellAmount - buyAmount - referenceProfit;
  const denominator = initialPosition;

  const result = numerator / denominator;

  if (!Number.isFinite(result)) return null;

  return result;
}

export const InitialPriceAdjustModal: React.FC<InitialPriceAdjustModalProps> = ({
  symbol,
  fundName,
  currentProfit,
  currentInitialPrice,
  initialPosition,
  totalShares,
  currentPrice,
  sellAmount,
  buyAmount,
  onSave,
  onClose,
  zIndex = 150,
}) => {
  useModalBodyStyle();
  const [referenceProfit, setReferenceProfit] = useState<string>(() => currentProfit.toFixed(2));
  const [referencePrice, setReferencePrice] = useState<string>(() => currentPrice.toFixed(4));

  const suggestedPrice = useMemo(() => {
    const profitValue = parseFloat(referenceProfit);
    const priceValue = parseFloat(referencePrice);
    if (isNaN(profitValue) || isNaN(priceValue)) return null;

    return calculateSuggestedInitialPrice({
      totalShares,
      referencePrice: priceValue,
      sellAmount,
      buyAmount,
      initialPosition,
      referenceProfit: profitValue,
    });
  }, [referenceProfit, referencePrice, totalShares, currentPrice, sellAmount, buyAmount, initialPosition]);

  const formatNullablePrice = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '-';
    return fmtNav(value);
  };

  const handleSave = () => {
    if (suggestedPrice !== null) {
      onSave(suggestedPrice);
    }
  };

  const isValid = suggestedPrice !== null;

  const referenceProfitValue = parseFloat(referenceProfit);
  const referenceProfitColor = isNaN(referenceProfitValue)
    ? 'text-gray-800'
    : referenceProfitValue >= 0 ? 'text-red-600' : 'text-green-600';

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative bg-white rounded-lg shadow-lg w-full max-w-2xl p-6 z-40">
        {/* 标题 */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">调整初始价格</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors"
            aria-label="关闭"
          >
            <i className="fas fa-times text-gray-400"></i>
          </button>
        </div>

        {/* 第一排：目前盈利 | 当前价格 | 目前初始价格 */}
        <div className="flex items-center py-2 border-b border-gray-100">
          <div className="flex items-center flex-1 whitespace-nowrap">
            <span className="text-sm text-gray-500 w-20">目前盈利：</span>
            <input
              type="text"
              readOnly
              value={currentProfit.toFixed(2)}
              className={`w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right bg-gray-50 ${currentProfit >= 0 ? 'text-red-600' : 'text-green-600'}`}
            />
          </div>
          <div className="flex items-center flex-1 whitespace-nowrap">
            <span className="text-sm text-gray-500 w-20">当前价格：</span>
            <input
              type="text"
              readOnly
              value={currentPrice.toFixed(4)}
              className="w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right bg-gray-50 text-gray-800"
            />
          </div>
          <div className="flex items-center flex-1 whitespace-nowrap">
            <span className="text-sm text-gray-500">目前初始价格：</span>
            <span className="text-sm font-medium text-gray-800 ml-2">
              {formatNullablePrice(currentInitialPrice)}
            </span>
          </div>
        </div>

        {/* 第二排：参考盈利 | 参考价格 | 建议初始价格 */}
        <div className="flex items-center py-2">
          <div className="flex items-center flex-1 whitespace-nowrap">
            <span className="text-sm text-gray-500 w-20">参考盈利：</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="请输入"
              value={referenceProfit}
              onChange={(e) => setReferenceProfit(e.target.value)}
              className={`w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right bg-gray-50 focus:outline-none focus:border-blue-500 ${referenceProfitColor}`}
            />
          </div>
          <div className="flex items-center flex-1 whitespace-nowrap">
            <span className="text-sm text-gray-500 w-20">参考价格：</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="请输入"
              value={referencePrice}
              onChange={(e) => setReferencePrice(e.target.value)}
              className="w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right bg-gray-50 focus:outline-none focus:border-blue-500 text-gray-800"
            />
          </div>
          <div className="flex items-center flex-1 whitespace-nowrap">
            <span className="text-sm text-gray-500">建议初始价格：</span>
            <span
              data-testid="suggested-price"
              className="text-sm font-medium text-gray-800 ml-2"
            >
              {formatNullablePrice(suggestedPrice)}
            </span>
          </div>
        </div>

        {/* 保存按钮 */}
        <div className="flex justify-center mt-6">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              isValid
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default InitialPriceAdjustModal;