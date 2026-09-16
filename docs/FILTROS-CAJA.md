# Qué pedidos cuentan en Caja e Inicio

## Caja → Sesión actual

- Se cuentan las ventas cuyo `sessionId` coincide con la sesión abierta.
- No es un filtro por día: una sesión abierta desde ayer conserva sus ventas;
  una nueva sesión de hoy no incluye las de otra caja/sesión cerrada hoy.
- La fuente es el diario persistente de cobros del servidor. Se añaden los
  pedidos antiguos con etiqueta `POS MML` y metadatos `pos_mml.payment_method`
  y `pos_mml.session_id`. No se duplica una venta ya presente en el diario.
- La lista **Pedidos incluidos en esta sesión** muestra los pedidos del contador.
- Los pedidos pagados etiquetados POS MML de hoy que carecen de registro de pago
  o sesión aparecen como aviso. No se inventan el método de pago ni la sesión.
- No hay un filtro por estado «preparado». Los pedidos online o sin registro
  de cobro no se incorporan por el simple hecho de aparecer en la pantalla
  general Pedidos. Los registros antiguos se identifican por sus metadatos.

Ejemplo reproducido por una prueba: dos ventas con tarjeta de 17,45 € y 24 €
en la sesión actual cuentan como 2 pedidos y 41,45 €. Una tercera venta de hoy
asignada a otra sesión no se suma. Si el fondo es 271,30 € y no hay movimientos
en efectivo, el efectivo teórico sigue siendo 271,30 €.

La caja se refresca al abrir su pantalla, al recuperar foco/visibilidad y cada
30 segundos con la aplicación visible. Hay un botón de actualización manual.
Se descartan respuestas antiguas para no sobrescribir una consulta más reciente
o una apertura/cierre que ya haya finalizado.

## Inicio → Ventas del TPV de hoy

Se cuentan ventas registradas en el TPV de todas las sesiones con fecha del día
actual en Europe/Madrid, de 00:00 a 24:00. No depende de la zona horaria de Railway.
No incluye ventas de otros canales. Los pedidos pagados del TPV sin registro de
pago aparecen como advertencia en lugar de sumarse con un método desconocido.

## Comprobación del caso comunicado

El usuario comunica 2 pedidos, 41,45 € en tarjeta, 0 € efectivo y Bizum, y
271,30 € de efectivo teórico. El código confirma que corresponde a la sesión
actual. No se ha validado la lista real de pedidos excluidos: la API publicada
responde 401 con las credenciales locales y la integración local apunta a
MiminileoDev (tienda de desarrollo). No se han modificado pedidos, sesiones,
metadatos ni cobros de producción para intentar cuadrar esas cifras.

Para confirmar la causa concreta, abrir Caja, actualizar, revisar la hora de
apertura y **Pedidos incluidos en esta sesión**. Contrastar los pedidos que
faltan con su sesión asignada y los avisos de registro incompleto. Un cambio de
volumen o pérdida del diario también requiere conciliación; no se soluciona
volviendo a cobrar ni atribuyendo automáticamente todas las ventas de hoy a
la sesión abierta.
