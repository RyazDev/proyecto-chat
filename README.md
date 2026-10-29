# Chat y publicidad

Proyecto independiente de APIREST, desarrollado por fases con módulos ES (`"type": "module"`).

## Estado: Fase 4, mensajes compartidos en tiempo real

Las fases 1 a 3 configuraron Express, Handlebars, la interfaz y la conexión Socket.IO. La Fase 4 permite enviar mensajes y recibirlos en todos los navegadores, incluido el remitente, sin recargar. El servidor conserva los últimos 100 mensajes en memoria y los entrega al conectar o reconectar. Al reiniciar el servidor se borra el historial y los navegadores que permanecen abiertos reciben un aviso.

El formulario valida el nombre obligatorio (hasta 40 caracteres), la publicidad opcional (hasta 240) y el mensaje obligatorio (hasta 1.000). El servidor vuelve a validar tipos, campos vacíos, límites e identificador de envío. Los mensajes propios se muestran a la derecha y los recibidos a la izquierda; se identifican por sus claves de envío, no por comparar nombres. El nombre se conserva con `sessionStorage` en la misma pestaña, incluso después de recargar, sin crear cuentas ni autenticación. Si ese almacenamiento está bloqueado, el chat sigue funcionando. Los borradores y envíos pendientes permanecen en la página durante desconexiones, pero no se guardan al recargar.

La publicidad enviada queda asociada y visible dentro del mensaje. **El banner superior todavía no se sincroniza: corresponde a la Fase 5.**

## Comunicación implementada

Express y Socket.IO comparten un servidor creado con `createServer(app)`, que se inicia con `httpServer.listen()`. El navegador importa el cliente ESM desde `/socket.io/socket.io.esm.min.js`, servido por la propia dependencia, sin CDN ni otra librería de interfaz.

| Evento | Dirección | Función |
| --- | --- | --- |
| `connection` | Socket.IO → servidor | Registra una conexión nueva y sus manejadores. |
| `connection:check` | Navegador → servidor | Solicita una comprobación sin datos del formulario. |
| Confirmación de `connection:check` | Servidor → navegador | Devuelve `{ ok: true, serverTime: "fecha ISO" }`. |
| `connect` | Socket.IO → navegador | Inicia la comprobación en cada conexión o reconexión. |
| `disconnect` / `connect_error` | Socket.IO → navegador | Actualiza el estado y explica el reintento. |
| `reconnect_attempt` | Gestor Socket.IO → navegador | Indica que se está intentando recuperar la conexión. |
| `chat:state` | Servidor → navegador | Entrega el identificador de sesión del servidor y los últimos 100 mensajes al conectar o reconectar. |
| `chat:send` | Navegador → servidor | Envía `requestId`, `username`, `message` y publicidad opcional en `advertisement`. |
| `chat:message` | Servidor → todos los navegadores | Distribuye el mensaje validado, también al remitente. |
| Confirmación de `chat:send` | Servidor → remitente | Devuelve `{ ok: true, message }` o `{ ok: false, error }`. |

El estado pasa a Conectado al recibir una confirmación válida del servidor, con un tiempo de espera de cinco segundos. Los listeners se registran una sola vez; únicamente la comprobación se repite al reconectar. Una confirmación de una conexión anterior se ignora. Socket.IO reintenta automáticamente después de interrupciones de transporte. Una desconexión explícita puede necesitar recargar la página y se informa en pantalla.

Cada mensaje contiene `id` (UUID del servidor), `requestId` (UUID de la solicitud), `username`, `message`, `sentAt` (fecha ISO generada en el servidor) y `advertisement` (texto o `null`). El navegador no decide el ID del mensaje ni su hora. La interfaz muestra la hora local del navegador y la fecha completa al colocar el cursor sobre ella. El contenido se incorpora con `createElement` y `textContent`, sin interpretar entradas como HTML.

Enviar se habilita al confirmar la conexión. Durante el envío se bloquean los campos para evitar doble envío y se espera hasta cinco segundos. El formulario se limpia solamente cuando se recibe el mensaje del servidor o su confirmación. Si la conexión se interrumpe o no hay confirmación, el texto permanece y se informa que puede reintentarse. No se encolan mensajes para enviarlos silenciosamente al reconectar.

Un reintento con el mismo contenido reutiliza `requestId`. Mientras el mensaje siga entre los últimos 100, el servidor devuelve el resultado anterior sin publicarlo otra vez; si ese identificador llega con otro contenido, lo rechaza. El navegador evita duplicar la representación por `id`, aunque reciba tanto el evento como su confirmación. El historial y esta deduplicación son temporales: no sobreviven al reinicio del servidor ni a la eliminación del mensaje del historial de 100. No se promete persistencia ni entrega exactamente una vez fuera de esa ventana.

## Requisitos y ejecución

Node.js 24. La versión principal queda fijada para usar el mismo entorno local y en Vercel.

Desde esta carpeta:

```sh
npm install
npm start
```

Abrir http://localhost:3000. La página muestra una sola tarjeta: encabezado, publicidad compacta, conversación y formulario al pie. El anuncio opcional se escribe al abrir el desplegable Publicidad. Mantener la terminal abierta y usar Ctrl + C para detener el servidor. El puerto puede configurarse con `PORT`.

## Organización

