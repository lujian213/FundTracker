import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FeeInput } from '../../components/FeeInput';
import * as useTrades from '../../hooks/useTrades';
import * as feeCalculator from '../../utils/feeCalculator';

// Mock 依赖
jest.mock('../../hooks/useTrades');
jest.mock('../../utils/feeCalculator');

describe('FeeInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('渲染输入框和计算器按钮', () => {
    render(
      <FeeInput
        symbol="000001"
        type="buy"
        currentDate="2026-06-15"
        price={1.0}
        total={1000}
        value={10}
        onChange={() => {}}
      />
    );

    // 检查输入框
    const input = screen.getByRole('spinbutton');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue(10);

    // 检查计算器按钮
    const button = screen.getByRole('button', { name: '自动计算手续费' });
    expect(button).toBeInTheDocument();
  });

  test('点击计算器按钮触发onChange', async () => {
    const mockGetTradesForSymbol = useTrades.getTradesForSymbol as jest.Mock;
    const mockCalculateFee = feeCalculator.calculateFee as jest.Mock;

    mockGetTradesForSymbol.mockReturnValue([
      { id: '1', date: '2024-01-01', type: 'buy', shares: 1000, price: 1.0, fee: 10 },
    ]);
    mockCalculateFee.mockReturnValue(12.5);

    const handleChange = jest.fn();
    render(
      <FeeInput
        symbol="000001"
        type="buy"
        currentDate="2026-06-15"
        price={1.0}
        total={1000}
        value={10}
        onChange={handleChange}
      />
    );

    // 点击计算器按钮
    const button = screen.getByRole('button', { name: '自动计算手续费' });
    fireEvent.click(button);

    // 验证调用
    expect(mockGetTradesForSymbol).toHaveBeenCalledWith('000001');
    expect(mockCalculateFee).toHaveBeenCalledWith({
      historicalTrades: expect.any(Array),
      type: 'buy',
      currentDate: '2026-06-15',
      price: 1.0,
      total: 1000,
      shares: undefined,
    });
    expect(handleChange).toHaveBeenCalledWith(12.5);

    // 验证提示信息
    await waitFor(() => {
      expect(screen.getByText(/已根据历史记录计算/)).toBeInTheDocument();
    });
  });

  test('按钮禁用状态 - disabled=true', () => {
    render(
      <FeeInput
        symbol="000001"
        type="buy"
        currentDate="2026-06-15"
        price={1.0}
        total={1000}
        value={10}
        onChange={() => {}}
        disabled={true}
      />
    );

    const button = screen.getByRole('button', { name: '自动计算手续费' });
    expect(button).toBeDisabled();
  });

  test('按钮禁用状态 - 缺少total', () => {
    render(
      <FeeInput
        symbol="000001"
        type="buy"
        currentDate="2026-06-15"
        price={1.0}
        value={10}
        onChange={() => {}}
      />
    );

    const button = screen.getByRole('button', { name: '自动计算手续费' });
    expect(button).toBeDisabled();
  });

  test('按钮禁用状态 - 缺少shares（卖出场景）', () => {
    render(
      <FeeInput
        symbol="000001"
        type="sell"
        currentDate="2026-06-15"
        price={1.0}
        value={10}
        onChange={() => {}}
      />
    );

    const button = screen.getByRole('button', { name: '自动计算手续费' });
    expect(button).toBeDisabled();
  });

  test('紧凑模式', () => {
    render(
      <FeeInput
        symbol="000001"
        type="buy"
        currentDate="2026-06-15"
        price={1.0}
        total={1000}
        value={10}
        onChange={() => {}}
        compact={true}
      />
    );

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveClass('text-xs');
  });

  test('用户输入手续费触发onChange', () => {
    const handleChange = jest.fn();
    render(
      <FeeInput
        symbol="000001"
        type="buy"
        currentDate="2026-06-15"
        price={1.0}
        total={1000}
        value={10}
        onChange={handleChange}
      />
    );

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '15.5' } });

    expect(handleChange).toHaveBeenCalledWith(15.5);
  });

  test('无历史记录时显示提示', async () => {
    const mockGetTradesForSymbol = useTrades.getTradesForSymbol as jest.Mock;
    const mockCalculateFee = feeCalculator.calculateFee as jest.Mock;

    mockGetTradesForSymbol.mockReturnValue([]);
    mockCalculateFee.mockReturnValue(0);

    const handleChange = jest.fn();
    render(
      <FeeInput
        symbol="000001"
        type="buy"
        currentDate="2026-06-15"
        price={1.0}
        total={1000}
        value={10}
        onChange={handleChange}
      />
    );

    const button = screen.getByRole('button', { name: '自动计算手续费' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/无历史手续费记录/)).toBeInTheDocument();
    });
  });

  test('提示信息3秒后消失', async () => {
    jest.useFakeTimers();

    const mockGetTradesForSymbol = useTrades.getTradesForSymbol as jest.Mock;
    const mockCalculateFee = feeCalculator.calculateFee as jest.Mock;

    mockGetTradesForSymbol.mockReturnValue([]);
    mockCalculateFee.mockReturnValue(0);

    const handleChange = jest.fn();
    render(
      <FeeInput
        symbol="000001"
        type="buy"
        currentDate="2026-06-15"
        price={1.0}
        total={1000}
        value={10}
        onChange={handleChange}
      />
    );

    const button = screen.getByRole('button', { name: '自动计算手续费' });
    fireEvent.click(button);

    // 提示应该出现
    await waitFor(() => {
      expect(screen.getByText(/无历史手续费记录/)).toBeInTheDocument();
    });

    // 快进3秒
    jest.advanceTimersByTime(3000);

    // 提示应该消失
    await waitFor(() => {
      expect(screen.queryByText(/无历史手续费记录/)).not.toBeInTheDocument();
    });

    jest.useRealTimers();
  });

  test('提示信息显示正确的计算结果格式', async () => {
    const mockGetTradesForSymbol = useTrades.getTradesForSymbol as jest.Mock;
    const mockCalculateFee = feeCalculator.calculateFee as jest.Mock;

    mockGetTradesForSymbol.mockReturnValue([
      { id: '1', date: '2024-01-01', type: 'buy', shares: 1000, price: 1.0, fee: 10 },
    ]);
    mockCalculateFee.mockReturnValue(15.678);

    const handleChange = jest.fn();
    render(
      <FeeInput
        symbol="000001"
        type="buy"
        currentDate="2026-06-15"
        price={1.0}
        total={1000}
        value={10}
        onChange={handleChange}
      />
    );

    const button = screen.getByRole('button', { name: '自动计算手续费' });
    fireEvent.click(button);

    // 验证提示信息格式正确（保留2位小数）
    await waitFor(() => {
      expect(screen.getByText(/已根据历史记录计算: 15\.68元/)).toBeInTheDocument();
    });
  });

  test('卖出场景传递正确的参数', async () => {
    const mockGetTradesForSymbol = useTrades.getTradesForSymbol as jest.Mock;
    const mockCalculateFee = feeCalculator.calculateFee as jest.Mock;

    mockGetTradesForSymbol.mockReturnValue([
      { id: '1', date: '2024-01-01', type: 'sell', shares: 100, price: 1.0, fee: 5 },
    ]);
    mockCalculateFee.mockReturnValue(2.5);

    const handleChange = jest.fn();
    render(
      <FeeInput
        symbol="000001"
        type="sell"
        currentDate="2026-06-15"
        price={1.5}
        shares={200}
        value={10}
        onChange={handleChange}
      />
    );

    const button = screen.getByRole('button', { name: '自动计算手续费' });
    fireEvent.click(button);

    // 验证调用参数正确
    expect(mockCalculateFee).toHaveBeenCalledWith({
      historicalTrades: expect.any(Array),
      type: 'sell',
      currentDate: '2026-06-15',
      price: 1.5,
      total: undefined,
      shares: 200,
    });
    expect(handleChange).toHaveBeenCalledWith(2.5);
  });
});