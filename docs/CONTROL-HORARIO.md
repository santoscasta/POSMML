# Control horario · primera versión

## Vista local

Ejecuta `npm run dev:horario` y abre <http://127.0.0.1:5180/horario>.

- Marta, administradora: usuario `admin`, contraseña `admin1234`.
- Ana, colaboradora: usuario `ana`, contraseña `ana12345`.
- Leo, colaborador: usuario `leo`, contraseña `leo12345`.

El acceso por cuenta identifica también a la persona que ficha. No se solicita
un segundo PIN ni se permite cambiar de empleado manteniendo la misma sesión.

Esta vista ejecuta el frontend y las rutas reales de control horario, con datos de
ejemplo independientes en `.pos-data/attendance-preview/journal.json`. No carga
las credenciales de `.env`, no conecta con Shopify y no ejecuta el servicio de
correo. Las pantallas de operaciones comerciales no están habilitadas en esta
vista. `ATTENDANCE_PREVIEW_PORT` permite elegir otro puerto y
`ATTENDANCE_PREVIEW_DATA_DIR` permite usar otro directorio de pruebas. Las cuentas
y el registro de accesos se guardan en `access/journal.json` dentro de ese directorio.

Los ejemplos se crean una sola vez. Los cambios persisten entre reinicios.

## Uso

1. Inicia sesión con tu cuenta y accede a **Horario**.
2. Registra entrada, inicio de pausa, regreso y salida. Se permiten jornadas
   partidas y salida directa durante una pausa.
3. Consulta el historial y despliega **Ver fichajes** para ver cada evento.
4. Filtra por fechas y descarga las jornadas visibles como CSV.
5. Como administrador, consulta el equipo y gestiona altas y bajas en
   **Ajustes → Empleados**. La baja conserva el historial y requiere haber
   registrado la salida. Los colaboradores ven únicamente sus propios registros.
6. En **Ajustes → Usuarios y sesiones**, el administrador crea cuentas, asigna
   perfil y empleado, cambia contraseñas y consulta o revoca sesiones de acceso.
   El registro de accesos también dispone de exportación CSV.

## Horarios permitidos por empleado

En **Ajustes → Usuarios y sesiones**, despliega la cuenta y ve a **Horario de…**.
Activa **Aplicar límites de entrada y salida**, indica entrada prevista, salida
prevista y margen, y pulsa **Guardar horario**. El margen inicial es de ±15
minutos, configurable entre 0 y 120 minutos. Por ejemplo, entrada 09:00 y salida
17:00 permiten fichar entrada entre 08:45 y 09:15 y salida entre 16:45 y 17:15.

Los límites de los colaboradores se aplican en el servidor con la hora de Madrid y se repiten cada día.
Los minutos mínimo y máximo están incluidos completos. Las franjas pueden cruzar
medianoche; por ejemplo, 23:55 ±15 permite de 23:40 a 00:10. Esta versión no incluye
calendario semanal ni varios turnos previstos por día.

Fuera de la franja el botón del colaborador se bloquea y el servidor también rechaza
las peticiones directas. Las pausas y los regresos siguen disponibles durante una jornada abierta.
Un cambio de horario no cierra la sesión del usuario y afecta a los siguientes
fichajes. Para una excepción, el administrador debe ajustar el horario o desactivar
el límite; siempre se guarda la hora real, sin redondearla ni sustituirla.

Sin horario configurado, o con el límite desactivado, se conserva el fichaje libre.
Los datos de ejemplo existentes no se restringen automáticamente.

Los administradores también registran su entrada, pausas y salida con su propia
ficha de empleado. Pueden tener un horario previsto, pero su perfil permite fichar
a cualquier hora, sin bloqueo por las franjas. En su cuenta, la opción se muestra
como **Registrar horario previsto (sin bloqueo para administradores)**. Si aún no
tienen ficha asociada, deben crearla en **Ajustes → Empleados** y vincularla a su
cuenta en **Ajustes → Usuarios y sesiones**; Horario incluye un acceso a esa configuración.
Se conserva la hora real y el CSV indica **No (administrador)** en las columnas de
bloqueo horario de entrada y salida. La exención se guarda con cada fichaje para
conservarla aunque después cambie el perfil. Una antigua marca de responsable o
un rol enviado por el navegador no exime a un colaborador.

La configuración y su historial de cambios se guardan junto a los empleados en
`attendance/journal.json` (en la prueba, `.pos-data/attendance-preview/journal.json`).
Los cambios conservan responsable, fecha y configuración anterior. Cada entrada y
salida restringida guarda la franja que tenía en ese momento; el historial y el CSV
incluyen esos límites originales. Los fichajes anteriores a esta función dejan esas
columnas vacías. El CSV conserva también los minutos de trabajo y pausa originales.

Las pausas se descuentan íntegramente del tiempo trabajado en esta primera
versión. El historial filtra por la fecha de inicio de la jornada en Madrid;
una jornada que atraviese medianoche se muestra completa en su fecha de entrada.
Los totales de jornadas abiertas son provisionales y se actualizan cada 30 segundos.

Cambiar de persona, salir del TPV, cerrar el navegador o cerrar caja mantiene
la jornada abierta. La sesión de acceso caduca a las ocho horas. Se conserva
al recargar la pestaña y al reiniciar el servidor mientras siga vigente. El
administrador puede revocarla; modificar una cuenta revoca sus sesiones abiertas.

## Integración con el servidor habitual

Las rutas `/api/attendance/*` requieren la sesión de acceso al TPV. El perfil
administrador ve el equipo y su historial; el colaborador queda limitado a su
empleado asociado. El servidor verifica esta relación en cada petición, aunque
se intente enviar un identificador de otra persona o un antiguo token de PIN.

La primera cuenta de administrador se crea desde `POS_USERNAME` y `POS_PASSWORD`
en un almacén de accesos vacío. Las cuentas posteriores se gestionan en Ajustes.
Los perfiles de acceso se controlan allí; la antigua marca interna de responsable
de un empleado no otorga permisos de administrador al colaborador.

Las contraseñas usan scrypt con sal individual. Los tokens son aleatorios y
solo se guarda su hash en el servidor. La identificación admite diez intentos
por minuto y dirección IP. Las cuentas y sesiones se guardan en
`POS_DATA_DIR/access/journal.json` y se deben incluir en las copias de seguridad.

En el servidor habitual los datos se guardan en
`POS_DATA_DIR/attendance/journal.json`, con bloqueo independiente de las ventas.
Mantén una única réplica y realiza copias del directorio completo de datos.
La vista local no configura ni despliega cambios en Railway.

## Alcance pendiente

Esta versión conserva los eventos originales y no ofrece edición ni eliminación
de fichajes. Quedan pendientes las solicitudes de corrección con aprobación y
auditoría, recuperación automática de contraseñas, calendario semanal, avisos por
olvido y sincronización sin conexión. Sin conexión no se confirma el fichaje:
hay que reintentar. El mismo intento reutiliza su identificador para evitar
duplicados si se perdió la respuesta.

## Verificación

- `npm test`: pruebas del servidor, incluidas identidad, permisos, persistencia,
  reintentos, pausas, concurrencia, caducidad y cambio de hora en Madrid.
- `npx tsc -b`: comprobación de tipos del frontend.
- Para compilar el servidor habitual, sigue `OPERACION_POS.md`.
