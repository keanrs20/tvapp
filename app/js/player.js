/* LatinoTV - reproductor (HTML5 video + hls.js + subtitulos) */
(function (global) {
  'use strict';

  var els = {};
  var state = {
    open: false,
    hls: null,
    live: false,
    opts: null,
    hideTimer: null,
    lastSave: 0,
    pendingStart: 0,
    panel: null,
    panelIndex: 0,
    nextTimer: null,
    nextCountdown: 0,
    subtitleUrl: null,
    subtitleTrack: null,
    subtitleLabel: ''
  };

  function init() {
    els.root = document.getElementById('player');
    els.video = document.getElementById('video');
    els.osd = document.getElementById('player-osd');
    els.spinner = document.getElementById('player-spinner');
    els.message = document.getElementById('player-message');
    els.title = document.getElementById('player-title');
    els.subtitle = document.getElementById('player-subtitle');
    els.fill = document.getElementById('progress-fill');
    els.current = document.getElementById('time-current');
    els.total = document.getElementById('time-total');
    els.ctrlPlay = document.getElementById('ctrl-play');
    els.badge = document.getElementById('player-badge');
    els.panel = document.getElementById('player-panel');
    els.panelTitle = document.getElementById('panel-title');
    els.panelSub = document.getElementById('panel-sub');
    els.panelList = document.getElementById('panel-list');

    els.video.addEventListener('timeupdate', onTimeUpdate);
    els.video.addEventListener('loadedmetadata', onLoadedMetadata);
    els.video.addEventListener('waiting', function () { showSpinner(true); });
    els.video.addEventListener('playing', function () {
      showSpinner(false);
      showMessage('');
      setPlayIcon(false);
    });
    els.video.addEventListener('canplay', function () { showSpinner(false); });
    els.video.addEventListener('ended', onEnded);
    els.video.addEventListener('error', function () {
      if (state.open && els.video.getAttribute('src')) {
        showError('No se pudo reproducir el contenido.');
      }
    });

    document.addEventListener('mousemove', function () {
      if (state.open) showOsd(true);
    });
  }

  function open(options) {
    if (!options || !options.streams || !options.streams.length) {
      U.toast('Sin fuente disponible');
      return;
    }

    state.opts = options;
    state.open = true;
    state.lastSave = 0;
    clearNext();
    closePanel();
    clearSubtitle();

    els.root.classList.remove('hidden');
    els.root.setAttribute('aria-hidden', 'false');
    els.title.textContent = options.title || '';
    els.subtitle.textContent = options.subtitle || '';

    if (options.live) {
      els.badge.classList.remove('hidden');
    } else {
      els.badge.classList.add('hidden');
    }

    els.fill.style.width = '0%';
    els.current.textContent = '00:00';
    els.total.textContent = options.live ? 'EN VIVO' : '00:00';

    showMessage('');
    showSpinner(true);
    showOsd(true);
    setPlayIcon(false);

    Spatial.blur();
    playStream(options.streams[0], options.startAt || 0);
  }

  function playStream(stream, startAt) {
    cleanup();
    state.live = !!stream.live || (state.opts && !!state.opts.live);
    state.pendingStart = startAt || 0;

    var url = stream.url;
    var isHls = /\.m3u8(\?|#|$)/i.test(url) || /mpegurl/i.test(stream.mime || '');
    var nativeHls = !!els.video.canPlayType('application/vnd.apple.mpegurl');

    if (isHls && global.Hls && global.Hls.isSupported() && !nativeHls) {
      state.hls = new global.Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30
      });
      state.hls.loadSource(url);
      state.hls.attachMedia(els.video);
      state.hls.on(global.Hls.Events.MANIFEST_PARSED, function () {
        startPlayback();
      });
      state.hls.on(global.Hls.Events.ERROR, function (event, data) {
        if (data && data.fatal) {
          showError('No se pudo cargar la transmisión.');
        }
      });
    } else {
      els.video.src = url;
      startPlayback();
    }
  }

  function startPlayback() {
    var attempt = els.video.play();
    if (attempt && attempt.catch) {
      attempt.catch(function (error) {
        if (error && error.name === 'AbortError') return;
        showError('Pulsa OK para iniciar la reproducción.');
      });
    }
  }

  function onLoadedMetadata() {
    showSpinner(false);

    if (!state.live && state.pendingStart > 1 && isFinite(els.video.duration)) {
      try {
        els.video.currentTime = state.pendingStart;
      } catch (error) {
        /* posicion no valida */
      }
      state.pendingStart = 0;
    }

    els.total.textContent = state.live ? 'EN VIVO' : U.fmtTime(els.video.duration);
  }

  function onTimeUpdate() {
    var video = els.video;
    var duration = video.duration;

    if (!state.live && isFinite(duration) && duration > 0) {
      els.fill.style.width = ((video.currentTime / duration) * 100).toFixed(2) + '%';
      els.current.textContent = U.fmtTime(video.currentTime);
      els.total.textContent = U.fmtTime(duration);
    }

    var now = Date.now();
    if (state.opts && state.opts.onProgress && now - state.lastSave > 5000) {
      state.lastSave = now;
      state.opts.onProgress(video.currentTime, isFinite(duration) ? duration : 0);
    }
  }

  function onEnded() {
    var duration = isFinite(els.video.duration) ? els.video.duration : els.video.currentTime;
    if (state.opts && state.opts.onProgress) {
      state.opts.onProgress(duration, duration);
    }

    if (state.opts && state.opts.onNext) {
      state.nextCountdown = 8;
      updateNextMessage();
      state.nextTimer = setInterval(function () {
        state.nextCountdown--;
        if (state.nextCountdown <= 0) {
          playNext();
        } else {
          updateNextMessage();
        }
      }, 1000);
      return;
    }

    showMessage('Reproducción finalizada');
    setTimeout(function () {
      if (state.open) close();
    }, 1600);
  }

  function updateNextMessage() {
    var label = (state.opts && state.opts.nextLabel) || 'el siguiente episodio';
    showMessage('Siguiente: ' + label + ' en ' + state.nextCountdown + ' s  (OK: ahora · Atrás: cancelar)');
  }

  function playNext() {
    var next = state.opts && state.opts.onNext;
    clearNext();
    if (next) next();
  }

  function clearNext() {
    if (state.nextTimer) {
      clearInterval(state.nextTimer);
      state.nextTimer = null;
    }
    state.nextCountdown = 0;
    showMessage('');
  }

  function toggle() {
    if (els.video.paused) {
      els.video.play();
      setPlayIcon(false);
    } else {
      els.video.pause();
      setPlayIcon(true);
    }
    showOsd(true);
  }

  function seek(delta) {
    if (state.live) {
      U.toast('Transmisión en vivo: no se puede avanzar');
      return;
    }

    var duration = els.video.duration;
    if (!isFinite(duration) || duration <= 0) return;

    els.video.currentTime = Math.min(Math.max(0, els.video.currentTime + delta), Math.max(0, duration - 1));
    showOsd(true);
  }

  /* ---------------- subtitulos ---------------- */

  function setSubtitle(vttText, label) {
    clearSubtitle();

    try {
      var blob = new Blob([vttText], { type: 'text/vtt;charset=utf-8' });
      state.subtitleUrl = URL.createObjectURL(blob);

      var track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = label || 'Subtítulos';
      track.srclang = 'es';
      track.src = state.subtitleUrl;
      track.default = true;
      els.video.appendChild(track);

      state.subtitleTrack = track;
      state.subtitleLabel = label || 'Subtítulos';

      var show = function () {
        var list = els.video.textTracks;
        for (var i = 0; i < list.length; i++) {
          list[i].mode = (list[i] === track.track) ? 'showing' : 'disabled';
        }
      };

      track.addEventListener('load', show);
      setTimeout(show, 400);
      setTimeout(show, 1200);
      return true;
    } catch (error) {
      U.toast('No se pudo cargar el subtitulo');
      return false;
    }
  }

  function clearSubtitle() {
    var list = els.video ? els.video.textTracks : null;
    if (list) {
      for (var i = 0; i < list.length; i++) list[i].mode = 'disabled';
    }
    if (state.subtitleTrack && state.subtitleTrack.parentNode) {
      state.subtitleTrack.parentNode.removeChild(state.subtitleTrack);
    }
    if (state.subtitleUrl) {
      try { URL.revokeObjectURL(state.subtitleUrl); } catch (error) { /* nada */ }
    }
    state.subtitleTrack = null;
    state.subtitleUrl = null;
    state.subtitleLabel = '';
  }

  function hasSubtitle() {
    return !!state.subtitleTrack;
  }

  function subtitleLabel() {
    return state.subtitleLabel;
  }

  /* ---------------- panel ---------------- */

  function openPanel(config) {
    state.panel = config || { title: '', sub: '', items: [] };
    state.panelIndex = 0;
    renderPanel();
    els.panel.classList.remove('hidden');
    showOsd(false);
  }

  function renderPanel() {
    var panel = state.panel || { items: [] };
    els.panelTitle.textContent = panel.title || '';
    els.panelSub.textContent = panel.sub || '';
    els.panelList.innerHTML = '';

    (panel.items || []).forEach(function (item, index) {
      var button = document.createElement('button');
      button.className = 'panel-item' + (index === state.panelIndex ? ' focused' : '') + (item.disabled ? ' disabled' : '');
      button.type = 'button';

      var strong = document.createElement('span');
      strong.className = 'panel-item-label';
      strong.textContent = item.label || '';
      button.appendChild(strong);

      if (item.sub) {
        var small = document.createElement('span');
        small.className = 'panel-item-sub';
        small.textContent = item.sub;
        button.appendChild(small);
      }

      els.panelList.appendChild(button);
    });
  }

  function closePanel() {
    if (!state.panel) return;
    state.panel = null;
    els.panel.classList.add('hidden');
  }

  function movePanel(delta) {
    var items = (state.panel && state.panel.items) || [];
    if (!items.length) return;

    var index = state.panelIndex;
    for (var step = 0; step < items.length; step++) {
      index = (index + delta + items.length) % items.length;
      if (!items[index].disabled) break;
    }
    state.panelIndex = index;

    var nodes = els.panelList.children;
    for (var i = 0; i < nodes.length; i++) {
      if (i === index) nodes[i].classList.add('focused');
      else nodes[i].classList.remove('focused');
    }
    if (nodes[index] && nodes[index].scrollIntoView) {
      nodes[index].scrollIntoView({ block: 'nearest' });
    }
  }

  function activatePanel() {
    var items = (state.panel && state.panel.items) || [];
    var item = items[state.panelIndex];
    if (!item || item.disabled || !item.onSelect) return;
    item.onSelect(item);
  }

  function isPanelOpen() {
    return !!state.panel;
  }

  /* ---------------- fin panel ---------------- */

  function setPlayIcon(paused) {
    if (els.ctrlPlay) els.ctrlPlay.innerHTML = paused ? '&#9654;' : '&#10074;&#10074;';
  }

  function showOsd(visible) {
    clearTimeout(state.hideTimer);
    if (visible === false) {
      els.osd.classList.remove('visible');
      return;
    }
    if (state.panel) return;

    els.osd.classList.add('visible');

    if (!els.video.paused) {
      state.hideTimer = setTimeout(function () {
        if (!els.video.paused) els.osd.classList.remove('visible');
      }, 4000);
    }
  }

  function showSpinner(show) {
    if (!els.spinner) return;
    if (show) els.spinner.classList.remove('hidden');
    else els.spinner.classList.add('hidden');
  }

  function showMessage(text) {
    if (!els.message) return;
    if (!text) {
      els.message.classList.add('hidden');
      els.message.textContent = '';
      return;
    }
    els.message.textContent = text;
    els.message.classList.remove('hidden');
  }

  function showError(text) {
    showSpinner(false);
    showMessage(text);
  }

  function handleKey(event) {
    var code = event.keyCode;

    if (state.panel) {
      if (code === 10009 || code === 27 || code === 461 || code === 413) {
        event.preventDefault();
        closePanel();
        showOsd(true);
      } else if (code === 38) {
        event.preventDefault();
        movePanel(-1);
      } else if (code === 40) {
        event.preventDefault();
        movePanel(1);
      } else if (code === 13 || code === 415 || code === 10252 || code === 179) {
        event.preventDefault();
        activatePanel();
      }
      return;
    }

    if (code === 10009 || code === 27 || code === 461) {
      event.preventDefault();
      if (state.nextTimer) {
        clearNext();
        close();
        return;
      }
      close();
      return;
    }

    if (state.nextTimer && (code === 13 || code === 415 || code === 10252 || code === 179)) {
      event.preventDefault();
      playNext();
      return;
    }

    showOsd(true);

    if (code === 13 || code === 415 || code === 10252 || code === 179) {
      event.preventDefault();
      toggle();
    } else if (code === 19) {
      event.preventDefault();
      if (!els.video.paused) toggle();
    } else if (code === 413) {
      event.preventDefault();
      close();
    } else if (code === 37) {
      event.preventDefault();
      seek(-10);
    } else if (code === 39) {
      event.preventDefault();
      seek(10);
    } else if (code === 412) {
      event.preventDefault();
      seek(-30);
    } else if (code === 417) {
      event.preventDefault();
      seek(30);
    } else if (code === 38 || code === 40) {
      event.preventDefault();
    } else if (code === 404) {
      /* Boton verde: subtitulos */
      event.preventDefault();
      if (state.opts && state.opts.onSubtitles) state.opts.onSubtitles();
      else U.toast('Subtítulos no disponibles aquí');
    }
  }

  function cleanup() {
    if (state.hls) {
      try { state.hls.destroy(); } catch (error) { /* nada */ }
      state.hls = null;
    }
  }

  function close() {
    if (!state.open) return;

    var position = els.video.currentTime || 0;
    var duration = isFinite(els.video.duration) ? els.video.duration : 0;

    if (state.opts && state.opts.onProgress && position > 0) {
      state.opts.onProgress(position, duration);
    }

    state.open = false;
    clearNext();
    closePanel();
    clearSubtitle();
    els.video.pause();
    cleanup();
    els.video.removeAttribute('src');
    try { els.video.load(); } catch (error) { /* nada */ }

    els.root.classList.add('hidden');
    els.root.setAttribute('aria-hidden', 'true');
    els.osd.classList.remove('visible');
    showMessage('');
    showSpinner(false);

    var callback = state.opts && state.opts.onClose;
    state.opts = null;

    if (callback) callback();
  }

  function isOpen() {
    return state.open;
  }

  global.Player = {
    init: init,
    open: open,
    close: close,
    handleKey: handleKey,
    isOpen: isOpen,
    setSubtitle: setSubtitle,
    clearSubtitle: clearSubtitle,
    hasSubtitle: hasSubtitle,
    subtitleLabel: subtitleLabel,
    openPanel: openPanel,
    closePanel: closePanel,
    isPanelOpen: isPanelOpen
  };
})(window);
