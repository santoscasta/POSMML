# POS My mini Leo — Manual de Uso

## Inicio Rápido

1. Inicia el servidor: `npm run dev` (o `node server/index.js` + `npx vite --port 3000`)
2. Abre `http://localhost:3000` en el navegador
3. **Abre una sesión de caja** antes de cobrar

---

## 1. Dashboard (Inicio)

La pantalla principal muestra el estado general del sistema:

- **Conexión Shopify**: Indicador verde = conectado, rojo = desconectado
- **Sesión de Caja**: Abierta/Cerrada
- **Ventas del día**: Importe total y número de pedidos
- **Desglose de pagos**: Efectivo, Tarjeta y Bizum con barras de progreso
- **Vales activos**: Cantidad y saldo pendiente total

### Acciones rápidas
- **Abrir Caja** — Ir a la gestión de caja
- **Ir al POS** — Pantalla de cobro
- **Ver Pedidos** — Gestión de pedidos
- **Emitir Vale** — Crear un vale/gift card

---

## 2. Caja — Gestión de Sesión

### Abrir sesión
1. Ve a **Caja** en el menú lateral
2. Pulsa **Abrir sesión de caja**
3. Introduce el **monto de apertura** (fondo de caja en efectivo)
4. Introduce el **nombre del cajero**
5. Opcionalmente añade una nota
6. Pulsa **Abrir sesión**

> **IMPORTANTE**: No se pueden procesar cobros sin una sesión de caja abierta.

### Durante la sesión
La pantalla muestra en tiempo real:
- Nombre del cajero y hora de apertura
- **Pedidos** realizados en esta sesión
- **Ventas brutas** totales
- Desglose por método: **Efectivo / Tarjeta / Bizum**
- **Efectivo esperado** = Apertura + Ventas en efectivo - Devoluciones en efectivo

### Cerrar sesión (Arqueo)
1. Pulsa **Cerrar sesión de caja**
2. Cuenta el efectivo físico e introduce el **monto contado**
3. El sistema calcula automáticamente:
   - **Efectivo esperado**: lo que debería haber
   - **Diferencia**: sobrante (+) o faltante (-)
4. Añade notas si es necesario
5. Pulsa **Cerrar sesión**

### Historial
Debajo de la sesión actual aparecen las **últimas sesiones cerradas** con fecha, duración, ventas brutas y diferencia de arqueo.

---

## 3. POS — Punto de Venta (Cobro)

### Buscar productos
- Usa la **barra de búsqueda** para buscar por nombre o SKU
- Filtra por **categoría** con los chips (Todas, accessories, etc.)
- **Lector de código de barras**: compatible con escáner tipo wedge de teclado

### Añadir al carrito
- **Clic en un producto** lo añade directamente si tiene una sola variante
- Si tiene **múltiples variantes** (talla, color), se abre un selector
- Los productos **agotados** aparecen deshabilitados
- Las variantes sin stock no se pueden seleccionar

### Gestionar carrito
- **+/−** para ajustar cantidades
- **Papelera** para eliminar un artículo
- **Buscar cliente**: escribe nombre o email para asociar un cliente al pedido
- **Descuento**: porcentaje (%) o importe fijo (€)

### Desglose del carrito
- Subtotal
- Descuento (si aplicado)
- IVA incluido (21%)
- **Total final**

### Cobrar
1. Pulsa **Crear Pedido — XX,XX €**
2. Se abre el **modal de checkout**
3. Selecciona el **método de pago**:

| Método | Descripción |
|--------|-------------|
| **Efectivo** | Introduce el importe recibido. El sistema calcula el cambio a devolver |
| **Tarjeta** | Cobro directo por datáfono |
| **Bizum** | Cobro por Bizum |
| **Vale** | Introduce los últimos caracteres del vale. El sistema verifica el saldo. Si el vale cubre el total, se cobra íntegro. Si no cubre, se cobra lo que tenga el vale y el resto se pide en efectivo |
| **Mixto** | Combina dos métodos (ej: parte efectivo + parte tarjeta + parte vale) |

4. Pulsa **Confirmar pago**
5. El pedido se crea en Shopify con el tag **POS MML**

### Vaciar carrito
Pulsa **Vaciar Carrito** para empezar de cero.

---

## 4. Pedidos — Gestión y Devoluciones

