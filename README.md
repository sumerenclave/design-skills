# Design Skills

[![skills.sh](https://skills.sh/b/sumerenclave/design-skills)](https://skills.sh/sumerenclave/design-skills)

Skills that read a real design system out of a live website, and audit your own
UI against it.

## Install

```bash
npx skills@latest add sumerenclave/design-skills
```

## Why

Models don't have bad taste. They have **median** taste. Trained on the web, they
output the centre of mass of the web — Inter, `rounded-2xl`, `shadow-lg`, a violet
gradient, three feature cards. That isn't a failure mode, it's the model working
correctly. Ask for a sample from a distribution and you get the mode.

The usual fix is pasting reference screenshots. It underperforms for a structural
reason: a screenshot is a *rendering*. To use one, the model has to invert it —
re-derive the type scale, spacing rhythm and colour values from pixels. It's bad
at that, and it's non-deterministic, so the same image gives a different answer
every session. Meanwhile one image competes against an enormous prior pulling
toward framework defaults, and the prior usually wins.

But CSS is a one-way function — properties in, pixels out — and `getComputedStyle`
hands you the inverse for free. Don't infer the system. Read it.

## The two skills

| | |
|---|---|
| **`extract-system`** | URL → `tokens.json` + `design.md`. Commit them. Your reference now persists across sessions instead of being re-pasted. |
| **`design-audit`** | Renders your app, extracts *its* system, diffs against the reference, emits a prioritized findings table. |

## Use

Once installed, ask your agent — "extract the design system from linear.app",
"audit this page against the Linear reference" — and the skills take it from
there. The scripts need Playwright in the project they run in:

```bash
npm i -D playwright && npx playwright install chromium
```

Working in this repo directly:

```bash
npm install && npx playwright install chromium
npm test

# capture a reference, once
node skills/extract-system/scripts/extract.mjs https://linear.app/docs \
     --out references/linear --theme dark

# audit your app against it, repeatedly
node skills/design-audit/scripts/audit.mjs http://localhost:3000/orders \
     --ref references/linear.tokens.json --json .audit/orders.json
```

Then in `CLAUDE.md`:

```md
All UI work follows references/linear.design.md. Never introduce a value outside
those scales. Run design-audit before calling any UI work done.
```

## Sample output

`design-audit` prints facts, not opinions:

```
sev     category      yours    reference  finding
high    spacing       2px      4px        base grid mismatch — re-anchor every gap/padding to 4px
high    surface       shadows  borders    elevation strategy mismatch
high    palette       11       8          3 more neutrals than the reference — collapse to the reference ramp
medium  surface       6        3          6 distinct radii in use — reference uses 3
medium  contrast      3.9:1    4.5:1      #8a8f98 on #08090a is 3.9:1
```

## The one rule

**The script computes. The model only interprets.**

Node emits the counts. The model turns counts into fix plans. If you let the model
do the counting from a screenshot, you have rebuilt the thing that was already
failing you.

`design-audit` never edits source. It emits plans; a cheaper model executes them.
Same split as [`emilkowalski/improve-animations`](https://github.com/emilkowalski/skills).

## Fix in this order

Each step unblocks the next.

1. **Grid** — re-anchor spacing. Everything sits on it.
2. **Palette** — collapse the neutral ramp, one accent.
3. **Elevation** — borders or shadows, pick one, apply globally.
4. **Type** — collapse the scale, then set tracking.
5. **Contrast** — fix failures against the final palette.
6. **Motion** — last, and hand it to [`emilkowalski/skills`](https://github.com/emilkowalski/skills).

## Which page to point it at

Product surfaces, not marketing pages. A landing page is big type, hero gradients
and generous spacing; the application behind it is dense, small and border-led.
For an internal tool you want the latter. Docs sites are usually a good proxy when
the app is behind a login.

Run it against 2–3 pages of the same product and diff. Values present in all of
them are the system. Values present once are that page.

## Limits

This measures **consistency, not quality**. It will tell you a system uses four
neutrals and one radius. It cannot tell you the layout has no focal point, the
hierarchy is flat, or the whole thing is boring. Consistency is the floor you can
automate. The rest is yours.

`references/linear.tokens.json` ships as a starting point and is **authored from
recall, not measured** — it's flagged as such inside the file. Replace it by
running `extract-system` yourself.

## Layout

```
skills/
  extract-system/   SKILL.md + scripts/extract.mjs + scripts/extract-core.mjs
  design-audit/     SKILL.md + scripts/audit.mjs   + scripts/extract-core.mjs
test/
  analyze.test.mjs  runs without a browser (npm test)
references/
  linear.tokens.json + linear.design.md
```

`extract-core.mjs` (collection, colour maths, histograms, markdown rendering)
is vendored into each skill so every skill folder installs standalone; the test
suite asserts the two copies stay identical.

## Related

[`emilkowalski/skills`](https://github.com/emilkowalski/skills) covers motion —
easings, durations, physicality — and covers it better than this does. These two
are different axes of the same problem. Install both.

MIT.
