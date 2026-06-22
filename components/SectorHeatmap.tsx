import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { SectorData } from '../types/sectorData';
import { formatAmount } from '../utils/format';
import { getChangePercentColor, shouldUseWhiteText } from '../utils/colorUtils';

interface SectorHeatmapProps {
  topGainers: SectorData[];
  topLosers: SectorData[];
  width: number;
  height: number;
}

/**
 * 板块热力图核心组件（使用 ECharts Treemap）
 */
export default function SectorHeatmap({
  topGainers,
  topLosers,
  width,
  height
}: SectorHeatmapProps) {
  // 生成 Treemap 配置
  const generateTreemapOption = (data: SectorData[], isGainer: boolean) => {
    // 转换数据为 ECharts Treemap 格式
    const treemapData = data.map(sector => {
      const useWhite = shouldUseWhiteText(sector.changePercent);
      return {
        name: sector.name,
        value: sector.marketCap, // 方块大小由市值决定
        changePercent: sector.changePercent,
        changeAmount: sector.changeAmount,
        turnoverRate: sector.turnoverRate,
        upCount: sector.upCount,
        downCount: sector.downCount,
        leadingStock: sector.leadingStock,
        code: sector.code,
        itemStyle: {
          color: getChangePercentColor(sector.changePercent, isGainer)
        },
        label: {
          color: useWhite ? '#fff' : '#333',
          fontWeight: 'bold',
          fontSize: 14,
          textShadowColor: useWhite ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)',
          textShadowBlur: useWhite ? 2 : 0
        }
      };
    });

    return {
      series: [{
        type: 'treemap',
        width: '100%',
        height: '100%',  // 填满整个容器
        top: 0,  // 不预留顶部空间
        left: 0,  // 从左边缘开始
        roam: false, // 禁止缩放和平移
        nodeClick: 'link', // 点击跳转
        breadcrumb: {
          show: false // 不显示面包屑导航
        },
        label: {
          show: true,
          formatter: (params: any) => {
            // 安全检查：确保数据存在
            if (!params.data || params.data.changePercent === undefined) {
              return '';
            }
            const data = params.data;
            const changePercent = data.changePercent || 0;
            return `${data.name}\n${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
          },
          fontSize: 14,
          fontWeight: 'bold'
        },
        upperLabel: {
          show: false  // 不显示父节点标签（避免"未知"区域）
        },
        itemStyle: {
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.1)',
          gapWidth: 1  // 减小间隙宽度
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16
          },
          itemStyle: {
            borderColor: '#333',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.3)'
          }
        },
        data: treemapData
      }],
      tooltip: {
        show: true,
        trigger: 'item',
        formatter: (params: any) => {
          // 安全检查：确保数据存在
          if (!params.data) {
            return `<div style="padding: 8px;">${params.name || '未知'}</div>`;
          }
          const data = params.data;
          const changePercent = data.changePercent || 0;
          const changeAmount = data.changeAmount || 0;
          const turnoverRate = data.turnoverRate || 0;
          const upCount = data.upCount || 0;
          const downCount = data.downCount || 0;
          const value = data.value || 0;

          return `
            <div style="padding: 8px; line-height: 1.8;">
              <div style="font-weight: bold; margin-bottom: 4px;">${data.name || '未知'}</div>
              <div>涨跌幅: <span style="color: ${changePercent >= 0 ? '#ef4444' : '#10b981'}">${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%</span></div>
              <div>涨跌额: ${changeAmount.toFixed(2)}</div>
              <div>总市值: ${formatAmount(value)}</div>
              <div>换手率: ${turnoverRate.toFixed(2)}%</div>
              <div>上涨/下跌: ${upCount}/${downCount}</div>
              ${data.leadingStock ? `<div>领涨股: ${data.leadingStock}</div>` : ''}
            </div>
          `;
        },
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: '#ccc',
        borderWidth: 1,
        padding: [5, 10],
        textStyle: {
          color: '#333',
          fontSize: 13
        }
      }
    };
  };

  // 处理点击事件
  const handleEvents = {
    click: (params: any) => {
      // 安全检查：确保数据存在且有 code 字段
      if (params.data && params.data.code) {
        const url = `https://so.eastmoney.com/web/s?keyword=${params.data.code}`;
        window.open(url, '_blank');
      }
    }
  };

  // 计算平均涨跌幅
  const avgGainerChange = useMemo(() => {
    return topGainers.length > 0
      ? topGainers.reduce((sum, s) => sum + s.changePercent, 0) / topGainers.length
      : 0;
  }, [topGainers]);

  const avgLoserChange = useMemo(() => {
    return topLosers.length > 0
      ? topLosers.reduce((sum, s) => sum + s.changePercent, 0) / topLosers.length
      : 0;
  }, [topLosers]);

  // 使用 useMemo 缓存配置对象
  const gainerOption = useMemo(() => generateTreemapOption(topGainers, true), [topGainers]);
  const loserOption = useMemo(() => generateTreemapOption(topLosers, false), [topLosers]);

  // 计算布局宽度（确保不超出容器）
  const contentWidth = width - 30; // 减去左右padding
  const gapWidth = 15;
  const availableForDivs = contentWidth - gapWidth; // 可用于两个div的宽度

  // 左侧48%，右侧52%（相对于可用宽度）
  const leftWidth = availableForDivs * 0.48;
  const rightWidth = availableForDivs * 0.52;

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: '#f5f5f5',
        padding: '15px',  // 减少padding
        display: 'flex',
        gap: '15px'  // 减少gap
      }}
    >
      {/* 左侧涨幅区 */}
      <div style={{ width: leftWidth, height: height - 30 }}>  {/* 减去上下padding */}
        <div style={{ marginBottom: '8px', textAlign: 'center' }}>  {/* 减少margin */}
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#333', margin: '0 0 3px 0' }}>  {/* 减少margin */}
            涨幅Top10
          </h3>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
            平均 {avgGainerChange > 0 ? '+' : ''}{avgGainerChange.toFixed(2)}%
          </p>
        </div>
        <ReactECharts
          option={gainerOption}
          style={{ width: '100%', height: height - 70 }}
          onEvents={handleEvents}
          opts={{ renderer: 'canvas' }}
        />
      </div>

      {/* 右侧跌幅区 */}
      <div style={{ width: rightWidth, height: height - 30 }}>  {/* 减去上下padding */}
        <div style={{ marginBottom: '8px', textAlign: 'center' }}>  {/* 减少margin */}
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#333', margin: '0 0 3px 0' }}>  {/* 减少margin */}
            跌幅Top10
          </h3>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
            平均 {avgLoserChange.toFixed(2)}%
          </p>
        </div>
        <ReactECharts
          option={loserOption}
          style={{ width: '100%', height: height - 70 }}
          onEvents={handleEvents}
          opts={{ renderer: 'canvas' }}
        />
      </div>
    </div>
  );
}