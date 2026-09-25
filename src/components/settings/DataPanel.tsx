import React, { useRef } from 'react';
import { Download, Upload, Database, FileJson, KeyRound, Folder } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import { useModelStore } from '../../stores/modelStore';
import { showSuccess, showWarning, showError } from '../../utils/notification';
import {
  buildExportFile,
  downloadJson,
  parseExportFile,
} from '../../utils/sessionTransfer';
import { useLangStore, useT } from '../../i18n';

/**
 * 数据备份 / 恢复面板。
 *
 * 「导出全部」和「导出单个会话」共用同一套 schema，导入端只有一条代码路径。
 * 单个会话的导出入口在画布右上角（那个是对「当前会话」的操作），这里只放全局的。
 */
const DataPanel: React.FC = () => {
  const { sessions, folders, importSessions, importFolders } = useSessionStore();
  const { models, importModels } = useModelStore();
  const importInputRef = useRef<HTMLInputElement>(null);
  const t = useT();
  const lang = useLangStore((s) => s.lang);

  const handleExportAll = () => {
    if (sessions.length === 0) {
      showWarning(t('暂无可导出的会话'));
      return;
    }
    // 带上模型配置（apiKey 会在 buildExportFile 里被清空）和文件夹，
    // 否则导入后每个节点的温度/token 上限都失效、会话也全变成未分类。
    const file = buildExportFile(sessions, models, folders);
    downloadJson(
      `chatree-backup-${new Date().toISOString().slice(0, 10)}.json`,
      file
    );
    showSuccess(t('已导出 {n} 个会话', { n: sessions.length }));
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 清空 value，否则连续导入同一个文件不会再触发 change
    e.target.value = '';
    if (!file) return;

    let text: string;
    try {
      text = await file.text();
    } catch {
      showError(t('读取文件失败'));
      return;
    }

    const parsed = parseExportFile(text);
    if ('error' in parsed) {
      showError(t('导入失败：{msg}', { msg: parsed.error }));
      return;
    }

    const { sessions: incomingSessions, models: incomingModels, folders: incomingFolders } = parsed.data;

    const sessionResult = await importSessions(incomingSessions);
    // 先建文件夹，再让会话指向它们。即使会话全部被跳过，文件夹也值得建 ——
    // 用户可能是先导了会话、后来又补了一份带文件夹的备份。
    const folderResult = incomingFolders.length > 0
      ? await importFolders(incomingFolders)
      : { added: 0, skipped: 0 };
    const modelResult = incomingModels.length > 0
      ? await importModels(incomingModels)
      : { added: 0, skipped: 0 };

    if (sessionResult.added === 0 && folderResult.added === 0 && modelResult.added === 0) {
      showWarning(
        sessionResult.skipped > 0
          ? t('没有新增内容：{n} 个会话均已存在', { n: sessionResult.skipped })
          : t('文件中无有效内容')
      );
      return;
    }

    const parts: string[] = [];
    if (sessionResult.added > 0) parts.push(t('新增 {n} 个会话', { n: sessionResult.added }));
    if (sessionResult.skipped > 0) parts.push(t('跳过 {n} 个已存在会话', { n: sessionResult.skipped }));
    if (folderResult.added > 0) parts.push(t('新建 {n} 个文件夹', { n: folderResult.added }));
    if (modelResult.added > 0) parts.push(t('导入 {n} 个模型配置（需补充 API Key）', { n: modelResult.added }));

    showSuccess(t('导入完成：{parts}', { parts: parts.join(lang === 'zh' ? '，' : ', ') }));
  };

  return (
    <div className="px-12 py-6 space-y-6 overflow-y-auto h-full">
      <section>
        <h3 className="text-sm font-medium text-neutral-800 mb-1">{t('当前数据')}</h3>
        <p className="text-xs text-neutral-500 mb-3">
          {t('数据仅保存在当前浏览器的 IndexedDB 中，不会上传至任何服务器。')}
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center space-x-3 p-3 rounded-lg border border-neutral-100 bg-neutral-50">
            <Database size={18} className="text-neutral-400" />
            <div>
              <div className="text-lg font-medium text-neutral-800">{sessions.length}</div>
              <div className="text-xs text-neutral-500">{t('会话')}</div>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 rounded-lg border border-neutral-100 bg-neutral-50">
            <Folder size={18} className="text-neutral-400" />
            <div>
              <div className="text-lg font-medium text-neutral-800">{folders.length}</div>
              <div className="text-xs text-neutral-500">{t('文件夹')}</div>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 rounded-lg border border-neutral-100 bg-neutral-50">
            <KeyRound size={18} className="text-neutral-400" />
            <div>
              <div className="text-lg font-medium text-neutral-800">{models.length}</div>
              <div className="text-xs text-neutral-500">{t('模型配置')}</div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-neutral-800 mb-1">{t('备份')}</h3>
        <p className="text-xs text-neutral-500 mb-3">
          {t('将全部会话、文件夹及模型配置导出为一个 JSON 文件。')}
        </p>
        <button
          className="flex items-center space-x-2 px-4 py-2 bg-neutral-900 text-white rounded-md hover:bg-neutral-800 text-sm transition-colors"
          onClick={handleExportAll}
        >
          <Download size={15} />
          <span>{t('导出完整备份')}</span>
        </button>
      </section>

      <section>
        <h3 className="text-sm font-medium text-neutral-800 mb-1">{t('恢复')}</h3>
        <p className="text-xs text-neutral-500 mb-3">
          {t('导入备份文件以恢复数据。新数据将自动导入，已存在的项目自动跳过。')}
          <span className="block mt-1 text-neutral-400">
            {t('注：出于安全考虑，备份文件不包含 API Key，导入后需重新填写。')}
          </span>
        </p>
        <button
          className="flex items-center space-x-2 px-4 py-2 border border-neutral-200 rounded-md text-neutral-700 hover:bg-neutral-50 text-sm transition-colors"
          onClick={() => importInputRef.current?.click()}
        >
          <Upload size={15} />
          <span>{t('导入备份')}</span>
        </button>
      </section>

      <section className="pt-2 border-t border-neutral-100">
        <div className="flex items-start space-x-2 text-xs text-neutral-400">
          <FileJson size={14} className="mt-0.5 shrink-0" />
          <p>
            {t('如需导出单个会话，可在画布右上角选择「分享与导出 → JSON 备份」。格式与此处通用。')}
          </p>
        </div>
      </section>

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
      />
    </div>
  );
};

export default DataPanel;
