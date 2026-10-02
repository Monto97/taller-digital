const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarPatente, esPatenteValida, normalizarTelefono } = require('../src/utils/formato');

test('normaliza patentes', () => {
  assert.equal(normalizarPatente('ae-482 kt'), 'AE482KT');
  assert.equal(normalizarPatente(' a 057 jkr '), 'A057JKR');
});

test('reconoce los cuatro formatos argentinos', () => {
  for (const p of ['AE482KT', 'NKL482', 'A057JKR', '123ABC']) assert.ok(esPatenteValida(p), p);
  for (const p of ['AE48KT', 'ABCD12', '12345']) assert.ok(!esPatenteValida(p), p);
});

test('normaliza teléfonos argentinos para wa.me', () => {
  assert.equal(normalizarTelefono('+54 9 221 555-0143'), '5492215550143');
  assert.equal(normalizarTelefono('221 555-0143'), '5492215550143');
  assert.equal(normalizarTelefono('0221 15 555-0143'), '5492215550143');
  assert.equal(normalizarTelefono('011 15 4444-5555'), '5491144445555');
  assert.equal(normalizarTelefono('02241 15 68-9216'), '5492241689216');
  assert.equal(normalizarTelefono(''), null);
});
