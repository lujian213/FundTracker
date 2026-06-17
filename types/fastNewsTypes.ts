// types/fastNewsTypes.ts

/**
 * 东方财富快讯数据类型
 */
export interface FastNewsItem {
  code: string;        // 新闻 ID
  title: string;       // 标题
  summary: string;     // 摘要
  showTime: string;    // 显示时间 (YYYY-MM-DD HH:mm:ss)
  titleColor: number;  // 标题颜色（3=重要，0=普通）
  url?: string;        // 详情页 URL
}

/**
 * 东方财富快讯 API 响应类型
 */
export interface FastNewsApiResponse {
  code: string;
  message: string;
  data: {
    sortEnd: string;
    index: number;
    total: number;
    size: number;
    fastNewsList: Array<{
      code: string;
      title: string;
      summary: string;
      showTime: string;
      titleColor: number;
      stockList: string[];
      image: string[];
      share: number;
      pinglun_Num: number;
      realSort: string;
    }>;
  };
}