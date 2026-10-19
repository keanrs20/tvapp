/* LatinoTV - navegación espacial con control remoto */
(function (global) {
  'use strict';

  var current = null;
  var SELECTOR = '[data-focusable]';

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    var style = global.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function items() {
    var nodes = document.querySelectorAll(SELECTOR);
    var visible = [];
    for (var i = 0; i < nodes.length; i++) {
      if (isVisible(nodes[i])) visible.push(nodes[i]);
    }
    return visible;
  }

  function focusElement(el) {
    if (!el || el === current) return;
    blur();
    current = el;
    el.classList.add('focused');

    try {
      el.focus({ preventScroll: true });
    } catch (error) {
      try { el.focus(); } catch (ignored) { /* sin foco nativo */ }
    }

    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (error) {
      try { el.scrollIntoView(false); } catch (ignored) { /* nada */ }
    }
  }

  function blur() {
    if (current) {
      current.classList.remove('focused');
      current = null;
    }
  }

  function reset() {
    var all = items();
    if (!all.length) return;

    var auto = document.querySelector('[data-autofocus]');
    if (auto && isVisible(auto)) {
      focusElement(auto);
    } else {
      focusElement(all[0]);
    }
  }

  function move(direction) {
    var all = items();
    if (!all.length) return;

    if (!current || !isVisible(current)) {
      focusElement(all[0]);
      return;
    }

    var source = current.getBoundingClientRect();
    var sx = source.left + source.width / 2;
    var sy = source.top + source.height / 2;

    var best = null;
    var bestScore = Infinity;

    for (var i = 0; i < all.length; i++) {
      var candidate = all[i];
      if (candidate === current) continue;

      var rect = candidate.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = cx - sx;
      var dy = cy - sy;
      var primary;
      var secondary;
      var overlap;

      if (direction === 'left') {
        if (dx > -6) continue;
        primary = -dx;
        secondary = Math.abs(dy);
      } else if (direction === 'right') {
        if (dx < 6) continue;
        primary = dx;
        secondary = Math.abs(dy);
      } else if (direction === 'up') {
        if (dy > -6) continue;
        primary = -dy;
        secondary = Math.abs(dx);
      } else {
        if (dy < 6) continue;
        primary = dy;
        secondary = Math.abs(dx);
      }

      if (direction === 'left' || direction === 'right') {
        overlap = Math.max(0, Math.min(source.bottom, rect.bottom) - Math.max(source.top, rect.top));
      } else {
        overlap = Math.max(0, Math.min(source.right, rect.right) - Math.max(source.left, rect.left));
      }

      var score = primary + secondary * 2.2;
      if (!overlap) score += 140;

      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (best) focusElement(best);
  }

  function getCurrent() {
    return current;
  }

  global.Spatial = {
    reset: reset,
    blur: blur,
    move: move,
    focusEl: focusElement,
    getCurrent: getCurrent
  };
})(window);
