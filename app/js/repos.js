/* LatinoTV - repositorios externos (repo.json)
 *
 * Un repositorio es un archivo JSON con este formato:
 *
 *   {
 *     "name": "Mi repositorio",
 *     "description": "Lo que quieras",
 *     "iconUrl": "https://...",
 *     "manifestVersion": 1,
 *     "pluginLists": ["https://.../plugins.json"],
 *     "plugins": [ { ...proveedor en linea... } ]
 *   }
 *
 * Y cada entrada de plugins.json puede ser:
 *
 *   A) Un proveedor en JavaScript:
 *      { "name": "...", "scriptUrl": "https://.../mi-proveedor.js" }
 *      El script debe llamar a Registry.register({ ... })
 *
 *   B) Un catalogo de datos (sin programa):
 *      { "name": "...", "catalogUrl": "https://.../catalogo.json" }
 *      Formato del catalogo:
 *      {
 *        "sections": [
 *          { "title": "Peliculas", "items": [
 *            { "id": "1", "title": "...", "poster": "https://...",
 *              "year": 2020, "description": "...", "url": "https://.../video.mp4",
 *              "type": "movie", "episodes": [ { "id": "1x1", "title": "...",
 *              "season": 1, "episode": 1, "url": "..." } ] }
 *          ] }
 *        ]
 *      }
 *
 * Nota: los plugins .cs3 de CloudStream son codigo Android y NO pueden
 * ejecutarse en Tizen. Aqui se usan proveedores en JavaScript o catalogos JSON.
 */
