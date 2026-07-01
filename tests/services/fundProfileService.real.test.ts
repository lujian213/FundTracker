// tests/services/fundProfileService.real.test.ts
import {
  parseStockPositionsFromMarkdown,
  parseStageIncreaseFromMarkdown,
  parseStockPositionsFromHtml,
  parseStageIncreaseFromHtml,
} from '../../services/fundProfileService';

// 用户提供的 024194 基金真实网页 Markdown 内容（通过 r.jina.ai 代理获取）
const realMarkdown_024194 = `
### [股票持仓](javascript:;)

### [债券持仓](javascript:;)

[更多 >](http://fundf10.eastmoney.com/ccmx_024194.html)

*   | 股票名称 | 持仓占比 | 涨跌幅 | 相关资讯 |
| --- | --- | --- | --- |
| 暂无数据 | 持仓截止日期: [更多持仓信息>](http://fundf10.eastmoney.com/ccmx_024194.html)
*   | 债券名称 | 持仓占比 | 涨跌幅 |
| --- | --- | --- |
| 暂无数据 | 持仓截止日期: [更多持仓信息>](http://fundf10.eastmoney.com/ccmx1_024194.html)

### [阶段涨幅](javascript:;)

[更多>](http://fundf10.eastmoney.com/jdzf_024194.html)

截止至 2026-04-17

*   |  | 近1周 | 近1月 | 近3月 | 近6月 | 今年来 | 近1年 | 近2年 | 近3年 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 阶段涨幅 | 7.76% | 9.60% | -7.51% | 49.90% | 5.33% | -- | -- | -- |
`;

// 模拟有正常股票持仓数据的 Markdown
const normalMarkdownWithStocks = `
### [股票持仓](javascript:;)

[更多 >](http://fundf10.eastmoney.com/ccmx_161725.html)

*   | 股票名称 | 持仓占比 | 涨跌幅 | 相关资讯 |
| --- | --- | --- | --- |
| [宁德时代](http://quote.eastmoney.com/concept/sz300750.html "宁德时代") | 9.45% | +2.30% | [资讯](http://...) |
| [中际旭创](http://quote.eastmoney.com/concept/sz300308.html "中际旭创") | 6.06% | -1.50% | [资讯](http://...) |
| [贵州茅台](http://quote.eastmoney.com/concept/sh600519.html "贵州茅台") | 5.00% | +0.80% | [资讯](http://...) |

### [阶段涨幅](javascript:;)

*   |  | 近1周 | 近1月 | 近3月 | 近6月 |
| --- | --- | --- | --- | --- | --- |
| 阶段涨幅 | 3.50% | -2.22% | 10.45% | 25.67% |
`;

// 模拟 HTML 中"暂无数据"的情况
const htmlWithNoStockData = `
<html>
  <body>
    <div id="position_shares">
      <table class='ui-table-hover' width='100%' border='0' cellspacing='0' cellpadding='0'>
        <tr>
          <th class="alignLeft">股票名称</th>
          <th class="alignRight">持仓占比</th>
          <th class="alignRight">涨跌幅</th>
        </tr>
        <tr>
          <td colspan="4" style="color:#808080">暂无数据</td>
        </tr>
      </table>
    </div>
    <div id="increaseAmount_stage">
      <table>
        <tr>
          <th><div></div></th>
          <th><div>近1周</div></th>
          <th><div>近1月</div></th>
        </tr>
        <tr>
          <td><div class="typeName">阶段涨幅</div></td>
          <td><div class="Rdata">--</div></td>
          <td><div class="Rdata">--</div></td>
        </tr>
      </table>
    </div>
  </body>
</html>
`;

