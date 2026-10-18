import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppState, Shift } from '../shared/types';
import { initialState } from '../shared/types';
import { defaultSlots, monthOf, reportFor } from '../shared/utils';
import { applyAction, DomainError, validateState } from '../server/domain';
import { createApp } from '../server/app';

const day = '2026-10-18';
const month = monthOf(day);
function register(state = initialState(), name = 'علی احمدی', desk = 1) {
  let updated = applyAction(state, { type: 'student.save', payload: { name, phone: '09123456789', parentName: 'احمد احمدی', parentPhone: '09121234567', notes: 'یادداشت دانش‌آموز' } });
  const studentId = updated.students.at(-1)!.id;
  updated = applyAction(updated, { type: 'enrollment.save', payload: { studentId, month, desk, fee: 1800000 } });
  return { state: updated, studentId, enrollmentId: updated.enrollments.at(-1)!.id };
}
function addSession(state: AppState, shift: Shift = 'morning', date = day) {
  return applyAction(state, { type: 'session.save', payload: { date, shift, supervisor: 'مسئول شیفت', supervisorPhone: '09121111111', slots: defaultSlots(shift) } });
}

test('student, guardian and session metadata survive state validation and edits', () => {
  const { state, studentId } = register();
  const student = state.students[0];
  const updated = applyAction(state, { type: 'student.save', payload: { id: studentId, name: 'علی محمدی', phone: student.phone, parentName: student.parentName, parentPhone: student.parentPhone, notes: student.notes } });
  assert.equal(updated.students[0].createdAt, student.createdAt);
  assert.equal(updated.students[0].parentName, 'احمد احمدی');
  assert.equal(updated.students[0].notes, 'یادداشت دانش‌آموز');
  assert.equal(state.students[0].name, 'علی احمدی', 'the reducer must not mutate its input');
  const suppliedId = 'a745b1c1-a400-425c-9ca8-cdd590c32c00';
  const withClientId = applyAction(updated, { type: 'student.save', payload: { id: suppliedId, name: 'دانش‌آموز جدید', phone: '', parentName: '', parentPhone: '', notes: '' } });
  assert.equal(withClientId.students[1].id, suppliedId);
});

test('one enrollment and one occupied desk per Persian month; another month remains available', () => {
  const { state, studentId } = register();
  assert.throws(() => applyAction(state, { type: 'enrollment.save', payload: { studentId, month, desk: 2, fee: 1800000 } }), /قبلاً/);
  const second = applyAction(state, { type: 'student.save', payload: { name: 'رضا رضایی', phone: '', parentName: '', parentPhone: '', notes: '' } });
  assert.throws(() => applyAction(second, { type: 'enrollment.save', payload: { studentId: second.students[1].id, month, desk: 1, fee: 1800000 } }), /میز/);
  const nextMonth = applyAction(state, { type: 'enrollment.save', payload: { studentId, month: '1405-08', desk: 1, fee: 1800000 } });
  assert.equal(nextMonth.enrollments.length, 2);
});

test('all eight morning and evening periods count actual study hours and both shifts can share a date', () => {
  const { state, enrollmentId } = register();
  let updated = addSession(addSession(state), 'evening');
  for (const session of updated.sessions) for (const slot of session.slots) updated = applyAction(updated, { type: 'attendance.all', sessionId: session.id, slotId: slot.id, present: true });
  const report = reportFor(updated, updated.enrollments.find(item => item.id === enrollmentId)!);
  assert.equal(report.hours, 12);
  assert.equal(report.presentSlots, 8);
  assert.equal(updated.sessions[0].supervisor, 'مسئول شیفت');
  assert.throws(() => addSession(updated), /قبلاً/);
  assert.equal(updated.sessions[0].month, month);
});

