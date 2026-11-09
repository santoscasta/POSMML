# Impresión y pausas del TPV — 07/11/2026

## Evidencia de producción

Se revisaron los logs de 12:55 a 13:05, hora de Madrid. El cobro de las 12:58:09 terminó con HTTP 200 en 4,668 segundos. Después de cargar el logo del ticket a las 12:58:11, no hubo más peticiones hasta la carga de la aplicación a las 13:01:12 y el acceso de las 13:01:15. Otro cobro terminó a las 13:02:10 en 4,629 segundos, seguido de una nueva carga y acceso a las 13:02:37–39. No aparecen excepciones ni reinicios del servidor en esa franja.

El usuario indicó que la pausa parecía coincidir con imprimir. Los logs no registran el diálogo de impresión ni los errores del navegador, por lo que no demuestran la causa exacta en su equipo Windows.

## Cambio local

La implementación anterior escribía el ticket en una ventana vinculada al TPV y llamaba a `print()` desde el proceso de preparación del documento. `print()` bloquea durante el diálogo y espera a que termine la carga del documento, según [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/print).

La nueva implementación abre un documento Blob en una pestaña con `noopener`; esa pestaña espera sus recursos y ejecuta la impresión por sí misma. Una confirmación por BroadcastChannel permite detectar ventanas bloqueadas, ya que [`window.open()` con `noopener` devuelve `null` incluso cuando abre correctamente](https://developer.mozilla.org/en-US/docs/Web/API/Window/open). Los canales y las URL temporales se liberan al recibir la confirmación o al agotar cinco segundos.

El ticket conserva logo, formato térmico y caracteres en español. Si el logo o las fuentes no terminan de cargar en cinco segundos, continúa con un texto de marca en lugar del logo. Las imágenes se marcan como diferidas para que una descarga atascada no mantenga pendiente el evento de carga del documento y, por tanto, la apertura del diálogo nativo. Hay botones para repetir la impresión y cerrar la pestaña, ocultos en papel.

Se utiliza el mismo mecanismo en tickets normales y regalo, reimpresiones de pedidos, vales, cambios y el informe de cierre de caja. No cambia el registro ni la recuperación de los cobros.

## Validación

- Microsoft Edge real en macOS, página de prueba local, módulos reales de impresión y ticket. No se crearon pedidos ni se llamó a Shopify.
- Bloqueo simulado de cuatro segundos dentro de la ventana de impresión: la pantalla principal aceptó una acción en 128 ms y mantuvo 40 actualizaciones durante el bloqueo; `window.opener` era `null` y hubo una sola llamada a imprimir en el ticket.
- Petición del logo retenida: el documento completa su carga, activa la impresión después del límite de cinco segundos y muestra «My mini Leo». Reimpresión manual y cierre correctos.
- Ventana bloqueada simulada: la promesa devuelve `false` después de cinco segundos para activar los avisos existentes.
- Verificación en navegador del módulo minificado: apertura independiente, logo y caracteres correctos.
- Revisión visual de los tickets de pantalla y de papel: los controles no aparecen al imprimir.
- Pruebas Node, comprobación de tipos, ESLint de los archivos modificados, compilación de producción y revisión de espacios.

La impresora física y el diálogo de impresión del equipo Windows del usuario no se han probado. El atasco se simuló sustituyendo `window.print()` dentro de la pestaña de prueba. Este cambio está preparado localmente y no se ha desplegado en producción.

Artefactos: `output/playwright/print-isolation-qa.cjs`, `print-stalled-renderer-qa.cjs`, `print-failure-cases-qa.cjs`, y capturas `print-isolated-ticket.png`, `print-isolated-paper.png`, `print-pos-responsive.png`, `print-logo-fallback.png` en el mismo directorio.

## Integración para producción — 09/11/2026

La versión preparada integra la impresión independiente, el diagnóstico y la comprobación de la definición de caja sobre los últimos cambios publicados de pedidos, tarjetas regalo, cancelaciones y cambios con pagos confirmados. Validación conjunta: 237 pruebas aprobadas, TypeScript, ESLint de los archivos modificados y compilación correctos. Se repitieron en Microsoft Edge las pruebas de bloqueo del renderizador de impresión, logo atascado, reimpresión y ventana bloqueada. Sigue pendiente la prueba con la impresora física del equipo Windows.
