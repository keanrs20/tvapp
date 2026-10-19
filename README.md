# LatinoTV

Catálogo y reproductor de video para **Samsung TV (Tizen)** empaquetado como **módulo de aplicación para [TizenBrew](https://github.com/reisxd/TizenBrew)**.

La app funciona como CloudStream: inicio con catálogos, búsqueda, ficha de detalle, temporadas/episodios, perfiles, repositorios externos y subtítulos de OpenSubtitles. La diferencia es que **los contenidos vienen de proveedores que tú configures** (tu servidor Jellyfin, tu lista M3U/IPTV, tus repositorios o URLs directas), más un proveedor de demostración con cine libre.

---

## Aviso importante

Esta app **no incluye, aloja ni enlaza contenido protegido**. Es una interfaz genérica que reproduce las fuentes que tú agregues.

- El proveedor **Cine libre** usa cortometrajes de Blender Foundation con licencia *Creative Commons*.
- El proveedor **Cine clásico (dominio público)** trae películas de dominio público
  desde [Internet Archive](https://archive.org) (colección *feature_films*), con una
  fila en español incluida; funciona igual que un proveedor de CloudStream pero con
  contenido legal (port del plugin *InternetArchiveProvider* de `recloudstream/extensions`).
- Agrega únicamente fuentes de las que tengas derechos, o que tengan licencia abierta o sean de dominio público.
- Los repositorios de extensiones de terceros que apuntan a sitios de streaming no autorizados (Cuevana, Pelisplus, Cinecalidad, AnimeFLV, etc.) quedan fuera del alcance de este proyecto.
- Los subtítulos se buscan en la API pública de **OpenSubtitles**; respeta sus términos de uso.

---

## Requisitos

- Samsung TV con Tizen **4.0 o superior** (2018+).
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
    store.js                 # perfiles, repos, ajustes y progreso en localStorage
    providers.js             # registro de proveedores

    providers/demo.js        # cine libre + serie de prueba con episodios
    providers/archive.js     # cine de dominio público (Internet Archive)
    providers/jellyfin.js    # servidor Jellyfin propio
    providers/m3u.js         # listas M3U / IPTV
    repos.js                 # carga de repo.json externos (proveedores JS y catálogos)
    subtitles.js             # OpenSubtitles + SRT → VTT
    spatial.js               # navegación con control remoto
    player.js                # reproductor HTML5 + hls.js + subtítulos + siguiente episodio
    app.js                   # pantallas y navegación
  vendor/hls.min.js          # hls.js (incluido, sin CDN)
  vendor/pako.min.js         # descompresión gzip para subtítulos (MIT)
  samples/
    lista-demo.m3u           # lista de ejemplo para el proveedor M3U
    repo.json                # repositorio de ejemplo
    plugins.json             # lista de plugins del repositorio de ejemplo
    catalogo-demo.json       # catálogo de datos de ejemplo
    mi-proveedor.js          # proveedor JavaScript de ejemplo
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
| Reproducir / Pausa | Pausar o reanudar |
| ⏪ / ⏩ | Retroceder o avanzar 30 s |
| ◀ / ▶ | Retroceder o avanzar 10 s |
| **Verde** | Buscar subtítulos (dentro del reproductor) |
| Stop | Salir del reproductor |

En el reproductor, la barra de controles se oculta sola a los 4 segundos. Al terminar un episodio aparece una cuenta atrás de 8 segundos y se reproduce el siguiente automáticamente (OK lo adelanta, Atrás lo cancela).

---

## Perfiles

Cada perfil guarda su propio:

- historial y progreso («Continuar viendo», episodios vistos),
- proveedores activados/desactivados,
- subtítulos elegidos por contenido.

Los datos de servidor (Jellyfin, URL de M3U) y los repositorios se comparten en el televisor.

Abre el botón con tu nombre (arriba a la derecha) o ve a **Ajustes → Perfiles** para crear, renombrar, cambiar o eliminar perfiles.

---

## Proveedores incluidos

### 1. Cine libre (demostración)

Activo por defecto. Muestra cortometrajes de Blender Foundation (Creative Commons), una **serie de prueba de 2 temporadas** y una transmisión HLS de prueba. Sirve para comprobar series, episodios y subtítulos sin configurar nada.

### 2. Jellyfin

1. En **Ajustes → Jellyfin** escribe la dirección del servidor, por ejemplo `http://192.168.1.10:8096`.
2. Pega una **API Key** (Jellyfin: *Panel de control → API Keys*).
3. Opcional: nombre o ID de usuario. Si lo dejas vacío se usa el primer usuario.
4. Pulsa **Guardar**: el proveedor se activa solo.

Notas:
- El televisor debe poder alcanzar la IP del servidor.
- Jellyfin debe permitir CORS desde el origen de TizenBrew.
- La reproducción se hace con *direct play*. Si tu archivo usa un códec que la TV no soporta, no se transcodificará.

### 3. Lista M3U / IPTV

1. En **Ajustes → Lista M3U / IPTV** pega la URL de tu lista `.m3u` o `.m3u8`.
2. Pulsa **Guardar**.

La lista se agrupa por `group-title` (o `#EXTGRP`). Para probar, usa la lista incluida:
`http://<ip-de-tu-pc>:8099/samples/lista-demo.m3u`

### 4. URL directa (en Ajustes)

Escribe una URL `MP4` o `M3U8` y pulsa **Reproducir**. También puedes indicar la URL de un subtítulo `.srt` o `.vtt` para probarlo.

---

## Repositorios (tu propio repo.json)

En **Ajustes → Repositorios** pega la URL de tu `repo.json` y pulsa **Añadir**. La app lo descarga y registra los proveedores que contenga. El **contenido aparece como filas nuevas en la pantalla de Inicio** (no dentro de Ajustes). Puedes desactivar, actualizar o quitar el repositorio cuando quieras.

También acepta enlaces del tipo `cloudstreamrepo://raw.githubusercontent.com/usuario/repo/builds/repo.json` (se convierten automáticamente a `https://`).

> **Importante:** los repositorios de CloudStream contienen plugins `.cs3`, que son código **Android** compilado y **no pueden ejecutarse en un televisor Tizen**. Si añades uno, LatinoTV lo detecta y te avisa en Ajustes («N plugin(s) de CloudStream (.cs3) ignorados»), pero no cargará nada. LatinoTV usa proveedores **JavaScript** (`scriptUrl`) o **catálogos JSON** (`catalogUrl`) con un formato parecido a CloudStream, para que te resulte familiar.

Las rutas relativas dentro de `repo.json` y `plugins.json` se resuelven **contra la URL del propio archivo**, así que puedes usar `"pluginLists": ["plugins.json"]` y `"catalogUrl": "catalogo.json"` si están en la misma carpeta.

### Formato de `repo.json`

```json
{
  "name": "Mi repositorio",
  "description": "Opcional",
  "iconUrl": "https://.../icono.png",
  "manifestVersion": 1,
  "pluginLists": ["https://.../plugins.json"],
  "plugins": []
}
```

`pluginLists` es una lista de archivos `plugins.json`. También puedes poner plugins directamente en `plugins`.

### Formato de `plugins.json`

```json
[
  {
    "name": "Mi catálogo",
    "description": "Peliculas y series",
    "language": "es",
    "tvTypes": ["Movie", "TvSeries"],
    "catalogUrl": "https://.../catalogo.json"
  },
  {
    "name": "Mi proveedor JS",
    "scriptUrl": "https://.../mi-proveedor.js"
  }
]
```

### Catálogo de datos (`catalogUrl`)

```json
{
  "sections": [
    {
      "title": "Películas",
      "items": [
        {
          "id": "peli-1",
          "title": "Mi película",
          "year": 2024,
          "poster": "https://.../poster.jpg",
          "type": "movie",
          "description": "Sinopsis",
          "url": "https://.../video.mp4"
        }
      ]
    },
    {
      "title": "Series",
      "items": [
        {
          "id": "serie-1",
          "title": "Mi serie",
          "poster": "https://.../poster.jpg",
          "type": "series",
          "episodes": [
            { "id": "s1e1", "title": "Piloto", "season": 1, "episode": 1,
              "overview": "Sinopsis", "still": "https://.../still.jpg",
              "url": "https://.../s1e1.mp4" }
          ]
        }
      ]
    }
  ]
}
```

### Proveedor JavaScript (`scriptUrl`)

El script se carga con `<script>` y debe llamar a `Registry.register({...})`:

```js
(function (global) {
  global.Registry.register({
    id: 'mi-proveedor',              // único
    name: 'Mi proveedor',
    description: 'Fuente propia',
    home: function () {              // Promise<[{ title, items }]>
      return Promise.resolve([{ title: 'Mi fila', items: [] }]);
    },
    search: function (query) { return Promise.resolve([]); },
    details: function (id) { return Promise.resolve({ /* detalle */ }); },
    resolve: function (id, episodeId) {
      return Promise.resolve([{ url: 'https://.../video.mp4', mime: 'video/mp4' }]);
    }
  });
})(window);
```

Contrato del ítem: `{ id, title, poster, year, subtitle, type }`.
Contrato del detalle: `{ id, title, year, runtime, poster, backdrop, description, genres, type, live, episodes: [{ id, title, season, episode, overview, still }] }`.
Contrato del stream: `{ url, mime, live, label }`.

Puedes probar todo con los archivos de `app/samples/`:

```
http://<ip-de-tu-pc>:8099/samples/repo.json
```

---

## Subtítulos (OpenSubtitles)

Durante la reproducción pulsa el **botón verde**:

1. Se buscan subtítulos para el título (y temporada/episodio si es una serie).
2. Elige un resultado con OK.
3. Se descarga, se descomprime (gzip), se convierte de SRT a VTT y se muestra.

En **Ajustes → Subtítulos** puedes elegir uno o varios idiomas (español, inglés, portugués, etc.) y activar la búsqueda automática. La app recuerda el subtítulo elegido para cada contenido y lo vuelve a cargar la próxima vez.

La búsqueda usa `rest.opensubtitles.org`, no requiere clave de API y permite CORS. Si el servidor no responde, el reproductor sigue funcionando sin subtítulos.

---

## Agregar tu propio proveedor fijo

Si prefieres incluir un proveedor dentro de la app (sin repositorio), crea un archivo en `app/js/providers/` y cárgalo en `app/index.html` después de `providers.js`:

```html
<script src="js/providers/mi-proveedor.js"></script>
```

El objeto que registres es el mismo que se describe arriba. Después podrás activarlo/desactivarlo desde **Ajustes**.

---

## Notas técnicas

- **Reproducción:** `<video>` HTML5; para `.m3u8` se usa `hls.js` cuando el navegador no soporta HLS nativo.
- **Progreso:** se guarda en `localStorage` por perfil y alimenta «Continuar viendo».
- **Series:** pestañas de temporada, progreso por episodio, marca de visto y reproducción automática del siguiente.
- **CORS:** las APIs, listas y repositorios que configures deben permitir el origen desde el que TizenBrew sirve el módulo. Si un proveedor falla, el inicio muestra un aviso en lugar de romperse.
- **Compatibilidad:** se evitan `flex gap`, `aspect-ratio`, `Promise.allSettled` y `AbortController` para funcionar en motores WebKit/Chromium antiguos de Tizen.
- **Almacenamiento:** la versión 2 migra automáticamente el progreso guardado por la versión 1 al perfil «Principal».

---

## Licencia

MIT. Ver `LICENSE`.

Incluye [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0) y [pako](https://github.com/nodeca/pako) (MIT) en `app/vendor/`.
