import { EggfundFund, EggfundTradeRecord } from '../types/syncTypes';

// Eggfund API 配置
const EGGFUND_BASE_URL = 'https://eggfund.website';
const EGGFUND_API = {
  FUNDS: `${EGGFUND_BASE_URL}/api/funds`,
  INVESTS: `${EGGFUND_BASE_URL}/api/invests`,
  LOGIN_USER: `${EGGFUND_BASE_URL}/api/loginUser`,
};

/**
 * 将用户名和密码编码为 Base64 格式的 Authorization 头
 */
function encodeCredentials(username: string, password: string): string {
  const credentials = `${username}:${password}`;

  // 在 Node.js 环境中，可能没有全局 btoa 函数，所以我们创建一个辅助函数
  let encoded: string;
  if (typeof btoa !== 'undefined') {
    // 浏览器环境
    encoded = btoa(credentials);
  } else {
    // Node.js 环境
    encoded = Buffer.from(credentials, 'utf8').toString('base64');
  }

  return 'Basic ' + encoded;
}

/**
 * 构建通用的请求头
 */
function buildHeaders(username: string, password: string): Record<string, string> {
  return {
    'Accept': 'application/json',
    'Authorization': encodeCredentials(username, password),
  };
}

/**
 * 获取 eggfund 基金列表
 */
export async function getEggfundFunds(username: string, password: string): Promise<EggfundFund[]> {
  const response = await fetch(EGGFUND_API.FUNDS, {
    method: 'GET',
    headers: buildHeaders(username, password),
  });

  if (!response.ok) {
    throw new Error(`获取基金列表失败: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * 获取特定基金的历史交易记录
 */
export async function getHistoricalTrades(username: string, password: string, fundCode: string): Promise<EggfundTradeRecord[]> {
  const apiUrl = `${EGGFUND_API.INVESTS}/${encodeURIComponent(username)}/${encodeURIComponent(fundCode)}?batch=-1`;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: buildHeaders(username, password),
  });

  if (!response.ok) {
    throw new Error(`获取基金 ${fundCode} 的历史交易失败: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * 测试 eggfund 连接 - 使用登录接口验证
 */
export async function testConnection(username: string, password: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(EGGFUND_API.LOGIN_USER, {
      method: 'GET',
      headers: buildHeaders(username, password),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, message: '用户名或密码错误' };
      }
      return { success: false, message: `连接失败: ${response.status} ${response.statusText}` };
    }

    return { success: true, message: '连接成功！' };
  } catch (error: any) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return { success: false, message: '网络连接失败，请检查网络' };
    }
    return { success: false, message: `连接失败: ${error.message || '未知错误'}` };
  }
}