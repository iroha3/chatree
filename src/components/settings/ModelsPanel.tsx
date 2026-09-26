import React, { useState, useRef } from 'react';
import { GripVertical, Plus, Save, Trash2, Star, ChevronLeft, Copy } from 'lucide-react';
import { useModelStore } from '../../stores/modelStore';
import { requestConfirm } from '../../stores/confirmStore';
import { Model, ReasoningEffort } from '../../types';
import { REASONING_EFFORT_OPTIONS, resolveReasoningEffort } from '../../utils/reasoningEffort';
import { fetchModelIds } from '../../services/modelList';
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_TEMPERATURE,
  MAX_TOKENS_LIMIT,
} from '../../utils/modelDefaults';
import { useT } from '../../i18n';
import { generateId } from '../../utils/id';

/**
 * 思考强度说明。**跟着当前选中的档位走**。
 *
 * 以前这里写死一句「DeepSeek V4 起 thinking 默认开启……聊天场景建议 low」——
 * 选了 high 的人看到的还是一句「建议 low」，自己跟自己矛盾，不如按档位说清楚
 * 这一档到底换来什么。
 */
const EFFORT_HINTS: Record<ReasoningEffort, string> = {
  default: '不显式传参，使用服务端默认设置。',
  none: '关闭思考，响应最快且消耗最少 Token。',
  low: '较少思考，平衡响应速度与成本。',
  high: '深度思考，适合复杂推理与编程任务。',
  max: '最大思考深度，适用于高难度复杂任务。',
};

/**
 * 模型配置面板。
 *
 * 从原来的 ModelManager 弹窗里拆出来 —— 现在它是「设置」里的一个标签页，
 * 自身不再管遮罩层、标题栏和关闭按钮，那些由 SettingsModal 负责。
 */
