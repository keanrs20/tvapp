/* LatinoTV - reproductor (HTML5 video + hls.js) */
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
    pendingStart: 0
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
        /* posición no válida */
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
    showMessage('Reproducción finalizada');
    setTimeout(function () {
      if (state.open) close();
    }, 1600);
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

  function setPlayIcon(paused) {
    if (els.ctrlPlay) els.ctrlPlay.innerHTML = paused ? '&#9654;' : '&#10074;&#10074;';
  }

  function showOsd() {
    clearTimeout(state.hideTimer);
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

    if (code === 10009 || code === 27 || code === 461) {
      event.preventDefault();
      close();
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
    isOpen: isOpen
  };
})(window);
