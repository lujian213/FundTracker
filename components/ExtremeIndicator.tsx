import React from 'react';

interface ExtremeIndicatorProps {
  isMax?: boolean;
  isMin?: boolean;
}

/**
 * 极值图标组件：在日历格子中显示最赚/最亏图标
 * 使用统一的样式和位置，便于维护
 */
export const ExtremeIndicator: React.FC<ExtremeIndicatorProps> = ({ isMax, isMin }) => (
  <>
    {isMax && (
      <span className="absolute -top-1 -left-1 text-xs leading-none">👍</span>
    )}
    {isMin && (
      <span className="absolute -top-1 -left-1 text-xs leading-none">👎</span>
    )}
  </>
);