
import { ValuationData } from "../types";

/**
 * 获取当前时间戳 YYYYMMDDHHmmss
 */
function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * 提取 JS 变量值的辅助函数
 * 针对天天基金 pingzhongdata 脚本：var fS_name = "海富通电子信息传媒产业股票A";
 */
function extractVar(content: string, varName: string): string {
  // 匹配变量定义，支持有无 var，有无空格，单双引号
  const regex = new RegExp(`${varName}\\s*=\\s*["']([^"']*)["']`, 'i');
  const match = content.match(regex);
  if (match && match[1]) {
    // 处理可能的转义或编码字符（如果有的话）
    return match[1].trim();
  }

  // 匹配数值 var dwjz = 1.23;
  const numRegex = new RegExp(`${varName}\\s*=\\s*([\\d\\.-]+)`, 'i');
  const numMatch = content.match(numRegex);
  return numMatch ? numMatch[1] : '';
}

/**
 * 解析 jsonpgz 格式 (fundgz 接口)
 */
function parseJsonpgz(content: string): any {
  try {
    const start = content.indexOf('(') + 1;
    const end = content.lastIndexOf(')');
    if (start > 0 && end > start) {
      const jsonStr = content.substring(start, end);
      return JSON.parse(jsonStr);
    }
  } catch (e) {}
  return null;
}

/**
 * 使用多个代理尝试获取数据，保持静默除非全部失败
 */
async function fetchWithProxy(targetUrl: string, validator: (text: string) => boolean): Promise<string | null> {
  const proxies = [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
  ];

  for (let i = 0; i < proxies.length; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时足够了

    try {
      const proxyUrl = proxies[i](targetUrl);
      const response = await fetch(proxyUrl, {
        cache: 'no-cache',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        let text = "";
        if (proxyUrl.includes('allorigins.win/get')) {
          const json = await response.json();
          text = json.contents || "";
        } else {
          text = await response.text();
        }

        if (text && validator(text)) {
          return text;
        }
      }
    } catch (e) {
      clearTimeout(timeoutId);
    }
  }
  return null;
}

/**
 * 获取基金详情数据
 */
export async function fetchFundData(symbol: string): Promise<ValuationData | null> {
  const code = symbol.padStart(6, '0');
  const timestamp = getTimestamp();

  // 接口1：主接口，包含基金全称、历史净值
  const urlPrimary = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${timestamp}`;
  // 接口2：实时估值接口
  const urlValuation = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${timestamp}`;

  try {
    // 采用 AllSettled 确保一个接口挂了另一个还能工作
    const results = await Promise.allSettled([
      fetchWithProxy(urlPrimary, (t) => t.includes('fS_code') || t.includes('fS_name')),
      fetchWithProxy(urlValuation, (t) => t.includes('jsonpgz'))
    ]);

    const contentPrimary = results[0].status === 'fulfilled' ? results[0].value : null;
    const contentValuation = results[1].status === 'fulfilled' ? results[1].value : null;

    if (!contentPrimary && !contentValuation) return null;

    // 解析基础信息
    const baseInfo = contentPrimary ? {
      name: extractVar(contentPrimary, 'fS_name'),
      dwjz: extractVar(contentPrimary, 'dwjz'),
      gsz: extractVar(contentPrimary, 'gsz'),
      gszzl: extractVar(contentPrimary, 'gszzl'),
      gztime: extractVar(contentPrimary, 'gztime'),
      jzrq: extractVar(contentPrimary, 'fs_jzrq')
    } : null;

    // 解析估值信息
    const valInfo = contentValuation ? parseJsonpgz(contentValuation) : null;

    // 名称提取优化：优先取 contentPrimary 中的全称，通常最准确
    let name = baseInfo?.name || valInfo?.name || `基金(${code})`;

    const dwjz = parseFloat(valInfo?.dwjz || baseInfo?.dwjz || "0");
    const gszRaw = valInfo?.gsz || baseInfo?.gsz;
    const gsz = gszRaw ? parseFloat(gszRaw) : dwjz;
    const gszzl = parseFloat(valInfo?.gszzl || baseInfo?.gszzl || "0");
    const gztime = valInfo?.gztime || baseInfo?.gztime || "更新中";
    const jzrq = valInfo?.jzrq || baseInfo?.jzrq || "---";

    return {
      symbol: code,
      name: name,
      currentPrice: gsz,
      previousPrice: dwjz,
      changePercentage: gszzl,
      lastUpdated: gztime,
      valuationDate: jzrq,
      sourceUrl: `https://fund.eastmoney.com/${code}.html`
    };

  } catch (error) {
    return null;
  }
}
