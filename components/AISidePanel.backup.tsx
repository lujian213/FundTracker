import React, { useState, useEffect, useRef } from 'react';
import { ValuationData } from '../types';
import { queryAI, queryAIWithTemplate, AIResponse, AIQueryContext } from '../services/aiService';
import { getAIConfig, hasValidAIConfig } from '../services/aiConfigService';
import { AIConfiguration } from '../types/aiConfigTypes';
import { aiAssistantStateManager } from '../services/aiAssistantStateManager';
import { AIAssistantMessage, AIAssistantState } from '../types/aiAssistantTypes';
import { ContextCompressionService } from '../services/ContextCompressionService';
import DOMPurify from 'dompurify';

interface AISidePanelProps {
  isVisible: boolean;
  onClose: () => void;
  fundSymbol: string;
  fundName: string;
  valuationData?: ValuationData;
  tradeHistory?: any[]; // 用户交易历史
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

// 将Markdown转换为HTML的辅助函数
const renderMarkdown = (text: string) => {
  // 简单的 Markdown 解析，支持基本格式
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 处理标题
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // 处理粗体
    .replace(/\*\*(.*?)\*/g, '<strong>$1</strong>')
    // 处理斜体
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // 处理行内代码
    .replace(/`(.*?)`/g, '<code>$1</code>')
    // 处理代码块
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // 处理链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // 处理无序列表
    .replace(/^\s*-\s(.*)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)+/g, '<ul>$&</ul>')
    // 处理换行
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br />');

  // 如果文本开头没有段落标签，则添加
  if (!html.startsWith('<p>') && !html.startsWith('<h') && !html.startsWith('<ul') && !html.startsWith('<pre')) {
    html = '<p>' + html;
  }

  // 如果文本结尾没有闭合段落标签，则添加
  if (!html.endsWith('</p>') && !html.endsWith('</li>') && !html.endsWith('</ul>') && !html.endsWith('</pre>')) {
    html += '</p>';
  }

  // 清理可能的不安全内容
  const sanitizedHtml = DOMPurify.sanitize(html);
  return { __html: sanitizedHtml };
};

