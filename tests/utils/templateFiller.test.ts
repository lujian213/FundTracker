import { fillTemplate, FillTemplateResult, TemplateContext } from '../../utils/templateFiller';

describe('fillTemplate', () => {
  test('should fill all placeholders successfully', () => {
    const template = '搜索{fundName}({fundSymbol}){today}相关新闻';
    const context: TemplateContext = {
      fundName: '华夏沪深300ETF',
      fundSymbol: '510300',
      today: '2026-05-15'
    };

    const result = fillTemplate(template, context);

    expect(result.success).toBe(true);
    expect(result.content).toBe('搜索华夏沪深300ETF(510300)2026-05-15相关新闻');
    expect(result.missingPlaceholders).toBeUndefined();
  });

  test('should detect missing placeholders', () => {
    const template = '搜索{fundName}({fundSymbol}){today}相关新闻';
    const context: TemplateContext = {
      fundName: '华夏沪深300ETF',
      // fundSymbol 和 today 缺失
    };

    const result = fillTemplate(template, context);

    expect(result.success).toBe(false);
    expect(result.missingPlaceholders).toEqual(['fundSymbol', 'today']);
    expect(result.error).toContain('fundSymbol');
    expect(result.error).toContain('today');
  });

  test('should handle duplicate placeholders', () => {
    const template = '{fundName} - {fundName} - {fundName}';
    const context: TemplateContext = {
      fundName: '测试基金'
    };

    const result = fillTemplate(template, context);

    expect(result.success).toBe(true);
    expect(result.content).toBe('测试基金 - 测试基金 - 测试基金');
  });

  test('should handle no placeholders', () => {
    const template = '这是一段没有占位符的文本';
    const context: TemplateContext = {};

    const result = fillTemplate(template, context);

    expect(result.success).toBe(true);
    expect(result.content).toBe(template);
  });

  test('should handle number values', () => {
    const template = '数值: {count}';
    const context: TemplateContext = {
      count: 42
    };

    const result = fillTemplate(template, context);

    expect(result.success).toBe(true);
    expect(result.content).toBe('数值: 42');
  });

  test('should handle object values (converted to string)', () => {
    const template = '数据: {data}';
    const context: TemplateContext = {
      data: { key: 'value' }
    };

    const result = fillTemplate(template, context);

    expect(result.success).toBe(true);
    expect(result.content).toContain('key');
    expect(result.content).toContain('value');
  });

  test('should treat null as missing', () => {
    const template = '值: {value}';
    const context: TemplateContext = {
      value: null as any
    };

    const result = fillTemplate(template, context);

    expect(result.success).toBe(false);
    expect(result.missingPlaceholders).toEqual(['value']);
  });

  test('should handle placeholder names with regex special characters', () => {
    // 占位符名称包含正则特殊字符（如 . * + ? 等）时，应正确转义
    const template = '基金名称: {fund.name}, 代码: {fund*code}, 价格: {fund+price}';
    const context: TemplateContext = {
      'fund.name': '华夏沪深300ETF',
      'fund*code': '510300',
      'fund+price': 3.5
    };

    const result = fillTemplate(template, context);

    expect(result.success).toBe(true);
    expect(result.content).toBe('基金名称: 华夏沪深300ETF, 代码: 510300, 价格: 3.5');
  });

  test('should not match partial placeholder names with special characters', () => {
    // 确保 {fund.name} 不会错误匹配 {fundXname} 等
    const template = '名称: {fund.name}, 错误名: {fundXname}';
    const context: TemplateContext = {
      'fund.name': '正确名称',
      'fundXname': '错误名称'
    };

    const result = fillTemplate(template, context);

    expect(result.success).toBe(true);
    expect(result.content).toBe('名称: 正确名称, 错误名: 错误名称');
  });
});