/**
 * components/config/SyncPanel.tsx
 *
 * 同步管理面板，包含 Eggfund 账户配置和同步功能。
 */

import React, { useState, useEffect } from 'react';
import { testConnection } from '../../services/eggfundService';

interface SyncConfig {
  eggfundUsername: string;
  eggfundPassword: string;
}

interface SyncPanelProps {
  onSyncNow?: () => void;
}

const SyncPanel: React.FC<SyncPanelProps> = ({ onSyncNow }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [testResult, setTestResult] = useState<{success: boolean; message: string} | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 加载已保存的配置
  useEffect(() => {
    const savedConfig = localStorage.getItem('eggfund_sync_config');
    if (savedConfig) {
      try {
        const config: SyncConfig = JSON.parse(savedConfig);
        setUsername(config.eggfundUsername || '');
        setPassword(config.eggfundPassword || '');
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  // 测试结果延迟2秒后自动清除
  useEffect(() => {
    if (testResult) {
      const timer = setTimeout(() => {
        setTestResult(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [testResult]);

  const handleSave = async () => {
    if (!username.trim() || !password.trim()) {
      setTestResult({ success: false, message: '请填写用户名和密码' });
      return;
    }

    setIsSaving(true);
    try {
      const config: SyncConfig = {
        eggfundUsername: username.trim(),
        eggfundPassword: password,
      };
      localStorage.setItem('eggfund_sync_config', JSON.stringify(config));
      setTestResult({ success: true, message: '配置已保存' });
    } catch {
      setTestResult({ success: false, message: '保存失败' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!username.trim() || !password.trim()) {
      setTestResult({ success: false, message: '请填写用户名和密码' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testConnection(username, password);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({
        success: false,
        message: `连接失败: ${error.message || '未知错误'}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncNowClick = () => {
    // 检查配置是否完整
    const configStr = localStorage.getItem('eggfund_sync_config');
    if (!configStr) {
      setTestResult({ success: false, message: '请先保存同步配置' });
      return;
    }
    try {
      const config = JSON.parse(configStr);
      if (!config.eggfundUsername || !config.eggfundPassword) {
        setTestResult({ success: false, message: '同步配置信息不完整，请检查用户名和密码' });
        return;
      }
    } catch {
      setTestResult({ success: false, message: '同步配置格式错误' });
      return;
    }

    if (onSyncNow) {
      onSyncNow();
    }
  };

  return (
    <div className="space-y-6">
      {/* Eggfund 账户配置 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-user-circle text-blue-500 mr-2"></i>
          Eggfund 账户
        </h3>

        <div className="space-y-4">
          <div>
            <label htmlFor="sync-username" className="block text-sm font-medium text-gray-700 mb-2">
              用户名
            </label>
            <input
              id="sync-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="请输入用户名"
            />
          </div>

          <div>
            <label htmlFor="sync-password" className="block text-sm font-medium text-gray-700 mb-2">
              密码
            </label>
            <input
              id="sync-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="请输入密码"
            />
          </div>
        </div>
      </div>

      {/* 连接测试 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center">
            <i className="fas fa-wifi text-blue-500 mr-2"></i>
            连接测试
          </h3>
          <div className="w-[200px] flex justify-end">
            {testResult ? (
              <div className={`px-3 py-1 rounded-lg text-sm font-medium truncate ${
                testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {testResult.success ? '✓ ' : '✗ '}
                {testResult.message}
              </div>
            ) : (
              <div className="px-3 py-1 rounded-lg text-sm font-medium invisible">占位</div>
            )}
          </div>
        </div>

        <div className="space-y-4">
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

            <button
              onClick={handleSave}
              disabled={isSaving || !username || !password}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-colors ${
                isSaving || !username || !password
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isSaving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </div>
      </div>

      {/* 立即同步 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-sync-alt text-blue-500 mr-2"></i>
          立即同步
        </h3>

        <p className="text-sm text-gray-500 mb-4">
          立即从 Eggfund 同步最新的交易数据到本地。
        </p>

        <button
          onClick={handleSyncNowClick}
          className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
        >
          <i className="fas fa-sync-alt"></i>
          <span>立即同步</span>
        </button>
      </div>
    </div>
  );
};

export default SyncPanel;