#!/usr/bin/env node
/**
 * extract.mjs — read a live page's real design system out of the DOM.
 *
 *   node extract.mjs <url> [--out references/<name>] [--wait 2000]
 *                          [--viewport 1440x900] [--theme dark|light]
 *
 * Writes <out>.tokens.json (machine-readable, consumed by design-audit)
 * and   <out>.design.md    (human/agent-readable rules).
 *
 * Requires: npm i playwright && npx playwright install chromium
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { COLLECT_SCRIPT, analyze, renderMarkdown } from '../../../lib/extract-core.mjs';

const args = process.argv.slice(2);
const url = args[0];
if (!url) {
  console.error('usage: node extract.mjs <url> [--out path] [--wait ms] [--viewport WxH] [--theme dark|light]');
  process.exit(1);
}
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};

const out = flag('out', `references/${new URL(url).hostname.replace(/\./g, '-')}`);
const wait = parseInt(flag('wait', '2500'), 10);
const theme = flag('theme', 'dark');
const [vw, vh] = flag('viewport', '1440x900').split('x').map(Number);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: vw, height: vh },
  colorScheme: theme,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

console.log(`→ ${url}  (${vw}x${vh}, ${theme})`);
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => page.goto(url, { waitUntil: 'domcontentloaded' }));
await page.waitForTimeout(wait);

// Scroll once end-to-end so lazy content mounts and enters the sample.
await page.evaluate(async () => {
  const step = window.innerHeight * 0.8;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(500);

const nodes = await page.evaluate(COLLECT_SCRIPT);
await browser.close();

if (nodes.length < 20) {
  console.error(`only ${nodes.length} visible nodes — page probably did not render. Try --wait 6000.`);
  process.exit(1);
}

const tokens = analyze(nodes);
tokens.source = { url, viewport: `${vw}x${vh}`, theme };
tokens.provenance = 'measured';

mkdirSync(dirname(out), { recursive: true });
writeFileSync(`${out}.tokens.json`, JSON.stringify(tokens, null, 2));
writeFileSync(`${out}.design.md`, renderMarkdown(tokens));

console.log(`\n  ${tokens.meta.nodesInspected} nodes  ·  ${tokens.color.mode} mode`);
console.log(`  body ${tokens.typography.bodySize}px · ${tokens.typography.families[0]?.family}`);
console.log(`  ${tokens.discipline.grayCount} neutrals · ${tokens.discipline.radiusCount} radii · ${tokens.discipline.shadowCount} shadows`);
console.log(`  ${tokens.spacing.unit}px grid at ${(tokens.spacing.conformance * 100).toFixed(0)}% conformance · ${tokens.surface.strategy}`);
console.log(`\nwrote ${out}.tokens.json + ${out}.design.md`);
