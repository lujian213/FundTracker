import React, { useCallback } from 'react';
import { ValuationData, TradeRecord } from '../types';
import AISidePanelBase, { AISidePanelBaseProps } from './AISidePanelBase';
import { FundAIQueryContext } from '../types/aiServiceTypes';

interface FundAISidePanelProps {
  isVisible: boolean;
  onClose: () => void;
  fundSymbol: string;
  fundName: string;
  valuationData?: ValuationData;
  tradeHistory?: TradeRecord[];
  fullCapacity?: number;
  initialCapacity?: number;
  initialDate?: string;
  initialPrice?: number;
  marketValue?: number | null;
  position?: number | null;
  positionRate?: number | null;
  profit?: number | null;
  avgCostPrice?: number | null;
}

/**
 * 基金 AI 助手面板组件
 * 作为 AISidePanelBase 的包装器，负责接收基金特定 props、构建 FundAIQueryContext、传递给 AISidePanelBase
 */
const FundAISidePanel: React.FC<FundAISidePanelProps> = ({
  isVisible,
  onClose,
  fundSymbol,
  fundName,
  valuationData,
  tradeHistory,
  fullCapacity,
  initialCapacity,
  initialDate,
  initialPrice,
  marketValue,
  position,
  positionRate,
  profit,
  avgCostPrice
}) => {
  // 构建 FundAIQueryContext 的回调函数
  const getContextData = useCallback((): FundAIQueryContext => {
    return {
      marketType: 'fund',
      fundName,
      fundSymbol,
      valuationData,
      tradeHistory,
      fullCapacity,
      initialCapacity,
      initialDate,
      initialPrice,
      marketValue: marketValue ?? undefined,
      position: position ?? undefined,
      positionRate: positionRate ?? undefined,
      profit: profit ?? undefined,
      avgCostPrice: avgCostPrice ?? undefined,
    };
  }, [fundName, fundSymbol, valuationData, tradeHistory, fullCapacity, initialCapacity, initialDate, initialPrice, marketValue, position, positionRate, profit, avgCostPrice]);

  // 构建 stateKey
  const stateKey = `fund_${fundSymbol}`;

  return (
    <AISidePanelBase
      isVisible={isVisible}
      onClose={onClose}
      stateKey={stateKey}
      name={fundName}
      symbol={fundSymbol}
      marketType="fund"
      getContextData={getContextData}
      modalId="fund-details-modal"
    />
  );
};

export default FundAISidePanel;