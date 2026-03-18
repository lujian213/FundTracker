import { ContextCompressionService } from '../../services/ContextCompressionService';
import { AIAssistantState } from '../../types/aiAssistantTypes';

describe('ContextCompressionService After Fix Verification', () => {
  let compressionService: ContextCompressionService;

  beforeEach(() => {
    // 使用较小的阈值进行测试
    compressionService = new ContextCompressionService(500); // 500字符阈值
  });

  test('should correctly calculate context length considering only summaryContent and newContent', () => {
    const state: AIAssistantState = {
      historyContent: [
        { id: 'hist1', content: '历史消息1 - 这是一条较长的历史消息内容', role: 'user', timestamp: new Date() },
        { id: 'hist2', content: '历史消息2 - 另一条历史消息', role: 'assistant', timestamp: new Date() }
      ],
      newContent: [
        { id: 'new1', content: '新消息1 - 这是新的用户消息', role: 'user', timestamp: new Date() },
        { id: 'new2', content: '新消息2 - 这是新的AI回复', role: 'assistant', timestamp: new Date() }
      ],
      summaryContent: '这是摘要内容 - 用于压缩后保留的关键信息',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    // 获取用于AI交互的上下文（应该是摘要+新内容）
    const contextForAI = compressionService.getContextForAI(state);

    // 计算上下文长度（应该是摘要+新内容的长度）
    const calculatedLength = compressionService.getContextLength(state);

    // 手动计算期望长度
    const expectedContext = `[摘要] ${state.summaryContent}\n\n[${state.newContent[0].role.toUpperCase()}] ${state.newContent[0].content}\n\n[${state.newContent[1].role.toUpperCase()}] ${state.newContent[1].content}`;
    const expectedLength = expectedContext.length;

    expect(calculatedLength).toBe(expectedLength);
    expect(contextForAI).toBe(expectedContext);

    // 确认历史内容不包含在用于AI交互的上下文中
    expect(contextForAI).not.toContain('历史消息1');
    expect(contextForAI).not.toContain('历史消息2');
  });

  test('should correctly identify when compression is needed based on summaryContent + newContent', () => {
    // 创建一个不会触发压缩的状态（内容较短）
    const shortState: AIAssistantState = {
      historyContent: [{ id: 'hist', content: 'Some history content', role: 'user', timestamp: new Date() }],
      newContent: [{ id: 'new', content: 'Short message', role: 'user', timestamp: new Date() }],
      summaryContent: 'Short summary',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    // 使用较高阈值，短内容不应触发压缩
    const highThresholdService = new ContextCompressionService(1000);
    expect(highThresholdService.needsCompression(shortState)).toBe(false);

    // 创建一个会触发压缩的状态（内容较长）
    const longState: AIAssistantState = {
      historyContent: [{ id: 'hist', content: 'Some history content', role: 'user', timestamp: new Date() }],
      newContent: [{ id: 'new', content: 'This is a very long message that exceeds the threshold significantly. It contains lots of text to push the context length over the limit. Adding more content here to ensure we exceed the compression threshold. Including additional phrases and sentences. More text to increase character count. Additional content for testing purposes. More words to make the message longer. Even more text to push towards the threshold.', role: 'user', timestamp: new Date() }],
      summaryContent: 'This is a long summary content that also contributes to the total context length significantly. It contains substantial information that needs to be preserved during compression. More text to increase the summary length.',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    // 使用较低阈值，长内容应触发压缩
    const lowThresholdService = new ContextCompressionService(500);
    expect(lowThresholdService.needsCompression(longState)).toBe(true);
  });

  test('should properly handle state after compression (summary populated, newContent cleared)', () => {
    // 模拟压缩后的状态：摘要被填充，新内容被清空
    const postCompressionState: AIAssistantState = {
      historyContent: [
        { id: 'hist1', content: '原始消息1', role: 'user', timestamp: new Date() },
        { id: 'hist2', content: '原始消息2', role: 'assistant', timestamp: new Date() }
      ],
      newContent: [], // 压缩后新内容应该为空
      summaryContent: '这是压缩后生成的摘要，包含了之前对话的关键信息和要点',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    // 验证压缩后的上下文长度计算
    const contextLength = compressionService.getContextLength(postCompressionState);
    const contextForAI = compressionService.getContextForAI(postCompressionState);

    // 计算预期长度：[摘要] + 摘要内容 + 换行符
    const expectedContext = `[摘要] ${postCompressionState.summaryContent}\n\n`;
    const expectedLength = expectedContext.length;

    expect(contextLength).toBe(expectedLength);
    expect(contextForAI).toBe(expectedContext);

    // 验证长度小于阈值（因为刚刚经过压缩）
    expect(compressionService.needsCompression(postCompressionState)).toBe(false);
  });

  test('should correctly serialize messages for context calculation', () => {
    const messages = [
      { id: 'msg1', content: '用户消息内容', role: 'user', timestamp: new Date() },
      { id: 'msg2', content: 'AI回复内容', role: 'assistant', timestamp: new Date() }
    ];

    const serialized = compressionService.serializeMessages(messages);

    expect(serialized).toBe('[USER] 用户消息内容\n\n[ASSISTANT] AI回复内容');
  });

  test('should handle edge case where summaryContent is empty', () => {
    const state: AIAssistantState = {
      historyContent: [{ id: 'hist', content: '历史内容', role: 'user', timestamp: new Date() }],
      newContent: [{ id: 'new', content: '新内容', role: 'user', timestamp: new Date() }],
      summaryContent: '', // 空摘要
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    const contextForAI = compressionService.getContextForAI(state);
    const contextLength = compressionService.getContextLength(state);

    // 应该只包含新内容，没有摘要部分
    const expectedContext = '[USER] 新内容';
    expect(contextForAI).toBe(expectedContext);
    expect(contextLength).toBe(expectedContext.length);
  });
});