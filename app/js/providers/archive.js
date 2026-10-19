/* LatinoTV - proveedor de cine de dominio público en Internet Archive
 *
 * Usa solo la API pública de archive.org y colecciones curadas de dominio
 * público o licencia abierta (feature_films). Inspirado en el proveedor
 * InternetArchive de CloudStream (recloudstream/extensions), reimplementado
 * en JavaScript para esta app.
 *
 * API usada:
 *   Búsqueda:   /advancedsearch.php?q=...&output=json
 *   Metadatos:  /metadata/<identifier>
 *   Póster:     /services/img/<identifier>
 */
(function (global) {
  'use strict';

  var BASE = 'https://archive.org';
  var PD_COLLECTION = 'feature_films'; // colección curada de dominio público

  function searchUrl(query, rows) {
    var q = 'collection:(' + PD_COLLECTION + ') AND mediatype:(movies)';
    if (query) q = '(' + query + ') AND ' + q;

    return BASE + '/advancedsearch.php?output=json&rows=' + (rows || 24) +
      '&fl[]=identifier&fl[]=title&fl[]=mediatype&fl[]=year&fl[]=downloads' +
      '&sort%5B%5D=' + encodeURIComponent('downloads desc') +
      '&q=' + encodeURIComponent(q);
  }

  function fetchJSON(url) {
    return U.fetchJSON(url, { timeout: 20000 });
  }

  /* ---------------- helpers de metadatos ---------------- */

  function toList(value) {
    if (Array.isArray(value)) return value;
    if (value == null || value === '') return [];
    return [value];
  }

  function stripHtml(html) {
    return String(html || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\r?\n{2,}/g, '\n')
      .replace(/^\s+|\s+$/g, '');
  }

  function secondsOf(length) {
    if (length == null) return 0;
    var value = String(length).trim();
    if (value.indexOf(':') === -1) return parseFloat(value) || 0;

    var parts = value.split(':');
    if (parts.length === 2) return (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
    if (parts.length === 3) {
      return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
    }
    return 0;
  }

  function sizeOf(file) {
    return parseFloat(file.size) || 0;
  }

  function isVideo(file) {
    if (!file || !file.name) return false;
    if (secondsOf(file.length) < 10) return false;

    var format = String(file.format || '').toLowerCase();
    var mpeg = format.indexOf('mpeg') !== -1;
    var others = /^(h\.?264|matroska|divx|xvid|ogg video)/i.test(format);
    return mpeg || others;
  }

  function preferredVideo(file) {
    var format = String(file.format || '');
    var bad = /512kb|ogg/i.test(format);
    var good = /mp4|m4v|h\.?264/i.test(format);
    return good && !bad;
  }

  function cleanName(file) {
    var name = String(file.original || file.name);
    name = name.replace(/\\/g, '/').split('/').pop();
    name = name.replace(/\.[^.]+$/, '');
    return name.replace(/_+/g, ' ').trim();
  }

  function uniqueKey(file) {
    return cleanName(file)
      .replace(/\.[^/.]+$/, '')
      .replace(/512kb/i, '')
      .trim()
      .toLowerCase();
  }

  function episodeInfo(name) {
    var text = String(name || '');

    var both = /s(\d+)\s*e(\d+)/i.exec(text) ||
      /season\s*(\d+)[^\d]*episode\s*(\d+)/i.exec(text) ||
      /episode\s*(\d+)[^\d]*season\s*(\d+)/i.exec(text);
    if (both) return { season: parseInt(both[1], 10), episode: parseInt(both[2], 10) };

    var only = /episode\s*(\d+)/i.exec(text) || /\be(\d+)\b/i.exec(text);
    if (only) return { season: 1, episode: parseInt(only[1], 10) };

    return { season: 1, episode: null };
  }

  /* ---------------- agrupado de archivos ---------------- */

  function videoGroups(metadata) {
    var videos = (metadata.files || []).filter(isVideo);
    var groups = [];
    var index = {};

    videos.forEach(function (file) {
      var key = uniqueKey(file);
      if (!index[key]) {
        index[key] = { key: key, name: cleanName(file), files: [] };
        groups.push(index[key]);
      }
      index[key].files.push(file);
    });

    groups.forEach(function (group) {
      var best = null;
      group.files.forEach(function (file) {
        if (!best) { best = file; return; }
        if (preferredVideo(file) !== preferredVideo(best)) {
          if (preferredVideo(file)) best = file;
          return;
        }
        if (sizeOf(file) > sizeOf(best)) best = file;
      });
      group.best = best;
      var info = episodeInfo(group.name);
      group.season = info.season;
      group.episode = info.episode;
    });

    return groups;
  }

  function fileUrl(metadata, file) {
    if (!metadata.server || !metadata.dir || !file) return '';

    var dir = String(metadata.dir);
    if (dir.charAt(dir.length - 1) !== '/') dir += '/';

    return 'https://' + metadata.server + dir + String(file.name)
      .split('/')
      .map(function (part) { return encodeURIComponent(part); })
      .join('/');
  }

  function naturalCompare(a, b) {
    var rx = /(\d+)|(\D+)/g;
    var ra, rb;

    a = String(a).toLowerCase();
    b = String(b).toLowerCase();

    while (true) {
      ra = rx.exec(a);
      rx.lastIndex = 0;
      rb = rx.exec(b);
      rx.lastIndex = 0;

      if (!ra || !rb) return (a < b ? -1 : (a > b ? 1 : 0));
      if (ra[1] && rb[1]) {
        var na = parseInt(ra[1], 10);
        var nb = parseInt(rb[1], 10);
        if (na !== nb) return na - nb;
      } else if (ra[0] !== rb[0]) {
        return (ra[0] < rb[0] ? -1 : 1);
      }

      a = a.slice(ra[0].length);
      b = b.slice(rb[0].length);
    }
  }

  function detailFrom(metadata) {
    var groups = videoGroups(metadata);
    var meta = metadata.metadata || {};
    var subjects = toList(meta.subject);
    if (subjects.length === 1 && String(subjects[0]).indexOf(';') !== -1) {
      subjects = String(subjects[0]).split(';').map(function (s) { return s.trim(); });
    }
    var creators = toList(meta.creator);
    var year = parseInt(meta.year, 10) ||
      (function () { return parseInt(String(meta.date || meta.year || '').slice(0, 4), 10) || 0; })();

    var series = groups.length > 1;

    return {
      id: meta.identifier,
      title: meta.title || meta.identifier,
      year: year || 0,
      runtime: series
        ? Math.round(secondsOf(groups[0].best.length) / 60)
        : Math.round(secondsOf(groups.length ? groups[0].best.length : 0) / 60),
      poster: BASE + '/services/img/' + meta.identifier,
      backdrop: BASE + '/services/img/' + meta.identifier,
      description: stripHtml(toList(meta.description).join('\n')),
      genres: subjects.slice(0, 4),
      creator: creators[0] || '',
      type: series ? 'series' : 'movie',
      live: false,
      episodes: series
        ? groups
            .slice()
            .sort(function (a, b) {
              var season = (a.season || 1) - (b.season || 1);
              if (season !== 0) return season;
              if (a.episode && b.episode) return a.episode - b.episode;
              return naturalCompare(a.key, b.key);
            })
            .map(function (group, index) {
              return {
                id: group.key,
                title: group.name,
                season: group.season || 1,
                episode: group.episode || (index + 1),
                overview: '',
                still: BASE + '/services/img/' + meta.identifier
              };
            })
        : []
    };
  }

  function streamFrom(metadata, key) {
    var groups = videoGroups(metadata);
    var group = null;

    groups.forEach(function (candidate) {
      if (candidate.key === key) group = candidate;
    });

    // Sin clave: la película completa (o el primer grupo)
    if (!group && key == null && groups.length) group = groups[0];
    if (!group) return null;

    var quality = preferredVideo(group.best) ? (sizeOf(group.best) > 200000000 ? '720p+' : '') : '';

    return [{
      url: fileUrl(metadata, group.best),
      mime: /ogg/i.test(group.best.format) ? 'video/ogg' : 'video/mp4',
      live: false,
      label: 'Internet Archive' + (quality ? ' · ' + quality : '')
    }];
  }

  function toCard(doc) {
    return {
      id: doc.identifier,
      title: doc.title || doc.identifier,
      year: parseInt(doc.year, 10) || '',
      poster: BASE + '/services/img/' + doc.identifier,
      subtitle: '',
      type: 'movie'
    };
  }

  function search(query) {
    return fetchJSON(searchUrl(query, 30)).then(function (result) {
      var docs = (result.response && result.response.docs) || [];
      return docs.filter(function (doc) { return doc.identifier; }).map(toCard);
    });
  }

  global.Registry.register({
    id: 'archive',
    name: 'Cine clásico (dominio público)',
    description: 'Películas de dominio público en Internet Archive (colección feature_films). Contenido libre con enlaces MP4 directos.',
    language: 'es',

    home: function () {
      return Promise.all([
        search(null),
        search('language:(Spanish OR spa)')
      ]).then(function (results) {
        return [
          {
            id: 'pd-popular',
            title: 'Cine clásico en dominio público',
            items: results[0]
          },
          {
            id: 'pd-espanol',
            title: 'Cine clásico en español',
            items: results[1].slice(0, 24)
          }
        ];
      });
    },

    search: search,

    details: function (itemId) {
      return fetchJSON(BASE + '/metadata/' + encodeURIComponent(itemId)).then(detailFrom);
    },

    resolve: function (itemId, episodeId) {
      return fetchJSON(BASE + '/metadata/' + encodeURIComponent(itemId)).then(function (metadata) {
        var stream = streamFrom(metadata, episodeId == null ? null : String(episodeId));
        if (!stream) return Promise.reject(new Error('No hay video disponible para este contenido'));
        return stream;
      });
    }
  });
})(window);
