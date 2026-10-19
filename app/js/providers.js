/* LatinoTV - registro de proveedores
 *
 * Contrato de un proveedor:
 *
 *   {
 *     id: 'mi-proveedor',
 *     name: 'Mi proveedor',
 *     description: 'Texto para Ajustes',
 *     home: function () -> Promise<[{ title, items: [item] }]>,
 *     search: function (query) -> Promise<[item]>,
 *     details: function (id) -> Promise<detalle>,
 *     resolve: function (id, episodeId) -> Promise<[stream]>
 *   }
 *
 * item   = { id, title, poster, year, subtitle, type }
 * stream = { url, mime, live, label }
 *
 * Solo agrega fuentes de las que tengas derechos o que sean de dominio
 * público / licencia abierta.
 */
(function (global) {
  'use strict';

  var registry = [];

  function register(provider) {
    if (!provider || !provider.id || !provider.name) return;
    if (find(provider.id)) return;
    registry.push(provider);
  }

  function all() {
    return registry.slice();
  }

  function find(id) {
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].id === id) return registry[i];
    }
    return null;
  }

  function enabled() {
    return all().filter(function (provider) {
      return Store.isEnabled(provider.id);
    });
  }

  function remove(id) {
    registry = registry.filter(function (provider) {
      return provider.id !== id;
    });
  }

  function removeBySource(sourceRepo) {
    registry = registry.filter(function (provider) {
      return provider.sourceRepo !== sourceRepo;
    });
  }

  function home() {
    var providers = enabled();
    var jobs = providers.map(function (provider) {
      return Promise.resolve()
        .then(function () {
          return provider.home();
        })
        .then(function (rows) {
          return { provider: provider, rows: rows || [] };
        })
        .catch(function (error) {
          console.warn('[LatinoTV] ' + provider.id + ': ' + (error && error.message));
          return { provider: provider, rows: [], error: error };
        });
    });

    return Promise.all(jobs);
  }

  function search(query) {
    var providers = enabled();
    var jobs = providers.map(function (provider) {
      return Promise.resolve()
        .then(function () {
          return provider.search(query);
        })
        .then(function (items) {
          return { provider: provider, items: items || [] };
        })
        .catch(function (error) {
          console.warn('[LatinoTV] ' + provider.id + ': ' + (error && error.message));
          return { provider: provider, items: [] };
        });
    });

    return Promise.all(jobs);
  }

  global.Registry = {
    register: register,
    all: all,
    get: find,
    enabled: enabled,
    remove: remove,
    removeBySource: removeBySource,
    home: home,
    search: search
  };
})(window);
