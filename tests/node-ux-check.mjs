/*
 * Ad-hoc runtime checks for the new features (round 13 (node UX)).
 * Requires Edge on 9222 and the dev server on 5175.
 */
const BASE = 'http://127.0.0.1:9222';
const APP = 'http://127.0.0.1:5175/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`${BASE}/json`)).json();
      // 必须排除 edge:// / chrome:// 这类浏览器内部页（新 profile 会冒出
      // `edge://sync-confirmation/`，窗口尺寸和我们启动的那个根本不是一回事，
      // 选中它会让后面所有按坐标点击的用例全错位）。优先已经在跑本应用的那一个。
      const pages = list.filter((t) => t.type === 'page' && !/^(devtools|edge|chrome):/.test(t.url));
      if (pages.length) return pages.find((t) => t.url.startsWith(APP)) || pages[0];
    } catch { /* not up */ }
    await sleep(300);
  }
  throw new Error('Could not find a page target');
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expression, awaitPromise = false) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (res.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(res.exceptionDetails));
    return res.result.value;
  }
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function main() {
  const target = await getPageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description || 'exception');
    }
  });

  const goto = async (url) => { await cdp.send('Page.navigate', { url }); await sleep(1800); };
  await goto(APP);

  // Seed a session with TWO system nodes + a chat node carrying reasoning.
  // 回答里带段落和列表，用来量段落 / 列表的纵向间距（用 JSON.stringify 注入，
  // 避免在模板字符串里手写 \n 被当成真换行）。
  const ANSWER_MD = 'hello answer\n\nsecond paragraph\n\n- a\n- b\n\n```js\nconst a = 1;\n```';
  // 长回答：给「滚轮滚动链」用。40 段足以撑爆 .assistant-message 的 max-height(520)，
  // 这样才测得出「内层先滚、滚到底才平移画布」。
  // 阅读视图还要测「容器本身需要滚动」的场景：目标节点的回答给长一点。
  const READER_LONG = 'main answer ' + 'x'.repeat(3000);
  const LONG_ANSWER = Array.from({ length: 40 }, (_, i) => `段落 ${i + 1} ` + 'x'.repeat(80)).join('\n\n');
  const seed = `new Promise((resolve) => {
    const req = indexedDB.open('TreeChatDatabase');
    req.onsuccess = () => {
      const db = req.result;
      const now = new Date().toISOString();
      const tx = db.transaction(['sessions', 'models'], 'readwrite');
      const sysA = { id: 's3a', parentId: null, type: 'system', userMessage: 'AAA', assistantMessage: '', modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: now, systemPromptTouched: false };
      const sysB = { id: 's3b', parentId: null, type: 'system', userMessage: 'BBB', assistantMessage: '', modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: now, systemPromptTouched: false };
      const chat = { id: 's3c', parentId: 's3a', type: 'chat', userMessage: 'hi', assistantMessage: ${JSON.stringify(ANSWER_MD)}, reasoning: 'thinking hard here', modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: now, usage: { promptTokens: 11, completionTokens: 22, cacheHitTokens: 0, cacheMissTokens: 0, reasoningTokens: 33, durationMs: 1000 } };
      // 必须自己带一个模型：否则画板上会盖一层「还没有可用的模型」遮罩（z-20），
      // 遮掉点击、头部也回退成「对话节点」。以前能过是因为先跑了 smoke-check，
      // 它顺手播了 m1 —— 这个测试应该自己就能独立跑。
      tx.objectStore('models').put({ id: 'm1', name: 'Test', baseUrl: 'http://localhost:1', apiKey: 'k', modelName: 'x', defaultSystemPrompt: 'sys', maxTokens: 8192, temperature: 0.7, sortOrder: 0 });
      tx.objectStore('sessions').put({ id: 's3', title: 'Gamma', createdAt: now, updatedAt: new Date(Date.now()+1000).toISOString(), nodes: [sysA, sysB, chat], systemNodeSeeded: true });
      // 旧版本落库的默认标题是写死的英文。中文界面下应显示为「新会话」。
      tx.objectStore('sessions').put({ id: 's4', title: 'New Conversation', createdAt: now, updatedAt: now, nodes: [], systemNodeSeeded: true });
      // 滚轮测试专用会话：一条单链 + 一个超长回答。
      const wheelSys = { id: 's5a', parentId: null, type: 'system', userMessage: 'SYS', assistantMessage: '', modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: now, systemPromptTouched: true };
      const wheelChat = { id: 's5c', parentId: 's5a', type: 'chat', userMessage: 'long', assistantMessage: ${JSON.stringify(LONG_ANSWER)}, modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: now };
      // 连续阅读专用会话：一条主干 + 一个分叉 + 一个后续，用来测
      // 「整条路径」「右侧兄弟分支切换」「从这条继续」。
      const rA = { id: 's6a', parentId: null, type: 'system', userMessage: 'SIX-SYS', assistantMessage: '', modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: now, systemPromptTouched: true };
      const rC = { id: 's6c', parentId: 's6a', type: 'chat', userMessage: 'main question', assistantMessage: ${JSON.stringify(READER_LONG)}, modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: now };
      const rD = { id: 's6d', parentId: 's6a', type: 'chat', userMessage: 'side question', assistantMessage: 'side answer', modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: now };
      const rE = { id: 's6e', parentId: 's6c', type: 'chat', userMessage: 'follow up', assistantMessage: 'follow up answer', modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: now };
      tx.objectStore('sessions').put({ id: 's6', title: 'ReaderProbe', createdAt: now, updatedAt: now, nodes: [rA, rC, rD, rE], systemNodeSeeded: true });
      tx.objectStore('sessions').put({ id: 's5', title: 'WheelProbe', createdAt: now, updatedAt: now, nodes: [wheelSys, wheelChat], systemNodeSeeded: true });
      tx.oncomplete = () => resolve('seeded');
      tx.onerror = () => resolve('tx-error:' + tx.error);
    };
    req.onerror = () => resolve('open-error');
  })`;
  const seedRes = await cdp.eval(seed, true);
  check('seed duplicate-system session', seedRes === 'seeded', seedRes);

  await goto(APP);
  await sleep(1200);

  // open Gamma
  await cdp.eval(`Array.from(document.querySelectorAll('.sidebar-session')).find(r => r.textContent.includes('Gamma')).click()`);
  await sleep(1500);

  const nodeCounts = await cdp.eval(`(() => {
    const ids = Array.from(document.querySelectorAll('.react-flow__node')).map(n => n.getAttribute('data-id'));
    return { total: ids.length, hasA: ids.includes('s3a'), hasB: ids.includes('s3b'), hasC: ids.includes('s3c') };
  })()`);
  check('重复系统节点被去重（只剩一个）', nodeCounts.hasA && !nodeCounts.hasB && nodeCounts.hasC, JSON.stringify(nodeCounts));

  // 标题 i18n：旧数据里的英文默认标题 / 新会话在中文界面应显示为「新会话」
  const legacyTitle = await cdp.eval(`(() => {
    const texts = Array.from(document.querySelectorAll('.sidebar-session')).map(r => r.textContent.trim());
    return { hasZh: texts.includes('新会话'), hasEn: texts.includes('New Conversation') };
  })()`);
  check('默认标题按语言本地化（旧数据的 New Conversation 显示为「新会话」）', legacyTitle.hasZh && !legacyTitle.hasEn, JSON.stringify(legacyTitle));

  // header shows the model name instead of "对话节点"
  const headerText = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    return n ? n.textContent : '';
  })()`);
  check('对话节点头部显示模型名 "Test"', headerText.includes('Test') && !headerText.includes('对话节点'), headerText.slice(0, 40));

  // reasoning collapsed by default: toggle button exists, the reasoning <pre> is not rendered.
  // 注意：不能直接 querySelector('pre') —— 回答里可能带代码块（md-editor 会渲染
  // 自己的 <pre>），所以必须从「思考过程」按钮往上一层再找。
  const reasoning = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const toggle = Array.from(n.querySelectorAll('button')).find(b => b.textContent.includes('思考过程'));
    const panel = toggle ? toggle.closest('div') : null;
    return { pre: !!(panel && panel.querySelector('pre')), hasToggle: !!toggle, text: n.textContent.includes('思考过程') };
  })()`);
  check('思维链默认折叠（有入口，无 <pre>）', reasoning.hasToggle && !reasoning.pre, JSON.stringify(reasoning));

  // click toggle -> the reasoning <pre> appears
  await cdp.eval(`(() => { const n=document.querySelector('.react-flow__node[data-id="s3c"]'); const b=Array.from(n.querySelectorAll('button')).find(x=>x.textContent.includes('思考过程')); b.click(); })()`);
  await sleep(200);
  const expanded = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const toggle = Array.from(n.querySelectorAll('button')).find(b => b.textContent.includes('思考过程'));
    const panel = toggle ? toggle.closest('div') : null;
    return !!(panel && panel.querySelector('pre'));
  })()`);
  check('点击后思维链展开', expanded === true);

  // 排版：卡片正文 19px，且段落 / 列表的纵向间距已收紧（prose 默认太松）。
  const cardType = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const p = n.querySelector('.md-editor-preview p');
    const li = n.querySelector('.md-editor-preview li');
    return { font: p ? getComputedStyle(p).fontSize : null, pMargin: p ? parseFloat(getComputedStyle(p).marginBottom) : null, liMargin: li ? parseFloat(getComputedStyle(li).marginTop) : null };
  })()`);
  check('卡片正文 19px、段/列表间距收紧',
    cardType.font === '19px' && cardType.pMargin !== null && cardType.pMargin <= 10 && cardType.liMargin !== null && cardType.liMargin <= 4,
    JSON.stringify(cardType));

  // 代码块不能「上宽下窄」：带红绿灯的标题条和代码区底色必须等宽。
  // prose 会给 <pre> 加左右内边距，不盖掉的话头部比代码区宽 12px×2。
  const codeWidth = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const head = n.querySelector('.md-editor-code-head');
    const bg = n.querySelector('.md-editor-code pre code');
    if (!head || !bg) return { head: null, bg: null };
    return { head: +head.getBoundingClientRect().width.toFixed(2), bg: +bg.getBoundingClientRect().width.toFixed(2) };
  })()`);
  check('代码块标题条与代码区等宽（不再上宽下窄）',
    codeWidth.head !== null && Math.abs(codeWidth.head - codeWidth.bg) < 1,
    JSON.stringify(codeWidth));

  // double click -> overlay dialog
  await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const target = n.querySelector('.assistant-message') || n;
    const ev = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
  })()`);
  await sleep(400);
  const overlay = await cdp.eval(`(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return dlg ? { open: true, text: dlg.textContent.slice(0, 60) } : { open: false };
  })()`);
  check('双击节点打开阅读覆盖层', overlay.open === true, JSON.stringify(overlay));

  // 浮窗正文比卡片小一号（16px），段距也更紧。
  const readerType = await cdp.eval(`(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const p = dlg.querySelector('.md-editor-preview p');
    return { font: p ? getComputedStyle(p).fontSize : null, pMargin: p ? parseFloat(getComputedStyle(p).marginBottom) : null };
  })()`);
  check('浮窗正文 16px、段距更紧',
    readerType.font === '16px' && readerType.pMargin !== null && readerType.pMargin <= 7,
    JSON.stringify(readerType));

  // 浮窗里的代码块同样不能上宽下窄（.md-preview 是卡片和浮窗共用的）
  const readerCodeWidth = await cdp.eval(`(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const head = dlg.querySelector('.md-editor-code-head');
    const bg = dlg.querySelector('.md-editor-code pre code');
    if (!head || !bg) return { head: null, bg: null };
    return { head: +head.getBoundingClientRect().width.toFixed(2), bg: +bg.getBoundingClientRect().width.toFixed(2) };
  })()`);
  check('浮窗代码块标题条与代码区等宽',
    readerCodeWidth.head !== null && Math.abs(readerCodeWidth.head - readerCodeWidth.bg) < 1,
    JSON.stringify(readerCodeWidth));

  // 覆盖层里的复制按钮：点完图标短暂变成对号（小反馈）
  await cdp.eval(`(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const btn = Array.from(dlg.querySelectorAll('button')).find(b => b.textContent.includes('复制'));
    btn.click();
  })()`);
  await sleep(250);
  const copyFeedback = await cdp.eval(`(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return { check: !!dlg.querySelector('.lucide-check'), copy: !!dlg.querySelector('.lucide-copy') };
  })()`);
  check('复制后按钮变成对号', copyFeedback.check === true, JSON.stringify(copyFeedback));

  // 复制 Toast 要盖在阅读覆盖层之上（z 轴），否则根本看不见
  const toastZ = await cdp.eval(`(() => {
    const t = document.querySelector('.fixed.top-4.right-4');
    return t ? getComputedStyle(t).zIndex : null;
  })()`);
  check('复制 Toast 在覆盖层之上', toastZ === '300', 'zIndex=' + toastZ);

  // Esc closes
  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);
  const closed = await cdp.eval(`!document.querySelector('[role="dialog"]')`);
  check('Esc 关闭覆盖层', closed === true);

  // 星标渐进式状态机。必须用**真实鼠标移动**触发 :hover 再读 computedStyle ——
  // 之前只检查 className，结果漏掉了一个优先级 bug：
  // `.group:hover .group-hover\:text-neutral-400`(0,3,0) 把 `.hover\:text-amber-400:hover`(0,2,0) 盖掉，
  // 导致「移到星上变金」不生效。
  const geom = await cdp.eval(`(() => {
    const row = Array.from(document.querySelectorAll('.sidebar-session')).find(r => r.textContent.includes('Gamma'));
    const btn = row.querySelector('button');
    const rb = btn.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    return { btnX: Math.round(rb.left + rb.width / 2), btnY: Math.round(rb.top + rb.height / 2), rowX: Math.round(rr.right - 24), rowY: Math.round(rr.top + rr.height / 2) };
  })()`);
  const move = (x, y) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  const readStar = () => cdp.eval(`(() => {
    const row = Array.from(document.querySelectorAll('.sidebar-session')).find(r => r.textContent.includes('Gamma'));
    const btn = row.querySelector('button');
    const star = btn.querySelector('.lucide-star');
    const bubble = btn.querySelector('.lucide-message-square');
    const vis = el => !!el && getComputedStyle(el).display !== 'none';
    return { title: btn.getAttribute('title'), color: getComputedStyle(btn).color, starShown: vis(star), bubbleShown: vis(bubble), fill: star ? star.getAttribute('fill') : null };
  })()`);
  const GRAY = 'rgb(212, 212, 212)';   // text-neutral-300
  const AMBER = 'rgb(251, 191, 36)';   // text-amber-400

  await move(4, 4); await sleep(200);
  const beforeStar = await readStar();
  await move(geom.rowX, geom.rowY); await sleep(200);
  const rowHover = await readStar();
  await move(geom.btnX, geom.btnY); await sleep(200);
  const btnHover = await readStar();
  check('渐进式：灰气泡 → 移行变灰星 → 移星变金',
    beforeStar.bubbleShown && !beforeStar.starShown && beforeStar.color === GRAY &&
    rowHover.starShown && rowHover.color === GRAY &&
    btnHover.starShown && btnHover.color === AMBER,
    JSON.stringify({ beforeStar, rowHover, btnHover }));

  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geom.btnX, y: geom.btnY, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geom.btnX, y: geom.btnY, button: 'left', clickCount: 1 });
  await sleep(400);
  const afterStar = await readStar();
  check('气泡点击后变实心金星', afterStar.title === '取消收藏' && afterStar.starShown && !afterStar.bubbleShown && afterStar.fill === 'currentColor', JSON.stringify(afterStar));

  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geom.btnX, y: geom.btnY, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geom.btnX, y: geom.btnY, button: 'left', clickCount: 1 });
  await sleep(400);
  await move(4, 4); await sleep(200);
  const unstarred = await readStar();
  check('再点变回气泡（取消收藏）', unstarred.title === '点击气泡收藏这个会话' && unstarred.bubbleShown && !unstarred.starShown, JSON.stringify(unstarred));

  // 回归：React Flow 自带的 Backspace 删除只改局部 nodes、不碰 store，
  // 也跳过确认 + 撤销；删完后再有任何 store 变化（比如点 +）节点会被渲染回来。
  // 现已把 deleteKeyCode 设为 null。这里选中节点后按 Backspace，节点必须还在。
  //
  // 选中用 CDP 坐标点击。
  // headless 的窗口尺寸不稳定（不支持 metrics override），节点可能落在可视区外；
  // 先检查一下，若在外面就点 Controls 的 fitView 把它收回来。
  const outOfView = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    if (!n) return false;
    const r = n.getBoundingClientRect();
    const x = r.left + 40, y = r.top + 12;
    return !(x > 0 && y > 0 && x < innerWidth && y < innerHeight);
  })()`);
  if (outOfView) {
    await cdp.eval(`document.querySelector('.react-flow__controls-fitview')?.click()`);
    await sleep(500);
  }
  const nrect = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.left + 40, y: r.top + 12 };
  })()`);
  if (!nrect) throw new Error('s3c 不在 DOM，无法继续 Backspace 回归');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: nrect.x, y: nrect.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: nrect.x, y: nrect.y, button: 'left', clickCount: 1 });
  await sleep(200);
  const selected = await cdp.eval(`!!document.querySelector('.react-flow__node[data-id="s3c"].selected')`);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
  await sleep(300);
  const bsSurvived = await cdp.eval(`!!document.querySelector('.react-flow__node[data-id="s3c"]')`);
  check('Backspace 不再删除节点（快捷键已禁用）', selected === true && bsSurvived === true, JSON.stringify({ selected, bsSurvived }));

  // 退出编辑态：以前只有「点发送」能退出，改了字又不想重发就是个死胡同。
  // 现在点节点**外面**（画布空白）应该退出，草稿保留。
  await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const bubble = n.querySelector('[class*="max-h-"]');
    bubble.click();
  })()`);
  await sleep(250);
  const enteredEdit = await cdp.eval(`!!document.querySelector('.react-flow__node[data-id="s3c"] textarea')`);
  check('点击用户消息进入编辑态（出现输入框）', enteredEdit === true);

  // 用 mousedown 模拟点画布空白处（React Flow 的面板元素）。
  // 必须带 view: window —— React Flow 的 nodrag 处理会读 event.view.document，
  // 合成的 MouseEvent 默认 view=null，会把它弄崩（报错但不是产品 bug）。
  await cdp.eval(`(() => {
    const pane = document.querySelector('.react-flow__pane');
    const r = pane.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + 4, clientY: r.top + 4, button: 0 };
    pane.dispatchEvent(new MouseEvent('mousedown', opts));
    pane.dispatchEvent(new MouseEvent('mouseup', opts));
    pane.dispatchEvent(new MouseEvent('click', opts));
  })()`);
  await sleep(300);
  const exitedEdit = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    return { textarea: !!n.querySelector('textarea'), text: n.textContent.includes('hi') };
  })()`);
  check('点画布空白处退出编辑态，草稿保留',
    exitedEdit.textarea === false && exitedEdit.text === true,
    JSON.stringify(exitedEdit));

  // 删除节点：现在是应用内确认框（不再用 window.confirm）。点删除 → 点弹窗里的「删除」。
  await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const b = Array.from(n.querySelectorAll('button')).find(x => x.title === '删除节点');
    b.click();
  })()`);
  await sleep(400);
  const dialogOpen = await cdp.eval(`(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return null;
    const btn = Array.from(d.querySelectorAll('button')).find(b => b.textContent.trim() === '删除');
    return { hasDialog: true, hasConfirm: !!btn };
  })()`);
  check('删除弹出应用内确认框（非原生）', !!(dialogOpen && dialogOpen.hasDialog && dialogOpen.hasConfirm), JSON.stringify(dialogOpen));
  await cdp.eval(`(() => {
    const d = document.querySelector('[role="dialog"]');
    Array.from(d.querySelectorAll('button')).find(b => b.textContent.trim() === '删除').click();
  })()`);
  await sleep(500);
  const afterDelete = await cdp.eval(`(() => ({
    gone: !document.querySelector('.react-flow__node[data-id="s3c"]'),
    undo: Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === '撤销'),
  }))()`);
  check('删除后节点消失且出现「撤销」', afterDelete.gone && afterDelete.undo, JSON.stringify(afterDelete));

  await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '撤销').click()`);
  await sleep(500);
  const afterUndo = await cdp.eval(`!!document.querySelector('.react-flow__node[data-id="s3c"]')`);
  check('点击撤销后节点恢复', afterUndo === true);

  // 代码块标题条与代码区之间不能有空隙（Tailwind prose 给外层 <pre> 加的
  // 内边距会把两块底色推开，中间露一条白缝）。
  const codeGap = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const head = n.querySelector('.md-editor-code-head');
    const bg = n.querySelector('.md-editor-code pre code');
    if (!head || !bg) return { gap: null };
    return { gap: +(bg.getBoundingClientRect().top - head.getBoundingClientRect().bottom).toFixed(2) };
  })()`);
  check('代码块标题条与代码区之间无缝隙',
    codeGap.gap !== null && Math.abs(codeGap.gap) < 1,
    JSON.stringify(codeGap));

  // 用量统计行的单位不能含糊：
  //   - 箭头方向：↑ = 输入，↓ = 输出（用户的直觉）；
  //   - 每个数字都必须带单位（tok / 字 / %），不能只有最后一个带。
  const stats = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const row = Array.from(n.querySelectorAll('div')).find(d => d.className.includes('text-[11px]') && d.textContent.includes('字'));
    return row ? row.textContent : null;
  })()`);
  check('用量行：↑=输入、↓=输出，且每个数字都带单位',
    !!stats &&
      stats.includes('↑ 11 tok') &&
      stats.includes('↓ 22 tok') &&
      stats.includes('思考 33 tok'),
    JSON.stringify(stats));

  // ── 卡片上的动作按钮 ────────────────────────────────────
  // 发送键在输入框右下角（你打字的地方）；停止 / 重生成 / 复制 / 放大
  // 全部待在卡片右下角的**悬浮簇**里 —— 悬停才出现，右对齐成一列。
  // 必须用**真实鼠标移动**来量 opacity：:hover 是 CSS 状态，
  // 合成的 MouseEvent 不会改变它。
  const readCluster = () => cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const cluster = Array.from(n.querySelectorAll('div')).find(d =>
      typeof d.className === 'string' && d.className.includes('opacity-0') &&
      d.className.includes('gap-0.5') && d.className.includes('bottom-2'));
    if (!cluster) return { error: 'no cluster' };
    const inputRow = Array.from(n.querySelectorAll('div')).find(d =>
      typeof d.className === 'string' && d.className.includes('relative px-4 py-3'));
    const has = (sel) => !!cluster.querySelector(sel);
    const sendBtn = n.querySelector('button[title="发送"]');
    return {
      opacity: getComputedStyle(cluster).opacity,
      stop: has('.lucide-square'),
      refresh: has('.lucide-refresh-ccw'),
      copy: has('.lucide-copy'),
      // 注意：lucide 的 toKebabCase 对「数字结尾」不插连字符，
      // 所以是 lucide-maximize2 而不是 lucide-maximize-2。
      expand: has('.lucide-maximize2'),
      inInputRow: !!(inputRow && inputRow.contains(cluster)),
      sendExists: !!sendBtn,
      sendInInputRow: !!(inputRow && sendBtn && inputRow.contains(sendBtn)),
      clusterRight: +cluster.getBoundingClientRect().right.toFixed(1),
      sendRight: sendBtn ? +sendBtn.getBoundingClientRect().right.toFixed(1) : null,
      // 卡片自己的图标（不算 Markdown 代码块里 md-editor 塞的那些）
      iconSizes: Array.from(n.querySelectorAll('button svg'))
        .filter((s) => !s.closest('.md-preview, .md-editor-code'))
        .map((s) => Number(s.getAttribute('width'))),
    };
  })()`);

  const geom2 = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const r = n.getBoundingClientRect();
    const p = document.querySelector('.react-flow__pane').getBoundingClientRect();
    const inside = (x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const corners = [
      [p.left + 8, p.top + 8], [p.right - 8, p.top + 8],
      [p.left + 8, p.bottom - 8], [p.right - 8, p.bottom - 8],
    ];
    const away = corners.find(([x, y]) => !inside(x, y)) || [p.right - 8, p.top + 8];
    // 悬停点必须**同时**落在节点内和可视区（pane）内：headless 窗口只有 600px 高，
    // 卡片一高，节点中心就掉到视口外，鼠标事件到不了 → :hover 不触发。
    // 取「可视区 ∩ 节点」的中心，而不是节点几何中心。
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const x = clamp(r.x + r.width / 2, p.left + 8, p.right - 8);
    const y = clamp(r.y + r.height / 2, p.top + 8, p.bottom - 8);
    return { x, y, awayX: away[0], awayY: away[1] };
  })()`);

  await move(geom2.awayX, geom2.awayY);
  await sleep(250);
  const away = await readCluster();
  check('没悬停时，右下角那一列动作按钮全部隐藏',
    away.opacity === '0', JSON.stringify({ opacity: away.opacity }));

  await move(geom2.x, geom2.y);
  await sleep(300);
  const hovered = await readCluster();
  check('悬停后出现：重生成 + 复制 + 放大，且不在输入框里',
    hovered.opacity === '1' && hovered.refresh && hovered.copy && hovered.expand &&
      hovered.stop === false && hovered.inInputRow === false,
    JSON.stringify(hovered));
  check('卡片上所有图标按钮的图标一样大（14）',
    hovered.iconSizes.length >= 5 && hovered.iconSizes.every((s) => s === 14),
    JSON.stringify(hovered.iconSizes));
  check('空闲时输入框右下角没有按钮（只有编辑时才出现发送键）',
    hovered.sendExists === false, JSON.stringify({ sendExists: hovered.sendExists }));

  await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    n.querySelector('[class*="max-h-"]').click();
  })()`);
  await sleep(250);
  await move(geom2.x, geom2.y);
  await sleep(300);
  const editing = await readCluster();
  check('编辑态发送键在输入框右下角，且与重生成按钮右对齐',
    editing.sendExists === true && editing.sendInInputRow === true &&
      Math.abs(editing.clusterRight - editing.sendRight) <= 0.5,
    JSON.stringify({ clusterRight: editing.clusterRight, sendRight: editing.sendRight }));

  // 编辑框右下角：textarea 自带的那根拖拽斜杠正好在按钮底下，两个叠一起又丑又看不清。
  // 所以 textarea 必须 resize-none；按钮必须**嵌在框内**，不能浮在框外面。
  //
  // 注：React Flow 会给节点加 transform: scale()，getBoundingClientRect 拿到的是
  // 屏幕像素。测试里是缩到 20% 的，所以 8px 内边距会量成 1.6px —— 必须除回 scale，
  // 不然断言就变成“看当前缩放多少”了（很容易误判）。
  const editGeom = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const ta = n.querySelector('textarea');
    const btn = n.querySelector('button[title="发送"]');
    if (!ta || !btn) return { error: 'missing' };
    const t = ta.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const scale = n.getBoundingClientRect().width / n.offsetWidth || 1;
    return {
      resize: getComputedStyle(ta).resize,
      inside: b.top >= t.top && b.bottom <= t.bottom && b.left >= t.left && b.right <= t.right,
      scale: +scale.toFixed(3),
      insetRight: +((t.right - b.right) / scale).toFixed(1),
      insetBottom: +((t.bottom - b.bottom) / scale).toFixed(1),
    };
  })()`);
  check('编辑框右下角：无原生拖拽斜杠，运行按钮嵌在框内且留出内边距',
    editGeom.resize === 'none' && editGeom.inside === true &&
      editGeom.insetRight >= 4 && editGeom.insetBottom >= 4,
    JSON.stringify(editGeom));

  // 退出编辑态，别影响后面的用例
  await cdp.eval(`(() => {
    const pane = document.querySelector('.react-flow__pane');
    const r = pane.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + 4, clientY: r.top + 4, button: 0 };
    pane.dispatchEvent(new MouseEvent('mousedown', opts));
    pane.dispatchEvent(new MouseEvent('mouseup', opts));
  })()`);
  await sleep(250);

  // 卡片设置里那条「最大令牌数」滑块已删：256–65535 / step=1 一拖就跳好几千，
  // 根本停不到想要的值。面板里现在只应该剩「模型」下拉 +「温度」一条滑块。
  await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    n.querySelector('button[title="模型设置"]').click();
  })()`);
  await sleep(350);
  const settingsPanel = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const panel = n.querySelector('.bg-neutral-50');
    if (!panel) return { error: 'no settings panel' };
    return {
      ranges: panel.querySelectorAll('input[type=range]').length,
      selects: panel.querySelectorAll('select').length,
      hasMaxTokens: panel.textContent.includes('最大令牌数'),
    };
  })()`);
  check('卡片设置里没有「最大令牌数」滑块，只剩模型 + 温度',
    settingsPanel.ranges === 1 && settingsPanel.selects === 1 && settingsPanel.hasMaxTokens === false,
    JSON.stringify(settingsPanel));
  await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    n.querySelector('button[title="模型设置"]').click();
  })()`);
  await sleep(250);

  // 浏览器标签页标题：以前是 index.html 里写死的英文，界面切中文了它也不变。
  const titleSwitch = await cdp.eval(`(async () => {
    const url = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/src/i18n/index.ts'));
    if (!url) return { error: 'i18n module not found', sample: performance.getEntriesByType('resource').map(e => e.name).slice(0, 5) };
    const m = await import(url);
    const before = document.title;
    m.useLangStore.getState().setLang('en');
    const en = document.title;
    m.useLangStore.getState().setLang('zh');
    return { before, en, back: document.title };
  })()`, true);
  check('标签页标题跟随语言（zh/en 都换）',
    !!titleSwitch && titleSwitch.before?.includes('让每个念头都能分叉') &&
      titleSwitch.en?.includes('Branch every line of thought') &&
      titleSwitch.back === titleSwitch.before,
    JSON.stringify(titleSwitch));

  // 回归：删除节点后，任何「迟到」的 updateNodeInSession（流式结束落盘 /
  // 输入框 onBlur 草稿保存 / 中止回调）都不能把节点复活 —— 这正是
  // 「删掉的节点又跳出来」的根因（旧实现是 upsert，找不到就 append）。
  const ghost = await cdp.eval(`(async () => {
    // 必须复用页面里已加载的那份模块（带 Vite 的 ?t= HMR 查询），
    // 否则动态 import 会新建一个 zustand store 实例，读不到真实 session。
    const url = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/src/stores/sessionStore.ts'));
    const m = await import(url);
    const st = m.useSessionStore.getState();
    const fake = { id: 'ghost-regression', parentId: 's3a', type: 'chat', userMessage: 'ghost', assistantMessage: '', modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: new Date().toISOString() };
    const has = () => m.useSessionStore.getState().sessions.find(s => s.id === 's3').nodes.some(n => n.id === 'ghost-regression');
    st.addNodeToSession('s3', fake);
    const added = has();
    st.deleteNodeFromSession('s3', 'ghost-regression');
    const deleted = !has();
    st.updateNodeInSession('s3', { ...fake, assistantMessage: 'late' });
    return { url, added, deleted, resurrected: has() };
  })()`, true);
  check('删除后迟到的 updateNodeInSession 不会复活节点', ghost.added && ghost.deleted && ghost.resurrected === false, JSON.stringify(ghost));

  // 新建会话：中文界面下标题就是「新会话」，而且不再被 hover 操作区挤到截断
  // （之前行内标题 hover 时加了 pr-24 预留，把 New Conversation 截成 New Conv…）。
  await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('新建会话')).click()`);
  await sleep(1200);
  const newTitle = await cdp.eval(`(() => {
    const row = document.querySelector('.sidebar-session');
    const span = row.querySelector('span');
    return { text: row.textContent.trim(), truncated: span ? span.scrollWidth > span.clientWidth + 1 : null };
  })()`);
  check('中文下新建会话标题为「新会话」且不被截断', newTitle.text === '新会话' && newTitle.truncated === false, JSON.stringify(newTitle));

  // 关于页：版本号来自 vite define（package.json 单一来源）；
  // 而且网页版永远是最新的，不能弹出「检查更新」相关提示。
  await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.title === '设置')?.click()`);
  await sleep(700);
  await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '关于')?.click()`);
  await sleep(400);
  const about = await cdp.eval(`(() => {
    const modal = document.querySelector('.fixed.inset-0.z-50');
    if (!modal) return { error: 'no modal' };
    const text = modal.textContent || '';
    return { version: (text.match(/v\\d+\\.\\d+\\.\\d+/) || [null])[0], nags: ['检查更新', '已是最新版本', '发现新版本', '去下载'].filter(k => text.includes(k)) };
  })()`);
  check('关于页显示版本号，且网页版不提示更新',
    typeof about.version === 'string' && about.nags.length === 0,
    JSON.stringify(about));
  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);

  // ── 什么行为会让会话置顶？────────────────────────────────
  // `updatedAt` 的语义是「最后一次**发起生成**」。改字 / 拖卡片 / 重命名 /
  // 删节点都是「整理」，绝不能把会话顶到列表最前。
  // （用户：「点击编辑后不修改退出编辑肯定不能置顶，更进一步，真编辑我理解
  //  也不能置顶」）
  const orderCheck = await cdp.eval(`(async () => {
    const url = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/src/stores/sessionStore.ts'));
    const S = m => m.useSessionStore;
    const m2 = await import(url);
    const store = S(m2);
    const order = () => store.getState().filteredSessions.map(s => s.id);

    // 先把 s4 推到最新，建立确定的初始顺序：s4 在 s3 上面
    store.getState().touchSession('s4');
    const before = order();

    const s3 = store.getState().sessions.find(s => s.id === 's3');
    const n = s3.nodes.find(x => x.id === 's3c');

    // 1) 原样写回（= 点进编辑态又什么都没改就退出）
    store.getState().updateNodeInSession('s3', { ...n, userMessage: n.userMessage });
    const afterNoop = order();

    // 2) 真改了字
    store.getState().updateNodeInSession('s3', { ...n, userMessage: n.userMessage + 'X' });
    const afterEdit = order();

    // 3) 拖卡片（逐节点写回坐标）
    store.getState().replaceSessionNodes('s3', s3.nodes.map(x => ({ ...x, position: { x: 11, y: 22 } })));
    const afterDrag = order();

    // 4) 新增节点 = 又聊了一轮 → 必须置顶
    store.getState().addNodeToSession('s3', { id: 'probe-del', parentId: 's3c', type: 'chat', userMessage: 'x', assistantMessage: '', modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: new Date().toISOString() });
    const afterAdd = order();

    // 5) 删节点不置顶：先把顺序复位成「s4 在 s3 上面」，再删那颗探针节点，
    //    顺序必须一动不动（不能因为「刚删过」又跳一下）。
    //    复位前必须等一下：updatedAt 只精确到毫秒，同毫秒内排序是平局，
    //    平局时稳定排序会保持旧顺序（s3 还在前面），测试就会假失败。
    await new Promise((r) => setTimeout(r, 10));
    store.getState().touchSession('s4');
    const reset = order();
    store.getState().deleteNodeFromSession('s3', 'probe-del');
    const afterDelete = order();

    return { before, afterNoop, afterEdit, afterDrag, afterAdd, reset, afterDelete };
  })()`, true);

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check('改字（含原样退出编辑）不置顶',
    same(orderCheck.afterNoop, orderCheck.before) && same(orderCheck.afterEdit, orderCheck.before),
    JSON.stringify({ before: orderCheck.before, noop: orderCheck.afterNoop, edit: orderCheck.afterEdit }));
  check('拖卡片不置顶',
    same(orderCheck.afterDrag, orderCheck.before),
    JSON.stringify({ before: orderCheck.before, afterDrag: orderCheck.afterDrag }));
  check('删节点不置顶',
    same(orderCheck.afterDelete, orderCheck.reset) && orderCheck.reset[0] !== 's3',
    JSON.stringify({ reset: orderCheck.reset, afterDelete: orderCheck.afterDelete }));
  check('新增节点（真的又聊了一轮）置顶',
    orderCheck.afterAdd[0] === 's3' && orderCheck.before[0] !== 's3',
    JSON.stringify({ before: orderCheck.before, afterAdd: orderCheck.afterAdd }));

  // ── 连续阅读：双击打开的是整条路径 ──────────────────────────
  // 换到带分叉的 ReaderProbe 会话来测（不动 s3 的布局 —— 上面那批按坐标点击的
  // 用例全按 s3 的原始布局调的）。
  await cdp.eval(`Array.from(document.querySelectorAll('.sidebar-session')).find(r => r.textContent.includes('ReaderProbe')).click()`);
  await sleep(1500);
  await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s6c"]');
    const target = n.querySelector('.assistant-message') || n;
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  })()`);
  await sleep(400);

  // 以前只渲染被双击的那一个节点；现在从根一路排到目标节点。
  // 根节点是 system，旧实现根本不会显示它 —— 以它为“不是单节点”的铁证。
  const readerPath = await cdp.eval(`(() => {
    const text = document.querySelector('[role="dialog"]').textContent || '';
    return { hasRootPrompt: text.includes('SIX-SYS'), hasTarget: text.includes('main answer') };
  })()`);
  check('双击打开的是整条路径（含根节点的系统提示词）',
    readerPath.hasRootPrompt && readerPath.hasTarget, JSON.stringify(readerPath));

  // 分叉处右侧列出兄弟分支（画布上横向那一排），当前所在的分支高亮
  const branchRail = await cdp.eval(`(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const rail = dlg.querySelector('div.sticky');
    if (!rail) return { found: false };
    return {
      found: true,
      label: rail.firstElementChild ? rail.firstElementChild.textContent.trim() : null,
      items: Array.from(rail.querySelectorAll('button')).map(b => b.textContent.trim()),
      active: Array.from(rail.querySelectorAll('button')).findIndex(b => b.className.includes('bg-neutral-900')),
    };
  })()`);
  check('分叉处右侧列出兄弟分支，当前分支高亮',
    branchRail.found && branchRail.label === '分支 1/2' && branchRail.items.length === 2 && branchRail.active === 0,
    JSON.stringify(branchRail));

  // 打开时应该定位到**目标卡片的顶部**（双击 = 从这里开始读），而不是卡片中间
  const land = await cdp.eval(`(() => {
    const sc = document.querySelector('[role="dialog"] .overflow-y-auto');
    const card = sc.querySelector('[data-reader-node="s6c"]');
    const sct = sc.getBoundingClientRect().top, ct = card.getBoundingClientRect().top;
    return { scrollTop: Math.round(sc.scrollTop), cardTop: Math.round(ct - sct) };
  })()`);
  check('打开时定位到目标卡片顶部（不是卡片中间）',
    land.scrollTop > 0 && land.cardTop >= -40 && land.cardTop <= 80, JSON.stringify(land));

  check('只有一个后续时，末尾提示「继续往下滚」',
    (await cdp.eval(`document.querySelector('[role="dialog"]').textContent.includes('继续往下滚')`)) === true);

  // 点兄弟分支 → 卡片流切过去（旧分支的卡片必须消失）
  await cdp.eval(`(() => {
    const rail = document.querySelector('[role="dialog"] div.sticky');
    Array.from(rail.querySelectorAll('button')).find(b => b.textContent.includes('side question')).click();
  })()`);
  await sleep(600);
  const switched = await cdp.eval(`(() => {
    const text = document.querySelector('[role="dialog"]').textContent || '';
    return { hasBranchTwo: text.includes('side answer'), hasOldBranch: text.includes('main answer') };
  })()`);
  check('点击兄弟分支：路径切过去，旧分支卡片消失',
    switched.hasBranchTwo && !switched.hasOldBranch, JSON.stringify(switched));

  // ── 读到底再继续滚 = 翻到下一轮（复用画布那套「滚到头」的手感）──────
  // 先切回 s6c（它有一个子节点 s6e），把容器拉到底，再滚一下。
  await cdp.eval(`(() => {
    const rail = document.querySelector('[role="dialog"] div.sticky');
    Array.from(rail.querySelectorAll('button')).find(b => b.textContent.includes('main question')).click();
  })()`);
  await sleep(500);
  // 顺便数一下 scroll 事件：平滑滚动会抖出很多次，`scrollTop = x` 那种瞬间跳只有一次。
  const advance = await cdp.eval(`(async () => {
    const dlg = document.querySelector('[role="dialog"]');
    const sc = dlg.querySelector('.overflow-y-auto');
    sc.style.scrollBehavior = 'auto';
    sc.scrollTop = sc.scrollHeight;
    const before = { hasFollow: (dlg.textContent || '').includes('follow up answer') };

    let scrollEvents = 0;
    const onScroll = () => { scrollEvents += 1; };
    // 先等上面那次「瞬到底」的滚动事件落完，再开始计数，免得把它算进来。
    await new Promise((r) => setTimeout(r, 80));
    sc.addEventListener('scroll', onScroll);
    sc.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, deltaX: 0, bubbles: true, cancelable: true, clientX: 400, clientY: 400 }));
    await new Promise((r) => setTimeout(r, 700));
    sc.removeEventListener('scroll', onScroll);

    const landed = sc.querySelector('.reader-land');
    return {
      before,
      scrollEvents,
      landed: landed ? landed.getAttribute('data-reader-node') : null,
      hasFollow: (dlg.textContent || '').includes('follow up answer'),
    };
  })()`, true);
  check('读到底继续滚：自动翻到下一轮',
    advance.before.hasFollow === false && advance.hasFollow === true,
    JSON.stringify(advance));
  // 滚轮翻页必须和点分支一样是平滑滚动 —— 用瞬到的话内容直接传送走，读者会丢掉位置感。
  // 顺带断言翻到的那张卡片有落点高亮（「我现在读的是这张」）。
  check('滚轮翻页是平滑滚动（不是瞬间跳）且翻到的卡片有落点高亮',
    advance.scrollEvents >= 2 && advance.landed === 's6e',
    JSON.stringify({ scrollEvents: advance.scrollEvents, landed: advance.landed }));

  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);

  // ==== 滚轮滚动链（DEV §3.14）====
  // 画布开了 panOnScroll：普通滚轮 = 平移画布，Ctrl/⌘+滚轮 = 缩放。
  // 卡片内部本身就能滚（长回答的 .assistant-message），所以必须按浏览器
  // 嵌套滚动的语义分流：内层还有余量 → 拦下滚内层；内层到底 / 没溢出 →
  // 放行给画布。
  //
  // 这里测的是**分流决策**，不是浏览器原生滚动：合成的 wheel 不会真的滚动页面，
  // 但它会真实地走一遍 capture/bubble 传播 —— 而我们的实现恰恰就是在
  // 卡片根节点的 capture 阶段决定 stopPropagation 与否。在画布 pane 上挂一个
  // **冒泡**阶段的探针，就能看出事件到底有没有被卡片拦下。
  // （不用坐标 + Input.dispatchMouseEvent：headless 视口只有 ~600px 高，
  //   长卡片大半在视口外，而且这个 target 不支持 Emulation 改视口尺寸。）
  await cdp.eval(`Array.from(document.querySelectorAll('.sidebar-session')).find(r => r.textContent.includes('WheelProbe')).click()`);
  await sleep(1600);

  const wheelSetup = await cdp.eval(`(() => {
    const am = document.querySelector('.react-flow__node[data-id="s5c"] .assistant-message');
    const pane = document.querySelector('.react-flow__pane');
    if (!am || !pane) return { ok: false };
    window.__paneWheel = 0;
    // 冒泡阶段：卡片在 capture 阶段 stopPropagation 后，它就收不到。
    pane.addEventListener('wheel', () => { window.__paneWheel++; });
    am.style.scrollBehavior = 'auto';
    am.scrollTop = 0;
    return { ok: true, overflow: am.scrollHeight > am.clientHeight + 1 };
  })()`);

  const fireWheel = (dy) => cdp.eval(`(() => {
    const am = document.querySelector('.react-flow__node[data-id="s5c"] .assistant-message');
    const inner = am.querySelector('.md-preview') || am;
    inner.dispatchEvent(new WheelEvent('wheel', { deltaY: ${dy}, deltaX: 0, bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));
    return window.__paneWheel;
  })()`);

  const paneAfterInner = await fireWheel(150);
  check('内层还有余量：滚轮被卡片拦下，不传给画布',
    wheelSetup.ok && wheelSetup.overflow && paneAfterInner === 0,
    JSON.stringify({ ...wheelSetup, paneAfterInner }));

  await cdp.eval(`(() => { const am = document.querySelector('.react-flow__node[data-id="s5c"] .assistant-message'); am.scrollTop = am.scrollHeight; })()`);
  const paneAfterBottom = await fireWheel(150);
  check('内层滚到底：滚轮放行，交给画布平移',
    paneAfterBottom > 0, JSON.stringify({ paneAfterBottom }));

  check('无运行时报错', errors.length === 0, errors.slice(0, 3).join(' | '));

  ws.close();
  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
