// components/SoloCompletion.js
//
// The end-of-quiz screen for self-paced attempts: a personal congratulations with
// the percentage score, the incorrect-answer count with an encouraging message that
// adapts to how they actually did, a Retry button (same quiz, fresh attempt), a
// review of the questions they missed, and a tucked-away list of previous days.
//
// Rendered inside the participant's .qx-card by OnlineQuizParticipant.js; the
// leaderboard (existing behaviour) is passed in as children.

import { useState } from 'react';
import { BhaktivedantaLogo } from './QuizBrand';
import ExplanationTable from './ExplanationTable';
import PreviousDays from './PreviousDays';

function dayLabel(code, title) {
  const m = /^DAY0*(\d+)$/i.exec(String(code || ''));
  return m ? `Day ${m[1]}` : (title || code || 'the quiz');
}

function plural(n, one, many) { return n === 1 ? one : many; }

// The wording adapts to the real score and incorrect count.
function pickMessage(name, pct, wrong) {
  const wrongTxt = `${wrong} incorrect ${plural(wrong, 'answer', 'answers')}`;
  if (wrong === 0 || pct >= 100) {
    return {
      head: `Perfect score, ${name}! 🎉`,
      body: `You scored 100% with no incorrect answers. Outstanding work — you've mastered this quiz!`,
    };
  }
  if (pct >= 90) {
    return {
      head: `Excellent, ${name}!`,
      body: `You scored ${pct}%, with just ${wrongTxt}. So close to perfect — one more attempt and 100% could be yours!`,
    };
  }
  if (pct >= 75) {
    return {
      head: `Well Done, ${name}!`,
      body: `You scored ${pct}%, with just ${wrongTxt}. You're almost there! Take another attempt, correct your mistakes, and aim for a perfect 100% score!`,
    };
  }
  if (pct >= 50) {
    return {
      head: `Good effort, ${name}!`,
      body: `You scored ${pct}% and had ${wrongTxt}. You're building real knowledge. Review the questions below, then try again — your score will climb!`,
    };
  }
  return {
    head: `Great start, ${name}!`,
    body: `You scored ${pct}% and had ${wrongTxt}. Every attempt makes you stronger. Look through the answers below, then retry — you can do this!`,
  };
}

function formatPicked(letters, options) {
  const list = String(letters || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!list.length) return null;
  return list.map(l => (options && options[l] ? `${l} – ${options[l]}` : l)).join(', ');
}

// Confetti: pure CSS, deterministic (no randomness, so server and browser always match).
const CONFETTI_COLORS = ['#FFD166', '#FF9F1C', '#E4572E', '#34E7B4', '#7AA2FF', '#FFF4D6'];
function Confetti() {
  const pieces = Array.from({ length: 26 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: ((i * 53) % 18) / 10,
    dur: 2.6 + ((i * 29) % 15) / 10,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    rot: (i * 47) % 360,
  }));
  return (
    <div className="bq-confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} style={{ left: p.left + '%', background: p.color, animationDelay: p.delay + 's', animationDuration: p.dur + 's', transform: `rotate(${p.rot}deg)` }} />
      ))}
    </div>
  );
}

function Trophy() {
  return (
    <svg className="bq-trophy" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="bqTrophy" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE08A" /><stop offset="1" stopColor="#F2A524" />
        </linearGradient>
      </defs>
      <path d="M18 8h28v14c0 9-6 16-14 16s-14-7-14-16V8Z" fill="url(#bqTrophy)" />
      <path d="M18 12H8c0 9 4 15 11 16M46 12h10c0 9-4 15-11 16" fill="none" stroke="#F2A524" strokeWidth="3" strokeLinecap="round" />
      <rect x="28" y="38" width="8" height="10" fill="#E39A1E" />
      <rect x="20" y="48" width="24" height="8" rx="2" fill="url(#bqTrophy)" />
      <path d="m32 15 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L32 15Z" fill="#FFF7DD" />
    </svg>
  );
}

