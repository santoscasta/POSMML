import { useId, useState } from "react";
import { Clock3 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { Employee, EmployeeSchedule } from "../../types/attendance";
import { scheduleRange } from "../../utils/attendance";

export function ScheduleEditor({
  employee,
  busy,
  save,
}: {
  employee: Employee;
  busy: boolean;
  save: (id: string, schedule: EmployeeSchedule) => void;
}) {
  const id = useId();
  const [enabled, setEnabled] = useState(employee.schedule?.enabled || false);
  const [entryTime, setEntryTime] = useState(
    employee.schedule?.entryTime || "09:00",
  );
  const [exitTime, setExitTime] = useState(
    employee.schedule?.exitTime || "17:00",
  );
  const [margin, setMargin] = useState(
    String(employee.schedule?.toleranceMinutes ?? 15),
  );
  return (
    <section className="mt-5 rounded-lg border bg-slate-50 p-4">
      <h4 className="flex items-center gap-2 font-semibold">
        <Clock3 className="size-4" />
        Horario de {employee.name}
      </h4>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Configura la hora prevista y el margen anterior y posterior. Fuera de
        las franjas se bloquean la entrada y la salida.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save(employee.id, {
            enabled,
            entryTime,
            exitTime,
            toleranceMinutes: Number(margin),
          });
        }}
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            className="size-4"
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Aplicar límites de entrada y salida
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor={`${id}-entry`} className="text-sm">
              Entrada prevista
            </label>
            <Input
              id={`${id}-entry`}
              className="w-full min-w-0 bg-white"
              type="time"
              value={entryTime}
              disabled={busy || !enabled}
              onChange={(e) => setEntryTime(e.target.value)}
              required={enabled}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-exit`} className="text-sm">
              Salida prevista
            </label>
            <Input
              id={`${id}-exit`}
              className="w-full min-w-0 bg-white"
              type="time"
              value={exitTime}
              disabled={busy || !enabled}
              onChange={(e) => setExitTime(e.target.value)}
              required={enabled}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-margin`} className="text-sm">
              Margen ± (minutos)
            </label>
            <Input
              id={`${id}-margin`}
              className="bg-white"
              type="number"
              min={0}
              max={120}
              step={1}
              value={margin}
              disabled={busy || !enabled}
              onChange={(e) => setMargin(e.target.value)}
              required={enabled}
            />
          </div>
        </div>
        <div className="grid gap-3 rounded-lg border bg-white p-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">
              Entrada mínima y máxima
            </p>
            <p className="mt-1 font-semibold tabular-nums">
              {enabled
                ? scheduleRange(entryTime, Number(margin))
                : "Sin límite"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Salida mínima y máxima
            </p>
            <p className="mt-1 font-semibold tabular-nums">
              {enabled ? scheduleRange(exitTime, Number(margin)) : "Sin límite"}
            </p>
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Hora de Madrid. El horario se repite cada día y admite franjas que
          cruzan medianoche. Los minutos mínimo y máximo están incluidos. Las
          pausas y los regresos se mantienen disponibles durante una jornada
          abierta.
        </p>
        <Button type="submit" disabled={busy}>
          Guardar horario
        </Button>
      </form>
    </section>
  );
}
