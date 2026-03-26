import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SystemSettingsModal from '../../components/SystemSettingsModal';
import * as systemSettingsService from '../../services/systemSettingsService';

jest.mock('../../services/systemSettingsService');

const mockGetSystemSettings = systemSettingsService.getSystemSettings as jest.MockedFunction<typeof systemSettingsService.getSystemSettings>;
const mockSetFeatureEnabled = systemSettingsService.setFeatureEnabled as jest.MockedFunction<typeof systemSettingsService.setFeatureEnabled>;

describe('SystemSettingsModal', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSystemSettings.mockReturnValue({ initialPriceAdjustmentEnabled: false });
  });

  test('should render with title', () => {
    render(<SystemSettingsModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('系统开关')).toBeInTheDocument();
  });

  test('should show initial price adjustment toggle label', () => {
    render(<SystemSettingsModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('初始价格调整')).toBeInTheDocument();
  });

  test('should show disabled state by default', () => {
    mockGetSystemSettings.mockReturnValue({ initialPriceAdjustmentEnabled: false });
    render(<SystemSettingsModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('关闭')).toBeInTheDocument();
  });

  test('should show enabled state when feature is on', () => {
    mockGetSystemSettings.mockReturnValue({ initialPriceAdjustmentEnabled: true });
    render(<SystemSettingsModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('开启')).toBeInTheDocument();
  });

  test('should toggle feature when clicked', () => {
    mockGetSystemSettings.mockReturnValue({ initialPriceAdjustmentEnabled: false });
    render(<SystemSettingsModal isOpen={true} onClose={mockOnClose} />);

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(mockSetFeatureEnabled).toHaveBeenCalledWith('initialPriceAdjustmentEnabled', true);
  });

  test('should close when close button clicked', () => {
    render(<SystemSettingsModal isOpen={true} onClose={mockOnClose} />);

    const closeButton = screen.getByRole('button', { name: /关闭/i });
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  test('should not render when isOpen is false', () => {
    render(<SystemSettingsModal isOpen={false} onClose={mockOnClose} />);
    expect(screen.queryByText('系统开关')).not.toBeInTheDocument();
  });
});