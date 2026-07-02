/**
 * components/config/SystemResourcePanel.tsx
 *
 * 系统资源面板 - 显示 localStorage 使用情况
 */

import React, { useState, useEffect } from 'react';
import { STORAGE_KEYS } from '../../services/storageKeys';

interface StorageUsage {
  usedBytes: number;
  totalBytes: number;
  usedPercentage: number;
  usedMB: string;
  remainingMB: string;
  isWarning: boolean;
  // FundTracker相关数据统计
  fundTrackerBytes: number;
  fundTrackerPercentage: number;
  fundTrackerMB: string;
  fundTrackerKeys: string[];
  // 无关数据统计
  unrelatedBytes: number;
  unrelatedPercentage: number;
  unrelatedMB: string;
  unrelatedKeys: string[];
  // 每个key的大小（预计算）
  keyBytes: Record<string, number>;
}

/**
 * 内存使用情况接口
 */
interface MemoryUsage {
  // JS 堆内存
  totalJSHeapSize: number;      // 总容量（字节）
  usedJSHeapSize: number;       // 已使用（字节）
  jsHeapSizeLimit: number;      // 最大限制（字节）
  usedPercentage: number;       // 使用百分比

  // DOM 统计
  domNodeCount: number;         // DOM 节点总数
  domTreeDepth: number;         // DOM 树深度

  // 兼容性
  isSupported: boolean;         // 是否支持 performance.memory
}

// localStorage 估算容量（浏览器通常为 5-10MB）
const ESTIMATED_TOTAL_BYTES = 5 * 1024 * 1024; // 5MB
const WARNING_THRESHOLD = 80; // 80%

// 动态获取所有FundTracker相关的key集合
const getFundTrackerKeySet = (): Set<string> => {
  const keys = new Set<string>();
  // 遍历STORAGE_KEYS对象，获取所有定义的key值
  Object.values(STORAGE_KEYS).forEach(value => {
    keys.add(value);
  });
  return keys;
};

// 格式化字节大小
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/**
 * 计算 DOM 树深度
 * @returns DOM 树的最大深度
 */
const calculateDomTreeDepth = (): number => {
  const getMaxDepth = (element: Element, depth: number): number => {
    const children = element.children;
    if (children.length === 0) return depth;

    let maxChildDepth = depth;
    for (let i = 0; i < children.length; i++) {
      maxChildDepth = Math.max(maxChildDepth, getMaxDepth(children[i], depth + 1));
    }
    return maxChildDepth;
  };

  return getMaxDepth(document.body, 1);
};

/**
 * 创建默认内存使用情况对象
 * @param domNodeCount DOM 节点数量
 * @param domTreeDepth DOM 树深度
 * @returns 默认的 MemoryUsage 对象
 */
const createDefaultMemoryUsage = (domNodeCount: number, domTreeDepth: number): MemoryUsage => ({
  totalJSHeapSize: 0,
  usedJSHeapSize: 0,
  jsHeapSizeLimit: 0,
  usedPercentage: 0,
  domNodeCount,
  domTreeDepth,
  isSupported: false
});

/**
 * 获取内存使用情况
 * @returns MemoryUsage 或 null（获取失败时）
 */
const getMemoryUsage = (): MemoryUsage | null => {
  try {
    // 统计 DOM 节点和深度（所有浏览器都支持）
    const domNodeCount = document.querySelectorAll('*').length;
    const domTreeDepth = calculateDomTreeDepth();

    // 检查 performance.memory API 是否存在（仅 Chrome 支持）
    if (!('memory' in performance)) {
      return createDefaultMemoryUsage(domNodeCount, domTreeDepth);
    }

    const memory = (performance as any).memory;

    // 验证数据有效性
    if (!memory || !memory.totalJSHeapSize || !memory.usedJSHeapSize) {
      console.warn('内存数据异常:', memory);
      return createDefaultMemoryUsage(domNodeCount, domTreeDepth);
    }

    return {
      totalJSHeapSize: memory.totalJSHeapSize,
      usedJSHeapSize: memory.usedJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usedPercentage: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100,
      domNodeCount,
      domTreeDepth,
      isSupported: true
    };
  } catch (error) {
    console.error('获取内存数据失败:', error);
    return null;
  }
};

