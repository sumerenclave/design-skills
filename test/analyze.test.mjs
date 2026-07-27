import { analyze } from '../lib/extract-core.mjs';

/** Build a fake computed-style record. */
function node(o = {}) {
  return {
    tag: 'div', area: 1000, w: 100, h: 10, hasText: false, textLen: 0,
    fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: '400',
    lineHeight: '20px', letterSpacing: 'normal', textTransform: 'none',
    color: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)', backgroundImage: null,
    borderTopWidth: 0, borderTopColor: 'rgb(0,0,0)', borderTopStyle: 'none',
    borderRadius: '0px', boxShadow: null, display: 'block', gap: 'normal',
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    marginTop: 0, marginBottom: 0,
    transitionDuration: '0s', transitionTimingFunction: 'ease',
    ...o,
  };
}

/* --- Fixture A: a disciplined dark system (Linear-shaped) --- */
const disciplined = [];
for (let i = 0; i < 60; i++) {
  disciplined.push(node({
    background: 'rgb(8, 9, 10)', area: 50000,
    paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 12,
    borderRadius: '4px', borderTopWidth: 1, borderTopStyle: 'solid',
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  }));
}
for (let i = 0; i < 40; i++) {
  disciplined.push(node({
    hasText: true, textLen: 30, fontSize: 13, color: 'rgb(247, 248, 248)',
    paddingTop: 4, paddingBottom: 4, borderRadius: '4px',
  }));
}
for (let i = 0; i < 12; i++) {
  disciplined.push(node({ hasText: true, textLen: 12, fontSize: 11, color: 'rgb(138, 143, 152)', marginBottom: 8 }));
}
for (let i = 0; i < 8; i++) {
  disciplined.push(node({ hasText: true, textLen: 20, fontSize: 21, fontWeight: '510', color: 'rgb(247, 248, 248)', letterSpacing: '-0.37px' }));
}
for (let i = 0; i < 6; i++) {
  disciplined.push(node({ background: 'rgb(94, 106, 210)', area: 3000, borderRadius: '4px', paddingLeft: 12, paddingRight: 12 }));
}

/* --- Fixture B: the same app, sloppy (many grays, radii, off-grid) --- */
const sloppy = [];
const grays = ['rgb(17,17,17)', 'rgb(34,34,34)', 'rgb(51,51,51)', 'rgb(68,68,68)', 'rgb(85,85,85)',
               'rgb(102,102,102)', 'rgb(119,119,119)', 'rgb(136,136,136)', 'rgb(153,153,153)',
               'rgb(170,170,170)', 'rgb(187,187,187)'];
const radii = ['3px', '5px', '6px', '9px', '12px', '16px'];
grays.forEach((g, i) => {
  for (let j = 0; j < 10; j++) {
    sloppy.push(node({
      background: g, area: 20000, borderRadius: radii[i % radii.length],
      paddingTop: 7 + (i % 3), paddingLeft: 13 + (i % 5), paddingBottom: 11, paddingRight: 9,
      boxShadow: `rgba(0,0,0,0.${i % 5 + 1}) 0px ${i % 4 + 1}px ${i % 8 + 2}px 0px`,
    }));
  }
});
[10, 12, 14, 15, 17, 19, 24, 28, 33, 41].forEach((fs) => {
  for (let j = 0; j < 5; j++) {
    sloppy.push(node({ hasText: true, textLen: 25, fontSize: fs, color: grays[fs % grays.length] }));
  }
});
['rgb(219,39,119)', 'rgb(37,99,235)', 'rgb(22,163,74)', 'rgb(234,88,12)'].forEach((c) => {
  for (let j = 0; j < 6; j++) sloppy.push(node({ background: c, area: 4000, borderRadius: '9px' }));
});

/* --- Run --- */
const A = analyze(disciplined);
const B = analyze(sloppy);

const row = (label, a, b) => console.log(`${label.padEnd(22)} ${String(a).padEnd(18)} ${b}`);

console.log('\n' + 'metric'.padEnd(22) + 'disciplined'.padEnd(18) + 'sloppy');
console.log('-'.repeat(60));
row('mode', A.color.mode, B.color.mode);
row('body size', A.typography.bodySize, B.typography.bodySize);
row('type scale steps', A.discipline.typeScaleSteps, B.discipline.typeScaleSteps);
row('ratio spread', A.discipline.typeScaleRatioSpread, B.discipline.typeScaleRatioSpread);
row('distinct neutrals', A.discipline.grayCount, B.discipline.grayCount);
row('accent count', A.discipline.accentCount, B.discipline.accentCount);
row('radius count', A.discipline.radiusCount, B.discipline.radiusCount);
row('shadow count', A.discipline.shadowCount, B.discipline.shadowCount);
row('spacing unit', A.spacing.unit, B.spacing.unit);
row('grid conformance', A.spacing.conformance, B.spacing.conformance);
row('off-grid ratio', A.discipline.offGridRatio, B.discipline.offGridRatio);
row('surface strategy', A.surface.strategy, B.surface.strategy);
console.log('-'.repeat(60));

console.log('\ndisciplined accents:', JSON.stringify(A.color.accents));
console.log('disciplined surfaces:', JSON.stringify(A.color.surfaces.slice(0, 2)));
console.log('disciplined text:', JSON.stringify(A.color.text.slice(0, 3)));

/* Assertions: the critic must separate the two. */
const checks = [
  ['detects dark mode', A.color.mode === 'dark'],
  ['finds 13px body', A.typography.bodySize === 13],
  ['finds Linear indigo accent', A.color.accents.some((a) => a.hex === '#5e6ad2')],
  ['disciplined has fewer neutrals', A.discipline.grayCount < B.discipline.grayCount],
  ['disciplined has fewer radii', A.discipline.radiusCount < B.discipline.radiusCount],
  ['disciplined has fewer shadows', A.discipline.shadowCount < B.discipline.shadowCount],
  ['disciplined is more on-grid', A.spacing.conformance > B.spacing.conformance],
  ['border strategy detected', A.surface.strategy === 'borders'],
  ['shadow strategy detected', B.surface.strategy === 'shadows'],
];
console.log('');
let fail = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) fail++;
}
console.log(`\n${checks.length - fail}/${checks.length} passed`);
process.exit(fail ? 1 : 0);
