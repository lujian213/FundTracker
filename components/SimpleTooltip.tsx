import React, { useState, useRef, useEffect, isValidElement } from 'react';
import { createPortal } from 'react-dom';
import { StrategyReason } from '../types';

interface Props {
  content?: string | React.ReactNode | StrategyReason;
  children: React.ReactNode;
  alignRight?: boolean;
}

export const SimpleTooltip: React.FC<Props> = ({ content, children, alignRight = true }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const PADDING = 8; // viewport padding
  const MAX_WIDTH = 420; // increase tooltip max width slightly to fit wider first column

  useEffect(() => {
    if (!open) return;
    let mounted = true;

    const compute = () => {
      const trigger = triggerRef.current;
      const tip = tooltipRef.current;
      if (!trigger || !tip) return;

      const tr = trigger.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // preferred left: alignRight -> align tooltip right edge to trigger.right; else align left edge to trigger.left
      let left = alignRight ? (tr.right - tipRect.width) : tr.left;
      // clamp horizontally within viewport
      left = Math.max(PADDING, Math.min(left, vw - tipRect.width - PADDING));

      // preferred below the trigger
      let top = tr.bottom + 8;
      // if not enough space below, try above
      if (top + tipRect.height + PADDING > vh) {
        const altTop = tr.top - tipRect.height - 8;
        if (altTop >= PADDING) top = altTop;
        else top = Math.max(PADDING, vh - tipRect.height - PADDING);
      }

      if (mounted) setPos({ left, top });
    };

    // initial compute after tooltip mounted
    const raf = requestAnimationFrame(() => compute());

    const onScroll = () => compute();
    const onResize = () => compute();

    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, alignRight]);

  if (!content) return <>{children}</>;

  const handleOpen = () => setOpen(true);
  const handleClose = () => {
    setOpen(false);
    setPos(null);
  };

  // Helper to render content safely: if it's StrategyReason, render text and optional MA info
  // Basic markdown renderer: supports tables and preserves paragraphs. Avoids innerHTML.
  const renderMarkdown = (md: string): React.ReactNode => {
    const lines = md.replace(/\r/g, '').split('\n');
    const nodes: React.ReactNode[] = [];
    let i = 0;
    let tableCounter = 0;
    const splitCols = (line: string) => line.split('|').map(s => s.trim());

    const normalizeCols = (cols: string[]) => {
      // drop leading/trailing empty cells caused by leading/trailing pipes
      if (cols.length > 0 && cols[0] === '') cols.shift();
      if (cols.length > 0 && cols[cols.length - 1] === '') cols.pop();
      return cols;
    };

    const isSeparatorLine = (line: string) => {
      // line must contain '|' and after removing pipes, each segment should look like --- or :---: etc
      if (!line.includes('|')) return false;
      const segs = line.split('|').map(s => s.trim()).filter(s => s.length > 0);
      if (segs.length === 0) return false;
      return segs.every(s => /^:?-{1,}:?$/.test(s));
    };

    while (i < lines.length) {
      if (lines[i].trim() === '') { i++; continue; }

      // detect table start: current line has '|' and next line is separator
      if (lines[i].includes('|') && i + 1 < lines.length && isSeparatorLine(lines[i + 1])) {
        const headerLine = lines[i];
        const headersRaw = splitCols(headerLine);
        const headers = normalizeCols(headersRaw).map(h => h);
        i += 2; // consume header and separator
        const rows: string[][] = [];
        while (i < lines.length && lines[i].includes('|')) {
          const rowColsRaw = splitCols(lines[i]);
          let rowCols = normalizeCols(rowColsRaw);
          // pad or truncate to header length
          if (rowCols.length < headers.length) {
            rowCols = rowCols.concat(Array(headers.length - rowCols.length).fill(''));
          } else if (rowCols.length > headers.length) {
            // keep extra columns by joining them into the last cell
            rowCols = rowCols.slice(0, headers.length - 1).concat([rowCols.slice(headers.length - 1).join(' | ')]);
          }
          rows.push(rowCols);
          i++;
        }

        const tableKey = `tbl-${tableCounter++}-${i}`;
        nodes.push(
          <div className="overflow-auto my-2" key={tableKey}>
            <table className="w-full text-xs table-auto border-collapse" style={{ minWidth: Math.max(360, headers.length * 120) }}>
              <thead>
                <tr>
                  {headers.map((h, idx) => (
                    <th
                      key={idx}
                      className="px-2 py-1 text-left text-[11px] text-gray-600 border-b"
                      style={idx === 0 ? { whiteSpace: 'nowrap', minWidth: 160 } : { whiteSpace: 'normal' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-gray-50'}>
                    {headers.map((_, ci) => (
                      <td
                        key={ci}
                        className="px-2 py-1 align-top text-gray-700"
                        style={ci === 0 ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : { whiteSpace: 'normal' }}
                      >
                        {r[ci] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // fallback paragraph block
      const paraLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('|')) {
        paraLines.push(lines[i]);
        i++;
      }
      nodes.push(<div className="text-gray-700 whitespace-pre-wrap mb-1" key={`p-${i}`}>{paraLines.join('\n')}</div>);
      continue;
    }
    return <div>{nodes}</div>;
  };

  const renderContent = () => {
    if (typeof content === 'string') return renderMarkdown(content);
    if (isValidElement(content)) return content;
    // if content is a StrategyReason-like object
    const maybe = content as StrategyReason | any;
    if (maybe && typeof maybe === 'object' && typeof maybe.text === 'string') {
      return (
        <div className="text-gray-700">
          <div className="font-semibold mb-1">{maybe.date ? `${maybe.date} · ${maybe.type}` : maybe.type}</div>
          <div className="mb-2 whitespace-pre-wrap">{maybe.text}</div>
          {maybe.ma && (
            <div className="text-xs text-gray-500">
              <div>MA 短期（昨日 ← 前日）: {maybe.ma.shortYesterday ?? '-'} ← {maybe.ma.shortPrev ?? '-'}</div>
              <div>MA 长期（昨日 ← 前日）: {maybe.ma.longYesterday ?? '-'} ← {maybe.ma.longPrev ?? '-'}</div>
            </div>
          )}
        </div>
      );
    }
    // fallback: try to stringify safely
    try {
      return <div className="text-gray-700">{String(content)}</div>;
    } catch (e) {
      return <div className="text-gray-700">(无法显示)</div>;
    }
  };

  const tooltipNode = open ? (
    createPortal(
      <div
        ref={tooltipRef}
        role="tooltip"
        style={{
          position: 'fixed',
          left: pos ? pos.left : -9999,
          top: pos ? pos.top : -9999,
          maxWidth: MAX_WIDTH,
          zIndex: 10000,
        }}
        className="whitespace-normal break-words bg-white border rounded shadow-lg p-3 text-xs leading-relaxed overflow-hidden"
      >
        {renderContent()}
      </div>,
      typeof document !== 'undefined' && document.body ? document.body : document.createElement('div')
    )
  ) : null;

  return (
    <span
      ref={triggerRef}
      className="inline-block"
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
      onFocus={handleOpen}
      onBlur={handleClose}
    >
      {children}
      {tooltipNode}
    </span>
  );
};

export default SimpleTooltip;

