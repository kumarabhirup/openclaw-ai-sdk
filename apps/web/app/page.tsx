"use client";

import { useCallback, useRef, useState } from "react";
import { ChatPanel, type ChatPanelHandle } from "./components/chat-panel";
import { Sidebar } from "./components/sidebar";

export default function Home() {
  const chatRef = useRef<ChatPanelHandle>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      chatRef.current?.loadSession(sessionId);
    },
    [],
  );

  const handleNewSession = useCallback(() => {
    chatRef.current?.newSession();
  }, []);

  const refreshSidebar = useCallback(() => {
    setSidebarRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="flex h-screen">
      <Sidebar
        onSessionSelect={handleSessionSelect}
        onNewSession={handleNewSession}
        activeSessionId={activeSessionId ?? undefined}
        refreshKey={sidebarRefreshKey}
      />

      {/* Main chat area */}
      <main className="flex-1 flex flex-col min-w-0">
        <ChatPanel
          ref={chatRef}
          onActiveSessionChange={setActiveSessionId}
          onSessionsChange={refreshSidebar}
        />
      </main>
    </div>
  );
}
