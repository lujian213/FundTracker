import { validateQuestions, applyTemplateVariables } from '../../services/commonQuestionsService';
import { AIQueryContext } from '../../services/aiService';

describe('commonQuestionsService', () => {
  describe('validateQuestions', () => {
    test('should return empty array for invalid data', () => {
      expect(validateQuestions(null)).toEqual([]);
      expect(validateQuestions(undefined)).toEqual([]);
      expect(validateQuestions({})).toEqual([]);
      expect(validateQuestions({ questions: 'invalid' })).toEqual([]);
    });

    test('should filter valid questions', () => {
      const data = {
        questions: [
          { id: '1', name: 'Question 1', template: 'Template 1' },
          { id: '2', name: 'Question 2', template: 'Template 2', enabled: true },
          { id: '3', name: 'Question 3', template: 'Template 3', enabled: false },
          { id: 123, name: 'Invalid', template: 'Invalid' } as unknown as { id: string; name: string; template: string }, // invalid id type
        ]
      };

      const result = validateQuestions(data);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
      expect(result[2].id).toBe('3');
    });

    test('should return empty array for missing required fields', () => {
      const data = {
        questions: [
          { id: '1' } as unknown as { id: string; name: string; template: string }, // missing name and template
          { id: '2', name: 'Test' } as unknown as { id: string; name: string; template: string }, // missing template
          { id: '3', template: 'Test' } as unknown as { id: string; name: string; template: string }, // missing name
        ]
      };

      expect(validateQuestions(data)).toEqual([]);
    });

    test('should accept questions with enabled undefined', () => {
      const data = {
        questions: [
          { id: '1', name: 'Question 1', template: 'Template 1' } // enabled is undefined
        ]
      };

      const result = validateQuestions(data);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(result[0].enabled).toBeUndefined();
    });

    test('should accept questions with enabled boolean', () => {
      const data = {
        questions: [
          { id: '1', name: 'Question 1', template: 'Template 1', enabled: true },
          { id: '2', name: 'Question 2', template: 'Template 2', enabled: false }
        ]
      };

      const result = validateQuestions(data);
      expect(result).toHaveLength(2);
      expect(result[0].enabled).toBe(true);
      expect(result[1].enabled).toBe(false);
    });

    test('should reject questions with invalid enabled type', () => {
      const data = {
        questions: [
          { id: '1', name: 'Question 1', template: 'Template 1', enabled: 'yes' } as unknown as { id: string; name: string; template: string }
        ]
      };

      const result = validateQuestions(data);
      expect(result).toHaveLength(0);
    });

    test('should handle empty questions array', () => {
      expect(validateQuestions({ questions: [] })).toEqual([]);
    });
  });

  describe('applyTemplateVariables', () => {
    test('should replace template variables with context values', () => {
      const template = '基金名称: {name}, 代码: {code}';
      const context: AIQueryContext = {
        fundName: '测试基金',
        fundSymbol: 'TEST001'
      };

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('基金名称: 测试基金, 代码: TEST001');
    });

    test('should replace "未设置" for missing fullCapacity and initialCapacity values', () => {
      const template = '满仓: {fullCapacity}, 初始份额: {initialCapacity}';
      const context: AIQueryContext = {};

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('满仓: 未设置, 初始份额: 未设置');
    });

    test('should replace fullCapacity with actual value when set', () => {
      const template = '满仓: {fullCapacity}';
      const context: AIQueryContext = {
        fullCapacity: 10000
      };

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('满仓: 10000');
    });

    test('should show "未设置" for fullCapacity when value is 0', () => {
      const template = '满仓: {fullCapacity}';
      const context: AIQueryContext = {
        fullCapacity: 0
      };

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('满仓: 未设置');
    });

    test('should replace initialCapacity with actual value when set', () => {
      const template = '初始份额: {initialCapacity}';
      const context: AIQueryContext = {
        initialCapacity: 5000
      };

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('初始份额: 5000');
    });

    test('should show "未设置" for initialCapacity when value is 0', () => {
      const template = '初始份额: {initialCapacity}';
      const context: AIQueryContext = {
        initialCapacity: 0
      };

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('初始份额: 未设置');
    });

    test('should handle trade history', () => {
      const template = '交易历史: {history}';
      const context: AIQueryContext = {
        tradeHistory: [{ date: '2023-01-01', amount: 100 }]
      };

      const result = applyTemplateVariables(template, context);
      expect(result).toContain('2023-01-01');
      expect(result).toContain('100');
    });

    test('should show empty array for missing trade history', () => {
      const template = '交易历史: {history}';
      const context: AIQueryContext = {};

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('交易历史: []');
    });

    test('should replace initialDate with actual value', () => {
      const template = '初始日期: {initialDate}';
      const context: AIQueryContext = {
        initialDate: '2023-01-01'
      };

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('初始日期: 2023-01-01');
    });

    test('should show "未设置" for missing initialDate', () => {
      const template = '初始日期: {initialDate}';
      const context: AIQueryContext = {};

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('初始日期: 未设置');
    });

    test('should show "未设置" for empty string initialDate', () => {
      const template = '初始日期: {initialDate}';
      const context: AIQueryContext = {
        initialDate: ''
      };

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('初始日期: 未设置');
    });

    test('should replace initialPrice with actual value', () => {
      const template = '初始价格: {initialPrice}';
      const context: AIQueryContext = {
        initialPrice: 1.2345
      };

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('初始价格: 1.2345');
    });

    test('should show "未设置" for missing initialPrice', () => {
      const template = '初始价格: {initialPrice}';
      const context: AIQueryContext = {};

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('初始价格: 未设置');
    });

    test('should handle multiple template variables at once', () => {
      const template = '基金: {name} ({code}), 满仓: {fullCapacity}, 初始份额: {initialCapacity}';
      const context: AIQueryContext = {
        fundName: '测试基金',
        fundSymbol: 'TEST001',
        fullCapacity: 10000,
        initialCapacity: 5000
      };

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('基金: 测试基金 (TEST001), 满仓: 10000, 初始份额: 5000');
    });

    test('should preserve template without variables', () => {
      const template = '这是一段普通文本，没有变量';
      const context: AIQueryContext = {};

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('这是一段普通文本，没有变量');
    });

    test('should handle repeated variables', () => {
      const template = '基金名称: {name}, 再次: {name}';
      const context: AIQueryContext = {
        fundName: '测试基金'
      };

      const result = applyTemplateVariables(template, context);
      expect(result).toBe('基金名称: 测试基金, 再次: 测试基金');
    });
  });
});