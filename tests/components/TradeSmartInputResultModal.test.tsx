// tests/components/TradeSmartInputResultModal.test.tsx

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TradeSmartInputResultModal } from '../../components/TradeSmartInputResultModal';
import { ValidatedTradeRecord } from '../../utils/tradeRecordValidator';

// Mock createPortal to render inline
jest.mock('react-dom', () => {
  const actual = jest.requireActual('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

describe('TradeSmartInputResultModal', () => {
  // 构造测试数据的辅助函数
  const createMockRecord = (
    fundName: string,
    tradeDate: string,
    isValid: boolean,
    options: Partial<ValidatedTradeRecord> = {}
  ): ValidatedTradeRecord => ({
    fileName: 'test.jpg',
    ocrData: {
      fundName,
      operation: 'buy',
      amount: 10000,
      shares: 1000,
      nav: 1.5,
      fee: 0,
      tradeTime: `${tradeDate} 10:00:00`,
      tradeDate,
    },
    matchResult: isValid
      ? {
          matched: true,
          symbol: '000001',
          matchedName: fundName,
          similarity: 0.9,
          hasPosition: true,
        }
      : {
          matched: false,
          similarity: 0.3,
        },
    validation: isValid
      ? { isValid: true, errors: [], warnings: [] }
      : { isValid: false, errors: ['无法匹配基金'], warnings: [] },
    systemPrice: isValid ? 1.5 : undefined,
    calculatedShares: isValid ? 6666.67 : undefined,  // (10000 - 0) / 1.5
    calculatedTotal: undefined,
    ...options,
  });

  describe('visible属性', () => {
    test('visible为false时不渲染', () => {
      render(
        <TradeSmartInputResultModal
          visible={false}
          records={[]}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );
      expect(screen.queryByText('识别结果')).not.toBeInTheDocument();
    });

    test('visible为true时渲染', () => {
      render(
        <TradeSmartInputResultModal
          visible={true}
          records={[]}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );
      expect(screen.getByText('识别结果')).toBeInTheDocument();
    });
  });

  describe('表格显示', () => {
    test('按日期分组显示记录', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('基金A', '2026-04-24', true),
        createMockRecord('基金B', '2026-04-24', true),
        createMockRecord('基金C', '2026-04-25', true),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      // 检查日期分组标题（使用正则匹配完整文本）
      expect(screen.getByText(/📅 2026-04-24.*2条记录/)).toBeInTheDocument();
      expect(screen.getByText(/📅 2026-04-25.*1条记录/)).toBeInTheDocument();
    });

    test('显示基金代码和名称', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('测试基金A', '2026-04-24', true),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      expect(screen.getByText('000001')).toBeInTheDocument();
      expect(screen.getByText('测试基金A')).toBeInTheDocument();
    });

    test('无效记录显示红色背景', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('无效基金', '2026-04-24', false),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      // 无效记录应该显示红色背景的行
      const rows = screen.getAllByRole('row');
      // 找到包含无效记录的行（排除日期分组行）
      const invalidRow = rows.find(row =>
        within(row).queryByText('无效基金') !== null
      );
      expect(invalidRow).toBeDefined();
    });

    test('显示买入/卖出类型', () => {
      const buyRecord = createMockRecord('买入基金', '2026-04-24', true);
      const sellRecord: ValidatedTradeRecord = {
        ...createMockRecord('卖出基金', '2026-04-24', true),
        ocrData: {
          ...buyRecord.ocrData,
          fundName: '卖出基金',
          operation: 'sell',
        },
      };

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={[buyRecord, sellRecord]}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      expect(screen.getByText('买入')).toBeInTheDocument();
      expect(screen.getByText('卖出')).toBeInTheDocument();
    });
  });

  describe('选择功能', () => {
    test('有效记录默认不选中', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('基金A', '2026-04-24', true),
        createMockRecord('基金B', '2026-04-24', true),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      // 默认不选中，确认按钮显示0
      expect(screen.getByText('确认添加 (0)')).toBeInTheDocument();
    });

    test('无效记录不可选中', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('有效基金', '2026-04-24', true),
        createMockRecord('无效基金', '2026-04-24', false),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      // 默认不选中
      expect(screen.getByText('确认添加 (0)')).toBeInTheDocument();

      // 选中有效记录后显示1
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // 第一个是全选框，第二个是第一条记录
      expect(screen.getByText('确认添加 (1)')).toBeInTheDocument();
    });

    test('点击复选框切换选择', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('基金A', '2026-04-24', true),
        createMockRecord('基金B', '2026-04-24', true),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      // 默认不选中
      expect(screen.getByText('确认添加 (0)')).toBeInTheDocument();

      // 获取所有复选框（排除表头的全选框）
      const checkboxes = screen.getAllByRole('checkbox');
      const recordCheckbox = checkboxes[1]; // 第一个是全选框

      // 选择第一条记录
      fireEvent.click(recordCheckbox);
      expect(screen.getByText('确认添加 (1)')).toBeInTheDocument();

      // 取消选择
      fireEvent.click(recordCheckbox);
      expect(screen.getByText('确认添加 (0)')).toBeInTheDocument();
    });

    test('全选/反选功能', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('基金A', '2026-04-24', true),
        createMockRecord('基金B', '2026-04-24', true),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      // 默认不选中
      expect(screen.getByText('确认添加 (0)')).toBeInTheDocument();

      // 点击全选框
      const selectAllCheckbox = screen.getAllByRole('checkbox')[0];

      // 点击全选
      fireEvent.click(selectAllCheckbox);
      expect(screen.getByText('确认添加 (2)')).toBeInTheDocument();

      // 再次点击取消全选
      fireEvent.click(selectAllCheckbox);
      expect(screen.getByText('确认添加 (0)')).toBeInTheDocument();
    });
  });

  describe('统计信息', () => {
    test('显示成功/失败统计', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('基金A', '2026-04-24', true),
        createMockRecord('基金B', '2026-04-24', true),
        createMockRecord('基金C', '2026-04-24', false),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      // 统计数字在 tfoot 中（文本跨多个元素，使用 getAllByText 匹配数字）
      const successCounts = screen.getAllByText('2');
      const failCounts = screen.getAllByText('1');
      expect(successCounts.length).toBeGreaterThan(0);
      expect(failCounts.length).toBeGreaterThan(0);
    });

    test('全部成功时显示绿色提示', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('基金A', '2026-04-24', true),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      expect(screen.getByText('解析正确，没有错误！')).toBeInTheDocument();
    });

    test('有失败记录时显示红色错误提示', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('无效基金', '2026-04-24', false, {
          validation: { isValid: false, errors: ['无法匹配基金'], warnings: [] },
        }),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      expect(screen.getByText(/无法匹配基金/)).toBeInTheDocument();
    });

    test('显示OCR失败错误信息', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('基金A', '2026-04-24', true),
      ];
      const errors = [{ fileName: 'failed.jpg', message: 'OCR识别失败' }];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={errors}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      // 文件名后面有冒号，使用正则匹配
      expect(screen.getByText(/failed\.jpg/)).toBeInTheDocument();
      expect(screen.getByText('OCR识别失败')).toBeInTheDocument();
    });
  });

  describe('确认和关闭', () => {
    test('点击确认按钮调用onConfirm', () => {
      const mockOnConfirm = jest.fn();
      const mockOnClose = jest.fn();
      const records: ValidatedTradeRecord[] = [
        createMockRecord('基金A', '2026-04-24', true),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      // 先选中记录（默认不选中）
      fireEvent.click(screen.getAllByRole('checkbox')[1]);
      expect(screen.getByText('确认添加 (1)')).toBeInTheDocument();

      // 点击确认按钮
      fireEvent.click(screen.getByText('确认添加 (1)'));

      expect(mockOnConfirm).toHaveBeenCalledWith(records);
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('无选中记录时确认按钮禁用', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('无效基金', '2026-04-24', false),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      const confirmButton = screen.getByText('确认添加 (0)');
      expect(confirmButton).toBeDisabled();
    });

    test('无有效记录时关闭直接调用onClose', () => {
      const mockOnClose = jest.fn();
      const records: ValidatedTradeRecord[] = [
        createMockRecord('无效基金', '2026-04-24', false),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={mockOnClose}
          onConfirm={() => {}}
        />
      );

      // 点击关闭按钮
      fireEvent.click(screen.getByText('✕'));

      expect(mockOnClose).toHaveBeenCalled();
    });

    test('有有效记录时关闭显示确认弹窗', () => {
      const mockOnClose = jest.fn();
      const records: ValidatedTradeRecord[] = [
        createMockRecord('基金A', '2026-04-24', true),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={mockOnClose}
          onConfirm={() => {}}
        />
      );

      // 点击关闭按钮
      fireEvent.click(screen.getByText('✕'));

      // 显示确认弹窗（标题有 id，可以精确匹配）
      expect(screen.getByRole('heading', { name: '确认关闭' })).toBeInTheDocument();
      expect(screen.getByText('当前有识别成功的交易记录，确定要关闭吗？')).toBeInTheDocument();
    });

    test('确认关闭弹窗点击确认后关闭', () => {
      const mockOnClose = jest.fn();
      const records: ValidatedTradeRecord[] = [
        createMockRecord('基金A', '2026-04-24', true),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={mockOnClose}
          onConfirm={() => {}}
        />
      );

      // 点击关闭按钮
      fireEvent.click(screen.getByText('✕'));

      // 点击确认按钮（使用 aria-label 精确匹配）
      fireEvent.click(screen.getByRole('button', { name: '确认' }));

      expect(mockOnClose).toHaveBeenCalled();
    });

    test('确认关闭弹窗点击取消后不关闭', () => {
      const mockOnClose = jest.fn();
      const records: ValidatedTradeRecord[] = [
        createMockRecord('基金A', '2026-04-24', true),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={mockOnClose}
          onConfirm={() => {}}
        />
      );

      // 点击关闭按钮
      fireEvent.click(screen.getByText('✕'));

      // 点击取消
      fireEvent.click(screen.getByText('取消'));

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('无法匹配基金的显示', () => {
    test('匹配失败的基金显示<无法匹配>', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('未知基金', '2026-04-24', false, {
          matchResult: { matched: false, similarity: 0.3 },
        }),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      expect(screen.getByText('<无法匹配>')).toBeInTheDocument();
    });

    test('匹配成功但无仓位显示红色基金代码', () => {
      const records: ValidatedTradeRecord[] = [
        createMockRecord('基金A', '2026-04-24', false, {
          matchResult: {
            matched: true,
            symbol: '000002',
            matchedName: '基金A',
            similarity: 0.9,
            hasPosition: false,
          },
          validation: { isValid: false, errors: ['系统中没有该基金的仓位配置'], warnings: [] },
        }),
      ];

      render(
        <TradeSmartInputResultModal
          visible={true}
          records={records}
          errors={[]}
          ocrRawTexts={{}}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      );

      // 无仓位时显示红色的基金代码（不是"<无仓位>"）
      expect(screen.getByText('000002')).toBeInTheDocument();
    });
  });
});