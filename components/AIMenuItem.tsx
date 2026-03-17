import React, { useState } from 'react';
import AIConfigModal from './AIConfigModal';

interface AIMenuItemProps {}

const AIMenuItem: React.FC<AIMenuItemProps> = () => {
  const [showAIConfig, setShowAIConfig] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowAIConfig(true)}
        className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center space-x-3"
      >
        <i className="fas fa-robot opacity-70"></i>
        <span>AI配置</span>
      </button>

      <AIConfigModal
        isOpen={showAIConfig}
        onClose={() => setShowAIConfig(false)}
      />
    </>
  );
};

export default AIMenuItem;