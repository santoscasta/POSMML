# Vales, tickets y cobros de caja — 30/09/2026

## Correcciones

- La consulta de vales acepta códigos completos, enmascarados o sus cuatro últimos caracteres, en mayúsculas o minúsculas y con espacios. Se comprueban todas las páginas y se rechazan coincidencias ambiguas.
- El ticket identifica cada vale aplicado por sus últimos cuatro caracteres. El detalle del pedido muestra todos los vales utilizados con su importe; la impresión inicial, la reimpresión y la reanudación conservan esos códigos. Los tickets regalo no incluyen este desglose.
- El ticket destaca **TOTAL COBRADO**, la suma de efectivo, tarjeta y Bizum. El efectivo a caja aparece aparte. La compra de 29,50 € con 24,85 € de vale y 4,65 € de tarjeta muestra 4,65 € cobrados y 0 € en efectivo.
- En el detalle del pedido, la cabecera y el resumen distinguen el total cobrado del total de compra. En Caja se conserva **Ventas brutas** y se añade **Total cobrado**. La tabla y el informe de cierre distinguen ambos importes.
- El aviso de pedidos sin registro ofrece **Conciliar pago**. El operador contrasta el ticket y confirma que pertenece a la sesión abierta. Se guarda el cobro existente en el diario, sin mutaciones de pago ni canjes de vales en Shopify. Se rechazan duplicados, sesiones cerradas, pedidos de otra sesión, devoluciones, cancelaciones, importes inconsistentes y operaciones pendientes. El aviso desaparece al tener un registro completo.

## Contabilidad

Los vales reutilizan saldo anterior: no forman parte del nuevo importe cobrado. Para #15046, el resultado esperado es compra 29,50 €, vale 24,85 €, tarjeta y cobrado 4,65 €, efectivo 0 €. Con fondo de 271,30 €, el efectivo teórico continúa en 271,30 €.

Los registros antiguos sin desglose continúan pendientes de conciliación y no muestran un importe cobrado de cero como si fuese verificado. El sistema no atribuye automáticamente un método ni una sesión a los pedidos sin datos.

## Validación y límites

- Pruebas de búsqueda: mayúsculas, minúsculas, código completo, espacios, paginación, coincidencias ambiguas y códigos inválidos.
- Pruebas de contabilidad y ticket con los importes de las fotos, lectura tras reiniciar el diario, varios vales y ticket regalo.
- Pruebas de conciliación sin mutaciones remotas, prevención de duplicados y rechazo de historiales incompatibles.
- Comprobación de tipos, lint y compilación de `dist`, que se versiona para el despliegue.
- Verificación visual local con Playwright y respuestas simuladas. No se han modificado pedidos ni sesiones de producción. Los pedidos #15043 y #15044 requieren contrastar sus tickets para conciliar sus pagos reales.

Referencia de la consulta paginada de códigos: [Shopify giftCards](https://shopify.dev/docs/api/admin-graphql/2025-10/queries/giftCards).
