# Correos propios del TPV

El servidor envía por SMTP desde la cuenta de la tienda. No requiere plugins,
Shopify Flow ni otra aplicación instalada en Shopify. Nodemailer es una
biblioteca del servidor para hablar SMTP; las plantillas, reglas, cola y pantalla
son código del proyecto.

## Activación

1. Configurar en el servidor `SMTP_HOST`, `SMTP_PORT` (587 con STARTTLS o 465 con
   TLS), `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM` (una dirección verificada,
   sin nombre). Utilizar la contraseña de aplicación que requiera el proveedor.
   No introducir secretos en el navegador ni subirlos a Git.
2. Mantener `POS_DATA_DIR` en el volumen persistente habitual. La cola se guarda
   en su subdirectorio `mail`. Ejecutar una única instancia del servidor, como
   el resto del TPV. Reiniciar tras modificar variables SMTP.
3. Abrir **Correos**, comprobar el remitente, indicar el destinatario de avisos,
   elegir las categorías y activar el envío. Guardar.
4. Pulsar **Enviar prueba al correo de avisos guardado**. Verificar su estado y
   la recepción real (incluida la carpeta de spam). El proveedor debe autorizar
   el remitente; configurar SPF/DKIM en el dominio según sus instrucciones.

Los envíos están desactivados inicialmente. No hay valores de destinatario
inventados ni envío de prueba automático. El servicio funciona mientras el
servidor está en marcha y puede establecer conexiones SMTP salientes.

## Implementado

- Ticket regalo al cliente desde la venta completada. Se consultan todas las
  líneas del pedido en Shopify, sin pedir importes, impuestos, pagos o notas.
- Informe de cierre: fondo, ventas por método, devoluciones, esperado, contado y
  diferencia. Los cierres forzados se identifican sin inventar un recuento.
- Descuadre superior al umbral configurado (valor absoluto).
- Caja abierta pasada la hora elegida; una alerta por caja y día.
- Operaciones pendientes de venta, devolución o emisión de vale. Distingue un
  pedido cobrado sin preparar de un resultado todavía sin confirmar.
- Fallo persistente de comprobación de Shopify/datos contables (tres intentos).
- Fallos al solicitar el correo de pedido o vale a Shopify, y envíos propios
  rechazados o sin confirmación. No se generan avisos recursivos por fallos de
  los propios avisos internos.
- Cambios de credenciales del TPV detectados tras reiniciar, y cambios de
  configuración del correo mientras los avisos sigan habilitados. No incluye
  vigilancia de cuentas o permisos que se administran en Shopify.
- Resumen de ventas del TPV del día anterior, con ventas, devoluciones y métodos.
- Avisos de stock bajo, agotado y negativo, y resumen de reposición opcionales.
  Se utiliza stock agregado de todas las ubicaciones, solo variantes activas
  cuyo inventario se controla. El primer análisis establece una referencia sin
  enviar un aviso por cada producto ya agotado. El resumen sí los incluye.

La comprobación general se realiza cada minuto. La entrega tiene un ciclo
independiente cada quince segundos, de hasta diez correos por ciclo, para que
una consulta lenta a Shopify no bloquee los tickets. El inventario se consulta cada quince minutos. No es una alerta instantánea por
webhook: movimientos entre comprobaciones pueden no observarse. Los horarios y
límites de día usan Europe/Madrid, incluido el cambio de hora. Los informes de
ventas recuperan días completos pendientes (hasta siete por ciclo) tras una
interrupción. No se envían cierres anteriores a la activación. No se reconstruyen
resúmenes históricos de stock: cada resumen usa la consulta actual.

Los avisos de stock están desmarcados inicialmente porque la tienda ya recibe
correos de agotados. Activarlos aquí sin retirar la automatización anterior
puede producir avisos duplicados de dos sistemas distintos.

## Qué sigue enviando Shopify

Los documentos normales de pedido, vales y las notificaciones ya existentes de
Shopify conservan su funcionamiento. Esta implementación no activa por sí sola
el envío de confirmaciones, devoluciones o cancelaciones de Shopify. No añade
reservas, facturas fiscales ni un proveedor de facturación: esas funciones no
existen como flujos completos en este TPV y no deben simularse con un email.

## Estados y recuperación

- **En cola**: aún no se ha entregado al servidor SMTP.
- **Enviando**: intento en curso.
- **Aceptado por el servidor de correo**: SMTP lo aceptó; no confirma recepción
  en bandeja ni lectura. No hay seguimiento de rebotes posteriores.
- **No enviado**: rechazo confirmado o fallo previo al envío. Los fallos
  transitorios tienen hasta tres intentos con espera creciente.
- **Sin confirmación**: la conexión se perdió cuando el envío podía haberse
  aceptado, o el proceso se interrumpió durante el envío. No hay reintento
  automático: comprobar el correo antes de confirmar un reenvío en la pantalla.
- **Cancelado**: se desactivaron los envíos, la categoría/destinatario cambió, o
  la incidencia se resolvió antes de enviarse. Un ticket regalo cancelado puede
  solicitarse de nuevo explícitamente desde la venta.

Cada evento y destinatario tiene un identificador persistente. Repetir la
petición o reiniciar no vuelve a enviar un correo confirmado. Esto no equivale
al envío exactamente una vez: SMTP no ofrece esa garantía si se pierde su
respuesta. Los casos ambiguos se muestran para revisión.

La cola persiste separada del diario financiero: un fallo SMTP no revierte ni
repite cobros. Un cierre se detecta desde el estado confirmado en Shopify, por
lo que se recupera incluso si el navegador perdió la respuesta del cierre.

No borrar el subdirectorio `mail` para reintentar: se perdería el historial de
mensajes enviados. Si queda `mail/journal.lock` tras una caída, parar el servidor,
comprobar que no hay otra instancia escribiendo, conservar una copia del volumen
y resolver el bloqueo antes de reiniciar. La cola sigue la misma política de
bloqueos conservadora que el diario financiero.

## Verificación

`npm test`, `npx tsc -b`, `npx eslint ...` y `npx vite build`.
Las pruebas de correo usan un transporte simulado y datos Shopify simulados:
no crean pedidos ni envían mensajes reales. La pantalla se verifica con APIs
simuladas. La aceptación y recepción real solo puede probarse al configurar SMTP.
