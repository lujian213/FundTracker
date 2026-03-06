import React from 'react';

interface ManageSelectButtonProps {
  isSelected: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  label: string;
  className?: string;
}

const ManageSelectButton: React.FC<ManageSelectButtonProps> = ({
  isSelected,
  onClick,
  label,
  className = 'absolute -top-1.5 -right-1.5 z-10',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isSelected}
      title={isSelected ? '取消选择' : '选择删除'}
      className={`${className} w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-200' : 'bg-white border-gray-300 text-transparent hover:border-red-300 hover:bg-red-50'}`}
    >
      <i className="fas fa-times text-[9px]"></i>
    </button>
  );
};

export default ManageSelectButton;
