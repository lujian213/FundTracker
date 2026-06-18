// tests/components/CalendarEventTooltip.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CalendarEventTooltip, CalendarEventItem } from '../../components/CalendarEventTooltip';

describe('CalendarEventTooltip', () => {
  const baseEvent: CalendarEventItem = {
    date: '2026-06-19',
    content: '',
    description: '',
    type: '',
  };

  describe('事件类型分类显示', () => {
    it('应正确显示节假日事件', () => {
      const events: CalendarEventItem[] = [
        { ...baseEvent, type: 'holiday_china', content: '端午节', description: '端午节假期' },
        { ...baseEvent, type: 'holiday_hk', content: '香港假期', description: '香港公众假期' },
      ];

      render(<CalendarEventTooltip events={events} />);

      expect(screen.getByText('节假日')).toBeInTheDocument();
      expect(screen.getByText('端午节假期')).toBeInTheDocument();
      expect(screen.getByText('香港公众假期')).toBeInTheDocument();
    });

    it('应正确显示交割日事件（使用 isDeliveryType）', () => {
      const events: CalendarEventItem[] = [
        { ...baseEvent, type: 'delivery_china', content: '股指交割', market: 'A股' },
        { ...baseEvent, type: 'delivery_hk', content: '港股交割', market: '港股' },
        { ...baseEvent, type: 'delivery_us', content: '美股交割', market: '美股' },
      ];

      render(<CalendarEventTooltip events={events} />);

      expect(screen.getByText('交割日')).toBeInTheDocument();
      expect(screen.getByText('股指交割')).toBeInTheDocument();
      expect(screen.getByText('港股交割')).toBeInTheDocument();
      expect(screen.getByText('美股交割')).toBeInTheDocument();
    });

    it('应正确显示重要数据事件', () => {
      const events: CalendarEventItem[] = [
        { ...baseEvent, type: 'important_data_us_cpi', content: '美国CPI', description: '美国消费者价格指数' },
        { ...baseEvent, type: 'important_data_us_nonfarm', content: '非农数据', description: '美国非农就业数据' },
      ];

      render(<CalendarEventTooltip events={events} />);

      expect(screen.getByText('重要数据')).toBeInTheDocument();
      expect(screen.getByText('美国消费者价格指数')).toBeInTheDocument();
      expect(screen.getByText('美国非农就业数据')).toBeInTheDocument();
    });

    it('应同时显示多种类型的事件', () => {
      const events: CalendarEventItem[] = [
        { ...baseEvent, type: 'holiday_china', content: '端午节', description: '端午节假期' },
        { ...baseEvent, type: 'delivery_china', content: '股指交割', market: 'A股' },
        { ...baseEvent, type: 'important_data_us_cpi', content: '美国CPI', description: '美国CPI数据' },
      ];

      render(<CalendarEventTooltip events={events} />);

      // 三种类型都应该显示
      expect(screen.getByText('节假日')).toBeInTheDocument();
      expect(screen.getByText('交割日')).toBeInTheDocument();
      expect(screen.getByText('重要数据')).toBeInTheDocument();

      // 各类型的事件内容
      expect(screen.getByText('端午节假期')).toBeInTheDocument();
      expect(screen.getByText('股指交割')).toBeInTheDocument();
      expect(screen.getByText('美国CPI数据')).toBeInTheDocument();
    });
  });

  describe('空事件处理', () => {
    it('无事件时应返回 null', () => {
      const { container } = render(<CalendarEventTooltip events={[]} />);
      expect(container.firstChild).toBeNull();
    });
  });
});