import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../../components/ConfirmDialog';

describe('ConfirmDialog', () => {
  test('does not render when isOpen is false', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<ConfirmDialog isOpen={false} title="t" message="m" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.queryByText('t')).toBeNull();
  });

  test('renders and calls callbacks', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<ConfirmDialog isOpen title="Confirm" message="Are you sure?" onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();

    const cancelBtn = screen.getByText('取消');
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();

    const confirmBtn = screen.getByText('确认删除');
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });

  test('keyboard Escape triggers onCancel and Enter triggers onConfirm', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<ConfirmDialog isOpen title="Confirm" message="Are you sure?" onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.keyDown(document.querySelector('[role="dialog"]') as Element, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();

    fireEvent.keyDown(document.querySelector('[role="dialog"]') as Element, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('ConfirmDialog singleButton mode', () => {
  test('renders only confirm button when singleButton is true', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialog
        isOpen
        title="提示"
        message="操作完成"
        onConfirm={onConfirm}
        onCancel={onCancel}
        singleButton
        confirmText="确定"
      />
    );

    expect(screen.getByText('提示')).toBeInTheDocument();
    expect(screen.getByText('操作完成')).toBeInTheDocument();
    expect(screen.getByText('确定')).toBeInTheDocument();
    expect(screen.queryByText('取消')).not.toBeInTheDocument();
  });

  test('singleButton mode clicks confirm triggers onConfirm', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialog
        isOpen
        title="提示"
        message="操作完成"
        onConfirm={onConfirm}
        onCancel={onCancel}
        singleButton
        confirmText="确定"
      />
    );

    fireEvent.click(screen.getByText('确定'));
    expect(onConfirm).toHaveBeenCalled();
  });

  test('singleButton mode keyboard Enter triggers onConfirm', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialog
        isOpen
        title="提示"
        message="操作完成"
        onConfirm={onConfirm}
        onCancel={onCancel}
        singleButton
        confirmText="确定"
      />
    );

    fireEvent.keyDown(document.querySelector('[role="dialog"]') as Element, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalled();
  });
});
