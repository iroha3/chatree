// WebDAV Sync Integration Test against live AList
import { resolveWebDavUrl, testConnection, getFileMeta, uploadSyncData, downloadSyncData } from '../src/services/webdav.ts';

const config = {
  serverUrl: 'http://192.168.31.9:5244/dav/',
  username: 'webdav',
  password: 'webdav',
  syncApiKeys: true,
};

async function run() {
  console.log('1. Testing URL resolution...');
  const url = resolveWebDavUrl(config.serverUrl);
  console.log('Resolved URL:', url);
  if (url !== 'http://192.168.31.9:5244/dav/chatree-sync.json.gz') {
    throw new Error(`Unexpected URL: ${url}`);
  }

  console.log('2. Testing connection to live AList WebDAV...');
  const connResult = await testConnection(config);
  console.log('Connection test result:', connResult);
  if (!connResult.ok) {
    throw new Error(`Connection test failed: ${connResult.message}`);
  }

  console.log('3. Testing AList auto-detection when root path / is given...');
  const rootConfig = { ...config, serverUrl: 'http://192.168.31.9:5244/' };
  const rootConn = await testConnection(rootConfig);
  console.log('Root URL test result:', rootConn);

  console.log('4. Testing file upload (PUT)...');
  const dummyFile = {
    format: 'treeai-sessions',
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions: [
      {
        id: 'test-session-1',
        title: '测试会话 1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        nodes: []
      }
    ],
    folders: [
      {
        id: 'test-folder-1',
        name: '工作笔记',
        createdAt: new Date().toISOString()
      }
    ],
    models: [
      {
        id: 'test-model-1',
        name: 'DeepSeek Chat',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'sk-test-secret',
        modelName: 'deepseek-chat',
        defaultSystemPrompt: '',
        maxTokens: 4096,
        temperature: 0.7
      }
    ]
  };

  const uploadRes = await uploadSyncData(config, dummyFile);
  console.log('Upload result:', uploadRes);
  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.error}`);
  }

  console.log('5. Testing getFileMeta (HEAD)...');
  const meta = await getFileMeta(config);
  console.log('File meta result:', meta);
  if (!meta.exists) {
    throw new Error('Expected file to exist after upload!');
  }

  console.log('6. Testing download and parse (GET)...');
  const downloadRes = await downloadSyncData(config);
  console.log('Download result ok:', downloadRes.ok, 'sessions:', downloadRes.data?.sessions.length);
  if (!downloadRes.ok || !downloadRes.data) {
    throw new Error(`Download failed: ${downloadRes.error}`);
  }
  if (downloadRes.data.sessions[0].title !== '测试会话 1') {
    throw new Error('Downloaded session data title mismatch!');
  }
  if (downloadRes.data.models[0].apiKey !== 'sk-test-secret') {
    throw new Error('Preserved API key mismatch!');
  }

  console.log('7. Testing Tombstone serialization & upload...');
  dummyFile.tombstones = [
    {
      id: 'deleted-session-x',
      type: 'session',
      deletedAt: new Date().toISOString()
    }
  ];
  await uploadSyncData(config, dummyFile);
  const downloadWithTombstones = await downloadSyncData(config);
  console.log('Tombstone count received:', downloadWithTombstones.data?.tombstones?.length);
  if (!downloadWithTombstones.data?.tombstones || downloadWithTombstones.data.tombstones.length !== 1) {
    throw new Error('Expected 1 tombstone to be preserved across WebDAV roundtrip!');
  }

  console.log('8. Cleaning up test file on WebDAV...');
  await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${btoa('webdav:webdav')}`
    }
  });

  console.log('✅ All WebDAV integration tests (including Tombstones) passed successfully!');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
