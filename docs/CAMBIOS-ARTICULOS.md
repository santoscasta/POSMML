# Cambio de artículos

Pedidos → abrir pedido → Cambiar artículos. Seleccionar unidades devueltas, ubicación de reposición y nuevos artículos; calcular y confirmar.

- Igual importe: sin cobro ni vale.
- Más importe: cobrar únicamente la diferencia en efectivo, tarjeta o Bizum.
- Menos importe: emitir e imprimir un vale por la diferencia.
- El vale sobrante se asocia al cliente del pedido, si lo tiene.

Se usa el importe de devolución sugerido por Shopify, con descuentos e impuestos de los artículos originales y sin devolver portes. Los artículos nuevos se calculan con sus precios actuales. El servidor vuelve a validar el cálculo antes de empezar. Solo se admiten pedidos con transacción manual compatible del TPV; no se procesan automáticamente devoluciones de pasarelas online.

Shopify registra la devolución de los artículos originales y un nuevo pedido pagado y preparado, cuya nota indica el pedido original. El diario del TPV conserva ambos identificadores. Las ventas brutas y devoluciones se registran completas; el crédito aplicado al cambio se contabiliza como EXCHANGE, separado del efectivo, tarjeta, Bizum y vales. Solo la diferencia cobrada afecta a esos medios. Nunca se crea ni consume un vale intermedio.

La operación mantiene un único bloqueo y un diario persistente para todos los pasos. Si se interrumpe, se reanuda desde el modal o desde Operaciones pendientes, con los mismos artículos e importes. Una respuesta incierta se comprueba en Shopify antes de repetir una acción. El cierre de caja queda bloqueado mientras haya pasos pendientes. No se debe volver a cobrar al reanudar.

Validación: pruebas automatizadas de importes iguales, mayores y menores; efectivo y cambio, tarjeta, Bizum; rechazo y reintento, respuesta de vale perdida, saldo de caja, descuentos, cantidades devueltas, stock y pasarelas incompatibles. Pruebas de navegador con API simulada para los tres casos y recuperación. Comprobación del esquema de Shopify en tienda de desarrollo, sin crear operaciones reales.
