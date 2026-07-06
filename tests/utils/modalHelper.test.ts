// tests/utils/modalHelper.test.ts

import { modalOpened, modalClosed, hasOpenModal, safeRestoreBodyScrollbar } from '../../utils/modalHelper';

describe('modalHelper', () => {
  beforeEach(() => {
    // 重置状态
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    // 重置内部计数器（通过多次调用modalClosed确保计数为0）
    while (hasOpenModal()) {
      modalClosed();
    }
  });

  afterEach(() => {
    // 清理
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });

  describe('基础功能', () => {
    test('modalOpened 应该隐藏滚动条并增加引用计数', () => {
      expect(hasOpenModal()).toBe(false);
      modalOpened();
      expect(hasOpenModal()).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');
    });

    test('modalClosed 应该恢复滚动条并减少引用计数', () => {
      modalOpened();
      expect(hasOpenModal()).toBe(true);

      modalClosed();
      expect(hasOpenModal()).toBe(false);
      expect(document.body.style.overflow).toBe('');
    });

    test('嵌套模态窗口应该正确处理引用计数', () => {
      // 打开第一个模态窗口
      modalOpened();
      expect(hasOpenModal()).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');

      // 打开第二个模态窗口
      modalOpened();
      expect(hasOpenModal()).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');

      // 关闭第一个模态窗口（引用计数减少，但不恢复滚动条）
      modalClosed();
      expect(hasOpenModal()).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');

      // 关闭第二个模态窗口（引用计数为0，恢复滚动条）
      modalClosed();
      expect(hasOpenModal()).toBe(false);
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('侧边栏与模态窗口交互场景', () => {
    test('侧边栏先打开，然后打开模态窗口，关闭模态窗口后应恢复滚动条', () => {
      // 模拟侧边栏打开：修改body样式
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = '15px';

      // 打开模态窗口（此时body.overflow已经是hidden）
      modalOpened();
      expect(hasOpenModal()).toBe(true);

      // 验证：modalOpened应该识别出overflow已被修改，记录空字符串作为原始状态
      // 模态窗口关闭时应该恢复到空字符串，而不是'hidden'

      // 模拟侧边栏关闭（但由于模态窗口还打开，不恢复滚动条）
      safeRestoreBodyScrollbar();
      expect(document.body.style.overflow).toBe('hidden');

      // 关闭模态窗口
      modalClosed();
      expect(hasOpenModal()).toBe(false);

      // 关键验证：滚动条应该恢复（overflow应为空字符串）
      expect(document.body.style.overflow).toBe('');
      expect(document.body.style.paddingRight).toBe('');
    });

    test('侧边栏先打开，模态窗口打开，侧边栏先关闭，最后模态窗口关闭', () => {
      // 1. 侧边栏打开
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = '15px';

      // 2. 打开模态窗口（此时overflow已经是hidden）
      modalOpened();
      expect(hasOpenModal()).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');

      // 3. 侧边栏关闭（但由于模态窗口还打开，safeRestoreBodyScrollbar不恢复）
      safeRestoreBodyScrollbar();
      expect(document.body.style.overflow).toBe('hidden');

      // 4. 模态窗口关闭
      modalClosed();
      expect(hasOpenModal()).toBe(false);

      // 验证：滚动条应该恢复（而不是保持hidden）
      expect(document.body.style.overflow).toBe('');
      expect(document.body.style.paddingRight).toBe('');
    });

    test('模态窗口先打开，然后侧边栏打开，应该不修改body样式', () => {
      // 1. 模态窗口先打开
      modalOpened();
      expect(hasOpenModal()).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');

      // 2. 模拟侧边栏尝试打开（检测到hasOpenModal()，不修改body）
      // 这个行为在侧边栏组件中实现，这里只验证hasOpenModal()返回true
      expect(hasOpenModal()).toBe(true);
    });
  });

  describe('边界情况', () => {
    test('原始状态为visible时应该正确记录并恢复', () => {
      document.body.style.overflow = 'visible';
      modalOpened();
      expect(hasOpenModal()).toBe(true);

      modalClosed();
      expect(hasOpenModal()).toBe(false);
      // 如果原始是visible，应该恢复到visible（这是真正未被修改的状态）
      expect(document.body.style.overflow).toBe('visible');
    });

    test('防止计数为负数', () => {
      // 在计数为0时调用closed
      expect(hasOpenModal()).toBe(false);
      modalClosed();
      expect(hasOpenModal()).toBe(false);
      // 计数不应该为负数
    });

    test('safeRestoreBodyScrollbar在有模态窗口时不恢复', () => {
      modalOpened();
      expect(document.body.style.overflow).toBe('hidden');

      safeRestoreBodyScrollbar();
      // 因为有模态窗口打开，不应该恢复
      expect(document.body.style.overflow).toBe('hidden');
    });
  });
});