import React from 'react';

interface AIMenuItemProps {
  onMenuClose?: () => void;
  onOpenConfig: () => void;
}

const AIMenuItem: React.FC<AIMenuItemProps> = ({ onMenuClose, onOpenConfig }) => {
  const handleClick = () => {
    onMenuClose?.();
    onOpenConfig();
  };

  return (
    <button
      onClick={handleClick}
      className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center space-x-3"
    >
      <i className="fas fa-robot opacity-70"></i>
      <span>AI配置</span>
    </button>
  );
};

export default AIMenuItem;