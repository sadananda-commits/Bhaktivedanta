// components/QuizBrand.js
//
// The "Bhaktivedanta Quiz" brand kit, kept in one place so every screen uses
// the same artwork:
//   • <LogoMark />            the emblem on its own: a lotus rising from an open book
//   • <BhaktivedantaLogo />   emblem + wordmark, stacked or side by side
//   • <BrandStyles />         logo styles + the subtle full-page background watermark
//
// Everything is inline SVG/CSS (no image files to host) so it scales cleanly
// from a phone to a projector. The watermark is the same emblem, drawn at a few
// percent opacity behind the content, never in front of it.

// Single source of truth for the emblem's artwork (used by the logo AND the watermark).
const MARK_INNER = `
<defs>
  <linearGradient id="bqPetal" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFD166"/><stop offset="0.55" stop-color="#FF9F1C"/><stop offset="1" stop-color="#E4572E"/>
  </linearGradient>
  <linearGradient id="bqPage" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FFFBEF"/><stop offset="1" stop-color="#F6DFA8"/>
  </linearGradient>
  <radialGradient id="bqGlow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#FFD166" stop-opacity="0.55"/><stop offset="1" stop-color="#FFD166" stop-opacity="0"/>
  </radialGradient>
</defs>
<circle cx="60" cy="48" r="46" fill="url(#bqGlow)"/>
<path d="M60 70 C40 62 22 52 18 36 C34 38 50 50 60 70Z" fill="url(#bqPetal)" opacity="0.85"/>
<path d="M60 70 C80 62 98 52 102 36 C86 38 70 50 60 70Z" fill="url(#bqPetal)" opacity="0.85"/>
<path d="M60 70 C46 60 34 44 38 24 C50 32 58 48 60 70Z" fill="url(#bqPetal)" opacity="0.92"/>
<path d="M60 70 C74 60 86 44 82 24 C70 32 62 48 60 70Z" fill="url(#bqPetal)" opacity="0.92"/>
<path d="M60 70 C50 54 50 32 60 10 C70 32 70 54 60 70Z" fill="url(#bqPetal)"/>
<path d="M60 104 C46 96 28 94 12 98 L12 74 C28 70 46 72 60 80Z" fill="url(#bqPage)" stroke="#C99A2E" stroke-width="2" stroke-linejoin="round"/>
<path d="M60 104 C74 96 92 94 108 98 L108 74 C92 70 74 72 60 80Z" fill="url(#bqPage)" stroke="#C99A2E" stroke-width="2" stroke-linejoin="round"/>
<path d="M60 80 L60 104" stroke="#C99A2E" stroke-width="2"/>
<path d="M20 83 C32 81 44 83 54 88 M20 90 C32 88 44 90 54 95" stroke="#E0B955" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<path d="M100 83 C88 81 76 83 66 88 M100 90 C88 88 76 90 66 95" stroke="#E0B955" stroke-width="1.6" fill="none" stroke-linecap="round"/>
`;

export function LogoMark({ size = 64 }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 112) / 120)}
      viewBox="0 0 120 112"
      aria-hidden="true"
      className="bq-mark"
      dangerouslySetInnerHTML={{ __html: MARK_INNER }}
    />
  );
}

// layout: 'stacked' (emblem above the name — headers) or 'inline' (side by side — compact).
export function BhaktivedantaLogo({ size = 72, layout = 'stacked' }) {
  return (
    <div className={'bq-logo bq-logo-' + layout} role="img" aria-label="Bhaktivedanta Quiz">
      <LogoMark size={size} />
      <div className="bq-wordmark">
        <span className="bq-w1">Bhaktivedanta</span>
        <span className="bq-w2">QUIZ</span>
      </div>
    </div>
  );
}

// The emblem as an SVG image for use as a CSS background (watermark).
const WATERMARK_URI =
  'data:image/svg+xml,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112">${MARK_INNER}</svg>`);

const BRAND_CSS = `
  /* Gives each quiz screen its own stacking context, so the watermark (z-index -1)
     sits just above the screen's background colour and below every piece of content. */
  .qx-root { isolation: isolate; }

  .bq-watermark {
    position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background-image: url("${WATERMARK_URI}");
    background-repeat: no-repeat;
    background-position: center 52%;
    background-size: min(80vmin, 560px);
    opacity: 0.055;
  }

  .bq-logo { display: inline-flex; align-items: center; gap: 12px; }
  .bq-logo-stacked { flex-direction: column; text-align: center; gap: 6px; }
  .bq-logo-inline { flex-direction: row; text-align: left; }
  .bq-mark { display: block; filter: drop-shadow(0 4px 14px rgba(255,159,28,0.25)); }
  .bq-wordmark { display: flex; flex-direction: column; line-height: 1.05; }
  .bq-w1 {
    font-family: 'Cormorant Garamond', 'Playfair Display', Georgia, 'Times New Roman', serif;
    font-size: 30px; font-weight: 700; letter-spacing: 0.02em;
    background: linear-gradient(90deg, #FFD166, #FF9F1C);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .bq-w2 {
    margin-top: 3px; font-size: 13px; font-weight: 800; letter-spacing: 0.55em;
    color: var(--qx-text, #FFF4D6); opacity: 0.85;
  }
  .bq-logo-stacked .bq-w2 { margin-left: 0.55em; } /* optically re-centre the letter-spaced word */
  @media (max-width: 480px) { .bq-w1 { font-size: 26px; } }
`;

export function BrandStyles() {
  return (
    <>
      <style>{BRAND_CSS}</style>
      <div className="bq-watermark" aria-hidden="true" />
    </>
  );
}
