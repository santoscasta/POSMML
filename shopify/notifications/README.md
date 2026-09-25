# Notificación «Nuevo vale» de My mini Leo

El TPV envía el vale con `giftCardSendNotificationToCustomer`. Shopify genera ese correo usando su notificación **Nuevo vale / New gift card**. El archivo [new-gift-card.liquid](new-gift-card.liquid) sustituye el cuerpo HTML de esa notificación; no se activa al desplegar el TPV.

## Para instalarla en Shopify

1. En el panel de Shopify, abre **Configuración → Notificaciones → Notificaciones de clientes → Tarjetas de regalo → Nueva tarjeta de regalo / New gift card**.
2. Guarda una copia del HTML actual antes de editarlo.
3. Cambia el asunto a **Tu vale My mini Leo**.
4. Abre **Editar código**, sustituye el cuerpo HTML por `new-gift-card.liquid`, usa **Vista previa** y envía un correo de prueba.
5. Comprueba en móvil el logo, el saldo, el código completo, el enlace de saldo y el texto de uso en tienda. Después, guarda.

La captura original muestra el remitente «MimimileoDev». Revisa además el nombre público de la tienda en **Configuración → General** y el correo remitente en la configuración de notificaciones: son ajustes distintos del cuerpo HTML y no los cambia esta plantilla.

La plantilla usa el logo de las notificaciones de Shopify si está configurado; en caso contrario usa el banner público de myminileo.com. Sus colores y tipografía proceden de la web: azul `#91a1bb`, fondo blanco y gris claro, texto `#333333` / `#6d6d6d` y fuente Arial como alternativa segura para correo al Source Sans Pro de la web.

**Uso online:** los vales del TPV son tarjetas de regalo de Shopify. La tienda pública `myminileo.com` usa WooCommerce, así que el código no queda conectado automáticamente a su caja online. La plantilla informa de uso en tienda física y conserva el enlace de Shopify exclusivamente para consultar el saldo. Para aceptar estos vales en la web hará falta una integración entre los saldos de Shopify y el checkout de WooCommerce, con reserva y débito seguros del saldo.
