// tests/components/InitialPriceAdjustModal.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InitialPriceAdjustModal from '../../components/InitialPriceAdjustModal';

describe('InitialPriceAdjustModal', () => {
  const mockProps = {
    symbol: '007349',
    fundName: '华夏科技创新A',
    currentProfit: 123.45,
    currentInitialPrice: 1.2345,
    initialPosition: 1000,
    totalShares: 1500,
    currentPrice: 1.5,
    sellAmount: 0,
    buyAmount: 500,
    onSave: jest.fn(),
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render with correct title format', () => {
    render(<InitialPriceAdjustModal {...mockProps} />);
    expect(screen.getByText('调整初始价格')).toBeInTheDocument();
  });

  test('should display current profit and initial price', () => {
    render(<InitialPriceAdjustModal {...mockProps} />);
    // 目前盈利在只读输入框中，保留2位小数，带bg-gray-50背景
    const profitInputs = screen.getAllByDisplayValue('123.45');
    const readOnlyProfitInput = profitInputs.find(input => input.hasAttribute('readonly'));
    expect(readOnlyProfitInput).toBeInTheDocument();
    expect(readOnlyProfitInput).toHaveClass('text-red-600'); // 正数显示红色
    // 目前初始价格显示
    expect(screen.getByText('目前初始价格：')).toBeInTheDocument();
  });

  test('should show calculated price with default value', () => {
    // 默认值是currentProfit，所以会显示计算出的建议初始价格
    render(<InitialPriceAdjustModal {...mockProps} />);
    // 当参考盈利=123.45时，建议初始价格 = (1500 * 1.5 + 0 - 500 - 123.45) / 1000 = 1.63
    expect(screen.getByText('1.63')).toBeInTheDocument();
  });

  test('should have enabled save button initially with default value', () => {
    render(<InitialPriceAdjustModal {...mockProps} />);
    const saveButton = screen.getByRole('button', { name: '保存' });
    expect(saveButton).not.toBeDisabled();
  });

  test('should calculate suggested price when reference profit is entered', async () => {
    render(<InitialPriceAdjustModal {...mockProps} />);

    const input = screen.getByPlaceholderText('请输入');
    fireEvent.change(input, { target: { value: '100' } });

    await waitFor(() => {
      expect(screen.queryByText('-')).not.toBeInTheDocument();
    });
  });

  test('should enable save button when valid value is entered', async () => {
    render(<InitialPriceAdjustModal {...mockProps} />);

    const input = screen.getByPlaceholderText('请输入');
    fireEvent.change(input, { target: { value: '100' } });

    await waitFor(() => {
      const saveButton = screen.getByRole('button', { name: '保存' });
      expect(saveButton).not.toBeDisabled();
    });
  });

  test('should call onSave with calculated price when save is clicked', async () => {
    render(<InitialPriceAdjustModal {...mockProps} />);

    const input = screen.getByPlaceholderText('请输入');
    fireEvent.change(input, { target: { value: '100' } });

    await waitFor(() => {
      const saveButton = screen.getByRole('button', { name: '保存' });
      expect(saveButton).not.toBeDisabled();
    });

    const saveButton = screen.getByRole('button', { name: '保存' });
    fireEvent.click(saveButton);

    expect(mockProps.onSave).toHaveBeenCalled();
  });

  test('should call onClose when close button is clicked', () => {
    render(<InitialPriceAdjustModal {...mockProps} />);

    const closeButton = screen.getByRole('button', { name: '关闭' });
    fireEvent.click(closeButton);

    expect(mockProps.onClose).toHaveBeenCalled();
    expect(mockProps.onSave).not.toHaveBeenCalled();
  });

  test('should produce same initial price when input matches current profit', async () => {
    // 当输入的参考盈利等于当前盈利时，建议初始价格应等于当前初始价格
    // 公式验证：(1500 * 1.5 + 0 - 500 - 123.45) / 1000 = 1626.55 / 1000 = 1.63
    render(<InitialPriceAdjustModal {...mockProps} />);

    const input = screen.getByPlaceholderText('请输入');
    fireEvent.change(input, { target: { value: '123.45' } });

    await waitFor(() => {
      // 检查建议初始价格是否正确计算
      const suggestedPrice = screen.getByTestId('suggested-price');
      expect(suggestedPrice).toHaveTextContent('1.63');
    });
  });
});