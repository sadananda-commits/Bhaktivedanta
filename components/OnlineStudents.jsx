import { usePresence } from '../lib/PresenceContext';
import { useRef, useState, useEffect } from 'react';

export function OnlineStudents({ onCall, onChat, profile, onSignOut }) {
  const { onlineUsers } = usePresence();
  const [position, setPosition] = useState({ x: 5, y: typeof window !== 'undefined' ? window.innerHeight - 380 : 700 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [expandedUserId, setExpandedUserId] = useState(null);  // Track which user's menu is open
  const [isOpen, setIsOpen] = useState(false); // starts minimized — just a small icon until clicked
  const containerRef = useRef(null);

  const onlineStudents = onlineUsers.filter(u => u.id !== profile?.id);

  const handleMouseDown = (e) => {
    // Don't drag if clicking on buttons or menus
    if (e.target.closest('button') || e.target.closest('[role="menu"]')) return;
    
    setIsDragging(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  // Properly manage global event listeners with useEffect
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    // Add listeners when dragging starts
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Cleanup: Remove listeners when dragging ends or component unmounts
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Adjust position on window resize to keep card in bottom-left
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        ...prev,
        y: Math.min(prev.y, window.innerHeight - 380)
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleCallClick = (userId, userName) => {
    setExpandedUserId(userId);
  };

  const handleAudioCall = (userId, userName) => {
    onCall?.(userId, userName, 'audio');
    setExpandedUserId(null);
  };

  const handleVideoCall = (userId, userName) => {
    onCall?.(userId, userName, 'video');
    setExpandedUserId(null);
  };

  // Minimized state: just a small round icon, bottom-left, with a badge
  // showing how many classmates are online. Doesn't block any of the
  // screen — tap it to open the full list.
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{ ...styles.fab, left: `${position.x}px`, top: `${position.y}px` }}
        title="Who's online"
        aria-label="Show online students"
      >
        <i className="fa-solid fa-user-group" style={styles.fabIcon} />
        {onlineStudents.length > 0 && (
          <span style={styles.fabBadge}>{onlineStudents.length}</span>
        )}
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        ...styles.container,
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header with title + a close button to collapse back to the icon */}
      <div style={styles.header}>
        <h3 style={styles.title}>🟢 Online Now</h3>
        <div style={styles.headerRight}>
          <div style={styles.count}>{onlineStudents.length}</div>
          <button
            onClick={() => setIsOpen(false)}
            style={styles.closeBtn}
            title="Minimize"
            aria-label="Minimize online list"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      </div>

      {/* Online students list */}
      <div style={styles.list}>
        {onlineStudents.length === 0 ? (
          <p style={styles.empty}>No one else online</p>
        ) : (
          onlineStudents.map(user => (
            <div key={user.id} style={styles.item}>
              <div style={styles.itemInfo}>
                <span style={styles.indicator}>●</span>
                <span style={styles.name}>{user.name || user.id}</span>
              </div>
              
              <div style={styles.itemActions}>
                {/* Chat directly with this student — opens/creates their DM */}
                <button
                  onClick={() => onChat?.(user.id, user.name || user.id)}
                  style={styles.chatBtn}
                  title={`Chat with ${user.name || user.id}`}
                >
                  💬
                </button>

                {/* Call menu - show both audio and video options */}
                {expandedUserId === user.id ? (
                  <div style={styles.callMenu} role="menu">
                    <button 
                      onClick={() => handleAudioCall(user.id, user.name || user.id)}
                      style={styles.menuBtn}
                      title="Audio call"
                    >
                      🎤
                    </button>
                    <button 
                      onClick={() => handleVideoCall(user.id, user.name || user.id)}
                      style={styles.menuBtn}
                      title="Video call"
                    >
                      📹
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => handleCallClick(user.id, user.name || user.id)}
                    style={styles.callBtn}
                    title="Call this student"
                  >
                    📞
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sign Out Button */}
      <button
        onClick={onSignOut}
        style={styles.signOutBtn}
        title="Sign out from portal"
      >
        <i className="fa-solid fa-power-off" style={styles.signOutIcon} />
        Sign Out
      </button>
    </div>
  );
}

const styles = {
  fab: {
    position: 'fixed',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: '#1B2130',
    color: '#22c55e',
    border: '2px solid #22c55e',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: {
    fontSize: '18px',
  },
  fabBadge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    background: '#22c55e',
    color: '#0b0f16',
    fontSize: '10px',
    fontWeight: 'bold',
    minWidth: '18px',
    height: '18px',
    borderRadius: '9px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    border: '2px solid #1B2130',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  closeBtn: {
    background: 'transparent',
    color: 'rgba(255,255,255,.6)',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '2px 4px',
    lineHeight: 1,
  },
  container: {
    position: 'fixed',
    background: '#1B2130',
    color: '#fff',
    padding: '15px',
    borderRadius: '10px',
    width: '280px',
    zIndex: 1000,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    fontFamily: 'Arial, sans-serif',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    paddingBottom: '8px',
    borderBottom: '1px solid #333',
    cursor: 'grab',
  },
  title: {
    margin: '0',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'grab',
  },
  count: {
    fontSize: '12px',
    color: '#22c55e',
    fontWeight: 'bold',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    padding: '2px 8px',
    borderRadius: '12px',
  },
  list: {
    maxHeight: '300px',
    overflowY: 'auto',
    marginBottom: '10px',
  },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px',
    borderBottom: '1px solid #333',
    gap: '8px',
  },
  itemInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    minWidth: 0,
  },
  indicator: {
    color: '#22c55e',
    fontSize: '12px',
  },
  name: {
    fontSize: '13px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  chatBtn: {
    background: '#00C6A7',
    color: '#fff',
    border: 'none',
    padding: '6px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.2s',
  },
  callBtn: {
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    padding: '6px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.2s',
  },
  callMenu: {
    display: 'flex',
    gap: '5px',
    flexShrink: 0,
  },
  menuBtn: {
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    padding: '6px 8px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    transition: 'background-color 0.2s',
  },
  signOutBtn: {
    width: '100%',
    padding: '10px',
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background-color 0.2s',
  },
  signOutIcon: {
    marginRight: '4px',
  },
};
