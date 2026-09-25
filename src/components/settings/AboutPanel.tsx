import React, { useCallback, useEffect, useState } from 'react';
import { Github, Heart, ExternalLink, Sparkles, ShieldCheck, Download, RefreshCw } from 'lucide-react';
import Logo from '../Logo';
import { useT } from '../../i18n';
import { checkForUpdate, isDesktopApp, UpdateCheck } from '../../services/updateService';

const UPSTREAM_URL = 'https://github.com/Anionex/treeAI';
const PROJECT_URL = 'https://github.com/iroha3/chatree';

interface LinkButtonProps {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const LinkButton: React.FC<LinkButtonProps> = ({ href, icon, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer noopener"
    className="inline-flex items-center space-x-2 px-3 py-2 border border-neutral-200 rounded-md text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
  >
    {icon}
    <span>{children}</span>
    <ExternalLink size={12} className="text-neutral-400" />
  </a>
);

const FEATURES = [
  '树状分支探索：支持从任意节点分叉并排对比',
  '模型广泛兼容：支持 DeepSeek、OpenAI、Ollama 等兼容接口',
  '深度推理支持：实时展示思考链并支持调节推理强度',
  '用量与缓存统计：记录 Token 消耗与上下文缓存命中率',
  '本地优先架构：数据仅留存于浏览器 IndexedDB，离线安全',
  '独立离线运行：无第三方 CDN 依赖，支持内网部署',
  '灵活备份导入：支持全局完整备份与单会话独立导入导出',
];

const AboutPanel: React.FC = () => {
  const t = useT();
  // 网页版永远是最新的，只有桌面版才需要检查。
  const [desktop] = useState(() => isDesktopApp());
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(false);

  const runCheck = useCallback(async () => {
    if (!isDesktopApp()) return;
    setChecking(true);
    setResult(await checkForUpdate(__APP_VERSION__));
    setChecking(false);
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  return (
    <div className="px-12 py-6 space-y-6 overflow-y-auto h-full">
      <section className="text-center">
        <div className="flex justify-center mb-3">
          <Logo size={48} />
        </div>
        <h3 className="text-lg font-medium text-neutral-800">Chatree</h3>
        <p className="text-xs text-neutral-400 mt-0.5">v{__APP_VERSION__} · MIT License</p>
        {desktop && (
          <div className="mt-2 flex items-center justify-center text-xs">
            {checking ? (
              <span className="text-neutral-400">{t('检查更新中…')}</span>
            ) : result?.status === 'available' ? (
              <a
                href={result.info.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-indigo-600 transition-colors hover:bg-indigo-100"
                title={t('用系统浏览器打开下载页')}
              >
                <Download size={12} />
                {t('发现新版本')} v{result.info.latest} · {t('去下载')}
              </a>
            ) : result ? (
              <button
                type="button"
                onClick={() => void runCheck()}
                className="inline-flex items-center gap-1 text-neutral-400 transition-colors hover:text-neutral-600"
                title={t('重新检查')}
              >
                <RefreshCw size={12} />
                {result.status === 'latest' ? t('已是最新版本') : t('检查更新')}
              </button>
            ) : null}
          </div>
        )}
        <p className="text-sm text-neutral-500 mt-3 leading-relaxed">
          {t('面向分支思考的本地优先对话画布。支持从任意节点分叉探索，并排对比不同思路与模型输出。')}
        </p>
      </section>

      <section>
        <h4 className="flex items-center text-sm font-medium text-neutral-800 mb-2">
          <Sparkles size={15} className="mr-1.5 text-neutral-400" />
          {t('核心特性')}
        </h4>
        <ul className="space-y-1.5">
          {FEATURES.map(feature => (
            <li key={feature} className="flex items-start text-sm text-neutral-600">
              <span className="mt-1.5 mr-2 w-1 h-1 rounded-full bg-neutral-400 shrink-0" />
              <span>{t(feature)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="flex items-center text-sm font-medium text-neutral-800 mb-2">
          <ShieldCheck size={15} className="mr-1.5 text-neutral-400" />
          {t('数据与隐私')}
        </h4>
        <p className="text-sm text-neutral-600 leading-relaxed">
          {t('所有会话与配置均保存在本地浏览器内，清除浏览数据将导致记录丢失。建议定期备份；API Key 不会包含在备份中。')}
        </p>
      </section>

      <section className="pt-2 border-t border-neutral-100">
        <h4 className="text-sm font-medium text-neutral-800 mb-2">{t('项目链接')}</h4>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={PROJECT_URL} icon={<Github size={15} />}>
            {t('项目源码')}
          </LinkButton>
          <LinkButton href={UPSTREAM_URL} icon={<Github size={15} />}>
            {t('上游项目')}
          </LinkButton>
        </div>
        {/* 归属声明 */}
        <div className="mt-3 rounded-md bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500 leading-relaxed">
            {t('Chatree 基于开源项目')}
            <a href={UPSTREAM_URL} target="_blank" rel="noreferrer noopener" className="mx-0.5 underline hover:text-neutral-700">Anionex/treeAI</a>
            {t('（MIT 协议）二次开发与演进。')}
          </p>
          <p className="mt-1.5 text-xs text-neutral-400 leading-relaxed">
            {t('保留了上游完整的版权许可与 Git 提交历史。')}
          </p>
        </div>
      </section>

      <p className="flex items-center justify-center text-xs text-neutral-400 pt-2">
        {t('用')} <Heart size={12} className="mx-1 text-rose-400" fill="currentColor" /> {t('构建')}
      </p>
    </div>
  );
};

export default AboutPanel;
