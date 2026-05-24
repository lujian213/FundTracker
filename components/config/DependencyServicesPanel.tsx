/**
 * DependencyServicesPanel.tsx
 *
 * 依赖服务配置面板 - 显示和检测系统依赖的外部服务状态
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  getAllDependencies,
  checkAllDependencies,
  DependencyStatus,
  DependencyMeta,
} from '../../services/dependencyService';

// 详情弹窗组件
const DetailDialog: React.FC<{
  status: DependencyStatus | null;
  onClose: () => void;
}> = ({ status, onClose }) => {
  if (!status) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl p-6 max-w-md w-full shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-gray-800 mb-4">服务详情</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">服务名称</span>
            <span className="font-medium text-gray-800">{status.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">服务类型</span>
            <span className="text-gray-800">
              {status.category === 'proxy' ? '代理服务' : '搜索服务'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">状态</span>
            <span className={status.healthy ? 'text-green-600' : 'text-red-600'}>
              {status.healthy ? '● 正常' : '● 异常'}
            </span>
          </div>
          {status.healthy && status.responseTime && (
            <div className="flex justify-between">
              <span className="text-gray-500">响应时间</span>
              <span className="text-gray-800">{status.responseTime}ms</span>
            </div>
          )}
          {!status.healthy && status.error && (
            <div>
              <span className="text-gray-500">错误信息</span>
              <p className="mt-1 text-red-600 text-xs bg-red-50 rounded p-2">
                {status.error}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="mt-6 w-full py-2 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200"
        >
          关闭
        </button>
      </div>
    </div>,
    document.body
  );
};

// 服务行组件
const ServiceRow: React.FC<{
  name: string;
  status?: DependencyStatus;
  onShowDetail: (status: DependencyStatus) => void;
}> = ({ name, status, onShowDetail }) => {
  const hasError = status && !status.healthy;

  return (
    <div
      className={`flex justify-between items-center px-4 py-2 border-b border-gray-100 last:border-b-0 ${
        hasError ? 'bg-orange-50' : ''
      }`}
    >
      <span className="text-gray-800 text-sm">{name}</span>
      <div className="flex items-center gap-2">
        {status ? (
          <>
            <span className={`text-sm ${status.healthy ? 'text-green-600' : 'text-red-600'}`}>
              {status.healthy ? '● 正常' : '● 异常'}
            </span>
            <button
              onClick={() => onShowDetail(status)}
              className="text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5 text-xs"
            >
              详情
            </button>
          </>
        ) : (
          <span className="text-gray-400 text-sm">未检查</span>
        )}
      </div>
    </div>
  );
};

// 服务区块组件
const ServiceSection: React.FC<{
  title: string;
  dependencies: DependencyMeta[];
  getStatus: (name: string) => DependencyStatus | undefined;
  onShowDetail: (status: DependencyStatus) => void;
}> = ({ title, dependencies, getStatus, onShowDetail }) => (
  <div className="mb-6">
    <div className="font-semibold text-gray-600 mb-3 text-sm">
      {title} ({dependencies.length})
    </div>
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {dependencies.map(dep => (
        <ServiceRow
          key={dep.name}
          name={dep.name}
          status={getStatus(dep.name)}
          onShowDetail={onShowDetail}
        />
      ))}
    </div>
  </div>
);

const DependencyServicesPanel: React.FC = () => {
  const [checking, setChecking] = useState(false);
  const [statuses, setStatuses] = useState<DependencyStatus[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<DependencyStatus | null>(null);

  // 静态配置，只需计算一次
  const { proxyDependencies, searchDependencies } = useMemo(() => {
    const all = getAllDependencies();
    return {
      proxyDependencies: all.filter(d => d.category === 'proxy'),
      searchDependencies: all.filter(d => d.category === 'search'),
    };
  }, []);

  const getStatus = (name: string): DependencyStatus | undefined =>
    statuses.find(s => s.name === name);

  const handleCheck = async () => {
    setChecking(true);
    setStatuses([]);
    try {
      const results = await checkAllDependencies();
      setStatuses(results);
    } catch (error: any) {
      console.error('检测依赖服务失败:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleShowDetail = (status: DependencyStatus) => {
    setSelectedStatus(status);
  };

  const handleCloseDialog = () => {
    setSelectedStatus(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
        <p>检查系统依赖的外部服务状态。结果不保存，每次需手动检查。</p>
      </div>

      <ServiceSection
        title="代理服务"
        dependencies={proxyDependencies}
        getStatus={getStatus}
        onShowDetail={handleShowDetail}
      />

      <ServiceSection
        title="搜索服务"
        dependencies={searchDependencies}
        getStatus={getStatus}
        onShowDetail={handleShowDetail}
      />

      <button
        onClick={handleCheck}
        disabled={checking}
        className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
          checking
            ? 'bg-gray-100 text-gray-400 cursor-wait'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {checking ? (
          <span className="flex items-center justify-center gap-2">
            <i className="fas fa-spinner fa-spin" />
            正在检查...
          </span>
        ) : statuses.length > 0 ? (
          '重新检查'
        ) : (
          '状态检查'
        )}
      </button>

      <DetailDialog
        status={selectedStatus}
        onClose={handleCloseDialog}
      />
    </div>
  );
};

export default DependencyServicesPanel;