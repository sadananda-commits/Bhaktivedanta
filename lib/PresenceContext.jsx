import { createContext, useContext, useState, useCallback } from 'react';

const PresenceContext = createContext();

export function PresenceProvider({ children }) {
  const [onlineUsers, setOnlineUsers] = useState([]); // array of { id, status }

  const updateOnlineUsers = useCallback((users) => {
    setOnlineUsers(users || []);
    console.log('[Presence] Online users updated:', users?.length || 0);
  }, []);

  const isUserOnline = useCallback((userId) => {
    return onlineUsers.some(u => u.id === userId && u.status === 'active');
  }, [onlineUsers]);

  return (
    <PresenceContext.Provider value={{ onlineUsers, updateOnlineUsers, isUserOnline }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) {
    throw new Error('usePresence must be used within PresenceProvider');
  }
  return ctx;
}
