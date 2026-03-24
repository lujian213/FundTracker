import React from 'react';
import { formatMoneyWithSeparators } from '../utils/format';

interface MoneyCellProps {
  value: number;
}

/**
 * A consistent component for displaying profit/loss values
 * - Zero: displays "-" in black
 * - Positive: displays "+value" in red
 * - Negative: displays "value" in green
 */
export const MoneyCell: React.FC<MoneyCellProps> = ({ value }) => {
  if (value === 0) {
    return <span className="text-black">-</span>;
  }
  if (value > 0) {
    return <span className="text-red-600">+{formatMoneyWithSeparators(value)}</span>;
  }
  return <span className="text-green-600">{formatMoneyWithSeparators(value)}</span>;
};