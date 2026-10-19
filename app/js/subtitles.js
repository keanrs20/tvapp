/* LatinoTV - subtitulos (OpenSubtitles REST + conversion SRT -> VTT)
 *
 * Usa la API publica rest.opensubtitles.org, que no requiere clave y permite
 * CORS. Las descargas vienen comprimidas en gzip, por eso se usa pako.
 */
(function (global) {
  'use strict';

  var REST = 'https://rest.opensubtitles.org/search';

  var LANGUAGES = [
    { code: 'spa', label: 'Español' },
    { code: 'eng', label: 'Inglés' },
    { code: 'por', label: 'Portugués' },
    { code: 'mex', label: 'Español (Latinoamérica)' },
    { code: 'arg', label: 'Español (Argentina)' },
    { code: 'ita', label: 'Italiano' },
    { code: 'fre', label: 'Francés' },
    { code: 'ger', label: 'Alemán' }
  ];

  function languageLabel(code) {
    for (var i = 0; i < LANGUAGES.length; i++) {
      if (LANGUAGES[i].code === code) return LANGUAGES[i].label;
    }
    return code;
  }

  function stripTags(html) {
    return String(html || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function querySlug(text) {
    var value = String(text || '');
    if (value.normalize) {
      value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '+')
      .replace(/^\+|\+$/g, '');
  }

  function buildUrl(params) {
    var parts = [];

    /* La API antigua exige episode- antes de query-/imdbid- y una consulta
       canonica (minusculas y + en lugar de espacios, sin %XX). */
    if (params.episode) parts.push('episode-' + encodeURIComponent(params.episode));

    if (params.imdbId) {
      var imdb = String(params.imdbId).replace(/^tt/i, '');
      if (/^\d+$/.test(imdb)) imdb = ('0000000' + imdb).slice(-7);
      parts.push('imdbid-' + encodeURIComponent(imdb));
    } else if (params.query) {
      var slug = querySlug(params.query);
      if (slug) parts.push('query-' + slug);
    }

    if (params.season) parts.push('season-' + encodeURIComponent(params.season));
    parts.push('sublanguageid-' + (params.language || 'spa'));

    return REST + '/' + parts.join('/');
  }

  function normalize(item) {
    return {
      id: item.IDSubtitleFile,
      name: item.SubFileName || 'Subtitulo',
      release: item.MovieReleaseName || item.MovieName || '',
      language: item.SubLanguageID || '',
      languageLabel: item.LanguageName || languageLabel(item.SubLanguageID),
      encoding: item.SubEncoding || '',
      format: item.SubFormat || 'srt',
      downloads: Number(item.SubDownloadsCnt || 0),
      rating: Number(item.SubRating || 0),
      votes: Number(item.SubSumVotes || 0),
      trusted: String(item.SubFromTrusted || '') === '1',
      comment: stripTags(item.SubAuthorComment || ''),
      url: item.SubDownloadLink || ''
    };
  }

  function searchOne(params) {
    var url = buildUrl(params);
    return U.fetchJSON(url, { timeout: 20000 }).then(function (list) {
      if (!Array.isArray(list)) return [];
      return list
        .filter(function (item) {
          if (!item || !item.SubDownloadLink) return false;
          if (String(item.SubBad) === '1') return false;
          if (/sub$/i.test(String(item.SubFormat || ''))) return false;
          return true;
        })
        .map(normalize);
    });
  }

  function search(params) {
    params = params || {};
    var languages = params.languages && params.languages.length ? params.languages : [params.language || 'spa'];

    var jobs = languages.map(function (language) {
      var options = {
        imdbId: params.imdbId,
        query: params.query,
        season: params.season,
        episode: params.episode,
        language: language
      };
      return searchOne(options).catch(function () { return []; });
    });

    return Promise.all(jobs).then(function (groups) {
      var all = [];
      groups.forEach(function (group) { all = all.concat(group); });

      all.sort(function (a, b) {
        if (a.trusted !== b.trusted) return a.trusted ? -1 : 1;
        if (b.downloads !== a.downloads) return b.downloads - a.downloads;
        return b.rating - a.rating;
      });

      var seen = {};
      var unique = [];
      all.forEach(function (item) {
        if (seen[item.name]) return;
        seen[item.name] = true;
        unique.push(item);
      });

      return unique.slice(0, 50);
    });
  }

  function decode(bytes, encoding) {
    var name = /utf/i.test(encoding || '') ? 'utf-8' : 'windows-1252';
    try {
      return new TextDecoder(name).decode(bytes);
    } catch (error) {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }

  function download(subtitle) {
    if (!subtitle || !subtitle.url) return Promise.reject(new Error('Subtitulo sin enlace'));

    return U.withTimeout(fetch(subtitle.url, { headers: { Accept: '*/*' } }), 30000, 'Tiempo de espera agotado')
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        var bytes = new Uint8Array(buffer);

        if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
          if (!global.pako) throw new Error('pako no esta disponible');
          bytes = global.pako.inflate(bytes);
        }

        return decode(bytes, subtitle.encoding);
      });
  }

  function toVtt(text) {
    var content = String(text || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .trim();

    if (/^WEBVTT/.test(content)) return content;

    var blocks = content.split(/\n{2,}/);
    var lines = ['WEBVTT', ''];

    blocks.forEach(function (block) {
      var rows = block.split('\n').filter(function (row) { return row.trim().length; });
      if (!rows.length) return;

      var index = /^\d+$/.test(rows[0].trim()) ? 1 : 0;
      var timeRow = rows[index];
      if (!timeRow || timeRow.indexOf('-->') === -1) return;

      var times = timeRow
        .replace(/,/g, '.')
        .replace(/\s+/g, ' ')
        .trim();

      var cueText = rows.slice(index + 1)
        .join('\n')
        .replace(/\{\\?[^}]*\}/g, '');

      lines.push(times);
      lines.push(cueText);
      lines.push('');
    });

    return lines.join('\n');
  }

  global.Subtitles = {
    LANGUAGES: LANGUAGES,
    languageLabel: languageLabel,
    search: search,
    download: download,
    toVtt: toVtt
  };
})(window);