test('attendance cannot be assigned to unenrolled students or nonexistent periods', () => {
  const { state, studentId } = register();
  const updated = addSession(state);
  assert.throws(() => applyAction(updated, { type: 'attendance.toggle', sessionId: updated.sessions[0].id, studentId: 'missing-student', slotId: 'slot-1' }), /ثبت‌نام/);
  assert.throws(() => applyAction(updated, { type: 'attendance.toggle', sessionId: updated.sessions[0].id, studentId, slotId: 'slot-5' }), /زنگ/);
  const nextMonth = addSession(state, 'morning', '2026-11-01');
  assert.throws(() => applyAction(nextMonth, { type: 'attendance.toggle', sessionId: nextMonth.sessions[0].id, studentId, slotId: 'slot-1' }), /ثبت‌نام/);
});

test('saved sessions retain attendance on metadata edit; four ordered non-overlapping periods and stable IDs are required', () => {
  const { state, studentId } = register();
  let updated = addSession(state);
  updated = applyAction(updated, { type: 'attendance.toggle', sessionId: updated.sessions[0].id, studentId, slotId: 'slot-1' });
  const session = updated.sessions[0];
  const payload = { id: session.id, date: session.date, shift: session.shift, supervisor: 'مسئول تازه', supervisorPhone: '', slots: session.slots };
  const edited = applyAction(updated, { type: 'session.save', payload });
  assert.deepEqual(edited.sessions[0].attendance[studentId], ['slot-1']);
  assert.throws(() => applyAction(updated, { type: 'session.save', payload: { ...payload, slots: session.slots.slice(0, 3) } }), /چهار/);
  const overlap = structuredClone(session.slots); overlap[1].start = '09:00';
  assert.throws(() => applyAction(updated, { type: 'session.save', payload: { ...payload, slots: overlap } }), /هم‌پوشانی/);
  const changedId = structuredClone(session.slots); changedId[0].id = 'new-slot';
  assert.throws(() => applyAction(updated, { type: 'session.save', payload: { ...payload, slots: changedId } }), /شناسه/);
});

test('morning and evening cannot overlap on the same date, including on edits or backup imports', () => {
  const { state } = register();
  const morning = addSession(state);
  const overlapping = { date: day, shift: 'evening', supervisor: 'مسئول عصر', supervisorPhone: '', slots: defaultSlots('morning') };
  assert.throws(() => applyAction(morning, { type: 'session.save', payload: overlapping }), /صبح و عصر/);
  const both = addSession(morning, 'evening');
  const evening = both.sessions[1];
  assert.throws(() => applyAction(both, { type: 'session.save', payload: { ...overlapping, id: evening.id } }), /صبح و عصر/);
  const corrupt = structuredClone(both);
  corrupt.sessions[1].slots = defaultSlots('morning');
  assert.throws(() => validateState(corrupt), /صبح و عصر/);
  assert.throws(() => applyAction(initialState(), { type: 'backup.restore', payload: corrupt }), /صبح و عصر/);
  const adjacent = defaultSlots('evening');
  adjacent[0].start = '14:45';
  assert.doesNotThrow(() => applyAction(morning, { type: 'session.save', payload: { ...overlapping, slots: adjacent } }), 'touching periods are not overlapping');
  assert.doesNotThrow(() => applyAction(morning, { type: 'session.save', payload: { ...overlapping, date: '2026-10-19' } }), 'different dates have independent schedules');
});

test('editing a saved session cannot move its attendance to another day or shift', () => {
  const { state, studentId } = register();
  let updated = addSession(state);
  updated = applyAction(updated, { type: 'attendance.toggle', sessionId: updated.sessions[0].id, studentId, slotId: 'slot-1' });
  const original = structuredClone(updated);
  const session = updated.sessions[0];
  const payload = { id: session.id, date: session.date, shift: session.shift, supervisor: session.supervisor, supervisorPhone: session.supervisorPhone, slots: session.slots };
  assert.throws(() => applyAction(updated, { type: 'session.save', payload: { ...payload, date: '2026-10-19' } }), /تاریخ و شیفت/);
  assert.throws(() => applyAction(updated, { type: 'session.save', payload: { ...payload, shift: 'evening' } }), /تاریخ و شیفت/);
  assert.deepEqual(updated, original, 'a rejected edit must preserve stars and their original date');
  assert.equal(reportFor(updated, updated.enrollments[0]).hours, 1.5);
});

