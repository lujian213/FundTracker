import { useEffect, RefObject } from 'react';

/**
 * 点击元素外部时触发回调的 hook
 * @param ref 要检测的元素引用
 * @param isActive 是否激活监听（通常对应组件的打开状态）
 * @param onClickOutside 点击外部时的回调
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  isActive: boolean,
  onClickOutside: () => void
) {
  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickOutside();
      }
    };

    // 使用 setTimeout 延迟添加监听器，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isActive, onClickOutside, ref]);
}