const AISidePanel: React.FC<AISidePanelProps> = ({
  isVisible,
  onClose,
  fundSymbol,
  fundName,
  valuationData,
  tradeHistory
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasBeenInitialized, setHasBeenInitialized] = useState<boolean>(false);
  const [contextLength, setContextLength] = useState<number>(0);
  const [compressionStatus, setCompressionStatus] = useState<string>('Ready');

  // 初始化上下文压缩服务
  const compressionService = new ContextCompressionService();

  // 初始化时从全局状态加载数据
  useEffect(() => {
    // 在useEffect内部获取最新的全局状态
    const currentState = aiAssistantStateManager.getState(fundSymbol);
    if (currentState) {
      const messagesForDisplay = compressionService.getMessagesForDisplay(currentState);
      setMessages(messagesForDisplay);
      setHasBeenInitialized(currentState.hasBeenInitialized);

      // 更新上下文长度和压缩状态
      setContextLength(compressionService.getContextLength(currentState));
      setCompressionStatus(compressionService.needsCompression(currentState) ? 'Needs Compression' : 'OK');
    } else {
      setMessages([]);
      setHasBeenInitialized(false);
      setContextLength(0);
      setCompressionStatus('Ready');
    }
  }, [fundSymbol]);

  // 更新全局状态管理器
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<AIConfiguration | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4');
  const [isValidConfig, setIsValidConfig] = useState(hasValidAIConfig());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load config on mount
  useEffect(() => {
    const savedConfig = getAIConfig();
    if (savedConfig) {
      setConfig(savedConfig);
      setApiEndpoint(savedConfig.apiEndpoint);
      setApiKey(savedConfig.apiKey);
      setModel(savedConfig.model || 'gpt-4');
    }
  }, []);


  // Initialize messages and fetch initial data when panel becomes visible for the first time today
  useEffect(() => {
    // 每次可见性变化时，先从全局状态同步当前状态
    const currentGlobalState = aiAssistantStateManager.getState(fundSymbol);

    // 同步本地状态与全局状态
    if (currentGlobalState) {
      const messagesForDisplay = compressionService.getMessagesForDisplay(currentGlobalState);
      setMessages(messagesForDisplay);
      setHasBeenInitialized(currentGlobalState.hasBeenInitialized);

      // 更新上下文长度和压缩状态
      setContextLength(compressionService.getContextLength(currentGlobalState));
      setCompressionStatus(compressionService.needsCompression(currentGlobalState) ? 'Needs Compression' : 'OK');
    } else {
      setMessages([]);
      setHasBeenInitialized(false);
      setContextLength(0);
      setCompressionStatus('Ready');
    }

    // 检查是否在今天已初始化
    const isInitializedToday = aiAssistantStateManager.isInitializedToday(fundSymbol);

    // 只有在面板可见且今天尚未初始化时才进行初始化
    if (isVisible && (!currentGlobalState || !isInitializedToday)) {
      initializeChat();
      // 更新状态标记为已初始化
      setHasBeenInitialized(true);
    } else if (isVisible && isInitializedToday) {
      // Reuse existing chat if it exists and was initialized today
    }
  }, [isVisible, fundSymbol]);

  // 更新全局状态管理器 - 只有当本地状态改变时才更新
  useEffect(() => {
    // 获取当前状态来决定初始化日期 - 如果已经有初始化日期则保持不变，否则使用当前日期
    const currentState = aiAssistantStateManager.getState(fundSymbol);
    const initializationDate = currentState?.initializationDate || new Date();

    // 准备新状态
    const newState: AIAssistantState = {
      historyContent: [],
      newContent: messages as AIAssistantMessage[], // 将当前消息作为新内容
      summaryContent: currentState?.summaryContent || '',
      hasBeenInitialized,
      lastAccessed: new Date(),
      initializationDate
    };

    aiAssistantStateManager.setState(fundSymbol, newState);

    // 更新上下文长度和压缩状态
    setContextLength(compressionService.getContextLength(newState));
    setCompressionStatus(compressionService.needsCompression(newState) ? 'Needs Compression' : 'OK');
  }, [messages, hasBeenInitialized, fundSymbol]);

  const initializeChat = async () => {
    const validConfig = hasValidAIConfig();

    // If no valid config, show welcome message without making API call
    if (!validConfig) {
      const newMessage: Message = {
        id: 'welcome',
        content: `欢迎使用AI投资助手！我可以为您提供关于${fundName}(${fundSymbol})的分析和投资建议。\n\n请先配置有效的AI服务才能开始使用。`,
        role: 'assistant',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, newMessage]);
      return;
    }

    // Add loading indicator
    const loadingMessage: Message = {
      id: 'initial-loading',
      content: '正在初始化AI助手...',
      role: 'assistant',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, loadingMessage]);

    // Ensure config is loaded before attempting API call
    const currentConfig = getAIConfig();
    if (!currentConfig) {
      const errorMessage: Message = {
        id: 'error-config',
        content: '无法加载AI配置，请检查您的设置',
        role: 'assistant',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    try {
      const context: AIQueryContext = {
        fundName,
        fundSymbol,
        valuationData,
        tradeHistory
      };

      const response: AIResponse = await queryAIWithTemplate(currentConfig, undefined, context);

      // Remove loading indicator
      setMessages(prev => prev.filter(msg => msg.id !== 'initial-loading'));

      if (response.success) {
        const aiMessage: Message = {
          id: `ai-${Date.now()}`,
          content: response.content,
          role: 'assistant',
          timestamp: new Date()
        };

        setMessages(prev => [...prev, aiMessage]);

        // 检查是否需要压缩
        const currentState = aiAssistantStateManager.getState(fundSymbol);
        if (currentState && compressionService.needsCompression(currentState)) {
          setCompressionStatus('Needs Compression');
        }
      } else {
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          content: response.error ? `初始化失败: ${response.error}` : '初始化AI助手时发生错误',
          role: 'assistant',
          timestamp: new Date()
        };

        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error: any) {
      // Remove loading indicator
      setMessages(prev => prev.filter(msg => msg.id !== 'initial-loading'));

      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        content: `初始化AI助手时发生错误: ${error.message || '未知错误'}`,
        role: 'assistant',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Function to handle user manually closing the panel (resets chat for next open)
  const closePanel = () => {
    // 重置特定基金在全局状态管理器中的状态
    aiAssistantStateManager.resetState(fundSymbol);

    // 更新本地状态以反映重置
    setMessages([]);
    setHasBeenInitialized(false);
    setContextLength(0);
    setCompressionStatus('Ready');

    onClose(); // Call the parent's onClose handler to hide the panel
  };

  // Check if there's a valid active AI config
  useEffect(() => {
    const validConfig = hasValidAIConfig();
    setIsValidConfig(validConfig);

    // Reload config if needed
    if (validConfig && !config) {
      const savedConfig = getAIConfig();
      if (savedConfig) {
        setConfig(savedConfig);
        setApiEndpoint(savedConfig.apiEndpoint);
        setApiKey(savedConfig.apiKey);
        setModel(savedConfig.model || 'gpt-4');
      }
    }
  }, [isVisible]); // Changed to only trigger on visibility change

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      // Check if scrollIntoView is available (not available in some test environments)
      if (typeof messagesEndRef.current.scrollIntoView === 'function') {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !isValidConfig || !config) {
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      role: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // 获取当前状态以构建上下文
      const currentState = aiAssistantStateManager.getState(fundSymbol);
      let aiContext: string;

      if (currentState) {
        // 使用压缩服务提供的上下文
        aiContext = compressionService.getContextForAI(currentState);
      } else {
        // 如果没有状态，只使用当前消息
        aiContext = `[USER] ${inputValue}`;
      }

      // 准备上下文与基金信息
      const context: AIQueryContext = {
        fundName,
        fundSymbol,
        valuationData,
        tradeHistory,
      };

      // 构建完整提示
      const fullPrompt = `上下文信息:\n${aiContext}\n\n用户查询: ${inputValue}`;

      const response: AIResponse = await queryAI(config, fullPrompt, context);

      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        content: response.content,
        role: 'assistant',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);

      // 更新状态
      const updatedState = aiAssistantStateManager.getState(fundSymbol);
      if (updatedState) {
        // 添加新消息到newContent
        const newContent = [...updatedState.newContent, userMessage as AIAssistantMessage, aiMessage as AIAssistantMessage];

        const newState: AIAssistantState = {
          ...updatedState,
          newContent
        };

        aiAssistantStateManager.setState(fundSymbol, newState);

        // 检查是否需要压缩
        if (compressionService.needsCompression(newState)) {
          // 触发压缩过程
          setCompressionStatus('Compressing...');
          const compressionResult = await compressionService.compressContext(newState, config);

          if (compressionResult.success && compressionResult.summary) {
            // 更新状态，将新内容移到历史内容中，并设置新摘要
            const currentState = aiAssistantStateManager.getState(fundSymbol);
            if (currentState) {
              const finalState: AIAssistantState = {
                ...currentState,
                historyContent: [...currentState.historyContent, ...currentState.newContent],
                newContent: [aiMessage as AIAssistantMessage], // 将最新AI回复作为新内容
                summaryContent: compressionResult.summary
              };

              aiAssistantStateManager.setState(fundSymbol, finalState);

              // 更新本地状态
              setMessages(compressionService.getMessagesForDisplay(finalState));
              setContextLength(compressionService.getContextLength(finalState));
              setCompressionStatus('OK');
            }
          } else {
            console.error('压缩失败:', compressionResult.error);
            setCompressionStatus('Compression Failed');
          }
        } else {
          setContextLength(compressionService.getContextLength(newState));
          setCompressionStatus(compressionService.needsCompression(newState) ? 'Needs Compression' : 'OK');
        }
      }
    } catch (error: any) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        content: `AI服务错误: ${error.message || '请求失败'}`,
        role: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = () => {
    const newConfig: AIConfiguration = {
      apiEndpoint,
      apiKey,
      model
    };

    localStorage.setItem('ai_api_config', JSON.stringify(newConfig));
    setConfig(newConfig);
    setShowConfig(false);

    // Refresh config validity status
    const validConfig = hasValidAIConfig();
    setIsValidConfig(validConfig);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Calculate position based on the fund details modal
  const calculatePosition = () => {
    // Find the fund details modal element to position relative to it using the specific ID
    const modal = document.getElementById('fund-details-modal') as HTMLElement;

    if (modal) {
      const rect = modal.getBoundingClientRect();
      // Ensure there's enough space and it doesn't go off-screen
      const rightPos = rect.right + 10; // Add a little gap
      const adjustedLeft = Math.min(rightPos, window.innerWidth - 400); // Max width of 400px

      return {
        top: `${Math.max(rect.top, 10)}px`, // Minimum 10px from top
        height: `${rect.height - 20}px`, // Reduce height slightly to account for margins
        left: `${adjustedLeft}px`,
      };
    }

    // Fallback: look for any element with fixed, inset-0 and high z-index
    let fallbackModal = null;
    const allElements = Array.from(document.querySelectorAll('*')) as HTMLElement[];
    fallbackModal = allElements.find(el => {
      const classes = el.className;
      const style = window.getComputedStyle(el);
      return classes.includes('fixed') &&
             classes.includes('inset-0') &&
             parseInt(style.zIndex) >= 100 &&
             style.display !== 'none';
    });

    if (fallbackModal) {
      const rect = fallbackModal.getBoundingClientRect();
      const rightPos = rect.right + 10;
      const adjustedLeft = Math.min(rightPos, window.innerWidth - 400);

      return {
        top: `${Math.max(rect.top, 10)}px`,
        height: `${rect.height - 20}px`,
        left: `${adjustedLeft}px`,
      };
    }

    // Default positioning if modal not found
    return {
      top: '5vh',
      height: '90vh',
      left: 'auto',
      right: '2rem'
    };
  };

  const [position, setPosition] = useState(calculatePosition());

  useEffect(() => {
    const updatePosition = () => {
      setPosition(calculatePosition());
    };

    // Update position on resize and scroll
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    // Also update periodically in case modal appears/disappears
    const interval = setInterval(updatePosition, 100);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
      clearInterval(interval);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className="w-96 bg-white shadow-2xl z-[9999] flex flex-col border-l border-gray-200 fixed"
      style={{
        top: position.top,
        height: position.height,
        left: position.left,
        maxHeight: 'calc(100vh - 2rem)',
        marginTop: '1rem',
        marginBottom: '1rem'
      }}
    >
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-gray-800">AI 投资助手</h3>
            <p className="text-xs text-gray-500 truncate">{fundName} ({fundSymbol})</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-500">
              上下文: {contextLength} 字符 ({compressionStatus})
            </span>
            <button
              onClick={closePanel}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full"
              aria-label="关闭"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      </div>

      {showConfig ? (
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h4 className="font-medium text-gray-800 mb-3">AI 配置</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">API 端点</label>
              <input
                type="text"
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="https://api.example.com/v1/chat/completions"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">API 密钥</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="sk-..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">模型</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="gpt-4"
              />
            </div>
            <div className="flex space-x-2 pt-2">
              <button
                onClick={handleSaveConfig}
                className="flex-1 px-3 py-1.5 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors"
              >
                保存配置
              </button>
              <button
                onClick={() => setShowConfig(false)}
                className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-25">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white rounded-br-none'
                  : 'bg-gray-100 text-gray-800 rounded-bl-none'
              }`}
            >
              <div
                className="whitespace-pre-wrap"
                dangerouslySetInnerHTML={renderMarkdown(message.content)}
              />
              <div
                className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-blue-200' : 'text-gray-500'
                }`}
              >
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-none bg-gray-100 text-gray-800 px-4 py-2.5 text-sm">
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '600ms' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex space-x-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入您的问题..."
              className="flex-1 border border-gray-300 rounded-2xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 max-h-32"
              rows={2}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim() || !isValidConfig}
              className={`w-12 h-12 flex items-center justify-center rounded-full ${
                inputValue.trim() && isValidConfig
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-400'
              } transition-colors`}
              aria-label="发送"
            >
              <i className="fas fa-paper-plane"></i>
            </button>
          </div>
          {isValidConfig ? (
            <p className="text-xs text-gray-500 mt-2 text-center">
              AI 助手已连接 ({config?.model || 'gpt-4'})
            </p>
          ) : (
            <p className="text-xs text-red-500 mt-2 text-center">
              未检测到AI配置，请前往设置页面配置AI助手
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AISidePanel;