# QA integral — tienda de desarrollo — 15/09/2026

Estado: en curso. Las operaciones reales con efectos pendientes de ejecución no se consideran aprobadas.

## Entorno y conservación

Shopify confirma `MiminileoDev`, dominio `miminileodev.myshopify.com`, plan `Basic App Development`, `partnerDevelopment: true`, moneda EUR. La lectura directa usa la integración local de este repositorio. Las credenciales locales no autentican el POS publicado en Railway (401); no se ha confirmado aún que el servidor publicado use esta misma tienda.

Estado inicial guardado en `output/qa-live-2026-09-15/`: sesiones, catálogo completo, categorías y lecturas de vales. Hay una caja OPEN de Celia con fondo 158,15 €. No se ha modificado.

La API expone desactivación de vales, pero no eliminación. Su emisión, consumo y reembolso pueden dejar trazas permanentes. Los correos enviados tampoco pueden retirarse. Se ha solicitado resolver esta excepción a la condición de restauración antes de ejecutarlos. El acceso al POS publicado también está pendiente.

## Reglas para evaluar el circuito

- Apertura con cajero y fondo explícito, no negativo y con hasta dos decimales; una única caja abierta.
- Cobro con caja abierta, cantidades positivas, precios válidos y total confirmado por Shopify.
- Efectivo recibido suficiente y cambio correcto; en mixtos, suma exacta de las partes y tratamiento explícito del efectivo.
- Una respuesta perdida o un doble clic nunca duplican venta, débito o devolución.
- Devolución limitada al saldo reembolsable, con método registrado; el efectivo exige disponibilidad de caja.
- Teórico = fondo + cobros en efectivo (incluidos mixtos) − devoluciones en efectivo. Tarjeta, Bizum y vale no añaden efectivo.
- Cierre con recuento explícito y diferencia visible; ninguna operación incierta pendiente.
- Stock cero: bloquear salvo política explícita de venta sin existencias. Es necesario validar el comportamiento del producto y de la interfaz, no solo su cifra de inventario.

Oráculo: fondo 100 €, venta CASH 20 € entregando 50 €, mixto 10 € CASH + 15 € CARD y devolución CASH 5 € ⇒ teórico 125 €.

## Ejecutado

- 36 pruebas existentes aprobadas; TypeScript y ESLint correctos.
- 71 casos adicionales de cálculo: los 15 subconjuntos no vacíos de CASH/CARD/BIZUM/VOUCHER con cuatro importes (0,01; 1; 19,99; 100), ocho entradas inválidas y tres métodos de devolución.
- Lectura paginada de 377 productos y 1.035 variantes; 214 variantes con stock <= 0; ninguna con paginación de variantes incompleta ni productos con más de 20 variantes.
- 76 categorías; sin referencias de pertenencia a categorías inexistentes.
- Producto ACTIVE sin categoría: «Botella termica amarilla y negra», `gid://shopify/Product/15791979757945`.
- Rutas locales usando Shopify real y registro local aislado: sesión actual, cinco sesiones históricas, 16 vales, estadísticas y dashboard responden 200. Esto no valida el volumen de movimientos de Railway.
- Reproducción aislada: pago mixto con 10 € CASH + 10 € CARD acepta `cashReceived: 0`; requiere tratamiento del efectivo recibido/cambio.

## Matriz pendiente de operaciones reales

| Área | Casos |
|---|---|
| Caja | Fondo 0/positivo, importe omitido/negativo, apertura doble, cierre exacto/descuadre, sesión antigua abierta, pendientes |
| Catálogo | Tres vistas, árbol multinivel, búsqueda, códigos de barras, variantes, stock cero, producto sin categoría |
| Cobros | Efectivo exacto/con cambio/insuficiente, tarjeta, Bizum, vale, mixtos, cero, céntimos, descuentos fijo/porcentaje/100 % |
| Vales | Emisión, correo, consumo parcial/total, agotado, desactivado, caducado, inexistente, código ambiguo, recuperación |
| Pedidos | Consulta, búsqueda, detalle, cliente, ticket, entrega, cancelación y reposición |
| Devoluciones | Parcial/total/repetida/excesiva, efectivo/tarjeta/vale, stock con/sin reposición, efectivo insuficiente |
| Recuperación | Doble envío y fallo antes/después de cada mutación, recarga y reanudación |
| Dispositivos | Escritorio/móvil y vista de impresión; impresora, lector y terminal físicos requieren dispositivos |
| Limpieza | Eliminar solo entidades creadas por este ensayo; verificar existencias y estados iniciales; informar trazas no eliminables |

## Evidencias

`output/qa-live-2026-09-15/read-audit.mjs`, `read-summary.json`, `products-before.json`, `categories-before.json`, `baseline.json`, `accounting-matrix.mjs` y `accounting-results.json`.

No se han creado ventas, devoluciones, vales, clientes ni sesiones reales ni se han enviado correos en esta fase.
