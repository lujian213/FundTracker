import React, { useState, useEffect, useRef } from 'react';
import { ValuationData } from '../types';
import { queryAI, queryAIWithTemplate, AIResponse, AIQueryContext } from '../services/aiService';
import { getAIConfig, hasValidAIConfig, hasUsableAIConfig } from '../services/aiConfigService';
import { AIConfiguration } from '../types/aiConfigTypes';
import { aiAssistantStateManager } from '../services/aiAssistantStateManager';
import { AIAssistantMessage, AIAssistantState } from '../types/aiAssistantTypes';
import { ContextCompressionService } from '../services/ContextCompressionService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AISidePanelProps {
  isVisible: boolean;
  onClose: () => void;
  fundSymbol: string;
  fundName: string;
  valuationData?: ValuationData;
  tradeHistory?: any[]; // 用户交易历史
  fullCapacity?: number; // 基金满仓份额
  initialCapacity?: number; // 用户投资该基金的初始份额
  initialDate?: string; // 用户投资该基金的起始日期
  initialPrice?: number; // 用户投资该基金的初始价格
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

const AISidePanel: React.FC<AISidePanelProps> = ({
  isVisible,
  onClose,
  fundSymbol,
  fundName,
  valuationData,
  tradeHistory,
  fullCapacity,
  initialCapacity,
  initialDate,
  initialPrice
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasBeenInitialized, setHasBeenInitialized] = useState<boolean>(false);
  const [contextLength, setContextLength] = useState<number>(0);
  const [compressionStatus, setCompressionStatus] = useState<string>('Ready');

  // 添加一个引用以跟踪是否正在进行压缩
  const isCompressingRef = useRef(false);
  // 添加版本计数器来解决状态更新的竞争条件
  const stateVersionRef = useRef(0);
  // 添加计数器来跳过压缩后/发送消息时的状态同步，防止历史消息被错误地添加到newContent
  const skipMessagesEffectCountRef = useRef(0);
  // 添加引用来防止重复初始化
  const isInitializingRef = useRef(false);

  // 使用 ref 保存 props 的最新值，解决闭包问题
  const propsRef = useRef({
    fundName,
    fundSymbol,
    valuationData,
    tradeHistory,
    fullCapacity,
    initialCapacity,
    initialDate,
    initialPrice,
  });

  // 更新 ref 以保持最新值
  useEffect(() => {
    propsRef.current = {
      fundName,
      fundSymbol,
      valuationData,
      tradeHistory,
      fullCapacity,
      initialCapacity,
      initialDate,
      initialPrice,
    };
  }, [fundName, fundSymbol, valuationData, tradeHistory, fullCapacity, initialCapacity, initialDate, initialPrice]);

  // 初始化上下文压缩服务
  const compressionService = new ContextCompressionService();

  // 更新全局状态管理器
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<AIConfiguration | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4');
  const [isValidConfig, setIsValidConfig] = useState(hasUsableAIConfig());
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


  // Handle visibility changes and initialize when panel becomes visible for the first time today
  useEffect(() => {
    if (isVisible) {
      // Only load state from global manager when panel becomes visible, not on every render
      const currentGlobalState = aiAssistantStateManager.getState(fundSymbol);

      // 同步本地状态与全局状态
      if (currentGlobalState && currentGlobalState.hasBeenInitialized) {
        // 只有已成功初始化的状态才同步
        const messagesForDisplay = compressionService.getMessagesForDisplay(currentGlobalState);

        // 设置跳过标志，防止 messages useEffect 覆盖状态
        skipMessagesEffectCountRef.current = 1;

        setMessages(messagesForDisplay);
        setHasBeenInitialized(currentGlobalState.hasBeenInitialized);

        const contextLengthForAI = compressionService.getContextLength(currentGlobalState);
        setContextLength(contextLengthForAI);

        const needsCompression = compressionService.needsCompression(currentGlobalState);
        setCompressionStatus(needsCompression ? 'Needs Compression' : 'OK');
      } else if (!isInitializingRef.current) {
        // 只有在不正在初始化时才执行初始化
        // 清除可能存在的失败状态
        if (currentGlobalState && !currentGlobalState.hasBeenInitialized) {
          aiAssistantStateManager.clearState(fundSymbol);
        }

        const isInitializedToday = aiAssistantStateManager.isInitializedToday(fundSymbol);
        if (!isInitializedToday) {
          // 重置本地状态后初始化
          setMessages([]);
          setHasBeenInitialized(false);
          setContextLength(0);
          setCompressionStatus('Ready');
          initializeChat();
        } else {
          setMessages([]);
          setContextLength(0);
          setCompressionStatus('Ready');
        }
      }
    }
  }, [isVisible, fundSymbol]); // Only run when visibility or fund symbol changes

  // 更新全局状态管理器 - 只有当实际内容发生改变时才更新
  useEffect(() => {
    // 避免在压缩过程中执行此副作用
    if (isCompressingRef.current) {
      return;
    }

    // 避免在初始化过程中执行此副作用（初始化完成后会手动更新状态）
    if (isInitializingRef.current) {
      return;
    }

    // 如果全局状态已经标记为已初始化，且本地 messages 为空或很少，直接跳过
    // 这防止了在恢复状态时意外覆盖
    const existingState = aiAssistantStateManager.getState(fundSymbol);
    if (existingState && existingState.hasBeenInitialized && messages.length <= existingState.newContent.length) {
      return;
    }

    // 检查是否需要跳过这次状态同步（压缩后或发送消息时）
    if (skipMessagesEffectCountRef.current > 0) {
      skipMessagesEffectCountRef.current--;
      return;
    }

    // 获取当前状态来决定初始化日期 - 如果已经有初始化日期则保持不变，否则使用当前日期
    const currentState = aiAssistantStateManager.getState(fundSymbol);
    const initializationDate = currentState?.initializationDate || new Date();

    // 重要：这里需要区分历史消息和新消息
    // 我们不应该简单地将所有messages都视为newContent
    // 而是从currentState获取historyContent和newContent，只更新需要更新的部分

    // 从当前状态中获取原始的history和newContent
    const currentHistory = currentState?.historyContent || [];
    const currentNewContent = currentState?.newContent || [];

    // 只处理非初始化消息，但仍需要区分哪些是history，哪些是new
    const nonInitMessages = messages.filter(msg =>
      // 只包含最近的交互内容，过滤掉初始消息
      !['welcome', 'initial-loading'].includes(msg.id)
    ) as AIAssistantMessage[];

    // 检查当前状态是否是经过压缩的稳定状态
    // 即：summaryContent有内容，且 EITHER newContent is empty OR the only messages in newContent are from after the compression
    const isCompressedState = currentState &&
                             currentState.summaryContent &&
                             currentState.summaryContent.length > 0 &&
                             // Check if the state was recently compressed by looking at content relationships
                             ((currentState.newContent.length === 0) ||
                              // Or if newContent exists but the summary is significantly different from newContent
                              (currentState.newContent.length > 0 && currentState.summaryContent.length !== 0));

    let finalState: AIAssistantState;

    if (isCompressedState) {
      // 如果当前状态已经是压缩后的稳定状态，我们应该 keep the summary intact and only append truly new messages to newContent
      // Find messages that are not part of the existing history
      const currentHistoryIds = new Set(currentHistory.map(msg => msg.id));

      // Identify truly new messages that weren't in the history before compression
      const newMessages = nonInitMessages.filter(msg => !currentHistoryIds.has(msg.id));

      finalState = {
        historyContent: currentHistory, // 保持压缩后的历史内容
        newContent: newMessages, // 只包含真正的新消息 (those that came after compression)
        summaryContent: currentState.summaryContent, // 保持压缩后的内容
        hasBeenInitialized: currentState.hasBeenInitialized,
        lastAccessed: new Date(),
        initializationDate: currentState.initializationDate
      };
    } else {
      // 否则，按照之前的逻辑处理（非压缩状态）
      // 正确的方法：获取当前全局状态，确定当前的newContent消息ID，
      // 然后只将新的消息添加到newContent中，而不是用所有消息重新构造
      const currentNewContentIds = new Set(currentNewContent.map(msg => msg.id));

      // 将本地messages分为两部分：已存在的和新增的
      const newMessages = nonInitMessages.filter(msg => !currentNewContentIds.has(msg.id));

      // 合并当前消息和新消息
      const finalNewContent = [...currentNewContent, ...newMessages];

      finalState = {
        historyContent: currentHistory,
        newContent: finalNewContent,
        summaryContent: currentState?.summaryContent || '',
        hasBeenInitialized: currentState?.hasBeenInitialized || hasBeenInitialized,
        lastAccessed: new Date(),
        initializationDate
      };
    }

    // 获取当前版本并递增
    const currentVersion = ++stateVersionRef.current;

    // 额外检查：如果当前正在处于压缩后的稳定状态（压缩后的新消息数少于之前的总消息数），我们应更加谨慎
    const previousState = aiAssistantStateManager.getState(fundSymbol);

    // 比较关键状态 fields: 如果 summary 已经被设置且长度较大，这表明刚刚完成了压缩
    const justCompletedCompression = previousState &&
                                   previousState.summaryContent.length === 0 &&
                                   finalState.summaryContent.length > 50; // Assume compression resulted in a summary > 50 chars

    if (justCompletedCompression) {
      // Still update the UI state to match current reality
      const contextLengthForAI = compressionService.getContextLength(finalState);
      setContextLength(contextLengthForAI);

      const needsCompression = compressionService.needsCompression(finalState);
      const expectedStatus = needsCompression ? 'Needs Compression' : 'OK';
      setCompressionStatus(expectedStatus);
      return;
    }

    // 只有当实际内容发生改变时才更新状态，避免不必要的循环更新
    const newContentIds = finalState.newContent.map(m => m.id).join(',');
    const prevContentIds = previousState?.newContent.map(m => m.id).join(',') || '';
    const summaryChanged = previousState?.summaryContent !== finalState.summaryContent;

    if (
      newContentIds !== prevContentIds ||
      previousState?.hasBeenInitialized !== finalState.hasBeenInitialized ||
      summaryChanged
    ) {
      aiAssistantStateManager.setState(fundSymbol, finalState);

      // 更新上下文长度和压缩状态 - 确保使用正确的计算方法
      const contextLengthForAI = compressionService.getContextLength(finalState);
      setContextLength(contextLengthForAI);

      const needsCompression = compressionService.needsCompression(finalState);
      setCompressionStatus(needsCompression ? 'Needs Compression' : 'OK');
    } else {
      // State hasn't changed, but still update UI state to match global state
      const contextLengthForAI = compressionService.getContextLength(finalState);
      if (contextLengthForAI !== contextLength) {
        setContextLength(contextLengthForAI);
      }

      const needsCompression = compressionService.needsCompression(finalState);
      const expectedStatus = needsCompression ? 'Needs Compression' : 'OK';
      if (expectedStatus !== compressionStatus) {
        setCompressionStatus(expectedStatus);
      }
    }
  }, [messages, hasBeenInitialized, fundSymbol]); // 移除了compressionStatus依赖

  const initializeChat = async () => {
    // 防止重复初始化
    if (isInitializingRef.current) {
      return;
    }
    isInitializingRef.current = true;

    const validConfig = hasUsableAIConfig();

    // If no valid config, show welcome message without making API call
    // 不标记为已初始化，下次打开时还会重试
    if (!validConfig) {
      const newMessage: Message = {
        id: 'welcome',
        content: `欢迎使用AI投资助手！我可以为您提供关于${propsRef.current.fundName}(${propsRef.current.fundSymbol})的分析和投资建议。\n\n请先配置有效的AI服务才能开始使用。`,
        role: 'assistant',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, newMessage]);
      isInitializingRef.current = false;
      return;
    }

    // 显示等待动画
    setIsLoading(true);

    // Ensure config is loaded before attempting API call
    const currentConfig = getAIConfig();
    if (!currentConfig) {
      setIsLoading(false);
      isInitializingRef.current = false;
      const errorMessage: Message = {
        id: 'error-config',
        content: '无法加载AI配置，请检查您的设置',
        role: 'assistant',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
      return; // 不标记为已初始化，下次打开时还会重试
    }

    try {
      const context: AIQueryContext = {
        fundName: propsRef.current.fundName,
        fundSymbol: propsRef.current.fundSymbol,
        valuationData: propsRef.current.valuationData,
        tradeHistory: propsRef.current.tradeHistory,
        fullCapacity: propsRef.current.fullCapacity,
        initialCapacity: propsRef.current.initialCapacity,
        initialDate: propsRef.current.initialDate,
        initialPrice: propsRef.current.initialPrice,
      };

      const response: AIResponse = await queryAIWithTemplate(currentConfig, undefined, context);

      if (response.success) {
        const aiMessage: Message = {
          id: `ai-${Date.now()}`,
          content: response.content,
          role: 'assistant',
          timestamp: new Date()
        };

        // 设置跳过标志，防止 messages useEffect 覆盖状态
        skipMessagesEffectCountRef.current = 1;

        setMessages([aiMessage]);

        // 只有初始化成功时才标记为已初始化
        setHasBeenInitialized(true);

        // 更新全局状态管理器，标记为已初始化
        const newState: AIAssistantState = {
          historyContent: [],
          newContent: [aiMessage as AIAssistantMessage],
          summaryContent: '',
          hasBeenInitialized: true,
          lastAccessed: new Date(),
          initializationDate: new Date()
        };
        aiAssistantStateManager.setState(fundSymbol, newState);

        // 更新上下文长度
        const contextLength = compressionService.getContextLength(newState);
        setContextLength(contextLength);

        // 检查是否需要压缩
        if (compressionService.needsCompression(newState)) {
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
        // 不标记为已初始化，下次打开时还会重试
      }
    } catch (error: any) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        content: `初始化AI助手时发生错误: ${error.message || '未知错误'}`,
        role: 'assistant',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
      // 不标记为已初始化，下次打开时还会重试
    } finally {
      setIsLoading(false);
      isInitializingRef.current = false;
    }
  };

  // Function to handle user manually closing the panel
  const closePanel = () => {
    // 不重置状态，保持初始化状态以便当天内再次打开时恢复
    onClose(); // Call the parent's onClose handler to hide the panel
  };

  // Check if there's a valid active AI config
  useEffect(() => {
    const validConfig = hasUsableAIConfig();
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

    // 设置计数器，跳过用户消息和AI响应触发的messages useEffect
    // 用户消息会触发一次，AI响应会触发一次，共两次
    // 因为我们会在handleSend中手动更新全局状态
    skipMessagesEffectCountRef.current = 2;

    // 先添加用户消息到本地状态
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
        fundName: propsRef.current.fundName,
        fundSymbol: propsRef.current.fundSymbol,
        valuationData: propsRef.current.valuationData,
        tradeHistory: propsRef.current.tradeHistory,
        fullCapacity: propsRef.current.fullCapacity,
        initialCapacity: propsRef.current.initialCapacity,
        initialDate: propsRef.current.initialDate,
        initialPrice: propsRef.current.initialPrice,
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

      // 添加AI响应到消息列表
      setMessages(prev => [...prev, aiMessage]);

      // 更新全局状态管理器
      const updatedState = aiAssistantStateManager.getState(fundSymbol);

      // 创建新的状态，包含本次交互的所有消息
      // 为了避免在压缩后重复添加消息，我们需要更智能地处理状态
      let newHistoryContent = updatedState?.historyContent || [];
      let newNewContent = [...(updatedState?.newContent || [])];

      // 只有当消息不在当前状态中时才添加（防止重复）
      if (!newNewContent.some(msg => msg.id === userMessage.id)) {
        newNewContent.push(userMessage as AIAssistantMessage);
      }
      if (!newNewContent.some(msg => msg.id === aiMessage.id)) {
        newNewContent.push(aiMessage as AIAssistantMessage);
      }

      const newState: AIAssistantState = {
        historyContent: newHistoryContent,
        newContent: newNewContent,
        summaryContent: updatedState?.summaryContent || '',
        hasBeenInitialized: true,
        lastAccessed: new Date(),
        initializationDate: updatedState?.initializationDate || new Date()
      };

      // 首先更新全局状态
      aiAssistantStateManager.setState(fundSymbol, newState);

      // 检查是否需要压缩 - 注意：只有在AI回应之后才检查压缩，而不是用户提问后
      if (compressionService.needsCompression(newState)) {
        // 设置压缩状态和ref，防止其他副作用更新状态
        setCompressionStatus('Compressing...');
        isCompressingRef.current = true;

        const compressionResult = await compressionService.compressContext(newState, config);

        if (compressionResult.success && compressionResult.summary) {
          // 压缩成功，执行以下三步操作：
          // 1. 压缩当前上下文内容（summaryContent + newContent）替换原有的summaryContent
          // 2. 将当前newContent内容添加到historyContent中
          // 3. 清空现有的newContent

          const updatedHistoryContent = [...newState.historyContent, ...newState.newContent];

          const finalState: AIAssistantState = {
            historyContent: updatedHistoryContent, // 添加当前newContent到历史内容
            newContent: [], // 清空newContent
            summaryContent: compressionResult.summary, // 压缩后的内容替换原有的summaryContent
            hasBeenInitialized: newState.hasBeenInitialized,
            lastAccessed: new Date(),
            initializationDate: newState.initializationDate
          };

          // 更新全局状态 - 这必须在设置本地状态之前
          aiAssistantStateManager.setState(fundSymbol, finalState);

          // 设置计数器，跳过压缩完成后触发的messages useEffect
          // 防止历史消息被错误地添加到 newContent
          skipMessagesEffectCountRef.current = 1;

          // 更新本地状态 - 重要：重新计算所有显示内容
          const finalMessages = compressionService.getMessagesForDisplay(finalState);

          // 直接设置消息，绕过可能触发额外更新的状态管理逻辑
          setMessages(finalMessages);

          // 更新上下文长度和状态 - 在压缩完成后正确计算
          const contextLengthAfterCompression = compressionService.getContextLength(finalState);

          // 直接设置上下文长度，绕过可能触发额外更新的状态管理逻辑
          setContextLength(contextLengthAfterCompression);

          // 完成压缩，更新状态
          setCompressionStatus('Compressed');

          // 等待一会儿再重置压缩标志，确保UI更新完成
          setTimeout(() => {
            isCompressingRef.current = false;

            // 在短暂延迟后恢复为OK状态
            setCompressionStatus('OK');
          }, 3000);
        } else {
          console.error('压缩失败:', compressionResult.error);
          setCompressionStatus('Compression Failed');

          // 压缩失败时仍更新上下文长度和状态
          const contextLength = compressionService.getContextLength(newState);

          setContextLength(contextLength);
          setCompressionStatus(compressionService.needsCompression(newState) ? 'Needs Compression' : 'OK');

          // 确保失败后也重置压缩标志
          isCompressingRef.current = false;
        }
      } else {
        // 不需要压缩，只更新上下文长度和状态 - 重要：确保添加了用户消息和AI回复后的长度
        const contextLength = compressionService.getContextLength(newState);

        setContextLength(contextLength);
        setCompressionStatus(compressionService.needsCompression(newState) ? 'Needs Compression' : 'OK');
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
    const validConfig = hasUsableAIConfig();
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
          <button
            onClick={closePanel}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full"
            aria-label="关闭"
          >
            <i className="fas fa-times"></i>
          </button>
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
              <div className="markdown-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ children }) => (
                      <table className="markdown-table">{children}</table>
                    ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
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
          {/* 统一的信息栏 */}
          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
            {/* 连接状态 */}
            <div className="flex items-center justify-center text-xs">
              {isValidConfig ? (
                <span className="text-green-600">
                  <i className="fas fa-check-circle mr-1"></i>
                  已连接 {config?.model || 'gpt-4'}
                </span>
              ) : (
                <span className="text-red-500">
                  <i className="fas fa-exclamation-circle mr-1"></i>
                  未配置AI助手
                </span>
              )}
            </div>
            {/* 上下文状态 */}
            <div className="flex items-center justify-center text-xs text-gray-500">
              <span>
                上下文: {contextLength} 字符
                {compressionStatus !== 'Ready' && compressionStatus !== 'OK' && (
                  <span className={`ml-1 ${
                    compressionStatus === 'Compressing...' ? 'text-yellow-600' :
                    compressionStatus === 'Compressed' ? 'text-blue-600' :
                    compressionStatus === 'Compression Failed' ? 'text-red-500' :
                    compressionStatus === 'Needs Compression' ? 'text-orange-500' : ''
                  }`}>
                    ({compressionStatus})
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AISidePanel;