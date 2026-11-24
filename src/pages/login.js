/** Halaman masuk. Token disimpan oleh services/session di sessionStorage. */

import { api, ApiError } from '../services/api.js';
import { config } from '../config.js';
import { setSession } from '../services/session.js';
import { banner, button, field, toast } from '../components/ui.js';
import { escapeHtml, qs, showFieldErrors, fieldValue } from '../utils/dom.js';
import { validateLogin } from '../utils/validate.js';

export function render() {
  return `<div class="login-page">
    <div class="login-card">
      <div class="login-brand"><span class="brand-mark">S</span><div><h1>SIPIKET</h1><p>Sistem Informasi Piket Guru</p></div></div>
      ${config.isConfigured ? '' : banner(config.setupMessage, 'warning')}
      <div id="login-error"></div>
      <form id="login-form" novalidate autocomplete="on">
        ${field({ name: 'username', label: 'Username', value: '', required: true, placeholder: 'mis. guru.piket', attrs: 'autocomplete="username"' })}
        ${field({ name: 'password', label: 'Kata Sandi', type: 'password', required: true, placeholder: '••••••••', attrs: 'autocomplete="current-password"' })}
        <button class="btn btn-primary btn-block" type="submit">Masuk</button>
      </form>
      <p class="login-foot">Gunakan akun yang dibuat superadmin. Kata sandi diverifikasi oleh backend.</p>
    </div>
  </div>`;
}

export function mount(ctx) {
  const form = qs('#login-form');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = { username: fieldValue(form, 'username'), password: fieldValue(form, 'password') };
    const validation = validateLogin(values);
    showFieldErrors(form, validation.errors);
    const errorBox = qs('#login-error');
    if (errorBox) errorBox.innerHTML = '';
    if (!validation.valid) {
      if (errorBox) errorBox.innerHTML = banner('Lengkapi isian yang bertanda bintang.', 'warning');
      return;
    }
    const submit = qs('button[type="submit"]', form);
    if (submit) submit.disabled = true;
    try {
      const data = await api.call('login', { username: values.username, password: values.password }, { withToken: false });
      if (!data?.token || !data?.user) throw new ApiError('SERVER_ERROR', 'Balasan login tidak lengkap.');
      setSession({ token: data.token, expiresAt: data.expiresAt || '', user: data.user, settings: data.settings || {} });
      toast(`Selamat datang, ${data.user.fullName || data.user.username}.`, 'success');
      ctx.navigate('#/dashboard');
    } catch (error) {
      const message = error?.message || 'Login gagal. Silakan coba lagi.';
      if (errorBox) errorBox.innerHTML = banner(message, 'error');
      if (error?.code === 'RATE_LIMITED') showFieldErrors(form, { password: message });
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

export default { render, mount };
