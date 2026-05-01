// tests/components/TradeSmartInputProgressModal.test.tsx

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TradeSmartInputProgressModal } from '../../components/TradeSmartInputProgressModal';
import { TradeSmartInputState } from '../../hooks/useTradeSmartInput';

describe('TradeSmartInputProgressModal', () => {
  const defaultState: TradeSmartInputState = {
    isProcessing: false,
    progress: 0,
    processed: 0,
    total: 0,
    successCount: 0,
    failCount: 0,
    currentFile: '',
    currentOcrText: '',
    ocrRawTexts: {},
    records: [],
    errors: [],
  };

  describe('visible属性', () => {
    test('visible为false时不渲染', () => {
      render(<TradeSmartInputProgressModal visible={false} state={defaultState} />);
      expect(screen.queryByText('交易智能录入处理进度')).not.toBeInTheDocument();
    });

    test('visible为true时渲染', () => {
      render(<TradeSmartInputProgressModal visible={true} state={defaultState} />);
      expect(screen.getByText('交易智能录入处理进度')).toBeInTheDocument();
    });
  });

  describe('进度显示', () => {
    test('显示进度百分比', () => {
      const state: TradeSmartInputState = {
        ...defaultState,
        progress: 50,
        total: 10,
        processed: 5,
      };
      render(<TradeSmartInputProgressModal visible={true} state={state} />);
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    test('显示统计信息', () => {
      const state: TradeSmartInputState = {
        ...defaultState,
        total: 10,
        processed: 5,
        successCount: 4,
        failCount: 1,
      };
      render(<TradeSmartInputProgressModal visible={true} state={state} />);

      expect(screen.getByText('10')).toBeInTheDocument(); // 总图片数
      expect(screen.getByText('5')).toBeInTheDocument(); // 已处理
      expect(screen.getByText('4')).toBeInTheDocument(); // 成功
      expect(screen.getByText('1')).toBeInTheDocument(); // 失败
    });
  });

  describe('当前处理文件', () => {
    test('处理中时显示当前文件名', () => {
      const state: TradeSmartInputState = {
        ...defaultState,
        isProcessing: true,
        currentFile: 'trade1.jpg',
      };
      render(<TradeSmartInputProgressModal visible={true} state={state} />);
      expect(screen.getByText('trade1.jpg')).toBeInTheDocument();
    });

    test('不处理时不显示当前文件名', () => {
      const state: TradeSmartInputState = {
        ...defaultState,
        isProcessing: false,
        currentFile: '',
      };
      render(<TradeSmartInputProgressModal visible={true} state={state} />);
      expect(screen.queryByText('正在处理：')).not.toBeInTheDocument();
    });
  });

  describe('错误信息显示', () => {
    test('有错误时显示错误列表', () => {
      const state: TradeSmartInputState = {
        ...defaultState,
        errors: [
          { fileName: 'trade1.jpg', message: '无法识别基金名称' },
          { fileName: 'trade2.jpg', message: '无法识别交易时间' },
        ],
      };
      render(<TradeSmartInputProgressModal visible={true} state={state} />);

      expect(screen.getByText('处理失败')).toBeInTheDocument();
      expect(screen.getByText(/trade1.jpg/)).toBeInTheDocument();
      expect(screen.getByText('无法识别基金名称')).toBeInTheDocument();
    });

    test('无错误时不显示错误区域', () => {
      const state: TradeSmartInputState = {
        ...defaultState,
        errors: [],
      };
      render(<TradeSmartInputProgressModal visible={true} state={state} />);
      expect(screen.queryByText('处理失败')).not.toBeInTheDocument();
    });
  });
});