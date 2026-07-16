import { usePresence } from '../lib/PresenceContext';

export function OnlineStudents({ onCall, profile }) {
  const { onlineUsers } = usePresence();

  const onlineStudents = onlineUsers.filter(u => u.id !== profile?.id);

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>🟢 Online Now</h3>
      <div style={styles.count}>{onlineStudents.length} student{onlineStudents.length !== 1 ? 's' : ''}</div>
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
              >
                📞
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    right: '20px',
    top: '20px',
    background: '#1B2130',
    color: '#fff',
    padding: '15px',
    borderRadius: '10px',
    width: '280px',
    zIndex: 1000,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    fontFamily: 'Arial, sans-serif',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  count: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '10px',
  },
  list: {
    maxHeight: '400px',
    overflowY: 'auto',
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
  },
  empty: {
    padding: '20px 10px',
    textAlign: 'center',
    color: '#888',
    fontSize: '13px',
    margin: 0,
  },
};
