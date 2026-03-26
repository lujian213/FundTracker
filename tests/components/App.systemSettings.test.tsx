import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';

jest.mock('../../components/MarketNewsTicker', () => ({
  MarketNewsTicker: () => <div data-testid="market-news" />,
}));

jest.mock('../../components/AddTickerModal', () => ({
  AddTickerModal: () => null,
}));

jest.mock('../../components/FundDetailsModal', () => ({
  FundDetailsModal: () => null,
}));

jest.mock('../../components/IndexDetailsModal', () => ({
  IndexDetailsModal: () => null,
}));

jest.mock('../../components/OverallProfitModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/TransactionsModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/PositionsModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/BackupSettingsModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/AIMenuItem', () => ({
  __esModule: true,
  default: ({ onMenuClose, onOpenConfig }: { onMenuClose: () => void; onOpenConfig: () => void }) => (
    <button onClick={() => { onOpenConfig(); onMenuClose(); }} data-testid="ai-menu-item">
      AI配置
    </button>
  ),
}));

const fetchFundDataMock = jest.fn();
const fetchMarketIndicesMock = jest.fn();
const forceFetchFundHistoryMock = jest.fn();

jest.mock('../../services/fundService', () => ({
  fetchFundData: (...args: unknown[]) => fetchFundDataMock(...args),
  fetchMarketIndices: (...args: unknown[]) => fetchMarketIndicesMock(...args),
  forceFetchFundHistory: (...args: unknown[]) => forceFetchFundHistoryMock(...args),
}));

describe('App - 系统开关菜单', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();

    fetchFundDataMock.mockResolvedValue(null);
    forceFetchFundHistoryMock.mockResolvedValue([]);
    fetchMarketIndicesMock.mockResolvedValue([]);
  });

  // 辅助函数：找到菜单按钮（带有 fa-ellipsis-v 图标的按钮）
  const findMenuButton = () => {
    const buttons = screen.getAllByRole('button');
    return buttons.find(btn => btn.querySelector('.fa-ellipsis-v'));
  };

  test('should show system settings menu item when menu is open', async () => {
    render(<App />);

    // 打开菜单 - 点击右上角的菜单按钮
    const menuButton = findMenuButton();
    expect(menuButton).toBeDefined();
    fireEvent.click(menuButton!);

    await waitFor(() => {
      expect(screen.getByText('系统开关')).toBeInTheDocument();
    });
  });

  test('should open SystemSettingsModal when clicked', async () => {
    render(<App />);

    // 打开菜单
    const menuButton = findMenuButton();
    fireEvent.click(menuButton!);

    // 点击系统开关
    const systemSettingsButton = await screen.findByText('系统开关');
    fireEvent.click(systemSettingsButton);

    // 检查弹窗是否打开 - 应该显示系统开关标题和初始价格调整选项
    await waitFor(() => {
      const headings = screen.getAllByText('系统开关');
      expect(headings.length).toBeGreaterThan(0);
      expect(screen.getByText('初始价格调整')).toBeInTheDocument();
    });
  });

  test('should close menu when system settings is clicked', async () => {
    render(<App />);

    // 打开菜单
    const menuButton = findMenuButton();
    fireEvent.click(menuButton!);

    // 确认菜单已打开
    await screen.findByText('系统开关');

    // 点击系统开关
    fireEvent.click(screen.getByText('系统开关'));

    // 菜单应该关闭 - 导出备份按钮应该不在文档中
    await waitFor(() => {
      expect(screen.queryByText('导出备份')).not.toBeInTheDocument();
    });
  });
});