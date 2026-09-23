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
      const page = list.find((t) => t.type === 'page' && !t.url.startsWith('devtools'));
      if (page) return page;
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
  const ANSWER_MD = 'hello answer\n\nsecond paragraph\n\n- a\n- b';
  const seed = `new Promise((resolve) => {
    const req = indexedDB.open('TreeChatDatabase');
    req.onsuccess = () => {
      const db = req.result;
      const now = new Date().toISOString();
      const tx = db.transaction(['sessions', 'models'], 'readwrite');
      const sysA = { id: 's3a', parentId: null, type: 'system', userMessage: 'AAA', assistantMessage: '', modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: now, systemPromptTouched: false };
      const sysB = { id: 's3b', parentId: null, type: 'system', userMessage: 'BBB', assistantMessage: '', modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: now, systemPromptTouched: false };
      const chat = { id: 's3c', parentId: 's3a', type: 'chat', userMessage: 'hi', assistantMessage: ${JSON.stringify(ANSWER_MD)}, reasoning: 'thinking hard here', modelId: 'm1', temperature: 0.7, maxTokens: 8192, createdAt: now };
      // 必须自己带一个模型：否则画板上会盖一层「还没有可用的模型」遮罩（z-20），
      // 遮掉点击、头部也回退成「对话节点」。以前能过是因为先跑了 smoke-check，
      // 它顺手播了 m1 —— 这个测试应该自己就能独立跑。
      tx.objectStore('models').put({ id: 'm1', name: 'Test', baseUrl: 'http://localhost:1', apiKey: 'k', modelName: 'x', defaultSystemPrompt: 'sys', maxTokens: 8192, temperature: 0.7, sortOrder: 0 });
      tx.objectStore('sessions').put({ id: 's3', title: 'Gamma', createdAt: now, updatedAt: new Date(Date.now()+1000).toISOString(), nodes: [sysA, sysB, chat], systemNodeSeeded: true });
      // 旧版本落库的默认标题是写死的英文。中文界面下应显示为「新会话」。
      tx.objectStore('sessions').put({ id: 's4', title: 'New Conversation', createdAt: now, updatedAt: now, nodes: [], systemNodeSeeded: true });
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

  // reasoning collapsed by default: toggle button exists, <pre> not rendered
  const reasoning = await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const pre = n.querySelector('pre');
    const hasToggle = !!Array.from(n.querySelectorAll('button')).find(b => b.textContent.includes('思考过程'));
    return { pre: !!pre, hasToggle, text: n.textContent.includes('思考过程') };
  })()`);
  check('思维链默认折叠（有入口，无 <pre>）', reasoning.hasToggle && !reasoning.pre, JSON.stringify(reasoning));

  // click toggle -> pre appears
  await cdp.eval(`(() => { const n=document.querySelector('.react-flow__node[data-id="s3c"]'); const b=Array.from(n.querySelectorAll('button')).find(x=>x.textContent.includes('思考过程')); b.click(); })()`);
  await sleep(200);
  const expanded = await cdp.eval(`!!document.querySelector('.react-flow__node[data-id="s3c"] pre')`);
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

  // 停止按钮：把节点标成流式中，检查 UI 出现停止入口。
  await cdp.eval(`(() => {
    const n = document.querySelector('.react-flow__node[data-id="s3c"]');
    const b = Array.from(n.querySelectorAll('button')).find(x => x.title === '停止生成并保存已生成的内容');
    return !!b;
  })()`).then(v => check('非流式节点不显示停止按钮', v === false));

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

  check('无运行时报错', errors.length === 0, errors.slice(0, 3).join(' | '));

  ws.close();
  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
