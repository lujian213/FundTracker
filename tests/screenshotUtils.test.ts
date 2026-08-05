/**
 * 截屏工具函数单元测试
 */
import { needsScrollScreenshot } from '../utils/screenshotUtils';

describe('screenshotUtils', () => {
  describe('needsScrollScreenshot', () => {
    // Mock window 和 document
    beforeEach(() => {
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 800
      });
    });

    test('当页面高度大于视口高度时返回 true', () => {
      Object.defineProperty(document.documentElement, 'scrollHeight', {
        writable: true,
        configurable: true,
        value: 1200
      });

      expect(needsScrollScreenshot()).toBe(true);
    });

    test('当页面高度等于视口高度时返回 false', () => {
      Object.defineProperty(document.documentElement, 'scrollHeight', {
        writable: true,
        configurable: true,
        value: 800
      });

      expect(needsScrollScreenshot()).toBe(false);
    });

    test('当页面高度小于视口高度时返回 false', () => {
      Object.defineProperty(document.documentElement, 'scrollHeight', {
        writable: true,
        configurable: true,
        value: 600
      });

      expect(needsScrollScreenshot()).toBe(false);
    });
  });

  describe('stitchImages', () => {
    // 注意：stitchImages 涉及 Canvas API，在 Jest 中难以完全模拟
    // 主要测试参数验证逻辑

    test('传入空数组时抛出错误', async () => {
      const { stitchImages } = await import('../utils/screenshotUtils');

      await expect(stitchImages([], 0)).rejects.toThrow('No images to stitch');
    });
  });
});