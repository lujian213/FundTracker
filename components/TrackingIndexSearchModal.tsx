import React, { useState, useCallback } from 'react';
import { fetchWithProxy } from '../services/proxyService';
import { extractJsonFromMarkdown } from '../utils/jsonParseUtils';

interface TrackingIndexSearchModalProps {
  onSelect: (code: string) => void;
  onClose: () => void;
  zIndex: number;
}

interface SearchResult {
  fullCode: string;   // 完整代码，如 "1.000819"
  code: string;       // 纯代码，如 "000819"
  name: string;
  changePercent: number;
  diff: number;
}

/**
 * 跟踪指数搜索弹窗
 * - 输入关键字和参考涨跌幅
 * - 搜索匹配的指数/板块
 * - 按接近程度排序，显示前3个结果
 */
export function TrackingIndexSearchModal({
  onSelect,
  onClose,
  zIndex,
}: TrackingIndexSearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const [targetPercent, setTargetPercent] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 搜索处理函数
  const handleSearch = useCallback(async () => {
    if (!keyword.trim()) {
      setError('请输入关键字');
      return;
    }

    const target = parseFloat(targetPercent);
    if (isNaN(target)) {
      setError('请输入有效的涨跌幅');
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      // 1. 搜索指数/板块
      const searchUrl = `https://search-codetable.eastmoney.com/codetable/search/web/market?keyword=${encodeURIComponent(keyword.trim())}&label=ALL&pageIndex=1&pageSize=30`;
      const searchResult = await fetchWithProxy(searchUrl, {
        preferFormat: 'raw',
        timeout: 10000
      });

      // 根据返回格式处理内容
      let content = searchResult.content;
      if (searchResult.format === 'markdown') {
        content = extractJsonFromMarkdown(content);
      }

      // 检查返回内容是否有效
      if (!content || content.startsWith('<!') || content.startsWith('<html')) {
        setError('搜索服务暂时不可用，请稍后重试');
        setLoading(false);
        return;
      }

      let searchData;
      try {
        searchData = JSON.parse(content);
      } catch (e) {
        setError('搜索返回数据格式错误');
        setLoading(false);
        return;
      }

      if (!searchData.result?.labelList) {
        setError('搜索失败，请重试');
        setLoading(false);
        return;
      }

      // 2. 提取指数和板块，同时保存 market 信息
      const items: { market: number; code: string; name: string }[] = [];
      const itemMap = new Map<string, { market: number; name: string }>(); // 用于查找 market

      for (const label of searchData.result.labelList) {
        if (label.type === 'INDEX' && label.quoteList) {
          for (const item of label.quoteList) {
            items.push({
              market: item.market,
              code: item.code,
              name: item.shortName
            });
            itemMap.set(item.code, { market: item.market, name: item.shortName });
          }
        }
        if (label.type === 'BK' && label.quoteList) {
          for (const item of label.quoteList) {
            items.push({
              market: item.market,
              code: item.code,
              name: item.shortName
            });
            itemMap.set(item.code, { market: item.market, name: item.shortName });
          }
        }
      }

      if (items.length === 0) {
        setError('未找到匹配的指数或板块');
        setLoading(false);
        return;
      }

      // 3. 批量获取涨跌幅
      const secids = items.map(item => `${item.market}.${item.code}`).join(',');
      const UT = 'fa1a66105171779fbdd067425f38a7c2';
      const quoteUrl = `https://push2delay.eastmoney.com/api/qt/ulist.np/get?ut=${UT}&fltt=2&invt=2&fields=f12,f14,f2,f3,f4,f5,f6,f7&secids=${secids}&_=${Date.now()}`;
      const quoteResult = await fetchWithProxy(quoteUrl, {
        preferFormat: 'raw',
        timeout: 10000
      });

      // 根据返回格式处理内容
      let quoteContent = quoteResult.content;
      if (quoteResult.format === 'markdown') {
        quoteContent = extractJsonFromMarkdown(quoteContent);
      }

      // 检查返回内容是否有效
      if (!quoteContent || quoteContent.startsWith('<!') || quoteContent.startsWith('<html')) {
        setError('行情服务暂时不可用，请稍后重试');
        setLoading(false);
        return;
      }

      let quoteData;
      try {
        quoteData = JSON.parse(quoteContent);
      } catch (e) {
        setError('行情返回数据格式错误');
        setLoading(false);
        return;
      }

      if (!quoteData.data?.diff) {
        setError('获取行情失败，请重试');
        setLoading(false);
        return;
      }

      // 4. 计算差距并排序
      const resultsWithDiff: SearchResult[] = quoteData.data.diff
        .filter((item: any) => item.f3 !== null && item.f3 !== undefined)
        .map((item: any) => {
          const code = item.f12;
          const info = itemMap.get(code) || { market: 0, name: item.f14 };
          return {
            fullCode: `${info.market}.${code}`,
            code: code,
            name: item.f14 || info.name,
            changePercent: item.f3,
            diff: Math.abs(item.f3 - target)
          };
        })
        .sort((a: SearchResult, b: SearchResult) => a.diff - b.diff)
        .slice(0, 3);

      setResults(resultsWithDiff);

      if (resultsWithDiff.length === 0) {
        setError('未找到有涨跌幅数据的结果');
      }
    } catch (err) {
      console.error('搜索失败:', err);
      setError('搜索失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  }, [keyword, targetPercent]);

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-lg w-full max-w-sm p-4 z-30">
        <h3 className="text-base font-bold mb-3">搜索指数/板块</h3>

        <div className="space-y-3">
          {/* 关键字输入 */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-600 w-20">关键字</label>
            <input
              type="text"
              className="flex-1 px-2 py-1 border rounded text-sm"
              placeholder="如: 有色金属"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>

          {/* 参考涨跌幅输入 */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-600 w-20">参考涨跌幅</label>
            <div className="flex items-center flex-1">
              <input
                type="number"
                step="0.01"
                className="flex-1 px-2 py-1 border rounded text-sm text-right [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="如: 1.68"
                value={targetPercent}
                onChange={(e) => setTargetPercent(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <span className="ml-1 text-sm text-gray-500">%</span>
            </div>
          </div>

          {/* 搜索按钮 */}
          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full py-1.5 rounded bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '搜索中...' : '搜索'}
          </button>

          {/* 错误提示 */}
          {error && (
            <div className="text-xs text-red-500 text-center">{error}</div>
          )}

          {/* 搜索结果 */}
          {results.length > 0 && (
            <div className="border-t pt-3 mt-3">
              <div className="text-xs text-gray-500 mb-2">最匹配的结果：</div>
              <div className="space-y-1">
                {results.map((result, index) => (
                  <button
                    key={result.fullCode}
                    onClick={() => onSelect(result.fullCode)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4">{index + 1}</span>
                      <div>
                        <div className="text-sm font-medium text-gray-800">{result.fullCode}</div>
                        <div className="text-xs text-gray-500">{result.name}</div>
                      </div>
                    </div>
                    <div className={`text-sm font-medium ${result.changePercent >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {result.changePercent >= 0 ? '+' : ''}{result.changePercent.toFixed(2)}%
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 关闭按钮 */}
        <div className="mt-4 flex justify-end">
          <button
            className="px-3 py-1 rounded bg-gray-100 text-sm"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export default TrackingIndexSearchModal;