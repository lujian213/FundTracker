import { EggfundFund, EggfundTradeRecord, EggfundInvestRecord } from '../types/syncTypes';

// Eggfund API 配置
const EGGFUND_BASE_URL = 'https://eggfund.website';
const EGGFUND_API = {
  FUNDS: `${EGGFUND_BASE_URL}/api/funds`,
  INVESTS: `${EGGFUND_BASE_URL}/api/invests`,  // 获取历史交易（查询）
  INVEST: `${EGGFUND_BASE_URL}/api/invest`,    // 反向同步（添加/修改/删除）
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
 * 处理 API 响应错误
 */
function handleResponseError(response: Response, operationName: string): void {
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('认证失败：用户名或密码错误');
    }
    throw new Error(`${operationName}失败: ${response.status} ${response.statusText}`);
  }
}

/**
 * 处理网络请求异常
 */
function handleFetchError(error: any): Error {
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return new Error('网络连接失败，请检查网络');
  }
  return error;
}

/**
 * 获取 eggfund 基金列表
 */
export async function getEggfundFunds(username: string, password: string): Promise<EggfundFund[]> {
  const response = await fetch(EGGFUND_API.FUNDS, {
    method: 'GET',
    headers: buildHeaders(username, password),
  });

  handleResponseError(response, '获取基金列表');

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

  handleResponseError(response, `获取基金 ${fundCode} 的历史交易`);

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
    return { success: false, message: handleFetchError(error).message };
  }
}

/**
 * 添加投资记录到 Eggfund（批量）
 * @param username Eggfund 用户名
 * @param password Eggfund 密码
 * @param records 要添加的记录数组
 */
export async function addInvestRecords(
  username: string,
  password: string,
  records: EggfundInvestRecord[]
): Promise<void> {
  try {
    const apiUrl = `${EGGFUND_API.INVEST}/${encodeURIComponent(username)}`;

    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        ...buildHeaders(username, password),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(records),
    });

    handleResponseError(response, '添加投资记录');
  } catch (error: any) {
    throw handleFetchError(error);
  }
}

/**
 * 修改 Eggfund 中的单条投资记录
 * @param username Eggfund 用户名
 * @param password Eggfund 密码
 * @param record 要修改的记录（需包含原记录的 id）
 */
export async function updateInvestRecord(
  username: string,
  password: string,
  record: EggfundInvestRecord
): Promise<void> {
  try {
    const apiUrl = `${EGGFUND_API.INVEST}/${encodeURIComponent(username)}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        ...buildHeaders(username, password),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record),
    });

    handleResponseError(response, '修改投资记录');
  } catch (error: any) {
    throw handleFetchError(error);
  }
}

/**
 * 删除 Eggfund 中的投资记录（批量）
 * @param username Eggfund 用户名
 * @param password Eggfund 密码
 * @param investIds 要删除的交易ID列表
 */
export async function deleteInvestRecords(
  username: string,
  password: string,
  investIds: string[]
): Promise<void> {
  try {
    const apiUrl = `${EGGFUND_API.INVEST}/${encodeURIComponent(username)}?${investIds.map(id => `investIds=${encodeURIComponent(id)}`).join('&')}`;

    const response = await fetch(apiUrl, {
      method: 'DELETE',
      headers: buildHeaders(username, password),
    });

    handleResponseError(response, '删除投资记录');
  } catch (error: any) {
    throw handleFetchError(error);
  }
}