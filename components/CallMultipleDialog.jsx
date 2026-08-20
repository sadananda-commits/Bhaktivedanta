import { useState } from 'react';
import { usePresence } from '../lib/PresenceContext';

export function CallMultipleDialog({ profile, onCall, onClose }) {
  const { onlineUsers } = usePresence();
  const [selected, setSelected] = useState([]);

  const online = onlineUsers.filter(u => u.id !== profile?.id);
  const maxStudents = 4; // Max 4 total including yourself

  const handleToggle = (id) => {
    setSelected(prev =>
      prev.includes(id) 
        ? prev.filter(x => x !== id) 
        : [...prev, id]
    );
  };

  const handleCall = () => {
    if (selected.length === 0) return;
    
    onCall({
      calleeId: selected[0],
      calleeName: selected[0],
      additionalCallees: selected.slice(1).map(id => ({ id, name: id })),
    });
    onClose();
  };

  const canAddMore = selected.length < (maxStudents - 1);

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>👥 Group Call</h3>
          <button 
            onClick={onClose}
            style={styles.closeBtn}
          >
            ✕
          </button>
        </div>

        <p style={styles.subtitle}>
          Select up to {maxStudents - 1} students to call
        </p>

        <div style={styles.list}>
          {online.length === 0 ? (
            <p style={styles.empty}>No other students online</p>
          ) : (
            online.map(user => (
              <label key={user.id} style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={selected.includes(user.id)}
                  onChange={() => handleToggle(user.id)}
                  disabled={!canAddMore && !selected.includes(user.id)}
                  style={styles.input}
                />
                <span style={styles.label}>{user.id}</span>
              </label>
            ))
          )}
        </div>

        <div style={styles.buttons}>
          <button 
            onClick={onClose}
            style={styles.cancelBtn}
          >
            Cancel
          </button>
          <button 
            onClick={handleCall}
            disabled={selected.length === 0}
            style={{
              ...styles.callBtn,
              opacity: selected.length === 0 ? 0.5 : 1,
              cursor: selected.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            📞 Call {selected.length} {selected.length === 1 ? 'student' : 'students'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001,
  },
  modal: {
    background: '#1B2130',
    color: '#fff',
    padding: '25px',
    borderRadius: '12px',
    minWidth: '350px',
    maxWidth: '500px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    fontFamily: 'Arial, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 'bold',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontSize: '24px',
    cursor: 'pointer',
    padding: 0,
    width: '30px',
    height: '30px',
  },
  subtitle: {
    fontSize: '13px',
    color: '#aaa',
    margin: '0 0 15px 0',
  },
  list: {
    maxHeight: '300px',
    overflowY: 'auto',
    margin: '15px 0',
    borderTop: '1px solid #333',
    borderBottom: '1px solid #333',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    cursor: 'pointer',
    hover: {
      background: 'rgba(255,255,255,0.05)',
    },
  },
  input: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    marginRight: '10px',
  },
  label: {
    fontSize: '14px',
  },
  empty: {
    padding: '30px 20px',
    textAlign: 'center',
    color: '#888',
    fontSize: '14px',
    margin: 0,
  },
  buttons: {
    display: 'flex',
    gap: '10px',
    marginTop: '20px',
  },
  cancelBtn: {
    flex: 1,
    padding: '12px',
    background: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  callBtn: {
    flex: 1,
    padding: '12px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
  },
};
