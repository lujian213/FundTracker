import { ContextCompressionService } from '../../services/ContextCompressionService';
import { AIAssistantMessage } from '../../types/aiAssistantTypes';

describe('ContextCompressionService', () => {
  let compressionService: ContextCompressionService;

  beforeEach(() => {
    compressionService = new ContextCompressionService(100); // 设置一个小的阈值用于测试
  });

  describe('serializeMessages', () => {
    it('should correctly serialize messages to string', () => {
      const messages: AIAssistantMessage[] = [
        {
          id: '1',
          content: 'Hello',
          role: 'user',
          timestamp: new Date()
        },
        {
          id: '2',
          content: 'Hi there',
          role: 'assistant',
          timestamp: new Date()
        }
      ];

      const result = compressionService.serializeMessages(messages);
      expect(result).toBe('[USER] Hello\n\n[ASSISTANT] Hi there');
    });
  });

  describe('needsCompression', () => {
    it('should return true when new content exceeds threshold', () => {
      const state = {
        historyContent: [],
        newContent: [
          { id: '1', content: 'A'.repeat(101), role: 'user', timestamp: new Date() }
        ],
        summaryContent: '',
        hasBeenInitialized: true,
        lastAccessed: new Date(),
        initializationDate: new Date()
      };

      expect(compressionService.needsCompression(state)).toBe(true);
    });

    it('should return false when new content is below threshold', () => {
      const state = {
        historyContent: [],
        newContent: [
          { id: '1', content: 'Short message', role: 'user', timestamp: new Date() }
        ],
        summaryContent: '',
        hasBeenInitialized: true,
        lastAccessed: new Date(),
        initializationDate: new Date()
      };

      expect(compressionService.needsCompression(state)).toBe(false);
    });
  });

  describe('getMessagesForDisplay', () => {
    it('should return concatenated messages for display', () => {
      const state = {
        historyContent: [
          { id: '1', content: 'Old message', role: 'user', timestamp: new Date() }
        ],
        newContent: [
          { id: '2', content: 'New message', role: 'assistant', timestamp: new Date() }
        ],
        summaryContent: 'Summary',
        hasBeenInitialized: true,
        lastAccessed: new Date(),
        initializationDate: new Date()
      };

      const messages = compressionService.getMessagesForDisplay(state);
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Old message');
      expect(messages[1].content).toBe('New message');
    });
  });

  describe('getContextForAI', () => {
    it('should return context combining summary and new content', () => {
      const state = {
        historyContent: [
          { id: '1', content: 'Old message', role: 'user', timestamp: new Date() }
        ],
        newContent: [
          { id: '2', content: 'New message', role: 'assistant', timestamp: new Date() }
        ],
        summaryContent: 'This is a summary',
        hasBeenInitialized: true,
        lastAccessed: new Date(),
        initializationDate: new Date()
      };

      const context = compressionService.getContextForAI(state);

      expect(context).toContain('This is a summary');
      expect(context).toContain('New message');
      expect(context).toContain('[ASSISTANT] New message');
    });

    it('should return only new content if summary is empty', () => {
      const state = {
        historyContent: [],
        newContent: [
          { id: '1', content: 'New message', role: 'user', timestamp: new Date() }
        ],
        summaryContent: '',
        hasBeenInitialized: true,
        lastAccessed: new Date(),
        initializationDate: new Date()
      };

      const context = compressionService.getContextForAI(state);
      expect(context).toBe('[USER] New message');
    });
  });

  describe('getContextLength', () => {
    it('should return the length of the combined context', () => {
      const state = {
        historyContent: [],
        newContent: [
          { id: '1', content: 'Hello', role: 'user', timestamp: new Date() },
          { id: '2', content: 'World', role: 'assistant', timestamp: new Date() }
        ],
        summaryContent: 'Summary',
        hasBeenInitialized: true,
        lastAccessed: new Date(),
        initializationDate: new Date()
      };

      const length = compressionService.getContextLength(state);
      const expectedContext = compressionService.getContextForAI(state);
      expect(length).toBe(expectedContext.length);
    });
  });

  describe('getNewContentLength', () => {
    it('should return the length of new content only', () => {
      const state = {
        historyContent: [],
        newContent: [
          { id: '1', content: 'Hello', role: 'user', timestamp: new Date() },
          { id: '2', content: 'World', role: 'assistant', timestamp: new Date() }
        ],
        summaryContent: 'Summary',
        hasBeenInitialized: true,
        lastAccessed: new Date(),
        initializationDate: new Date()
      };

      const length = compressionService.getNewContentLength(state);
      // "[USER] Hello\n\n[ASSISTANT] World" 的长度
      expect(length).toBe('[USER] Hello\n\n[ASSISTANT] World'.length);
    });
  });
});