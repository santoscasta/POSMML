# Diagnóstico de incidencias de negocio

Los registros se escriben como líneas JSON en la salida del servidor, consultables en los logs de Railway. El cambio debe desplegarse para recoger incidencias de producción; no reconstruye el historial anterior.

Cuando negocio reporte un problema, pedir la hora aproximada de Madrid, la pantalla, la última acción y qué ocurrió después. Una captura del mensaje ayuda. Con eso se puede localizar la franja y seguir las peticiones y la impresión del mismo navegador. No hace falta pedir contraseñas, códigos completos de vales ni datos del cliente.

## Identificadores y tiempos

| Campo | Uso |
| --- | --- |
| `timestamp` | Hora UTC del registro en el servidor. Convertir desde Madrid teniendo en cuenta el cambio de hora. |
| `clientTime` | Hora UTC del evento en el equipo del usuario; puede diferir si su reloj está desajustado o el envío se retrasó. |
| `clientId` | Identificador aleatorio del navegador, conservado en esa sesión de pestaña al recargar. No es el token de acceso. |
| `requestId` | Relaciona una petición API con sus registros del navegador, servidor y Shopify. Se devuelve en `X-Request-ID`. |
| `ingestRequestId` | Petición que transportó un lote de eventos; no es la petición API que originó una incidencia. |
| `printId` | Relaciona la apertura, recursos, diálogo y cierre de una pestaña de impresión. |
| `operationId` | UUID de una operación de negocio, cuando existe; permite contrastar el diario de recuperación. |
| `actorId` | Identificador interno de la cuenta autenticada, establecido por el servidor. |
| `screen`, `route`, `operation` | Pantalla, familia o plantilla de ruta API y nombre de la operación GraphQL, sin parámetros ni variables. |
| `build` | Nombre del archivo JavaScript servido al navegador, o `development` en local. |
| `durationMs` | Duración o retraso en milisegundos. |

## Qué buscar

| Evento | Qué indica |
| --- | --- |
| `http.started` / `http.completed` | Inicio y final de una petición, estado HTTP y duración. |
| `http.waiting` | La petición sigue pendiente después de diez segundos. |
| `http.disconnected` | La conexión se cerró antes de terminar la respuesta. No demuestra si una modificación remota llegó a ejecutarse. |
| `api.waiting`, `api.slow`, `api.failed` | Espera de diez segundos, respuesta de más de tres segundos o fallo visto por el navegador. |
| `shopify.started`, `shopify.completed`, `shopify.failed`, `shopify.exception` | Consulta remota, final, rechazo lógico o excepción. Los errores GraphQL y `userErrors` se detectan aunque la respuesta HTTP sea 200. |
| `operation.step_*`, `operation.failed` | Inicio, final, rechazo, recuperación o resultado incierto de un paso duradero. |
| `ui.runtime_error`, `ui.unhandled_rejection`, `ui.react_error`, `ui.resource_error` | Error de JavaScript, promesa, React o recurso del navegador. |
| `ui.event_loop_delay` | Retraso superior a cinco segundos detectado mientras la pestaña estaba visible. No identifica por sí solo si lo causó el código, el navegador o el equipo. |
| `ui.visibility`, `ui.focus`, `ui.online`, `ui.offline`, `ui.pagehide` | Cambios de pestaña, foco, conexión y salida de la página. Ayudan a interpretar huecos sin peticiones. |
| `ui.started`, `ui.navigation`, `ui.heartbeat` | Inicio, cambio de pantalla y señal periódica cada treinta segundos mientras la pestaña está visible. |
| `process.started`, `process.uncaught_exception`, `process.event_loop_delay` | Arranque, excepción fatal observada o retraso en el proceso del servidor. La instrumentación no evita la terminación normal de un proceso con una excepción fatal. |

Las categorías de error son fijas, por ejemplo `metaobject_definition_missing`, `throttled`, `access_denied`, `timeout`, `network`, `storage` o `validation`. No contienen el mensaje libre de la excepción. Las posiciones de código permiten localizar errores de pantalla sin enviar su mensaje o los datos que lo originaron.

## Caso de impresión

Buscar `print.requested`, después `print.ready`, `print.assets_ready`, `print.dialog_open`, `print.dialog_closed` y `print.window_closed` con el mismo `printId`. `print.returned` indica que la llamada nativa retornó; el orden de este evento y los del diálogo puede variar entre navegadores.

- Si no llega la confirmación de apertura en cinco segundos, se registra `print.open_timeout`. Puede ser un bloqueo de ventanas, un cierre temprano o un fallo al inicializar el documento.
- En `print.assets_ready`, `count` indica cuántas imágenes se sustituyeron por texto al no estar listas.
- `print.error` indica una excepción al intentar abrir o imprimir; el registro no incluye el HTML del ticket.
- El seguimiento de una ventana se libera al cerrarla o a los diez minutos (`print.monitor_expired`). Una reimpresión posterior en una ventana que lleva más tiempo abierta queda fuera de ese seguimiento.
- Cerrar el diálogo puede significar imprimir o cancelar. **Estos eventos no confirman que la impresora haya sacado papel.**

## Privacidad y límites

La lista de campos permitidos se aplica tanto en el navegador como en el servidor. No se envían cuerpos de peticiones, parámetros de búsqueda, consultas o variables GraphQL, mensajes libres de excepciones, HTML de tickets, credenciales, tokens, códigos de vales, importes ni fichas de clientes. Las rutas dinámicas se registran como familias o plantillas. Se sustituyeron los registros existentes que imprimían excepciones completas del servidor o respuestas de autenticación de Shopify.

La recepción de eventos requiere una sesión de acceso válida y usa el mismo control de origen que las demás API. El actor procede de esa sesión. Se admiten hasta veinte eventos por lote y ciento veinte eventos por minuto y cuenta.

El navegador mantiene hasta cien eventos en memoria, intenta enviarlos cada cinco segundos y reintenta con espera si la recepción falla. No escribe los eventos en almacenamiento persistente. La cola se descarta al cambiar de sesión de acceso para no atribuir eventos de una persona a otra, incluidos los lotes que fallen mientras se cambia de cuenta. Una caída de red seguida del cierre del navegador, un bloqueo completo que no se recupere o una sesión caducada pueden dejar huecos. Las peticiones de negocio no se reintentan ni se cancelan por un fallo del diagnóstico. La retención de los logs depende de la plataforma de alojamiento; no se crea un archivo de logs en el volumen del TPV.

## Validación local

196 pruebas automatizadas correctas, incluida correlación concurrente, respuestas lentas, errores GraphQL con HTTP 200, filtrado de datos privados, autenticación, límites de recepción, cola acotada, trabajo sin conexión, cambios de cuenta y fallos del propio diagnóstico. Se comprueba que la instrumentación no repita un cobro. También pasan TypeScript, ESLint de los archivos de interfaz modificados y la compilación de producción.

Prueba real en Edge, con un servidor local de diagnóstico: fallo JavaScript, petición de once segundos, error GraphQL, pausa de pantalla de 6,5 segundos y ciclo de impresión simulado. Los eventos llegaron al servidor con los mismos identificadores; los marcadores privados de prueba no aparecieron en sus logs. No se crearon pedidos ni se usaron Shopify o una impresora física. Guiones en `output/playwright/diagnostics-qa.cjs` y `diagnostics-flow-qa.cjs`.
