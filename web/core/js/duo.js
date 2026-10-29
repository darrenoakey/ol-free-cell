// duo.js — width-driven expanded workspaces with an optional companion region.
// Apps own both regions' content; Duo only observes the viewport and preserves
// the existing nodes while presenting the second region when there is room.
(function (root) {
  'use strict';

  const DEFAULT_MIN_WIDTH = 600;

  function dimension(viewport, outer, inner) {
    const value = Number(viewport && viewport[outer] !== undefined ? viewport[outer] : viewport && viewport[inner]);
    return Number.isFinite(value) ? value : 0;
  }

  /** Return a serializable capability snapshot for a viewport or {width,height}. */
  function read(viewport = root, { minWidth = DEFAULT_MIN_WIDTH } = {}) {
    const width = dimension(viewport, 'width', 'innerWidth');
    const height = dimension(viewport, 'height', 'innerHeight');
    const expanded = width >= minWidth;
    return { expanded, regions: expanded ? 2 : 1, width, height };
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

  root.OL.Duo = { DEFAULT_MIN_WIDTH, read, observe, mount };
})(globalThis);
