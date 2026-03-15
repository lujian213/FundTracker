import { EggfundFund, EggfundTradeRecord } from '../types/syncTypes';

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
 * 获取 eggfund 基金列表
 */
export async function getEggfundFunds(username: string, password: string): Promise<EggfundFund[]> {
  const headers = {
    'Accept': 'application/json',
    'Authorization': encodeCredentials(username, password),
  };

  const response = await fetch('https://eggfund.website/api/funds', {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`获取基金列表失败: ${response.status} ${response.statusText}`);
  }

  const data: EggfundFund[] = await response.json();
  return data;
}

/**
 * 获取特定基金的历史交易记录
 */
export async function getHistoricalTrades(username: string, password: string, fundCode: string): Promise<EggfundTradeRecord[]> {
  // 构建 API URL，其中 username 作为 id，fundCode 作为基金代码
  const apiUrl = `https://eggfund.website/api/invests/${encodeURIComponent(username)}/${encodeURIComponent(fundCode)}?batch=-1`;

  const headers = {
    'Accept': 'application/json',
    'Authorization': encodeCredentials(username, password),
  };

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`获取基金 ${fundCode} 的历史交易失败: ${response.status} ${response.statusText}`);
  }

  const data: EggfundTradeRecord[] = await response.json();
  return data;
}

/**
 * 测试 eggfund 连接
 */
export async function authenticate(username: string, password: string): Promise<boolean> {
  try {
    // 尝试获取基金列表来验证认证信息
    await getEggfundFunds(username, password);
    return true;
  } catch (error) {
    console.error('认证失败:', error);
    return false;
  }
}