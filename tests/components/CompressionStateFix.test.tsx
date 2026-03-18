import { ContextCompressionService } from '../../services/ContextCompressionService';
import { AIAssistantState } from '../../types/aiAssistantTypes';

describe('Context Compression State Fix', () => {
  const compressionService = new ContextCompressionService(2000);

  test('should correctly identify compressed state', () => {
    // 模拟压缩后的状态
    const compressedState: AIAssistantState = {
      historyContent: [
        { id: '1', content: 'User message 1', role: 'user', timestamp: new Date() },
        { id: '2', content: 'AI response 1', role: 'assistant', timestamp: new Date() },
        { id: '3', content: 'User message 2', role: 'user', timestamp: new Date() },
        { id: '4', content: 'AI response 2', role: 'assistant', timestamp: new Date() },
      ],
      newContent: [], // 压缩后应该为空
      summaryContent: 'This is a summary of the conversation so far...',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    // 验证 getContextLength 只计算 summary + newContent
    const contextLength = compressionService.getContextLength(compressedState);
    expect(contextLength).toBeGreaterThan(0);
    expect(contextLength).toBeLessThan(100); // summary should be short

    // 验证 newContent 长度为0
    const newContentLength = compressionService.serializeMessages(compressedState.newContent).length;
    expect(newContentLength).toBe(0);

    // 验证 summary 长度不为0
    expect(compressedState.summaryContent.length).toBeGreaterThan(0);
  });

  test('should correctly calculate context length for uncompressed state', () => {
    // 模拟未压缩的状态
    const uncompressedState: AIAssistantState = {
      historyContent: [],
      newContent: [
        { id: '1', content: 'User message 1', role: 'user', timestamp: new Date() },
        { id: '2', content: 'AI response 1', role: 'assistant', timestamp: new Date() },
      ],
      summaryContent: '',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    // 验证 getContextLength 计算 newContent
    const contextLength = compressionService.getContextLength(uncompressedState);
    expect(contextLength).toBeGreaterThan(0);

    // 验证 newContent 长度
    const newContentLength = compressionService.serializeMessages(uncompressedState.newContent).length;
    expect(newContentLength).toBeGreaterThan(0);

    // 验证 summary 长度为0
    expect(uncompressedState.summaryContent.length).toBe(0);
  });

  test('should correctly calculate context length after adding new messages to compressed state', () => {
    // 模拟压缩后添加新消息的状态
    const stateWithNewMessages: AIAssistantState = {
      historyContent: [
        { id: '1', content: 'User message 1', role: 'user', timestamp: new Date() },
        { id: '2', content: 'AI response 1', role: 'assistant', timestamp: new Date() },
      ],
      newContent: [
        { id: '3', content: 'New user message', role: 'user', timestamp: new Date() },
        { id: '4', content: 'New AI response', role: 'assistant', timestamp: new Date() },
      ],
      summaryContent: 'Summary of previous conversation...',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    // 验证 getContextLength 计算 summary + newContent
    const contextLength = compressionService.getContextLength(stateWithNewMessages);
    expect(contextLength).toBeGreaterThan(0);

    // 验证 summary 长度不为0
    expect(stateWithNewMessages.summaryContent.length).toBeGreaterThan(0);

    // 验证 newContent 长度不为0
    const newContentLength = compressionService.serializeMessages(stateWithNewMessages.newContent).length;
    expect(newContentLength).toBeGreaterThan(0);
  });

  test('should not include historyContent in context calculation', () => {
    // 创建两个状态，historyContent 不同但 summary 和 newContent 相同
    const state1: AIAssistantState = {
      historyContent: [
        { id: '1', content: 'User message 1', role: 'user', timestamp: new Date() },
      ],
      newContent: [],
      summaryContent: 'Same summary',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    const state2: AIAssistantState = {
      historyContent: [
        { id: '1', content: 'User message 1', role: 'user', timestamp: new Date() },
        { id: '2', content: 'AI response 1', role: 'assistant', timestamp: new Date() },
        { id: '3', content: 'User message 2', role: 'user', timestamp: new Date() },
      ],
      newContent: [],
      summaryContent: 'Same summary',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    // 验证两个状态的 context length 相同
    const contextLength1 = compressionService.getContextLength(state1);
    const contextLength2 = compressionService.getContextLength(state2);
    expect(contextLength1).toBe(contextLength2);
  });
});