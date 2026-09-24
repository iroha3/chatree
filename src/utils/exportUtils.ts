import { Session, ChatNode } from '../types';

interface MindMapNode {
  id: string;
  text: string;
  children?: MindMapNode[];
}

export function exportToMindmap(session: Session): void {
  // 这里**不能**自己 try/catch + alert：
  //   1) 项目规定禁止 window.alert（见 DEV.md §3.6），Toast 才是唯一的提示通道；
  //   2) 以前它把异常吞掉，调用方 ChatFlow.handleExport 的 catch 永远不触发，
  //      失败时既没有应用内提示、也没法统一处理。
  // 让异常抛出去，由调用方 showError。
  const mindMapTree = buildMindMapTree(session);
  const xmlContent = convertToFreeMindXML(mindMapTree);

  const blob = new Blob([xmlContent], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_mindmap.mm`;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function buildMindMapTree(session: Session): MindMapNode {
  const nodeMap = new Map<string, ChatNode>();
  session.nodes.forEach(node => {
    nodeMap.set(node.id, node);
  });

  const childrenMap = new Map<string, string[]>();
  session.nodes.forEach(node => {
    if (node.parentId) {
      if (!childrenMap.has(node.parentId)) {
        childrenMap.set(node.parentId, []);
      }
      childrenMap.get(node.parentId)?.push(node.id);
    }
  });

  const rootNode: MindMapNode = {
    id: 'root',
    text: session.title,
    children: []
  };

  const buildSubtree = (nodeId: string): MindMapNode => {
    const node = nodeMap.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const text = '🧑‍💻User: ' + node.userMessage + '\n---\n🤖Assistant: ' + node.assistantMessage;

    const mindMapNode: MindMapNode = {
      id: node.id,
      text
    };

    const childIds = childrenMap.get(nodeId) || [];
    if (childIds.length > 0) {
      mindMapNode.children = childIds.map(id => buildSubtree(id));
    }

    return mindMapNode;
  };

  // 根节点 = 没有父节点、或父节点已经不存在的节点。
  // 以前这里写死「必须有一个 system 节点，否则 throw」—— 用户现在可以删掉系统提示词
  // （见 DEV.md §3.12），那是正常状态，不该让导图直接失败。
  // 顺便也为「多个根」留好了口子（ROADMAP：多个系统提示词节点同屏）。
  const rootIds = session.nodes
    .filter(n => !n.parentId || !nodeMap.has(n.parentId))
    .map(n => n.id);

  rootNode.children = rootIds.map(id => {
    const node = nodeMap.get(id)!;
    const childIds = childrenMap.get(id) || [];
    if (node.type === 'system') {
      return {
        id: node.id,
        text: 'System Prompt: ' + node.userMessage,
        children: childIds.map(buildSubtree),
      };
    }
    return buildSubtree(id);
  });

  return rootNode;
}

function convertToFreeMindXML(root: MindMapNode): string {
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
  const mapStart = '<map version="1.0.1">';
  const mapEnd = '</map>';

  const buildNodeXML = (node: MindMapNode): string => {
    const nodeStart = `<node ID="${node.id}" TEXT="${escapeXml(node.text)}" CREATED="${Date.now()}" MODIFIED="${Date.now()}">`;

    let content = nodeStart;

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        content += buildNodeXML(child);
      }
    }

    content += '</node>';
    return content;
  };

  const xml = `${xmlHeader}\n${mapStart}\n${buildNodeXML(root)}\n${mapEnd}`;
  return xml;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // 换行要写成字符引用：XML 会把属性值里的字面换行规范化成空格，
    // 那样 FreeMind/Freeplane 里每条就挤成一行了。
    // 必须放在最后 —— 放在 & 转义之前的话，&#10; 会被自己转成 &amp;#10;。
    .replace(/\r\n|\r|\n/g, '&#10;');
}
