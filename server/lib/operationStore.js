import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class PosError extends Error {
  constructor(message, status = 400, code = 'INVALID_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// One durable journal for the single POS server. The lock also excludes another
// process/replica sharing this volume. Never expire locks automatically: a remote
// mutation may still be running. A crash requires operator reconciliation.
export function createOperationStore(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'journal.json');
  const lock = path.join(directory, 'journal.lock');
  const read = () => fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : { operations: {}, movements: [], sessionDates: {} };
  function write(state) {
    const temp = path.join(directory, `.journal-${randomUUID()}.tmp`);
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(state));
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
    const dir = fs.openSync(directory, 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  }
  async function exclusive(work) {
    let fd;
    try { fd = fs.openSync(lock, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw new PosError('Hay una operación en curso o pendiente de revisión tras un reinicio. Reintenta sin iniciar otra venta.', 409, 'BUSY');
      throw error;
    }
    try {
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      fs.fsyncSync(fd);
      return await work();
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  }
  async function operation(key, kind, input, work) {
    if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) {
      throw new PosError('Identificador de operación requerido');
    }
    return exclusive(async () => {
      const state = read();
      let op = state.operations[key];
      if (op && (op.kind !== kind || JSON.stringify(op.input) !== JSON.stringify(input))) {
        throw new PosError('La operación pendiente tiene otros datos. Reanuda el intento original.', 409, 'CONFLICT');
      }
      if (op?.result) return op.result;
      // Do not let a new refund key bypass a previous incomplete refund.
      const pending = Object.values(state.operations).find(o => !o.result && ['refund', 'exchange'].includes(o.kind) && (o.input.orderId === input.orderId || Object.values(o.children || {}).some(child => child.steps?.['draft-complete']?.value?.order?.id === input.orderId)) && o.key !== key);
      if (['refund', 'exchange'].includes(kind) && pending) throw new PosError(`Reanuda la devolución pendiente ${pending.key}`, 409, 'PENDING');
      if (kind === 'voucher_issue' && Object.values(state.operations).some(o => o.kind === kind && !o.result && o.key !== key)) {
        throw new PosError('Reanuda la emisión de vale pendiente desde Operaciones pendientes.', 409, 'PENDING');
      }
      if (!op) {
        op = { key, kind, input, steps: {}, createdAt: new Date().toISOString() };
        state.operations[key] = op;
        write(state);
      }
      const save = () => write(state);
      // Persist intent BEFORE each external mutation. Unknown outcomes are never
      // replayed automatically (including after process restart or a timeout).
      async function step(name, action, reconcile) {
        const prior = op.steps[name];
        if (prior?.status === 'done') return prior.value;
        if (prior?.status === 'running') {
          const recovered = reconcile ? await reconcile() : null;
          if (recovered) {
            op.steps[name] = { status: 'done', value: recovered };
            save();
            return recovered;
          }
          throw new PosError(`Operación ${key}: resultado de ${name} sin confirmar. Requiere comprobar Shopify antes de continuar.`, 409, 'RECONCILIATION_REQUIRED');
        }
        op.steps[name] = { status: 'running' };
        save();
        let value;
        try { value = await action(); }
        catch (error) {
          if (error.definiteRejection) {
            op.steps[name] = { status: 'rejected', error: error.message };
            save();
            throw error;
          }
          throw new PosError(`Operación ${key}: resultado de ${name} sin confirmar. Requiere comprobar Shopify antes de continuar.`, 409, 'RECONCILIATION_REQUIRED');
        }
        op.steps[name] = { status: 'done', value };
        save();
        return value;
      }
      let result;
      try { result = await work({ op, state, save, step }); }
      catch (error) {
        if (!Object.values(op.steps).some(s => s.status === 'done' || s.status === 'running')) {
          delete state.operations[key];
          save();
          error.safeToRestart = true;
        }
        throw error;
      }
      op.result = result;
      save();
      return result;
    });
  }
  return { read, write, exclusive, operation };
}

let singleton;
export function getStore() {
  if (!singleton) {
    if (process.env.NODE_ENV === 'production' && !process.env.POS_DATA_DIR) {
      throw new Error('POS_DATA_DIR debe apuntar a un volumen persistente en producción');
    }
    singleton = createOperationStore(process.env.POS_DATA_DIR || path.resolve('.pos-data'));
  }
  return singleton;
}
