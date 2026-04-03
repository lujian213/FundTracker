import { Ticker, MarketType, FundProfile } from '../../types';

import {
  parseStockPositions,
  parseStageIncrease,
  parseFundProfileFromHtml,
  refreshFundProfiles,
} from '../../services/fundProfileService';

describe('fundProfileService', () => {
  describe('parseStockPositions', () => {
    test('parses stock positions from HTML', () => {
      const html = `
        <html>
          <body>
            <div id="position_shares">
              <table>
                <tr>
                  <th class="alignLeft">股票名称</th>
                  <th class="alignRight">持仓占比</th>
                </tr>
                <tr>
                  <td class="alignLeft">
                    <a href="#" title="宁德时代">宁德时代</a>
                  </td>
                  <td class="alignRight bold">9.45%</td>
                </tr>
                <tr>
                  <td class="alignLeft">
                    <a href="#" title="中际旭创">中际旭创</a>
                  </td>
                  <td class="alignRight bold">6.06%</td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStockPositions(doc);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ stock_name: '宁德时代', percentage: 9.45 });
      expect(result[1]).toEqual({ stock_name: '中际旭创', percentage: 6.06 });
    });

    test('returns empty array when table not found', () => {
      const html = '<html><body><div>no table</div></body></html>';
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStockPositions(doc);

      expect(result).toEqual([]);
    });

    test('skips rows with invalid percentage', () => {
      const html = `
        <html>
          <body>
            <div id="position_shares">
              <table>
                <tr>
                  <td class="alignLeft"><a href="#" title="股票A">股票A</a></td>
                  <td class="alignRight bold">invalid</td>
                </tr>
                <tr>
                  <td class="alignLeft"><a href="#" title="股票B">股票B</a></td>
                  <td class="alignRight bold">5.00%</td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStockPositions(doc);

      expect(result).toHaveLength(1);
      expect(result[0].stock_name).toBe('股票B');
    });

    test('skips rows without stock name link', () => {
      const html = `
        <html>
          <body>
            <div id="position_shares">
              <table>
                <tr>
                  <td class="alignLeft">没有链接的股票</td>
                  <td class="alignRight bold">3.00%</td>
                </tr>
                <tr>
                  <td class="alignLeft"><a href="#" title="股票B">股票B</a></td>
                  <td class="alignRight bold">5.00%</td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStockPositions(doc);

      expect(result).toHaveLength(1);
      expect(result[0].stock_name).toBe('股票B');
    });

    test('handles negative percentages', () => {
      const html = `
        <html>
          <body>
            <div id="position_shares">
              <table>
                <tr>
                  <td class="alignLeft"><a href="#" title="股票A">股票A</a></td>
                  <td class="alignRight bold">-2.50%</td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStockPositions(doc);

      expect(result).toHaveLength(1);
      expect(result[0].percentage).toBe(-2.5);
    });

    test('handles percentages with decimal places', () => {
      const html = `
        <html>
          <body>
            <div id="position_shares">
              <table>
                <tr>
                  <td class="alignLeft"><a href="#" title="股票A">股票A</a></td>
                  <td class="alignRight bold">10.123%</td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStockPositions(doc);

      expect(result).toHaveLength(1);
      expect(result[0].percentage).toBeCloseTo(10.123);
    });
  });

  describe('parseStageIncrease', () => {
    test('parses stage increase from HTML', () => {
      const html = `
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
                  <td><div class="Rdata ui-color-green bold">-0.52%</div></td>
                  <td><div class="Rdata ui-color-green bold">-2.22%</div></td>
                  <td><div class="Rdata ui-color-green bold">-0.29%</div></td>
                  <td><div class="Rdata ui-color-green bold">-1.12%</div></td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStageIncrease(doc);

      expect(result).toHaveLength(4);
      expect(result.find(s => s.stage === '近1周')?.increase_percentage).toBe(-0.52);
      expect(result.find(s => s.stage === '近1月')?.increase_percentage).toBe(-2.22);
      expect(result.find(s => s.stage === '近3月')?.increase_percentage).toBe(-0.29);
      expect(result.find(s => s.stage === '近6月')?.increase_percentage).toBe(-1.12);
    });

    test('returns empty array when table not found', () => {
      const html = '<html><body><div>no table</div></body></html>';
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStageIncrease(doc);

      expect(result).toEqual([]);
    });

    test('returns empty array when header row not found', () => {
      const html = `
        <html>
          <body>
            <div id="increaseAmount_stage">
              <table>
                <tbody>
                  <tr>
                    <td><div class="typeName">阶段涨幅</div></td>
                    <td><div class="Rdata">1.00%</div></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStageIncrease(doc);

      expect(result).toEqual([]);
    });

    test('returns empty array when stage increase row not found', () => {
      const html = `
        <html>
          <body>
            <div id="increaseAmount_stage">
              <table>
                <tr>
                  <th><div>近1周</div></th>
                  <th><div>近1月</div></th>
                </tr>
                <tr>
                  <td><div class="typeName">其他类型</div></td>
                  <td><div class="Rdata">1.00%</div></td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStageIncrease(doc);

      expect(result).toEqual([]);
    });

    test('handles positive percentages', () => {
      const html = `
        <html>
          <body>
            <div id="increaseAmount_stage">
              <table>
                <tr>
                  <th><div></div></th>
                  <th><div>近1周</div></th>
                </tr>
                <tr>
                  <td><div class="typeName">阶段涨幅</div></td>
                  <td><div class="Rdata ui-color-red bold">5.67%</div></td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStageIncrease(doc);

      expect(result).toHaveLength(1);
      expect(result[0].increase_percentage).toBe(5.67);
    });

    test('skips invalid percentage values', () => {
      const html = `
        <html>
          <body>
            <div id="increaseAmount_stage">
              <table>
                <tr>
                  <th><div></div></th>
                  <th><div>近1周</div></th>
                  <th><div>近1月</div></th>
                </tr>
                <tr>
                  <td><div class="typeName">阶段涨幅</div></td>
                  <td><div class="Rdata">invalid</div></td>
                  <td><div class="Rdata">2.50%</div></td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStageIncrease(doc);

      expect(result).toHaveLength(1);
      expect(result[0].stage).toBe('近1月');
      expect(result[0].increase_percentage).toBe(2.5);
    });

    test('handles partial stage columns', () => {
      const html = `
        <html>
          <body>
            <div id="increaseAmount_stage">
              <table>
                <tr>
                  <th><div></div></th>
                  <th><div>近1周</div></th>
                  <th><div>其他列</div></th>
                </tr>
                <tr>
                  <td><div class="typeName">阶段涨幅</div></td>
                  <td><div class="Rdata">1.00%</div></td>
                  <td><div class="Rdata">2.00%</div></td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const result = parseStageIncrease(doc);

      // 只有近1周被识别，其他列不是标准阶段名称
      expect(result).toHaveLength(1);
      expect(result[0].stage).toBe('近1周');
    });
  });

  describe('parseFundProfileFromHtml', () => {
    test('returns profile with fetched_at timestamp', () => {
      const html = `
        <html><body>
          <div id="position_shares"><table></table></div>
          <div id="increaseAmount_stage"><table></table></div>
        </body></html>
      `;
      const result = parseFundProfileFromHtml(html);

      expect(result).not.toBeNull();
      expect(result?.fetched_at).toBeDefined();
      expect(new Date(result!.fetched_at).toISOString()).toBe(result!.fetched_at);
    });

    test('returns empty arrays for empty HTML', () => {
      const result = parseFundProfileFromHtml('');

      expect(result).not.toBeNull();
      expect(result?.stock_positions).toEqual([]);
      expect(result?.stage_increase).toEqual([]);
    });

    test('parses both stock positions and stage increase', () => {
      const html = `
        <html>
          <body>
            <div id="position_shares">
              <table>
                <tr>
                  <td class="alignLeft"><a href="#" title="股票A">股票A</a></td>
                  <td class="alignRight bold">10.00%</td>
                </tr>
              </table>
            </div>
            <div id="increaseAmount_stage">
              <table>
                <tr>
                  <th><div></div></th>
                  <th><div>近1周</div></th>
                </tr>
                <tr>
                  <td><div class="typeName">阶段涨幅</div></td>
                  <td><div class="Rdata">2.50%</div></td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;
      const result = parseFundProfileFromHtml(html);

      expect(result).not.toBeNull();
      expect(result?.stock_positions).toHaveLength(1);
      expect(result?.stock_positions[0].stock_name).toBe('股票A');
      expect(result?.stage_increase).toHaveLength(1);
      expect(result?.stage_increase[0].stage).toBe('近1周');
    });

    test('returns profile with empty arrays for HTML without tables', () => {
      const html = '<html><body><div>No data</div></body></html>';
      const result = parseFundProfileFromHtml(html);

      expect(result).not.toBeNull();
      expect(result?.stock_positions).toEqual([]);
      expect(result?.stage_increase).toEqual([]);
    });
  });

  describe('refreshFundProfiles', () => {
    const createMockProfile = (): FundProfile => ({
      stock_positions: [{ stock_name: '股票A', percentage: 10.0 }],
      stage_increase: [{ stage: '近1周', increase_percentage: 1.5 }],
      fetched_at: new Date().toISOString(),
    });

    // 无延时的 delay 函数，用于测试
    const noDelay = () => Promise.resolve();

    test('returns success when no funds in portfolio', async () => {
      const getPortfolio = jest.fn().mockReturnValue([]);
      const onPortfolioUpdate = jest.fn();
      const mockFetch = jest.fn();

      const result = await refreshFundProfiles(getPortfolio, onPortfolioUpdate, mockFetch, noDelay);

      expect(result).toEqual({ success: true, message: '没有基金需要更新' });
      expect(onPortfolioUpdate).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('returns success when only indices in portfolio', async () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '上证指数', market: MarketType.INDEX },
      ];
      const getPortfolio = jest.fn().mockReturnValue(portfolio);
      const onPortfolioUpdate = jest.fn();
      const mockFetch = jest.fn();

      const result = await refreshFundProfiles(getPortfolio, onPortfolioUpdate, mockFetch, noDelay);

      expect(result).toEqual({ success: true, message: '没有基金需要更新' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('returns success when all funds fetched successfully', async () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '基金A', market: MarketType.FUND },
        { id: '2', symbol: '000002', name: '基金B', market: MarketType.FUND },
      ];
      const getPortfolio = jest.fn().mockReturnValue(portfolio);
      const onPortfolioUpdate = jest.fn();
      const mockFetch = jest.fn().mockResolvedValue(createMockProfile());

      const result = await refreshFundProfiles(getPortfolio, onPortfolioUpdate, mockFetch, noDelay);

      expect(result).toEqual({ success: true, message: '成功更新 2 只基金' });
      expect(onPortfolioUpdate).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('returns failure when all funds fail to fetch', async () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '基金A', market: MarketType.FUND },
        { id: '2', symbol: '000002', name: '基金B', market: MarketType.FUND },
      ];
      const getPortfolio = jest.fn().mockReturnValue(portfolio);
      const onPortfolioUpdate = jest.fn();
      const mockFetch = jest.fn().mockResolvedValue(null);

      const result = await refreshFundProfiles(getPortfolio, onPortfolioUpdate, mockFetch, noDelay);

      expect(result).toEqual({ success: false, message: '2 只基金更新失败' });
      expect(onPortfolioUpdate).not.toHaveBeenCalled();
    });

    test('returns failure with partial success message', async () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '基金A', market: MarketType.FUND },
        { id: '2', symbol: '000002', name: '基金B', market: MarketType.FUND },
        { id: '3', symbol: '000003', name: '基金C', market: MarketType.FUND },
      ];
      const getPortfolio = jest.fn().mockReturnValue(portfolio);
      const onPortfolioUpdate = jest.fn();
      const mockFetch = jest.fn()
        .mockResolvedValueOnce(createMockProfile()) // 基金A 成功
        .mockResolvedValueOnce(null) // 基金B 失败
        .mockResolvedValueOnce(createMockProfile()); // 基金C 成功

      const result = await refreshFundProfiles(getPortfolio, onPortfolioUpdate, mockFetch, noDelay);

      expect(result).toEqual({ success: false, message: '成功 2 只，失败 1 只基金' });
      expect(onPortfolioUpdate).toHaveBeenCalledTimes(1);
    });

    test('filters out indices and only processes funds', async () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '基金A', market: MarketType.FUND },
        { id: '2', symbol: '000300', name: '沪深300', market: MarketType.INDEX },
        { id: '3', symbol: '000002', name: '基金B', market: MarketType.FUND },
      ];
      const getPortfolio = jest.fn().mockReturnValue(portfolio);
      const onPortfolioUpdate = jest.fn();
      const mockFetch = jest.fn().mockResolvedValue(createMockProfile());

      const result = await refreshFundProfiles(getPortfolio, onPortfolioUpdate, mockFetch, noDelay);

      expect(result).toEqual({ success: true, message: '成功更新 2 只基金' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // 只调用了基金A和基金B，没有调用指数
      expect(mockFetch).toHaveBeenCalledWith('000001');
      expect(mockFetch).toHaveBeenCalledWith('000002');
    });

    test('updates portfolio with fetched profiles', async () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '基金A', market: MarketType.FUND },
      ];
      const getPortfolio = jest.fn().mockReturnValue(portfolio);
      const onPortfolioUpdate = jest.fn();
      const mockProfile = createMockProfile();
      const mockFetch = jest.fn().mockResolvedValue(mockProfile);

      await refreshFundProfiles(getPortfolio, onPortfolioUpdate, mockFetch, noDelay);

      expect(onPortfolioUpdate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: '000001',
            profile: mockProfile,
          }),
        ])
      );
    });

    test('uses latest portfolio when updating', async () => {
      // 第一次调用返回原始portfolio
      const originalPortfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '基金A', market: MarketType.FUND },
      ];
      // 第二次调用返回更新后的portfolio（模拟其他地方更新了portfolio）
      const updatedPortfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '更新后的基金A', market: MarketType.FUND },
      ];

      const getPortfolio = jest.fn()
        .mockReturnValueOnce(originalPortfolio)
        .mockReturnValueOnce(updatedPortfolio);
      const onPortfolioUpdate = jest.fn();
      const mockFetch = jest.fn().mockResolvedValue(createMockProfile());

      await refreshFundProfiles(getPortfolio, onPortfolioUpdate, mockFetch, noDelay);

      // 第二次调用是为了获取最新的portfolio进行更新
      expect(getPortfolio).toHaveBeenCalledTimes(2);
    });

    test('calls delay function between fund fetches', async () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '基金A', market: MarketType.FUND },
        { id: '2', symbol: '000002', name: '基金B', market: MarketType.FUND },
        { id: '3', symbol: '000003', name: '基金C', market: MarketType.FUND },
      ];
      const getPortfolio = jest.fn().mockReturnValue(portfolio);
      const onPortfolioUpdate = jest.fn();
      const mockFetch = jest.fn().mockResolvedValue(createMockProfile());
      const mockDelay = jest.fn().mockResolvedValue(undefined);

      await refreshFundProfiles(getPortfolio, onPortfolioUpdate, mockFetch, mockDelay);

      // 3只基金，中间有2次延时（基金A->B 和 B->C）
      expect(mockDelay).toHaveBeenCalledTimes(2);
      expect(mockDelay).toHaveBeenCalledWith(3000);
    });

    test('does not call delay after last fund', async () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '基金A', market: MarketType.FUND },
      ];
      const getPortfolio = jest.fn().mockReturnValue(portfolio);
      const onPortfolioUpdate = jest.fn();
      const mockFetch = jest.fn().mockResolvedValue(createMockProfile());
      const mockDelay = jest.fn().mockResolvedValue(undefined);

      await refreshFundProfiles(getPortfolio, onPortfolioUpdate, mockFetch, mockDelay);

      // 只有1只基金，不需要延时
      expect(mockDelay).not.toHaveBeenCalled();
    });
  });
});