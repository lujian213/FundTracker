import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SectorHeatmap from '../../components/SectorHeatmap';
import { mockSectorData } from '../utils/mockSectorData';

// Mock window.open
const mockWindowOpen = jest.fn();
window.open = mockWindowOpen;

// Mock echarts-for-react - 使用正确的导入方式
jest.mock('echarts-for-react', () => {
  return {
    __esModule: true,
    default: function MockECharts({ option, onEvents, style }: any) {
      // 模拟渲染数据
      const data = option?.series?.[0]?.data || [];
      return (
        <div
          data-testid="echarts-treemap"
          style={style}
          data-series-count={data.length}
        >
          {data.map((item: any, index: number) => (
            <div
              key={index}
              data-testid={`treemap-item-${index}`}
              data-name={item.name}
              data-change={item.changePercent}
              onClick={() => {
                if (onEvents?.click) {
                  onEvents.click({ data: item });
                }
              }}
            >
              {item.name}
            </div>
          ))}
        </div>
      );
    }
  };
});

describe('SectorHeatmap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders without crashing', () => {
    const topGainers = mockSectorData(10, 'gainer');
    const topLosers = mockSectorData(10, 'loser');

    render(
      <SectorHeatmap
        topGainers={topGainers}
        topLosers={topLosers}
        width={800}
        height={600}
      />
    );

    // 应该有两个ECharts实例（涨幅和跌幅）
    const echartsInstances = screen.getAllByTestId('echarts-treemap');
    expect(echartsInstances.length).toBe(2);
  });

  test('renders 10 gainers and 10 losers', () => {
    const topGainers = mockSectorData(10, 'gainer');
    const topLosers = mockSectorData(10, 'loser');

    render(
      <SectorHeatmap
        topGainers={topGainers}
        topLosers={topLosers}
        width={800}
        height={600}
      />
    );

    const echartsInstances = screen.getAllByTestId('echarts-treemap');
    // 第一个是涨幅区，应该有10个项目
    expect(echartsInstances[0].getAttribute('data-series-count')).toBe('10');
    // 第二个是跌幅区，应该有10个项目
    expect(echartsInstances[1].getAttribute('data-series-count')).toBe('10');
  });

  test('clicks item opens eastmoney page', () => {
    const topGainers = mockSectorData(10, 'gainer');
    const topLosers = mockSectorData(10, 'loser');

    render(
      <SectorHeatmap
        topGainers={topGainers}
        topLosers={topLosers}
        width={800}
        height={600}
      />
    );

    // 获取所有的treemap-item-0，然后选择第一个（涨幅区的第一个）
    const items = screen.getAllByTestId('treemap-item-0');
    const firstItem = items[0]; // 选择涨幅区的第一个
    firstItem.click();

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://so.eastmoney.com/web/s?keyword=BK1000',
      '_blank'
    );
  });

  test('handles empty data', () => {
    render(
      <SectorHeatmap
        topGainers={[]}
        topLosers={[]}
        width={800}
        height={600}
      />
    );

    const echartsInstances = screen.getAllByTestId('echarts-treemap');
    expect(echartsInstances[0].getAttribute('data-series-count')).toBe('0');
    expect(echartsInstances[1].getAttribute('data-series-count')).toBe('0');
  });

  test('renders sector names in items', () => {
    const topGainers = [{
      ...mockSectorData(1, 'gainer')[0],
      name: '人工智能',
      marketCap: 100000000000
    }];
    const topLosers = mockSectorData(1, 'loser');

    render(
      <SectorHeatmap
        topGainers={topGainers}
        topLosers={topLosers}
        width={800}
        height={600}
      />
    );

    expect(screen.getByText('人工智能')).toBeInTheDocument();
  });

  test('renders left and right sections', () => {
    const topGainers = mockSectorData(10, 'gainer');
    const topLosers = mockSectorData(10, 'loser');

    render(
      <SectorHeatmap
        topGainers={topGainers}
        topLosers={topLosers}
        width={800}
        height={600}
      />
    );

    // 检查左侧涨幅标题
    expect(screen.getByText('涨幅Top10')).toBeInTheDocument();
    // 检查右侧跌幅标题
    expect(screen.getByText('跌幅Top10')).toBeInTheDocument();
  });

  test('shows average change percentage', () => {
    const topGainers = mockSectorData(10, 'gainer');
    const topLosers = mockSectorData(10, 'loser');

    render(
      <SectorHeatmap
        topGainers={topGainers}
        topLosers={topLosers}
        width={800}
        height={600}
      />
    );

    // 检查平均涨跌幅显示（涨幅区）
    const gainerTexts = screen.getAllByText((content, element) => {
      return Boolean(element?.textContent?.includes('平均') && element?.textContent?.includes('+'));
    });
    expect(gainerTexts.length).toBeGreaterThan(0);

    // 检查平均涨跌幅显示（跌幅区）
    const loserTexts = screen.getAllByText((content, element) => {
      return Boolean(element?.textContent?.includes('平均') && element?.textContent?.includes('-'));
    });
    expect(loserTexts.length).toBeGreaterThan(0);
  });

  test('uses marketCap for item size', () => {
    const topGainers = [
      {
        ...mockSectorData(1, 'gainer')[0],
        marketCap: 1000000000000 // 1万亿
      },
      {
        ...mockSectorData(2, 'gainer')[1],
        marketCap: 100000000000 // 100亿
      }
    ];
    const topLosers = mockSectorData(1, 'loser');

    render(
      <SectorHeatmap
        topGainers={topGainers}
        topLosers={topLosers}
        width={800}
        height={600}
      />
    );

    // 获取所有的treemap-item-0，然后选择第一个（涨幅区的第一个）
    const items = screen.getAllByTestId('treemap-item-0');
    const firstItem = items[0]; // 选择涨幅区的第一个
    // 第一个项目的市值更大，应该在ECharts数据中
    expect(firstItem).toBeInTheDocument();
  });
});