describe('fundProfileService - real data tests', () => {
  // ============================================================
  // Markdown 格式测试
  // ============================================================
  describe('Markdown format', () => {
    describe('parseStockPositionsFromMarkdown', () => {
      test('should return empty array for "暂无数据" (024194 real case)', () => {
        const positions = parseStockPositionsFromMarkdown(realMarkdown_024194);
        expect(positions).toEqual([]);
      });

      test('should parse normal stock positions correctly', () => {
        const positions = parseStockPositionsFromMarkdown(normalMarkdownWithStocks);

        expect(positions).toHaveLength(3);
        expect(positions[0]).toEqual({ stock_name: '宁德时代', percentage: 9.45, stock_code: '300750', stock_url: 'https://quote.eastmoney.com/sz300750.html' });
        expect(positions[1]).toEqual({ stock_name: '中际旭创', percentage: 6.06, stock_code: '300308', stock_url: 'https://quote.eastmoney.com/sz300308.html' });
        expect(positions[2]).toEqual({ stock_name: '贵州茅台', percentage: 5.00, stock_code: '600519', stock_url: 'https://quote.eastmoney.com/sh600519.html' });
      });

      test('should ignore rows with URL in percentage column', () => {
        const maliciousMarkdown = `
| 股票名称 | 持仓占比 |
| --- | --- |
| 暂无数据 | 持仓截止日期: [更多](http://fundf10.eastmoney.com/ccmx_123.html) |
`;
        const positions = parseStockPositionsFromMarkdown(maliciousMarkdown);
        expect(positions).toEqual([]);
      });

      test('should ignore "暂无数据" as stock name', () => {
        const markdown = `
| 股票名称 | 持仓占比 |
| --- | --- |
| 暂无数据 | 10.00% |
`;
        const positions = parseStockPositionsFromMarkdown(markdown);
        expect(positions).toEqual([]);
      });
    });

    describe('parseStageIncreaseFromMarkdown', () => {
      test('should parse stage increase from real 024194 data', () => {
        const stages = parseStageIncreaseFromMarkdown(realMarkdown_024194);

        expect(stages).toHaveLength(4);
        expect(stages.find(s => s.stage === '近1周')?.increase_percentage).toBe(7.76);
        expect(stages.find(s => s.stage === '近1月')?.increase_percentage).toBe(9.60);
        expect(stages.find(s => s.stage === '近3月')?.increase_percentage).toBe(-7.51);
        expect(stages.find(s => s.stage === '近6月')?.increase_percentage).toBe(49.90);
      });

      test('should parse normal stage increase data', () => {
        const stages = parseStageIncreaseFromMarkdown(normalMarkdownWithStocks);

        expect(stages).toHaveLength(4);
        expect(stages.find(s => s.stage === '近1周')?.increase_percentage).toBe(3.50);
        expect(stages.find(s => s.stage === '近1月')?.increase_percentage).toBe(-2.22);
      });

      test('should skip "--" values (no data)', () => {
        const markdownWithDash = `
|  | 近1周 | 近1月 |
| --- | --- | --- |
| 阶段涨幅 | -- | -- |
`;
        const stages = parseStageIncreaseFromMarkdown(markdownWithDash);
        // "--" 无法解析为数字，应该被跳过
        expect(stages).toEqual([]);
      });
    });
  });

  // ============================================================
  // HTML 格式测试
  // ============================================================
  describe('HTML format', () => {
    describe('parseStockPositionsFromHtml', () => {
      test('should return empty array for "暂无数据" HTML', () => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlWithNoStockData, 'text/html');

        const positions = parseStockPositionsFromHtml(doc);

        // "暂无数据"行只有1个td（colspan=4），被 cells.length < 2 过滤
        expect(positions).toEqual([]);
      });

      test('should parse normal stock positions from HTML', () => {
        const normalHtml = `
<html>
  <body>
    <div id="position_shares">
      <table>
        <tr>
          <td class="alignLeft"><a href="#" title="宁德时代">宁德时代</a></td>
          <td class="alignRight bold">9.45%</td>
        </tr>
        <tr>
          <td class="alignLeft"><a href="#" title="贵州茅台">贵州茅台</a></td>
          <td class="alignRight bold">5.00%</td>
        </tr>
      </table>
    </div>
  </body>
</html>
`;
        const parser = new DOMParser();
        const doc = parser.parseFromString(normalHtml, 'text/html');

        const positions = parseStockPositionsFromHtml(doc);

        expect(positions).toHaveLength(2);
        expect(positions[0]).toEqual({ stock_name: '宁德时代', percentage: 9.45 });
        expect(positions[1]).toEqual({ stock_name: '贵州茅台', percentage: 5.00 });
      });
    });

    describe('parseStageIncreaseFromHtml', () => {
      test('should skip "--" values in HTML', () => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlWithNoStockData, 'text/html');

        const stages = parseStageIncreaseFromHtml(doc);

        // "--" 无法解析为数字，应该被跳过
        expect(stages).toEqual([]);
      });

      test('should parse normal stage increase from HTML', () => {
        const normalHtml = `
<html>
  <body>
    <div id="increaseAmount_stage">
      <table>
        <tr>
          <th><div></div></th>
          <th><div>近1周</div></th>
          <th><div>近1月</div></th>
          <th><div>近3月</div></th>
          <th><div>近6月</div></th>
        </tr>
        <tr>
          <td><div class="typeName">阶段涨幅</div></td>
          <td><div class="Rdata">3.50%</div></td>
          <td><div class="Rdata">-2.22%</div></td>
          <td><div class="Rdata">10.45%</div></td>
          <td><div class="Rdata">25.67%</div></td>
        </tr>
      </table>
    </div>
  </body>
</html>
`;
        const parser = new DOMParser();
        const doc = parser.parseFromString(normalHtml, 'text/html');

        const stages = parseStageIncreaseFromHtml(doc);

        expect(stages).toHaveLength(4);
        expect(stages.find(s => s.stage === '近1周')?.increase_percentage).toBe(3.50);
        expect(stages.find(s => s.stage === '近1月')?.increase_percentage).toBe(-2.22);
      });
    });
  });
});