/**
 * extract-core.mjs
 *
 * The deterministic half of the system. Node computes; the model only interprets.
 * Nothing in this file guesses. Every number out is counted, not inferred.
 *
 * Two entry points:
 *   collectNodes(page)   -> raw per-element computed style records (needs Playwright page)
 *   analyze(nodes)       -> design system tokens + measured stats (pure, testable)
 */

/* ------------------------------------------------------------------ */
/* 1. Collection — runs inside the browser                             */
/* ------------------------------------------------------------------ */

export const COLLECT_SCRIPT = () => {
  const out = [];
  const els = document.querySelectorAll('body *');

  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;

    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;

    // Does this element render its own text (not just wrap children)?
    let ownText = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) ownText += n.textContent.trim();
    }

    out.push({
      tag: el.tagName.toLowerCase(),
      area: Math.round(r.width * r.height),
      w: Math.round(r.width),
      h: Math.round(r.height),
      hasText: ownText.length > 0,
      textLen: ownText.length,

      fontFamily: cs.fontFamily,
      fontSize: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textTransform: cs.textTransform,

      color: cs.color,
      background: cs.backgroundColor,
      backgroundImage: cs.backgroundImage === 'none' ? null : cs.backgroundImage,

      borderTopWidth: parseFloat(cs.borderTopWidth),
      borderTopColor: cs.borderTopColor,
      borderTopStyle: cs.borderTopStyle,
      borderRadius: cs.borderTopLeftRadius,
      boxShadow: cs.boxShadow === 'none' ? null : cs.boxShadow,

      display: cs.display,
      gap: cs.gap,
      paddingTop: parseFloat(cs.paddingTop),
      paddingRight: parseFloat(cs.paddingRight),
      paddingBottom: parseFloat(cs.paddingBottom),
      paddingLeft: parseFloat(cs.paddingLeft),
      marginTop: parseFloat(cs.marginTop),
      marginBottom: parseFloat(cs.marginBottom),

      transitionDuration: cs.transitionDuration,
      transitionTimingFunction: cs.transitionTimingFunction,
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* 2. Colour utilities                                                 */
/* ------------------------------------------------------------------ */

export function parseColor(str) {
  if (!str) return null;
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
  const [r, g, b] = p;
  const a = p.length > 3 ? p[3] : 1;
  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b, a };
}

export function toHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Perceived lightness 0-100, CIE L* from sRGB. */
export function lightness({ r, g, b }) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return Y <= 0.008856 ? Y * 903.3 : Math.pow(Y, 1 / 3) * 116 - 16;
}

/** Chroma proxy: max-min channel spread. <10 == effectively neutral. */
export function chroma({ r, g, b }) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

