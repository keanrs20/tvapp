/* LatinoTV - aplicación principal */
(function (global) {
  'use strict';

  var app = null;
  var history = [];
  var currentRoute = null;
  var detailState = null;
  var searchToken = 0;
  var searchTimer = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    app = document.getElementById('app');

    Player.init();

    app.addEventListener('click', onClick);
    app.addEventListener('error', onImageError, true);
    document.addEventListener('keydown', onKeyDown, true);

    startClock();
    go('home', {}, false);
  }

  /* ---------------- navegación ---------------- */

  function go(name, params, push) {
    if (push !== false && currentRoute) {
      history.push(currentRoute);
    }

    var route = { name: name, params: params || {} };
    currentRoute = route;

    Spatial.blur();
    if (app) app.scrollTop = 0;

    var job;

    if (name === 'home') {
      job = renderHome(route);
    } else if (name === 'search') {
      renderSearch();
      job = Promise.resolve();
    } else if (name === 'detail') {
      job = renderDetail(route);
    } else if (name === 'settings') {
      renderSettings();
      job = Promise.resolve();
    } else {
      renderError('Pantalla desconocida');
      job = Promise.resolve();
    }

    return Promise.resolve(job).then(function () {
      if (currentRoute === route) Spatial.reset();
    });
  }

  function back() {
    if (Player.isOpen()) {
      Player.close();
      return;
    }

    if (currentRoute && currentRoute.name === 'home') {
      U.toast('Ya estás en el inicio');
      return;
    }

    var previous = history.pop();
    if (previous) {
      currentRoute = null;
      go(previous.name, previous.params, false);
    } else {
      go('home', {}, false);
    }
  }

  /* ---------------- teclado ---------------- */

  function onKeyDown(event) {
    if (Player.isOpen()) {
      Player.handleKey(event);
      return;
    }

    var target = event.target;
    var tag = target && target.tagName;
    var editing = tag === 'INPUT' || tag === 'TEXTAREA';
    var code = event.keyCode;

    if (editing) {
      if (code === 38 || code === 40) {
        event.preventDefault();
        target.blur();
        Spatial.move(code === 40 ? 'down' : 'up');
        return;
      }
      if (code === 10009 || code === 27 || code === 461) {
        event.preventDefault();
        target.blur();
        Spatial.reset();
      }
      return;
    }

    if (code === 37 || code === 38 || code === 39 || code === 40) {
      event.preventDefault();
      var directions = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
      Spatial.move(directions[code]);
      return;
    }

    if (code === 13) {
      var focused = Spatial.getCurrent();
      if (focused) {
        event.preventDefault();
        focused.click();
      }
      return;
    }

    if (code === 10009 || code === 27 || code === 461) {
      event.preventDefault();
      back();
    }
  }

  /* ---------------- cabecera ---------------- */

  function topbar() {
    return '<header class="topbar">' +
      '<div class="brand"><span class="brand-mark">L</span>Latino<span class="accent">TV</span></div>' +
      '<div class="topbar-actions">' +
        '<button class="pill" data-focusable data-action="search">Buscar</button>' +
        '<button class="pill" data-focusable data-action="settings">Ajustes</button>' +
        '<span class="clock">' + clockText() + '</span>' +
      '</div>' +
    '</header>';
  }

  function clockText() {
    var now = new Date();
    var hours = now.getHours();
    var minutes = now.getMinutes();
    return (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
  }

  function startClock() {
    setInterval(function () {
      var el = document.querySelector('.clock');
      if (el) el.textContent = clockText();
    }, 30000);
  }

  /* ---------------- piezas de interfaz ---------------- */

  function card(providerId, item, options) {
    options = options || {};

    var poster = item.poster
      ? '<img src="' + U.esc(item.poster) + '" alt="" loading="lazy">'
      : '';

    var progress = options.progress != null
      ? '<div class="card-progress"><i style="width:' + U.clamp(options.progress, 0, 100) + '%"></i></div>'
      : '';

    var sub = item.year || item.subtitle || '';
    var extra = options.attrs ? ' ' + options.attrs : '';

    return '<button class="card" data-focusable data-action="' + (options.action || 'item') + '"' +
      ' data-provider="' + U.esc(providerId) + '" data-id="' + U.esc(item.id) + '"' +
      (options.autofocus ? ' data-autofocus' : '') + extra + '>' +
        '<div class="poster">' + poster + progress + '</div>' +
        '<div class="card-title">' + U.esc(item.title) + '</div>' +
        (sub ? '<div class="card-sub">' + U.esc(sub) + '</div>' : '') +
      '</button>';
  }

  function row(title, cardsHtml) {
    return '<section class="row">' +
      '<h2 class="row-title">' + U.esc(title) + '</h2>' +
      '<div class="track">' + cardsHtml + '</div>' +
    '</section>';
  }

  function runtimeText(seconds) {
    if (!seconds) return '';
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + ' min';
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    return hours + ' h' + (rest ? ' ' + rest + ' min' : '');
  }

  /* ---------------- inicio ---------------- */

  function renderHome(route) {
    app.innerHTML = topbar() +
      '<div class="loading"><div class="spinner"></div><p>Cargando catálogo…</p></div>';

    var enabled = Registry.enabled();
    if (!enabled.length) {
      app.innerHTML = topbar() +
        '<div class="page">' +
          '<div class="empty">No hay proveedores activos.<br>Ve a Ajustes para configurar uno.</div>' +
          '<button class="btn primary" data-focusable data-autofocus data-action="settings">Abrir ajustes</button>' +
        '</div>';
      return Promise.resolve();
    }

    return Registry.home().then(function (results) {
      if (currentRoute !== route) return;

      var html = '';
      var first = true;

      var recent = Store.recent();
      if (recent.length) {
        var resumeCards = recent.slice(0, 20).map(function (entry, index) {
          var percent = entry.duration
            ? Math.min(100, Math.round((entry.position / entry.duration) * 100))
            : 0;

          return card(entry.provider, {
            id: entry.itemId,
            title: entry.title,
            poster: entry.poster,
            subtitle: entry.subtitle || ''
          }, {
            action: 'resume',
            attrs: 'data-episode="' + U.esc(entry.episodeId || '') + '"',
            progress: percent,
            autofocus: first && index === 0
          });
        }).join('');

        if (first) first = false;
        html += row('Continuar viendo', resumeCards);
      }

      var failed = [];

      results.forEach(function (result) {
        if (result.error) {
          failed.push(result.provider.name);
          return;
        }

        (result.rows || []).forEach(function (providerRow) {
          if (!providerRow || !providerRow.items || !providerRow.items.length) return;

          var cardsHtml = providerRow.items.map(function (item) {
            var itemCard = card(result.provider.id, item, { autofocus: first });
            first = false;
            return itemCard;
          }).join('');

          html += row(providerRow.title || result.provider.name, cardsHtml);
        });
      });

      if (!html) {
        html = '<div class="page"><div class="empty">Los proveedores activos no devolvieron contenido.</div></div>';
      }

      if (failed.length) {
        html += '<div class="page"><div class="row-error">No se pudo cargar: ' + U.esc(failed.join(', ')) +
          '. Revisa la conexión o los Ajustes.</div></div>';
      }

      app.innerHTML = topbar() + html;
    }).catch(function (error) {
      if (currentRoute !== route) return;
      renderError('No se pudo cargar el inicio: ' + (error && error.message));
    });
  }

  /* ---------------- búsqueda ---------------- */

  function renderSearch() {
    app.innerHTML = topbar() +
      '<div class="page search-page">' +
        '<button class="back-btn" data-focusable data-action="back">← Volver</button>' +
        '<h1 class="page-title">Buscar</h1>' +
        '<input id="search-input" class="search-input" data-focusable data-autofocus type="text"' +
          ' autocomplete="off" spellcheck="false" placeholder="Película, serie o canal">' +
        '<div class="keyboard">' + keyboardHtml() + '</div>' +
        '<div id="search-status" class="empty"></div>' +
        '<div id="search-results" class="grid"></div>' +
      '</div>';

    var input = document.getElementById('search-input');
    input.addEventListener('input', U.debounce(runSearch, 500));
    input.addEventListener('keydown', function (event) {
      if (event.keyCode === 13) {
        event.preventDefault();
        runSearch();
      }
    });
  }

  function keyboardHtml() {
    var rows = ['qwertyuiop', 'asdfghjklñ', 'zxcvbnm'];

    var html = rows.map(function (chars) {
      var keys = '';
      for (var i = 0; i < chars.length; i++) {
        keys += '<button class="key" data-focusable data-action="key" data-key="' + chars[i] + '">' +
          chars[i].toUpperCase() + '</button>';
      }
      return '<div class="key-row">' + keys + '</div>';
    }).join('');

    html += '<div class="key-row">' +
      '<button class="key wide" data-focusable data-action="key" data-key=" ">ESPACIO</button>' +
      '<button class="key wide" data-focusable data-action="key" data-key="DEL">BORRAR</button>' +
      '<button class="key wide" data-focusable data-action="key" data-key="GO">BUSCAR</button>' +
    '</div>';

    return html;
  }

  function keyPress(key) {
    var input = document.getElementById('search-input');
    if (!input) return;

    if (key === 'DEL') {
      input.value = input.value.slice(0, -1);
    } else if (key === 'GO') {
      runSearch();
      return;
    } else if (key === ' ') {
      input.value += ' ';
    } else {
      input.value += key;
    }

    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 450);
  }

  function runSearch() {
    var input = document.getElementById('search-input');
    var status = document.getElementById('search-status');
    var resultsEl = document.getElementById('search-results');
    if (!input || !status || !resultsEl) return;

    var query = input.value.trim();

    if (query.length < 2) {
      resultsEl.innerHTML = '';
      status.textContent = query
        ? 'Escribe al menos 2 letras'
        : 'Escribe para buscar en todos los proveedores activos.';
      return;
    }

    var token = ++searchToken;
    status.textContent = 'Buscando «' + query + '»…';
    resultsEl.innerHTML = '';

    var providers = Registry.enabled();
    var jobs = providers.map(function (provider) {
      return Promise.resolve()
        .then(function () { return provider.search(query); })
        .then(function (items) { return { provider: provider, items: items || [] }; })
        .catch(function () { return { provider: provider, items: [] }; });
    });

    return Promise.all(jobs).then(function (groups) {
      if (token !== searchToken) return;

      var liveStatus = document.getElementById('search-status');
      var liveResults = document.getElementById('search-results');
      if (!liveStatus || !liveResults) return;

      var html = '';
      var count = 0;

      groups.forEach(function (group) {
        group.items.forEach(function (item) {
          count++;
          html += card(group.provider.id, item, {});
        });
      });

      liveResults.innerHTML = html;
      liveStatus.textContent = count
        ? count + (count === 1 ? ' resultado' : ' resultados')
        : 'Sin resultados para «' + query + '».';
    });
  }

  /* ---------------- detalle ---------------- */

  function renderDetail(route) {
    app.innerHTML = topbar() +
      '<div class="loading"><div class="spinner"></div><p>Cargando…</p></div>';

    var provider = Registry.get(route.params.provider);
    if (!provider) {
      renderError('Proveedor no encontrado');
      return Promise.resolve();
    }

    return Promise.resolve()
      .then(function () { return provider.details(route.params.id); })
      .then(function (details) {
        if (currentRoute !== route) return;
        detailState = { provider: provider, details: details };
        renderDetailView();
      })
      .catch(function (error) {
        if (currentRoute !== route) return;
        renderError('No se pudo cargar el contenido: ' + (error && error.message));
      });
  }

  function renderDetailView() {
    var provider = detailState.provider;
    var details = detailState.details;

    var meta = [];
    if (details.live) meta.push('EN VIVO');
    if (details.year) meta.push(String(details.year));
    if (details.runtime) meta.push(runtimeText(details.runtime));
    if (details.genres && details.genres.length) meta.push(details.genres.slice(0, 3).join(' · '));

    var saved = Store.getProgress(provider.id, details.id);
    var canResume = saved && saved.position > 10 && (!saved.duration || saved.position < saved.duration - 15);
    var playLabel = canResume
      ? '▶ Continuar (' + U.fmtTime(saved.position) + ')'
      : '▶ ' + (details.live ? 'Ver en vivo' : 'Reproducir');

    var html = '<div class="detail">' +
      '<div class="detail-bg"></div>' +
      '<div class="detail-content">' +
        '<button class="back-btn" data-focusable data-action="back">← Volver</button>' +
        '<h1>' + U.esc(details.title) + '</h1>' +
        '<div class="detail-meta">' + U.esc(meta.join(' · ')) + '</div>' +
        '<p class="detail-desc">' + U.esc(details.description || '') + '</p>' +
        '<div class="actions">' +
          '<button class="btn primary" data-focusable data-autofocus data-action="play">' + U.esc(playLabel) + '</button>' +
          (canResume
            ? '<button class="btn" data-focusable data-action="play-start">▶ Desde el inicio</button>'
            : '') +
        '</div>' +
        (details.episodes && details.episodes.length ? episodesHtml(details.episodes) : '') +
      '</div>' +
    '</div>';

    app.innerHTML = html;

    var background = details.backdrop || details.poster || '';
    var backgroundEl = app.querySelector('.detail-bg');
    if (backgroundEl && background) {
      backgroundEl.style.backgroundImage = 'url("' + background.replace(/"/g, '%22') + '")';
    }
  }

  function episodesHtml(episodes) {
    var groups = {};

    episodes.forEach(function (episode) {
      var season = episode.season || 1;
      if (!groups[season]) groups[season] = [];
      groups[season].push(episode);
    });

    var seasons = Object.keys(groups).sort(function (a, b) {
      return Number(a) - Number(b);
    });

    var html = '';

    seasons.forEach(function (season) {
      html += '<h3 class="season-title">Temporada ' + U.esc(season) + '</h3>';
      html += '<div class="episodes">';

      groups[season].forEach(function (episode) {
        var label = episode.episode ? 'T' + season + 'E' + episode.episode : '';
        html += '<button class="episode" data-focusable data-action="episode" data-id="' + U.esc(episode.id) + '">' +
          '<span class="num">' + U.esc(label) + '</span>' +
          '<span class="ep-body">' +
            '<span class="ep-title">' + U.esc(episode.title) + '</span>' +
            (episode.overview ? '<span class="ep-desc">' + U.esc(episode.overview) + '</span>' : '') +
          '</span>' +
        '</button>';
      });

      html += '</div>';
    });

    return html;
  }

  /* ---------------- reproducción ---------------- */

  function episodeLabel(episode) {
    var label = episode.title || 'Episodio';
    if (episode.season && episode.episode) {
      label = 'T' + episode.season + 'E' + episode.episode + ' · ' + label;
    }
    return label;
  }

  function playCurrent(episodeId, fromStart) {
    if (!detailState) return;

    var provider = detailState.provider;
    var details = detailState.details;
    var episode = null;

    if (episodeId && details.episodes) {
      details.episodes.forEach(function (candidate) {
        if (candidate.id === episodeId) episode = candidate;
      });
    }

    var label = episode ? episodeLabel(episode) : (details.year ? String(details.year) : '');
    var saved = Store.getProgress(provider.id, details.id, episode ? episode.id : '');
    var startAt = (!fromStart && saved && saved.position > 10) ? saved.position : 0;

    Promise.resolve()
      .then(function () {
        return provider.resolve(details.id, episode ? episode.id : null);
      })
      .then(function (streams) {
        Player.open({
          streams: streams,
          title: details.title,
          subtitle: label,
          live: !!details.live,
          startAt: startAt,
          onProgress: function (position, duration) {
            Store.setProgress({
              provider: provider.id,
              itemId: details.id,
              episodeId: episode ? episode.id : '',
              title: details.title,
              subtitle: label,
              poster: details.poster || '',
              position: position,
              duration: duration || details.runtime || 0
            });
          },
          onClose: function () {
            Spatial.reset();
          }
        });
      })
      .catch(function (error) {
        U.toast('No se pudo reproducir: ' + (error && error.message));
      });
  }

  function resumeEntry(providerId, itemId, episodeId) {
    var provider = Registry.get(providerId);
    if (!provider) return;

    U.toast('Cargando…');

    Promise.resolve()
      .then(function () { return provider.details(itemId); })
      .then(function (details) {
        detailState = { provider: provider, details: details };
        playCurrent(episodeId || null, false);
      })
      .catch(function (error) {
        U.toast('No se pudo continuar: ' + (error && error.message));
      });
  }

  /* ---------------- ajustes ---------------- */

  function renderSettings() {
    var providers = Registry.all();

    var cards = providers.map(function (provider) {
      var config = Store.cfg(provider.id);
      var fields = fieldsFor(provider.id);

      return '<section class="settings-card">' +
        '<div class="settings-head">' +
          '<div>' +
            '<h3>' + U.esc(provider.name) + '</h3>' +
            '<p>' + U.esc(provider.description || '') + '</p>' +
          '</div>' +
          '<button class="switch' + (config.enabled ? ' on' : '') + '" data-focusable' +
            ' data-action="toggle-provider" data-provider="' + provider.id + '"' +
            ' role="switch" aria-checked="' + (config.enabled ? 'true' : 'false') + '">' +
            '<span></span>' +
          '</button>' +
        '</div>' +
        fields +
        (fields
          ? '<button class="btn small" data-focusable data-action="save-provider" data-provider="' +
            provider.id + '">Guardar</button>'
          : '') +
      '</section>';
    }).join('');

    var html = '<div class="page settings">' +
      '<button class="back-btn" data-focusable data-autofocus data-action="back">← Volver</button>' +
      '<h1>Ajustes</h1>' +
      cards +

      '<section class="settings-card">' +
        '<h3>Reproducir una URL</h3>' +
        '<p>Prueba una URL directa de video (MP4) o una lista HLS (M3U8).</p>' +
        '<div class="inline-row">' +
          '<div class="field">' +
            '<label for="test-url">URL del video</label>' +
            '<input id="test-url" data-focusable type="text" placeholder="https://.../video.m3u8" spellcheck="false">' +
          '</div>' +
          '<button class="btn" data-focusable data-action="test-url">Reproducir</button>' +
        '</div>' +
      '</section>' +

      '<section class="settings-card">' +
        '<h3>Datos</h3>' +
        '<p>Borra el historial de «Continuar viendo» guardado en este televisor.</p>' +
        '<button class="btn small" data-focusable data-action="clear-progress">Borrar progreso</button>' +
      '</section>' +

      '<section class="settings-card">' +
        '<h3>Acerca de LatinoTV</h3>' +
        '<p>Versión 1.0.0 · Módulo de aplicación para TizenBrew.</p>' +
        '<p class="legal">Esta app no incluye ni aloja contenido. Solo reproduce las fuentes que tú configures ' +
        '(tu servidor Jellyfin, tu lista M3U o URLs directas). Agrega únicamente fuentes de las que tengas derechos ' +
        'o que tengan licencia abierta o sean de dominio público. El proveedor «Cine libre» usa cortometrajes de ' +
        'Blender Foundation con licencia Creative Commons.</p>' +
      '</section>' +
    '</div>';

    app.innerHTML = topbar() + html;
  }

  function fieldsFor(providerId) {
    if (providerId === 'jellyfin') {
      var jellyfin = Store.cfg('jellyfin');
      return field('Dirección del servidor', 'cfg-jellyfin-server', jellyfin.server, 'http://192.168.1.10:8096') +
        field('API Key', 'cfg-jellyfin-key', jellyfin.key, 'Clave de API de Jellyfin') +
        field('Usuario (opcional)', 'cfg-jellyfin-user', jellyfin.user, 'Nombre o ID de usuario');
    }

    if (providerId === 'm3u') {
      var m3u = Store.cfg('m3u');
      return field('URL de la lista M3U', 'cfg-m3u-url', m3u.url, 'https://.../lista.m3u');
    }

    return '';
  }

  function field(label, id, value, placeholder) {
    return '<div class="field">' +
      '<label for="' + id + '">' + U.esc(label) + '</label>' +
      '<input id="' + id + '" data-focusable type="text" value="' + U.esc(value || '') + '"' +
        ' placeholder="' + U.esc(placeholder || '') + '" spellcheck="false">' +
    '</div>';
  }

  function saveProvider(providerId) {
    var patch = {};

    if (providerId === 'jellyfin') {
      patch.server = valueOf('cfg-jellyfin-server');
      patch.key = valueOf('cfg-jellyfin-key');
      patch.user = valueOf('cfg-jellyfin-user');
      if (patch.server && patch.key) patch.enabled = true;
    } else if (providerId === 'm3u') {
      patch.url = valueOf('cfg-m3u-url');
      if (patch.url) patch.enabled = true;
    } else {
      patch.enabled = true;
    }

    Store.setCfg(providerId, patch);

    var provider = Registry.get(providerId);
    if (provider && provider.reset) provider.reset();

    var toggle = app.querySelector('[data-action="toggle-provider"][data-provider="' + providerId + '"]');
    if (toggle) {
      var on = Store.isEnabled(providerId);
      toggle.classList.toggle('on', on);
      toggle.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    U.toast('Ajustes guardados');
  }

  function valueOf(id) {
    var input = document.getElementById(id);
    return input ? input.value.trim() : '';
  }

  function testUrl() {
    var url = valueOf('test-url');
    if (!url) {
      U.toast('Escribe una URL');
      return;
    }

    var isHls = /\.m3u8(\?|#|$)/i.test(url);

    Player.open({
      streams: [{ url: url, mime: isHls ? 'application/x-mpegURL' : '', live: false }],
      title: 'Prueba de reproducción',
      subtitle: 'URL directa',
      live: false,
      startAt: 0,
      onClose: function () { Spatial.reset(); }
    });
  }

  /* ---------------- eventos ---------------- */

  function onClick(event) {
    var element = event.target.closest('[data-action]');
    if (!element) return;

    if (element.hasAttribute('data-focusable')) {
      Spatial.focusEl(element);
    }

    var action = element.getAttribute('data-action');

    if (action === 'search') {
      go('search');
    } else if (action === 'settings') {
      go('settings');
    } else if (action === 'back') {
      back();
    } else if (action === 'item') {
      go('detail', {
        provider: element.getAttribute('data-provider'),
        id: element.getAttribute('data-id')
      });
    } else if (action === 'resume') {
      resumeEntry(
        element.getAttribute('data-provider'),
        element.getAttribute('data-id'),
        element.getAttribute('data-episode')
      );
    } else if (action === 'play') {
      playCurrent(null, false);
    } else if (action === 'play-start') {
      playCurrent(null, true);
    } else if (action === 'episode') {
      playCurrent(element.getAttribute('data-id'), false);
    } else if (action === 'key') {
      keyPress(element.getAttribute('data-key'));
    } else if (action === 'toggle-provider') {
      var providerId = element.getAttribute('data-provider');
      var next = !Store.isEnabled(providerId);
      Store.setCfg(providerId, { enabled: next });
      element.classList.toggle('on', next);
      element.setAttribute('aria-checked', next ? 'true' : 'false');
      U.toast(next ? 'Proveedor activado' : 'Proveedor desactivado');
    } else if (action === 'save-provider') {
      saveProvider(element.getAttribute('data-provider'));
    } else if (action === 'test-url') {
      testUrl();
    } else if (action === 'clear-progress') {
      Store.clearProgress();
      U.toast('Progreso borrado');
    }
  }

  function onImageError(event) {
    if (event.target && event.target.tagName === 'IMG') {
      event.target.style.opacity = '0';
    }
  }

  function renderError(message) {
    app.innerHTML = topbar() +
      '<div class="page">' +
        '<button class="back-btn" data-focusable data-autofocus data-action="back">← Volver</button>' +
        '<div class="empty">' + U.esc(message) + '</div>' +
      '</div>';
  }

  global.App = {
    back: back,
    go: go
  };
})(window);
