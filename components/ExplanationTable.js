// components/ExplanationTable.js
//
// Renders a question's explanation as a readable table — one row per answer
// option (the word, its meaning, and the example sentence), with the correct
// answer's row highlighted — instead of one run-together block of text.
//
// Expected explanation text (what the quiz sheet already holds):
//
//   A – hagl
//   Meaning: hail
//   Danish: Læg mærke til betydningen af “hagl” i sætningen.
//   English: Notice the meaning of “hail” in the sentence.
//
//   B – forgænger
//   Meaning: predecessor
//   ...
//   Correct Answer: C – far-reaching
//
// If the text doesn't follow that pattern (fewer than two options found), it
// falls back to plain text with line breaks kept, so nothing is ever lost.

const OPTION_RE = /^\s*([A-Ha-h])\s*[–—\-:.)]\s*(.+?)\s*$/;
const CORRECT_RE = /^\s*Correct\s+Answers?\s*[:\-–—]\s*(.+?)\s*$/i;
const FIELD_RE = /^\s*([^:]{1,30}?)\s*:\s*(.*)$/;

export function parseExplanation(text) {
  const options = [];
  const intro = [];
  let correctLine = '';
  let current = null;
  let lastField = null;

  String(text || '').split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) { lastField = null; return; }

    const correct = line.match(CORRECT_RE);
    if (correct) { correctLine = correct[1]; current = null; lastField = null; return; }

    const opt = line.match(OPTION_RE);
    if (opt && !/^(meaning|danish|english)$/i.test(opt[1])) {
      current = { letter: opt[1].toUpperCase(), word: opt[2], fields: [] };
      options.push(current);
      lastField = null;
      return;
    }

    if (current) {
      const f = line.match(FIELD_RE);
      if (f) { lastField = { label: f[1], value: f[2] }; current.fields.push(lastField); }
      else if (lastField) lastField.value += ' ' + line;       // wrapped continuation line
      else current.fields.push((lastField = { label: '', value: line }));
    } else {
      intro.push(line);
    }
  });

  const correctLetters = new Set(
    (correctLine.match(/\b[A-Ha-h]\b/g) || []).map((l) => l.toUpperCase())
  );
  return { options, intro, correctLine, correctLetters };
}

function pickField(fields, name) {
  return fields.find((f) => f.label.toLowerCase() === name);
}

export default function ExplanationTable({ text, correctAnswer }) {
  const { options, intro, correctLine, correctLetters } = parseExplanation(text);

  if (options.length < 2) {
    return <p className="qxe-plain">{text}</p>;
  }

  // The server's own correctAnswer ("C" or "A,C") wins over the text's last line.
  const fromServer = String(correctAnswer || '').toUpperCase().match(/[A-H]/g) || [];
  const correct = fromServer.length ? new Set(fromServer) : correctLetters;

  return (
    <div className="qxe">
      <style>{EXPLANATION_CSS}</style>
      {intro.length > 0 && <p className="qxe-intro">{intro.join(' ')}</p>}
      <div className="qxe-scroll">
        <table className="qxe-table">
          <thead>
            <tr>
              <th>Option</th>
              <th>Word</th>
              <th>Meaning</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            {options.map((o) => {
              const meaning = pickField(o.fields, 'meaning');
              const danish = pickField(o.fields, 'danish');
              const english = pickField(o.fields, 'english');
              const extras = o.fields.filter((f) => f !== meaning && f !== danish && f !== english);
              const isCorrect = correct.has(o.letter);
              return (
                <tr key={o.letter + o.word} className={isCorrect ? 'qxe-correct' : ''}>
                  <td data-label="Option"><span className="qxe-letter">{o.letter}</span></td>
                  <td data-label="Word" className="qxe-word">
                    {o.word}
                    {isCorrect && <span className="qxe-badge">✓ Correct</span>}
                  </td>
                  <td data-label="Meaning">{meaning ? meaning.value : '—'}</td>
                  <td data-label="Example">
                    {danish && <div className="qxe-da">{danish.value}</div>}
                    {english && <div className="qxe-en">{english.value}</div>}
                    {extras.map((f, i) => (
                      <div key={i} className="qxe-en">{f.label ? f.label + ': ' : ''}{f.value}</div>
                    ))}
                    {!danish && !english && !extras.length && '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {correctLine && <div className="qxe-foot">Correct answer: <strong>{correctLine}</strong></div>}
    </div>
  );
}

const EXPLANATION_CSS = `
  .qxe { font-size: 13px; line-height: 1.45; color: var(--qx-text, inherit); }
  .qxe-plain { margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; color: var(--qx-text, inherit); }
  .qxe-intro { margin: 0 0 8px; }
  .qxe-scroll { overflow-x: auto; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); }
  .qxe-table { width: 100%; border-collapse: collapse; }
  .qxe-table th {
    text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 8px 10px; background: rgba(255,255,255,0.07); white-space: nowrap;
  }
  .qxe-table td { padding: 9px 10px; vertical-align: top; border-top: 1px solid rgba(255,255,255,0.10); }
  .qxe-letter {
    display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;
    border-radius: 7px; font-weight: 800; background: rgba(255,255,255,0.12);
  }
  .qxe-word { font-weight: 700; }
  .qxe-badge {
    display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 99px; font-size: 11px; font-weight: 800;
    background: var(--qx-success, #34e7b4); color: #04241d; white-space: nowrap;
  }
  .qxe-correct td { background: rgba(52,231,180,0.16); border-top-color: rgba(52,231,180,0.35); }
  .qxe-correct .qxe-letter { background: var(--qx-success, #34e7b4); color: #04241d; }
  .qxe-da { font-style: italic; }
  .qxe-en { opacity: 0.8; margin-top: 2px; }
  .qxe-foot { margin-top: 8px; font-size: 12.5px; }
  @media (max-width: 520px) {
    .qxe-table thead { display: none; }
    .qxe-table, .qxe-table tbody, .qxe-table tr, .qxe-table td { display: block; width: 100%; }
    .qxe-table td { border-top: none; padding: 3px 10px; }
    .qxe-table tr { padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.14); }
    .qxe-table tr:first-child { border-top: none; }
    .qxe-table td::before {
      content: attr(data-label); display: block; font-size: 10.5px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.6;
    }
  }
`;