export function contrastRatio(c1, c2) {
  const lum = ({ r, g, b }) => {
    const lin = (c) => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const [a, b_] = [lum(c1), lum(c2)].sort((x, y) => y - x);
  return (a + 0.05) / (b_ + 0.05);
}

/* ------------------------------------------------------------------ */
/* 3. Histogram helpers                                                */
/* ------------------------------------------------------------------ */

function tally(items) {
  const m = new Map();
  for (const it of items) {
    if (it === null || it === undefined || it === '') continue;
    m.set(it, (m.get(it) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function weightedTally(pairs) {
  const m = new Map();
  for (const [k, w] of pairs) {
    if (k === null || k === undefined || k === '') continue;
    m.set(k, (m.get(k) || 0) + w);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Find the base spacing unit: the divisor that explains the most observed
 * spacing values. Not a guess — we score candidates against the real data.
 */
function deriveSpacingUnit(values) {
  const vals = values.filter((v) => v > 0 && v < 200 && Number.isFinite(v));
  if (!vals.length) return { unit: null, conformance: 0 };
  let best = { unit: null, conformance: 0 };
  for (const unit of [2, 4, 6, 8]) {
    const hits = vals.filter((v) => Math.abs(v % unit) < 0.51 || Math.abs((v % unit) - unit) < 0.51).length;
    const conformance = hits / vals.length;
    // Prefer the largest unit that still explains >=85% of values.
    if (conformance >= 0.85 && unit > (best.unit || 0)) best = { unit, conformance };
    if (!best.unit && conformance > best.conformance) best = { unit, conformance };
  }
  return { unit: best.unit, conformance: +best.conformance.toFixed(3) };
}

/** Consistency of a type scale: ratios between consecutive steps. */
function scaleRatios(sizes) {
  const s = [...sizes].sort((a, b) => a - b);
  const ratios = [];
  for (let i = 1; i < s.length; i++) ratios.push(+(s[i] / s[i - 1]).toFixed(3));
  if (!ratios.length) return { ratios, min: null, max: null, spread: null };
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  return { ratios, min, max, spread: +(max - min).toFixed(3) };
}

/* ------------------------------------------------------------------ */
/* 4. Analysis — pure, no browser                                      */
/* ------------------------------------------------------------------ */

export function analyze(nodes, opts = {}) {
  const minCount = opts.minCount ?? 2;

  /* ---- Typography ---- */
  const textNodes = nodes.filter((n) => n.hasText && n.textLen > 1);

  const sizeCounts = tally(textNodes.map((n) => Math.round(n.fontSize)));
  const typeScale = sizeCounts.filter(([, c]) => c >= minCount).map(([s]) => s).sort((a, b) => a - b);
  const bodySize = sizeCounts.length ? sizeCounts[0][0] : null;

  const families = tally(textNodes.map((n) => n.fontFamily.split(',')[0].replace(/['"]/g, '').trim()));
  const weights = tally(textNodes.map((n) => n.fontWeight));

  const tracking = tally(
    textNodes
      .map((n) => n.letterSpacing)
      .filter((v) => v && v !== 'normal' && parseFloat(v) !== 0)
      .map((v) => `${parseFloat(v).toFixed(2)}px`)
  );

  /* ---- Colour ---- */
  // Backgrounds weighted by painted area; text colours weighted by character count.
  const bgPairs = nodes
    .map((n) => [parseColor(n.background), n.area])
    .filter(([c]) => c && c.a > 0.05)
    .map(([c, a]) => [toHex(c), a]);

  const fgPairs = textNodes
    .map((n) => [parseColor(n.color), n.textLen])
    .filter(([c]) => c)
    .map(([c, t]) => [toHex(c), t]);

  const backgrounds = weightedTally(bgPairs);
  const foregrounds = weightedTally(fgPairs);

  const allColors = [...new Set([...backgrounds.map((x) => x[0]), ...foregrounds.map((x) => x[0])])];
  const neutrals = allColors.filter((h) => chroma(parseColor(hexToRgbStr(h))) < 12);
  const accents = allColors.filter((h) => chroma(parseColor(hexToRgbStr(h))) >= 12);

  // Accent = the highest-chroma colour that actually covers meaningful area.
  const accentRanked = weightedTally([...bgPairs, ...fgPairs])
    .filter(([h]) => chroma(parseColor(hexToRgbStr(h))) >= 25)
    .slice(0, 6);

  const surfaceRanked = backgrounds.slice(0, 6).map(([hex, area]) => ({
    hex,
    area,
    L: +lightness(parseColor(hexToRgbStr(hex))).toFixed(1),
  }));

  const isDark = surfaceRanked.length ? surfaceRanked[0].L < 50 : null;

  /* ---- Borders, radii, shadows ---- */
  const radii = tally(
    nodes.map((n) => n.borderRadius).filter((v) => v && parseFloat(v) > 0).map((v) => (v.includes('%') ? v : `${Math.round(parseFloat(v))}px`))
  );

  const borderNodes = nodes.filter((n) => n.borderTopWidth > 0 && n.borderTopStyle !== 'none');
  const borderColors = weightedTally(
    borderNodes.map((n) => [parseColor(n.borderTopColor), n.area]).filter(([c]) => c && c.a > 0.02).map(([c, a]) => [colorKey(c), a])
  );

  const shadows = tally(nodes.map((n) => n.boxShadow).filter(Boolean));

  /* ---- Spacing ---- */
  const spacingValues = [];
  for (const n of nodes) {
    for (const v of [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft, n.marginTop, n.marginBottom]) {
      if (v > 0) spacingValues.push(Math.round(v * 100) / 100);
    }
    if (n.gap && n.gap !== 'normal') {
      for (const g of n.gap.split(/\s+/).map(parseFloat)) if (g > 0) spacingValues.push(g);
    }
  }
  const spacing = deriveSpacingUnit(spacingValues);
  const spacingScale = tally(spacingValues.map(Math.round)).filter(([, c]) => c >= minCount).map(([v]) => v).sort((a, b) => a - b);

  /* ---- Motion ---- */
  const durations = tally(
    nodes.flatMap((n) => (n.transitionDuration || '').split(',').map((s) => s.trim())).filter((d) => d && d !== '0s')
  );
  const easings = tally(
    nodes.flatMap((n) => (n.transitionTimingFunction || '').split(/,(?![^(]*\))/).map((s) => s.trim())).filter((e) => e && e !== 'ease')
  );

  /* ---- Discipline metrics: the numbers the critic actually diffs on ---- */
  const grayCount = neutrals.length;
  const radiusCount = radii.filter(([, c]) => c >= minCount).length;
  const shadowCount = shadows.filter(([, c]) => c >= minCount).length;
  const offGrid = spacing.unit
    ? +(
        spacingValues.filter((v) => !(Math.abs(v % spacing.unit) < 0.51 || Math.abs((v % spacing.unit) - spacing.unit) < 0.51)).length /
        Math.max(spacingValues.length, 1)
      ).toFixed(3)
    : null;
  const scale = scaleRatios(typeScale);

  const borderShadowBalance =
    borderNodes.length + shadows.length > 0
      ? +(borderNodes.length / (borderNodes.length + nodes.filter((n) => n.boxShadow).length)).toFixed(2)
      : null;

  return {
    meta: { nodesInspected: nodes.length, textNodes: textNodes.length, generatedAt: new Date().toISOString() },

    typography: {
      bodySize,
      scale: typeScale,
      scaleRatioSpread: scale.spread,
      families: families.slice(0, 4).map(([f, c]) => ({ family: f, count: c })),
      weights: weights.filter(([, c]) => c >= minCount).map(([w, c]) => ({ weight: w, count: c })),
      tracking: tracking.slice(0, 4).map(([t, c]) => ({ value: t, count: c })),
    },

    color: {
      mode: isDark === null ? 'unknown' : isDark ? 'dark' : 'light',
      surfaces: surfaceRanked,
      text: foregrounds.slice(0, 6).map(([hex, w]) => ({ hex, weight: w, L: +lightness(parseColor(hexToRgbStr(hex))).toFixed(1) })),
      accents: accentRanked.map(([hex, w]) => ({ hex, weight: w })),
      neutralCount: grayCount,
      accentCount: accents.length,
    },

    surface: {
      radii: radii.filter(([, c]) => c >= minCount).map(([r, c]) => ({ value: r, count: c })),
      borderColors: borderColors.slice(0, 4).map(([c, w]) => ({ value: c, weight: w })),
      shadows: shadows.filter(([, c]) => c >= minCount).map(([s, c]) => ({ value: s, count: c })),
      strategy: borderShadowBalance === null ? 'unknown' : borderShadowBalance > 0.7 ? 'borders' : borderShadowBalance < 0.3 ? 'shadows' : 'mixed',
    },

    spacing: { unit: spacing.unit, conformance: spacing.conformance, scale: spacingScale },

    motion: {
      durations: durations.slice(0, 4).map(([d, c]) => ({ value: d, count: c })),
      easings: easings.slice(0, 4).map(([e, c]) => ({ value: e, count: c })),
    },

    discipline: {
      grayCount,
      accentCount: accents.length,
      radiusCount,
      shadowCount,
      offGridRatio: offGrid,
      typeScaleSteps: typeScale.length,
      typeScaleRatioSpread: scale.spread,
    },
  };
}

function hexToRgbStr(hex) {
  const h = hex.replace('#', '');
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
}

function colorKey(c) {
  return c.a < 0.99 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${+c.a.toFixed(3)})` : toHex(c);
}


/* ------------------------------------------------------------------ */
/* 5. Markdown rendering — the agent-readable half of the output       */
/* ------------------------------------------------------------------ */

export function renderMarkdown(t) {
  const l = [];
  // Reference files may be hand-authored, in which case the count/area fields
  // are null. Render those as '—' rather than throwing.
  const n = (v) => (v === null || v === undefined ? '—' : v.toLocaleString());
  l.push(`# Design system — ${t.source.url}`);
  l.push(``);
  l.push(`Measured from the live DOM at ${t.meta.generatedAt}. ${t.meta.nodesInspected} visible elements.`);
  l.push(`Every value below is counted from rendered output, not inferred.`);
  l.push(``);
  l.push(`## Non-negotiables`);
  l.push(``);
  l.push(`- Base grid is **${t.spacing.unit}px**. Every padding, margin and gap is a multiple of it. Observed conformance: ${(t.spacing.conformance * 100).toFixed(0)}%.`);
  l.push(`- Body text is **${t.typography.bodySize}px**. The full scale is ${t.typography.scale.join(', ')}px. Do not introduce a size outside it.`);
  l.push(`- Primary typeface: **${t.typography.families[0]?.family}**. Weights in use: ${t.typography.weights.map((w) => w.weight).join(', ')}.`);
  l.push(`- Corner radius: ${t.surface.radii.map((r) => r.value).join(', ') || 'none'}. ${t.surface.radii.length === 1 ? 'One radius, everywhere.' : `${t.surface.radii.length} radii total — do not add a ${t.surface.radii.length + 1}th.`}`);
  l.push(`- Elevation strategy: **${t.surface.strategy}**.${t.surface.strategy === 'borders' ? ' Separate surfaces with 1px borders, not shadows. Do not use box-shadow for layout separation.' : ''}`);
  l.push(`- Palette: ${t.discipline.grayCount} neutrals, ${t.discipline.accentCount} chromatic colours. Adding a new one requires a reason.`);
  l.push(``);
  l.push(`## Surfaces`);
  l.push(``);
  l.push(`| hex | L* | painted area | role |`);
  l.push(`| --- | --- | --- | --- |`);
  for (const s of t.color.surfaces) l.push(`| \`${s.hex}\` | ${s.L} | ${n(s.area)} | ${s.role || ''} |`);
  l.push(``);
  l.push(`## Text colours`);
  l.push(``);
  l.push(`| hex | L* | weighted by characters | role |`);
  l.push(`| --- | --- | --- | --- |`);
  for (const c of t.color.text) l.push(`| \`${c.hex}\` | ${c.L} | ${n(c.weight)} | ${c.role || ''} |`);
  l.push(``);
  if (t.color.accents.length) {
    l.push(`## Accents`);
    l.push(``);
    for (const a of t.color.accents) l.push(`- \`${a.hex}\`${a.role ? ` — ${a.role}` : ''}`);
    l.push(``);
  }
  l.push(`## Spacing scale`);
  l.push(``);
  l.push(t.spacing.scale.map((s) => `${s}px`).join(' · '));
  l.push(``);
  if (t.typography.tracking.length) {
    l.push(`## Letter-spacing`);
    l.push(``);
    for (const tr of t.typography.tracking) l.push(`- ${tr.value}${tr.count ? ` (${tr.count} elements)` : ''}`);
    l.push(``);
  }
  if (t.surface.borderColors.length) {
    l.push(`## Border colours`);
    l.push(``);
    for (const b of t.surface.borderColors) l.push(`- \`${b.value}\``);
    l.push(``);
  }
  if (t.motion.durations.length) {
    l.push(`## Motion`);
    l.push(``);
    l.push(`Durations: ${t.motion.durations.map((d) => d.value).join(', ')}`);
    l.push(`Easings: ${t.motion.easings.map((e) => e.value).join(', ')}`);
    l.push(``);
  }
  l.push(`## Anti-patterns`);
  l.push(``);
  l.push(`Explicitly forbidden when working in this system:`);
  l.push(``);
  l.push(`- Any spacing value not divisible by ${t.spacing.unit}`);
  l.push(`- Any font size outside ${t.typography.scale.join('/')}px`);
  l.push(`- Introducing a neutral beyond the ${t.discipline.grayCount} listed above`);
  if (t.surface.strategy === 'borders') l.push(`- \`box-shadow\` used to separate surfaces (use a 1px border)`);
  l.push(`- Gradient text, emoji as icons, more than one accent colour per view`);
  l.push(`- Default Tailwind values (\`rounded-2xl\`, \`shadow-lg\`, \`gap-6\`) unless they coincide with the scale above`);
  return l.join('\n');
}