const ModelsPanel: React.FC = () => {
  const { models, createModel, updateModel, deleteModel, duplicateModel, reorderModels } = useModelStore();
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const t = useT();

  /*
   * 模型下拉候选（锦上添花）。
   *
   * 不是必需流程，也不是按钮：聚焦「模型标识」输入框时**静默**探一次
   * {baseUrl}/models，成功才把输入框变成可选可填（<datalist>），失败什么都不做。
   * 见 services/modelList.ts 的注释 —— 大量服务商没开这个端点或没放 CORS，
   * 失败是常态，绝不能因为它报错 / 挡住保存。
   */
  const [modelOptions, setModelOptions] = useState<{ key: string; ids: string[] } | null>(null);
  const modelFetchTried = useRef<Set<string>>(new Set());

  const loadModelOptions = () => {
    if (!editingModel) return;
    const baseUrl = editingModel.baseUrl.trim();
    const apiKey = editingModel.apiKey;
    if (!baseUrl || !apiKey) return;
    const key = `${baseUrl}|${apiKey}`;
    if (modelFetchTried.current.has(key)) return;
    modelFetchTried.current.add(key);

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    fetchModelIds(baseUrl, apiKey, controller.signal)
      .then((ids) => {
        if (ids.length > 0) setModelOptions({ key, ids });
      })
      .catch(() => {
        // 惊喜功能：拿不到就当没这回事
      })
      .finally(() => window.clearTimeout(timer));
  };

  // 只有当候选确实对应当前 baseUrl + Key 时才展示，避免换模型后残留旧列表
  const currentModelKey = editingModel
    ? `${editingModel.baseUrl.trim()}|${editingModel.apiKey}`
    : '';
  const modelSuggestions = modelOptions?.key === currentModelKey ? modelOptions.ids : [];

  const handleDropOnModel = async (targetId: string) => {
    const sourceId = dragId;
    setDragId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;

    const ids = models.map(m => m.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;

    // 把拖动的模型插到目标模型之前
    ids.splice(from, 1);
    ids.splice(ids.indexOf(targetId), 0, sourceId);
    await reorderModels(ids);
  };

  const handleAddModel = () => {
    const newModel: Model = {
      id: generateId(),
      // 预填 DeepSeek：用户只需要粘贴 API Key 就能用。
      // reasoningEffort 故意不设 —— 留空时 resolveReasoningEffort() 会按 baseUrl
      // 自动判定为 low；如果写死成 low，以后把 baseUrl 换成 OpenAI 就会多发一个
      // 它不认识的 reasoning_effort 参数。
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      modelName: 'deepseek-v4-flash',
      defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
      maxTokens: DEFAULT_MAX_TOKENS,
      temperature: DEFAULT_TEMPERATURE
    };

    setEditingModel(newModel);
  };

  const handleEditModel = (model: Model) => {
    setEditingModel({ ...model });
  };

  const handleDuplicateModel = async (id: string) => {
    await duplicateModel(id);
  };

  const handleSaveModel = (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingModel) return;

    if (models.some(m => m.id === editingModel.id)) {
      updateModel(editingModel);
    } else {
      createModel(editingModel);
    }

    setEditingModel(null);
  };

  const handleDeleteModel = async (id: string) => {
    const ok = await requestConfirm({
      title: t('删除模型'),
      message: t('确定要删除这个模型吗？'),
      confirmLabel: t('删除'),
      cancelLabel: t('取消'),
      danger: true,
    });
    if (!ok) return;
    deleteModel(id);
    if (editingModel?.id === id) {
      setEditingModel(null);
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* 桌面端固定 240px 左侧列表；移动端未处于编辑状态时占满全宽，编辑时隐藏 */}
      <div
        className={`${
          editingModel ? 'hidden md:block' : 'w-full'
        } md:w-60 md:shrink-0 md:border-r border-neutral-100 p-4 overflow-y-auto`}
      >
        <div className="mb-3 flex justify-between items-center">
          <h3 className="text-sm font-medium text-neutral-700">{t('模型列表')}</h3>
          <button
            className="flex items-center space-x-1 text-neutral-600 hover:text-neutral-800 p-1 rounded hover:bg-neutral-50"
            onClick={handleAddModel}
          >
            <Plus size={14} />
            <span className="text-xs">{t('添加')}</span>
          </button>
        </div>

        {models.length > 1 && (
          <p className="mb-2 text-xs text-neutral-400 leading-relaxed">
            {t('拖拽可调整排序，首位模型为新建会话的默认项。')}
          </p>
        )}

        <div className="space-y-1">
          {models.length === 0 ? (
            <div className="text-center text-neutral-400 p-4 text-sm">
              {t('暂无配置模型')}
            </div>
          ) : (
            models.map((model, index) => (
              <div
                key={model.id}
                draggable
                onDragStart={(e) => {
                  setDragId(model.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(model.id); }}
                onDragLeave={() => setDragOverId(prev => (prev === model.id ? null : prev))}
                onDrop={(e) => { e.preventDefault(); handleDropOnModel(model.id); }}
                className={`py-2 px-2 rounded-md cursor-pointer flex justify-between items-center border ${dragOverId === model.id && dragId && dragId !== model.id
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-transparent'
                  } ${editingModel?.id === model.id ? 'bg-neutral-100 text-neutral-900' : 'hover:bg-neutral-50 text-neutral-600'
                  } ${dragId === model.id ? 'opacity-50' : ''}`}
                onClick={() => handleEditModel(model)}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <GripVertical size={13} className="flex-shrink-0 text-neutral-300 cursor-grab active:cursor-grabbing" />
                  <span className="truncate text-sm">{model.name}</span>
                  {index === 0 && (
                    <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600">
                      <Star size={9} fill="currentColor" />
                      {t('默认')}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  <button
                    className="text-neutral-400 hover:text-neutral-700 p-1 rounded hover:bg-neutral-100"
                    title={t('复制模型')}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDuplicateModel(model.id);
                    }}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    className="text-neutral-400 hover:text-neutral-700 p-1 rounded hover:bg-neutral-100"
                    title={t('删除模型')}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteModel(model.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div
        className={`${
          editingModel ? 'w-full' : 'hidden md:block'
        } flex-1 min-w-0 p-4 md:p-6 overflow-y-auto`}
      >
        {editingModel ? (
          <form ref={formRef} onSubmit={handleSaveModel} className="space-y-4">
            {/* 移动端返回列表顶栏 */}
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-neutral-100 md:hidden">
              <button
                type="button"
                onClick={() => setEditingModel(null)}
                className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900 font-medium"
              >
                <ChevronLeft size={16} />
                <span>{t('返回列表')}</span>
              </button>
              <span className="text-xs text-neutral-400 font-medium">{editingModel.name || t('新模型')}</span>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                {t('模型名称')}
              </label>
              <input
                type="text"
                value={editingModel.name}
                onChange={(e) => setEditingModel({ ...editingModel, name: e.target.value })}
                className="w-full p-2 border border-neutral-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                {t('API 地址')}
              </label>
              {/* 用 type="text" 而不是 type="url"：url 会让浏览器在提交时做格式校验，
                  不合格就静默拦住 form submit（只弹一个不起眼的提示），
                  表现为「点了保存没反应」。宁可让它存进去、请求时再报错。 */}
              <input
                type="text"
                inputMode="url"
                value={editingModel.baseUrl}
                onChange={(e) => setEditingModel({ ...editingModel, baseUrl: e.target.value })}
                className="w-full p-2 border border-neutral-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
                placeholder="https://api.deepseek.com"
                required
              />
              <p className="mt-1 text-[11px] text-neutral-400 break-all leading-normal">
                {t('实际端点')}：
                <span className="font-mono text-neutral-600 dark:text-neutral-300 ml-0.5">
                  {editingModel.baseUrl.trim()
                    ? `${editingModel.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`
                    : 'https://.../chat/completions'}
                </span>
                {/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(editingModel.baseUrl) && (
                  <span className="ml-1.5 text-amber-600 dark:text-amber-400">
                    ({t('本地模型如 LM Studio 请开启 CORS')})
                  </span>
                )}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                {t('API 密钥')}
              </label>
              <input
                type="password"
                value={editingModel.apiKey}
                onChange={(e) => setEditingModel({ ...editingModel, apiKey: e.target.value })}
                className="w-full p-2 border border-neutral-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                {t('模型标识（Model ID）')}
              </label>
              <input
                type="text"
                value={editingModel.modelName}
                onChange={(e) => setEditingModel({ ...editingModel, modelName: e.target.value })}
                onFocus={loadModelOptions}
                list={modelSuggestions.length > 0 ? 'chatree-model-options' : undefined}
                className="w-full p-2 border border-neutral-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
                placeholder="gpt-4 / deepseek-flash"
                required
              />
              {modelSuggestions.length > 0 && (
                <>
                  <datalist id="chatree-model-options">
                    {modelSuggestions.map(id => (
                      <option key={id} value={id} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-[11px] text-neutral-400 leading-normal">
                    {t('已获取 {n} 个模型，可下拉选择', { n: modelSuggestions.length })}
                  </p>
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                {t('思考强度（Reasoning Effort）')}
              </label>
              <select
                value={editingModel.reasoningEffort ?? resolveReasoningEffort(editingModel)}
                onChange={(e) => setEditingModel({ ...editingModel, reasoningEffort: e.target.value as ReasoningEffort })}
                className="w-full p-2 border border-neutral-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
              >
                {REASONING_EFFORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{t(o.label)}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-400">
                {t(EFFORT_HINTS[editingModel.reasoningEffort ?? resolveReasoningEffort(editingModel)])}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                {t('默认系统提示词')} <span className="text-neutral-400 font-normal">{t('（可留空）')}</span>
              </label>
              <textarea
                value={editingModel.defaultSystemPrompt}
                onChange={(e) => setEditingModel({ ...editingModel, defaultSystemPrompt: e.target.value })}
                className="w-full p-2 border border-neutral-200 rounded-md h-32 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
                placeholder={t('留空则不发送 system 消息')}
              />
            </div>

            <div className="flex space-x-4">
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-medium text-neutral-700">
                    {t('默认温度')}
                  </label>
                  <span className="text-xs text-neutral-500">{editingModel.temperature.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={editingModel.temperature}
                  onChange={(e) => setEditingModel({ ...editingModel, temperature: parseFloat(e.target.value) })}
                  className="w-full accent-neutral-700"
                />
              </div>

              {/* 这里原来也是一条 256–65535、step=1 的滑块 —— 同样没法用：
                  一拖就跳好几千，永远停不到 4096 这种整数。换成数字输入框。
                  （节点卡片上的那个已经删了，这里是全应用**唯一**能设 max tokens
                  的地方，所以它必须真的好用。） */}
              <div className="flex-1">
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  {t('默认最大令牌数')}
                </label>
                <input
                  type="number"
                  min={256}
                  max={MAX_TOKENS_LIMIT}
                  step={1}
                  value={editingModel.maxTokens}
                  // 输入中**不**夹逼：一失焦就夹的话，「4」会被立刻拉成 256，
                  // 后面再敲「096」就永远接不上。只在失焦时收尾。
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isFinite(v)) setEditingModel({ ...editingModel, maxTokens: v });
                  }}
                  onBlur={() => {
                    const v = Math.min(
                      Math.max(editingModel.maxTokens || DEFAULT_MAX_TOKENS, 256),
                      MAX_TOKENS_LIMIT,
                    );
                    if (v !== editingModel.maxTokens) setEditingModel({ ...editingModel, maxTokens: v });
                  }}
                  className="w-full p-1.5 text-xs border border-neutral-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
                <p className="mt-1 text-xs text-neutral-400">
                  {t('单次最大生成 Token（256–{max}）', { max: MAX_TOKENS_LIMIT })}
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-neutral-100">
              <button
                type="button"
                className="px-4 py-2 border border-neutral-200 rounded-md text-neutral-600 hover:bg-neutral-50 text-sm transition-colors"
                onClick={() => setEditingModel(null)}
              >
                {t('取消')}
              </button>
              <button
                type="submit"
                className="flex items-center space-x-2 px-4 py-2 bg-neutral-900 text-white rounded-md hover:bg-neutral-800 text-sm transition-colors"
              >
                <Save size={14} />
                <span>{t('保存模型')}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-neutral-500">
            <div className="text-center p-6 bg-neutral-50 rounded-lg border border-neutral-100 max-w-md">
              <h3 className="text-base font-medium text-neutral-700 mb-2">{t('模型配置')}</h3>
              <p className="mb-4 text-sm text-neutral-500">
                {t('从左侧选择模型编辑，或添加新模型。')}
              </p>
              <button
                className="inline-flex items-center space-x-2 px-4 py-2 bg-neutral-900 text-white rounded-md hover:bg-neutral-800 text-sm transition-colors"
                onClick={handleAddModel}
              >
                <Plus size={14} />
                <span>{t('添加模型')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelsPanel;
