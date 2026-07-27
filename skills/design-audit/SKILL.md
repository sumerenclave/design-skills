---
name: design-audit
description: Audit a running app's visual design against a reference token file and emit prioritized, self-contained fix plans. Use when the user says their UI looks off, wants it to match a reference system, asks what drifted from the design system, or after an agent has generated UI that needs checking. Measures the rendered result rather than reading source, so it catches drift that looks fine in code review.
---

# design-audit

The critic half of the loop. `extract-system` captures the target; this measures
what you actually shipped and reports the delta.

## Why this exists

Generated UI snaps back to the median because nothing checks it. Emil Kowalski's
`improve-animations` proved the pattern on motion: survey the whole project, audit
against fixed categories, emit a prioritized table, write self-contained plans that
a cheaper model executes, never touch source directly. Nothing does this for static
composition. This does.

## Usage

Paths below are relative to this skill's folder. Step 1 uses the
`extract-system` skill installed alongside this one; skip it if a reference
tokens file already exists.

```bash
# 0. once per project
npm i -D playwright && npx playwright install chromium

# 1. capture the target once, commit it
node ../extract-system/scripts/extract.mjs https://linear.app/docs --out references/linear

# 2. audit your running app against it
node scripts/audit.mjs http://localhost:3000/orders \
  --ref references/linear.tokens.json --json .audit/orders.json
```

Audit several routes, not one. Drift is per-surface.

## The rule that makes this work

**The script computes. The model only interprets.**

Node emits the facts — 11 distinct neutrals, 34% of spacing off-grid, 6 radii,
type scale ratio drifting 1.2→1.6, `#8a8f98` on `#08090a` is 3.9:1. The model
receives those as input and writes the plan. If you let the model count from a
screenshot it will hallucinate the counts and you have rebuilt the broken thing.

## What it checks

Countable properties only: neutral count, accent count, base grid + off-grid
ratio, type scale step count, body size, typeface, radius count, elevation
strategy (borders vs shadows), shadow count, text contrast ratios, presence of
motion. Each finding carries `severity`, `actual`, `expected`, and a `delta`
used for ranking.

## Then: plans, not edits

This tool never modifies source. Turn high-severity findings into one
self-contained file per fix in `plans/`, each naming exact files, exact
values, and a done-condition — so a cheap model can execute it with no taste
and no context. Fix in this order, because each unblocks the next:

1. **Grid** — re-anchor spacing. Everything else sits on it.
2. **Palette** — collapse the neutral ramp, one accent.
3. **Elevation** — borders or shadows, pick one, apply globally.
4. **Type** — collapse the scale, then set tracking.
5. **Contrast** — fix failures against the final palette.
6. **Motion** — last, and hand it to `emilkowalski/skills` which is better at it.

Re-run the audit after each plan lands. The metrics should move monotonically;
if one gets worse, the plan was wrong.

## Limits

Passing this audit means your interface is **internally consistent and matches
the reference's discipline**. It does not mean it is good. A perfectly consistent
layout with no focal point and flat hierarchy scores clean here. Consistency is
the floor you can automate; the rest is yours.