```text
proyecto-chat/
├── package.json
├── package-lock.json
├── server.js
├── views/
│   ├── layouts/
│   │   └── main.handlebars
│   ├── index.handlebars
│   └── partials/
│       ├── formulario.handlebars
│       └── chat.handlebars
└── public/
    ├── css/
    │   └── styles.css
    └── js/
        └── chat.js
```

También se incluyen `data/messages.example.json`, con tres mensajes ficticios, y `vercel.json`, con la configuración básica de despliegue.

- `server.js`: configura Express, Handlebars y Socket.IO; valida mensajes, asigna ID y hora, conserva el historial y distribuye los eventos.
- `main.handlebars`: estructura HTML, metadatos, CSS, aviso sin JavaScript y script del navegador como módulo. `{{{body}}}` inserta el HTML de la vista renderizada por el motor.
- `index.handlebars`: reúne encabezado, banner compacto, conversación y formulario en una única tarjeta.
- `formulario.handlebars`: formulario compacto con nombre, publicidad desplegable, etiquetas accesibles, errores y botón de envío.
- `chat.handlebars`: contenedor de mensajes con desplazamiento y estado vacío. No incluye mensajes simulados.
- `styles.css`: colores, tipografía local, espaciados, controles, estados de enfoque y adaptación a móviles.
- `chat.js`: gestiona conexión, formulario, confirmaciones, reintentos, nombre temporal y representación segura del historial y mensajes nuevos.

## Comprobación manual

1. Ejecutar `npm start` y abrir http://localhost:3000.
2. Confirmar respuesta HTTP 200, título, tarjeta de chat y tres mensajes marcados como demo. Para empezar con el chat vacío, configurar `DEMO_DATA=false`.
3. Cambiar el ancho de la ventana o usar la vista móvil: la tarjeta debe adaptarse al espacio, mantener el formulario al pie y desplazar la conversación sin desbordamiento horizontal.
4. Usar Tab para revisar el enlace de salto al contenido y el enfoque visible de los campos. Cada campo debe tener su etiqueta.
5. Abrir dos pestañas: ambas deben mostrar Conectado y la terminal debe registrar las dos conexiones.
6. El nombre se escribe en Tu nombre y el anuncio opcional en el desplegable Publicidad. Usar nombres distintos, enviar un mensaje y comprobar que aparece una sola vez en ambas pestañas, con autor y hora. El nombre permanece y el mensaje se limpia después de su confirmación.
7. Enviar un mensaje con publicidad y otro sin ella. La publicidad debe quedar adjunta al primero; el banner permanece igual hasta la Fase 5.
8. Probar nombre o mensaje compuesto solo por espacios y textos demasiado largos: no deben publicarse. Escribir texto como `<b>Hola</b>` y comprobar que se muestra literalmente.
9. Abrir otra pestaña: debe recibir el historial reciente. Recargar una pestaña: su nombre se conserva y los mensajes no aparecen duplicados.
10. Escribir un borrador y detener el servidor con Ctrl + C: Enviar se deshabilita. Iniciar de nuevo con `npm start`: la pestaña se reconecta, conserva el borrador y avisa que el historial anterior se perdió. Enviar el borrador manualmente.
11. Revisar la pestaña Red para observar `/socket.io/`; los archivos CSS y JS deben responder 200 y `/no-existe`, 404.

Flujo del mensaje: formulario → `chat:send` → validación del servidor → UUID y hora → historial en memoria → `chat:message` a todos → DOM seguro y confirmación al remitente.

La siguiente etapa será la Fase 5: mostrar el último anuncio en el banner, sincronizarlo entre clientes y conservarlo cuando llegue un mensaje sin publicidad.

## Datos de demostración

Al iniciar se cargan tres mensajes ficticios desde `data/messages.example.json`, validados por el mismo código que los mensajes enviados. Sus IDs y horas se generan en el servidor. Los ejemplos no contienen contraseñas, datos personales ni mensajes capturados de usuarios reales.

Los nuevos mensajes permanecen únicamente en memoria: no se escriben en el archivo de ejemplos. Al reiniciar se pierden los mensajes enviados y se vuelve a los tres ejemplos iniciales. Para desactivar los ejemplos en PowerShell:

```powershell
$env:DEMO_DATA = "false"
npm start
```

En Vercel se puede establecer la misma variable en la configuración del proyecto.

## Preparación para Vercel

1. Importar el repositorio `RyazDev/proyecto-chat` desde GitHub.
2. Usar Express como framework y la raíz del repositorio como Root Directory. No configurar una carpeta de salida estática ni un comando de compilación de frontend.
3. Mantener Node.js 24 y Fluid Compute. El servidor HTTP se exporta por defecto y no abre un puerto propio cuando `VERCEL=1`.
4. El cliente usa directamente WebSocket. `vercel.json` incluye las vistas, los ejemplos y el cliente de Socket.IO en el paquete del servidor; CSS y JavaScript están en `public/`.
5. Después de desplegar, comprobar dos sesiones, envío y reconexión con la URL real. Subir el repositorio no equivale a haber verificado ese despliegue.

Esta versión académica conserva el historial y distribuye mensajes dentro de una sola instancia. Vercel puede ejecutar varias instancias y una reconexión puede cambiar de instancia: **no se garantiza un chat global compartido ni un historial uniforme entre instancias**. Para ese escenario se necesita un almacenamiento y adaptador compartidos, que no forman parte de esta versión sin base de datos.

Referencias: [WebSockets en Vercel](https://vercel.com/docs/functions/websockets) y [Express en Vercel](https://vercel.com/docs/frameworks/backend/express).