test('partial payments, overpayment rejection, fee reduction and payment deletion preserve account balance', () => {
  const { state, enrollmentId } = register();
  const addPayment = (state: AppState, amount: number) => applyAction(state, { type: 'payment.add', payload: { enrollmentId, amount, date: day, note: 'کارت به کارت' } });
  let updated = addPayment(state, 1000000);
  assert.throws(() => addPayment(updated, 800001), /مانده/);
  assert.throws(() => addPayment(updated, -10), /مبلغ/);
  assert.throws(() => applyAction(updated, { type: 'enrollment.save', payload: { ...updated.enrollments[0], fee: 900000 } }), /مانده/);
  updated = addPayment(updated, 800000);
  assert.equal(reportFor(updated, updated.enrollments[0]).remaining, 0);
  updated = applyAction(updated, { type: 'payment.delete', id: updated.payments[0].id });
  assert.equal(reportFor(updated, updated.enrollments[0]).remaining, 1000000);
});

test('enrollment deletion protects financial, attendance and conduct history for its own month', () => {
  const { state, studentId, enrollmentId } = register();
  let withAttendance = addSession(state);
  withAttendance = applyAction(withAttendance, { type: 'attendance.toggle', sessionId: withAttendance.sessions[0].id, studentId, slotId: 'slot-1' });
  assert.throws(() => applyAction(withAttendance, { type: 'enrollment.delete', id: enrollmentId }), /سابقه/);
  const withPayment = applyAction(state, { type: 'payment.add', payload: { enrollmentId, amount: 1, date: day, note: '' } });
  assert.throws(() => applyAction(withPayment, { type: 'enrollment.delete', id: enrollmentId }), /سابقه/);
  const withConduct = applyAction(state, { type: 'record.add', payload: { studentId, date: day, kind: 'negative', title: 'استفاده از تلفن همراه', points: 5, notes: '' } });
  assert.throws(() => applyAction(withConduct, { type: 'enrollment.delete', id: enrollmentId }), /سابقه/);
  assert.equal(applyAction(state, { type: 'enrollment.delete', id: enrollmentId }).enrollments.length, 0);
});

test('positive points, violations and attendance produce a bounded monthly grade', () => {
  const { state, studentId } = register();
  let updated = applyAction(state, { type: 'settings.save', payload: { ...state.settings, monthlyTargetHours: 12 } });
  updated = addSession(addSession(updated), 'evening');
  for (const session of updated.sessions) for (const slot of session.slots) updated = applyAction(updated, { type: 'attendance.all', sessionId: session.id, slotId: slot.id, present: true });
  updated = applyAction(updated, { type: 'record.add', payload: { studentId, date: day, kind: 'positive', title: 'تمرکز و پیشرفت', points: 20, notes: 'توضیحات تشویق' } });
  assert.equal(reportFor(updated, updated.enrollments[0]).score, 100);
  updated = applyAction(updated, { type: 'record.add', payload: { studentId, date: day, kind: 'negative', title: 'تأخیر', points: 5, notes: '' } });
  assert.equal(reportFor(updated, updated.enrollments[0]).score, 95);
  assert.equal(reportFor(updated, updated.enrollments[0]).positive, 20);
  assert.equal(reportFor(updated, updated.enrollments[0]).negative, 5);
  assert.throws(() => applyAction(updated, { type: 'record.add', payload: { studentId, date: '2026-11-01', kind: 'negative', title: 'تأخیر', points: 5, notes: '' } }), /ثبت‌نام/);
});

