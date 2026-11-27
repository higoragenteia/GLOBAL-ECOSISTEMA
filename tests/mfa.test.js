import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { mfaSatisfied } from '../supabase/functions/_shared/mfa.js';

const transport = await readFile(new URL('../global-api.js', import.meta.url), 'utf8');

function panel(status) {
 const calls = [];
 const user = { id: 'account' };
 const window = {
  PanelAuth: {
   passwordLogin: async () => ({ access_token: 'password-session', user }),
   request: async (path, body, token) => {
    calls.push({ path, body, token });
    if (path === 'user') return user;
    if (path.endsWith('/challenge')) return { id: 'challenge' };
    if (path.endsWith('/verify')) return { access_token: 'verified-session' };
    assert.fail('Unexpected Auth request: ' + path);
   },
   finishLogin: async session => ({ token: session.access_token })
  },
  GlobalSession: { access: async () => 'active-session' }
 };
 vm.runInNewContext(transport, {
  window, crypto, localStorage: { getItem: () => null, setItem: () => {} },
  fetch: async (url, request) => {
   const { fn } = JSON.parse(request.body);
   calls.push({ fn, token: request.headers.Authorization });
   if (fn === 'prepararSegundoFator') return { ok: true, json: async () => ({ data: { ok: true, ...status } }) };
   if (fn === 'perfil') return { ok: true, json: async () => ({ data: { perfil: 'ADMIN' } }) };
   if (fn === 'ativarSegundoFator') return { ok: true, json: async () => ({ data: { factorId: 'new-factor', qr: '<svg/>', secret: 'test' } }) };
   assert.fail('Unexpected panel request: ' + fn);
  }
 });
 return { mfa: window.GlobalPanelMfa, calls };
}

test('Administrador sem 2FA entra normalmente e só inicia o cadastro quando escolhe ativar', async () => {
 const { mfa, calls } = panel({ requiresMfa: false, canEnroll: true });
 assert.equal((await mfa.start('admin', 'senha')).profile.token, 'password-session');
 assert.equal(calls.some(call => call.fn === 'ativarSegundoFator'), false);
 assert.equal((await mfa.enroll()).factorId, 'new-factor');
 assert.equal((await mfa.verify('123456')).token, 'verified-session');
 assert.ok(calls.some(call => call.path === 'factors/new-factor/verify'));
});

test('Login com autenticador já verificado pede o código do fator existente', async () => {
 const { mfa, calls } = panel({ requiresMfa: true, factorId: 'existing-factor', canEnroll: true });
 assert.equal((await mfa.start('admin', 'senha')).profile, undefined);
 assert.equal((await mfa.verify('123456')).token, 'verified-session');
 assert.ok(calls.some(call => call.path === 'factors/existing-factor/verify'));
 assert.equal(calls.some(call => call.fn === 'ativarSegundoFator'), false);
});

test('Um cadastro incompleto não bloqueia a sessão; fator verificado exige AAL2', async () => {
 const factors = [{ factor_type: 'totp', status: 'unverified' }];
 const auth = { getClaims: async token => ({ data: { claims: { aal: token } } }) };
 assert.equal(await mfaSatisfied(auth, 'aal1', { factors }), true);
 factors[0].status = 'verified';
 assert.equal(await mfaSatisfied(auth, 'aal1', { factors }), false);
 assert.equal(await mfaSatisfied(auth, 'aal2', { factors }), true);
 assert.equal(await mfaSatisfied({ getClaims: async () => ({ error: new Error() }) }, 'aal2', { factors }), false);
});
