// tests/utils/jsonParseUtils.test.ts
import {
  parseAIJsonResponse,
  extractJsonFromMarkdown,
  removeJsComments,
  removeTrailingCommas,
  fixUnquotedPropertyNames,
  fixUnquotedStringValues,
  isJsonTruncated,
  logJsonParseError,
} from '../../utils/jsonParseUtils';

describe('jsonParseUtils', () => {
  describe('extractJsonFromMarkdown', () => {
    test('extracts JSON from ```json code block', () => {
      const input = '```json\n{"key": "value"}\n```';
      expect(extractJsonFromMarkdown(input)).toBe('{"key": "value"}');
    });

    test('extracts JSON from ``` code block without json label', () => {
      const input = '```\n{"key": "value"}\n```';
      expect(extractJsonFromMarkdown(input)).toBe('{"key": "value"}');
    });

    test('returns unchanged string without code block', () => {
      const input = '{"key": "value"}';
      expect(extractJsonFromMarkdown(input)).toBe('{"key": "value"}');
    });

    test('handles empty input', () => {
      expect(extractJsonFromMarkdown('')).toBe('');
    });
  });

  describe('removeJsComments', () => {
    test('removes single-line comments', () => {
      const input = '{"key": "value" // comment\n}';
      expect(removeJsComments(input)).toBe('{"key": "value" \n}');
    });

    test('removes multi-line comments', () => {
      const input = '{"key": /* comment */ "value"}';
      expect(removeJsComments(input)).toBe('{"key":  "value"}');
    });

    test('does not affect JSON without comments', () => {
      const input = '{"key": "value"}';
      expect(removeJsComments(input)).toBe('{"key": "value"}');
    });
  });

  describe('removeTrailingCommas', () => {
    test('removes trailing comma in object', () => {
      const input = '{"key": "value",}';
      expect(removeTrailingCommas(input)).toBe('{"key": "value"}');
    });

    test('removes trailing comma in array', () => {
      const input = '[1, 2, 3,]';
      expect(removeTrailingCommas(input)).toBe('[1, 2, 3]');
    });

    test('does not affect valid JSON', () => {
      const input = '{"key": "value"}';
      expect(removeTrailingCommas(input)).toBe('{"key": "value"}');
    });
  });

  describe('fixUnquotedPropertyNames', () => {
    test('adds quotes to unquoted property names', () => {
      const input = '{key: "value"}';
      expect(fixUnquotedPropertyNames(input)).toBe('{"key": "value"}');
    });

    test('does not affect quoted property names', () => {
      const input = '{"key": "value"}';
      expect(fixUnquotedPropertyNames(input)).toBe('{"key": "value"}');
    });

    test('handles multiple properties', () => {
      const input = '{key: "value", name: "test"}';
      expect(fixUnquotedPropertyNames(input)).toBe('{"key": "value", "name": "test"}');
    });
  });

  describe('fixUnquotedStringValues', () => {
    test('adds quotes to unquoted string values', () => {
      const input = '{"market":美股}';
      expect(fixUnquotedStringValues(input, ['market'])).toBe('{"market":"美股"}');
    });

    test('does not affect quoted values', () => {
      const input = '{"market": "美股"}';
      expect(fixUnquotedStringValues(input, ['market'])).toBe('{"market": "美股"}');
    });

    test('handles multiple properties', () => {
      const input = '{"market":美股, "content":休市}';
      expect(fixUnquotedStringValues(input, ['market', 'content']))
        .toBe('{"market":"美股", "content":"休市"}');
    });
  });

  describe('isJsonTruncated', () => {
    test('returns true for truncated array', () => {
      expect(isJsonTruncated('[1, 2, 3')).toBe(true);
    });

    test('returns true for truncated object', () => {
      expect(isJsonTruncated('{"key": "value"')).toBe(true);
    });

    test('returns false for complete array', () => {
      expect(isJsonTruncated('[1, 2, 3]')).toBe(false);
    });

    test('returns false for complete object', () => {
      expect(isJsonTruncated('{"key": "value"}')).toBe(false);
    });
  });

  describe('parseAIJsonResponse', () => {
    test('parses valid JSON array', () => {
      const input = '[{"key": "value"}]';
      const result = parseAIJsonResponse(input, {
        logPrefix: 'Test',
        errorContext: '测试',
      });
      expect(result).toEqual([{ key: 'value' }]);
    });

    test('parses JSON from markdown code block', () => {
      const input = '```json\n[{"key": "value"}]\n```';
      const result = parseAIJsonResponse(input, {
        logPrefix: 'Test',
        errorContext: '测试',
      });
      expect(result).toEqual([{ key: 'value' }]);
    });

    test('throws on empty response', () => {
      expect(() => parseAIJsonResponse('', {
        logPrefix: 'Test',
        errorContext: '测试',
      })).toThrow('解析测试失败: 响应为空');
    });

    test('throws on invalid JSON', () => {
      expect(() => parseAIJsonResponse('not json', {
        logPrefix: 'Test',
        errorContext: '测试',
      })).toThrow('解析测试失败: JSON解析错误');
    });

    test('throws on non-array response', () => {
      expect(() => parseAIJsonResponse('{"key": "value"}', {
        logPrefix: 'Test',
        errorContext: '测试',
      })).toThrow('解析测试失败: AI返回的不是数组格式');
    });

    test('removes trailing commas by default', () => {
      const input = '[{"key": "value"},]';
      const result = parseAIJsonResponse(input, {
        logPrefix: 'Test',
        errorContext: '测试',
      });
      expect(result).toEqual([{ key: 'value' }]);
    });

    test('removes comments when enabled', () => {
      const input = '```json\n[{"key": "value" // comment\n}]\n```';
      const result = parseAIJsonResponse(input, {
        logPrefix: 'Test',
        errorContext: '测试',
        removeComments: true,
      });
      expect(result).toEqual([{ key: 'value' }]);
    });

    test('fixes unquoted property names when enabled', () => {
      const input = '[{key: "value"}]';
      const result = parseAIJsonResponse(input, {
        logPrefix: 'Test',
        errorContext: '测试',
        fixUnquotedProps: true,
      });
      expect(result).toEqual([{ key: 'value' }]);
    });

    test('fixes unquoted string values when enabled', () => {
      const input = '[{"market":美股}]';
      const result = parseAIJsonResponse(input, {
        logPrefix: 'Test',
        errorContext: '测试',
        fixUnquotedValues: true,
        valuePropsToFix: ['market'],
      });
      expect(result).toEqual([{ market: '美股' }]);
    });
  });

  describe('logJsonParseError', () => {
    test('logs error details', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Unexpected token');
      const response = '{"key": "value"';

      logJsonParseError('Test', error, response);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('JSON解析失败'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('响应末尾100字符'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('响应总长度'));
      consoleSpy.mockRestore();
    });

    test('logs truncation hint when truncated', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Unexpected token');
      const response = '{"key": "value"';

      logJsonParseError('Test', error, response, true);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('截断问题'));
      consoleSpy.mockRestore();
    });

    test('does not log truncation hint when complete', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Unexpected token');
      const response = '{"key": "value"}';

      logJsonParseError('Test', error, response, true);

      // Should not log truncation hint
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('截断问题'));
      consoleSpy.mockRestore();
    });
  });
});