test('strict validation rejects impossible dates, malformed actions, nonfinite numbers and capacity reductions', () => {
  const { state } = register();
  for (const invalid of [null, [], {}, { type: 'unknown' }, { type: 'student.save', payload: {} }, { type: 'payment.delete', id: 'constructor' }, { type: 'settings.save', payload: { ...state.settings, monthlyTargetHours: Number.NaN } }]) assert.throws(() => applyAction(state, invalid), DomainError);
  assert.throws(() => addSession(state, 'morning', '2026-02-30'), /تاریخ/);
  assert.throws(() => applyAction(state, { type: 'enrollment.save', payload: { ...state.enrollments[0], month: '1405-13' } }), /ماه/);
  const second = register(state, 'رضا', 2).state;
  assert.throws(() => applyAction(second, { type: 'settings.save', payload: { ...second.settings, deskCount: 1 } }), /ظرفیت/);
  assert.throws(() => applyAction(state, { type: 'attendance.all', sessionId: 'missing', slotId: 'slot-1', present: 'yes' }), DomainError);
});

test('backup round trips all metadata and rejects broken references, overpayment and unknown fields', () => {
  const { state, studentId, enrollmentId } = register();
  let updated = addSession(state);
  updated = applyAction(updated, { type: 'attendance.toggle', sessionId: updated.sessions[0].id, studentId, slotId: 'slot-1' });
  updated = applyAction(updated, { type: 'payment.add', payload: { enrollmentId, amount: 1, date: day, note: 'رسید بانکی ۱۲۳' } });
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(updated))), updated);
  assert.deepEqual(applyAction(initialState(), { type: 'backup.restore', payload: updated }), updated);
  const corrupt = structuredClone(updated); corrupt.enrollments[0].studentId = 'missing';
  assert.throws(() => validateState(corrupt), /دانش‌آموز/);
  const badMonth = structuredClone(updated); badMonth.sessions[0].month = '1405-08';
  assert.throws(() => validateState(badMonth), /ماه/);
  const badAttendance = structuredClone(updated); badAttendance.sessions[0].attendance[studentId] = ['slot-5'];
  assert.throws(() => validateState(badAttendance), /زنگ/);
  const badPayment = structuredClone(updated); badPayment.payments[0].amount = 1800001;
  assert.throws(() => validateState(badPayment), /مانده/);
  assert.throws(() => validateState({ ...updated, password: 'unsupported' }), /فیلد/);
});

test('HTTP API commits durably, rolls back rejected actions, exports backups and keeps unknown API paths isolated', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'study-hall-api-'));
  const path = join(dir, 'state.sqlite');
  let app = createApp(path);
  let server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  let address = server.address();
  assert.ok(address && typeof address !== 'string');
  let base = `http://127.0.0.1:${address.port}`;
  const close = () => new Promise<void>((resolve, reject) => server.close(error => { app.locals.closeDatabase(); if (error) reject(error); else resolve(); }));
  try {
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true });
    const saved = await fetch(`${base}/api/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'student.save', payload: { name: 'دانش‌آموز پایدار', phone: '', parentName: 'ولی دانش‌آموز', parentPhone: '', notes: '' } }) });
    assert.equal(saved.status, 200);
    const before = await saved.json();
    const failed = await fetch(`${base}/api/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'enrollment.save', payload: { studentId: 'missing', month, desk: 1, fee: 100 } }) });
    assert.equal(failed.status, 400);
    assert.deepEqual(await (await fetch(`${base}/api/state`)).json(), before);
    const backup = await fetch(`${base}/api/backup`);
    assert.match(backup.headers.get('content-disposition')!, /attachment/);
    assert.deepEqual(await backup.json(), before);
    assert.equal((await fetch(`${base}/api/missing`)).status, 404);
    const malformed = await fetch(`${base}/api/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
    assert.equal(malformed.status, 400);
    await close();
    app = createApp(path); server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    address = server.address(); assert.ok(address && typeof address !== 'string'); base = `http://127.0.0.1:${address.port}`;
    assert.deepEqual(await (await fetch(`${base}/api/state`)).json(), before);
  } finally { await close(); rmSync(dir, { recursive: true, force: true }); }
});
