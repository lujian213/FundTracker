import React from 'react';
import { RiskResult } from '../utils/riskTooltip';

interface Props {
  ratingInfo: RiskResult;
  onOpen?: () => void;
  onClose?: () => void;
  open?: boolean;
  alignRight?: boolean;
}

export const RatingTooltip: React.FC<Props> = ({ ratingInfo, onOpen, onClose, open = false, alignRight = true }) => {
  if (!ratingInfo) return null;
  return (
    <div className="ml-2 relative inline-block">
      <button
        aria-label={`风险评级 ${ratingInfo.rating}`}
        onMouseEnter={onOpen}
        onMouseLeave={onClose}
        onFocus={onOpen}
        onBlur={onClose}
        className="text-xs font-bold px-2 py-1 rounded-md"
        style={{ backgroundColor: ratingInfo.color, color: '#fff' }}
      >
        {ratingInfo.rating}
      </button>
      {open && (
        <div role="tooltip" className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-full mt-2 w-60 bg-white border rounded shadow-lg p-3 text-xs z-50`}>
          <div className="font-bold mb-1">评级：{ratingInfo.rating} &nbsp; <span className="font-normal">({ratingInfo.action})</span></div>
          <ul className="list-disc pl-4 space-y-1">
            {ratingInfo.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export default RatingTooltip;

