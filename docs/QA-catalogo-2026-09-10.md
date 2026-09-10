# Catálogo completo y cesta visible

El POS carga automáticamente todas las páginas del catálogo que corresponden a los filtros actuales. Muestra los primeros resultados durante la carga, incorpora categorías de las páginas posteriores y descarta respuestas antiguas al cambiar filtros. Si Shopify limita las consultas, reintenta con espera progresiva; otros errores muestran aviso y reintento explícito. Las imágenes se cargan al acercarse a la zona visible.

El catálogo tiene desplazamiento propio dentro de la altura disponible. La cesta permanece visible a la derecha desde 1024 px, con desplazamiento independiente para su contenido. En móvil se mantienen las pestañas Productos/Carrito.

Validado con Edge y API simulada: 90 productos en tres páginas sin botón «Cargar más», categoría procedente de la última página, selección del último producto y cesta visible al final del catálogo a 1366 y 1024 px. Comprobada navegación al carrito a 390 px sin desbordamiento horizontal. Repetida la prueba con una respuesta Throttled en la segunda página: recuperación automática y catálogo completo.

TypeScript, ESLint y compilación Vite correctos. La compilación mantiene el aviso existente sobre tamaño de bundle. No se han realizado ventas ni cambios en Shopify para estas pruebas.
