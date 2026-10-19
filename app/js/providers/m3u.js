/* LatinoTV - proveedor de listas M3U / M3U8 (IPTV propia o canales libres) */
(function (global) {
  'use strict';

  var cache = {
    url: '',
    at: 0,
    data: null
  };

  var CACHE_MS = 5 * 60 * 1000;

  function cfg() {
    return Store.cfg('m3u');
  }

  function load() {
    var url = String(cfg().url || '').trim();
    if (!url) {
      return Promise.reject(new Error('Configura una URL de lista M3U'));
    }

    if (cache.url === url && cache.data && Date.now() - cache.at < CACHE_MS) {
      return Promise.resolve(cache.data);
    }

    return U.fetchText(url, { timeout: 20000 }).then(function (text) {
      var data = parse(text);
      cache = { url: url, at: Date.now(), data: data };
      return data;
    });
  }

  function parse(text) {
    var lines = String(text || '').split(/\r?\n/);
    var items = [];
    var groups = {};
    var groupOrder = [];
    var pending = null;

    lines.forEach(function (line) {
      line = line.trim();
      if (!line) return;

      if (line.indexOf('#EXTINF') === 0) {
        var info = line.substring(line.indexOf(':') + 1);
        var comma = info.lastIndexOf(',');
        var meta = comma !== -1 ? info.substring(0, comma) : '';
        var name = comma !== -1 ? info.substring(comma + 1).trim() : '';

        var attrs = {};
        meta.replace(/([A-Za-z0-9_-]+)="([^"]*)"/g, function (match, key, value) {
          attrs[key] = value;
          return match;
        });

        pending = {
          name: name || attrs['tvg-name'] || 'Sin título',
          logo: attrs['tvg-logo'] || '',
          group: attrs['group-title'] || 'Canales',
          tvgId: attrs['tvg-id'] || ''
        };
        return;
      }

      if (line.indexOf('#EXTGRP:') === 0) {
        if (pending) pending.group = line.substring(8).trim() || pending.group;
        return;
      }

      if (line.charAt(0) === '#') return;
      if (!pending) return;

      var item = {
        id: 'm3u_' + items.length,
        title: pending.name,
        poster: pending.logo,
        subtitle: pending.group,
        group: pending.group,
        type: 'live',
        url: line
      };

      items.push(item);
      if (!groups[item.group]) {
        groups[item.group] = [];
        groupOrder.push(item.group);
      }
      groups[item.group].push(item);
      pending = null;
    });

    return { items: items, groups: groups, groupOrder: groupOrder };
  }

  function find(id) {
    return load().then(function (data) {
      for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].id === id) return data.items[i];
      }
      throw new Error('Canal no encontrado');
    });
  }

  function toItem(channel) {
    return {
      id: channel.id,
      title: channel.title,
      poster: channel.poster,
      subtitle: channel.group,
      type: 'live'
    };
  }

  global.Registry.register({
    id: 'm3u',
    name: 'Lista M3U / IPTV',
    description: 'Reproduce una lista M3U o M3U8 propia. La URL debe permitir CORS y ser accesible desde el televisor.',

    home: function () {
      return load().then(function (data) {
        var rows = [];
        data.groupOrder.slice(0, 10).forEach(function (group) {
          var channels = data.groups[group].slice(0, 40);
          if (!channels.length) return;
          rows.push({
            id: 'm3u-' + group,
            title: group,
            items: channels.map(toItem)
          });
        });
        return rows;
      });
    },

    search: function (queryText) {
      var q = String(queryText || '').toLowerCase();
      return load().then(function (data) {
        return data.items
          .filter(function (channel) {
            return channel.title.toLowerCase().indexOf(q) !== -1 ||
              String(channel.group).toLowerCase().indexOf(q) !== -1;
          })
          .slice(0, 60)
          .map(toItem);
      });
    },

    details: function (id) {
      return find(id).then(function (channel) {
        return {
          id: channel.id,
          title: channel.title,
          year: '',
          runtime: 0,
          poster: channel.poster,
          backdrop: channel.poster,
          description: 'Canal en vivo del grupo «' + channel.group + '».',
          genres: ['En vivo', channel.group],
          type: 'live',
          live: true,
          episodes: []
        };
      });
    },

    resolve: function (id) {
      return find(id).then(function (channel) {
        return [{
          url: channel.url,
          mime: /\.m3u8(\?|$)/i.test(channel.url) ? 'application/x-mpegURL' : '',
          live: true,
          label: 'En vivo'
        }];
      });
    }
  });
})(window);
