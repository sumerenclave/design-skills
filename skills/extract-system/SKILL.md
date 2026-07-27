---
name: extract-system
description: Read the real design system out of any live website — type scale, palette, spacing grid, radii, elevation strategy, motion — by measuring the rendered DOM. Use when the user references a site whose look they want to borrow, says "make it look like X", pastes a URL as a design reference, or needs a tokens file to constrain an agent's visual output. Produces a committed tokens.json + design.md, so the reference persists across sessions instead of being re-pasted as screenshots.
---

# extract-system

Turns "make it look like Linear" into numbers.

## Why this exists

A screenshot is a rendering. To use one, a model has to invert it — re-derive the
type scale, spacing rhythm and colour values from pixels. It is bad at that and,
worse, non-deterministic: same image, different inference every session. Meanwhile
one image competes against an enormous prior pulling toward framework defaults,
and the prior usually wins.

CSS is a one-way function: properties in, pixels out. But `getComputedStyle` gives
you the inverse for free. Don't infer the system — read it.

## Usage

```bash
npm i playwright && npx playwright install chromium

node scripts/extract.mjs https://linear.app --out references/linear --theme dark
node scripts/extract.mjs https://linear.app/homepage --out references/linear-marketing
```

Flags: `--out` (path prefix), `--theme dark|light`, `--viewport 1440x900`, `--wait 2500`.

Then commit both output files and reference `design.md` from `CLAUDE.md`:

```md
All UI work follows references/linear.design.md. Do not introduce a value
outside those scales. If you need one, stop and say why.
```

## Which page to point it at

Extract from **product surfaces, not marketing pages**. `linear.app` is a landing
page — big type, hero gradients, generous spacing. `linear.app/homepage` behind
auth is the actual application system: dense, 13px, borders not shadows. For an
internal tool you want the latter. Docs sites and changelogs are usually a good
proxy when the app is behind a login.

Run it against 2–3 pages of the same product and diff the outputs. Values that
appear in all of them are the system. Values that appear once are that page.

## What comes out

`<out>.tokens.json` — machine-readable, consumed by `design-audit`.
`<out>.design.md` — the rules in prose, including an explicit anti-pattern list.

Key fields: `typography.scale`, `spacing.unit` + `conformance`, `color.surfaces`
(area-weighted), `color.text` (character-weighted), `surface.strategy`
(borders / shadows / mixed), and `discipline.*` — the countable metrics the
audit diffs on.

## Reading the output

- **`spacing.conformance`** below ~0.9 means the reference itself is loose; don't
  treat its grid as gospel.
- **`surface.strategy`** is the single most transferable signal. `borders` vs
  `shadows` changes the feel of an interface more than colour does.
- **`typography.scaleRatioSpread`** is only meaningful with 4+ steps. A 3-step
  scale will show a large spread and that is not a defect.
- **`color.accents`** is chroma-filtered and area-weighted, so it finds the real
  brand colour rather than every tinted border.

## Limits — state these plainly rather than overclaiming

This measures **consistency, not quality**. It will tell you a system uses four
neutrals and one radius. It cannot tell you the layout has no focal point, the
hierarchy is flat, or the whole thing is boring. That judgement stays human.

It also cannot see: component composition, layout logic, interaction design,
copy, or anything behind a login. It reads what was painted.
