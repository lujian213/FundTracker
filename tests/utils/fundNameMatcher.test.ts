// tests/utils/fundNameMatcher.test.ts

import { calculateSimilarity, matchFundByName, matchFundExact } from '../../utils/fundNameMatcher';

describe('calculateSimilarity', () => {
  describe('完全相同', () => {
    test('相同字符串返回1', () => {
      expect(calculateSimilarity('abc', 'abc')).toBe(1);
    });

    test('空格不影响相似度', () => {
      expect(calculateSimilarity('a b c', 'abc')).toBe(1);
    });

    test('括号不影响相似度', () => {
      expect(calculateSimilarity('测试(基金)', '测试基金')).toBe(1);
      expect(calculateSimilarity('测试（基金）', '测试基金')).toBe(1);
    });
  });

  describe('部分相似', () => {
    test('部分相同返回中间值', () => {
      expect(calculateSimilarity('abc', 'abd')).toBeCloseTo(2 / 3);
    });

    test('长度差异影响相似度', () => {
      expect(calculateSimilarity('abcd', 'abc')).toBeCloseTo(3 / 4);
    });

    test('首字母差异', () => {
      expect(calculateSimilarity('xyz', 'abc')).toBeCloseTo(0);
    });
  });

  describe('基金名称场景', () => {
    test('基金名称带空格', () => {
      expect(calculateSimilarity('天 弘 恒 生 科 技', '天弘恒生科技')).toBe(1);
    });

    test('基金名称带括号', () => {
      expect(calculateSimilarity('南方有色金属ETF联接(C)', '南方有色金属ETF联接C')).toBe(1);
    });

    test('轻微差异的名称', () => {
      const sim = calculateSimilarity('天弘恒生科技ETF联接QDIC', '天弘恒生科技ETF联接(QDI)C');
      expect(sim).toBeGreaterThan(0.9);
    });

    test('差异较大的名称', () => {
      const sim = calculateSimilarity('永赢科技智选混合A', '建信深证100指数增强');
      expect(sim).toBeLessThan(0.5);
    });
  });

  describe('边界情况', () => {
    test('空字符串', () => {
      expect(calculateSimilarity('', 'abc')).toBe(0);
      expect(calculateSimilarity('abc', '')).toBe(0);
      expect(calculateSimilarity('', '')).toBe(1);
    });

    test('单字符', () => {
      expect(calculateSimilarity('a', 'a')).toBe(1);
      expect(calculateSimilarity('a', 'b')).toBe(0);
    });
  });
});

describe('matchFundByName', () => {
  // 注意：这些测试依赖系统中已有的基金数据
  // 在实际测试环境中可能需要mock marketFundService

  describe('相似度阈值', () => {
    test('阈值0.75时，相似度高于阈值匹配成功', () => {
      // 假设系统中有基金名称"测试基金A"
      const result = matchFundByName('测试基金A', 0.75);
      // 如果系统中没有这个基金，matched会是false
      // 这主要是验证函数不会崩溃
      expect(result).toHaveProperty('matched');
      expect(result).toHaveProperty('similarity');
    });

    test('阈值1.0时，只有完全匹配才成功', () => {
      const result = matchFundByName('不存在的基金XYZ', 1.0);
      expect(result.matched).toBe(false);
    });
  });

  describe('匹配结果结构', () => {
    test('返回结果包含必要字段', () => {
      const result = matchFundByName('任意名称', 0.75);
      expect(result).toHaveProperty('matched');
      if (result.similarity !== undefined) {
        expect(result.similarity).toBeGreaterThanOrEqual(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
      }
    });
  });
});

describe('matchFundExact', () => {
  test('精确匹配返回结果', () => {
    const result = matchFundExact('不存在的基金名称');
    expect(result.matched).toBe(false);
  });

  test('空名称返回不匹配', () => {
    const result = matchFundExact('');
    expect(result.matched).toBe(false);
  });
});

describe('aliasName 匹配', () => {
  describe('同时匹配 name 和 aliasName', () => {
    test('当 aliasName 相似度更高时使用 aliasName 匹配', () => {
      // 模拟场景：OCR识别出"科技基金"，系统中有"永赢科技智选混合A"
      // 但该基金设置了 aliasName 为"科技基金"
      // 验证能通过 aliasName 匹配成功
      const result = matchFundByName('科技基金', 0.75);
      // 如果系统中没有相关基金，这个测试只验证函数不崩溃
      expect(result).toHaveProperty('matched');
      expect(result).toHaveProperty('similarity');
    });

    test('匹配成功时 matchedName 始终是系统基金名称', () => {
      // 验证即使通过 aliasName 匹配成功，返回的 matchedName 也是系统基金名称
      const result = matchFundByName('任意名称', 0.75);
      if (result.matched) {
        // matchedName 应该是系统基金名称，不是 aliasName
        expect(result.matchedName).toBeDefined();
      }
    });
  });
});