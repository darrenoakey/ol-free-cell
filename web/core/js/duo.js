// duo.js — width-driven expanded workspaces with an optional companion region.
// Apps own both regions' content; Duo only observes the viewport and preserves
// the existing nodes while presenting the second region when there is room.
(function (root) {
  'use strict';

  const DEFAULT_MIN_WIDTH = 600;
  // Postures, narrowest to widest. `folded` is the Duo's own outer screen and
  // takes the shared table frame even though it is too narrow for two regions.
  // `phone` is an ordinary compact viewport and keeps each app's phone layout.
  const POSTURES = ['phone', 'folded', 'unfolded'];
  const FOLDED_COVER = { width: 466, height: 678 };
  const FOLDED_COVER_TOLERANCE = 1;
  // The canonical game space is the Duo FOLDED (cover) screen's portrait
  // shape: 466 x 678 pt (1398 x 2034 px @3x), confirmed from Koi's native
  // Device Hub metadata (PROGRESS.md). Every card game designs to this one
  // aspect and fits it isotropically to whatever safe area is available — the
  // folded cover, the inner portrait (centred) and the inner landscape (left).
  // (An earlier revision used 440x956, which is the iPhone 17 Pro Max, not the
  // Duo cover; the folded ratio is the real front screen.)
  const DEFAULT_TABLE_ASPECT = 466 / 678;
  // The number/controls row's height floor as a share of the game-space
  // height: the board-to-row gap must be at least 1.4x the rendered row
  // height, so the row is reserved at most 1/(1+1.4) of the space.
  const ROW_HEIGHT_SHARE = 1 / 2.4;
  const ROW_GAP_RATIO = 1.4;

  function dimension(viewport, outer, inner) {
    const value = Number(viewport && viewport[outer] !== undefined ? viewport[outer] : viewport && viewport[inner]);
    return Number.isFinite(value) ? value : 0;
  }

  /** Which posture a viewport is: an ordinary phone, the folded Duo cover, or unfolded. */
  function posture(viewport, { minWidth = DEFAULT_MIN_WIDTH } = {}) {
    const width = dimension(viewport, 'width', 'innerWidth');
    const height = dimension(viewport, 'height', 'innerHeight');
    if (width >= minWidth) return 'unfolded';
    return isFoldedCover(width, height) ? 'folded' : 'phone';
  }

  function isFoldedCover(width, height) {
    return Math.abs(width - FOLDED_COVER.width) <= FOLDED_COVER_TOLERANCE
      && Math.abs(height - FOLDED_COVER.height) <= FOLDED_COVER_TOLERANCE;
  }

  /** Return a serializable capability snapshot for a viewport or {width,height}. */
  function read(viewport = root, { minWidth = DEFAULT_MIN_WIDTH } = {}) {
    const width = dimension(viewport, 'width', 'innerWidth');
    const height = dimension(viewport, 'height', 'innerHeight');
    const expanded = width >= minWidth;
    const device = posture({ width, height }, { minWidth });
    return { expanded, regions: expanded ? 2 : 1, width, height, posture: device, framed: device !== 'phone' };
  }

  /** Observe real viewport changes. The callback runs immediately; stop with the returned function. */
  function observe(callback, { minWidth = DEFAULT_MIN_WIDTH, target = root } = {}) {
    if (typeof callback !== 'function') throw new TypeError('Duo.observe requires a callback');
    let previous = '';
    const update = () => {
      const state = read(target, { minWidth });
      const signature = JSON.stringify(state);
      if (signature === previous) return;
      previous = signature;
      callback(state);
    };
    target.addEventListener('resize', update);
    target.addEventListener('orientationchange', update);
    update();
    return () => {
      target.removeEventListener('resize', update);
      target.removeEventListener('orientationchange', update);
    };
  }

  function region(className, label, content) {
    const el = document.createElement('div');
    el.className = `ol-duo-region ${className}`;
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', label);
    el.appendChild(content);
    return el;
  }

  /**
   * Mount app-owned primary and companion nodes without cloning or replacing them.
   * Compact hides only the companion; expanded presents both regions side by side.
   */
  function mount(host, { primary, secondary, label = 'Primary', secondaryLabel = 'Companion', minWidth = DEFAULT_MIN_WIDTH } = {}) {
    if (!host || !primary || !secondary || primary === secondary) {
      throw new TypeError('Duo.mount requires a host and distinct primary and secondary nodes');
    }
    const primaryRegion = region('ol-duo-primary', label, primary);
    const secondaryRegion = region('ol-duo-secondary', secondaryLabel, secondary);
    host.classList.add('ol-duo-workspace');
    host.append(primaryRegion, secondaryRegion);
    const stop = observe((state) => {
      host.dataset.duo = state.expanded ? 'expanded' : 'compact';
    }, { minWidth });
    return {
      primary: primaryRegion,
      secondary: secondaryRegion,
      destroy() {
        stop();
        host.append(primary, secondary);
        primaryRegion.remove();
        secondaryRegion.remove();
        host.classList.remove('ol-duo-workspace');
        delete host.dataset.duo;
      },
    };
  }

  /* ---- Common card-table geometry --------------------------------------
     One source of truth for every OL card game's Duo layout: the safe-area
     content rect, the portrait-rectangle table frame, and the stats frame
     that fills the right surplus in landscape. Games own only their content
     and mechanics; they never re-derive these frames. */

  const TABLE_GUTTER = 16;
  const TABLE_GAP = 24;
  const STATS_EDGE_GAP = 24;
  const STATS_MIN = 240;
  const STATS_MAX = 420;

  /**
   * Measured Apollo folded-cover occlusions (Device Hub nativeSize 466x678pt,
   * captured screenshot). web env(safe-area-inset-*) does NOT expose these to
   * content, so the shared layer must subtract them explicitly.
   *
   * Top-right Dynamic Island (camera/sensor housing): a dark cutout on the
   * cover display. From a real Apollo capture: x 399-436pt, y 25-99pt, i.e.
   * ~37pt wide x 74pt tall, 29pt from the right edge, 25pt from the top.
   * All card/table content must stay clear of this region on the folded cover.
   */
  const FOLDED_ISLAND = { x: 399, y: 25, width: 37, height: 74 };

  function insetsOf(raw) {
    const insets = raw || {};
    const side = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    };
    return { top: side(insets.top), right: side(insets.right), bottom: side(insets.bottom), left: side(insets.left) };
  }

  /**
   * Normalized Duo table layout for a viewport and safe-area insets.
   * Portrait: the table frame is the largest rect with the unfolded portrait
   * aspect (DEFAULT_TABLE_ASPECT) centred in the safe content rect.
   * Landscape: the same portrait-rectangle shape is anchored full-height to
   * the left; the right surplus hosts the stats panel. The background stays
   * full-bleed; only the frames are inset.
   */
  function tableFrame(viewport, insets, { minWidth = DEFAULT_MIN_WIDTH, aspect = DEFAULT_TABLE_ASPECT } = {}) {
    const width = dimension(viewport, 'width', 'innerWidth');
    const height = dimension(viewport, 'height', 'innerHeight');
    const safe = insetsOf(insets);
    const orientation = width >= height ? 'landscape' : 'portrait';
    const expanded = width >= minWidth;
    const device = posture({ width, height }, { minWidth });    const content = {
      x: safe.left + TABLE_GUTTER,
      y: safe.top + TABLE_GUTTER,
      width: Math.max(0, width - safe.left - safe.right - (2 * TABLE_GUTTER)),
      height: Math.max(0, height - safe.top - safe.bottom - (2 * TABLE_GUTTER)),
    };
    // Folded-cover occlusion: the top-right Dynamic Island is hardware that
    // env(safe-area-inset-*) does not reserve for content. Reserve it so the
    // playable rectangle starts below it, keeping cards big and unobstructed.
    let occluded = null;
    let usable = { ...content };
    // Reserve the folded Duo Dynamic Island ONLY on the verified folded cover
    // geometry (466x678pt). A regular iPhone (390x844, 393x659, ...) is also a
    // compact portrait viewport but has no such island; it must NOT reserve one.
    const isFoldedDuo = device === 'folded';
    if (isFoldedDuo) {
      const island = FOLDED_ISLAND;
      // The island lives inside the status-bar band; reserve whichever reaches
      // lower (island bottom vs the reported safe-area top), never both.
      const clearTop = Math.max(island.y + island.height, safe.top) + TABLE_GUTTER;
      usable = {
        x: content.x,
        y: clearTop,
        width: content.width,
        height: Math.max(0, (content.y + content.height) - clearTop),
      };
      occluded = island;
    }
    const tableWidth = Math.min(usable.width, usable.height * aspect);
    // Portrait centres the rectangle inside the safe content rect; landscape
    // anchors the same shape full-height to the left edge of the content rect.
    const table = {
      x: orientation === 'landscape'
        ? usable.x
        : usable.x + Math.max(0, (usable.width - tableWidth) / 2),
      y: usable.y + Math.max(0, (usable.height - tableWidth / aspect) / 2),
      width: tableWidth,
      height: Math.min(usable.height, tableWidth / aspect),
    };
    // The reserved controls row (number buttons / actions) fills the bottom
    // share of the game space; the gap above it is at least 1.4x the row so
    // the board never crowds or leaves a dead band.
    const rowHeight = table.height * ROW_HEIGHT_SHARE;
    const rowGap = Math.max(0, table.height - rowHeight);
    const row = {
      x: table.x,
      y: table.y + rowGap,
      width: table.width,
      height: rowHeight,
    };
    let stats = null;
    if (expanded && orientation === 'landscape') {
      const statsX = content.x + table.width + TABLE_GAP;
      const statsWidth = Math.max(0, width - safe.right - STATS_EDGE_GAP - statsX);
      stats = {
        x: statsX,
        y: content.y,
        width: Math.min(STATS_MAX, Math.max(STATS_MIN, statsWidth)),
        height: content.height,
      };
      if (stats.width > statsWidth) stats.width = statsWidth;
    }
    return {
      expanded,
      posture: device,
      framed: device !== 'phone',
      orientation,
      insets: safe,
      gutter: TABLE_GUTTER,
      tableGap: TABLE_GAP,
      statsEdgeGap: STATS_EDGE_GAP,
      content,
      usable,
      occluded,
      table,
      row,
      rowGap,
      stats,
    };
  }

  /** Convenience: read the live viewport and env() insets from the document. */
  function tableFrameFromEnv(target = root, options) {
    const probe = target.document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
      'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
    target.document.body.appendChild(probe);
    const style = target.getComputedStyle(probe);
    const insets = {
      top: parseFloat(style.paddingTop),
      right: parseFloat(style.paddingRight),
      bottom: parseFloat(style.paddingBottom),
      left: parseFloat(style.paddingLeft),
    };
    probe.remove();
    return tableFrame(target, insets, options);
  }

  root.OL.Duo = { DEFAULT_MIN_WIDTH, DEFAULT_TABLE_ASPECT, ROW_HEIGHT_SHARE, ROW_GAP_RATIO, POSTURES, FOLDED_COVER, posture, read, observe, mount, tableFrame, tableFrameFromEnv };
})(globalThis);
