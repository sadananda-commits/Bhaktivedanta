import { usePresence } from '../lib/PresenceContext';
import { useRef, useState, useEffect } from 'react';

export function OnlineStudents({ onCall, profile, onSignOut }) {
  const { onlineUsers } = usePresence();
  const [position, setPosition] = useState({ x: 20, y: typeof window !== 'undefined' ? window.innerHeight - 380 : 700 }); // Left side, bottom corner
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

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

  const onlineStudents = onlineUsers.filter(u => u.id !== profile?.id);

  const handleMouseDown = (e) => {
    // Only drag from the title area, not from buttons
    if (e.target.closest('button')) return;
    
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
      {/* Header with title */}
      <div style={styles.header}>
        <h3 style={styles.title}>🟢 Online Now</h3>
        <div style={styles.count}>{onlineStudents.length}</div>
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
                <span style={styles.name}>{user.id}</span>
              </div>
              <button 
                onClick={() => onCall?.(user.id, user.id)}
                style={styles.callBtn}
                title="Call this student"
              >
                📞
              </button>
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
    gap: '10px',
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
