// themes.js — one catalogue. Each theme names the games it suits and the
// signature default of one of them. Any theme whose ink/table contrast passes
// may be offered; the descriptor picks the signature default.
(function (root) {
  'use strict';

  const ALL = [
    { id: 'twilight', name: 'Twilight', suits: ['olspider', 'cards'], signatureFor: ['olspider'], color: '#140f2e', ink: '#f5efe2', bg: '#0d0a22' },
    { id: 'classic', name: 'Classic', suits: ['olspider', 'cards'], signatureFor: [], color: '#0c3d28', ink: '#f6f1e4', bg: '#0a3d24' },
    { id: 'casino', name: 'Casino', suits: ['olspider', 'cards'], signatureFor: [], color: '#071525', ink: '#f4f7fb', bg: '#061018' },
    { id: 'parlor', name: 'Parlor', suits: ['olspider', 'cards'], signatureFor: [], color: '#3a1020', ink: '#f8f1ea', bg: '#2a0c16' },
    { id: 'emerald', name: 'Emerald', suits: ['ol-free-cell', 'cards'], signatureFor: ['ol-free-cell'], color: '#063a27', ink: '#f7f3e8', bg: '#063a27' },
    { id: 'midnight', name: 'Midnight', suits: ['ol-free-cell', 'cards'], signatureFor: [], color: '#12323d', ink: '#f7f3e8', bg: '#12323d' },
    { id: 'front-nine', name: 'Front Nine', suits: ['ol-golf', 'cards'], signatureFor: ['ol-golf'], color: '#2c7a49', ink: '#10281c', bg: '#e7f6ee' },
    { id: 'back-nine', name: 'Back Nine', suits: ['ol-golf', 'cards'], signatureFor: [], color: '#123425', ink: '#f4efe0', bg: '#123425' },
    { id: 'parchment', name: 'Parchment', suits: ['ol-sudoku'], signatureFor: ['ol-sudoku'], color: '#e9d9af', ink: '#432205', bg: '#e9d9af' },
    { id: 'bridge', name: 'Bridge', suits: ['ol-bridge', 'cards'], signatureFor: ['ol-bridge'], color: '#0e6b3a', ink: '#f6f1e4', bg: '#0e6b3a' },
    { id: 'four-navy', name: 'Navy', suits: ['ol-four'], signatureFor: ['ol-four'], color: '#060c1a', ink: '#ffffff', bg: '#060c1a' },
    { id: 'four-charcoal', name: 'Charcoal', suits: ['ol-four'], signatureFor: [], color: '#1a1a1a', ink: '#f4f4f4', bg: '#1a1a1a' },
  ];
  const BY_ID = Object.fromEntries(ALL.map((t) => [t.id, t]));

  function channel(hex, i) {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }

  function luminance(hex) {
    const n = hex.replace('#', '');
    return 0.2126 * channel(n, 0) + 0.7152 * channel(n, 2) + 0.0722 * channel(n, 4);
  }

  function contrast(ink, bg) {
    const a = luminance(ink);
    const b = luminance(bg);
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }

  function passes(theme) {
    return contrast(theme.ink, theme.bg) >= 4.5;
  }

  /**
   * Every contrast-safe theme, signature first. Games do not filter the
   * catalogue. `suits` remains as provenance, not as a visibility gate.
   */
  function forDescriptor(descriptor) {
    const passing = ALL.filter(passes);
    const sig = signature(descriptor);
    return passing.filter((t) => t.id === sig).concat(passing.filter((t) => t.id !== sig));
  }

  function signature(descriptor) {
    if (descriptor && descriptor.signatureTheme && BY_ID[descriptor.signatureTheme]) return descriptor.signatureTheme;
    const hit = ALL.find((t) => t.signatureFor.includes(descriptor && descriptor.id));
    return hit ? hit.id : 'twilight';
  }

  /** Sets both data-ol-theme (core) and data-theme (existing OL Spider markup). */
  function apply(id, el) {
    const theme = BY_ID[id] || BY_ID.twilight;
    const node = el || document.documentElement;
    node.dataset.olTheme = theme.id;
    node.dataset.theme = theme.id;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.color);
    return theme.id;
  }

  root.OL.Themes = { ALL, BY_ID, contrast, passes, forDescriptor, signature, apply };
})(globalThis);
