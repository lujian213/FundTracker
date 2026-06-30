/**
 * SortableIndexCard.tsx
 *
 * 可拖拽的指数卡片包装组件
 * 使用 @dnd-kit/sortable 实现拖拽排序功能
 */

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import IndexCard from './IndexCard';
import { MarketIndex, CardStatus, ManageSelectionKey } from '../types';

interface SortableIndexCardProps {
  idx: MarketIndex;
  type: 'index' | 'global_index';
  status?: CardStatus;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (selectionKey: ManageSelectionKey) => void;
  onClick?: () => void;
  selectionKey: ManageSelectionKey;
}

const SortableIndexCard: React.FC<SortableIndexCardProps> = ({
  idx,
  type,
  status = 'unknown',
  isSelectionMode = false,
  isSelected = false,
  onSelect,
  onClick,
  selectionKey,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: idx.info.symbol,
    disabled: !isSelectionMode, // 只在管理模式下可拖拽
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <IndexCard
        idx={idx}
        type={type}
        status={status}
        isSelectionMode={isSelectionMode}
        isSelected={isSelected}
        isDragging={isDragging}
        onSelect={onSelect}
        onClick={onClick}
        selectionKey={selectionKey}
      />
    </div>
  );
};

export default SortableIndexCard;