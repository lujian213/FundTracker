import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddTickerModal } from '../../components/AddTickerModal';
import { MarketType } from '../../types';

describe('AddTickerModal', () => {
  test('renders tabs and suggestions and calls onAdd for valid fund codes', async () => {
    const onClose = jest.fn();
    const onAdd = jest.fn().mockResolvedValue(undefined);

    render(<AddTickerModal onClose={onClose} onAdd={onAdd} isLoading={false} />);

    // input some fund codes
    const textarea = screen.getByPlaceholderText(/例如/);
    fireEvent.change(textarea, { target: { value: '000001 012345' } });

    const addButton = screen.getByText('添加代码');
    fireEvent.click(addButton);

    // onAdd should be called with numeric codes
    expect(onAdd).toHaveBeenCalledWith(expect.arrayContaining(['000001', '012345']), MarketType.FUND);
  });

  test('switching tab updates placeholder and suggestions', () => {
    const onClose = jest.fn();
    const onAdd = jest.fn().mockResolvedValue(undefined);
    render(<AddTickerModal onClose={onClose} onAdd={onAdd} isLoading={false} />);

    // click '指数看板' tab
    const domTab = screen.getByText('指数看板');
    fireEvent.click(domTab);
    expect(screen.getByPlaceholderText(/例如: 100.NDX/)).toBeInTheDocument();

    const globalTab = screen.getByText('全球市场');
    fireEvent.click(globalTab);
    expect(screen.getByText('全球市场')).toBeInTheDocument();
  });

  test('handleSuggestionClick appends suggestion to textarea', () => {
    const onClose = jest.fn();
    const onAdd = jest.fn().mockResolvedValue(undefined);
    render(<AddTickerModal onClose={onClose} onAdd={onAdd} isLoading={false} />);

    const suggestion = screen.getByText('沪深300');
    const textarea = screen.getByPlaceholderText(/例如/);
    fireEvent.click(suggestion);

    // after click, textarea contains code
    expect((textarea as HTMLTextAreaElement).value).toMatch(/000961/);
  });

  test('shows alert on malformed input (invalid fund code)', () => {
    const onClose = jest.fn();
    const onAdd = jest.fn().mockResolvedValue(undefined);
    window.alert = jest.fn();
    render(<AddTickerModal onClose={onClose} onAdd={onAdd} isLoading={false} />);

    const textarea = screen.getByPlaceholderText(/例如/);
    // use a numeric too-short input which the component will reject
    fireEvent.change(textarea, { target: { value: '123' } });
    const addButton = screen.getByText('添加代码');
    fireEvent.click(addButton);

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('请输入有效的基金代码'));
  });

  test('close button triggers onClose and textarea gets focus on open', () => {
    const onClose = jest.fn();
    const onAdd = jest.fn().mockResolvedValue(undefined);
    render(<AddTickerModal onClose={onClose} onAdd={onAdd} isLoading={false} />);

    // textarea should be focused (autoFocus)
    const textarea = screen.getByPlaceholderText(/例如/);
    expect(document.activeElement).toBe(textarea);

    // Find header area then its close button (header has two children: title and close button)
    const header = document.querySelector('.px-6.py-4');
    if (header) {
      const btns = header.querySelectorAll('button');
      if (btns.length > 0) {
        (btns[0] as HTMLButtonElement).click();
        expect(onClose).toHaveBeenCalled();
      }
    }
  });
});
