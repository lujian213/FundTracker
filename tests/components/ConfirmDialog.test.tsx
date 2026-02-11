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
