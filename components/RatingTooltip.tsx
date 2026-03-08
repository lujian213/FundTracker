import React from 'react';
import { RiskResult } from '../utils/fundRiskAnalysis';

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
    <div className="relative inline-flex items-center justify-center">
      <button
        aria-label={`风险评级 ${ratingInfo.rating}`}
        onMouseEnter={onOpen}
        onMouseLeave={onClose}
        onFocus={onOpen}
        onBlur={onClose}
        className="text-xs font-bold px-2.5 py-1 rounded-md whitespace-nowrap leading-none"
        style={{ backgroundColor: ratingInfo.color, color: '#fff' }}
      >
        {ratingInfo.rating}
      </button>
      {open && (
        <div role="tooltip" className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-full mt-2 w-72 max-w-72 whitespace-normal break-words bg-white border rounded shadow-lg p-3 text-xs leading-relaxed z-50 overflow-hidden`}>
          <div className="font-bold mb-1 whitespace-normal break-words">风险分析：{ratingInfo.rating} &nbsp; <span className="font-normal">({ratingInfo.action})</span></div>
          <p className="text-gray-600 mb-3 whitespace-normal break-words">{ratingInfo.summary}</p>

          {ratingInfo.opportunitySignals.length > 0 && (
            <div className="mb-3">
              <div className="font-bold text-emerald-600 mb-1">机会信号</div>
              <ul className="list-disc pl-4 space-y-1 whitespace-normal break-words">
                {ratingInfo.opportunitySignals.map((signal, i) => <li key={`opportunity-${i}`} className="break-words" style={{ overflowWrap: 'anywhere' }}>{signal}</li>)}
              </ul>
            </div>
          )}

          {ratingInfo.riskSignals.length > 0 && (
            <div className="mb-3">
              <div className="font-bold text-red-500 mb-1">风险信号</div>
              <ul className="list-disc pl-4 space-y-1 whitespace-normal break-words">
                {ratingInfo.riskSignals.map((signal, i) => <li key={`risk-${i}`} className="break-words" style={{ overflowWrap: 'anywhere' }}>{signal}</li>)}
              </ul>
            </div>
          )}

          {ratingInfo.notes.length > 0 && (
            <div>
              <div className="font-bold text-gray-500 mb-1">说明</div>
              <ul className="list-disc pl-4 space-y-1 whitespace-normal break-words text-gray-600">
                {ratingInfo.notes.map((note, i) => <li key={`note-${i}`} className="break-words" style={{ overflowWrap: 'anywhere' }}>{note}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RatingTooltip;
