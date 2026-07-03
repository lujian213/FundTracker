import React, { useState, useEffect, useCallback, useMemo } from 'react';
import SectorHeatmap from './SectorHeatmap';
import {
  fetchConceptSectors,
  fetchIndustrySectors,
  extractTopSectors
} from '../services/sectorService';
import { SectorData, SectorType } from '../types/sectorData';
import { useModalBodyStyle } from '../hooks/useModalBodyStyle';

interface SectorHeatmapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 板块热力图Modal容器
 */
export default function SectorHeatmapModal({
  isOpen,
  onClose
}: SectorHeatmapModalProps) {
  // 全屏模态框打开时隐藏主页面滚动条
  useModalBodyStyle(isOpen);

  const [sectorType, setSectorType] = useState<SectorType>('concept');
  const [sectors, setSectors] = useState<SectorData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = sectorType === 'concept'
        ? await fetchConceptSectors()
        : await fetchIndustrySectors();

      setSectors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取板块数据失败');
    } finally {
      setLoading(false);
    }
  }, [sectorType]);

  // Modal打开时立即加载
  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  // 自动刷新（每30秒）
  useEffect(() => {
    if (!isOpen || loading) return;

    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [isOpen, loading, fetchData]);

  // 类型切换
  const handleTypeSwitch = (type: SectorType) => {
    setSectorType(type);
    setSectors(null);
  };

  // 提取Top10（使用 useMemo 缓存）
  const { topGainers, topLosers } = useMemo(() => {
    return sectors ? extractTopSectors(sectors) : { topGainers: [], topLosers: [] };
  }, [sectors]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-[150]">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>

      {/* Modal容器 */}
      <div className="relative bg-white rounded-2xl w-full max-w-5xl p-6 z-40">
        {/* 标题栏 */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            板块热力图
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors"
            aria-label="关闭"
          >
            <i className="fas fa-times text-gray-400"></i>
          </button>
        </div>

        {/* 切换按钮 */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => handleTypeSwitch('concept')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              sectorType === 'concept'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            概念板块
          </button>
          <button
            onClick={() => handleTypeSwitch('industry')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              sectorType === 'industry'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            行业板块
          </button>
        </div>

        {/* 内容区 - 固定高度480px避免切换抖动 */}
        <div className="relative" style={{ height: '480px' }}>
          {/* 加载状态 */}
          {loading && (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-lg">正在加载板块数据...</div>
            </div>
          )}

          {/* 错误状态 */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="text-lg text-red-500">
                ❌ {error}
              </div>
              <button
                onClick={fetchData}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                重试
              </button>
            </div>
          )}

          {/* 热力图 */}
          {!loading && !error && sectors && (
            <SectorHeatmap
              topGainers={topGainers}
              topLosers={topLosers}
              width={976}
              height={450}
            />
          )}
        </div>
      </div>
    </div>
  );
}