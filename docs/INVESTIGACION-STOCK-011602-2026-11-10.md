# Stock del pedido #011602 — 10/11/2026

Investigación de solo lectura en Shopify de producción, diario persistente del
TPV, código desplegado y WooCommerce. Todas las horas siguientes son de Madrid.
No se han modificado existencias, pedidos ni operaciones comerciales.

## Resultado

El cambio realizado desde el TPV no repuso el sobrepijama en Shopify, aunque
se había solicitado la reposición. WooCommerce sí registra una reposición
posterior y la venta de esa unidad al día siguiente. Por tanto, el stock actual
de cero no justifica sumar una unidad: hay una venta posterior documentada.

Prenda: **Sobrepijama rosa con flores rosas, 12 meses**, una unidad, 44,95 €.

## Secuencia comprobada

| Fecha y hora | Evidencia |
| --- | --- |
| 05/11/2026 19:26:55 | Pedido Woo #23689, ID 49277, con la variante 42683 del producto 42682. |
| 06/11/2026 23:54:05 | Importación a Shopify como #011602, ID 8689912545627. El sobrepijama aparece como línea sin variante; el babero sí está vinculado al catálogo. |
| 09/11/2026 18:39:01–18:39:06 | Cambio del TPV, operación `47f161c7-6eeb-485b-a337-bd8e732d8ec3`, que genera #011640. El diario conserva `restock: true`, ubicación Asunción 38 y `inventoryItemId: null` para el sobrepijama. No existe paso `exchange-restock`. |
| 09/11/2026 18:59:09 | Nota 39103 de Woo #23689: «Inventario del artículo #42683 incrementado de 0 a 1». Devolución técnica 49315, importe 0 €, cantidad -1 de la prenda. |
| 10/11/2026 18:49:24–18:49:29 | Venta Woo #23734, ID 49330, de una unidad de la misma variante. Nota 39143: stock del sobrepijama de 1 a 0. |

La consulta actual devuelve cero unidades tanto en WooCommerce como en Shopify.
En Shopify, la variante correcta es `54661370315099`, inventario
`56798936826203`, ubicación Asunción 38 (`99586474331`): disponible 0,
físico 0, comprometido 0. El producto Shopify `10866278400347` conserva
`custom.woo_id = 42682`, que confirma la correspondencia con WooCommerce.

## Causa del fallo en Shopify

El artículo del pedido importado, línea `20508524609883`, no está vinculado a
una variante (`variant: null`, `restockable: false`). El diario confirma que
esa vinculación ya faltaba al calcular el cambio, antes de ejecutarlo.

El código desplegado de `server/lib/exchange.js` convierte esa ausencia en
`inventoryItemId: null` (línea 55). Después filtra las prendas que no tienen
identificador de inventario (línea 126) y solo ejecuta la reposición si queda
alguna (línea 127). En este caso no quedó ninguna: el cambio terminó, pero
la solicitud de reponer no produjo un ajuste ni un aviso de esa omisión.

El importador local `syncWooShopify/woo-shopify-sync.html`, función
`syncOrders`, busca las líneas por SKU o título exacto. La línea original de
Woo no tiene SKU y su nombre incluye « - 12 meses»; el producto Shopify se
titula «Sobrepijama rosa con flores rosas». Ese caso sigue el fallback que
crea una línea por título sin `variant_id`. Es una explicación consistente
con los datos conservados y con el código disponible; no se dispone del
payload histórico enviado por el importador.

## Acción recomendada

No incrementar el stock actual por este incidente: Woo documenta que la
unidad repuesta volvió a venderse. Para evitar repeticiones, el TPV debe
detectar las líneas sin vínculo de inventario cuando se solicita reponer y
exigir resolverlas antes de completar el cambio. El importador debe vincular
productos y tallas mediante identificadores de origen, sin depender del título
completo ni elegir la primera variante de un producto.

La investigación no ha aplicado esas correcciones de código ni ha repetido el
cambio. La evidencia de consultas y el extracto del diario se conservan fuera
de Git en `.pos-data/investigation-011602/`.
