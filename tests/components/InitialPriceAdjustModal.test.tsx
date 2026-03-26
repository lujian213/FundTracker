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

  test('should display all three fields in first row', () => {
    render(<InitialPriceAdjustModal {...mockProps} />);
    // 第一排三项
    expect(screen.getByText('目前盈利：')).toBeInTheDocument();
    expect(screen.getByText('当前价格：')).toBeInTheDocument();
    expect(screen.getByText('目前初始价格：')).toBeInTheDocument();
    // 当前价格显示4位小数（只读输入框有readonly属性）
    const inputs = screen.getAllByDisplayValue('1.5000');
    const readOnlyInput = inputs.find(input => input.hasAttribute('readonly'));
    expect(readOnlyInput).toBeInTheDocument();
  });

  test('should display current profit with correct color', () => {
    render(<InitialPriceAdjustModal {...mockProps} />);
    // 目前盈利在只读输入框中，正数显示红色
    const profitInputs = screen.getAllByDisplayValue('123.45');
    const readOnlyProfitInput = profitInputs.find(input => input.hasAttribute('readonly'));
    expect(readOnlyProfitInput).toBeInTheDocument();
    expect(readOnlyProfitInput).toHaveClass('text-red-600');
  });

  test('should display all three fields in second row', () => {
    render(<InitialPriceAdjustModal {...mockProps} />);
    // 第二排三项
    expect(screen.getByText('参考盈利：')).toBeInTheDocument();
    expect(screen.getByText('参考价格：')).toBeInTheDocument();
    expect(screen.getByText('建议初始价格：')).toBeInTheDocument();
    // 参考价格默认值为当前价格（可编辑输入框没有readonly属性）
    const inputs = screen.getAllByDisplayValue('1.5000');
    const editableInput = inputs.find(input => !input.hasAttribute('readonly'));
    expect(editableInput).toBeInTheDocument();
  });

  test('should show calculated price with default values', () => {
    // 默认值：参考盈利=123.45，参考价格=1.5
    // suggestedPrice = (1500 * 1.5 + 0 - 500 - 123.45) / 1000 = 1.6266
    render(<InitialPriceAdjustModal {...mockProps} />);
    expect(screen.getByText('1.6266')).toBeInTheDocument();
  });

  test('should have enabled save button initially with default values', () => {
    render(<InitialPriceAdjustModal {...mockProps} />);
    const saveButton = screen.getByRole('button', { name: '保存' });
    expect(saveButton).not.toBeDisabled();
  });

  test('should calculate suggested price when reference price is changed', async () => {
    render(<InitialPriceAdjustModal {...mockProps} />);

    // 获取参考价格输入框（第二个输入框）
    const inputs = screen.getAllByPlaceholderText('请输入');
    const referencePriceInput = inputs[1];
    fireEvent.change(referencePriceInput, { target: { value: '1.4000' } });

    // 重新计算：(1500 * 1.4 + 0 - 500 - 123.45) / 1000 = 1476.55 / 1000 = 1.4766
    await waitFor(() => {
      expect(screen.getByText('1.4766')).toBeInTheDocument();
    });
  });

  test('should call onSave with calculated price when save is clicked', () => {
    render(<InitialPriceAdjustModal {...mockProps} />);

    const saveButton = screen.getByRole('button', { name: '保存' });
    fireEvent.click(saveButton);

    // 默认计算值：(1500 * 1.5 + 0 - 500 - 123.45) / 1000 = 1.62655
    expect(mockProps.onSave).toHaveBeenCalled();
    const savedValue = mockProps.onSave.mock.calls[0][0];
    expect(savedValue).toBeCloseTo(1.62655, 4);
  });

  test('should call onClose when close button is clicked', () => {
    render(<InitialPriceAdjustModal {...mockProps} />);

    const closeButton = screen.getByRole('button', { name: '关闭' });
    fireEvent.click(closeButton);

    expect(mockProps.onClose).toHaveBeenCalled();
    expect(mockProps.onSave).not.toHaveBeenCalled();
  });

  test('should display negative profit in green color', () => {
    render(<InitialPriceAdjustModal {...mockProps} currentProfit={-100} />);
    const profitInputs = screen.getAllByDisplayValue('-100.00');
    const readOnlyProfitInput = profitInputs.find(input => input.hasAttribute('readonly'));
    expect(readOnlyProfitInput).toHaveClass('text-green-600');
  });
});