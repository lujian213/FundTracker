// components/AIPortfolioAnalysisModal.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { hasUsableAIConfig, getAIConfig, AIConfiguration } from '../services/aiConfigService';
import { analyzePortfolio, PortfolioItem } from '../services/aiPortfolioService';

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

  // 拖动相关状态
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const modalStartPos = useRef({ x: 0, y: 0 });

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
    setErrorMessage('');

    try {
      const result = await analyzePortfolio(config, portfolioData);

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
  }, [portfolioData]);

  // 当浮窗打开时自动执行分析和焦点管理
  useEffect(() => {
    if (isVisible) {
      setContent('');
      setErrorMessage('');
      setPosition({ x: 0, y: 0 }); // 重置位置
      performAnalysis();
      // 将焦点移到模态框
      setTimeout(() => {
        modalRef.current?.focus();
      }, 0);
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
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
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
        return renderLoading();
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

      {/* 浮窗主体 */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative bg-white rounded-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col outline-none"
        style={{
          maxWidth: '56rem',
          maxHeight: '80vh',
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
            {state === 'success' && (
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
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {renderMainContent()}
        </div>

        {/* 底部状态栏 */}
        {state === 'success' && modelName && (
          <div className="px-6 py-3 border-t border-gray-100 text-sm text-gray-400 flex-shrink-0">
            已连接 {modelName}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default AIPortfolioAnalysisModal;