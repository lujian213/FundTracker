// components/SmartAddButton.tsx

import React, { useRef } from 'react';

interface SmartAddButtonProps {
  onClick: (files: File[]) => void;
}

export function SmartAddButton({ onClick }: SmartAddButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      onClick(Array.from(files));
    }
    event.target.value = '';
  };

  return (
    <>
      <button
        className="fixed bottom-8 right-24 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 hover:scale-110 active:scale-90 transition-all flex items-center justify-center z-30 group"
        onClick={handleClick}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="14" height="18" rx="2" />
          <line x1="6" y1="7" x2="14" y2="7" strokeLinecap="round" />
          <line x1="6" y1="11" x2="14" y2="11" strokeLinecap="round" />
          <line x1="6" y1="15" x2="11" y2="15" strokeLinecap="round" />
          <path d="M17 12 L22 7" strokeLinecap="round" />
          <path d="M17 12 L22 17" strokeLinecap="round" />
          <circle cx="17" cy="12" r="1.5" fill="currentColor" />
        </svg>
        <span className="absolute bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          智能添加基金
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </>
  );
}