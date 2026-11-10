# Gestión de productos

La pestaña **Productos** está disponible para administradores, en el menú lateral y en el menú inferior del móvil. También se accede desde `/productos`.

- Busca por nombre, marca, etiquetas, SKU o código de barras. Filtra por estado, existencias o tipo y ordena las columnas.
- El botón con el **ojo** abre una ficha de solo lectura con fotografías, descripción, categorías, referencias, variantes y existencias. **Historial** muestra las fechas del producto y los eventos disponibles en Shopify, con paginación. Los enlaces de historial de stock abren el registro de inventario de cada variante en Shopify. Consultar la ficha o el historial no guarda cambios. Shopify no facilita por la API un registro completo de todas las ediciones o ajustes antiguos.
- **Nuevo producto** permite crear un borrador o producto activo con descripción, marca, categorías, etiquetas y variantes. Cada variante tiene nombre, precio, SKU y código de barras. Tras crear el producto, abre **Stock** para asignar existencias.
- **Datos** permite modificar el nombre, descripción, marca, tipo, categorías, etiquetas y estado. Archivar conserva el producto y lo retira de la venta en el POS.
- **Variantes** permite editar precios y referencias, añadir variantes y eliminar variantes tras una confirmación. La eliminación es permanente; la última variante se conserva en la interfaz.
- **Stock** permite elegir una variante y corregir las unidades disponibles por ubicación. También se puede activar el seguimiento de inventario. Si las existencias cambian mientras editas, actualiza el stock antes de volver a guardar.
- **Imágenes** permite subir una fotografía JPG, PNG o WebP de hasta 8 MB, o añadir una imagen mediante una URL HTTPS pública. Shopify procesa la imagen; actualiza el catálogo unos instantes después para verla.

Los cambios se guardan directamente en la tienda Shopify configurada para el entorno. Los datos generales, cada variante y cada ubicación se guardan con su propio botón. Los cambios en el POS se cargan al volver a la pantalla de venta.

La creación conserva su identificador y los datos enviados en el navegador hasta confirmar el resultado. Si se interrumpe la conexión, **Comprobar creación** recupera el intento original. El servidor guarda un registro independiente en `POS_DATA_DIR/products` y busca el producto creado por su identificador antes de permitir otra creación con el mismo intento.

La integración se ha comprobado en la tienda de desarrollo con un producto temporal: creación, recuperación, edición, variantes, fotografías, stock y archivado. El producto temporal se eliminó al terminar.

Pruebas unitarias y de permisos:

```sh
node --test server/tests/products.test.js
```
