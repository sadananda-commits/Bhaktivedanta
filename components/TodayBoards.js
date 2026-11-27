// components/TodayBoards.js
//
// Today's two leaderboards (Word Quiz + Phrase Quiz). Two columns on a laptop /
// desktop (>= 768px), stacked one below the other on a phone.
// `data` is the response of the `todayHub` action (data.boards must be set).

const BOARDS_CSS = `
  .tb-grid { display: grid; grid-template-columns: 1fr; gap: 16px; text-align: left; }
  @media (min-width: 768px) { .tb-grid { grid-template-columns: 1fr 1fr; } }
  .tb-board { padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14); }
  .tb-board-word { border-top: 4px solid #FF9F1C; }
  .tb-board-phrase { border-top: 4px solid #34E7B4; }
  .tb-board h3 { margin: 0 0 2px; font-size: 18px; }
  .tb-sub { margin: 0 0 10px; font-size: 12.5px; opacity: 0.7; }
  .tb-row { display: grid; grid-template-columns: 34px 1fr auto; gap: 8px; align-items: center; padding: 8px 10px; border-radius: 10px; font-size: 14px; }
  .tb-row:nth-child(even) { background: rgba(255,255,255,0.04); }
  .tb-row-me { background: rgba(255,209,102,0.22) !important; border: 1px solid rgba(255,209,102,0.55); font-weight: 800; }
  .tb-rank { font-weight: 800; opacity: 0.85; }
  .tb-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tb-score { font-weight: 800; white-space: nowrap; }
  .tb-score small { font-weight: 600; opacity: 0.65; margin-left: 4px; }
  .tb-empty { margin: 6px 0; font-size: 13.5px; opacity: 0.75; }
`;

function Board({ kind, title, label, board }) {
  const rows = (board && board.rows) || [];
  return (
    <section className={'tb-board tb-board-' + kind} aria-label={title + ' leaderboard'}>
      <h3>{kind === 'word' ? '📖' : '💬'} {title} — {label}</h3>
      <p className="tb-sub">{board ? `${board.total} ${board.total === 1 ? 'participant' : 'participants'}` : ''}</p>
      {rows.length === 0 && <p className="tb-empty">No results yet.</p>}
      {rows.map(r => (
        <div key={r.rank + '-' + r.name} className={'tb-row' + (r.isMe ? ' tb-row-me' : '')}>
          <span className="tb-rank">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : '#' + r.rank}</span>
          <span className="tb-name">{r.name}{r.isMe ? ' (you)' : ''}</span>
          <span className="tb-score">{r.totalScore}<small>pts</small></span>
        </div>
      ))}
    </section>
  );
}

export default function TodayBoards({ data }) {
  if (!data || !data.boards) return null;
  return (
    <div className="tb-grid">
      <style>{BOARDS_CSS}</style>
      <Board kind="word" title="Word Quiz" label={data.word.label} board={data.boards.word} />
      <Board kind="phrase" title="Phrase Quiz" label={data.phrase.label} board={data.boards.phrase} />
    </div>
  );
}
