import React from 'react';

interface SymbolBadgeProps {
  symbol: string;
  className?: string;
}

/**
 * A consistent badge component for displaying fund/index symbols
 * Used across multiple modal titles for visual consistency
 */
export const SymbolBadge: React.FC<SymbolBadgeProps> = ({ symbol, className = '' }) => (
  <span className={`px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-mono ${className}`.trim()}>
    {symbol}
  </span>
);