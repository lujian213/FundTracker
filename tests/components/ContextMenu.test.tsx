import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ContextMenu from '../../components/ContextMenu';

describe('ContextMenu', () => {
  const mockItems = [
    { label: '菜单项1', onClick: jest.fn() },
    { label: '菜单项2', onClick: jest.fn(), disabled: true },
  ];

  const defaultProps = {
    isOpen: true,
    position: { x: 100, y: 100 },
    onClose: jest.fn(),
    items: mockItems,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render menu items when open', () => {
    render(<ContextMenu {...defaultProps} />);
    expect(screen.getByText('菜单项1')).toBeInTheDocument();
    expect(screen.getByText('菜单项2')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(<ContextMenu {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('菜单项1')).not.toBeInTheDocument();
  });

  it('should call onClick when menu item is clicked', () => {
    render(<ContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByText('菜单项1'));
    expect(mockItems[0].onClick).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should not call onClick when disabled item is clicked', () => {
    render(<ContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByText('菜单项2'));
    expect(mockItems[1].onClick).not.toHaveBeenCalled();
  });

  it('should close menu when clicking outside', async () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <ContextMenu {...defaultProps} />
      </div>
    );

    // Wait for setTimeout to complete and event listener to be attached
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});