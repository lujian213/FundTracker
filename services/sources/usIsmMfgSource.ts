// services/sources/usIsmMfgSource.ts

import {
  ImportantDataSourceBase,
  ImportantDataSourceConfig,
  ImportantDataEventInfo
} from '../importantDataSourceBase';

/**
 * ISM 制造业 PMI 数据源
 * 从 MTS Insights 获取制造业 PMI 发布日程
 *
 * 数据源页面：https://www.mtsinsights.com/events/4135/
 *
 * 特点：
 * - 数据来源：MTS Insights（聚合ISM官方数据）
 * - 数据格式：JSON-LD结构化数据，解析稳定可靠
 * - 每月第一个工作日发布
 * - 发布时间：美国东部时间上午 10:00（北京时间：夏令时 22:00，冬令时 23:00）
 * - 报告期：发布月前一个月（如 6 月发布 5 月数据）
 *
 * 2026-06-20: 从ISM官网切换到MTS Insights，解决ISM官网captcha问题
 */
export class UsIsmMfgSource extends ImportantDataSourceBase {
  constructor() {
    const config: ImportantDataSourceConfig = {
      eventType: 'important_data_us_ism_mfg',
      eventName: 'ISM制造业PMI公布',
      market: '美股',
      useProxy: true,  // MTS Insights 需要代理访问
      preferProxyFormat: 'raw'  // 使用 raw 格式代理，从JSON-LD中提取数据
    };
    super(config);
  }

  /**
   * 获取 MTS Insights 制造业 PMI 发布日程页面 URL
   */
  getSourceUrl(): string {
    return 'https://www.mtsinsights.com/events/4135/';
  }

  /**
   * 解析 MTS Insights 页面的 HTML
   * 从 JSON-LD 结构化数据中提取制造业 PMI 发布日程
   *
   * JSON-LD 数据格式：
   * <script type="application/ld+json">
   * {
   *   "@type": "CollectionPage",
   *   "mainEntity": {
   *     "@type": "ItemList",
   *     "itemListElement": [
   *       {
   *         "item": {
   *           "@type": "NewsArticle",
   *           "headline": "ISM Manufacturing PMI: May 2026",
   *           "datePublished": "2026-06-01T10:00:00-04:00"
   *         }
   *       },
   *       ...
   *     ]
   *   }
   * }
   * </script>
   *
   * 解析逻辑：
   * 1. 从HTML中提取JSON-LD数据
   * 2. 解析ItemList中的每个NewsArticle
   * 3. 从headline中提取报告期（如 "May 2026"）
   * 4. 从datePublished中提取发布日期（如 "2026-06-01"）
   * 5. 计算北京时间（考虑夏令时）
   */
  parseHtml(html: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const currentYear = this.getCurrentYear();

    // 提取JSON-LD数据
    const jsonLdPattern = /<script\s+type="application\/ld\+json">\s*([^<]+)\s*<\/script>/i;
    const match = jsonLdPattern.exec(html);

    if (!match) {
      console.error('[ISM制造业PMI] 未找到JSON-LD数据');
      return events;
    }

    try {
      const jsonLd = JSON.parse(match[1]);

      // 检查是否包含ItemList
      const itemList = jsonLd.mainEntity?.itemListElement || [];
      if (itemList.length === 0) {
        console.error('[ISM制造业PMI] JSON-LD中没有ItemList数据');
        return events;
      }

      // 解析每个发布事件
      itemList.forEach((item: any) => {
        const newsArticle = item.item;
        if (!newsArticle || newsArticle['@type'] !== 'NewsArticle') {
          return;
        }

        const headline = newsArticle.headline || '';
        const datePublished = newsArticle.datePublished || '';

        // 从headline中提取报告期（如 "ISM Manufacturing PMI: May 2026"）
        const headlineMatch = headline.match(/ISM Manufacturing PMI:\s+(\w+)\s+(\d{4})/i);
        if (!headlineMatch) {
          return;
        }

        const reportMonthStr = headlineMatch[1];
        const reportYear = parseInt(headlineMatch[2], 10);

        // 从datePublished中提取发布日期（如 "2026-06-01T10:00:00-04:00"）
        const dateMatch = datePublished.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!dateMatch) {
          return;
        }

        const releaseYear = parseInt(dateMatch[1], 10);
        const releaseMonth = parseInt(dateMatch[2], 10) - 1; // 月份从0开始
        const releaseDay = parseInt(dateMatch[3], 10);

        // 年份过滤：只保留当前年份的发布日期
        if (releaseYear !== currentYear) {
          return;
        }

        // 构建发布日期
        const releaseDate = new Date(releaseYear, releaseMonth, releaseDay);

        // 验证日期有效性
        if (releaseDate.getMonth() !== releaseMonth) {
          return;
        }

        // 格式化发布日期
        const formattedDate = this.formatDate(releaseDate);

        // 计算报告期（中文格式）
        // 从报告月名称转换为中文：如 "May" -> "5月"
        const reportMonthNum = this.parseMonthName(reportMonthStr);
        const reportPeriod = `${reportYear}年${this.getMonthNameCN(reportMonthNum)}`;

        // 计算北京时间（考虑夏令时）
        const releaseTime = this.calculateIsmReleaseTime(releaseDate);

        events.push({
          date: formattedDate,
          releaseTime: releaseTime,
          reportPeriod: reportPeriod
        });
      });

      // 按日期排序（从早到晚）
      events.sort((a, b) => a.date.localeCompare(b.date));

      return events;
    } catch (error) {
      console.error('[ISM制造业PMI] JSON解析失败:', error);
      return events;
    }
  }

  /**
   * 解析 Markdown 格式（r.jina.ai 返回的格式）
   * MTS Insights 的 JSON-LD 数据在 markdown 中也可能存在，
   * 所以我们尝试从 markdown 中提取 JSON-LD 数据块
   */
  parseMarkdown(markdown: string): ImportantDataEventInfo[] {
    // 尝试从 markdown 中提取 JSON-LD 数据
    // 如果 markdown 中包含 JSON 数据块，直接调用 parseHtml
    if (markdown.includes('"@type"') && markdown.includes('"NewsArticle"')) {
      return this.parseHtml(markdown);
    }

    // 如果没有 JSON-LD 数据，返回空数组
    console.error('[ISM制造业PMI] Markdown格式中未找到JSON-LD数据');
    return [];
  }
}