export default function SoloCompletion({ summary, name, quizCode, quizTitle, onRetry, retrying, retryError, children }) {
  const [daysOpened, setDaysOpened] = useState(false);

  const total = Number(summary.totalQuestions) || (Number(summary.correctAnswers) + Number(summary.incorrectAnswers)) || 0;
  const correct = Number(summary.correctAnswers) || 0;
  const wrong = Number(summary.incorrectAnswers) || 0;
  const pct = typeof summary.percentage === 'number'
    ? summary.percentage
    : (total ? Math.round((correct / total) * 100) : 0);
  const who = String(name || summary.name || 'friend').trim() || 'friend';
  const msg = pickMessage(who, pct, wrong);
  const review = Array.isArray(summary.review) ? summary.review : [];

  return (
    <div className="qx-card qx-center bq-done">
      <style>{COMPLETION_CSS}</style>
      <Confetti />
      <BhaktivedantaLogo size={52} layout="inline" />
      <Trophy />
      <h1 className="qx-title bq-done-title">Congratulations, {who}!</h1>
      <p className="qx-muted bq-done-sub">
        You have successfully completed <strong>{dayLabel(quizCode, quizTitle)}</strong> with a score of
      </p>

      <div className="bq-ring" style={{ '--p': pct }} role="img" aria-label={`Score ${pct} percent`}>
        <div className="bq-ring-inner"><span className="bq-ring-num">{pct}</span><span className="bq-ring-pct">%</span></div>
      </div>

      <div className="bq-stats">
        <div><strong>{correct}</strong><span>correct</span></div>
        <div className="bq-stat-wrong"><strong>{wrong}</strong><span>incorrect</span></div>
        <div><strong>{summary.totalScore}</strong><span>points</span></div>
      </div>

      <div className="bq-message">
        <div className="bq-message-head">{msg.head}</div>
        <p>{msg.body}</p>
      </div>

      <button className="qx-btn qx-btn-primary bq-retry" onClick={onRetry} disabled={retrying}>
        {retrying
          ? <><i className="fa-solid fa-circle-notch fa-spin" /> Starting a fresh attempt…</>
          : <><i className="fa-solid fa-rotate-right" /> Retry Quiz</>}
      </button>
      {retryError && <div className="qx-error" style={{ marginTop: 8 }}>{retryError}</div>}

      {review.length > 0 && (
        <details className="bq-drop">
          <summary><span><i className="fa-solid fa-magnifying-glass" /> Review your {review.length} incorrect {plural(review.length, 'answer', 'answers')}</span></summary>
          <div className="bq-review">
            {review.map(r => {
              const picked = formatPicked(r.yourAnswer, r.options);
              return (
                <div key={r.qNum} className="bq-review-item">
                  <div className="bq-review-q"><span className="bq-review-n">Q{r.qNum}</span> {r.questionText}</div>
                  <div className="bq-review-line bq-review-wrong">
                    <i className="fa-solid fa-xmark" /> Your answer: {picked ? <strong>{picked}</strong> : <em>no answer (time ran out)</em>}
                  </div>
                  <div className="bq-review-line bq-review-right">
                    <i className="fa-solid fa-check" /> Correct answer: <strong>{formatPicked(r.correctAnswer, r.options)}</strong>
                  </div>
                  {r.explanation && <div style={{ marginTop: 8 }}><ExplanationTable collapsible text={r.explanation} correctAnswer={r.correctAnswer} /></div>}
                </div>
              );
            })}
          </div>
        </details>
      )}

      <details className="bq-drop" onToggle={e => { if (e.currentTarget.open) setDaysOpened(true); }}>
        <summary><span><i className="fa-solid fa-calendar-days" /> Explore Previous Days' Quizzes</span></summary>
        <div className="bq-drop-body">{daysOpened && <PreviousDays currentCode={quizCode} />}</div>
      </details>

      {children}
    </div>
  );
}

