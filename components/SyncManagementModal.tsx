import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface SyncConfig {
  eggfundUsername: string;
  eggfundPassword: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: SyncConfig) => void;
  initialConfig?: SyncConfig;
}

const SyncManagementModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialConfig }) => {
  const [username, setUsername] = useState(initialConfig?.eggfundUsername || '');
  const [password, setPassword] = useState(initialConfig?.eggfundPassword || '');
  const [testResult, setTestResult] = useState<{success: boolean; message: string} | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // 如果模态框关闭，清除测试结果
  useEffect(() => {
    if (!isOpen) {
      setTestResult(null);
    }
  }, [isOpen]);

  const handleSave = () => {
    onSave({ eggfundUsername: username, eggfundPassword: password });
    onClose();
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      // TODO: 实现实际的连接测试逻辑
      // 模拟连接测试延迟
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 模拟连接成功
      setTestResult({
        success: true,
        message: '连接成功！'
      });
    } catch (error: any) {
      setTestResult({
        success: false,
        message: `连接失败: ${error.message || '未知错误'}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-management-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal body */}
      <div className="relative bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 id="sync-management-title" className="text-base font-bold text-gray-800">
            同步配置管理
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
            aria-label="关闭"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
              Eggfund 用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="请输入用户名"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Eggfund 密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="请输入密码"
            />
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !username || !password}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-colors ${
                isTesting || !username || !password
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
            >
              {isTesting ? '测试中...' : '测试连接'}
            </button>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl text-sm ${
                testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              <div className="font-medium">
                {testResult.success ? '✓ ' : '✗ '}
                {testResult.message}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-4 text-sm font-bold text-gray-400 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <div className="w-px bg-gray-100" />
          <button
            onClick={handleSave}
            disabled={!username || !password}
            className={`flex-1 py-4 text-sm font-bold transition-colors ${
              !username || !password
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-blue-600 hover:bg-blue-50'
            }`}
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SyncManagementModal;