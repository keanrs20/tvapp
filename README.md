# LatinoTV

Catálogo y reproductor de video para **Samsung TV (Tizen)** empaquetado como **módulo de aplicación para [TizenBrew](https://github.com/reisxd/TizenBrew)**.

La app funciona como CloudStream: tiene pantalla de inicio con catálogos, búsqueda, ficha de detalle, temporadas/episodios y un reproductor con control remoto. La diferencia es que **los contenidos vienen de proveedores que tú configures** (tu servidor Jellyfin, tu lista M3U/IPTV o una URL directa), más un proveedor de demostración con cine libre.

---

## Aviso importante

Esta app **no incluye, aloja ni enlaza contenido protegido**. Es una interfaz genérica que reproduce las fuentes que tú agregues.

- El proveedor **Cine libre** usa cortometrajes de Blender Foundation con licencia *Creative Commons*.
- Agrega únicamente fuentes de las que tengas derechos, o que tengan licencia abierta o sean de dominio público.
- Los repositorios de extensiones de terceros que apuntan a sitios de streaming no autorizados (Cuevana, Pelisplus, Cinecalidad, AnimeFLV, etc.) quedan fuera del alcance de este proyecto.

---

## Requisitos

- Samsung TV con Tizen **4.0 o superior** (2018+). Se usa `async/await`, `fetch` y `Promise.all`, disponibles desde Chromium 55.
- [TizenBrew](https://github.com/reisxd/TizenBrew) instalado en el televisor.
- Opcional: un servidor **Jellyfin** propio, o una lista **M3U/M3U8** accesible con CORS.

---

## Estructura

```
package.json                 # manifiesto del módulo TizenBrew (packageType: "app")
app/
  index.html
  css/style.css
  js/
    util.js                  # helpers (esc, fetch con timeout, toast…)
    store.js                 # ajustes y progreso en localStorage
    providers.js             # registro de proveedores
    providers/demo.js        # cine libre (Creative Commons)
    providers/jellyfin.js    # servidor Jellyfin propio
    providers/m3u.js         # listas M3U / IPTV
    spatial.js               # navegación con control remoto
    player.js                # reproductor HTML5 + hls.js
    app.js                   # pantallas y navegación
  vendor/hls.min.js          # hls.js (incluido para no depender de CDN)
  samples/lista-demo.m3u     # lista de ejemplo para probar el proveedor M3U
```

---

## Instalar en TizenBrew

1. Publica este repositorio en GitHub (el `package.json` debe quedar en la raíz).
2. En el televisor abre **TizenBrew** y agrega un módulo con el nombre `tu-usuario/tu-repo`.
3. Inicia **LatinoTV** desde TizenBrew.

> Para desarrollo local puedes probar la app en cualquier navegador con:
> ```bash
> npx http-server app -p 8099 -c-1
> ```
> y abrir `http://localhost:8099`.

---

## Uso con el control remoto

| Tecla | Acción |
| --- | --- |
| Flechas | Navegar por tarjetas, botones y campos |
| OK / Enter | Seleccionar |
| Atrás / Return | Volver / salir del reproductor |
| Reproducir / Pausa | Pausar o reanudar en el reproductor |
| ⏪ / ⏩ | Retroceder o avanzar 30 s |
| ◀ / ▶ | Retroceder o avanzar 10 s |
| Stop | Salir del reproductor |

En el reproductor, la barra de controles se oculta sola a los 4 segundos.

---

## Proveedores incluidos

### 1. Cine libre (demostración)

Activo por defecto. Muestra cortometrajes de Blender Foundation (Creative Commons) y una transmisión HLS de prueba. Sirve para comprobar que todo funciona sin configurar nada.

### 2. Jellyfin

1. En **Ajustes → Jellyfin** escribe la dirección del servidor, por ejemplo `http://192.168.1.10:8096`.
2. Pega una **API Key** (Jellyfin: *Panel de control → API Keys*).
3. Opcional: nombre o ID de usuario. Si lo dejas vacío se usa el primer usuario.
4. Pulsa **Guardar**: el proveedor se activa solo.

Notas:
- El televisor debe poder alcanzar la IP del servidor.
- Jellyfin debe permitir CORS desde el origen de TizenBrew.
- La reproducción se hace con *direct play* (`/Videos/{id}/stream?static=true`). Si tu archivo usa un códec que la TV no soporta, no se transcodificará.

### 3. Lista M3U / IPTV

1. En **Ajustes → Lista M3U / IPTV** pega la URL de tu lista `.m3u` o `.m3u8`.
2. Pulsa **Guardar**.

La lista se agrupa por `group-title` (o `#EXTGRP`). Para probar, usa la lista incluida:
`http://<ip-de-tu-pc>:8099/samples/lista-demo.m3u`

### 4. URL directa (en Ajustes)

Escribe una URL `MP4` o `M3U8` y pulsa **Reproducir** para probar el reproductor.

---

## Agregar tu propio proveedor

Un proveedor es un objeto con cuatro métodos. Crea un archivo en `app/js/providers/` y cárgalo en `app/index.html` después de `providers.js`:

```html
<script src="js/providers/mi-proveedor.js"></script>
```

```js
(function (global) {
  'use strict';

  var CATALOGO = [
    { id: 'ep1', title: 'Mi video', year: 2024, poster: 'https://.../poster.jpg',
      url: 'https://.../video.mp4', description: 'Descripción.' }
  ];

  function toItem(video) {
    return { id: video.id, title: video.title, poster: video.poster, year: video.year, type: 'movie' };
  }

  global.Registry.register({
    id: 'miproveedor',
    name: 'Mi proveedor',
    description: 'Fuente propia con contenido autorizado.',

    // Filas del inicio. Devuelve [{ title, items }]
    home: function () {
      return Promise.resolve([{ title: 'Mi catálogo', items: CATALOGO.map(toItem) }]);
    },

    // Resultados de búsqueda
    search: function (query) {
      var q = String(query || '').toLowerCase();
      return Promise.resolve(CATALOGO.filter(function (v) {
        return v.title.toLowerCase().indexOf(q) !== -1;
      }).map(toItem));
    },

    // Ficha de detalle
    details: function (id) {
      var video = CATALOGO.filter(function (v) { return v.id === id; })[0];
      if (!video) return Promise.reject(new Error('No encontrado'));
      return Promise.resolve({
        id: video.id,
        title: video.title,
        year: video.year,
        runtime: 0,
        poster: video.poster,
        backdrop: video.poster,
        description: video.description,
        genres: [],
        type: 'movie',
        live: false,
        episodes: [] // [{ id, title, season, episode, overview }]
      });
    },

    // Fuente reproducible
    resolve: function (id) {
      var video = CATALOGO.filter(function (v) { return v.id === id; })[0];
      return Promise.resolve([{ url: video.url, mime: 'video/mp4', live: false }]);
    }
  });
})(window);
```

El proveedor se puede activar/desactivar desde **Ajustes**. Si necesitas campos de configuración, agrega un caso en `fieldsFor()` y `saveProvider()` dentro de `app/js/app.js` (como se hizo con Jellyfin y M3U).

---

## Notas técnicas

- **Reproducción:** `<video>` HTML5; para `.m3u8` se usa `hls.js` cuando el navegador no soporta HLS de forma nativa. Si TizenBrew/la TV soporta HLS nativo, se usa directamente.
- **Progreso:** se guarda en `localStorage` y alimenta la fila «Continuar viendo».
- **CORS:** las APIs y listas que configures deben permitir el origen desde el que TizenBrew sirve el módulo. Si un proveedor falla, el inicio muestra un aviso en lugar de romperse.
- **Compatibilidad:** se evitan `flex gap`, `aspect-ratio`, `Promise.allSettled` y `AbortController` para funcionar en motores WebKit/Chromium antiguos de Tizen.

---

## Licencia

MIT. Ver `LICENSE`.
