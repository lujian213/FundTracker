/**
 * tests/components/SystemResourcePanel.test.tsx
 *
 * SystemResourcePanel 组件的单元测试
 */

import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SystemResourcePanel from '../../components/config/SystemResourcePanel';

describe('SystemResourcePanel', () => {
  beforeEach(() => {
    // 清除所有 mock
    jest.clearAllMocks();
  });

  describe('内存监控功能', () => {
    it('应该显示内存监控区块标题', async () => {
      render(<SystemResourcePanel />);

      await waitFor(() => {
        expect(screen.getByText('JavaScript 内存使用情况')).toBeInTheDocument();
      });
    });

    it('应该显示内存相关提示信息', async () => {
      render(<SystemResourcePanel />);

      await waitFor(() => {
        // 检查提示信息存在
        expect(screen.getByText(/数据每 5 秒自动更新/)).toBeInTheDocument();
        expect(screen.getByText(/仅 Chrome 浏览器支持内存 API/)).toBeInTheDocument();
      });
    });

    it('应该显示 DOM 统计数据', async () => {
      render(<SystemResourcePanel />);

      await waitFor(() => {
        // DOM 统计区块
        const domStatisticsElements = screen.getAllByText('DOM 统计');
        expect(domStatisticsElements.length).toBeGreaterThan(0);

        // 检查节点数量和树深度显示
        expect(screen.getByText('节点数量:')).toBeInTheDocument();
        expect(screen.getByText('树深度:')).toBeInTheDocument();
      });
    });

    it('应该在非 Chrome 浏览器中显示兼容性提示', async () => {
      // 由于 jsdom 环境本身不支持 performance.memory，所以应该显示兼容性提示
      render(<SystemResourcePanel />);

      await waitFor(() => {
        expect(screen.getByText('当前浏览器不支持内存 API')).toBeInTheDocument();
        expect(screen.getByText('建议使用 Chrome 浏览器查看完整数据')).toBeInTheDocument();
      });
    });

    it('应该显示内存数据区块结构', async () => {
      render(<SystemResourcePanel />);

      await waitFor(() => {
        // 检查内存监控区块存在
        expect(screen.getByText('JavaScript 内存使用情况')).toBeInTheDocument();

        // 检查 DOM 统计区块存在（使用 getAllByText 处理多个匹配）
        const domStatisticsElements = screen.getAllByText('DOM 统计');
        expect(domStatisticsElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('localStorage 使用情况', () => {
    it('应该显示 localStorage 使用情况区块', async () => {
      render(<SystemResourcePanel />);

      await waitFor(() => {
        expect(screen.getByText('localStorage 使用情况')).toBeInTheDocument();
      });
    });

    it('应该显示导出 localStorage 按钮', async () => {
      render(<SystemResourcePanel />);

      await waitFor(() => {
        expect(screen.getByText('导出 localStorage 内容')).toBeInTheDocument();
      });
    });

    it('应该显示展开详情按钮', async () => {
      render(<SystemResourcePanel />);

      await waitFor(() => {
        expect(screen.getByText('展开详情')).toBeInTheDocument();
      });
    });

    it('应该显示进度条', async () => {
      render(<SystemResourcePanel />);

      await waitFor(() => {
        // 检查 localStorage 进度条存在
        const blueProgressBar = document.querySelector('.bg-blue-600');
        expect(blueProgressBar).toBeTruthy();
      });
    });
  });

  describe('说明区块', () => {
    it('应该显示说明区块', async () => {
      render(<SystemResourcePanel />);

      await waitFor(() => {
        expect(screen.getByText('说明')).toBeInTheDocument();
      });
    });

    it('应该在说明区块中显示 JS 堆内存相关说明', async () => {
      render(<SystemResourcePanel />);

      await waitFor(() => {
        // 检查 JS 堆内存说明存在（可能在多个位置）
        const jsHeapMemoryElements = screen.getAllByText(/JS 堆内存/);
        expect(jsHeapMemoryElements.length).toBeGreaterThan(0);
      });
    });

    it('应该在说明区块中显示 DOM 统计相关说明', async () => {
      render(<SystemResourcePanel />);

      await waitFor(() => {
        // 检查 DOM 统计说明存在
        const domStatisticsElements = screen.getAllByText('DOM 统计');
        expect(domStatisticsElements.length).toBeGreaterThan(0);
      });
    });

    it('应该在说明区块中显示内存刷新说明', async () => {
      render(<SystemResourcePanel />);

      await waitFor(() => {
        // 检查内存刷新说明存在
        expect(screen.getByText(/内存数据每 5 秒自动刷新/)).toBeInTheDocument();
      });
    });
  });
});