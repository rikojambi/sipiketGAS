/**
 * Pembantu DOM. Tidak mengakses document/window saat modul di-import agar bisa di-test di Node.
 */

export function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function doc() {
  return typeof document !== 'undefined' ? document : null;
}

export function qs(selector, root) {
  const scope = root || doc();
  return scope && typeof scope.querySelector === 'function' ? scope.querySelector(selector) : null;
}

export function qsa(selector, root) {
  const scope = root || doc();
  return scope && typeof scope.querySelectorAll === 'function' ? Array.from(scope.querySelectorAll(selector)) : [];
}

export function on(root, eventName, selector, handler) {
  if (!root || typeof root.addEventListener !== 'function') return () => {};
  const listener = (event) => {
    const target = event.target && event.target.closest ? event.target.closest(selector) : null;
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(eventName, listener);
  return () => root.removeEventListener(eventName, listener);
}

export function setHtml(element, html) {
  if (element) element.innerHTML = html;
  return element;
}

export function delegateForm(root, formSelector, handler) {
  return on(root, 'submit', formSelector, (event, form) => {
    event.preventDefault();
    handler(form, event);
  });
}

export function fieldValue(form, name) {
  if (!form || !form.elements) return '';
  const field = form.elements.namedItem(name);
  if (!field) return '';
  if (field instanceof RadioNodeList || (field.length && !field.value)) {
    return Array.from(field).find((item) => item.checked)?.value ?? '';
  }
  return field.value ?? '';
}

export function setFieldValue(form, name, value) {
  if (!form || !form.elements) return;
  const field = form.elements.namedItem(name);
  if (field) field.value = value ?? '';
}

export function showFieldErrors(form, errors = {}) {
  if (!form) return;
  qsa('[data-error-for]', form).forEach((node) => { node.textContent = ''; });
  Object.entries(errors).forEach(([name, message]) => {
    const node = qs(`[data-error-for="${name}"]`, form);
    if (node) node.textContent = String(message);
  });
}

export function scrollToTop() {
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
}
