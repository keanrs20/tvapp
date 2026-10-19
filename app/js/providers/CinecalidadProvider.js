/* LatinoTV - proveedor Cinecalidad migrado desde Storm-ext Android (.cs3)
 * Dominio original: cinecalidad.lol / cinecalidad.to
 * Tipo: Peliculas y Series en espanol latino
 * Arquitectura: HTTP + selector CSS -> JSON de video
 */
(function (global) {
  'use strict';

  var BASE = 'https://cinecalidad.to';
  var HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };

  /* ================================================================
   * UTILIDADES INTERNAS
   * ================================================================ */

  function extractBetween(str, left, right) {
    var pos = str.indexOf(left);
    if (pos === -1) return '';
    pos += left.length;
    var end = str.indexOf(right, pos);
    if (end === -1) end = str.length;
    return str.substring(pos, end).trim();
  }

  function cleanText(text) {
    if (!text) return '';
    return text.replace(/[\s\u00A0]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* ================================================================
   * FETCH HELPER (fetch nativo Tizen / Smart TV)
   * ================================================================ */

  function fetchHTML(url, headers) {
    var opts = { method: 'GET', headers: headers || HEADERS };
    return fetch(url, opts).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    });
  }

  /* ================================================================
   * DETECTORS - Calidad y servidor desde URL/titulo
   * ================================================================ */

  function detectQuality(text) {
    var t = (text || '').toLowerCase();
    if (t.indexOf('4k') !== -1 || t.indexOf('2160') !== -1) return '4K';
    if (t.indexOf('1080') !== -1 || t.indexOf('fhd') !== -1) return '1080p';
    if (t.indexOf('720') !== -1 || t.indexOf('hd') !== -1) return '720p';
    if (t.indexOf('480') !== -1 || t.indexOf('sd') !== -1) return '480p';
    return '';
  }

  function detectServer(url) {
    var u = url.toLowerCase();
    if (u.indexOf('mega')) return 'Mega';
    if (u.indexOf('drive.google')) return 'Google Drive';
    if (u.indexOf('streamz')) return 'Streamz';
    if (u.indexOf('fembed')) return 'Fembed';
    if (u.indexOf('streamtape')) return 'StreamTape';
    if (u.indexOf('dood')) return 'DoodStream';
    if (u.indexOf('voe')) return 'Voe';
    if (u.indexOf('mp4upload')) return 'MP4Upload';
    return 'Default';
  }

  /* ================================================================
   * HOME - Catalogo principal (peliculas y series populares)
   * ================================================================ */

  function getCatalog(page, type) {
    var catMap = {
      'Movie': '/peliculas/',
      'TvSeries': '/series/'
    };
    var path = catMap[type] || '/';
    var url = BASE + path + (page > 1 ? 'page/' + page + '/' : '');

    return fetchHTML(url).then(function (html) {
      var results = [];
      /* Extraer cada bloque <article> de contenido */
      var regex = /<article[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
      var match;

      while ((match = regex.exec(html)) !== null) {
        var article = match[1];

        /* Titulo del contenido */
        var titleMatch = article.match(/<h2[^>]*><a[^>]*href="[^"]*"[^>]*title="([^"]*)"/);
        if (!titleMatch) continue;
        var title = cleanText(titleMatch[1]);

        /* URL de la pagina de detalle */
        var hrefMatch = article.match(/<h2[^>]*><a[^>]*href="([^"]*)"/);
        if (!hrefMatch) continue;
        var detailUrl = hrefMatch[1];
        if (detailUrl.indexOf('http') !== 0) detailUrl = BASE + detailUrl;

        /* Imagen / poster */
        var imgMatch = article.match(/<img[^>]*src="([^"]*)"/);
        var poster = imgMatch ? imgMatch[1] : '';
        if (poster && poster.indexOf('http') !== 0) poster = BASE + poster;

        results.push({
          id: detailUrl,
          title: title,
          poster: poster || '',
          year: '',
          subtitle: type === 'Movie' ? '' : 'Series',
          type: type === 'Movie' ? 'movie' : 'series'
        });
      }

      return results;
    }).catch(function () {
      return [];
    });
  }

  /* ================================================================
   * SEARCH - Busqueda por titulo en el sitio original
   * ================================================================ */

  function search(query) {
    if (!query || query.length < 2) return Promise.resolve([]);

    var encoded = encodeURIComponent(query);
    var url = BASE + '/?s=' + encoded;

    return fetchHTML(url).then(function (html) {
      var results = [];
      var regex = /<article[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
      var match;

      while ((match = regex.exec(html)) !== null) {
        var article = match[1];

        var titleMatch = article.match(/<h2[^>]*><a[^>]*href="[^"]*"[^>]*title="([^"]*)"/);
        if (!titleMatch) continue;
        var title = cleanText(titleMatch[1]);

        var hrefMatch = article.match(/<h2[^>]*><a[^>]*href="([^"]*)"/);
        if (!hrefMatch) continue;
        var detailUrl = hrefMatch[1];
        if (detailUrl.indexOf('http') !== 0) detailUrl = BASE + detailUrl;

        var imgMatch = article.match(/<img[^>]*src="([^"]*)"/);
        var poster = imgMatch ? imgMatch[1] : '';
        if (poster && poster.indexOf('http') !== 0) poster = BASE + poster;

        results.push({
          id: detailUrl,
          title: title,
          poster: poster || '',
          year: '',
          subtitle: 'Pelicula',
          type: 'movie'
        });
      }

      return results;
    }).catch(function () {
      return [];
    });
  }

  /* ================================================================
   * DETAILS - Metadatos, poster, sinopsis, episodios/links
   * ================================================================ */

  function details(id) {
    return fetchHTML(id).then(function (html) {
      var info = {
        id: id,
        title: '',
        year: 0,
        runtime: 0,
        poster: '',
        backdrop: '',
        description: '',
        genres: ['Pelicula', 'Latino'],
        type: 'movie',
        live: false,
        episodes: []
      };

      /* Titulo principal <h1> */
      var h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      if (h1Match) info.title = cleanText(h1Match[1]);

      /* Imagen / poster del contenido */
      var imgMatch = html.match(/<img[^>]*src="([^"]*)"[^>]*alt=["'][^"']*["']/i);
      if (!imgMatch) imgMatch = html.match(/<img[^>]*src="([^"]*)"/);
      if (imgMatch) {
        info.poster = imgMatch[1];
        if (info.poster.indexOf('http') !== 0) info.poster = BASE + info.poster;
        info.backdrop = info.poster;
      }

      /* Sinopsis / descripcion */
      var synopsisMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (synopsisMatch) {
        var synHtml = synopsisMatch[1].replace(/<[^>]+>/g, ' ');
        info.description = cleanText(synHtml);
      }

      /* Determinar si es serie o pelicula */
      if (html.indexOf('/series/') !== -1 || html.indexOf('temporada') !== -1) {
        info.type = 'series';
      } else {
        info.type = 'movie';
      }

      /* ============================================================
       * PELICULA: extraer enlaces de descarga/streaming
       * ============================================================ */
      if (info.type === 'movie') {
        var linksMatch = html.match(/<div[^>]*class="[^"]*download[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (!linksMatch) linksMatch = html.match(/<table[^>]*class="[^"]*dl[^"]*"[^>]*>([\s\S]*?)<\/table>/i);

        if (linksMatch) {
          var dlBlock = linksMatch[1];

          /* Buscar enlaces de descarga con titulo */
          var linkRegex = /<a[^>]*href="([^"]*)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
          var lmatch;
          while ((lmatch = linkRegex.exec(dlBlock)) !== null) {
            var dlUrl = lmatch[1];
            if (dlUrl.indexOf('http') !== 0) continue;

            info.episodes.push({
              id: dlUrl,
              title: cleanText(lmatch[2]) || 'Descarga',
              server: detectServer(dlUrl),
              quality: detectQuality(cleanText(lmatch[2])),
              url: dlUrl
            });
          }

          /* Si no hay bloque download, buscar enlaces en el contenido */
          if (info.episodes.length === 0) {
            var contentMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            if (contentMatch) {
              var contentHtml = contentMatch[1];
              var aRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
              var amatch;
              while ((amatch = aRegex.exec(contentHtml)) !== null) {
                var href = amatch[1];
                if (href.indexOf('http') === 0 && href.indexOf(BASE) !== 0) {
                  info.episodes.push({
                    id: href,
                    title: cleanText(amatch[2]) || 'Servidor',
                    server: detectServer(href),
                    quality: detectQuality(cleanText(amatch[2])),
                    url: href
                  });
                }
              }
            }
          }

          /* Buscar servidores embed (iframes) */
          var iframeRegex = /<iframe[^>]*src="([^"]*(?:streamtape|fembed|mp4upload|doodstream|voe[^-]*)[^"]*)"[^>]*>/gi;
          var ematch;
          while ((ematch = iframeRegex.exec(html)) !== null) {
            info.episodes.push({
              id: ematch[1],
              title: detectServer(ematch[1]),
              server: detectServer(ematch[1]),
              quality: '',
              url: ematch[1]
            });
          }

          /* Enlaces de Mega, Drive, Streamz */
          var megaRegex = /<a[^>]*href="(https?:\/\/(?:mega\.nz|drive\.google|streamz\.[^\/]*)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
          var mmatch;
          while ((mmatch = megaRegex.exec(html)) !== null) {
            info.episodes.push({
              id: mmatch[1],
              title: cleanText(mmatch[2]) || 'Servidor',
              server: detectServer(mmatch[1]),
              quality: detectQuality(cleanText(mmatch[2])),
              url: mmatch[1]
            });
          }
        }

        return info;
      }

      /* ============================================================
       * SERIE: temporadas y episodios
       * ============================================================ */
      var seasonsMatch = html.match(/<div[^>]*class="[^"]*seasons[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (!seasonsMatch) seasonsMatch = html.match(/<div[^>]*class="[^"]*season[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

      if (seasonsMatch) {
        var seasonBlock = seasonsMatch[1];
        /* Extraer enlaces de temporadas */
        var seasonRegex = /<h3[^>]*><a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/h3>/gi;
        var smatch;
        while ((smatch = seasonRegex.exec(seasonBlock)) !== null) {
          var seasonUrl = smatch[1];
          if (seasonUrl.indexOf('http') !== 0) seasonUrl = BASE + seasonUrl;

          /* Buscar episodios dentro de la temporada */
          var epRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
          var epmatch;
          while ((epmatch = epRegex.exec(seasonBlock)) !== null) {
            info.episodes.push({
              id: epmatch[1],
              title: cleanText(epmatch[2]) || ('Episodio ' + (info.episodes.length + 1)),
              season: 1,
              episode: info.episodes.length + 1,
              overview: '',
              still: ''
            });
          }

          break; /* Primera temporada por defecto */
        }
      }

      return info;
    }).catch(function () {
      return {
        id: id, title: 'Error', year: 0, runtime: 0, poster: '', backdrop: '',
        description: 'No se pudo cargar el contenido.', genres: [], type: 'movie',
        live: false, episodes: []
      };
    });
  }

  /* ================================================================
   * RESOLVE - Resolucion del enlace final de video
   * Soporta: Fembed, StreamTape, DoodStream, VoE, Mega, Drive, Streamz
   * ================================================================ */

  function resolve(id, episodeId) {
    var url = id || episodeId;
    var results = [];

    if (!url) return Promise.reject(new Error('URL no disponible'));

    /* --- Fembed: extraer streams m3u8/mp4 del config JSON --- */
    if (url.indexOf('fembed') !== -1) {
      return fetchHTML(url).then(function (html) {
        var vjsConfigMatch = html.match(/"urls"\s*:\s*\[([^\]]*)\]/);
        if (vjsConfigMatch) {
          var urlsStr = vjsConfigMatch[1];
          var directRegex = /"([^"]*(?:m3u8|mp4)[^"]*)"/gi;
          var dmatch;
          while ((dmatch = directRegex.exec(urlsStr)) !== null) {
            results.push({ url: dmatch[1], mime: 'application/x-mpegURL', live: false, label: 'Fembed' });
          }
        }

        /* Intentar con player config */
        if (results.length === 0) {
          var playerMatch = html.match(/"file"\s*:\s*"([^"]*(?:m3u8|mp4)[^"]*)"/);
          if (playerMatch) {
            results.push({ url: playerMatch[1], mime: 'application/x-mpegURL', live: false, label: 'Fembed' });
          }
        }

        /* Fallback: embed */
        if (results.length === 0) {
          results.push({ url: url, mime: 'text/html', live: false, label: 'Embed' });
        }

        return results;
      }).catch(function () {
        return [{ url: url, mime: 'text/html', live: false, label: 'Fembed' }];
      });
    }

    /* --- StreamTape: extraer enlace de video del boton --- */
    if (url.indexOf('streamtape') !== -1) {
      return fetchHTML(url).then(function (html) {
        var btnMatch = html.match(/id="boton[^"]*"[^>]*>([\s\S]*?)<\/center>/i);
        if (btnMatch) {
          var btnHtml = btnMatch[1];
          var videoUrlMatch = btnHtml.match(/href="([^"]*)"/);
          if (videoUrlMatch) {
            results.push({ url: videoUrlMatch[1], mime: 'video/mp4', live: false, label: 'StreamTape' });
          }
        }
        /* Fallback: script linkbtn */
        if (results.length === 0) {
          var scriptMatch = html.match(/document\.getElementById\('linkbtn'\)\.href\s*=\s*"([^"]*)"/);
          if (scriptMatch) {
            results.push({ url: scriptMatch[1], mime: 'video/mp4', live: false, label: 'StreamTape' });
          }
        }
        return results;
      }).catch(function () {
        return [{ url: url, mime: 'text/html', live: false, label: 'StreamTape' }];
      });
    }

    /* --- DoodStream: redirigir al iframe de reproduccion --- */
    if (url.indexOf('dood') !== -1) {
      var doodId = extractBetween(url, '/d/', '/');
      var doodUrl = 'https://dood.ws/d/' + doodId;
      return fetchHTML(doodUrl).then(function (html) {
        var jsMatch = html.match(/\/e\/([^"]*)/);
        if (jsMatch) {
          results.push({ url: 'https://dood.ws/e/' + jsMatch[1], mime: 'video/mp4', live: false, label: 'DoodStream' });
        } else {
          results.push({ url: url, mime: 'text/html', live: false, label: 'DoodStream' });
        }
        return results;
      }).catch(function () {
        return [{ url: url, mime: 'text/html', live: false, label: 'DoodStream' }];
      });
    }

    /* --- VoE (voe.sx / voe.network): extraer frame o enlace directo --- */
    if (url.indexOf('voe') !== -1 && url.indexOf('embed-') !== -1) {
      return fetchHTML(url).then(function (html) {
        var frameMatch = html.match(/<frame[^>]*src="([^"]*)"/);
        if (frameMatch) {
          results.push({ url: frameMatch[1], mime: 'application/x-mpegURL', live: false, label: 'VoE' });
        } else {
          var aMatch = html.match(/<a[^>]*href="([^"]*(?:m3u8|mp4)[^"]*)"[^>]*>/);
          if (aMatch) {
            results.push({ url: aMatch[1], mime: 'application/x-mpegURL', live: false, label: 'VoE' });
          } else {
            results.push({ url: url, mime: 'text/html', live: false, label: 'VoE' });
          }
        }
        return results;
      }).catch(function () {
        return [{ url: url, mime: 'text/html', live: false, label: 'VoE' }];
      });
    }

    /* --- Mega.nz: extraer clave del archivo --- */
    if (url.indexOf('mega.nz') !== -1) {
      var megaKey = extractBetween(url, '/file/', '#');
      if (!megaKey) megaKey = extractBetween(url, '/#/', '');
      results.push({ url: 'https://mega.nz/file/' + megaKey, mime: 'video/mp4', live: false, label: 'Mega' });
      return Promise.resolve(results);
    }

    /* --- Google Drive: extraer ID del archivo --- */
    if (url.indexOf('drive.google') !== -1) {
      var driveId = extractBetween(url, '/file/d/', '/');
      if (!driveId) driveId = extractBetween(url, 'id=', '&');
      results.push({ url: 'https://drive.google.com/uc?export=download&id=' + driveId, mime: 'video/mp4', live: false, label: 'Google Drive' });
      return Promise.resolve(results);
    }

    /* --- Streamz: extraer clave del video --- */
    if (url.indexOf('streamz') !== -1) {
      var streamzKey = extractBetween(url, '/v/', '?');
      results.push({ url: 'https://streamz.cc/v/' + streamzKey, mime: 'application/x-mpegURL', live: false, label: 'Streamz' });
      return Promise.resolve(results);
    }

    /* --- MP4Upload: extraer enlace del video del player --- */
    if (url.indexOf('mp4upload') !== -1) {
      return fetchHTML(url).then(function (html) {
        var videoMatch = html.match(/<video[^>]*src="([^"]*)"/i);
        if (videoMatch) {
          results.push({ url: videoMatch[1], mime: 'video/mp4', live: false, label: 'MP4Upload' });
        } else {
          var playBtn = html.match(/id="play-btn"[^>]*href="([^"]*)"/i);
          if (playBtn) {
            results.push({ url: playBtn[1], mime: 'video/mp4', live: false, label: 'MP4Upload' });
          }
        }
        return results;
      }).catch(function () {
        return [{ url: url, mime: 'text/html', live: false, label: 'MP4Upload' }];
      });
    }

    /* --- Enlace directo m3u8 o mp4 --- */
    if (url.indexOf('.m3u8') !== -1 || url.indexOf('.mp4') !== -1) {
      results.push({
        url: url,
        mime: url.indexOf('.m3u8') !== -1 ? 'application/x-mpegURL' : 'video/mp4',
        live: url.indexOf('.m3u8') !== -1,
        label: url.indexOf('.m3u8') !== -1 ? 'HLS' : 'MP4'
      });
      return Promise.resolve(results);
    }

    /* --- Fallback: devolver el enlace original --- */
    results.push({ url: url, mime: 'text/html', live: false, label: 'Default' });
    return Promise.resolve(results);
  }

  /* ================================================================
   * REGISTRO EN LATOVTV GLOBAL REGISTRY
   * ================================================================ */

  global.Registry.register({
    id: 'cinecalidad-provider',
    name: 'Cinecalidad (Storm-ext Converted)',
    description: 'Peliculas y series online en espanol latino - Migracion desde Storm-ext Android',
    language: 'es',
    tvTypes: ['Movie', 'TvSeries'],

    home: function () {
      return Promise.all([
        getCatalog(1, 'Movie'),
        getCatalog(1, 'TvSeries')
      ]).then(function (responses) {
        var movies = responses[0] || [];
        var series = responses[1] || [];

        return [
          { id: 'cinecalidad-movies', title: 'Peliculas Populares', items: movies },
          { id: 'cinecalidad-series', title: 'Series Populares', items: series }
        ];
      });
    },

    search: function (query) {
      return search(query);
    },

    details: function (id) {
      return details(id);
    },

    resolve: function (id, episodeId) {
      return resolve(id, episodeId);
    }
  });

})(window);
