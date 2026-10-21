import { PosError } from "./operationStore.js";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const validTime = (value) =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const minutes = (value) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const format = (value) => {
  const minute = ((value % 1440) + 1440) % 1440;
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
};

export function normalizeSchedule(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    typeof input.enabled !== "boolean"
  )
    throw new PosError("Indica si se aplican límites de horario.");
  const entryTime = input.entryTime ?? (input.enabled ? undefined : "09:00");
  const exitTime = input.exitTime ?? (input.enabled ? undefined : "17:00");
  if (!validTime(entryTime) || !validTime(exitTime))
    throw new PosError(
      "Indica las horas de entrada y salida en formato HH:mm.",
    );
  if (input.enabled && entryTime === exitTime)
    throw new PosError("La entrada y la salida deben tener horas diferentes.");
  const toleranceMinutes = input.toleranceMinutes ?? 15;
  if (
    !Number.isInteger(toleranceMinutes) ||
    toleranceMinutes < 0 ||
    toleranceMinutes > 120
  )
    throw new PosError(
      "El margen debe ser un número entero entre 0 y 120 minutos.",
    );
  return { enabled: input.enabled, entryTime, exitTime, toleranceMinutes };
}

// Windows repeat daily in Madrid. Both endpoints include their entire minute.
// Circular distance handles windows spanning midnight and Madrid's DST changes.
export function punchWindow(schedule, action, at) {
  if (!schedule?.enabled || !["entry", "exit"].includes(action))
    return { enabled: false, allowed: true, time: null, min: null, max: null };
  const time = action === "entry" ? schedule.entryTime : schedule.exitTime;
  const target = minutes(time);
  const actual = minutes(clock.format(new Date(at)));
  const distance = ((actual - target + 2160) % 1440) - 720;
  return {
    enabled: true,
    allowed: Math.abs(distance) <= schedule.toleranceMinutes,
    time,
    min: format(target - schedule.toleranceMinutes),
    max: format(target + schedule.toleranceMinutes),
  };
}
