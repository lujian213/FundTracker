import React, { useCallback } from 'react';
import { MarketIndex, HistoricalPoint, IntradayPoint, VolumeData } from '../types';
import AISidePanelBase from './AISidePanelBase';
import { IndexAIQueryContext } from '../types/aiServiceTypes';

interface IndexAISidePanelProps {
  isVisible: boolean;
  onClose: () => void;
  indexSymbol: string;
  indexName: string;
  currentValue?: number;  // 当前点位值
  currentVolume?: number;  // 当前成交量（手）
  history?: HistoricalPoint[];
  maValues?: Record<number, (number | null)[]>;
  volumeData?: VolumeData[];
  intradayPoints?: IntradayPoint[];
}

/**
 * 指数 AI 助手面板组件
 * 作为 AISidePanelBase 的包装器，负责接收指数特定 props、构建 IndexAIQueryContext、传递给 AISidePanelBase
 */
const IndexAISidePanel: React.FC<IndexAISidePanelProps> = ({
  isVisible,
  onClose,
  indexSymbol,
  indexName,
  currentValue,
  currentVolume,
  history,
  maValues,
  volumeData,
  intradayPoints
}) => {
  // 构建 IndexAIQueryContext 的回调函数
  const getContextData = useCallback((): IndexAIQueryContext => {
    // 获取当前日期时间
    const datetime = new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // 构建历史收盘价（最近30个交易日）
    const closingPrices = history?.slice(-30).map(p => ({
      date: new Date(p.date).toISOString().split('T')[0],
      price: p.value
    }));

    // 获取均线值（最近30个交易日）
    const ma5 = maValues?.[5]?.slice(-30);
    const ma10 = maValues?.[10]?.slice(-30);
    const ma20 = maValues?.[20]?.slice(-30);

    // 获取成交量（最近30个交易日）
    const volumes = volumeData?.slice(-30).map(v => v.volume);

    // 构建实时价格
    const realtimePrices = intradayPoints?.slice(-50).map(p => ({
      time: p.timestamp ? new Date(p.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '',
      price: p.value
    }));

    return {
      marketType: 'index',
      indexName,
      indexSymbol,
      datetime,
      currentValue,  // 当前点位值
      currentVolume,  // 当前成交量（手）
      closingPrices,
      ma5,
      ma10,
      ma20,
      volumes,
      realtimePrices,
    };
  }, [indexName, indexSymbol, currentValue, currentVolume, history, maValues, volumeData, intradayPoints]);

  // 构建 stateKey
  const stateKey = `index_${indexSymbol}`;

  return (
    <AISidePanelBase
      isVisible={isVisible}
      onClose={onClose}
      stateKey={stateKey}
      name={indexName}
      symbol={indexSymbol}
      marketType="index"
      getContextData={getContextData}
      modalId="index-details-modal"
    />
  );
};

export default IndexAISidePanel;