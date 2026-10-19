/* LatinoTV - almacenamiento local (perfiles, repos, subtítulos y progreso) */
(function (global) {
  'use strict';

  /* Version check: si la versión guardada no coincide, borra todo y recarga */
  var APP_VERSION = '2026-10-19-cinecalidad';
  try {
    var savedVer = localStorage.getItem('_ltv_ver');
    if (savedVer !== APP_VERSION) {
      localStorage.removeItem('latinotv.state');
      localStorage.removeItem('latinotv.cachever');
      sessionStorage.clear();
      localStorage.setItem('_ltv_ver', APP_VERSION);
      /* Force reload with cache bust */
      window.location.href = window.location.pathname + '?v=' + Date.now();
    }
  } catch(e) {}

  var KEY = 'latinotv.state';
  var LEGACY_KEY = 'latinotv.state.v1';
  var VERSION = 2;

  var DEFAULT_PROVIDER_CONFIG = {
    demo: {},
    jellyfin: { server: '', key: '', user: '' },
    m3u: { url: '' }
  };

  var DEFAULT_ENABLED = {
    demo: true,
    archive: true,
    jellyfin: false,
    m3u: false
  };

  var state = load();

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uid() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function makeProfile(name, color) {
    return {
      id: uid(),
      name: name,
      color: color || '#ff3d5a',
      enabled: {},
      progress: {},
      subtitles: {}
    };
  }

  function defaults() {
    var first = makeProfile('Principal', '#ff3d5a');
    return {
      version: VERSION,
      activeProfileId: first.id,
      profiles: [first],
      providers: clone(DEFAULT_PROVIDER_CONFIG),
      repos: [],
      subtitles: { languages: ['spa'], auto: false }
    };
  }

  function saveTo(target) {
    try {
      localStorage.setItem(KEY, JSON.stringify(target));
    } catch (error) {
      /* sin espacio o modo privado */
    }
  }

  function save() {
    saveTo(state);
  }

  function normalize(parsed) {
    var merged = Object.assign(defaults(), parsed || {});
    merged.providers = Object.assign(clone(DEFAULT_PROVIDER_CONFIG), (parsed && parsed.providers) || {});
    merged.subtitles = Object.assign({ languages: ['spa'], auto: false }, (parsed && parsed.subtitles) || {});
    merged.repos = Array.isArray(parsed && parsed.repos) ? parsed.repos : [];

    if (!Array.isArray(merged.profiles) || !merged.profiles.length) {
      merged.profiles = defaults().profiles;
    }

    merged.profiles.forEach(function (profile) {
      profile.enabled = profile.enabled || {};
      profile.progress = profile.progress || {};
      profile.subtitles = profile.subtitles || {};
      profile.color = profile.color || '#ff3d5a';
    });

    var exists = merged.profiles.some(function (profile) {
      return profile.id === merged.activeProfileId;
    });
    if (!exists) merged.activeProfileId = merged.profiles[0].id;

    return merged;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (error) { /* nada */ }

    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === VERSION) return normalize(parsed);
      } catch (error) {
        /* se reconstruye */
      }
    }

    var fresh = defaults();

    try {
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        var old = JSON.parse(legacy);
        if (old && old.progress) fresh.profiles[0].progress = old.progress;
        if (old && old.providers) {
          Object.keys(old.providers).forEach(function (id) {
            if (!fresh.providers[id]) fresh.providers[id] = {};
            Object.assign(fresh.providers[id], old.providers[id]);
          });
        }
      }
    } catch (error) {
      /* nada */
    }

    saveTo(fresh);
    return fresh;
  }

  /* ---------------- perfiles ---------------- */

  function profiles() {
    return state.profiles;
  }

  function activeProfileId() {
    return state.activeProfileId;
  }

  function activeProfile() {
    for (var i = 0; i < state.profiles.length; i++) {
      if (state.profiles[i].id === state.activeProfileId) return state.profiles[i];
    }
    state.activeProfileId = state.profiles[0].id;
    return state.profiles[0];
  }

  function addProfile(name) {
    var profile = makeProfile(name || 'Perfil ' + (state.profiles.length + 1));
    state.profiles.push(profile);
    save();
    return profile;
  }

  function setActiveProfile(id) {
    var found = state.profiles.some(function (profile) { return profile.id === id; });
    if (!found) return false;
    state.activeProfileId = id;
    save();
    return true;
  }

  function renameProfile(id, name) {
    state.profiles.forEach(function (profile) {
      if (profile.id === id && name) profile.name = name;
    });
    save();
  }

  function removeProfile(id) {
    if (state.profiles.length <= 1) return false;
    state.profiles = state.profiles.filter(function (profile) { return profile.id !== id; });
    if (!state.profiles.some(function (profile) { return profile.id === state.activeProfileId; })) {
      state.activeProfileId = state.profiles[0].id;
    }
    save();
    return true;
  }

  /* ---------------- proveedores ---------------- */

  function cfg(providerId) {
    if (!state.providers[providerId]) state.providers[providerId] = {};
    return state.providers[providerId];
  }

  function setCfg(providerId, patch) {
    state.providers[providerId] = Object.assign({}, cfg(providerId), patch);
    save();
  }

  function isEnabled(providerId) {
    var enabled = activeProfile().enabled;
    if (Object.prototype.hasOwnProperty.call(enabled, providerId)) {
      return !!enabled[providerId];
    }
    var config = state.providers[providerId];
    if (config && typeof config.enabled === 'boolean') {
      return !!config.enabled;
    }
    if (typeof DEFAULT_ENABLED[providerId] === 'boolean') {
      return DEFAULT_ENABLED[providerId];
    }

    var provider = global.Registry && global.Registry.get(providerId);
    if (provider && provider.sourceRepo) {
      var repo = state.repos.filter(function (item) { return item.url === provider.sourceRepo; })[0];
      if (repo) return repo.enabled !== false;
    }

    return false;
  }

  function setEnabled(providerId, value) {
    activeProfile().enabled[providerId] = !!value;
    save();
  }

  /* ---------------- repositorios ---------------- */

  function repos() {
    return state.repos;
  }

  function addRepo(url, name) {
    url = String(url || '').trim();
    if (!url) return null;
    if (state.repos.some(function (repo) { return repo.url === url; })) return null;
    var repo = { url: url, name: name || url, enabled: true };
    state.repos.push(repo);
    save();
    return repo;
  }

  function removeRepo(url) {
    state.repos = state.repos.filter(function (repo) { return repo.url !== url; });
    save();
  }

  function setRepoEnabled(url, value) {
    state.repos.forEach(function (repo) {
      if (repo.url === url) repo.enabled = !!value;
    });
    save();
  }

  /* ---------------- subtítulos ---------------- */

  function subtitlePrefs() {
    return state.subtitles;
  }

  function setSubtitlePrefs(patch) {
    state.subtitles = Object.assign({}, state.subtitles, patch);
    save();
  }

  function getSubtitleChoice(itemKey) {
    return activeProfile().subtitles[itemKey] || null;
  }

  function setSubtitleChoice(itemKey, choice) {
    activeProfile().subtitles[itemKey] = choice;
    save();
  }

  function clearSubtitleChoice(itemKey) {
    delete activeProfile().subtitles[itemKey];
    save();
  }

  /* ---------------- progreso ---------------- */

  function keyFor(providerId, itemId, episodeId) {
    return [providerId, itemId, episodeId || ''].join('|');
  }

  function setProgress(entry) {
    if (!entry || !entry.provider || !entry.itemId) return;

    var progress = activeProfile().progress;
    var key = keyFor(entry.provider, entry.itemId, entry.episodeId);
    var previous = progress[key] || {};

    progress[key] = Object.assign({}, previous, entry, { key: key, updated: Date.now() });

    var keys = Object.keys(progress).sort(function (a, b) {
      return (progress[b].updated || 0) - (progress[a].updated || 0);
    });
    keys.slice(60).forEach(function (oldKey) { delete progress[oldKey]; });

    save();
  }

  function getProgress(providerId, itemId, episodeId) {
    return activeProfile().progress[keyFor(providerId, itemId, episodeId)] || null;
  }

  function recent() {
    var progress = activeProfile().progress;
    return Object.keys(progress)
      .map(function (key) { return progress[key]; })
      .filter(function (entry) { return entry && entry.position > 5; })
      .sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
  }

  function clearProgress() {
    activeProfile().progress = {};
    save();
  }

  function exportState() {
    return clone(state);
  }

  global.Store = {
    /* perfiles */
    profiles: profiles,
    activeProfileId: activeProfileId,
    activeProfile: activeProfile,
    addProfile: addProfile,
    setActiveProfile: setActiveProfile,
    renameProfile: renameProfile,
    removeProfile: removeProfile,
    /* proveedores */
    cfg: cfg,
    setCfg: setCfg,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    /* repos */
    repos: repos,
    addRepo: addRepo,
    removeRepo: removeRepo,
    setRepoEnabled: setRepoEnabled,
    /* subtítulos */
    subtitlePrefs: subtitlePrefs,
    setSubtitlePrefs: setSubtitlePrefs,
    getSubtitleChoice: getSubtitleChoice,
    setSubtitleChoice: setSubtitleChoice,
    clearSubtitleChoice: clearSubtitleChoice,
    /* progreso */
    keyFor: keyFor,
    setProgress: setProgress,
    getProgress: getProgress,
    recent: recent,
    save: save
  };
})(window);
