/* LatinoTV - aplicación principal */
(function (global) {
  'use strict';

  var app = null;
  var history = [];
  var currentRoute = null;
  var detailState = null;
  var searchToken = 0;
  var searchTimer = null;
  var playContext = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    app = document.getElementById('app');

    Player.init();

    /* Badge de versión siempre visible */
    var badgeDiv = document.createElement('div');
    badgeDiv.innerHTML = versionBadge();
    document.body.appendChild(badgeDiv.firstChild);

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
    } else if (name === 'profiles') {
      renderProfiles();
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
    var profile = Store.activeProfile();

    return '<header class="topbar">' +
      '<div class="brand"><span class="brand-mark">L</span>Latino<span class="accent">TV</span></div>' +
      '<div class="topbar-actions">' +
        '<button class="pill profile-pill" data-focusable data-action="profiles">' +
          '<i class="dot" style="background:' + U.esc(profile.color) + '"></i>' + U.esc(profile.name) +
        '</button>' +
        '<button class="pill" data-focusable data-action="search">Buscar</button>' +
        '<button class="pill" data-focusable data-action="settings">Ajustes</button>' +
        '<span class="clock">' + clockText() + '</span>' +
      '</div>' +
    '</header>';
  }

  function versionBadge() {
    return '<div style="position:fixed;top:4px;right:8px;background:#c0392b;color:#fff;font-size:11px;padding:2px 8px;border-radius:3px;z-index:9999;">v2.3.1-Cinecalidad</div>';
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

    return Promise.race([
      Repos.sync().catch(function () { /* los repos no bloquean el inicio */ }).then(function () {
        if (currentRoute !== route) return;

        var enabled = Registry.enabled();
      if (!enabled.length) {
        app.innerHTML = topbar() +
          '<div class="page">' +
            '<div class="empty">No hay proveedores activos.<br>Ve a Ajustes para configurar uno.</div>' +
            '<button class="btn primary" data-focusable data-autofocus data-action="settings">Abrir ajustes</button>' +
          '</div>';
        return;
      }

      return U.withTimeout(Registry.home(), 10000, 'Timeout cargando catálogo').then(function (results) {
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

        /* Manejar resultados que pueden ser null o undefined */
        results = results || [];

        results.forEach(function (result) {
          if (result.error) {
            failed.push(result.provider.name);
            return;
          }

          (result.rows || []).forEach(function (providerRow) {
            if (!providerRow || !providerRow.items || !providerRow.items.length) return;

            var source = result.provider.sourceRepo ? result.provider.name + ' · ' : '';
            var cardsHtml = providerRow.items.map(function (item) {
              var itemCard = card(result.provider.id, item, { autofocus: first });
              first = false;
              return itemCard;
            }).join('');

            html += row(source + (providerRow.title || result.provider.name), cardsHtml);
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
      });
    }).catch(function (error) {
      if (currentRoute !== route) return;
      renderError('No se pudo cargar el inicio: ' + (error && error.message));
    })
  ], [
    U.withTimeout(Promise.resolve(), 15000).then(function () {
      if (currentRoute !== route) return;
      var enabled = Registry.enabled();
      app.innerHTML = topbar() + '<div class="page"><div class="empty">Tiempo de espera agotado. Proveedores activos: ' + U.esc(enabled.length) + '</div></div>';
    })
  ]);
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
        detailState = { provider: provider, details: details, season: null };
        renderDetailView();
      })
      .catch(function (error) {
        if (currentRoute !== route) return;
        renderError('No se pudo cargar el contenido: ' + (error && error.message));
      });
  }

  function sortedEpisodes(episodes) {
    return episodes.slice().sort(function (a, b) {
      var season = (a.season || 1) - (b.season || 1);
      if (season !== 0) return season;
      return (a.episode || 0) - (b.episode || 0);
    });
  }

  function latestEpisodeEntry(providerId, details) {
    if (!details.episodes || !details.episodes.length) return null;

    var best = null;
    details.episodes.forEach(function (episode) {
      var entry = Store.getProgress(providerId, details.id, episode.id);
      if (!entry) return;
      if (!best || (entry.updated || 0) > (best.entry.updated || 0)) {
        best = { episode: episode, entry: entry };
      }
    });
    return best;
  }

  function renderDetailView() {
    var provider = detailState.provider;
    var details = detailState.details;
    var isSeries = details.episodes && details.episodes.length > 0;

    var meta = [];
    if (details.live) meta.push('EN VIVO');
    if (details.year) meta.push(String(details.year));
    if (details.runtime) meta.push(runtimeText(details.runtime));
    if (isSeries) meta.push(details.episodes.length + ' episodios');
    if (details.genres && details.genres.length) meta.push(details.genres.slice(0, 3).join(' · '));

    var saved = Store.getProgress(provider.id, details.id);
    var latest = latestEpisodeEntry(provider.id, details);

    var canResume = false;
    var resumeLabel = '';
    var resumeEpisodeId = '';

    if (latest) {
      var position = latest.entry.position || 0;
      var duration = latest.entry.duration || 0;
      if (position > 10 && (!duration || position < duration - 15)) {
        canResume = true;
        resumeEpisodeId = latest.episode.id;
        resumeLabel = episodeLabel(latest.episode) + ' · ' + U.fmtTime(position);
      }
    } else if (saved && saved.position > 10 && (!saved.duration || saved.position < saved.duration - 15)) {
      canResume = true;
      resumeLabel = U.fmtTime(saved.position);
    }

    var playLabel = canResume
      ? '▶ Continuar (' + resumeLabel + ')'
      : '▶ ' + (details.live ? 'Ver en vivo' : (isSeries ? 'Reproducir T1E1' : 'Reproducir'));

    var html = '<div class="detail">' +
      '<div class="detail-bg"></div>' +
      '<div class="detail-content">' +
        '<button class="back-btn" data-focusable data-action="back">← Volver</button>' +
        '<h1>' + U.esc(details.title) + '</h1>' +
        '<div class="detail-meta">' + U.esc(meta.join(' · ')) + '</div>' +
        '<p class="detail-desc">' + U.esc(details.description || '') + '</p>' +
        '<div class="actions">' +
          '<button class="btn primary" data-focusable data-autofocus data-action="play"' +
            (resumeEpisodeId ? ' data-episode="' + U.esc(resumeEpisodeId) + '"' : '') + '>' +
            U.esc(playLabel) + '</button>' +
          ((canResume || isSeries)
            ? '<button class="btn" data-focusable data-action="play-start">▶ Desde el inicio</button>'
            : '') +
        '</div>' +
        (isSeries ? episodesHtml(details) : '') +
      '</div>' +
    '</div>';

    app.innerHTML = html;

    var background = details.backdrop || details.poster || '';
    var backgroundEl = app.querySelector('.detail-bg');
    if (backgroundEl && background) {
      backgroundEl.style.backgroundImage = 'url("' + background.replace(/"/g, '%22') + '")';
    }
  }

  function groupBySeason(episodes) {
    var groups = {};
    sortedEpisodes(episodes).forEach(function (episode) {
      var season = episode.season || 1;
      if (!groups[season]) groups[season] = [];
      groups[season].push(episode);
    });
    return groups;
  }

  function episodesHtml(details) {
    var groups = groupBySeason(details.episodes);
    var seasons = Object.keys(groups).sort(function (a, b) { return Number(a) - Number(b); });

    if (!detailState.season) {
      var latest = latestEpisodeEntry(detailState.provider.id, details);
      detailState.season = latest ? (latest.episode.season || 1) : Number(seasons[0]);
    }

    var tabs = seasons.map(function (season) {
      return '<button class="season-tab' + (Number(season) === detailState.season ? ' active' : '') + '"' +
        ' data-focusable data-action="season" data-season="' + U.esc(season) + '">Temporada ' + U.esc(season) + '</button>';
    }).join('');

    return '<div class="season-tabs">' + tabs + '</div>' +
      '<div id="episodes-wrap">' + episodeListHtml(details) + '</div>';
  }

  function episodeListHtml(details) {
    var groups = groupBySeason(details.episodes);
    var season = detailState.season || 1;
    var episodes = groups[season] || [];

    var html = '<div class="episodes">';

    episodes.forEach(function (episode) {
      var entry = Store.getProgress(detailState.provider.id, details.id, episode.id);
      var percent = entry && entry.duration
        ? Math.min(100, Math.round((entry.position / entry.duration) * 100))
        : 0;
      var watched = percent >= 95;
      var label = episode.episode ? 'T' + season + 'E' + episode.episode : '';

      html += '<button class="episode" data-focusable data-action="episode" data-id="' + U.esc(episode.id) + '">' +
        (episode.still ? '<img class="ep-still" src="' + U.esc(episode.still) + '" alt="" loading="lazy">' : '') +
        '<span class="num">' + U.esc(label) + '</span>' +
        '<span class="ep-body">' +
          '<span class="ep-title">' + U.esc(episode.title) +
            (watched ? ' <span class="ep-watched">✓</span>' : '') + '</span>' +
          (episode.overview ? '<span class="ep-desc">' + U.esc(episode.overview) + '</span>' : '') +
          (percent > 0 && !watched ? '<span class="ep-progress"><i style="width:' + percent + '%"></i></span>' : '') +
        '</span>' +
      '</button>';
    });

    html += '</div>';
    return html;
  }

  function selectSeason(season) {
    if (!detailState) return;
    detailState.season = Number(season);

    app.querySelectorAll('.season-tab').forEach(function (tab) {
      var value = Number(tab.getAttribute('data-season'));
      tab.classList.toggle('active', value === detailState.season);
    });

    var wrap = document.getElementById('episodes-wrap');
    if (wrap) wrap.innerHTML = episodeListHtml(detailState.details);
  }

  /* ---------------- reproducción ---------------- */

  function episodeLabel(episode) {
    var label = episode.title || 'Episodio';
    if (episode.season && episode.episode) {
      label = 'T' + episode.season + 'E' + episode.episode + ' · ' + label;
    }
    return label;
  }

  function nextEpisodeOf(details, episode) {
    if (!details.episodes || !details.episodes.length) return null;

    var queue = sortedEpisodes(details.episodes);
    if (!episode) return queue[0];

    for (var i = 0; i < queue.length; i++) {
      if (queue[i].id === episode.id) return queue[i + 1] || null;
    }
    return null;
  }

  function playCurrent(episodeId, fromStart) {
    if (!detailState) return;

    var provider = detailState.provider;
    var details = detailState.details;
    var episode = null;

    if (details.episodes && details.episodes.length) {
      if (episodeId) {
        details.episodes.forEach(function (candidate) {
          if (candidate.id === episodeId) episode = candidate;
        });
      }
      if (!episode) episode = sortedEpisodes(details.episodes)[0];
    }

    var label = episode ? episodeLabel(episode) : (details.year ? String(details.year) : '');
    var saved = Store.getProgress(provider.id, details.id, episode ? episode.id : '');
    var startAt = (!fromStart && saved && saved.position > 10) ? saved.position : 0;
    var next = nextEpisodeOf(details, episode);
    var itemKey = Store.keyFor(provider.id, details.id, episode ? episode.id : '');

    Promise.resolve()
      .then(function () {
        return provider.resolve(details.id, episode ? episode.id : null);
      })
      .then(function (streams) {
        playContext = {
          itemKey: itemKey,
          provider: provider.id,
          itemId: details.id,
          episodeId: episode ? episode.id : '',
          title: details.title,
          year: details.year,
          season: episode ? episode.season : null,
          episodeNumber: episode ? episode.episode : null
        };

        Player.open({
          streams: streams,
          title: details.title,
          subtitle: label,
          live: !!details.live,
          startAt: startAt,
          nextLabel: next ? episodeLabel(next) : '',
          onNext: next ? function () { playCurrent(next.id, false); } : null,
          onSubtitles: function () { openSubtitleSearch(); },
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
            playContext = null;
            if (currentRoute && currentRoute.name === 'detail') renderDetailView();
            else Spatial.reset();
          }
        });

        applyRememberedSubtitle(itemKey);
        if (Store.subtitlePrefs().auto) autoSubtitle();
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
        detailState = { provider: provider, details: details, season: null };
        playCurrent(episodeId || null, false);
      })
      .catch(function (error) {
        U.toast('No se pudo continuar: ' + (error && error.message));
      });
  }

  /* ---------------- subtítulos ---------------- */

  function subtitleLanguages() {
    return Store.subtitlePrefs().languages || ['spa'];
  }

  function subtitleSearchParams() {
    var context = playContext || {};
    return {
      query: context.title,
      season: context.season,
      episode: context.episodeNumber,
      languages: subtitleLanguages()
    };
  }

  function openSubtitleSearch() {
    if (!playContext) {
      U.toast('No hay contenido en reproducción');
      return;
    }

    var params = subtitleSearchParams();
    if (!params.query) {
      U.toast('No se puede buscar subtítulos para este contenido');
      return;
    }

    Player.openPanel({
      title: 'Subtítulos',
      sub: 'Buscando en OpenSubtitles…',
      items: [{ label: 'Buscando…', disabled: true }]
    });

    Subtitles.search(params).then(function (results) {
      var items = [];

      if (Player.hasSubtitle()) {
        items.push({
          label: 'Desactivar subtítulos',
          sub: Player.subtitleLabel(),
          onSelect: function () {
            Player.clearSubtitle();
            if (playContext) Store.clearSubtitleChoice(playContext.itemKey);
            Player.closePanel();
            U.toast('Subtítulos desactivados');
          }
        });
      }

      if (!results.length) {
        items.push({ label: 'Sin resultados para «' + params.query + '»', disabled: true });
      }

      results.forEach(function (result) {
        var details = [
          result.languageLabel,
          result.trusted ? 'de confianza' : '',
          result.downloads ? result.downloads + ' descargas' : '',
          result.release
        ].filter(Boolean).join(' · ');

        items.push({
          label: result.name,
          sub: details,
          onSelect: function () { loadSubtitle(result, true); }
        });
      });

      Player.openPanel({ title: 'Subtítulos', sub: params.query, items: items });
    }).catch(function (error) {
      Player.openPanel({
        title: 'Subtítulos',
        sub: 'Error: ' + (error && error.message),
        items: [{ label: 'Cerrar', onSelect: function () { Player.closePanel(); } }]
      });
    });
  }

  function loadSubtitle(subtitle, remember, quiet) {
    if (!quiet) {
      Player.openPanel({
        title: 'Subtítulos',
        sub: 'Descargando ' + subtitle.name + '…',
        items: [{ label: 'Descargando…', disabled: true }]
      });
    }

    Subtitles.download(subtitle).then(function (text) {
      if (!Player.isOpen()) return;

      var vtt = Subtitles.toVtt(text);
      if (!vtt || vtt.trim().length < 10) throw new Error('Archivo de subtítulos vacío');

      var ok = Player.setSubtitle(vtt, subtitle.name);
      if (!ok) throw new Error('El formato no es compatible');

      if (remember && playContext) {
        Store.setSubtitleChoice(playContext.itemKey, {
          name: subtitle.name,
          url: subtitle.url,
          language: subtitle.language,
          encoding: subtitle.encoding
        });
      }

      Player.closePanel();
      U.toast('Subtítulos: ' + subtitle.name);
    }).catch(function (error) {
      if (quiet) {
        Player.closePanel();
        if (playContext) Store.clearSubtitleChoice(playContext.itemKey);
        U.toast('No se pudo cargar el subtítulo guardado');
        return;
      }

      Player.openPanel({
        title: 'Subtítulos',
        sub: 'No se pudo cargar: ' + (error && error.message),
        items: [
          { label: 'Reintentar', onSelect: function () { loadSubtitle(subtitle, remember); } },
          { label: 'Cerrar', onSelect: function () { Player.closePanel(); } }
        ]
      });
    });
  }

  function applyRememberedSubtitle(itemKey) {
    var choice = Store.getSubtitleChoice(itemKey);
    if (!choice || !choice.url) return;
    loadSubtitle(choice, false, true);
  }

  function autoSubtitle() {
    var params = subtitleSearchParams();
    if (!params.query) return;

    Subtitles.search(params).then(function (results) {
      if (!results.length || !Player.isOpen() || Player.hasSubtitle()) return;
      loadSubtitle(results[0], false, true);
    }).catch(function () { /* silencioso */ });
  }

  function applySubtitleUrl(url) {
    if (!url) return;

    var fake = { name: 'Subtítulo externo', url: url, encoding: '' };

    Subtitles.download(fake).then(function (text) {
      var vtt = Subtitles.toVtt(text);
      Player.setSubtitle(vtt, fake.name);
      U.toast('Subtítulos cargados');
    }).catch(function (error) {
      U.toast('No se pudo cargar el subtítulo: ' + (error && error.message));
    });
  }

  /* ---------------- ajustes ---------------- */

  function renderSettings() {
    var providers = Registry.all();

    var cards = providers.map(function (provider) {
      var on = Store.isEnabled(provider.id);
      var fields = fieldsFor(provider.id);

      return '<section class="settings-card">' +
        '<div class="settings-head">' +
          '<div>' +
            '<h3>' + U.esc(provider.name) + '</h3>' +
            '<p>' + U.esc(provider.description || '') + '</p>' +
            (provider.sourceRepo ? '<p class="repo-tag">Repo: ' + U.esc(provider.sourceRepo) + '</p>' : '') +
          '</div>' +
          '<button class="switch' + (on ? ' on' : '') + '" data-focusable' +
            ' data-action="toggle-provider" data-provider="' + U.esc(provider.id) + '"' +
            ' role="switch" aria-checked="' + (on ? 'true' : 'false') + '">' +
            '<span></span>' +
          '</button>' +
        '</div>' +
        fields +
        (fields
          ? '<button class="btn small" data-focusable data-action="save-provider" data-provider="' +
            U.esc(provider.id) + '">Guardar</button>'
          : '') +
      '</section>';
    }).join('');

    var html = '<div class="page settings">' +
      '<button class="back-btn" data-focusable data-autofocus data-action="back">← Volver</button>' +
      '<h1>Ajustes</h1>' +
      '<p class="settings-note">Perfil activo: <b>' + U.esc(Store.activeProfile().name) + '</b>. Los interruptores ' +
        'de proveedores se guardan por perfil.</p>' +
      cards +

      reposSettingsHtml() +
      subtitlesSettingsHtml() +

      '<section class="settings-card">' +
        '<h3>Reproducir una URL</h3>' +
        '<p>Prueba una URL directa de video (MP4) o una lista HLS (M3U8). Opcionalmente, añade un subtítulo ' +
        '(.srt o .vtt).</p>' +
        '<div class="inline-row">' +
          '<div class="field">' +
            '<label for="test-url">URL del video</label>' +
            '<input id="test-url" data-focusable type="text" placeholder="https://.../video.m3u8" spellcheck="false">' +
          '</div>' +
          '<button class="btn" data-focusable data-action="test-url">Reproducir</button>' +
        '</div>' +
        '<div class="field">' +
          '<label for="test-sub-url">URL del subtítulo (opcional, .srt o .vtt)</label>' +
          '<input id="test-sub-url" data-focusable type="text" placeholder="https://.../subtitulo.srt" spellcheck="false">' +
        '</div>' +
      '</section>' +

      '<section class="settings-card">' +
        '<h3>Datos</h3>' +
        '<p>Borra el historial de «Continuar viendo» del perfil activo.</p>' +
        '<button class="btn small" data-focusable data-action="clear-progress">Borrar progreso</button>' +
      '</section>' +

      '<section class="settings-card">' +
        '<h3>Acerca de LatinoTV</h3>' +
        '<p>Versión 2.3.1-Cinecalidad · Módulo de aplicación para TizenBrew.</p>' +
        '<p class="legal">Esta app no incluye ni aloja contenido. Solo reproduce las fuentes que tú configures ' +
        '(tu servidor Jellyfin, tu lista M3U, tus repositorios o URLs directas). Agrega únicamente fuentes de las que ' +
        'tengas derechos o que tengan licencia abierta o sean de dominio público. Los subtítulos provienen de la API ' +
        'pública de OpenSubtitles.</p>' +
      '</section>' +
    '</div>';

    app.innerHTML = topbar() + html;
  }

  function repoProviders(url) {
    return Registry.all().filter(function (provider) {
      return provider.sourceRepo === url;
    }).length;
  }

  function reposSettingsHtml() {
    var repos = Store.repos();

    var list = repos.map(function (repo) {
      var count = repoProviders(repo.url);
      var status;

      if (repo.error) {
        status = '<div class="repo-error">Error: ' + U.esc(repo.error) + '</div>';
      } else if (repo.warning) {
        status = '<div class="repo-warning">' + U.esc(repo.warning) + '</div>';
      } else if (count) {
        status = '<div class="repo-ok">' + count + ' proveedor' + (count === 1 ? '' : 'es') +
          ' cargado' + (count === 1 ? '' : 's') + ' · el contenido está en el Inicio</div>';
      } else {
        status = '<div class="repo-warning">Sin proveedores. Pulsa «Actualizar repositorios» y revisa el formato.</div>';
      }

      return '<div class="repo-row">' +
        '<div class="repo-info">' +
          '<div class="repo-name">' + U.esc(repo.name || repo.url) + '</div>' +
          '<div class="repo-url">' + U.esc(repo.url) + '</div>' +
          status +
        '</div>' +
        '<div class="repo-actions">' +
          (count ? '<button class="btn tiny" data-focusable data-action="go-home">Ver inicio</button>' : '') +
          '<button class="switch' + (repo.enabled === false ? '' : ' on') + '" data-focusable' +
            ' data-action="toggle-repo" data-url="' + U.esc(repo.url) + '" role="switch"' +
            ' aria-checked="' + (repo.enabled === false ? 'false' : 'true') + '"><span></span></button>' +
          '<button class="btn tiny" data-focusable data-action="remove-repo" data-url="' + U.esc(repo.url) + '">Quitar</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<section class="settings-card">' +
      '<h3>Repositorios</h3>' +
      '<p>Añade tu propio <b>repo.json</b> para traer proveedores o catálogos extra sin reinstalar la app. ' +
      'El contenido de un repositorio aparece como <b>filas nuevas en la pantalla de Inicio</b>, no aquí.</p>' +
      '<p><b>Importante:</b> los repositorios de CloudStream contienen plugins <code>.cs3</code>, que son código ' +
      'Android y no pueden ejecutarse en un televisor Tizen. LatinoTV necesita un <code>repo.json</code> con ' +
      'proveedores JavaScript (<code>scriptUrl</code>) o catálogos JSON (<code>catalogUrl</code>).</p>' +
      (list || '<p class="empty">Todavía no hay repositorios.</p>') +
      '<div class="inline-row">' +
        '<div class="field">' +
          '<label for="repo-url">URL del repo.json</label>' +
          '<input id="repo-url" data-focusable type="text" placeholder="https://.../repo.json" spellcheck="false">' +
        '</div>' +
        '<button class="btn" data-focusable data-action="add-repo">Añadir</button>' +
      '</div>' +
      (repos.length
        ? '<button class="btn small" data-focusable data-action="sync-repos">Actualizar repositorios</button>'
        : '') +
    '</section>';
  }

  function subtitlesSettingsHtml() {
    var prefs = Store.subtitlePrefs();
    var active = prefs.languages || ['spa'];

    var languages = Subtitles.LANGUAGES.map(function (language) {
      var on = active.indexOf(language.code) !== -1;
      return '<button class="chip' + (on ? ' on' : '') + '" data-focusable' +
        ' data-action="toggle-sub-lang" data-lang="' + language.code + '">' + U.esc(language.label) + '</button>';
    }).join('');

    return '<section class="settings-card">' +
      '<h3>Subtítulos (OpenSubtitles)</h3>' +
      '<p>Durante la reproducción, pulsa el <b>botón verde</b> del control remoto para buscar subtítulos. ' +
      'Elige idiomas preferidos (se pueden combinar):</p>' +
      '<div class="chips">' + languages + '</div>' +
      '<div class="settings-head">' +
        '<div><h4>Buscar automáticamente</h4><p>Intenta cargar el subtítulo con más descargas al reproducir.</p></div>' +
        '<button class="switch' + (prefs.auto ? ' on' : '') + '" data-focusable data-action="toggle-sub-auto"' +
          ' role="switch" aria-checked="' + (prefs.auto ? 'true' : 'false') + '"><span></span></button>' +
      '</div>' +
    '</section>';
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
    } else if (providerId === 'm3u') {
      patch.url = valueOf('cfg-m3u-url');
    }

    Store.setCfg(providerId, patch);
    Store.setEnabled(providerId, true);

    var provider = Registry.get(providerId);
    if (provider && provider.reset) provider.reset();

    var toggle = app.querySelector('[data-action="toggle-provider"][data-provider="' + providerId + '"]');
    if (toggle) {
      toggle.classList.add('on');
      toggle.setAttribute('aria-checked', 'true');
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
    var subtitleUrl = valueOf('test-sub-url');

    Player.open({
      streams: [{ url: url, mime: isHls ? 'application/x-mpegURL' : '', live: false }],
      title: 'Prueba de reproducción',
      subtitle: 'URL directa',
      live: false,
      startAt: 0,
      onClose: function () { Spatial.reset(); }
    });

    if (subtitleUrl) applySubtitleUrl(subtitleUrl);
  }

  /* ---------------- perfiles ---------------- */

  function renderProfiles() {
    var profiles = Store.profiles();
    var activeId = Store.activeProfileId();

    var cards = profiles.map(function (profile) {
      var on = profile.id === activeId;
      var count = Object.keys(profile.progress || {}).length;

      return '<section class="settings-card profile-card' + (on ? ' active' : '') + '">' +
        '<div class="settings-head">' +
          '<div class="profile-head">' +
            '<i class="dot" style="background:' + U.esc(profile.color) + '"></i>' +
            '<div>' +
              '<h3>' + U.esc(profile.name) + (on ? ' <span class="tag">Activo</span>' : '') + '</h3>' +
              '<p>' + count + ' elemento' + (count === 1 ? '' : 's') + ' en «Continuar viendo»</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="inline-row">' +
          '<div class="field">' +
            '<label for="profile-name-' + U.esc(profile.id) + '">Nombre</label>' +
            '<input id="profile-name-' + U.esc(profile.id) + '" data-focusable type="text"' +
              ' value="' + U.esc(profile.name) + '" spellcheck="false">' +
          '</div>' +
          '<button class="btn" data-focusable data-action="save-profile-name" data-id="' + U.esc(profile.id) + '">Guardar</button>' +
        '</div>' +
        '<div class="actions">' +
          (on
            ? ''
            : '<button class="btn small" data-focusable data-action="switch-profile" data-id="' + U.esc(profile.id) + '">Usar este perfil</button>') +
          (profiles.length > 1
            ? '<button class="btn small danger" data-focusable data-action="delete-profile" data-id="' + U.esc(profile.id) + '">Eliminar</button>'
            : '') +
        '</div>' +
      '</section>';
    }).join('');

    app.innerHTML = topbar() +
      '<div class="page settings profiles">' +
        '<button class="back-btn" data-focusable data-action="back">← Volver</button>' +
        '<h1>Perfiles</h1>' +
        '<p class="settings-note">Cada perfil guarda su propio «Continuar viendo», sus proveedores activos y sus ' +
        'subtítulos elegidos. Los ajustes de servidor (Jellyfin, M3U) se comparten en el televisor.</p>' +
        cards +
        '<section class="settings-card">' +
          '<h3>Nuevo perfil</h3>' +
          '<div class="inline-row">' +
            '<div class="field">' +
              '<label for="new-profile-name">Nombre</label>' +
              '<input id="new-profile-name" data-focusable type="text" placeholder="Ej: Mamá" spellcheck="false">' +
            '</div>' +
            '<button class="btn primary" data-focusable data-action="add-profile">Crear</button>' +
          '</div>' +
        '</section>' +
      '</div>';
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
    } else if (action === 'profiles') {
      go('profiles');
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
      playCurrent(element.getAttribute('data-episode') || null, false);
    } else if (action === 'play-start') {
      playCurrent(null, true);
    } else if (action === 'episode') {
      playCurrent(element.getAttribute('data-id'), false);
    } else if (action === 'season') {
      selectSeason(element.getAttribute('data-season'));
    } else if (action === 'key') {
      keyPress(element.getAttribute('data-key'));
    } else if (action === 'toggle-provider') {
      var providerId = element.getAttribute('data-provider');
      var next = !Store.isEnabled(providerId);
      Store.setEnabled(providerId, next);
      element.classList.toggle('on', next);
      element.setAttribute('aria-checked', next ? 'true' : 'false');
      U.toast(next ? 'Proveedor activado' : 'Proveedor desactivado');
    } else if (action === 'save-provider') {
      saveProvider(element.getAttribute('data-provider'));
    } else if (action === 'add-repo') {
      addRepo();
    } else if (action === 'remove-repo') {
      var removedUrl = element.getAttribute('data-url');
      Repos.forget(removedUrl);
      Store.removeRepo(removedUrl);
      renderSettings();
      U.toast('Repositorio quitado');
    } else if (action === 'toggle-repo') {
      var url = element.getAttribute('data-url');
      var repo = Store.repos().filter(function (item) { return item.url === url; })[0];
      var enabled = !(repo && repo.enabled !== false);
      Store.setRepoEnabled(url, enabled);
      if (enabled) {
        Repos.sync(true);
      } else {
        Repos.forget(url);
      }
      renderSettings();
      U.toast(enabled ? 'Repositorio activado' : 'Repositorio desactivado');
    } else if (action === 'sync-repos') {
      U.toast('Actualizando repositorios…');
      Repos.sync(true).then(function () {
        renderSettings();
        var total = Registry.all().filter(function (provider) { return provider.sourceRepo; }).length;
        var warned = Store.repos().filter(function (item) { return item.warning; }).length;
        if (warned && !total) U.toast('Los repositorios añadidos no traen proveedores compatibles (.cs3 no funciona).', 7000);
        else U.toast('Repositorios actualizados · ' + total + ' proveedor(es) de repos.', 4000);
      });
    } else if (action === 'go-home') {
      go('home');
    } else if (action === 'toggle-sub-lang') {
      toggleSubtitleLanguage(element.getAttribute('data-lang'));
    } else if (action === 'toggle-sub-auto') {
      var prefs = Store.subtitlePrefs();
      Store.setSubtitlePrefs({ auto: !prefs.auto });
      renderSettings();
    } else if (action === 'test-url') {
      testUrl();
    } else if (action === 'clear-progress') {
      Store.clearProgress();
      U.toast('Progreso borrado');
    } else if (action === 'switch-profile') {
      Store.setActiveProfile(element.getAttribute('data-id'));
      renderProfiles();
      U.toast('Perfil cambiado');
    } else if (action === 'add-profile') {
      addProfile();
    } else if (action === 'save-profile-name') {
      var id = element.getAttribute('data-id');
      Store.renameProfile(id, valueOf('profile-name-' + id));
      renderProfiles();
      U.toast('Nombre guardado');
    } else if (action === 'delete-profile') {
      if (Store.removeProfile(element.getAttribute('data-id'))) {
        renderProfiles();
        U.toast('Perfil eliminado');
      } else {
        U.toast('Debe quedar al menos un perfil');
      }
    }
  }

  function addRepo() {
    var url = Repos.normalizeUrl(valueOf('repo-url'));
    if (!url) {
      U.toast('Escribe la URL del repo.json');
      return;
    }

    var repo = Store.addRepo(url);
    if (!repo) {
      U.toast('Ese repositorio ya está añadido');
      return;
    }

    U.toast('Cargando repositorio…');
    Repos.sync(true).then(function () {
      var saved = Store.repos().filter(function (item) { return item.url === url; })[0];
      var count = repoProviders(url);

      renderSettings();

      if (!saved) return;
      if (saved.error) U.toast('No se pudo cargar: ' + saved.error, 6000);
      else if (saved.warning) U.toast(saved.warning, 7000);
      else if (!count) U.toast('Repositorio añadido, pero no trae proveedores compatibles.', 6000);
      else U.toast('Listo: ' + count + ' proveedor' + (count === 1 ? '' : 'es') + '. Míralos en Inicio.', 5000);
    });
  }

  function addProfile() {
    var name = valueOf('new-profile-name');
    var profile = Store.addProfile(name || undefined);
    Store.setActiveProfile(profile.id);
    renderProfiles();
    U.toast('Perfil creado');
  }

  function toggleSubtitleLanguage(code) {
    var prefs = Store.subtitlePrefs();
    var languages = (prefs.languages || ['spa']).slice();
    var index = languages.indexOf(code);

    if (index === -1) languages.push(code);
    else if (languages.length > 1) languages.splice(index, 1);

    Store.setSubtitlePrefs({ languages: languages });
    renderSettings();
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
