import React, { useState, useEffect } from 'react';
import {
  Cloud,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Sliders,
  ShieldCheck,
  Upload,
  Download,
} from 'lucide-react';
import { useSyncStore } from '../../stores/syncStore';
import { showSuccess, showError, showWarning } from '../../utils/notification';
import { requestConfirm } from '../../stores/confirmStore';
import { useT } from '../../i18n';

export const WebDavSyncSection: React.FC = () => {
  const {
    config,
    setConfig,
    isTesting,
    testResult,
    testConnection,
    isSyncing,
    lastSyncTime,
    hasRemoteUpdate,
    hasBackup,
    sync,
    forcePush,
    forcePull,
    restoreBackup,
    init,
  } = useSyncStore();

  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const t = useT();

  useEffect(() => {
    init();
  }, [init]);

  const handleTest = async () => {
    if (!config.serverUrl.trim()) {
      showWarning(t('请先输入 WebDAV 服务器地址'));
      return;
    }
    const ok = await testConnection();
    if (ok) {
      showSuccess(t('WebDAV 服务连接成功！'));
    }
  };

  const handleSync = async () => {
    if (!config.serverUrl.trim()) {
      showWarning(t('请先配置并测试 WebDAV 地址'));
      return;
    }

    const result = await sync();
    if (result.success) {
      showSuccess(t(result.message));
    } else {
      showError(t(result.message));
    }
  };

  const handleForcePush = async () => {
    if (!config.serverUrl.trim()) {
      showWarning(t('请先配置并测试 WebDAV 地址'));
      return;
    }

    const ok = await requestConfirm({
      title: t('强制推送覆盖云端？'),
      message: t('此操作将以本地当前的会话、模型配置与文件夹完整覆盖云端数据文件。确定要强制推送吗？'),
      confirmLabel: t('强制覆盖云端'),
      cancelLabel: t('取消'),
      danger: true,
    });
    if (!ok) return;

    const result = await forcePush();
    if (result.success) {
      showSuccess(t(result.message));
    } else {
      showError(t(result.message));
    }
  };

  const handleForcePull = async () => {
    if (!config.serverUrl.trim()) {
      showWarning(t('请先配置并测试 WebDAV 地址'));
      return;
    }

    const ok = await requestConfirm({
      title: t('完全以云端覆盖本地？'),
      message: t(
        '此操作将清空本地全部会话、模型配置与文件夹，并完全载入云端数据。\n系统已自动备份本地数据，如操作失误可随时点击「撤销恢复」。是否继续？'
      ),
      confirmLabel: t('确认覆盖本地'),
      cancelLabel: t('取消'),
      danger: true,
    });
    if (!ok) return;

    const result = await forcePull();
    if (result.success) {
      showSuccess(t(result.message));
    } else {
      showError(t(result.message));
    }
  };

  const handleRestore = async () => {
    const ok = await requestConfirm({
      title: t('撤销上一次同步？'),
      message: t('将本地数据还原至上一次同步前的快照状态。确定要继续吗？'),
      confirmLabel: t('撤销恢复'),
      cancelLabel: t('取消'),
    });
    if (!ok) return;

    const result = await restoreBackup();
    if (result.success) {
      showSuccess(t(result.message));
    } else {
      showError(t(result.message));
    }
  };

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 space-y-4">
      {/* 头部标题与说明 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Cloud className="text-neutral-700" size={18} />
          <h3 className="text-sm font-medium text-neutral-800">
            {t('WebDAV 云同步')}
          </h3>
        </div>
        {hasRemoteUpdate && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            {t('云端有更新')}
          </span>
        )}
      </div>

      <p className="text-xs text-neutral-500 leading-relaxed">
        {t('支持坚果云、AList、NAS、Nextcloud 等 WebDAV 服务。')}
      </p>

      {/* 配置表单 */}
      <div className="space-y-3 pt-1">
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            {t('WebDAV 服务器地址')}
          </label>
          <input
            type="text"
            className="w-full text-xs px-3 py-2 rounded-md border border-neutral-200 bg-neutral-50/50 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            placeholder="https://dav.jianguoyun.com/dav/"
            value={config.serverUrl}
            onChange={(e) => setConfig({ serverUrl: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              {t('用户名')}
            </label>
            <input
              type="text"
              className="w-full text-xs px-3 py-2 rounded-md border border-neutral-200 bg-neutral-50/50 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              placeholder="username"
              value={config.username}
              onChange={(e) => setConfig({ username: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              {t('密码')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full text-xs px-3 py-2 pr-8 rounded-md border border-neutral-200 bg-neutral-50/50 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                placeholder="••••••••"
                value={config.password}
                onChange={(e) => setConfig({ password: e.target.value })}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? t('隐藏密码') : t('显示密码')}
              >
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>
        </div>

        {/* 测试连通性按钮与测试状态 */}
        <div className="flex items-center space-x-2 pt-1">
          <button
            type="button"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
            onClick={handleTest}
            disabled={isTesting}
          >
            {isTesting ? (
              <RefreshCw size={12} className="animate-spin" />
            ) : (
              <ShieldCheck size={12} />
            )}
            <span>{isTesting ? t('测试中...') : t('测试连接')}</span>
          </button>

          {testResult && (
            <div
              className={`flex items-center space-x-1 text-xs px-2.5 py-1 rounded ${testResult.ok
                  ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800'
                  : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800'
                }`}
            >
              {testResult.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
              <span>{testResult.message}</span>
              {testResult.suggestedUrl && (
                <button
                  type="button"
                  className="underline font-medium ml-1.5 hover:opacity-80"
                  onClick={() => setConfig({ serverUrl: testResult.suggestedUrl! })}
                >
                  {t('应用建议地址')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* 高级配置展开折叠 */}
        <div className="pt-1">
          <button
            type="button"
            className="flex items-center space-x-1 text-[11px] text-neutral-500 hover:text-neutral-700"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <Sliders size={11} />
            <span>{t('高级选项')}</span>
            {showAdvanced ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>

          {showAdvanced && (
            <div className="mt-2.5 p-3 rounded-md bg-neutral-50 border border-neutral-100 space-y-2.5">
              <label className="flex items-center space-x-2 text-xs text-neutral-600 cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  className="rounded text-neutral-900 focus:ring-0"
                  checked={config.syncApiKeys}
                  onChange={(e) => setConfig({ syncApiKeys: e.target.checked })}
                />
                <span>{t('同步模型 API Key')}</span>
              </label>

              <div className="pt-2 border-t border-neutral-200 flex items-center space-x-3 text-xs">
                <button
                  type="button"
                  className="text-neutral-500 hover:text-neutral-800 flex items-center space-x-1 underline"
                  onClick={handleForcePush}
                  disabled={isSyncing}
                >
                  <Upload size={12} />
                  <span>{t('强制覆盖云端')}</span>
                </button>

                <button
                  type="button"
                  className="text-neutral-500 hover:text-neutral-800 flex items-center space-x-1 underline"
                  onClick={handleForcePull}
                  disabled={isSyncing}
                >
                  <Download size={12} />
                  <span>{t('强制覆盖本地')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 底部同步主操作区 */}
      <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2.5">
        <div className="text-xs text-neutral-500">
          {lastSyncTime ? (
            <span>
              {t('上次同步：')}
              <span className="font-medium text-neutral-700">
                {new Date(lastSyncTime).toLocaleString()}
              </span>
            </span>
          ) : (
            <span>{t('尚未进行过同步')}</span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* 撤销恢复按钮（仅在有拉取快照时可用） */}
          {hasBackup && (
            <button
              type="button"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs transition-colors"
              onClick={handleRestore}
              title={t('撤销上一次同步，恢复同步前的本地快照')}
            >
              <RotateCcw size={12} />
              <span>{t('撤销上次同步')}</span>
            </button>
          )}

          {/* 一键立即同步主按钮 */}
          <button
            type="button"
            className="flex items-center space-x-1.5 px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
            <span>{isSyncing ? t('正在双向同步...') : t('立即同步 (Sync)')}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
