/* LatinoTV - utilidades compartidas */
(function (global) {
  'use strict';

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function fmtTime(total) {
    if (!isFinite(total) || total < 0) total = 0;
    total = Math.floor(total);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s);
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error(label || 'Tiempo de espera agotado'));
      }, ms || 15000);

      promise.then(
        function (value) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        },
        function (error) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  function fetchWithTimeout(url, options) {
    options = options || {};
    var timeout = options.timeout || 15000;
    var request = fetch(url, options);
    return withTimeout(request, timeout, 'No se pudo conectar con el servidor');
  }

  function fetchJSON(url, options) {
    options = options || {};
    var headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    return fetchWithTimeout(url, Object.assign({}, options, { headers: headers })).then(function (response) {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ' en ' + url);
      }
      return response.json();
    });
  }

  function fetchText(url, options) {
    options = options || {};
    return fetchWithTimeout(url, options).then(function (response) {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ' en ' + url);
      }
      return response.text();
    });
  }

  var toastTimer = null;
  function toast(message, ms) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, ms || 2600);
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, wait || 300);
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  global.U = {
    $: $,
    $$: $$,
    esc: esc,
    fmtTime: fmtTime,
    fetchJSON: fetchJSON,
    fetchText: fetchText,
    toast: toast,
    debounce: debounce,
    clamp: clamp,
    withTimeout: withTimeout
  };
})(window);
