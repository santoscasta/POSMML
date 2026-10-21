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

export function scheduleRange(time: string, margin: number) {
  const [hour, minute] = time.split(":").map(Number);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isInteger(margin)
  )
    return "—";
  const format = (value: number) => {
    const minutes = ((value % 1440) + 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  };
  return `${format(hour * 60 + minute - margin)}–${format(hour * 60 + minute + margin)}`;
}