(function (global) {
  'use strict';

  var CACHE_MS = 5 * 60 * 1000;

  var loadedScripts = {};
  var manifests = {};
  var knownRepos = [];

  function fetchJSON(url) {
    return U.fetchJSON(url, { timeout: 10000 });
  }

  /* Acepta enlaces tipo cloudstreamrepo:// y rutas relativas. */
  function normalizeUrl(url) {
    var value = String(url || '').trim();
    value = value.replace(/^cloudstreamrepo:\/\//i, 'https://');
    value = value.replace(/^csrepo:\/\//i, 'https://');
    return value;
  }

  function absolute(base, ref) {
    if (!ref) return ref;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) return ref;
    try {
      return new URL(ref, base).href;
    } catch (error) {
      return ref;
    }
  }

  /* Los plugins de CloudStream son .cs3 (codigo Android): no se pueden usar. */
  function isCloudStreamPlugin(plugin) {
    if (!plugin) return true;
    if (/\.cs3(\?|#|$)/i.test(plugin.url || '')) return true;
    if (plugin.apiVersion != null) return true;
    return !plugin.scriptUrl && !plugin.catalogUrl && !Array.isArray(plugin.plugins);
  }

  function slug(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'plugin';
  }

  function pluginId(repo, plugin, index) {
    var base = plugin.internalName || plugin.id || plugin.name || ('plugin' + (index || 0));
    return 'repo:' + slug(repo.url.replace(/^https?:\/\//, '').split('/')[0]) + ':' + slug(base);
  }

  function getPlugins(repo, force) {
    var cached = manifests[repo.url];
    if (cached && !force && (Date.now() - cached.at) < CACHE_MS) {
      return Promise.resolve(cached);
    }

    return fetchJSON(repo.url).then(function (manifest) {
      repo.manifest = manifest;
      if (manifest.name) {
        repo.name = manifest.name;
        if (Store.save) Store.save();
      }

      var jobs = [];
      if (Array.isArray(manifest.plugins)) {
        jobs.push(Promise.resolve({ base: repo.url, list: manifest.plugins }));
      }
      (manifest.pluginLists || []).forEach(function (ref) {
        var url = absolute(repo.url, ref);
        jobs.push(
          fetchJSON(url)
            .then(function (list) {
              return { base: url, list: Array.isArray(list) ? list : [] };
            })
            .catch(function () {
              return { base: url, list: [] };
            })
        );
      });

      return Promise.all(jobs).then(function (groups) {
        var usable = [];
        var skipped = 0;

        groups.forEach(function (group) {
          (group.list || []).forEach(function (plugin) {
            if (!plugin) return;
            if (isCloudStreamPlugin(plugin)) {
              skipped++;
              return;
            }
            var copy = Object.assign({}, plugin);
            copy.scriptUrl = absolute(group.base, plugin.scriptUrl);
            copy.catalogUrl = absolute(group.base, plugin.catalogUrl);
            usable.push(copy);
          });
        });

        var cachedResult = { at: Date.now(), plugins: usable, skipped: skipped };
        manifests[repo.url] = cachedResult;
        return cachedResult;
      });
    });
  }

  function loadScript(url) {
    if (loadedScripts[url]) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.async = true;
      var timedOut = false;
      /* Timeout de 8 segundos para evitar que la app se quede colgada */
      var timer = setTimeout(function () {
        timedOut = true;
        if (document.head.contains(script)) document.head.removeChild(script);
        reject(new Error('Timeout cargando ' + url));
      }, 8000);
      script.onload = function () {
        clearTimeout(timer);
        loadedScripts[url] = true;
        resolve();
      };
      script.onerror = function () {
        clearTimeout(timer);
        reject(new Error('No se pudo cargar ' + url));
      };
      document.head.appendChild(script);
    });
  }

  function typeLabel(type) {
    if (type === 'series') return 'Serie';
    if (type === 'live') return 'En vivo';
    if (type === 'anime') return 'Anime';
    return '';
  }

  /* Catalogo de datos: se comporta como cualquier otro proveedor. */
  function catalogProvider(id, repo, plugin) {
    var cache = null;
    var name = plugin.name || (repo.manifest && repo.manifest.name) || 'Repositorio';

    function load() {
      if (cache) return Promise.resolve(cache);
      return fetchJSON(plugin.catalogUrl).then(function (data) {
        cache = data;
        return data;
      });
    }

    function allItems() {
      return load().then(function (data) {
        var items = [];
        (data.sections || []).forEach(function (section) {
          (section.items || []).forEach(function (item) { items.push(item); });
        });
        return { data: data, items: items };
      });
    }

    function findItem(itemId) {
      return allItems().then(function (result) {
        var found = null;
        result.items.forEach(function (item) {
          if (String(item.id) === String(itemId)) found = item;
        });
        if (!found) throw new Error('Contenido no encontrado');
        return found;
      });
    }

    function toCard(item) {
      return {
        id: item.id,
        title: item.title,
        poster: item.poster,
        year: item.year,
        subtitle: item.subtitle || typeLabel(item.type),
        type: item.type || 'movie'
      };
    }

    function detailsFrom(item) {
      var episodes = (item.episodes || []).map(function (ep, index) {
        return {
          id: ep.id || (item.id + ':e' + index),
          title: ep.title || ('Episodio ' + (index + 1)),
          season: ep.season || 1,
          episode: ep.episode || (index + 1),
          overview: ep.overview || '',
          still: ep.still || ''
        };
      });

      return {
        id: item.id,
        title: item.title,
        year: item.year,
        runtime: item.runtime || 0,
        poster: item.poster,
        backdrop: item.backdrop || item.poster,
        description: item.description || '',
        genres: item.genres || [],
        type: item.type || 'movie',
        live: item.type === 'live',
        episodes: episodes
      };
    }

    function sourceFor(item, episodeId) {
      if (episodeId && item.episodes && item.episodes.length) {
        for (var i = 0; i < item.episodes.length; i++) {
          var ep = item.episodes[i];
          var epId = ep.id || (item.id + ':e' + i);
          if (String(epId) === String(episodeId)) return ep;
        }
      }
      return item;
    }

    return {
      id: id,
      name: name,
      description: plugin.description || (repo.manifest && repo.manifest.description) || 'Repositorio externo',
      iconUrl: plugin.iconUrl || (repo.manifest && repo.manifest.iconUrl),
      language: plugin.language || 'es',
      tvTypes: plugin.tvTypes || ['Movie', 'TvSeries'],
      sourceRepo: repo.url,
      home: function () {
        return load().then(function (data) {
          return (data.sections || []).map(function (section, index) {
            return {
              id: section.id || ('s' + index),
              title: section.title || ('Sección ' + (index + 1)),
              items: (section.items || []).map(toCard)
            };
          });
        });
      },
      search: function (query) {
        var needle = String(query || '').toLowerCase();
        return allItems().then(function (result) {
          return result.items
            .filter(function (item) {
              return String(item.title || '').toLowerCase().indexOf(needle) !== -1;
            })
            .map(toCard);
        });
      },
      details: function (itemId) {
        return findItem(itemId).then(detailsFrom);
      },
      resolve: function (itemId, episodeId) {
        return findItem(itemId).then(function (item) {
          var source = sourceFor(item, episodeId);
          if (!source.url) throw new Error('Sin fuente de video');
          return [{
            url: source.url,
            mime: source.mime || (/\.m3u8(\?|#|$)/i.test(source.url) ? 'application/x-mpegURL' : ''),
            live: !!source.live
          }];
        });
      }
    };
  }

  function syncRepo(repo, force) {
    return getPlugins(repo, force).then(function (result) {
      var plugins = result.plugins || [];
      repo.skipped = result.skipped || 0;
      repo.error = null;

      if (repo.skipped) {
        repo.warning = repo.skipped + ' plugin(s) de CloudStream (.cs3) ignorados: son código Android y no pueden ejecutarse en Tizen.';
      } else if (!plugins.length) {
        repo.warning = 'Este repositorio no trae proveedores compatibles. Debe usar scriptUrl (JavaScript) o catalogUrl (JSON).';
      } else {
        repo.warning = '';
      }

      var jobs = plugins.map(function (plugin, index) {
        var id = pluginId(repo, plugin, index);

        if (plugin.catalogUrl) {
          if (!Registry.get(id)) Registry.register(catalogProvider(id, repo, plugin));
          return Promise.resolve();
        }

        if (plugin.scriptUrl) {
          var before = Registry.all().map(function (provider) { return provider.id; });
          return loadScript(plugin.scriptUrl).then(function () {
            Registry.all().forEach(function (provider) {
              if (before.indexOf(provider.id) === -1 && !provider.sourceRepo) {
                provider.sourceRepo = repo.url;
              }
            });
          });
        }

        return Promise.resolve();
      });

      return Promise.all(jobs);
    });
  }

  function forget(repoUrl) {
    var cached = manifests[repoUrl];
    if (cached) {
      (cached.plugins || []).forEach(function (plugin) {
        if (plugin.scriptUrl) delete loadedScripts[plugin.scriptUrl];
      });
    }
    delete manifests[repoUrl];
    Registry.removeBySource(repoUrl);
    knownRepos = knownRepos.filter(function (url) { return url !== repoUrl; });
  }

  function sync(force) {
    var repos = Store.repos();
    var enabledUrls = {};

    var jobs = repos.map(function (repo) {
      if (!repo.url) return Promise.resolve();
      if (repo.enabled === false) {
        repo.error = null;
        Registry.removeBySource(repo.url);
        return Promise.resolve();
      }
      enabledUrls[repo.url] = true;
      if (knownRepos.indexOf(repo.url) === -1) knownRepos.push(repo.url);
      return syncRepo(repo, force).catch(function (error) {
        repo.error = (error && error.message) || 'Error';
        console.warn('[LatinoTV] repo ' + repo.url + ': ' + repo.error);
      });
    });

    knownRepos.forEach(function (url) {
      if (!enabledUrls[url]) Registry.removeBySource(url);
    });

    return Promise.all(jobs);
  }

  global.Repos = {
    sync: sync,
    forget: forget,
    normalizeUrl: normalizeUrl,
    catalogProvider: catalogProvider,
    loadedScripts: loadedScripts
  };
})(window);
