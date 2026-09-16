import path from 'node:path';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { createOperationStore, PosError } from '../operationStore.js';
import { message } from './templates.js';

export const hash = value => createHash('sha256').update(String(value)).digest('hex');
export const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value);
export const defaults = {
  enabled: false, recipient: '', closing: true, discrepancy: true, unclosed: true,
  pending: true, synchronization: true, deliveryFailures: true, security: true,
  dailySales: true, stockAlerts: false, stockSummary: false, lowStock: 3,
  discrepancyLimit: 0, closingHour: 22, reportHour: 9, pendingMinutes: 5,
};
export const categories = ['closing', 'discrepancy', 'unclosed', 'pending', 'synchronization', 'deliveryFailures', 'security', 'dailySales', 'stockAlerts', 'stockSummary'];

export function smtpConfig(env = process.env) {
  const port = Number(env.SMTP_PORT || 587);
  const configured = Boolean(env.SMTP_HOST && validEmail(env.SMTP_FROM) && env.SMTP_USER && env.SMTP_PASSWORD && [465, 587].includes(port));
  return { configured, from: validEmail(env.SMTP_FROM) ? env.SMTP_FROM : '', options: {
    host: env.SMTP_HOST, port, secure: port === 465, requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000,
    disableFileAccess: true, disableUrlAccess: true,
  } };
}

