# Configuración y recuperación del POS

## Antes de desplegar

1. Configura `POS_USERNAME` y `POS_PASSWORD` en el servidor. Usa una contraseña larga y exclusiva. La aplicación solicita estas credenciales antes de consultar Shopify; se mantienen solo en memoria del navegador y se eliminan al salir o recargar. No uses variables `VITE_*` para secretos.
2. Añade el origen HTTPS exacto del frontend a `ALLOWED_ORIGINS` (sin ruta ni barra final). En desarrollo añade también el origen de Vite. Los orígenes no incluidos reciben un 403.
3. Monta un volumen persistente y define `POS_DATA_DIR`. En Railway: volumen `/data`, variable `POS_DATA_DIR=/data/pos-mml`. El servidor rechaza el arranque de producción sin esta variable. Mantén una única réplica y conserva el mismo volumen en cada despliegue.
4. Haz copias de seguridad de `POS_DATA_DIR/journal.json`. Contiene los movimientos, fechas de apertura, identificadores de operación y códigos de vales: debe tener acceso restringido. No borres ni reinicialices este archivo para resolver un error.
5. Genera el frontend con `npx tsc -b && npx vite build`. Este repositorio versiona `dist`; `npm run build` conserva su comportamiento de despliegue con archivos precompilados. El workflow de GitHub también regenera el frontend.

La API queda cerrada si faltan las credenciales. Sirve producción exclusivamente por HTTPS; el proxy de Railway puede terminar TLS. No se ha desplegado ni cambiado ninguna credencial de la tienda como parte de esta corrección.

## Cobros y devoluciones

Cada intento tiene un identificador persistente. El navegador lo guarda antes de enviar la petición; el servidor guarda los pasos antes de llamar a Shopify. Un reintento conserva carrito, importe y método originales.

- Si el cobro falla, utiliza **Reanudar cobro pendiente**. El pedido se completa inicialmente como pendiente de pago y solo se marca pagado después del canje de los vales.
- Si falla la emisión del vale de devolución, la devolución ya confirmada se conserva. **Reanudar devolución** vuelve a intentar únicamente la emisión pendiente, sin repetir el reembolso.
- Si cerraste el navegador o perdiste su almacenamiento, entra en **Operaciones pendientes** y reanuda allí. Una devolución pendiente del mismo pedido bloquea otro intento con un identificador distinto.
- Si se perdió una respuesta, al reintentar se consulta Shopify por el identificador de operación antes de continuar. Si no se puede confirmar el resultado, la aplicación muestra que requiere revisión y no repite a ciegas la modificación.
- No cierres caja con operaciones pendientes: el servidor lo impide, incluido el cierre forzado.

Las ventas y las devoluciones se guardan como movimientos independientes. Las devoluciones de pedidos de días anteriores pertenecen a la caja de la devolución; la venta original conserva su sesión. Los pagos mixtos conservan cada parte, y solo la parte en efectivo incrementa el efectivo esperado.

## Reinicio durante una operación

El archivo `journal.lock` evita escrituras simultáneas incluso entre procesos. Normalmente se elimina al terminar la petición. Si el proceso termina abruptamente, el bloqueo queda deliberadamente en el volumen.

Para recuperarlo:

1. Detén todas las instancias del servidor que utilicen ese volumen. No retires el bloqueo mientras pueda quedar una petición activa.
2. Haz una copia de seguridad del directorio completo.
3. Retira únicamente `journal.lock`; conserva `journal.json` sin cambios y arranca una sola instancia.
4. Abre **Operaciones pendientes** y reanuda. Los pasos con resultado incierto se comprueban en Shopify; no se ejecutan otra vez automáticamente.
5. Si continúa apareciendo «requiere comprobar Shopify», revisa el pedido/borrador (etiqueta `pos-operation-<identificador>`), la nota de devolución y las transacciones del vale. Conserva el identificador y el journal para conciliar el caso. No crees otro cobro ni borres el paso pendiente para forzar un reintento.

No existe una transacción distribuida entre Shopify y el servidor. Ante un resultado que no se puede demostrar, se prioriza evitar un segundo cargo o vale. Esos casos requieren conciliación operativa.

## Historial anterior

La fecha de apertura se conserva antes del cierre; para sesiones cerradas antiguas cuya fecha real no está disponible se muestra «No registrada». Los pedidos se asignan por sesión, sin filtrar por la fecha de creación del pedido.

Los pagos mixtos antiguos sin desglose y las ventas sobrescritas por una devolución no permiten calcular un cierre fiable. El servidor los señala como pendientes de conciliación en lugar de inventar el efectivo. Esta corrección no reconstruye los datos que ya fueron sobrescritos; deben contrastarse con Shopify y los cierres originales. La lectura del historial también depende del alcance de acceso a pedidos concedido a la aplicación en Shopify.

## Verificación

- `npm test`: pruebas locales con Shopify simulado (reintentos, concurrencia, fallos parciales, contabilidad y autenticación).
- `npx tsc -b`: comprobación de tipos.
- `npx vite build`: compilación del frontend.
- `npm run lint`: el repositorio tiene cinco errores previos de Fast Refresh y un aviso en el escáner, ajenos a estos P1.

Referencias de API verificadas: [Refund y estado de sus transacciones](https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Refund), [Metaobject y updatedAt](https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Metaobject), [código de emisión de un vale](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/giftcardcreateinput).
