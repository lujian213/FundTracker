// components/AIPortfolioAnalysisModal.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { hasUsableAIConfig, getAIConfig, AIConfiguration } from '../services/aiConfigService';
import { analyzePortfolio, PortfolioItem } from '../services/aiPortfolioService';
import { StreamCallback } from '../services/aiService';

interface AIPortfolioAnalysisModalProps {
  isVisible: boolean;
  onClose: () => void;
  portfolioData: PortfolioItem[];
}

type AnalysisState = 'idle' | 'loading' | 'success' | 'error';

const AIPortfolioAnalysisModal: React.FC<AIPortfolioAnalysisModalProps> = ({
  isVisible,
  onClose,
  portfolioData
}) => {
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

  // 防止重复初始化
  const hasInitialized = useRef(false);

  // 跟踪用户是否主动上滚（离开底部）
  const userScrolledUpRef = useRef(false);

  // 检查当前是否在底部附近
  const checkIsAtBottom = useCallback(() => {
    const container = contentRef.current;
    if (!container) return true;
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight < 30;
  }, []);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    // 如果用户主动上滚了，不自动滚动
    if (userScrolledUpRef.current) return;

    if (contentEndRef.current) {
      contentEndRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, []);

  // 内容变化时自动滚动
  useEffect(() => {
    if (state === 'loading' && content) {
      scrollToBottom();
    }
  }, [content, state, scrollToBottom]);

  // 监听用户主动滚动（wheel事件）和滚动到底部恢复自动滚动
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    // 用户使用鼠标滚轮向上滚动时，标记为用户主动上滚
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        // 向上滚动
        userScrolledUpRef.current = true;
      } else if (e.deltaY > 0 && checkIsAtBottom()) {
        // 向下滚动且已到底部，恢复自动滚动
        userScrolledUpRef.current = false;
      }
    };

    // 滚动事件：如果用户滚动到底部，恢复自动滚动
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

  // 执行分析
  const performAnalysis = useCallback(async () => {
    if (!hasUsableAIConfig()) {
      setState('error');
      setErrorMessage('尚未配置AI模型，请先完成AI配置');
      return;
    }

    const config = getAIConfig() as AIConfiguration;
    setModelName(config.model || 'AI');

    if (!portfolioData || portfolioData.length === 0) {
      setState('error');
      setErrorMessage('无投资组合数据');
      return;
    }

    setState('loading');
    setContent(''); // 清空内容，准备接收流式数据
    setErrorMessage('');

    try {
      // 流式回调：实时更新内容
      const handleChunk: StreamCallback = (chunk, fullContent) => {
        setContent(fullContent);
      };

      const result = await analyzePortfolio(config, portfolioData, handleChunk);

      if (result.success) {
        setContent(result.content); // 确保使用最终完整内容
        setState('success');
      } else {
        setErrorMessage(result.error || '分析失败');
        setState('error');
      }
    } catch (error: any) {
      setErrorMessage(error.message || '发生未知错误');
      setState('error');
    }
  }, [portfolioData]);

  // 当浮窗打开时自动执行分析和焦点管理
  useEffect(() => {
    // 只在 isVisible 变为 true 且尚未初始化时执行
    if (isVisible && !hasInitialized.current) {
      hasInitialized.current = true;
      setContent('');
      setErrorMessage('');
      setPosition({ x: 0, y: 0 }); // 重置位置
      performAnalysis();
      // 将焦点移到模态框
      setTimeout(() => {
        modalRef.current?.focus();
      }, 0);
    }

    // 关闭时重置初始化标记
    if (!isVisible) {
      hasInitialized.current = false;
    }
  }, [isVisible, performAnalysis]);

  // ESC键关闭
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

  // 拖动事件处理
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // 忽略按钮点击
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    modalStartPos.current = { ...position };
    e.preventDefault();
  }, [position]);

  // 复制到剪贴板
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

  // 渲染未配置AI提示
  const renderNotConfigured = () => (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      <i className="fas fa-robot text-4xl mb-4 opacity-50" />
      <p className="text-lg mb-4">尚未配置AI模型</p>
      <p className="text-sm text-gray-400 mb-4">请先完成AI配置以使用投资组合分析功能</p>
      <button
        onClick={() => {
          // 触发打开AI配置的事件
          window.dispatchEvent(new CustomEvent('openAIConfig'));
          onClose();
        }}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
      >
        去配置
      </button>
    </div>
  );

  // 渲染空数据提示
  const renderEmptyPortfolio = () => (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      <i className="fas fa-chart-pie text-4xl mb-4 opacity-50" />
      <p className="text-lg">无投资组合数据</p>
      <p className="text-sm text-gray-400 mt-2">请先配置持仓信息</p>
    </div>
  );

  // 渲染加载状态
  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4" />
      <p className="text-gray-600">AI正在分析您的投资组合...</p>
    </div>
  );

  // 渲染错误状态
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

  // 渲染分析结果
  const renderContent = () => (
    <div className="prose prose-sm max-w-none text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );

  // 渲染底部加载动画
  const renderLoadingIndicator = () => (
    <div className="flex items-center justify-center space-x-2 py-2">
      <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
      <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
      <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '600ms' }}></div>
    </div>
  );

  // 主内容区域
  const renderMainContent = () => {
    if (!hasUsableAIConfig()) {
      return renderNotConfigured();
    }

    if (!portfolioData || portfolioData.length === 0) {
      return renderEmptyPortfolio();
    }

    switch (state) {
      case 'loading':
        // 如果有内容，显示流式输出；否则显示加载动画
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
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* 浮窗主体 - 固定高度 */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative bg-white rounded-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col outline-none"
        style={{
          maxWidth: '56rem',
          height: '70vh',  // 固定高度
          transform: `translate(${position.x}px, ${position.y}px)`,
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-portfolio-title"
      >
        {/* 标题栏 - 可拖动 */}
        <div
          className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
        >
          <h3 id="ai-portfolio-title" className="text-lg font-bold pointer-events-none">AI 投资组合分析</h3>
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

        {/* 内容区域 */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-6 min-h-0">
          {renderMainContent()}
          <div ref={contentEndRef} />
        </div>

        {/* 底部状态栏 - 加载中显示动画，完成后显示连接状态 */}
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

export default AIPortfolioAnalysisModal;