const SystemResourcePanel: React.FC = () => {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [showDetails, setShowDetails] = useState(false); // 折叠状态
  const [memoryUsage, setMemoryUsage] = useState<MemoryUsage | null>(null); // 内存使用情况

  // 导出 localStorage 内容到 JSON 文件
  const handleExportLocalStorage = () => {
    const exportData: Record<string, string> = {};

    // 遍历所有 localStorage 键值对
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          exportData[key] = value;
        }
      }
    }

    // 添加导出元数据
    const exportObject = {
      exportTime: new Date().toISOString(),
      exportTimeLocal: new Date().toLocaleString(),
      totalKeys: Object.keys(exportData).length,
      data: exportData
    };

    // 转换为 JSON 字符串
    const jsonString = JSON.stringify(exportObject, null, 2);

    // 创建 Blob 并下载
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // 生成文件名（包含日期）
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const fileName = `localStorage-export-${dateStr}.json`;

    // 创建下载链接
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    // 清理
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const calculateStorageUsage = (): StorageUsage => {
      let totalUsedBytes = 0;
      let fundTrackerBytes = 0;
      let unrelatedBytes = 0;
      const fundTrackerKeys: string[] = [];
      const unrelatedKeys: string[] = [];
      const keyBytes: Record<string, number> = {};

      // 获取FundTracker相关的key集合
      const fundTrackerKeySet = getFundTrackerKeySet();

      // Iterate through all localStorage keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value !== null) {
            // Calculate the actual bytes stored (key + value)
            const itemBytes = (key.length + value.length) * 2; // UTF-16: 2 bytes per char
            keyBytes[key] = itemBytes;
            totalUsedBytes += itemBytes;

            // 判断是否为FundTracker相关的key
            if (fundTrackerKeySet.has(key)) {
              fundTrackerBytes += itemBytes;
              fundTrackerKeys.push(key);
            } else {
              unrelatedBytes += itemBytes;
              unrelatedKeys.push(key);
            }
          }
        }
      }

      const usedPercentage = Math.min(100, (totalUsedBytes / ESTIMATED_TOTAL_BYTES) * 100);
      const fundTrackerPercentage = Math.min(100, (fundTrackerBytes / ESTIMATED_TOTAL_BYTES) * 100);
      const unrelatedPercentage = Math.min(100, (unrelatedBytes / ESTIMATED_TOTAL_BYTES) * 100);
      const remainingBytes = ESTIMATED_TOTAL_BYTES - totalUsedBytes;

      return {
        usedBytes: totalUsedBytes,
        totalBytes: ESTIMATED_TOTAL_BYTES,
        usedPercentage,
        usedMB: formatBytes(totalUsedBytes),
        remainingMB: formatBytes(Math.max(0, remainingBytes)),
        isWarning: usedPercentage >= WARNING_THRESHOLD,
        fundTrackerBytes,
        fundTrackerPercentage,
        fundTrackerMB: formatBytes(fundTrackerBytes),
        fundTrackerKeys,
        unrelatedBytes,
        unrelatedPercentage,
        unrelatedMB: formatBytes(unrelatedBytes),
        unrelatedKeys,
        keyBytes,
      };
    };

    setUsage(calculateStorageUsage());
  }, []);

  // 每 5 秒自动更新内存数据
  useEffect(() => {
    const updateMemory = () => {
      setMemoryUsage(getMemoryUsage());
    };

    // 初始化时立即获取一次
    updateMemory();

    // 每 5 秒刷新一次
    const intervalId = setInterval(updateMemory, 5000);

    // 清理定时器
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="space-y-6">
      {/* localStorage 使用情况 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-hdd text-blue-500 mr-2"></i>
          localStorage 使用情况
        </h3>

        {usage && (
          <div className="space-y-4">
            {/* 进度条 - 分段显示不同类型数据 */}
            <div className="relative">
              <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden flex">
                {/* FundTracker相关数据 - 蓝色 */}
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${usage.fundTrackerPercentage}%` }}
                />
                {/* 无关数据 - 黄色 */}
                <div
                  className="h-full bg-yellow-500 transition-all duration-300"
                  style={{ width: `${usage.unrelatedPercentage}%` }}
                />
              </div>
              {/* 百分比标签 */}
              <span className={`absolute top-0 right-0 text-xs font-medium ${
                usage.isWarning ? 'text-red-600' : 'text-gray-600'
              }`}>
                {usage.usedPercentage.toFixed(1)}%
              </span>
            </div>

            {/* 详细数值 */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">已使用: <strong>{usage.usedMB}</strong></span>
              <span className="text-gray-600">净使用: <strong className="text-blue-600">{usage.fundTrackerMB}</strong></span>
              <span className="text-gray-600">剩余: <strong>{usage.remainingMB}</strong></span>
            </div>

            {/* 折叠/展开按钮 */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <i className={`fas fa-chevron-${showDetails ? 'up' : 'down'}`}></i>
              <span>{showDetails ? '收起详情' : '展开详情'}</span>
            </button>

            {/* 数据分类详情 - 可折叠 */}
            {showDetails && (
              <div className="mt-4 space-y-3">
                {/* FundTracker相关数据 */}
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-700 flex items-center">
                      <i className="fas fa-database text-blue-500 mr-2"></i>
                      FundTracker 数据 ({usage.fundTrackerKeys.length} 项)
                    </span>
                    <span className="text-sm font-bold text-blue-600">{usage.fundTrackerMB}</span>
                  </div>
                  {usage.fundTrackerKeys.length > 0 && (
                    <div className="text-xs text-blue-600 space-y-1">
                      {usage.fundTrackerKeys.map(key => (
                        <div key={key} className="flex justify-between">
                          <span>{key}</span>
                          <span>{formatBytes(usage.keyBytes[key] || 0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {usage.fundTrackerKeys.length === 0 && (
                    <div className="text-xs text-gray-500">暂无数据</div>
                  )}
                </div>

                {/* 无关数据 */}
                {usage.unrelatedKeys.length > 0 && (
                  <div className="bg-yellow-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-yellow-700 flex items-center">
                        <i className="fas fa-external-link-square-alt text-yellow-500 mr-2"></i>
                        其他数据 ({usage.unrelatedKeys.length} 项)
                      </span>
                      <span className="text-sm font-bold text-yellow-600">{usage.unrelatedMB}</span>
                    </div>
                    <div className="text-xs text-yellow-600 space-y-1">
                      {usage.unrelatedKeys.map(key => (
                        <div key={key} className="flex justify-between">
                          <span>{key}</span>
                          <span>{formatBytes(usage.keyBytes[key] || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 导出按钮 */}
            <div className="mt-4">
              <button
                onClick={handleExportLocalStorage}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                <i className="fas fa-download"></i>
                <span>导出 localStorage 内容</span>
              </button>
            </div>

            {/* 警告信息 */}
            {usage.isWarning && (
              <div className="bg-red-50 rounded-lg p-3 flex items-center space-x-2">
                <i className="fas fa-exclamation-triangle text-red-500 text-sm"></i>
                <span className="text-sm text-red-700">
                  localStorage 空间使用超过 {WARNING_THRESHOLD}%，建议清理历史数据或导出备份
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* JavaScript 内存使用情况 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-memory text-green-500 mr-2"></i>
          JavaScript 内存使用情况
        </h3>

        {memoryUsage && (
          <div className="space-y-4">
            {/* JS 堆内存 */}
            {memoryUsage.isSupported ? (
              <div className="space-y-2">
                {(() => {
                  const isWarning = memoryUsage.usedPercentage >= 80;
                  return (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 font-medium">JS 堆内存</span>
                        <span className={`text-xs font-bold ${isWarning ? 'text-red-600' : 'text-gray-600'}`}>
                          {memoryUsage.usedPercentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="relative">
                        <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${isWarning ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(100, memoryUsage.usedPercentage)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">已使用: <strong>{formatBytes(memoryUsage.usedJSHeapSize)}</strong></span>
                        <span className="text-gray-600">总容量: <strong>{formatBytes(memoryUsage.totalJSHeapSize)}</strong></span>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="bg-yellow-50 rounded-lg p-3 flex items-start space-x-2">
                <i className="fas fa-exclamation-triangle text-yellow-500 text-sm mt-0.5"></i>
                <div className="text-sm text-yellow-700">
                  <p className="font-medium">当前浏览器不支持内存 API</p>
                  <p className="text-xs mt-1">建议使用 Chrome 浏览器查看完整数据</p>
                </div>
              </div>
            )}

            {/* DOM 统计 */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">DOM 统计</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>节点数量: <strong>{memoryUsage.domNodeCount.toLocaleString()} 个</strong></span>
                <span>树深度: <strong>{memoryUsage.domTreeDepth} 层</strong></span>
              </div>
            </div>

            {/* 提示信息 */}
            <div className="bg-blue-50 rounded-lg p-3 flex items-center space-x-2">
              <i className="fas fa-info-circle text-blue-500 text-sm"></i>
              <span className="text-xs text-blue-700">
                💡 数据每 5 秒自动更新 (仅 Chrome 浏览器支持内存 API)
              </span>
            </div>
          </div>
        )}

        {!memoryUsage && (
          <div className="text-sm text-gray-500 text-center py-4">
            加载中...
          </div>
        )}
      </div>

      {/* 说明 */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center">
          <i className="fas fa-info-circle text-gray-500 mr-2"></i>
          说明
        </h3>
        <ul className="text-sm text-gray-500 space-y-2">
          <li className="flex items-start">
            <i className="fas fa-check text-green-500 mt-1 mr-2 text-xs"></i>
            <span>localStorage 估算容量为 5MB，实际容量因浏览器而异</span>
          </li>
          <li className="flex items-start">
            <i className="fas fa-check text-blue-500 mt-1 mr-2 text-xs"></i>
            <span><strong className="text-blue-600">FundTracker 数据</strong>：以 storageKeys.ts 中定义的 key 为准，显示本系统实际使用的存储空间</span>
          </li>
          <li className="flex items-start">
            <i className="fas fa-check text-gray-400 mt-1 mr-2 text-xs"></i>
            <span><strong className="text-gray-600">其他数据</strong>：非本系统定义的 key，可能来自浏览器扩展或其他同域应用</span>
          </li>
          <li className="flex items-start">
            <i className="fas fa-check text-green-500 mt-1 mr-2 text-xs"></i>
            <span><strong className="text-blue-600">净使用</strong>：仅统计 FundTracker 相关数据，便于跨环境对比真实使用量</span>
          </li>
          <li className="flex items-start">
            <i className="fas fa-check text-green-500 mt-1 mr-2 text-xs"></i>
            <span>当使用超过 80% 时，百分比标签会变为红色并显示警告信息</span>
          </li>
          <li className="flex items-start">
            <i className="fas fa-check text-green-500 mt-1 mr-2 text-xs"></i>
            <span><strong className="text-green-600">JS 堆内存</strong>：显示当前页面的 JavaScript 内存占用（仅 Chrome 支持）</span>
          </li>
          <li className="flex items-start">
            <i className="fas fa-check text-green-500 mt-1 mr-2 text-xs"></i>
            <span><strong className="text-green-600">DOM 统计</strong>：显示当前页面的 DOM 节点数量和树深度（所有浏览器支持）</span>
          </li>
          <li className="flex items-start">
            <i className="fas fa-check text-green-500 mt-1 mr-2 text-xs"></i>
            <span>内存数据每 5 秒自动刷新，当使用超过 80% 时进度条变为红色</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default SystemResourcePanel;