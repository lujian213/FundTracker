import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AlertTooltip } from '../../components/AlertTooltip';
import { TickerAlert } from '../../types';

describe('AlertTooltip', () => {
  const sampleAlerts: TickerAlert[] = [
    { type: 'holiday', date: '2024/01/15', content: '春节休市（中国市场）' },
    { type: 'delivery', date: '2024/01/17', content: '50ETF期权交割日' },
  ];

  test('renders bell icon', () => {
    render(<AlertTooltip alerts={sampleAlerts} />);

    expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument();
  });

  test('shows tooltip on hover with alerts sorted by date ascending', async () => {
    const laterFirst = [
      { type: 'holiday' as const, date: '2024/01/20', content: 'Later event' },
      { type: 'delivery' as const, date: '2024/01/15', content: 'Earlier event' },
    ];

    render(<AlertTooltip alerts={laterFirst} />);

    const icon = screen.getByLabelText('提示信息');
    fireEvent.mouseEnter(icon);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toBeInTheDocument();

    // 验证按日期升序排列（早的在前）
    const items = tooltip.querySelectorAll('li');
    // delivery 类型显示日期，holiday 类型不显示日期
    expect(items[0].textContent).toContain('2024/01/15'); // delivery 排在前面
    expect(items[0].textContent).toContain('Earlier event');
    expect(items[1].textContent).toContain('Later event'); // holiday 不显示日期
  });

  test('displays date and content for each alert', async () => {
    render(<AlertTooltip alerts={sampleAlerts} />);

    const icon = screen.getByLabelText('提示信息');
    fireEvent.mouseEnter(icon);

    const tooltip = await screen.findByRole('tooltip');
    // holiday 类型不显示日期，只显示 content
    expect(tooltip.textContent).toContain('春节休市（中国市场）');
    // delivery 类型显示日期和 content
    expect(tooltip.textContent).toContain('2024/01/17');
    expect(tooltip.textContent).toContain('50ETF期权交割日');
  });

  test('hides tooltip on mouse leave', async () => {
    render(<AlertTooltip alerts={sampleAlerts} />);

    const icon = screen.getByLabelText('提示信息');
    fireEvent.mouseEnter(icon);

    expect(await screen.findByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(icon);

    // Wait for tooltip to disappear
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  // 键盘导航和可访问性测试
  describe('keyboard accessibility', () => {
    test('shows tooltip on focus', async () => {
      render(<AlertTooltip alerts={sampleAlerts} />);

      const button = screen.getByLabelText('提示信息');
      fireEvent.focus(button);

      const tooltip = await screen.findByRole('tooltip');
      expect(tooltip).toBeInTheDocument();
    });

    test('hides tooltip on blur', async () => {
      render(<AlertTooltip alerts={sampleAlerts} />);

      const button = screen.getByLabelText('提示信息');
      fireEvent.focus(button);

      expect(await screen.findByRole('tooltip')).toBeInTheDocument();

      fireEvent.blur(button);

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    test('closes tooltip on Escape key press', async () => {
      render(<AlertTooltip alerts={sampleAlerts} />);

      const button = screen.getByLabelText('提示信息');
      fireEvent.focus(button);

      expect(await screen.findByRole('tooltip')).toBeInTheDocument();

      fireEvent.keyDown(button, { key: 'Escape' });

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    test('does not close tooltip on other key press', async () => {
      render(<AlertTooltip alerts={sampleAlerts} />);

      const button = screen.getByLabelText('提示信息');
      fireEvent.focus(button);

      expect(await screen.findByRole('tooltip')).toBeInTheDocument();

      fireEvent.keyDown(button, { key: 'Enter' });

      // Tooltip should still be open
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
  });

  describe('ARIA attributes', () => {
    test('button has aria-expanded attribute reflecting open state', () => {
      render(<AlertTooltip alerts={sampleAlerts} />);

      const button = screen.getByLabelText('提示信息');
      expect(button).toHaveAttribute('aria-expanded', 'false');

      fireEvent.focus(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');

      fireEvent.blur(button);
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    test('button has aria-describedby pointing to tooltip when open', async () => {
      render(<AlertTooltip alerts={sampleAlerts} />);

      const button = screen.getByLabelText('提示信息');

      // When closed, aria-describedby should not be present
      expect(button).not.toHaveAttribute('aria-describedby');

      fireEvent.focus(button);

      const tooltip = await screen.findByRole('tooltip');
      const tooltipId = tooltip.getAttribute('id');

      // When open, aria-describedby should point to tooltip id
      expect(button).toHaveAttribute('aria-describedby', tooltipId);
    });

    test('tooltip has id attribute for aria-describedby reference', async () => {
      render(<AlertTooltip alerts={sampleAlerts} />);

      const button = screen.getByLabelText('提示信息');
      fireEvent.focus(button);

      const tooltip = await screen.findByRole('tooltip');
      expect(tooltip).toHaveAttribute('id');
      expect(tooltip.id).toMatch(/^alert-tooltip-\d+$/);
    });
  });
});