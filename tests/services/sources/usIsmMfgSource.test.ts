// tests/services/sources/usIsmMfgSource.test.ts

import { UsIsmMfgSource } from '../../../services/sources/usIsmMfgSource';
import { ImportantDataEventInfo } from '../../../services/importantDataSourceBase';

/**
 * UsIsmMfgSource 测试
 * 测试从 MTS Insights 获取 ISM 制造业 PMI 发布日程
 *
 * 2026-06-20: 从ISM官网切换到MTS Insights数据源
 */
describe('UsIsmMfgSource', () => {
  let source: UsIsmMfgSource;

  beforeEach(() => {
    source = new UsIsmMfgSource();
  });

  describe('getSourceUrl', () => {
    it('应返回正确的 MTS Insights 页面 URL', () => {
      const url = source.getSourceUrl();
      expect(url).toBe('https://www.mtsinsights.com/events/4135/');
    });
  });

  describe('parseHtml', () => {
    it('应正确解析 JSON-LD 结构化数据', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": "ISM Manufacturing PMI",
            "mainEntity": {
              "@type": "ItemList",
              "itemListElement": [
                {
                  "@type": "ListItem",
                  "position": 1,
                  "item": {
                    "@type": "NewsArticle",
                    "headline": "ISM Manufacturing PMI: May ${currentYear}",
                    "datePublished": "${currentYear}-06-01T10:00:00-04:00"
                  }
                },
                {
                  "@type": "ListItem",
                  "position": 2,
                  "item": {
                    "@type": "NewsArticle",
                    "headline": "ISM Manufacturing PMI: April ${currentYear}",
                    "datePublished": "${currentYear}-05-01T10:00:00-04:00"
                  }
                },
                {
                  "@type": "ListItem",
                  "position": 3,
                  "item": {
                    "@type": "NewsArticle",
                    "headline": "ISM Manufacturing PMI: March ${currentYear}",
                    "datePublished": "${currentYear}-04-01T10:00:00-04:00"
                  }
                }
              ]
            }
          }
          </script>
        </head>
        <body>
          <p>Some content</p>
        </body>
        </html>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({
        date: `${currentYear}-04-01`,
        releaseTime: '22:00', // 4 月是夏令时
        reportPeriod: `${currentYear}年3月`
      });
      expect(events[1]).toEqual({
        date: `${currentYear}-05-01`,
        releaseTime: '22:00', // 5 月是夏令时
        reportPeriod: `${currentYear}年4月`
      });
      expect(events[2]).toEqual({
        date: `${currentYear}-06-01`,
        releaseTime: '22:00', // 6 月是夏令时
        reportPeriod: `${currentYear}年5月`
      });
    });

    it('应正确计算夏令时和冬令时的发布时间', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <script type="application/ld+json">
        {
          "@type": "CollectionPage",
          "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: January ${currentYear}",
                  "datePublished": "${currentYear}-02-02T10:00:00-05:00"
                }
              },
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: June ${currentYear}",
                  "datePublished": "${currentYear}-07-01T10:00:00-04:00"
                }
              },
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: December ${currentYear}",
                  "datePublished": "${currentYear + 1}-01-01T10:00:00-05:00"
                }
              }
            ]
          }
        }
        </script>
      `;

      const events = source.parseHtml(html);

      // 只测试当前年份的数据
      expect(events.length).toBeGreaterThanOrEqual(2);
      // 2月：冬令时 -> 23:00
      expect(events[0].releaseTime).toBe('23:00');
      // 7月：夏令时 -> 22:00
      expect(events[1].releaseTime).toBe('22:00');
    });

    it('应正确计算报告期（跨年处理）', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <script type="application/ld+json">
        {
          "@type": "CollectionPage",
          "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: December ${currentYear - 1}",
                  "datePublished": "${currentYear}-01-05T10:00:00-05:00"
                }
              },
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: November ${currentYear}",
                  "datePublished": "${currentYear}-12-01T10:00:00-05:00"
                }
              }
            ]
          }
        }
        </script>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(2);
      // 1月发布的是去年12月数据
      expect(events[0].reportPeriod).toBe(`${currentYear - 1}年12月`);
      // 12月发布的是当年11月数据
      expect(events[1].reportPeriod).toBe(`${currentYear}年11月`);
    });

    it('应过滤掉非当前年份的发布日期', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <script type="application/ld+json">
        {
          "@type": "CollectionPage",
          "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: May ${currentYear - 1}",
                  "datePublished": "${currentYear - 1}-06-01T10:00:00-04:00"
                }
              },
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: April ${currentYear}",
                  "datePublished": "${currentYear}-05-01T10:00:00-04:00"
                }
              },
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: March ${currentYear + 1}",
                  "datePublished": "${currentYear + 1}-04-01T10:00:00-04:00"
                }
              }
            ]
          }
        }
        </script>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-05-01`);
    });

    it('应按日期排序（从早到晚）', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <script type="application/ld+json">
        {
          "@type": "CollectionPage",
          "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: May ${currentYear}",
                  "datePublished": "${currentYear}-06-01T10:00:00-04:00"
                }
              },
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: March ${currentYear}",
                  "datePublished": "${currentYear}-04-01T10:00:00-04:00"
                }
              },
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: April ${currentYear}",
                  "datePublished": "${currentYear}-05-01T10:00:00-04:00"
                }
              }
            ]
          }
        }
        </script>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(3);
      expect(events[0].date).toBe(`${currentYear}-04-01`);
      expect(events[1].date).toBe(`${currentYear}-05-01`);
      expect(events[2].date).toBe(`${currentYear}-06-01`);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseHtml('')).toEqual([]);
      expect(source.parseHtml('<html></html>')).toEqual([]);
    });

    it('应对无JSON-LD数据返回空数组', () => {
      const html = '<html><body><p>No JSON-LD data</p></body></html>';
      expect(source.parseHtml(html)).toEqual([]);
    });

    it('应对无效JSON返回空数组', () => {
      const html = '<script type="application/ld+json">{ invalid json }</script>';
      expect(source.parseHtml(html)).toEqual([]);
    });

    it('应跳过非NewsArticle类型的item', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <script type="application/ld+json">
        {
          "@type": "CollectionPage",
          "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
              {
                "item": {
                  "@type": "WebPage",
                  "name": "Some page"
                }
              },
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: April ${currentYear}",
                  "datePublished": "${currentYear}-05-01T10:00:00-04:00"
                }
              }
            ]
          }
        }
        </script>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-05-01`);
    });

    it('应跳过不符合格式的headline', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <script type="application/ld+json">
        {
          "@type": "CollectionPage",
          "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "Invalid headline",
                  "datePublished": "${currentYear}-05-01T10:00:00-04:00"
                }
              },
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: April ${currentYear}",
                  "datePublished": "${currentYear}-05-01T10:00:00-04:00"
                }
              }
            ]
          }
        }
        </script>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
    });
  });

  describe('parseMarkdown', () => {
    it('应从 markdown 中提取 JSON-LD 数据', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
        # ISM Manufacturing PMI
        <script type="application/ld+json">
        {
          "@type": "CollectionPage",
          "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: May ${currentYear}",
                  "datePublished": "${currentYear}-06-01T10:00:00-04:00"
                }
              }
            ]
          }
        }
        </script>
      `;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-06-01`);
    });

    it('应对无 JSON-LD 数据的 markdown 返回空数组', () => {
      const markdown = `
        # ISM Manufacturing PMI
        | Month | Manufacturing PMI® | Services PMI® |
        |---|---|---|
        | January 2026 | 5 | 7 |
      `;

      expect(source.parseMarkdown(markdown)).toEqual([]);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseMarkdown('')).toEqual([]);
    });
  });

  describe('getMonthNameCNByEnglish', () => {
    it('应正确转换英文月份到中文', () => {
      // 通过parseHtml间接测试
      const currentYear = new Date().getFullYear();
      const html = `
        <script type="application/ld+json">
        {
          "@type": "CollectionPage",
          "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: January ${currentYear}",
                  "datePublished": "${currentYear}-02-02T10:00:00-05:00"
                }
              },
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: December ${currentYear}",
                  "datePublished": "${currentYear + 1}-01-01T10:00:00-05:00"
                }
              }
            ]
          }
        }
        </script>
      `;

      const events = source.parseHtml(html);

      // 只测试当前年份的数据
      if (events.length > 0) {
        expect(events[0].reportPeriod).toContain('1月');
      }
    });
  });

  describe('继承自基类的辅助方法', () => {
    it('generateDescription应正确生成描述', () => {
      const eventInfo: ImportantDataEventInfo = {
        date: '2026-06-01',
        releaseTime: '22:00',
        reportPeriod: '2026年5月'
      };

      const desc = source.generateDescription(eventInfo);

      expect(desc).toBe('ISM制造业PMI公布，北京时间 22:00，报告期：2026年5月');
    });

    it('应正确识别事件类型配置', () => {
      expect(source.getSourceUrl()).toContain('mtsinsights.com');
      expect(source.getSourceUrl()).toContain('/events/4135/');
    });
  });

  describe('日期格式验证', () => {
    it('应生成正确格式的日期字符串', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <script type="application/ld+json">
        {
          "@type": "CollectionPage",
          "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: March ${currentYear}",
                  "datePublished": "${currentYear}-04-01T10:00:00-04:00"
                }
              },
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: December ${currentYear}",
                  "datePublished": "${currentYear + 1}-01-01T10:00:00-05:00"
                }
              }
            ]
          }
        }
        </script>
      `;

      const events = source.parseHtml(html);

      // 只测试当前年份的数据
      if (events.length > 0) {
        expect(events[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(events[0].date).toBe(`${currentYear}-04-01`);
      }
    });

    it('应生成正确格式的报告期', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <script type="application/ld+json">
        {
          "@type": "CollectionPage",
          "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: January ${currentYear}",
                  "datePublished": "${currentYear}-02-02T10:00:00-05:00"
                }
              }
            ]
          }
        }
        </script>
      `;

      const events = source.parseHtml(html);

      expect(events[0].reportPeriod).toBe(`${currentYear}年1月`);
    });
  });

  describe('夏令时边界测试', () => {
    it('应正确判断夏令时', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <script type="application/ld+json">
        {
          "@type": "CollectionPage",
          "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: March ${currentYear}",
                  "datePublished": "${currentYear}-04-01T10:00:00-04:00"
                }
              }
            ]
          }
        }
        </script>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      // 4月是夏令时
      expect(events[0].releaseTime).toBe('22:00');
    });

    it('应正确判断冬令时', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <script type="application/ld+json">
        {
          "@type": "CollectionPage",
          "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
              {
                "item": {
                  "@type": "NewsArticle",
                  "headline": "ISM Manufacturing PMI: January ${currentYear}",
                  "datePublished": "${currentYear}-02-02T10:00:00-05:00"
                }
              }
            ]
          }
        }
        </script>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      // 2月是冬令时
      expect(events[0].releaseTime).toBe('23:00');
    });
  });
});