export function createMailService({ store, config = smtpConfig(), transport, now = () => Date.now() }) {
  const sender = transport || (config.configured ? nodemailer.createTransport(config.options) : null);
  const read = () => {
    const data = store.read();
    data.settings = { ...defaults, ...data.settings };
    data.jobs ||= {};
    data.monitor ||= {};
    return data;
  };
  const change = work => store.exclusive(() => {
    const data = read();
    const result = work(data);
    store.write(data);
    return result;
  });
  const insert = (data, event, to, content, category = 'customer', context) => {
    if (!validEmail(to)) throw new PosError('Correo inválido');
    const id = hash(`${event}\n${to.toLowerCase()}`);
    if (!data.jobs[id]) data.jobs[id] = { id, event, to, category, ...content, context, status: 'queued', attempts: 0, createdAt: new Date(now()).toISOString(), nextAt: now() };
    return data.jobs[id];
  };
  const internal = (data, event, category, content, context) => {
    if (!data.settings.enabled || !data.settings[category] || !validEmail(data.settings.recipient)) return null;
    return insert(data, event, data.settings.recipient, content, category, context);
  };
  function publicJob(job) {
    const { id, to, subject, status, attempts, createdAt, sentAt, error, category } = job;
    return { id, to, subject, status, attempts, createdAt, sentAt, error, category };
  }
  function status() {
    const data = read();
    return { configured: config.configured, from: config.from, settings: data.settings,
      monitor: { lastCheck: data.monitor.lastCheck, lastError: data.monitor.lastError },
      jobs: Object.values(data.jobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100).map(publicJob),
      attention: Object.values(data.jobs).filter(j => ['failed', 'unknown'].includes(j.status)).length };
  }
  async function settings(input) {
    return change(data => {
      const next = { ...data.settings };
      for (const key of ['enabled', ...categories]) {
        if (typeof input[key] !== 'boolean') throw new PosError(`Configuración inválida: ${key}`);
        next[key] = input[key];
      }
      next.recipient = typeof input.recipient === 'string' ? input.recipient.trim() : '';
      if (next.recipient && !validEmail(next.recipient)) throw new PosError('Correo de avisos inválido');
      for (const [key, min, max] of [['lowStock', 0, 1000], ['discrepancyLimit', 0, 10000], ['closingHour', 0, 23], ['reportHour', 0, 23], ['pendingMinutes', 1, 1440]]) {
        if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < min || input[key] > max || (key !== 'discrepancyLimit' && !Number.isInteger(input[key]))) throw new PosError(`Valor inválido: ${key}`);
        next[key] = input[key];
      }
      if (next.enabled && (!config.configured || !next.recipient)) throw new PosError('Configura SMTP y el correo de avisos antes de activar los envíos');
      if (JSON.stringify(next) === JSON.stringify(data.settings)) return next;
      internal(data, `settings:${now()}`, 'security', message('Configuración de correos modificada', [
        `Fecha: ${new Date(now()).toISOString()}`, `Campos modificados: ${Object.keys(next).filter(k => next[k] !== data.settings[k]).join(', ')}`,
      ]));
      if (next.enabled && !data.settings.enabled) next.enabledAt = new Date(now()).toISOString();
      // Old queued mail must not suddenly go out after a later reactivation.
      for (const job of Object.values(data.jobs)) {
        if (job.status !== 'queued') continue;
        if (!next.enabled || (job.category !== 'customer' && (job.to !== next.recipient || !next[job.category]))) job.status = 'cancelled';
      }
      data.settings = next;
      return next;
    });
  }
  async function enqueue(event, to, content) {
    return change(data => {
      if (!config.configured || !data.settings.enabled) throw new PosError('El correo del TPV todavía no está activado. Revisa Correos.', 503);
      const job = insert(data, event, to, content);
      // An explicit customer request can revive a message cancelled while mail
      // was disabled. Sent and uncertain messages must remain deduplicated.
      if (job.status === 'cancelled') {
        job.status = 'queued'; job.attempts = 0; job.nextAt = now(); delete job.error;
      }
      return publicJob(job);
    });
  }
  async function retry(id, confirmUnknown = false) {
    return change(data => {
      const job = data.jobs[id];
      if (!job) throw new PosError('Envío no encontrado', 404);
      if (!['failed', 'unknown'].includes(job.status)) throw new PosError('Este envío no necesita reintento');
      if (job.status === 'unknown' && !confirmUnknown) throw new PosError('El servidor pudo aceptar el correo. Confirma el reenvío para evitar duplicados.', 409);
      if (!data.settings.enabled || !config.configured) throw new PosError('Activa el correo antes de reintentar');
      if (job.category !== 'customer' && (!data.settings[job.category] || job.to !== data.settings.recipient)) throw new PosError('El destinatario o este aviso ya no están activos');
      job.status = 'queued'; job.attempts = 0; job.nextAt = now(); delete job.error;
      return publicJob(job);
    });
  }
  async function deliver(limit = 10) {
    if (!sender) return;
    for (let index = 0; index < limit; index++) {
      const job = await change(data => {
        for (const old of Object.values(data.jobs)) {
          if (old.status === 'sending' && now() - old.startedAt > 120000) {
            old.status = 'unknown'; old.error = 'Envío interrumpido: comprueba si llegó antes de reenviar.';
            if (old.category === 'customer') internal(data, `delivery:${old.id}`, 'deliveryFailures', message('Revisar envío al cliente', [`Documento: ${old.subject}`, `Destinatario: ${old.to}`, old.error]));
          }
        }
        if (!data.settings.enabled) return null;
        const next = Object.values(data.jobs).find(j => j.status === 'queued' && j.nextAt <= now());
        if (!next) return null;
        next.status = 'sending'; next.startedAt = now(); next.attempts++;
        return { ...next };
      });
      if (!job) return;
      let outcome;
      try {
        const result = await sender.sendMail({ from: { name: 'My mini Leo', address: config.from }, to: job.to,
          subject: job.subject, html: job.html, text: job.text,
          messageId: `<${job.id}@${config.from.split('@')[1]}>` });
        if (!result.accepted?.length) {
          const error = new Error('Destinatario rechazado'); error.responseCode = 550; throw error;
        }
        outcome = { status: 'sent', sentAt: new Date(now()).toISOString(), error: undefined };
      } catch (error) {
        const definite = (error.responseCode >= 400 && error.responseCode < 600) || /^(CONN|AUTH|EHLO|HELO|STARTTLS|MAIL FROM|RCPT TO)$/i.test(error.command || '') || ['EAUTH', 'EDNS', 'ECONNECTION'].includes(error.code);
        const transient = definite && (!error.responseCode || error.responseCode < 500) && error.code !== 'EAUTH';
        outcome = { status: definite ? (transient && job.attempts < 3 ? 'queued' : 'failed') : 'unknown',
          nextAt: now() + 60000 * 2 ** job.attempts,
          error: definite ? 'El servidor de correo rechazó el envío o no se pudo conectar. Revisa SMTP y el destinatario.' : 'No se pudo confirmar el envío. Comprueba si llegó antes de reenviar.' };
      }
      await change(data => {
        Object.assign(data.jobs[job.id], outcome);
        if (job.category === 'customer' && ['failed', 'unknown'].includes(outcome.status)) internal(data, `delivery:${job.id}`, 'deliveryFailures', message('Revisar envío al cliente', [`Documento: ${job.subject}`, `Destinatario: ${job.to}`, outcome.error, 'Consulta Correos en el TPV.']));
      });
    }
  }
  let flushing = false;
  async function flush(limit = 10) {
    if (flushing) return;
    flushing = true;
    try { await deliver(limit); }
    finally { flushing = false; }
  }
  return { read, change, insert, internal, status, settings, enqueue, retry, flush };
}
let singleton;
export function getMailService() {
  singleton ||= createMailService({ store: createOperationStore(path.join(process.env.POS_DATA_DIR || path.resolve('.pos-data'), 'mail')) });
  return singleton;
}
