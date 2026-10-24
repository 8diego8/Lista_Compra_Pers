# Lista de la compra

Aplicación web móvil (PWA) en español para gestionar una lista de la compra. Está hecha con HTML, CSS y JavaScript sin dependencias ni servidor de datos.

## Funciones

- Añadir productos (máximo 80 caracteres), con el botón o la tecla de confirmación del teclado.
- Marcar y desmarcar productos; los comprados se muestran debajo de los pendientes.
- Historial alfabético para volver a añadir productos con un toque.
- Evita duplicados aunque cambien mayúsculas o espacios.
- Compartir mediante el menú nativo, copiar el texto o abrir WhatsApp con el mensaje preparado.
- Guardado automático en `localStorage`.
- PWA instalable desde Safari y caché básica para volver a abrir la interfaz sin conexión.

## Privacidad y conservación de datos

Los nombres de productos se guardan en el almacenamiento local (`localStorage`) del navegador en el dispositivo. La aplicación no envía productos a servidores externos, no requiere cuenta y no incluye analítica, anuncios ni servicios de pago.

Los datos **no se sincronizan automáticamente entre dispositivos**. En iPhone, usa siempre el mismo navegador y evita borrar los datos/datos de sitios web de Safari si quieres conservar la lista. Los datos viven en el almacenamiento del navegador, no dentro del código publicado; publicar una nueva versión no los borra por sí solo. No cambies la clave `lista-compra-v1` si quieres mantener compatibilidad con los datos guardados.

La caché del service worker guarda archivos de la aplicación para uso sin conexión; los productos permanecen en `localStorage`, separado de esa caché.

## Probar en local

Como los service workers y las funciones PWA requieren HTTPS o `localhost`, sirve esta carpeta con un servidor local. Por ejemplo, si tienes Python instalado:

```bash
python3 -m http.server 8000
```

Después abre `http://localhost:8000` en el navegador desde el ordenador. Para probar la experiencia real de iPhone, publica primero por HTTPS.

## Publicar gratis con GitHub Pages

1. Crea o inicia sesión en GitHub.
2. Crea un repositorio nuevo, por ejemplo `lista-de-la-compra`.
3. Sube todos los archivos de esta carpeta manteniendo la estructura, incluidos `icons/`.
4. En el repositorio, abre **Settings → Pages**.
5. En **Build and deployment**, elige **Deploy from a branch**.
6. Selecciona la rama `main` y la carpeta `/(root)`, y pulsa **Save**.
7. Espera a que GitHub Pages termine el despliegue. La dirección aparecerá en esa misma sección; normalmente será `https://TU-USUARIO.github.io/lista-de-la-compra/`.

Si el repositorio se llama distinto, la URL también cambia. No se puede conocer el enlace final hasta saber tu usuario/repositorio y completar el despliegue.

## Añadirla a la pantalla de inicio del iPhone

1. Abre la URL publicada en **Safari** (no dentro del navegador integrado de WhatsApp).
2. Pulsa **Compartir**.
3. Elige **Añadir a pantalla de inicio**.
4. Si aparece, activa **Abrir como app web** y pulsa **Añadir**.

La aplicación no necesita App Store. Para el menú nativo de compartir, iOS requiere que el navegador soporte `navigator.share`; si no está disponible, puedes copiar el texto o abrir WhatsApp.

## Formato de compartir

Se incluyen solo los productos actuales, primero los pendientes y después los comprados. El historial no se comparte. El mensaje no se envía automáticamente: el usuario revisa el texto y decide a qué aplicación enviarlo.

## Actualizaciones

El service worker usa una versión de caché identificada por `lista-compra-shell-v1`. Al modificar archivos, cambia ese nombre en `sw.js` (por ejemplo, a `lista-compra-shell-v2`) para forzar una nueva caché de la interfaz. No borres ni cambies la clave de `localStorage` si quieres conservar los datos actuales.
