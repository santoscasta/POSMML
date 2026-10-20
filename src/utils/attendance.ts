export const attendanceLabels = {
  working: "Trabajando",
  paused: "En pausa",
  out: "Fuera de jornada",
};
export function duration(ms: number) {
  const minutes = Math.floor(ms / 60000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
export function madridDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
