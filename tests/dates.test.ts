import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fa, firstDayOfMonth, gregorianFromJalali, jalaliDate, latin, monthOf, moveMonth } from '../shared/utils';

test('Persian dates round trip across Nowruz and the 1403 leap day', () => {
  const dates = [['1405/01/01', '2026-03-21'], ['1405/07/26', '2026-10-18'], ['1403/12/30', '2025-03-20']];
  for (const [persian, iso] of dates) { assert.equal(gregorianFromJalali(persian), iso); assert.equal(latin(jalaliDate(iso)), persian); }
  assert.equal(firstDayOfMonth('1405-07'), '2026-09-23');
  assert.equal(monthOf('2026-03-20'), '1404-12');
  assert.equal(monthOf('2026-03-21'), '1405-01');
});
test('Invalid Persian dates cannot silently roll over to another day', () => {
  for (const input of ['1404/12/30', '1405/07/31', '1405/13/01', '1405/00/01', '1405/07/00', '1405/07/32', 'abc', '', '1405/7/1/1']) assert.equal(gregorianFromJalali(input), null, input);
  assert.equal(gregorianFromJalali('۱۴۰۵/۰۷/۲۶'), '2026-10-18');
  assert.equal(gregorianFromJalali('١٤٠٥/٠٧/٢٦'), '2026-10-18');
});
test('Month navigation crosses Persian year boundaries in both directions', () => {
  assert.equal(moveMonth('1405-01', -1), '1404-12');
  assert.equal(moveMonth('1405-12', 1), '1406-01');
  assert.equal(moveMonth('1405-12', 2), '1406-02');
  assert.equal(fa(123), '۱۲۳');
});
