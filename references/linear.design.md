# Design system — https://linear.app (application, dark)

> **Not measured.** Authored from recall of Linear's dark application theme.
> Close enough to work against today. Replace it by running `extract-system`
> against a Linear surface yourself.

## Non-negotiables

- Base grid is **4px**. Every padding, margin and gap is a multiple of it. Observed conformance: 97%.
- Body text is **13px**. The full scale is 11, 12, 13, 15, 17, 21px. Do not introduce a size outside it.
- Primary typeface: **Inter**. Weights in use: 400, 510, 590.
- Corner radius: 4px, 6px, 8px. 3 radii total — do not add a 4th.
- Elevation strategy: **borders**. Separate surfaces with 1px borders, not shadows. Do not use box-shadow for layout separation.
- Palette: 8 neutrals, 2 chromatic colours. Adding a new one requires a reason.

## Surfaces

| hex | L* | painted area | role |
| --- | --- | --- | --- |
| `#08090a` | 2.4 | — | canvas + sidebar |
| `#0f1011` | 4.4 | — | elevated / card |
| `#191a1b` | 8.2 | — | hover / input |
| `#232326` | 12.6 | — | pressed / selected |

## Text colours

| hex | L* | weighted by characters | role |
| --- | --- | --- | --- |
| `#f7f8f8` | 97.5 | — | primary |
| `#d0d6e0` | 84.6 | — | secondary |
| `#8a8f98` | 59.3 | — | tertiary / meta |
| `#62666d` | 43.1 | — | quaternary / disabled |

## Accents

- `#5e6ad2` — brand / primary action
- `#828fff` — brand hover

## Spacing scale

4px · 8px · 12px · 16px · 24px · 32px · 48px

## Letter-spacing

- -0.37px
- -0.18px

## Border colours

- `rgba(255, 255, 255, 0.08)`
- `#23252a`

## Motion

Durations: 0.1s, 0.15s
Easings: cubic-bezier(0.25, 0.46, 0.45, 0.94)

## Anti-patterns

Explicitly forbidden when working in this system:

- Any spacing value not divisible by 4
- Any font size outside 11/12/13/15/17/21px
- Introducing a neutral beyond the 8 listed above
- `box-shadow` used to separate surfaces (use a 1px border)
- Gradient text, emoji as icons, more than one accent colour per view
- Default Tailwind values (`rounded-2xl`, `shadow-lg`, `gap-6`) unless they coincide with the scale above