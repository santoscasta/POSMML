# Control horario · primera versión

## Vista local

Ejecuta `npm run dev:horario` y abre <http://127.0.0.1:5180/horario>.

- Acceso al TPV de prueba: usuario `demo`, contraseña `demo`.
- Marta, responsable: PIN `1234`.
- Ana, empleada: PIN `2345`.
- Leo, empleado: PIN `3456`.

Esta vista ejecuta el frontend y las rutas reales de control horario, con datos de
ejemplo independientes en `.pos-data/attendance-preview/journal.json`. No carga
las credenciales de `.env`, no conecta con Shopify y no ejecuta el servicio de
correo. Las pantallas de operaciones comerciales no están habilitadas en esta
vista. `ATTENDANCE_PREVIEW_PORT` permite elegir otro puerto.

Los ejemplos se crean una sola vez. Los cambios persisten entre reinicios.

## Uso

1. Accede a **Horario** e identifícate con tu nombre y PIN.
2. Registra entrada, inicio de pausa, regreso y salida. Se permiten jornadas
   partidas y salida directa durante una pausa.
3. Consulta el historial y despliega **Ver fichajes** para ver cada evento.
4. Filtra por fechas y descarga las jornadas visibles como CSV.
5. Como responsable, consulta el equipo y gestiona altas y bajas en
   **Ajustes → Empleados**. La baja conserva el historial y requiere haber
   registrado la salida. Los empleados ven únicamente sus propios registros.

Las pausas se descuentan íntegramente del tiempo trabajado en esta primera
versión. El historial filtra por la fecha de inicio de la jornada en Madrid;
una jornada que atraviese medianoche se muestra completa en su fecha de entrada.
Los totales de jornadas abiertas son provisionales y se actualizan cada 30 segundos.

Cambiar de persona, salir del TPV, cerrar el navegador o cerrar caja mantiene
la jornada abierta. La identificación por PIN caduca a las ocho horas o al
reiniciar el servidor, sin perder los fichajes.

## Integración con el servidor habitual

Las rutas `/api/attendance/*` se montan detrás de la autenticación actual del
TPV. La identificación por PIN añade permisos propios del módulo horario; no
modifica los permisos de las operaciones comerciales existentes.

Sin empleados configurados, el primer acceso permite crear al responsable.
Los PIN se almacenan con scrypt y sal individual; no se devuelven en la API.
Los tokens se conservan en memoria y las rutas de gestión verifican el rol en
el servidor. La identificación admite diez intentos por minuto y dirección IP.

En el servidor habitual los datos se guardan en
`POS_DATA_DIR/attendance/journal.json`, con bloqueo independiente de las ventas.
Mantén una única réplica y realiza copias del directorio completo de datos.
La vista local no configura ni despliega cambios en Railway.

## Alcance pendiente

Esta versión conserva los eventos originales y no ofrece edición ni eliminación
de fichajes. Quedan pendientes las solicitudes de corrección con aprobación y
auditoría, recuperación de PIN desde la interfaz, horarios previstos, avisos por
olvido y sincronización sin conexión. Sin conexión no se confirma el fichaje:
hay que reintentar. El mismo intento reutiliza su identificador para evitar
duplicados si se perdió la respuesta.

## Verificación

- `npm test`: pruebas del servidor, incluidas identidad, permisos, persistencia,
  reintentos, pausas, concurrencia, caducidad y cambio de hora en Madrid.
- `npx tsc -b`: comprobación de tipos del frontend.
- Para compilar el servidor habitual, sigue `OPERACION_POS.md`.
