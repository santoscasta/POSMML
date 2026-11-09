# Apertura de caja — 07/11/2026

Se reprodujo el error en `https://posmml-production.up.railway.app/caja`, con Microsoft Edge controlado por Playwright, autenticación real y API real. Al confirmar una apertura con fondo 0 €, Shopify devolvía `No metaobject definition exists for type "app--319421349889--pos_session"`.

La tienda de desarrollo sí tenía la definición `$app:pos_session`; la tienda de producción no la tenía ni contenía otra definición de sesiones de caja que migrar. No había un bloqueo `journal.lock` pendiente.

Se creó en producción la definición `gid://shopify/MetaobjectDefinition/56224121179`, con los mismos ocho campos y tipos de desarrollo, acceso administrativo y sin acceso desde el escaparate. Esta reparación de configuración ya está aplicada; no requiere desplegar el servidor.

Verificación posterior desde la web publicada:

- Apertura real con fondo 0 € y nota de prueba técnica.
- Recarga completa: la sesión sigue abierta y muestra 0 pedidos y todos los importes a 0 €.
- Cierre real con efectivo contado 0 €: informe «Caja cerrada», diferencia 0 €.
- Consulta final `/api/sessions/current`: HTTP 200, `null`.

La sesión de prueba quedó cerrada en el historial, con una nota que identifica la verificación. No se crearon pedidos, cobros, devoluciones ni vales.

Capturas: `output/playwright/caja-apertura-error-20261107.png`, `output/playwright/caja-apertura-correcta-20261107.png` y `output/playwright/caja-cierre-correcto-20261107.png`.

El código local añade la comprobación y creación de la definición al abrir caja, conservando las definiciones existentes y propagando rechazos de permisos. Esta prevención se publicará con el siguiente despliegue. Validación: `npm test`, 175/175 pruebas correctas; ESLint de los archivos de servidor modificados y `git diff --check`, correctos.

## Integración para producción — 09/11/2026

La prevención automática se incluye en el paquete de impresión y diagnóstico. La validación conjunta pasa 237 pruebas, incluida la creación de una definición ausente, la conservación de una existente y los rechazos de permisos. La reparación de configuración de producción del 7 de noviembre se conserva.
