// Business reports always follow the store's day, not the host's timezone.
export function businessDate(value = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function isBusinessToday(value, now = Date.now()) {
  return businessDate(value) === businessDate(now);
}
