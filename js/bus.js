// Modüller arası basit olay sistemi (simülasyon → görüntü/arayüz)
const handlers = {};

export function on(type, fn) {
  (handlers[type] ||= []).push(fn);
}

export function emit(type, payload) {
  const list = handlers[type];
  if (list) for (const fn of list) fn(payload);
}