### Buscar pedidos
- **Buscador** por número de pedido (#1001) o nombre de cliente
- **Filtros**: "Todos" o "Solo POS" (pedidos con tag POS MML)

### Ver detalle
Haz **clic en cualquier pedido** para abrir el detalle:
- Información del cliente
- Líneas del pedido (producto, variante, cantidad, precio)
- Desglose de precios (subtotal, descuentos, impuestos, total)
- Historial de reembolsos
- Estado de pago y envío

### Acciones sobre pedidos

#### Marcar como pagado
- Solo para pedidos con estado **Pendiente**
- Pulsa **Marcar como pagado**

#### Marcar como enviado (Fulfillment)
- Solo para pedidos **sin enviar**
- Pulsa **Marcar como enviado**
- El sistema asigna automáticamente los items a la ubicación disponible

#### Reembolsar
1. Pulsa **Reembolsar**
2. Elige el tipo:
   - **Reembolso total**: devuelve todo el pedido
   - **Reembolso parcial**: selecciona artículos y cantidades específicas
3. **Reponer inventario**: activa/desactiva según necesites devolver stock
4. Si restock activado, **selecciona la ubicación** (ej: "Shop location")
5. Elige el **método de reembolso**:

| Método | Qué ocurre |
|--------|-----------|
| **Efectivo** | Devuelves dinero en mano. Se registra en la sesión de caja |
| **Tarjeta** | Devolución al método de pago original |
| **Vale** | Se crea un **Gift Card en Shopify** por el importe. Se muestra el código para entregar al cliente |

6. Opcionalmente escribe el **motivo del reembolso**
7. Pulsa **Confirmar reembolso**

> Si eliges "Vale", se mostrará el código del gift card en pantalla. Apúntalo o imprímelo para el cliente.

#### Cancelar pedido
- Pulsa **Cancelar pedido**
- El pedido se cancela en Shopify con reembolso y reposición automática

---

## 5. Vales — Gift Cards de Shopify

### Ver vales
La pantalla muestra:
- **Estadísticas**: total emitidos, activos, agotados, cancelados, saldo activo
- **Filtros**: Todos, Activos, Agotados, Cancelados
- **Tabla**: código enmascarado, monto original, saldo, cliente, estado, fecha

### Emitir vale
1. Pulsa **Emitir Vale**
2. Introduce el **importe**
3. Opcionalmente: nombre del cliente, email, notas
4. Pulsa **Emitir**
5. Se muestra el **código completo del gift card** — apúntalo para el cliente

> El vale se crea directamente como Gift Card en Shopify.

### Ver detalle de vale
Haz **clic en un vale** para ver:
- Código enmascarado
- Importe original y saldo actual
- Estado (Activo, Agotado, Cancelado)
- Datos del cliente (si tiene)

### Cancelar vale
- En el detalle, pulsa **Cancelar vale**
- Confirma la cancelación
- El gift card se desactiva en Shopify

### Consultar saldo
- Usa el **verificador de saldo** para comprobar rápidamente el saldo de un vale por sus últimos caracteres

---

## 6. Flujo Diario Típico

### Apertura (mañana)
1. Abre el POS → Dashboard
2. Ve a **Caja** → **Abrir sesión**
3. Cuenta el fondo de caja e introdúcelo (ej: 150€)
4. Escribe tu nombre → **Abrir sesión**

### Durante el día
1. Ve al **POS**
2. Para cada venta:
   - Busca/escanea productos
   - Añade al carrito
   - Asocia cliente (opcional)
   - Aplica descuento (opcional)
   - Pulsa **Crear Pedido**
   - Selecciona método de pago → **Confirmar**
3. Para devoluciones:
   - Ve a **Pedidos**
   - Busca el pedido
   - Pulsa en él → **Reembolsar**
   - Elige método (efectivo/tarjeta/vale) → **Confirmar**
4. Para emitir vales:
   - Ve a **Vales** → **Emitir Vale**

### Cierre (noche)
1. Ve a **Caja**
2. Revisa los KPIs del día
3. Pulsa **Cerrar sesión**
4. Cuenta el efectivo físico
5. Introduce el monto contado
6. Revisa la diferencia → **Cerrar**

---

## 7. Datos Importantes

| Concepto | Detalle |
|----------|---------|
| **IVA** | 21% incluido en precios |
| **Moneda** | EUR (€) |
| **Tag de pedidos POS** | `POS MML` |
| **Vales** | Gift Cards de Shopify |
| **Sesión de caja** | Obligatoria para cobrar |
| **Lector de barras** | Compatible con wedge USB |

## 8. Resolución de Problemas

| Problema | Solución |
|----------|---------|
| "Abre una sesión de caja antes de cobrar" | Ve a Caja → Abrir sesión |
| "No access token" | Reinicia el servidor backend |
| Producto no aparece | Verifica que esté publicado y con stock en Shopify |
| Error al reembolsar "Quantity cannot refund more" | El pedido ya fue reembolsado total o parcialmente |
| Vale no encontrado | Verifica los últimos 4 caracteres del código |

---

*POS My mini Leo v1.0 — Marzo 2026*
