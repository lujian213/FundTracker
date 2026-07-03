/**
 * 模态窗口滚动条管理器
 *
 * 使用引用计数跟踪当前打开的模态窗口数量
 * 只有当最后一个模态窗口关闭时，才恢复滚动条
 */

// 引用计数：当前打开的全屏模态窗口数量
let modalRefCount = 0;

// 记录原始滚动条状态
let originalOverflow = '';
let originalPaddingRight = '';

/**
 * 检查是否有全屏模态窗口打开（基于引用计数）
 *
 * @returns 是否有全屏模态窗口打开
 */
export function hasOpenModal(): boolean {
  return modalRefCount > 0;
}

/**
 * 全屏模态窗口打开时调用
 *
 * 记录原始滚动条状态，隐藏滚动条，并增加引用计数
 */
export function modalOpened(): void {
  // 第一次打开模态窗口时，记录原始状态
  if (modalRefCount === 0) {
    originalOverflow = document.body.style.overflow;
    originalPaddingRight = document.body.style.paddingRight;

    // 计算滚动条宽度
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  modalRefCount++;
}

/**
 * 全屏模态窗口关闭时调用
 *
 * 减少引用计数，只有当最后一个模态窗口关闭时才恢复滚动条
 */
export function modalClosed(): void {
  modalRefCount--;

  // 最后一个模态窗口关闭时，恢复原始状态
  if (modalRefCount === 0) {
    document.body.style.overflow = originalOverflow;
    document.body.style.paddingRight = originalPaddingRight;

    // 清空记录
    originalOverflow = '';
    originalPaddingRight = '';
  }

  // 防止计数为负数（异常情况）
  if (modalRefCount < 0) {
    modalRefCount = 0;
  }
}

/**
 * 安全地恢复主页面滚动条（检查是否有全屏模态窗口）
 *
 * 如果有模态窗口打开，不恢复滚动条（由模态窗口负责管理）
 */
export function safeRestoreBodyScrollbar(): void {
  if (!hasOpenModal()) {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
}