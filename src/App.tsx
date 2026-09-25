import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatFlow from './components/ChatFlow';
import SettingsModal from './components/SettingsModal';
import type { SettingsTab } from './components/SettingsModal';
import NotificationContainer from './components/Notification';
import ConfirmDialog from './components/ConfirmDialog';
import { useSessionStore } from './stores/sessionStore';
import { useModelStore } from './stores/modelStore';
import { useDatabaseContext } from './context/DatabaseContext';
import { Session } from './types';
import { defaultSessionTitle } from './utils/sessionTitle';
import { generateId } from './utils/id';
import { ChevronRight, Loader2, PlusCircle } from 'lucide-react';
import { useT } from './i18n';

const App: React.FC = () => {
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  });
  const [isMobile, setIsMobile] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  });
  const { currentSessionId, setCurrentSessionId } = useSessionStore();
  const { loadSessions, loadModels, loadFolders } = useDatabaseContext();
  const { sessions } = useSessionStore();
  const { models } = useModelStore();
  const [isLoading, setIsLoading] = useState(true);
  const t = useT();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const initializeData = async () => {
      try {
        await loadSessions();
        await loadModels();
        await loadFolders();
      } catch (error) {
        console.error('Failed to initialize data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLoading && sessions.length > 0 && !currentSessionId) {
      setCurrentSessionId(sessions[0].id);
    }
  }, [sessions, currentSessionId, setCurrentSessionId, isLoading]);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen h-[100dvh] w-screen items-center justify-center bg-neutral-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-neutral-500 mx-auto" />
          <p className="mt-4 text-base text-neutral-600">{t('加载中...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-neutral-50">
      {sidebarCollapsed && (
        <button 
          className="absolute top-4 left-4 z-20 bg-white p-1.5 rounded-full shadow-minimal border border-neutral-200"
          onClick={toggleSidebar}
        >
          <ChevronRight size={14} className="text-neutral-600" />
        </button>
      )}

      {!sidebarCollapsed && isMobile && (
        <div 
          className="fixed inset-0 bg-neutral-900/30 backdrop-blur-[2px] z-20 md:hidden transition-opacity"
          onClick={toggleSidebar}
        />
      )}
      
      <Sidebar 
        onOpenSettings={(tab) => setSettingsTab(tab ?? 'models')} 
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />
      <main className="flex-1 overflow-hidden relative">
        {currentSessionId ? (
          <ChatFlow
            sessionId={currentSessionId}
            onOpenSettings={() => setSettingsTab('models')}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center max-w-md p-8 bg-white rounded-lg shadow-subtle border border-neutral-100">
              <h2 className="text-xl font-medium text-neutral-800 mb-4">{t('欢迎使用 Chatree')}</h2>
              <p className="text-neutral-600 mb-6 text-sm leading-relaxed">
                {t('创建新会话，开始探索树状分支对话。')}
              </p>
              <button 
                className="inline-flex items-center justify-center space-x-2 px-5 py-2 bg-neutral-900 text-white rounded-md hover:bg-neutral-800 transition-colors"
                onClick={() => {
                  if (models.length === 0) {
                    setSettingsTab('models');
                  } else {
                    const newSession: Session = {
                      id: generateId(),
                      title: defaultSessionTitle(),
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      nodes: []
                    };
                    useSessionStore.getState().createSession(newSession);
                    setCurrentSessionId(newSession.id);
                  }
                }}
              >
                <PlusCircle size={16} className="mr-2" />
                <span>{models.length === 0 ? t('配置模型') : t('新建会话')}</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {settingsTab && (
        <SettingsModal
          initialTab={settingsTab}
          onClose={() => setSettingsTab(null)}
        />
      )}
      
      <NotificationContainer />
      <ConfirmDialog />
    </div>
  );
};

export default App;
