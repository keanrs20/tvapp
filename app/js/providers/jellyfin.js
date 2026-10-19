/* LatinoTV - proveedor Jellyfin (tu propio servidor multimedia) */
(function (global) {
  'use strict';

  var userIdCache = null;

  function cfg() {
    return Store.cfg('jellyfin');
  }

  function base() {
    var server = String(cfg().server || '').trim().replace(/\/+$/, '');
    if (server && !/^https?:\/\//i.test(server)) {
      server = 'http://' + server;
    }
    return server;
  }

  function ensure() {
    var c = cfg();
    if (!c.server) throw new Error('Configura la dirección del servidor Jellyfin');
    if (!c.key) throw new Error('Configura la API Key de Jellyfin');
  }

  function query(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] === undefined || params[key] === null || params[key] === '') return;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
    });
    return parts.join('&');
  }

  function api(path, params) {
    ensure();
    var allParams = Object.assign({}, params || {}, { api_key: cfg().key });
    var url = base() + path + '?' + query(allParams);
    return U.fetchJSON(url, { timeout: 20000 });
  }

  function userId() {
    if (userIdCache) return Promise.resolve(userIdCache);
    ensure();

    var wanted = String(cfg().user || '').trim();
    if (/^[0-9a-f]{32}$/i.test(wanted)) {
      userIdCache = wanted;
      return Promise.resolve(userIdCache);
    }

    return api('/Users').then(function (users) {
      if (!Array.isArray(users) || !users.length) {
        throw new Error('El servidor Jellyfin no tiene usuarios');
      }

      var selected = null;
      if (wanted) {
        users.forEach(function (user) {
          if (String(user.Name || '').toLowerCase() === wanted.toLowerCase()) {
            selected = user;
          }
        });
      }
      if (!selected) selected = users[0];

      userIdCache = selected.Id;
      return userIdCache;
    });
  }

  function image(id, type, height) {
    if (!id) return '';
    return base() + '/Items/' + encodeURIComponent(id) + '/Images/' + type +
      '?maxHeight=' + (height || 600) + '&quality=90&api_key=' + encodeURIComponent(cfg().key);
  }

  function toItem(raw) {
    var hasImage = raw.ImageTags && raw.ImageTags.Primary;
    return {
      id: raw.Id,
      title: raw.Name || 'Sin título',
      poster: hasImage ? image(raw.Id, 'Primary', 600) : '',
      year: raw.ProductionYear || '',
      subtitle: raw.Type === 'Series' ? 'Serie' : '',
      type: raw.Type === 'Series' ? 'series' : 'movie'
    };
  }

  function itemQuery(extra) {
    return Object.assign({
      Recursive: 'true',
      Limit: '18',
      SortBy: 'DateCreated',
      SortOrder: 'Descending',
      Fields: 'ProductionYear,Genres,Overview,RunTimeTicks,ImageTags',
      ImageTypeLimit: '1',
      EnableImageTypes: 'Primary'
    }, extra || {});
  }

  function detailsFromItem(raw) {
    var runtime = raw.RunTimeTicks ? Math.round(raw.RunTimeTicks / 10000000) : 0;
    var hasBackdrop = raw.BackdropImageTags && raw.BackdropImageTags.length;
    var hasImage = raw.ImageTags && raw.ImageTags.Primary;

    return {
      id: raw.Id,
      title: raw.Name || 'Sin título',
      year: raw.ProductionYear || '',
      runtime: runtime,
      poster: hasImage ? image(raw.Id, 'Primary', 700) : '',
      backdrop: hasBackdrop ? image(raw.Id, 'Backdrop/0', 900) : (hasImage ? image(raw.Id, 'Primary', 900) : ''),
      description: raw.Overview || '',
      genres: raw.Genres || [],
      type: raw.Type === 'Series' ? 'series' : 'movie',
      live: false,
      episodes: []
    };
  }

  global.Registry.register({
    id: 'jellyfin',
    name: 'Jellyfin',
    description: 'Tu propio servidor multimedia. Pulsa Guardar para activarlo; el servidor debe permitir CORS y ser accesible desde el televisor.',

    home: function () {
      return userId().then(function (uid) {
        var movies = api('/Users/' + uid + '/Items', itemQuery({
          IncludeItemTypes: 'Movie',
          SortBy: 'DateCreated'
        }));

        var series = api('/Users/' + uid + '/Items', itemQuery({
          IncludeItemTypes: 'Series',
          SortBy: 'DateCreated'
        }));

        return Promise.all([movies, series]).then(function (results) {
          var rows = [];

          var movieItems = (results[0].Items || []).map(toItem);
          if (movieItems.length) {
            rows.push({ id: 'jf-movies', title: 'Películas recientes', items: movieItems });
          }

          var seriesItems = (results[1].Items || []).map(toItem);
          if (seriesItems.length) {
            rows.push({ id: 'jf-series', title: 'Series recientes', items: seriesItems });
          }

          return rows;
        });
      });
    },

    search: function (queryText) {
      return userId().then(function (uid) {
        return api('/Users/' + uid + '/Items', itemQuery({
          SearchTerm: queryText,
          IncludeItemTypes: 'Movie,Series',
          Limit: '40',
          SortBy: 'SortName'
        }));
      }).then(function (result) {
        return (result.Items || []).map(toItem);
      });
    },

    details: function (id) {
      return userId().then(function (uid) {
        return api('/Users/' + uid + '/Items/' + encodeURIComponent(id), {
          Fields: 'ProductionYear,Genres,Overview,RunTimeTicks,ImageTags,BackdropImageTags'
        });
      }).then(function (raw) {
        var details = detailsFromItem(raw);

        if (raw.Type !== 'Series') {
          return details;
        }

        return userId().then(function (uid) {
          return api('/Shows/' + encodeURIComponent(id) + '/Episodes', {
            UserId: uid,
            Fields: 'Overview,RunTimeTicks,ImageTags',
            ImageTypeLimit: '1',
            EnableImageTypes: 'Primary'
          });
        }).then(function (result) {
          details.episodes = (result.Items || []).map(function (ep) {
            return {
              id: ep.Id,
              title: ep.Name || 'Episodio',
              season: ep.ParentIndexNumber || 1,
              episode: ep.IndexNumber || 0,
              overview: ep.Overview || '',
              still: ep.ImageTags && ep.ImageTags.Primary ? image(ep.Id, 'Primary', 300) : ''
            };
          });
          return details;
        });
      });
    },

    resolve: function (id) {
      ensure();
      return Promise.resolve([
        {
          url: base() + '/Videos/' + encodeURIComponent(id) + '/stream?static=true&api_key=' + encodeURIComponent(cfg().key),
          mime: 'video/mp4',
          live: false,
          label: 'Directo'
        }
      ]);
    },

    reset: function () {
      userIdCache = null;
    }
  });
})(window);
