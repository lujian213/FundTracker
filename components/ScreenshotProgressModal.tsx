import React from 'react';

interface ScreenshotProgressModalProps {
  visible: boolean;
  current: number;
  total: number;
  onCancel: () => void;
}

/**
 * 滚动截屏进度提示组件
 */
const ScreenshotProgressModal: React.FC<ScreenshotProgressModalProps> = ({
  visible,
  current,
  total,
  onCancel
}) => {
  if (!visible) return null;

  const percentage = Math.round((current / total) * 100);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      data-screenshot-ignore="true"  // 标记为截图时忽略
    >
      <div className="bg-black/85 text-white px-8 py-6 rounded-xl text-center">
        <div className="mb-4">
          正在截取页面 {current}/{total}...
        </div>

        <div className="w-[200px] h-1 bg-white/30 rounded-full mb-4 mx-auto">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <button
          onClick={onCancel}
          className="px-6 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
};

export default ScreenshotProgressModal;