const COMPLETION_CSS = `
  .bq-done { position: relative; overflow: hidden; }
  .bq-done > *:not(.bq-confetti) { position: relative; z-index: 1; }
  .bq-done-title { margin: 10px 0 4px; }
  .bq-done-sub { margin: 0 0 14px; max-width: 34ch; margin-left: auto; margin-right: auto; }
  .bq-trophy { display: block; margin: 12px auto 0; filter: drop-shadow(0 6px 16px rgba(242,165,36,0.35)); animation: bqPop .6s ease-out both; }

  .bq-ring {
    --size: 150px; width: var(--size); height: var(--size); margin: 4px auto 14px; border-radius: 50%;
    display: grid; place-items: center;
    background: conic-gradient(var(--qx-success, #34e7b4) calc(var(--p) * 1%), rgba(255,255,255,0.12) 0);
    box-shadow: 0 0 36px rgba(52,231,180,0.18);
  }
  .bq-ring-inner {
    width: calc(var(--size) - 22px); height: calc(var(--size) - 22px); border-radius: 50%;
    background: var(--qx-surface, #151a33); display: flex; align-items: baseline; justify-content: center; padding-top: 38px;
  }
  .bq-ring-num { font-size: 52px; font-weight: 800; line-height: 1; }
  .bq-ring-pct { font-size: 22px; font-weight: 800; margin-left: 2px; }

  .bq-stats { display: flex; justify-content: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
  .bq-stats > div {
    min-width: 88px; padding: 8px 12px; border-radius: 12px; display: flex; flex-direction: column; gap: 2px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  }
  .bq-stats strong { font-size: 20px; }
  .bq-stats span { font-size: 11.5px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; }
  .bq-stat-wrong strong { color: var(--qx-danger, #ff6b81); }

  .bq-message {
    margin: 0 0 16px; padding: 14px 16px; border-radius: 14px; text-align: left;
    background: linear-gradient(135deg, rgba(255,159,28,0.16), rgba(52,231,180,0.12));
    border: 1px solid rgba(255,209,102,0.35);
  }
  .bq-message-head { font-size: 17px; font-weight: 800; margin-bottom: 4px; }
  .bq-message p { margin: 0; font-size: 14.5px; line-height: 1.5; }
  .bq-retry { width: 100%; margin-bottom: 4px; }

  .bq-drop {
    margin-top: 12px; text-align: left; border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.04);
  }
  .bq-drop > summary {
    list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; font-weight: 700; font-size: 14px;
  }
  .bq-drop > summary::-webkit-details-marker { display: none; }
  .bq-drop > summary::after { content: '▾'; transition: transform .15s; }
  .bq-drop[open] > summary::after { transform: rotate(180deg); }
  .bq-drop-body { padding: 0 12px 12px; }
  .bq-review { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 10px; }
  .bq-review-item { padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.05); }
  .bq-review-q { font-weight: 700; font-size: 14px; margin-bottom: 6px; }
  .bq-review-n {
    display: inline-block; margin-right: 4px; padding: 0 7px; border-radius: 6px; font-size: 12px;
    background: rgba(255,255,255,0.14);
  }
  .bq-review-line { font-size: 13.5px; margin-top: 3px; }
  .bq-review-wrong { color: var(--qx-danger, #ff6b81); }
  .bq-review-right { color: var(--qx-success, #34e7b4); }

  .bq-confetti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
  .bq-confetti span {
    position: absolute; top: -14px; width: 8px; height: 14px; border-radius: 2px; opacity: 0;
    animation-name: bqFall; animation-timing-function: linear; animation-iteration-count: 2; animation-fill-mode: forwards;
  }
  @keyframes bqFall {
    0%   { opacity: 1; transform: translateY(0) rotate(0deg); }
    100% { opacity: 0; transform: translateY(520px) rotate(540deg); }
  }
  @keyframes bqPop { 0% { transform: scale(0.4); opacity: 0; } 70% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .bq-confetti { display: none; } .bq-trophy { animation: none; } }
  @media (max-width: 480px) { .bq-ring { --size: 132px; } .bq-ring-inner { padding-top: 32px; } .bq-ring-num { font-size: 46px; } }
`;
