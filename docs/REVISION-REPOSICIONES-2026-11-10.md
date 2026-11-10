# Revisión de reposiciones y alertas — 10/11/2026

Se revisó el diario completo de producción: 85 operaciones desde el
28/10/2026, con 4 devoluciones y 3 cambios. Se contrastaron los 7 pedidos con
Shopify y se consultaron también todos sus pedidos actualmente reembolsados,
parcialmente reembolsados o cancelados (4, sin páginas pendientes).
No se han modificado pedidos, existencias ni operaciones comerciales.

## Resultado de la revisión

| Pedido | Operación | Resultado |
| --- | --- | --- |
| #011602 | Cambio del 09/11 a las 18:39 → #011640 | Se omitió reponer 1 sobrepijama rosa con flores rosas, 12 meses. Woo repuso de 0 a 1 a las 18:59 y volvió a vender esa unidad el 10/11 a las 18:49 (#23734). Stock actual: Woo 0, Shopify 0. No sumar otra unidad por este incidente. |
| #011577 | Cambio del 09/11 a las 19:03 → #011642 | Se omitió reponer 1 Pelele Sendero, 18–24 meses. Woo #23664 (ID 49219) repuso de 2 a 3 el 09/11 a las 19:13:56. Stock actual: Woo 3, Shopify 2. No se ha aplicado ajuste. |
| #011635 | Cambio del 10/11 a las 13:10 → #011647 | Paso `exchange-restock` confirmado; las dos prendas tienen identificador de inventario. |
| #011636, #011637, #011638, #011639 | Cuatro devoluciones | Shopify confirma `RETURN` y `restocked: true` en Asunción 38. Los cuatro pedidos están cancelados. |

Todas las horas son de Madrid. Para el pelele se consultaron los 100 pedidos
más recientes desde el 01/11; no se encontró una venta posterior de esa
variante en esa página. La diferencia 3/2 es la observada en la consulta;
antes de corregirla se debe contrastar con las unidades físicas.

Correspondencia comprobada del pelele: producto Woo `48151`, variante `48154`;
producto Shopify `10866037883227` (`custom.woo_id = 48151`), variante
`54659987341659`, talla 18–24 meses.

Los dos cambios afectados se completaron con `restock: true`, pero su
cotización conserva `inventoryItemId: null`. No tienen paso de reposición.
La causa es la omisión de líneas sin variante en los pedidos importados;
no hay evidencia de una petición de ajuste de stock rechazada para esos casos.

La revisión se limita al historial conservado en esta instalación y a los
estados remotos consultados; no reconstruye movimientos históricos de almacén
ni certifica la vinculación de todas las líneas de pedidos importados.

## Protección añadida

- Cambios y devoluciones muestran una alerta con los artículos seleccionados
  sin variante vinculada o sin control de inventario. Se bloquea la confirmación
  con reposición; desactivarla mantiene un aviso explícito de que no aumenta stock.
- El servidor valida las líneas antes de modificar inventario, crear un cliente,
  reembolsar o generar pedidos y vales. También valida cotizaciones guardadas
  antes de este cambio y las cancelaciones que solicitan reponer.
- Las comprobaciones recorren todas las páginas del pedido y rechazan respuestas
  incompletas, sin aceptar una reposición parcial por omisión.
- Después de un reembolso con reposición, se comprueban las cantidades,
  ubicación, tipo y `restocked` guardados por Shopify. Si falta confirmación,
  se conserva el reembolso en caja y la operación queda pendiente; reanudar
  comprueba la misma devolución sin repetirla ni emitir un vale anticipadamente.
- Inicio muestra los cambios anteriores que terminaron sin reposición
  confirmada, con acceso al pedido. La alerta describe el fallo histórico y pide
  comprobar correcciones y ventas posteriores; no presupone una unidad pendiente.
- Los bloqueos y resultados inciertos se registran con código de error y
  correlación de petición, sin registrar títulos, datos personales ni credenciales.

## Validación

269 pruebas automatizadas correctas en el espacio de trabajo y 266 en el
paquete aislado de producción (sin las tres pruebas locales de configuración
de desarrollo). TypeScript, ESLint de los archivos modificados y compilación
de producción correctos. Regresiones específicas: artículo
sin variante, inventario no controlado, lote mixto sin reposición parcial,
cotización guardada, paginación, cancelación y reposición de devolución sin
confirmar, con reanudación sin duplicar el reembolso.

Las consultas reales de Shopify han confirmado los campos usados para verificar
reposiciones. Las pruebas de navegador utilizan respuestas simuladas: no
crean ventas, devoluciones, clientes, vales ni ajustes reales.

Evidencia privada: `.pos-data/audit-restocks-20261110/`. Incluye las consultas,
el manifiesto de archivos de la publicación y una copia privada de los tres
diarios persistentes antes de publicar. No se incluyen estos datos en Git.
