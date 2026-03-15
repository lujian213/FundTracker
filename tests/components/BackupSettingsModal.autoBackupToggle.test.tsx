/**
 * tests/components/BackupSettingsModal.autoBackupToggle.test.tsx
 *
 * 专门测试 BackupSettingsModal 组件中新增的 auto backup toggle 功能
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import BackupSettingsModal from '../../components/BackupSettingsModal';

// Mock the backupService
jest.mock('../../utils/backupService', () => ({
  writeBackupConfig: jest.fn(),
  readBackupConfig: jest.fn(() => ({ autoExportTime: '16:00', autoBackupEnabled: true })),
}));

const { writeBackupConfig } = require('../../utils/backupService');

describe('BackupSettingsModal - Auto Backup Toggle Feature', () => {
  const defaultProps = {
    autoExportTime: '16:00',
    autoBackupEnabled: true,
    onSave: jest.fn(),
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Auto Backup Toggle UI Elements', () => {
    it('renders the auto backup toggle switch', () => {
      render(<BackupSettingsModal {...defaultProps} />);

      expect(screen.getByText('启用自动备份')).toBeInTheDocument();
      const toggle = screen.getByRole('checkbox');
      expect(toggle).toBeInTheDocument();
      expect(toggle).toBeChecked();
    });

    it('toggle is unchecked when autoBackupEnabled is false', () => {
      render(<BackupSettingsModal {...defaultProps} autoBackupEnabled={false} />);

      const toggle = screen.getByRole('checkbox');
      expect(toggle).toBeInTheDocument();
      expect(toggle).not.toBeChecked();
    });
  });

  describe('Time Input Conditional Behavior', () => {
    it('time input is enabled when auto backup is enabled', () => {
      render(<BackupSettingsModal {...defaultProps} autoBackupEnabled={true} />);

      const timeInput = screen.getByLabelText('每日自动导出时间');
      expect(timeInput).not.toBeDisabled();
    });

    it('time input is disabled when auto backup is disabled', () => {
      render(<BackupSettingsModal {...defaultProps} autoBackupEnabled={false} />);

      const timeInput = screen.getByLabelText('每日自动导出时间');
      expect(timeInput).toBeDisabled();
    });

    it('time input changes when auto backup is toggled via UI', () => {
      render(<BackupSettingsModal {...defaultProps} autoBackupEnabled={false} />);

      let timeInput = screen.getByLabelText('每日自动导出时间');
      expect(timeInput).toBeDisabled();

      // Find and click the toggle switch to enable auto backup
      const toggle = screen.getByRole('checkbox');
      fireEvent.click(toggle);

      // The input should now be enabled
      timeInput = screen.getByLabelText('每日自动导出时间');
      expect(timeInput).not.toBeDisabled();
    });
  });

  describe('Status Text Display', () => {
    it('shows countdown text when auto backup is enabled', () => {
      render(<BackupSettingsModal {...defaultProps} autoBackupEnabled={true} />);

      expect(screen.getByText('距下次自动备份还有')).toBeInTheDocument();
      expect(screen.queryByText('已关闭')).not.toBeInTheDocument();
    });

    it('shows "已关闭" text when auto backup is disabled', () => {
      render(<BackupSettingsModal {...defaultProps} autoBackupEnabled={false} />);

      expect(screen.getByText('已关闭')).toBeInTheDocument();
      expect(screen.queryByText('距下次自动备份还有')).not.toBeInTheDocument();
    });
  });

  describe('Save Functionality with Toggle', () => {
    it('saves both time and toggle state when saving', () => {
      const onSave = jest.fn();
      render(<BackupSettingsModal
        {...defaultProps}
        autoBackupEnabled={true}
        onSave={onSave}
      />);

      fireEvent.click(screen.getByText('保存'));

      expect(onSave).toHaveBeenCalledWith('16:00', true);
      expect(writeBackupConfig).toHaveBeenCalledWith({
        autoExportTime: '16:00',
        autoBackupEnabled: true
      });
    });

    it('saves with toggle disabled', () => {
      const onSave = jest.fn();
      render(<BackupSettingsModal
        {...defaultProps}
        autoBackupEnabled={false}
        onSave={onSave}
      />);

      fireEvent.click(screen.getByText('保存'));

      expect(onSave).toHaveBeenCalledWith('16:00', false);
      expect(writeBackupConfig).toHaveBeenCalledWith({
        autoExportTime: '16:00',
        autoBackupEnabled: false
      });
    });
  });

  describe('Validation Behavior with Toggle', () => {
    it('still validates time format when auto backup is enabled', () => {
      const onSave = jest.fn();
      render(<BackupSettingsModal
        {...{
          ...defaultProps,
          autoExportTime: "invalid_time",
          autoBackupEnabled: true
        }}
        onSave={onSave}
      />);

      fireEvent.click(screen.getByText('保存'));

      expect(screen.getByText('请输入有效的时间（HH:mm）')).toBeInTheDocument();
    });
  });
});