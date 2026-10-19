/* LatinoTV - ejemplo de proveedor en JavaScript para un repositorio.
 *
 * Cualquier script referenciado con "scriptUrl" en plugins.json debe llamar a
 * Registry.register({ ... }) con el contrato de proveedor:
 *
 *   {
 *     id: 'mi-proveedor',            // unico
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
 * Si defines iconUrl/tvTypes/language tambien se muestran en Ajustes.
 */
(function (global) {
  'use strict';

  var CATALOG = [
    {
      id: 'js-ejemplo-1',
      title: 'Ejemplo en JavaScript',
      year: 2020,
      poster: 'https://archive.org/services/img/ElephantsDream',
      url: 'https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4',
      description: 'Contenido servido por un proveedor JavaScript de ejemplo.'
    }
  ];

  function find(id) {
    for (var i = 0; i < CATALOG.length; i++) {
      if (CATALOG[i].id === id) return CATALOG[i];
    }
    return null;
  }

  global.Registry.register({
    id: 'repo-ejemplo-js',
    name: 'Proveedor JS de ejemplo',
    description: 'Proveedor cargado desde un repositorio usando scriptUrl.',
    language: 'es',
    tvTypes: ['Movie'],

    home: function () {
      return Promise.resolve([
        {
          id: 'js-row',
          title: 'Cargado desde JavaScript',
          items: CATALOG.map(function (item) {
            return {
              id: item.id,
              title: item.title,
              poster: item.poster,
              year: item.year,
              type: 'movie'
            };
          })
        }
      ]);
    },

    search: function (query) {
      var q = String(query || '').toLowerCase();
      return Promise.resolve(CATALOG.filter(function (item) {
        return item.title.toLowerCase().indexOf(q) !== -1;
      }).map(function (item) {
        return { id: item.id, title: item.title, poster: item.poster, year: item.year, type: 'movie' };
      }));
    },

    details: function (id) {
      var item = find(id);
      if (!item) return Promise.reject(new Error('Contenido no encontrado'));
      return Promise.resolve({
        id: item.id,
        title: item.title,
        year: item.year,
        runtime: 0,
        poster: item.poster,
        description: item.description,
        genres: ['Ejemplo'],
        type: 'movie',
        episodes: []
      });
    },

    resolve: function (id) {
      var item = find(id);
      if (!item) return Promise.reject(new Error('Contenido no encontrado'));
      return Promise.resolve([{ url: item.url, mime: 'video/mp4' }]);
    }
  });
})(window);
