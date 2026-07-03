// components/AIInvestmentDraftModal.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Ticker, ValuationData, HistoricalPoint, MarketIndex, MarketFund } from '../types';
import { hasUsableAIConfig, getAIConfig, AIConfiguration } from '../services/aiConfigService';
import { analyzeInvestmentDraft, DraftEntry } from '../services/aiInvestmentDraftService';
import { StreamCallback } from '../services/aiService';
import * as marketFundService from '../services/marketFundService';
import * as indexService from '../services/indexService';
import { useModalBodyStyle } from '../hooks/useModalBodyStyle';

interface AIInvestmentDraftModalProps {
  isVisible: boolean;
  onClose: () => void;
  draftData: Record<string, DraftEntry>;
  // 保留原有props以兼容调用方，但不再使用
  portfolio: Ticker[];
  fundHistories: Record<string, HistoricalPoint[]>;
  indexHistories: Record<string, HistoricalPoint[]>;
  marketIndices: MarketIndex[];
  globalIndices: MarketIndex[];
  marketData: Record<string, ValuationData>;
}

type AnalysisState = 'idle' | 'loading' | 'success' | 'error';

const AIInvestmentDraftModal: React.FC<AIInvestmentDraftModalProps> = ({
  isVisible,
  onClose,
  draftData,
  // 以下props保留但不再使用，从服务获取最新数据
  portfolio: _portfolio,
  fundHistories: _fundHistories,
  indexHistories: _indexHistories,
  marketIndices: _marketIndices,
  globalIndices: _globalIndices,
  marketData: _marketData
}) => {
  useModalBodyStyle(isVisible);
  const [state, setState] = useState<AnalysisState>('idle');
  const [content, setContent] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [modelName, setModelName] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);

  // 拖动相关状态
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const modalStartPos = useRef({ x: 0, y: 0 });

  const hasInitialized = useRef(false);
  const userScrolledUpRef = useRef(false);

  const checkIsAtBottom = useCallback(() => {
    const container = contentRef.current;
    if (!container) return true;
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight < 30;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (userScrolledUpRef.current) return;
    if (contentEndRef.current) {
      contentEndRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, []);

  useEffect(() => {
    if (state === 'loading' && content) {
      scrollToBottom();
    }
  }, [content, state, scrollToBottom]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        userScrolledUpRef.current = true;
      } else if (e.deltaY > 0 && checkIsAtBottom()) {
        userScrolledUpRef.current = false;
      }
    };

    const handleScroll = () => {
      if (checkIsAtBottom()) {
        userScrolledUpRef.current = false;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [checkIsAtBottom]);

  const performAnalysis = useCallback(async () => {
    if (!hasUsableAIConfig()) {
      setState('error');
      setErrorMessage('尚未配置AI模型，请先完成AI配置');
      return;
    }

    const config = getAIConfig() as AIConfiguration;
    setModelName(config.model || 'AI');

    // 检查是否有买入或卖出操作
    const hasActions = Object.values(draftData).some(
      entry => entry.operation !== '不操作' && entry.amount
    );

    if (!hasActions) {
      setState('error');
      setErrorMessage('没有需要分析的买入或卖出操作');
      return;
    }

    setState('loading');
    setContent('');
    setErrorMessage('');

    try {
      const handleChunk: StreamCallback = (chunk, fullContent) => {
        setContent(fullContent);
      };

      // 获取 MarketFund 和 MarketIndex 数据
      const funds = marketFundService.getAllMarketFunds();
      const indices = indexService.getAllMarketIndices();

      const result = await analyzeInvestmentDraft(
        config, draftData, funds, indices, handleChunk
      );

      if (result.success) {
        setContent(result.content);
        setState('success');
      } else {
        setErrorMessage(result.error || '分析失败');
        setState('error');
      }
    } catch (error: any) {
      setErrorMessage(error.message || '发生未知错误');
      setState('error');
    }
  }, [draftData]);

  useEffect(() => {
    if (isVisible && !hasInitialized.current) {
      hasInitialized.current = true;
      setContent('');
      setErrorMessage('');
      setPosition({ x: 0, y: 0 });
      performAnalysis();
      setTimeout(() => {
        modalRef.current?.focus();
      }, 0);
    }

    if (!isVisible) {
      hasInitialized.current = false;
    }
  }, [isVisible, performAnalysis]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible, onClose]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    modalStartPos.current = { ...position };
    e.preventDefault();
  }, [position]);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;
      setPosition({
        x: modalStartPos.current.x + deltaX,
        y: modalStartPos.current.y + deltaY
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isVisible) {
    return null;
  }

  const renderNotConfigured = () => (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      <i className="fas fa-robot text-4xl mb-4 opacity-50" />
      <p className="text-lg mb-4">尚未配置AI模型</p>
      <p className="text-sm text-gray-400 mb-4">请先完成AI配置以使用投资计划分析功能</p>
      <button
        onClick={() => {
          window.dispatchEvent(new CustomEvent('openAIConfig'));
          onClose();
        }}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
      >
        去配置
      </button>
    </div>
  );

  const renderNoActions = () => (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      <i className="fas fa-clipboard-list text-4xl mb-4 opacity-50" />
      <p className="text-lg">没有需要分析的操作</p>
      <p className="text-sm text-gray-400 mt-2">请先在投资计划中添加买入或卖出操作</p>
    </div>
  );

  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4" />
      <p className="text-gray-600">AI正在分析您的投资计划...</p>
    </div>
  );

  const renderError = () => (
    <div className="flex flex-col items-center justify-center py-12 text-red-500">
      <i className="fas fa-exclamation-circle text-4xl mb-4" />
      <p className="text-lg mb-2">分析失败</p>
      <p className="text-sm text-gray-500 mb-4">{errorMessage}</p>
      <button
        onClick={performAnalysis}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
      >
        重试
      </button>
    </div>
  );

  const renderContent = () => (
    <>
      <style>{`
        .ai-draft-table th:nth-child(-n+5),
        .ai-draft-table td:nth-child(-n+5) {
          white-space: nowrap;
        }
      `}</style>
      <div className="prose prose-sm max-w-none text-sm">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            table: ({ children }) => <table className="ai-draft-table w-full border-collapse">{children}</table>,
            th: ({ children }) => <th className="px-2 py-1 border border-gray-300">{children}</th>,
            td: ({ children }) => <td className="px-2 py-1 border border-gray-300">{children}</td>
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </>
  );

  const renderLoadingIndicator = () => (
    <div className="flex items-center justify-center space-x-2 py-2">
      <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
      <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
      <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '600ms' }}></div>
    </div>
  );

  const renderMainContent = () => {
    if (!hasUsableAIConfig()) {
      return renderNotConfigured();
    }

    const hasActions = Object.values(draftData).some(
      entry => entry.operation !== '不操作' && entry.amount
    );

    if (!hasActions) {
      return renderNoActions();
    }

    switch (state) {
      case 'loading':
        return content ? renderContent() : renderLoading();
      case 'error':
        return renderError();
      case 'success':
        return renderContent();
      default:
        return renderLoading();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative bg-white rounded-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col outline-none"
        style={{
          maxWidth: '62rem',
          height: '70vh',
          transform: `translate(${position.x}px, ${position.y}px)`,
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-investment-draft-title"
      >
        <div
          className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
        >
          <h3 id="ai-investment-draft-title" className="text-lg font-bold pointer-events-none">AI 投资计划分析</h3>
          <div className="flex items-center gap-2">
            {(state === 'success' || (state === 'loading' && content)) && (
              <button
                aria-label="复制到剪贴板"
                className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 cursor-pointer"
                onClick={handleCopy}
                title={copySuccess ? '已复制' : '复制到剪贴板'}
              >
                <i className={`fas ${copySuccess ? 'fa-check text-green-500' : 'fa-copy'}`} />
              </button>
            )}
            <button
              aria-label="关闭分析窗口"
              className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 cursor-pointer"
              onClick={onClose}
            >
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        <div ref={contentRef} className="flex-1 overflow-y-auto p-6 min-h-0">
          {renderMainContent()}
          <div ref={contentEndRef} />
        </div>

        <div className="px-6 py-3 border-t border-gray-100 text-sm text-gray-400 flex-shrink-0">
          {state === 'loading' ? (
            renderLoadingIndicator()
          ) : state === 'success' && modelName ? (
            <span>已连接 {modelName}</span>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AIInvestmentDraftModal;