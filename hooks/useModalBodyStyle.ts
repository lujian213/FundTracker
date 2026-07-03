import { useEffect } from 'react';
import { modalOpened, modalClosed } from '../utils/modalHelper';

/**
 * 全屏模态框使用的 hook，用于隐藏主页面滚动条并补偿滚动条宽度
 *
 * 使用引用计数机制：
 * - 第一次打开模态窗口时，记录原始滚动条状态并隐藏滚动条
 * - 只有当最后一个模态窗口关闭时，才恢复原始滚动条状态
 * - 支持模态窗口嵌套，避免错误地恢复滚动条
 *
 * @param isActive - 模态框是否激活（打开状态）
 */
export function useModalBodyStyle(isActive: boolean = true) {
  useEffect(() => {
    if (!isActive) return;

    // 模态窗口打开：增加引用计数，隐藏滚动条
    modalOpened();

    return () => {
      // 模态窗口关闭：减少引用计数，必要时恢复滚动条
      modalClosed();
    };
  }, [isActive]);
}