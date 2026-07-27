#!/usr/bin/env node
/**
 * audit.mjs — extract your app's real system, diff it against a reference,
 * emit a prioritized findings table.
 *
 *   node audit.mjs <your-url> --ref references/linear.tokens.json
 *                  [--json out.json] [--theme dark] [--viewport 1440x900]
 *
 * Prints a table for a human. Writes JSON for an agent.
 * NEVER touches source. The agent turns findings into plans/; a cheap model
 * executes the plans. Same split as emilkowalski/improve-animations.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { COLLECT_SCRIPT, analyze, parseColor, contrastRatio } from '../../../lib/extract-core.mjs';

const args = process.argv.slice(2);
const url = args[0];
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const refPath = flag('ref', null);
if (!url || !refPath) {
  console.error('usage: node audit.mjs <url> --ref <tokens.json> [--json out.json]');
  process.exit(1);
}

const ref = JSON.parse(readFileSync(refPath, 'utf8'));
const theme = flag('theme', ref.color?.mode === 'light' ? 'light' : 'dark');
const [vw, vh] = flag('viewport', '1440x900').split('x').map(Number);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: vw, height: vh }, colorScheme: theme, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => page.goto(url, { waitUntil: 'domcontentloaded' }));
await page.waitForTimeout(2500);
const nodes = await page.evaluate(COLLECT_SCRIPT);
await browser.close();

const mine = analyze(nodes);
const findings = diff(mine, ref);

/* ---- report ---- */
const sevOrder = { high: 0, medium: 1, low: 2 };
findings.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.delta - a.delta);

console.log(`\naudit: ${url}`);
console.log(`ref:   ${ref.source?.url || refPath}\n`);
console.log('sev'.padEnd(8) + 'category'.padEnd(16) + 'yours'.padEnd(14) + 'reference'.padEnd(14) + 'finding');
console.log('-'.repeat(110));
for (const f of findings) {
  console.log(
    f.severity.padEnd(8) +
    f.category.padEnd(16) +
    String(f.actual).slice(0, 13).padEnd(14) +
    String(f.expected).slice(0, 13).padEnd(14) +
    f.message
  );
}
console.log('-'.repeat(110));
const h = findings.filter((f) => f.severity === 'high').length;
console.log(`${findings.length} findings — ${h} high\n`);

const jsonOut = flag('json', null);
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ url, reference: refPath, mine, findings }, null, 2));
  console.log(`wrote ${jsonOut}`);
}

/* ------------------------------------------------------------------ */
/* The diff. Every check is countable. No aesthetic judgement here.    */
/* ------------------------------------------------------------------ */

function diff(a, r) {
  const f = [];
  const push = (severity, category, message, actual, expected, delta = 0) =>
    f.push({ severity, category, message, actual, expected, delta });

  /* --- palette discipline --- */
  const grayDelta = a.discipline.grayCount - r.discipline.grayCount;
  if (grayDelta > 2)
    push(grayDelta > 5 ? 'high' : 'medium', 'palette',
      `${grayDelta} more neutrals than the reference — collapse to the reference ramp`,
      a.discipline.grayCount, r.discipline.grayCount, grayDelta);

  if (a.discipline.accentCount > r.discipline.accentCount + 1)
    push('high', 'palette',
      `too many chromatic colours; reference carries ${r.discipline.accentCount}`,
      a.discipline.accentCount, r.discipline.accentCount, a.discipline.accentCount - r.discipline.accentCount);

  /* --- spacing --- */
  if (a.spacing.unit !== r.spacing.unit)
    push('high', 'spacing', `base grid mismatch — re-anchor every gap/padding to ${r.spacing.unit}px`,
      `${a.spacing.unit}px`, `${r.spacing.unit}px`, 10);

  if (a.discipline.offGridRatio > 0.1)
    push(a.discipline.offGridRatio > 0.25 ? 'high' : 'medium', 'spacing',
      `${(a.discipline.offGridRatio * 100).toFixed(0)}% of spacing values are off-grid`,
      `${(a.discipline.offGridRatio * 100).toFixed(0)}%`,
      `<${((r.discipline.offGridRatio || 0) * 100).toFixed(0)}%`,
      a.discipline.offGridRatio * 10);

  /* --- typography --- */
  const stepDelta = a.discipline.typeScaleSteps - r.discipline.typeScaleSteps;
  if (stepDelta > 2)
    push('high', 'typography', `type scale has ${stepDelta} more steps than the reference — collapse it`,
      a.discipline.typeScaleSteps, r.discipline.typeScaleSteps, stepDelta);

  if (a.typography.bodySize !== r.typography.bodySize)
    push('medium', 'typography', `body size differs; reference reads at ${r.typography.bodySize}px`,
      `${a.typography.bodySize}px`, `${r.typography.bodySize}px`, 2);

  const refFam = r.typography.families[0]?.family;
  const myFam = a.typography.families[0]?.family;
  if (refFam && myFam && refFam !== myFam)
    push('medium', 'typography', `primary typeface differs`, myFam, refFam, 2);

  if (r.typography.tracking.length && !a.typography.tracking.length)
    push('low', 'typography', `reference tightens tracking on large text; yours uses none`,
      'none', r.typography.tracking[0].value, 1);

  /* --- surface --- */
  const radDelta = a.discipline.radiusCount - r.discipline.radiusCount;
  if (radDelta > 1)
    push(radDelta > 3 ? 'high' : 'medium', 'surface',
      `${a.discipline.radiusCount} distinct radii in use — reference uses ${r.discipline.radiusCount}`,
      a.discipline.radiusCount, r.discipline.radiusCount, radDelta);

  if (a.surface.strategy !== r.surface.strategy && r.surface.strategy !== 'unknown')
    push('high', 'surface',
      `elevation strategy mismatch — reference separates surfaces with ${r.surface.strategy}`,
      a.surface.strategy, r.surface.strategy, 5);

  if (a.discipline.shadowCount > r.discipline.shadowCount + 1)
    push('medium', 'surface', `${a.discipline.shadowCount} distinct shadows; reference uses ${r.discipline.shadowCount}`,
      a.discipline.shadowCount, r.discipline.shadowCount, a.discipline.shadowCount - r.discipline.shadowCount);

  /* --- contrast (checkable, not taste) --- */
  const bg = a.color.surfaces[0] && parseColor(hex(a.color.surfaces[0].hex));
  if (bg) {
    for (const t of a.color.text.slice(0, 4)) {
      const cr = contrastRatio(bg, parseColor(hex(t.hex)));
      if (cr < 4.5)
        push(cr < 3 ? 'high' : 'medium', 'contrast',
          `${t.hex} on ${a.color.surfaces[0].hex} is ${cr.toFixed(1)}:1`,
          `${cr.toFixed(1)}:1`, '4.5:1', 4.5 - cr);
    }
  }

  /* --- motion --- */
  if (r.motion.durations.length && !a.motion.durations.length)
    push('low', 'motion', `no transitions found; reference animates at ${r.motion.durations[0].value}`,
      'none', r.motion.durations[0].value, 1);

  return f;
}

function hex(h) {
  const s = h.replace('#', '');
  return `rgb(${parseInt(s.slice(0, 2), 16)}, ${parseInt(s.slice(2, 4), 16)}, ${parseInt(s.slice(4, 6), 16)})`;
}
