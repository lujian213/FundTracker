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

describe('App - 系统配置', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();

    fetchFundDataMock.mockResolvedValue(null);
    forceFetchFundHistoryMock.mockResolvedValue([]);
    fetchMarketIndicesMock.mockResolvedValue([]);
  });

  test('应该显示系统配置按钮', async () => {
    render(<App />);

    // 检查系统配置按钮是否存在（通过 aria-label）
    const configButton = screen.getByLabelText('系统配置');
    expect(configButton).toBeInTheDocument();

    // 检查按钮图标是否为齿轮
    expect(configButton.querySelector('.fa-cog')).toBeInTheDocument();
  });

  test('点击系统配置按钮应该打开系统配置界面', async () => {
    render(<App />);

    // 点击系统配置按钮
    const configButton = screen.getByLabelText('系统配置');
    fireEvent.click(configButton);

    // 检查系统配置界面是否打开
    await waitFor(() => {
      expect(screen.getByText('系统配置')).toBeInTheDocument();
    });

    // 检查默认显示的导航项
    expect(screen.getByText('备份管理')).toBeInTheDocument();
  });

  test('系统配置界面应该包含所有导航项', async () => {
    render(<App />);

    // 打开系统配置
    const configButton = screen.getByLabelText('系统配置');
    fireEvent.click(configButton);

    await waitFor(() => {
      expect(screen.getByText('系统配置')).toBeInTheDocument();
    });

    // 检查所有导航项是否存在
    expect(screen.getByText('备份管理')).toBeInTheDocument();
    expect(screen.getByText('同步管理')).toBeInTheDocument();
    expect(screen.getByText('AI配置')).toBeInTheDocument();
    expect(screen.getByText('系统开关')).toBeInTheDocument();
  });

  test('点击系统开关导航项应该显示系统开关内容', async () => {
    render(<App />);

    // 打开系统配置
    const configButton = screen.getByLabelText('系统配置');
    fireEvent.click(configButton);

    await waitFor(() => {
      expect(screen.getByText('系统配置')).toBeInTheDocument();
    });

    // 点击系统开关导航项
    const systemSwitchNav = screen.getByText('系统开关');
    fireEvent.click(systemSwitchNav);

    // 检查是否显示系统开关内容（初始价格调整）
    await waitFor(() => {
      expect(screen.getByText('初始价格调整')).toBeInTheDocument();
    });
  });

  test('关闭系统配置界面应该返回主界面', async () => {
    render(<App />);

    // 打开系统配置
    const configButton = screen.getByLabelText('系统配置');
    fireEvent.click(configButton);

    await waitFor(() => {
      expect(screen.getByText('系统配置')).toBeInTheDocument();
    });

    // 点击关闭按钮
    const closeButton = screen.getByLabelText('关闭');
    fireEvent.click(closeButton);

    // 检查系统配置界面是否关闭
    await waitFor(() => {
      expect(screen.queryByText('系统配置')).not.toBeInTheDocument();
    });
  });
});