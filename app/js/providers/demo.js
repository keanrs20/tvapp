/* LatinoTV - proveedor de demostración con cine libre (Creative Commons) */
(function (global) {
  'use strict';

  var FILMS = [
    {
      id: 'big-buck-bunny',
      title: 'Big Buck Bunny',
      year: 2008,
      runtime: 596,
      poster: 'https://archive.org/services/img/BigBuckBunny_124',
      url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
      description: 'Cortometraje animado de Blender Foundation. Un conejo bonachón se enfrenta a tres roedores abusivos. Licencia Creative Commons BY 3.0.'
    },
    {
      id: 'elephants-dream',
      title: 'Elephants Dream',
      year: 2006,
      runtime: 653,
      poster: 'https://archive.org/services/img/ElephantsDream',
      url: 'https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4',
      description: 'Primer cortometraje abierto de Blender Foundation. Dos personajes exploran una máquina gigante y surrealista. Licencia Creative Commons BY 2.5.'
    },
    {
      id: 'sintel',
      title: 'Sintel',
      year: 2010,
      runtime: 888,
      poster: 'https://archive.org/services/img/Sintel',
      url: 'https://archive.org/download/Sintel/sintel-2048-surround.mp4',
      description: 'Una joven busca a su dragón perdido en un mundo hostil. Cortometraje de Blender Foundation, licencia Creative Commons BY 3.0.'
    }
  ];

  var SERIES = {
    id: 'serie-demo',
    title: 'Serie de prueba (2 temporadas)',
    year: 2024,
    poster: 'https://archive.org/services/img/Sintel',
    description: 'Serie de ejemplo para probar temporadas, episodios, progreso y reproducción automática del siguiente episodio. Usa cortometrajes Creative Commons como episodios.',
    genres: ['Pruebas', 'Cine libre'],
    episodes: [
      {
        id: 'serie-demo-s1e1',
        season: 1,
        episode: 1,
        title: 'El comienzo',
        overview: 'Primer episodio de prueba.',
        url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4'
      },
      {
        id: 'serie-demo-s1e2',
        season: 1,
        episode: 2,
        title: 'El viaje',
        overview: 'Segundo episodio de prueba.',
        url: 'https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4'
      },
      {
        id: 'serie-demo-s1e3',
        season: 1,
        episode: 3,
        title: 'La búsqueda',
        overview: 'Tercer episodio de prueba.',
        url: 'https://archive.org/download/Sintel/sintel-2048-surround.mp4'
      },
      {
        id: 'serie-demo-s2e1',
        season: 2,
        episode: 1,
        title: 'Nuevo rumbo',
        overview: 'Primer episodio de la segunda temporada.',
        url: 'https://archive.org/download/Sintel/sintel-2048-surround.mp4'
      },
      {
        id: 'serie-demo-s2e2',
        season: 2,
        episode: 2,
        title: 'Reencuentro',
        overview: 'Segundo episodio de la segunda temporada.',
        url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4'
      }
    ].map(function (episode) {
      episode.poster = 'https://archive.org/services/img/BigBuckBunny_124';
      episode.still = 'https://archive.org/services/img/BigBuckBunny_124';
      return episode;
    })
  };

  var HLS_ITEM = {
    id: 'hls-demo',
    title: 'Prueba de streaming HLS',
    year: 2024,
    runtime: 0,
    poster: 'https://archive.org/services/img/BigBuckBunny_124',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    description: 'Transmisión HLS de prueba (Big Buck Bunny) para comprobar el reproductor y hls.js en tu televisor.'
  };

  function find(id) {
    if (id === HLS_ITEM.id) return HLS_ITEM;
    if (id === SERIES.id) return SERIES;
    for (var i = 0; i < FILMS.length; i++) {
      if (FILMS[i].id === id) return FILMS[i];
    }
    return null;
  }

  function findEpisode(episodeId) {
    for (var i = 0; i < SERIES.episodes.length; i++) {
      if (SERIES.episodes[i].id === episodeId) return SERIES.episodes[i];
    }
    return null;
  }

  function toItem(film) {
    return {
      id: film.id,
      title: film.title,
      poster: film.poster,
      year: film.year,
      subtitle: film.episodes ? film.episodes.length + ' episodios' : '',
      type: film.episodes ? 'series' : 'movie'
    };
  }

  global.Registry.register({
    id: 'demo',
    name: 'Cine libre',
    description: 'Cortometrajes de Blender Foundation con licencia Creative Commons y una serie de prueba. Sirve para probar la app sin configurar nada.',

    home: function () {
      return Promise.resolve([
        {
          id: 'cc-films',
          title: 'Cine libre (Creative Commons)',
          items: FILMS.map(toItem)
        },
        {
          id: 'series-test',
          title: 'Series de prueba',
          items: [toItem(SERIES)]
        },
        {
          id: 'hls-test',
          title: 'Prueba de streaming HLS',
          items: [toItem(HLS_ITEM)]
        }
      ]);
    },

    search: function (query) {
      var q = String(query || '').toLowerCase();
      var items = FILMS.concat([SERIES, HLS_ITEM]).filter(function (film) {
        return film.title.toLowerCase().indexOf(q) !== -1;
      });
      return Promise.resolve(items.map(toItem));
    },

    details: function (id) {
      var film = find(id);
      if (!film) return Promise.reject(new Error('Contenido no encontrado'));

      var isSeries = !!(film.episodes && film.episodes.length);

      return Promise.resolve({
        id: film.id,
        title: film.title,
        year: film.year,
        runtime: film.runtime || 0,
        poster: film.poster,
        backdrop: film.poster,
        description: film.description,
        genres: film.genres || ['Animación', 'Cine libre'],
        type: isSeries ? 'series' : 'movie',
        live: id === HLS_ITEM.id,
        episodes: isSeries
          ? film.episodes.map(function (episode) {
              return {
                id: episode.id,
                title: episode.title,
                season: episode.season,
                episode: episode.episode,
                overview: episode.overview,
                still: episode.still
              };
            })
          : []
      });
    },

    resolve: function (id, episodeId) {
      var film = find(id);
      if (!film) return Promise.reject(new Error('Contenido no encontrado'));

      var url = film.url;

      if (film.episodes && film.episodes.length) {
        var episode = episodeId ? findEpisode(episodeId) : film.episodes[0];
        if (!episode) return Promise.reject(new Error('Episodio no encontrado'));
        url = episode.url;
      }

      var isHls = /\.m3u8(\?|$)/i.test(url);
      return Promise.resolve([
        {
          url: url,
          mime: isHls ? 'application/x-mpegURL' : 'video/mp4',
          live: isHls,
          label: isHls ? 'HLS' : 'MP4'
        }
      ]);
    }
  });
})(window);

