import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

// 提供全局 TextDecoder/TextEncoder（Jest jsdom 环境可能缺少）
global.TextDecoder = TextDecoder as any;
global.TextEncoder = TextEncoder as any;

// Mock fetch for Jest environment (promptTemplateService uses fetch)
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: false,
    status: 404,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  })
) as any;

// 静默测试中预期的 console 输出，减少日志噪音
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args: unknown[]) => {
  const message = args[0];
  if (typeof message === 'string') {
    // 忽略测试中的调试日志
    if (message.includes('No aiConfig found in imported backup') ||
        message.includes('Test indices saved') ||
        message.includes('Available selection buttons') ||
        message.includes('After fund click') ||
        message.includes('After domestic index click') ||
        message.includes('After global index click') ||
        message.includes('Delete count') ||
        message.includes('Indices before save') ||
        message.includes('Indices after save') ||
        message.includes('Save button disabled') ||
        message.includes('aria-pressed') ||
        message.includes('[StorageMigration] 验证结果汇总') ||
        // xirrHelper.test.ts 的现金流调试日志
        message.includes('High return scenario cash flows') ||
        message.includes('Cash flows count') ||
        message.includes('Total outflow') ||
        message.includes('Total inflow') ||
        message.includes('Net profit') ||
        message.includes('XIRR result') ||
        // OverallProfitModalChartBug.test.ts 和 recentPointsPreservation.test.ts 的验证日志
        message.includes('Original count') ||
        message.includes('Merged (display) count') ||
        message.includes('Display count') ||
        message.includes('Recent original points dates') ||
        message.includes('✓ Recent point') ||
        message.includes('Original point index') ||
        message.includes('Display point (same date)') ||
        // retryUtils.test.ts 的重试日志
        message.includes('第') &&
        message.includes('次尝试成功')) {
      return;
    }
  }
  originalLog.call(console, ...args);
};

console.error = (...args: unknown[]) => {
  const message = args[0];
  if (typeof message === 'string') {
    if (message.includes('Error reading stored position') ||
        message.includes('Error getting trades') ||
        message.includes('Error communicating with AI') ||
        message.includes('Failed to load templates') ||
        message.includes('was not wrapped in act') ||
        message.includes('[BackgroundJob] Failed to parse AI response') ||
        message.includes('[BackgroundJob] Error loading prompts') ||
        message.includes('[StrategyRecommendation] Failed to parse AI response') ||
        message.includes('Check the render method of `VirtualTradeModal`') ||
        message.includes('See https://reactjs.org/link/warning-keys') ||
        message.includes('Failed to load portfolio templates') ||
        message.includes('[Calendar] Failed to load calendar data') ||
        message.includes('[TimerJob]') ||
        message.includes('Error reading user preference') ||
        message.includes('Error reading system config') ||
        // aiService.test.ts: 指数分析模板未找到
        message.includes('没有找到指数分析模板') ||
        // calendarHolidayService.test.ts: JSON解析错误测试
        message.includes('[Calendar] JSON解析失败') ||
        message.includes('[Calendar] 响应末尾') ||
        message.includes('[Calendar] 响应总长度') ||
        message.includes('[Calendar] 可能是截断问题') ||
        // fundProfileService.test.ts: 错误处理测试
        message.includes('[FundProfile] 获取基金类型和板块信息失败') ||
        message.includes('[FundProfile] 获取失败') ||
        message.includes('[FundProfile] HTML解析失败') ||
        message.includes('[FundProfile] 搜索API返回数据无效') ||
        // usIsmMfgSource.test.ts: HTML解析错误测试
        message.includes('[ISM制造业PMI] 未找到JSON-LD数据') ||
        message.includes('[ISM制造业PMI] JSON解析失败') ||
        message.includes('[ISM制造业PMI] Markdown格式中未找到JSON-LD数据') ||
        // newsAIAnalysisService.test.ts: 模板未找到测试
        message.includes('[newsAIAnalysisService] 模板未找到') ||
        // strategyRecommendationService.test.ts 和 jsonParseUtils.test.ts: JSON解析错误测试
        message.includes('[StrategyRecommendation] JSON解析失败') ||
        message.includes('[StrategyRecommendation] 响应末尾') ||
        message.includes('[StrategyRecommendation] 响应总长度') ||
        message.includes('[StrategyRecommendation] 可能是截断问题') ||
        message.includes('[Test] JSON解析失败') ||
        message.includes('[Test] 响应末尾') ||
        message.includes('[Test] 响应总长度') ||
        message.includes('[Test] 可能是截断问题') ||
        // marketNewsService.test.ts: 错误处理测试
        message.includes('fetchFastNews error') ||
        message.includes('fetchFastNews API returned invalid data') ||
        // importantDataService.test.ts: 数据获取失败测试
        message.includes('[CPI数据公布] 数据获取失败') ||
        // fundService.kline.test.ts: intraday kline 失败测试
        message.includes('fetchIndexIntradayKline: JSONP and proxy both failed')) {
      return;
    }
  }
  originalError.call(console, ...args);
};

console.warn = (...args: unknown[]) => {
  const message = args[0];
  if (typeof message === 'string') {
    if (message.includes('punycode') ||
        message.includes('restoreAIConfigBackup') ||
        message.includes('Invalid backup data') ||
        message.includes('[TimerJob] Failed to load config') ||
        message.includes('加载常用问题配置失败') ||
        message.includes('[BackgroundJob] AI response is not an array') ||
        message.includes('[StrategyRecommendation] AI response is not an array') ||
        message.includes('Failed to load template config') ||
        // aiService.test.ts: 搜索服务失败测试
        message.includes('搜索服务 AnySearch 失败') ||
        message.includes('搜索服务 智谱搜索 失败') ||
        message.includes('搜索服务失败或无结果') ||
        // fundProfileService.test.ts: 错误处理测试
        message.includes('[FundProfile] HTML解析失败') ||
        message.includes('[FundProfile] 获取基金类型和板块信息失败') ||
        message.includes('[FundProfile] 搜索API返回数据无效') ||
        // retryUtils.test.ts: 重试日志测试
        message.includes('[操作] 第') &&
        message.includes('次尝试失败')) {
      return;
    }
  }
  originalWarn.call(console, ...args);
};

export {};