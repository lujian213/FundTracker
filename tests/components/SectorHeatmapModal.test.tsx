import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SectorHeatmapModal from '../../components/SectorHeatmapModal';
import { mockSectorData } from '../utils/mockSectorData';

// Mock echarts-for-react
jest.mock('echarts-for-react', () => {
  return {
    __esModule: true,
    default: function MockECharts({ option, onEvents, style }: any) {
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
            >
              {item.name}
            </div>
          ))}
        </div>
      );
    }
  };
});

// Mock sectorService
jest.mock('../../services/sectorService', () => ({
  fetchConceptSectors: jest.fn(),
  fetchIndustrySectors: jest.fn(),
  extractTopSectors: jest.fn()
}));

import {
  fetchConceptSectors,
  fetchIndustrySectors,
  extractTopSectors
} from '../../services/sectorService';

describe('SectorHeatmapModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock默认返回值 - 使用 mixed 数据确保有涨幅和跌幅
    (fetchConceptSectors as jest.Mock).mockResolvedValue(mockSectorData(20, 'mixed'));
    (fetchIndustrySectors as jest.Mock).mockResolvedValue(mockSectorData(20, 'mixed'));
    (extractTopSectors as jest.Mock).mockReturnValue({
      topGainers: mockSectorData(10, 'gainer'),
      topLosers: mockSectorData(10, 'loser')
    });
  });

  test('renders when open', () => {
    render(<SectorHeatmapModal isOpen={true} onClose={() => {}} />);

    // Modal容器有fixed inset-0的className
    const modal = screen.getByText('板块热力图').closest('.fixed');
    expect(modal).toBeInTheDocument();
    expect(screen.getByText('板块热力图')).toBeInTheDocument();
  });

  test('does not render when closed', () => {
    render(<SectorHeatmapModal isOpen={false} onClose={() => {}} />);

    expect(screen.queryByText('板块热力图')).not.toBeInTheDocument();
  });

  test('calls onClose when close button clicked', () => {
    const onClose = jest.fn();
    render(<SectorHeatmapModal isOpen={true} onClose={onClose} />);

    // 关闭按钮使用 Font Awesome 图标
    const closeButton = screen.getByRole('button', { name: '关闭' });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  test('loads concept sectors by default', async () => {
    render(<SectorHeatmapModal isOpen={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(fetchConceptSectors).toHaveBeenCalled();
    });
  });

  test('switches to industry sectors when button clicked', async () => {
    render(<SectorHeatmapModal isOpen={true} onClose={() => {}} />);

    const industryButton = screen.getByRole('button', { name: '行业板块' });
    fireEvent.click(industryButton);

    await waitFor(() => {
      expect(fetchIndustrySectors).toHaveBeenCalled();
    });
  });

  test('shows loading state initially', () => {
    // Mock延迟返回
    (fetchConceptSectors as jest.Mock).mockImplementation(() =>
      new Promise(resolve => setTimeout(resolve, 1000))
    );

    render(<SectorHeatmapModal isOpen={true} onClose={() => {}} />);

    expect(screen.getByText('正在加载板块数据...')).toBeInTheDocument();
  });

  test('shows error state on fetch failure', async () => {
    (fetchConceptSectors as jest.Mock).mockRejectedValue(
      new Error('获取概念板块数据失败: Network error')
    );

    render(<SectorHeatmapModal isOpen={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/获取概念板块数据失败/)).toBeInTheDocument();
    });
  });

  test('shows retry button on error', async () => {
    (fetchConceptSectors as jest.Mock).mockRejectedValueOnce(
      new Error('获取概念板块数据失败: Network error')
    ).mockResolvedValueOnce(mockSectorData(20, 'mixed'));

    render(<SectorHeatmapModal isOpen={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/获取概念板块数据失败/)).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: '重试' });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(fetchConceptSectors).toHaveBeenCalledTimes(2);
    });
  });
});