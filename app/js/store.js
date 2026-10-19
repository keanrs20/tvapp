/* LatinoTV - almacenamiento local (ajustes + progreso) */
(function (global) {
  'use strict';

  var KEY = 'latinotv.state.v1';

  var DEFAULTS = {
    providers: {
      demo: { enabled: true },
      jellyfin: { enabled: false, server: '', key: '', user: '' },
      m3u: { enabled: false, url: '' }
    },
    progress: {}
  };

  var state = load();

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);

      var parsed = JSON.parse(raw);
      var merged = clone(DEFAULTS);

      if (parsed && parsed.providers) {
        Object.keys(parsed.providers).forEach(function (id) {
          merged.providers[id] = Object.assign(merged.providers[id] || {}, parsed.providers[id]);
        });
      }
      if (parsed && parsed.progress) {
        merged.progress = parsed.progress;
      }
      return merged;
    } catch (error) {
      return clone(DEFAULTS);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {
      /* sin espacio o modo privado: se ignora */
    }
  }

  function keyFor(providerId, itemId, episodeId) {
    return [providerId, itemId, episodeId || ''].join('|');
  }

  function cfg(providerId) {
    if (!state.providers[providerId]) {
      state.providers[providerId] = {};
    }
    return state.providers[providerId];
  }

  function setCfg(providerId, patch) {
    var current = cfg(providerId);
    state.providers[providerId] = Object.assign({}, current, patch);
    save();
  }

  function isEnabled(providerId) {
    return !!cfg(providerId).enabled;
  }

  function setProgress(entry) {
    if (!entry || !entry.provider || !entry.itemId) return;

    var key = keyFor(entry.provider, entry.itemId, entry.episodeId);
    var previous = state.progress[key] || {};

    state.progress[key] = Object.assign({}, previous, entry, {
      key: key,
      updated: Date.now()
    });

    var keys = Object.keys(state.progress).sort(function (a, b) {
      return (state.progress[b].updated || 0) - (state.progress[a].updated || 0);
    });

    keys.slice(60).forEach(function (oldKey) {
      delete state.progress[oldKey];
    });

    save();
  }

  function getProgress(providerId, itemId, episodeId) {
    return state.progress[keyFor(providerId, itemId, episodeId)] || null;
  }

  function removeProgress(providerId, itemId, episodeId) {
    delete state.progress[keyFor(providerId, itemId, episodeId)];
    save();
  }

  function recent() {
    return Object.keys(state.progress)
      .map(function (key) {
        return state.progress[key];
      })
      .filter(function (entry) {
        return entry && entry.position > 5;
      })
      .sort(function (a, b) {
        return (b.updated || 0) - (a.updated || 0);
      });
  }

  function clearProgress() {
    state.progress = {};
    save();
  }

  function clearAll() {
    state = clone(DEFAULTS);
    save();
  }

  global.Store = {
    cfg: cfg,
    setCfg: setCfg,
    isEnabled: isEnabled,
    keyFor: keyFor,
    setProgress: setProgress,
    getProgress: getProgress,
    removeProgress: removeProgress,
    recent: recent,
    clearProgress: clearProgress,
    clearAll: clearAll
  };
})(window);
