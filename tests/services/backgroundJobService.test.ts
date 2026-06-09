import {
  loadBackgroundJobPrompts,
  getBackgroundJobPromptByType
} from '../../services/backgroundJobService';
import * as promptTemplateService from '../../services/promptTemplateService';

// Mock fetch for template loading
global.fetch = jest.fn();

describe('backgroundJobService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    promptTemplateService.resetCache();
  });

  describe('loadBackgroundJobPrompts', () => {
    test('loads prompts from promptTemplateService', async () => {
      // Mock the template loading
      const mockTemplate = {
        templates: [
          { id: 'bg-strategy', name: '推荐交易策略', template: 'test template' }
        ]
      };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('background-job-prompts')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTemplate)
          });
        }
        // Return empty templates for other config files
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ templates: [] })
        });
      });

      await promptTemplateService.loadAllTemplates();
      const result = loadBackgroundJobPrompts();

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.find(p => p.type === 'strategy')).toBeDefined();
    });

    test('getBackgroundJobPromptByType returns correct prompt', async () => {
      const mockTemplate = {
        templates: [
          { id: 'bg-strategy', name: '推荐交易策略', template: 'test template' }
        ]
      };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('background-job-prompts')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTemplate)
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ templates: [] })
        });
      });

      await promptTemplateService.loadAllTemplates();
      const result = getBackgroundJobPromptByType('strategy');

      expect(result).not.toBeNull();
      expect(result?.type).toBe('strategy');
    });

    test('getBackgroundJobPromptByType returns null for unknown type', () => {
      const result = getBackgroundJobPromptByType('unknown_type' as any);
      expect(result).toBeNull();
    });
  });

  describe('template maxTokens configuration', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      promptTemplateService.resetCache();
    });

    test('bg-calendar templates have maxTokens configured', async () => {
      const mockTemplate = {
        templates: [
          {
            id: 'bg-calendar-holiday-china',
            name: 'Calendar A股节假日信息',
            template: 'test template',
            maxTokens: 8000,
            temperature: 0
          }
        ]
      };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('background-job-prompts')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTemplate)
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ templates: [] })
        });
      });

      await promptTemplateService.loadAllTemplates();
      const template = promptTemplateService.getById('bg-calendar-holiday-china');

      expect(template).not.toBeNull();
      expect(template?.maxTokens).toBe(8000);
      expect(template?.temperature).toBe(0);
    });

    test('bg-strategy template can have maxTokens configured', async () => {
      const mockTemplate = {
        templates: [
          {
            id: 'bg-strategy',
            name: '推荐交易策略',
            template: 'test template',
            maxTokens: 4000
          }
        ]
      };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('background-job-prompts')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTemplate)
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ templates: [] })
        });
      });

      await promptTemplateService.loadAllTemplates();
      const prompt = getBackgroundJobPromptByType('strategy');

      expect(prompt).not.toBeNull();
      expect(prompt?.maxTokens).toBe(4000);
    });
  });
});