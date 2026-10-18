import { randomUUID } from 'node:crypto';
import type { AppState, ConductRecord, Enrollment, Payment, Session, Settings, Slot, Student } from '../shared/types';
import { monthOf } from '../shared/utils';

export class DomainError extends Error {}
function fail(message: string): never { throw new DomainError(message); }
type Obj = Record<string, unknown>;
const reservedIds = new Set(Object.getOwnPropertyNames(Object.prototype));

function object(value: unknown, keys: string[], optional: string[] = []): Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('ساختار اطلاعات معتبر نیست.');
  const obj = value as Obj;
  if (Object.keys(obj).some(key => !keys.includes(key) && !optional.includes(key)) || keys.some(key => !Object.hasOwn(obj, key))) fail('فیلدهای اطلاعات کامل یا معتبر نیستند.');
  return obj;
}
function string(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(`${label} معتبر نیست.`);
  return value as string;
}
function id(value: unknown): string {
  const result = string(value, 'شناسه', 128, true);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(result) || reservedIds.has(result)) fail('شناسه معتبر نیست.');
  return result;
}
function number(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) fail(`${label} باید بین ${min} و ${max} باشد.`);
  return value as number;
}
function array(value: unknown, max = 100000): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail('تعداد یا ساختار ردیف‌ها معتبر نیست.');
  return value as unknown[];
}
function unique(values: string[], message = 'شناسه تکراری در اطلاعات وجود دارد.'): void {
  if (new Set(values).size !== values.length) fail(message);
}
function date(value: unknown): string {
  const result = string(value, 'تاریخ', 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || result < '1900-01-01' || result > '2300-12-31') fail('تاریخ معتبر نیست.');
  const parsed = new Date(`${result}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) fail('روز یا ماه تاریخ معتبر نیست.');
  return result;
}
function month(value: unknown): string {
  const result = string(value, 'ماه', 7, true);
  if (!/^(1[3-5]\d{2}|1600)-(0[1-9]|1[0-2])$/.test(result)) fail('ماه شمسی باید بین سال‌های ۱۳۰۰ و ۱۶۰۰ باشد.');
  return result;
}
function dateMonth(value: string): string { return month(monthOf(value)); }
function isoTimestamp(value: unknown): string {
  const result = string(value, 'زمان ثبت', 24, true);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result)) fail('زمان ثبت معتبر نیست.');
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== result) fail('زمان ثبت معتبر نیست.');
  return result;
}
function settings(value: unknown): Settings {
  const obj = object(value, ['hallName', 'deskCount', 'defaultFee', 'monthlyTargetHours', 'attendanceWeight', 'positiveTarget', 'negativeMultiplier']);
  return {
    hallName: string(obj.hallName, 'نام سالن', 120, true), deskCount: number(obj.deskCount, 'تعداد میز', 1, 1000, true),
    defaultFee: number(obj.defaultFee, 'شهریه پیش‌فرض', 0, 1e12, true), monthlyTargetHours: number(obj.monthlyTargetHours, 'هدف ساعت مطالعه', 1, 744),
    attendanceWeight: number(obj.attendanceWeight, 'وزن حضور', 0, 100), positiveTarget: number(obj.positiveTarget, 'هدف امتیاز مثبت', 1, 10000),
    negativeMultiplier: number(obj.negativeMultiplier, 'ضریب تخلف', 0, 100),
  };
}
function student(value: unknown): Student {
  const obj = object(value, ['id', 'name', 'phone', 'parentName', 'parentPhone', 'notes', 'createdAt']);
  return { id: id(obj.id), name: string(obj.name, 'نام دانش‌آموز', 120, true), phone: string(obj.phone, 'تلفن دانش‌آموز', 40), parentName: string(obj.parentName, 'نام ولی', 120), parentPhone: string(obj.parentPhone, 'تلفن ولی', 40), notes: string(obj.notes, 'توضیحات', 2000), createdAt: isoTimestamp(obj.createdAt) };
}
function enrollment(value: unknown): Enrollment {
  const obj = object(value, ['id', 'studentId', 'month', 'desk', 'fee']);
  return { id: id(obj.id), studentId: id(obj.studentId), month: month(obj.month), desk: number(obj.desk, 'شماره میز', 1, 1000, true), fee: number(obj.fee, 'شهریه', 0, 1e12, true) };
}
function payment(value: unknown): Payment {
  const obj = object(value, ['id', 'enrollmentId', 'amount', 'date', 'note']);
  return { id: id(obj.id), enrollmentId: id(obj.enrollmentId), amount: number(obj.amount, 'مبلغ پرداخت', 1, 1e12, true), date: date(obj.date), note: string(obj.note, 'توضیح پرداخت', 1000) };
}
function time(value: unknown): string {
  const result = string(value, 'ساعت', 5, true);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) fail('ساعت باید به صورت ساعت و دقیقه باشد.');
  return result;
}
function slots(value: unknown): Slot[] {
  const rows = array(value, 4);
  if (rows.length !== 4) fail('هر شیفت باید دقیقاً چهار زنگ داشته باشد.');
  const result = rows.map(item => {
    const obj = object(item, ['id', 'label', 'start', 'end']);
    const slot = { id: id(obj.id), label: string(obj.label, 'نام زنگ', 60, true), start: time(obj.start), end: time(obj.end) };
    if (slot.start >= slot.end) fail('زمان پایان هر زنگ باید پس از شروع آن باشد.');
    return slot;
  });
  unique(result.map(item => item.id), 'شناسه زنگ‌ها نباید تکراری باشد.');
  if (result.some((item, i) => i > 0 && item.start < result[i - 1].end)) fail('زنگ‌ها باید به ترتیب و بدون هم‌پوشانی باشند.');
  return result;
}
function shift(value: unknown): 'morning' | 'evening' {
  if (value !== 'morning' && value !== 'evening') fail('شیفت صبح یا عصر را انتخاب کنید.');
  return value as 'morning' | 'evening';
}
function session(value: unknown): Session {
  const obj = object(value, ['id', 'date', 'month', 'shift', 'supervisor', 'supervisorPhone', 'slots', 'attendance']);
  if (!obj.attendance || typeof obj.attendance !== 'object' || Array.isArray(obj.attendance) || Object.keys(obj.attendance).length > 1000) fail('ساختار حضور و غیاب معتبر نیست.');
  const attendance: Record<string, string[]> = {};
  for (const [studentId, present] of Object.entries(obj.attendance)) {
    const studentKey = id(studentId);
    const presentSlots = array(present, 4).map(id);
    unique(presentSlots, 'حضور تکراری برای یک زنگ ثبت شده است.');
    attendance[studentKey] = presentSlots;
  }
  return { id: id(obj.id), date: date(obj.date), month: month(obj.month), shift: shift(obj.shift), supervisor: string(obj.supervisor, 'نام مسئول سالن', 120, true), supervisorPhone: string(obj.supervisorPhone, 'تلفن مسئول', 40), slots: slots(obj.slots), attendance };
}
function record(value: unknown): ConductRecord {
  const obj = object(value, ['id', 'studentId', 'month', 'date', 'kind', 'title', 'points', 'notes']);
  if (obj.kind !== 'positive' && obj.kind !== 'negative') fail('نوع امتیاز معتبر نیست.');
  return { id: id(obj.id), studentId: id(obj.studentId), month: month(obj.month), date: date(obj.date), kind: obj.kind as 'positive' | 'negative', title: string(obj.title, 'عنوان امتیاز یا تخلف', 160, true), points: number(obj.points, 'امتیاز', 1, 1000, true), notes: string(obj.notes, 'توضیحات', 2000) };
}

/** Validate imports and every mutation at the same boundary, including cross-record invariants. */
export function validateState(value: unknown): AppState {
  const obj = object(value, ['version', 'students', 'enrollments', 'payments', 'sessions', 'records', 'settings']);
  if (obj.version !== 1) fail('نسخه فایل پشتیبان پشتیبانی نمی‌شود.');
  const result: AppState = { version: 1, students: array(obj.students).map(student), enrollments: array(obj.enrollments).map(enrollment), payments: array(obj.payments).map(payment), sessions: array(obj.sessions).map(session), records: array(obj.records).map(record), settings: settings(obj.settings) };
  for (const collection of [result.students, result.enrollments, result.payments, result.sessions, result.records]) unique(collection.map(item => item.id));
  const studentIds = new Set(result.students.map(item => item.id));
  const enrollmentIds = new Map(result.enrollments.map(item => [item.id, item]));
  const enrolled = new Set(result.enrollments.map(item => `${item.month}:${item.studentId}`));
  unique(result.enrollments.map(item => `${item.month}:${item.studentId}`), 'این دانش‌آموز قبلاً در این ماه ثبت‌نام شده است.');
  unique(result.enrollments.map(item => `${item.month}:${item.desk}`), 'این میز در ماه انتخاب‌شده به دانش‌آموز دیگری اختصاص دارد.');
  for (const item of result.enrollments) {
    if (!studentIds.has(item.studentId)) fail('دانش‌آموز ثبت‌نام پیدا نشد.');
    if (item.desk > result.settings.deskCount) fail('شماره میز از ظرفیت سالن بیشتر است.');
  }
  const paid = new Map<string, number>();
  for (const item of result.payments) {
    const registration = enrollmentIds.get(item.enrollmentId);
    if (!registration) fail('ثبت‌نام مربوط به پرداخت پیدا نشد.');
    const total = (paid.get(item.enrollmentId) || 0) + item.amount;
    if (!Number.isSafeInteger(total) || total > registration.fee) fail('مبلغ پرداخت از مانده شهریه بیشتر است.');
    paid.set(item.enrollmentId, total);
  }
  unique(result.sessions.map(item => `${item.date}:${item.shift}`), 'برای این تاریخ و شیفت قبلاً فرم حضور و غیاب ثبت شده است.');
  const sessionsByDate = new Map<string, Session[]>();
  for (const item of result.sessions) {
    if (dateMonth(item.date) !== item.month) fail('ماه فرم حضور و غیاب با تاریخ آن هماهنگ نیست.');
    const otherSessions = sessionsByDate.get(item.date) || [];
    if (otherSessions.some(other => other.slots.some(a => item.slots.some(b => a.start < b.end && b.start < a.end)))) fail('ساعت زنگ‌های صبح و عصر در یک روز نباید هم‌پوشانی داشته باشند.');
    otherSessions.push(item);
    sessionsByDate.set(item.date, otherSessions);
    const slotIds = new Set(item.slots.map(slot => slot.id));
    for (const [studentId, present] of Object.entries(item.attendance)) {
      if (!enrolled.has(`${item.month}:${studentId}`)) fail('دانش‌آموز در ماه این فرم ثبت‌نام نشده است.');
      if (present.some(slotId => !slotIds.has(slotId))) fail('زنگ حضور و غیاب معتبر نیست.');
    }
  }
  for (const item of result.records) {
    if (dateMonth(item.date) !== item.month) fail('ماه امتیاز با تاریخ آن هماهنگ نیست.');
    if (!enrolled.has(`${item.month}:${item.studentId}`)) fail('دانش‌آموز در ماه تاریخ امتیاز یا تخلف ثبت‌نام نشده است.');
  }
  return result;
}

export function applyAction(state: AppState, value: unknown): AppState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('درخواست معتبر نیست.');
  const input = value as Obj;
  const next = structuredClone(state);
  const findSession = (sessionId: unknown) => {
    const selected = next.sessions.find(item => item.id === id(sessionId));
    if (!selected) fail('فرم حضور و غیاب پیدا نشد.');
    return selected;
  };
  switch (input.type) {
    case 'student.save': {
      object(input, ['type', 'payload']);
      const payload = object(input.payload, ['name', 'phone', 'parentName', 'parentPhone', 'notes'], ['id']);
      const existing = payload.id === undefined ? undefined : next.students.find(item => item.id === id(payload.id));
      const saved = student({ ...payload, id: existing?.id || (payload.id === undefined ? randomUUID() : id(payload.id)), createdAt: existing?.createdAt || new Date().toISOString() });
      if (existing) next.students[next.students.indexOf(existing)] = saved;
      else next.students.push(saved);
      break;
    }
    case 'enrollment.save': {
      object(input, ['type', 'payload']);
      const payload = object(input.payload, ['studentId', 'month', 'desk', 'fee'], ['id']);
      const existing = payload.id === undefined ? undefined : next.enrollments.find(item => item.id === id(payload.id));
      if (payload.id !== undefined && !existing) fail('ثبت‌نام پیدا نشد.');
      const saved = enrollment({ ...payload, id: existing?.id || randomUUID() });
      if (existing && (existing.studentId !== saved.studentId || existing.month !== saved.month)) fail('دانش‌آموز و ماه یک ثبت‌نام قابل تغییر نیست؛ ثبت‌نام تازه بسازید.');
      if (existing) next.enrollments[next.enrollments.indexOf(existing)] = saved;
      else next.enrollments.push(saved);
      break;
    }
    case 'enrollment.delete': {
      object(input, ['type', 'id']);
      const registration = next.enrollments.find(item => item.id === id(input.id));
      if (!registration) fail('ثبت‌نام پیدا نشد.');
      const hasHistory = next.payments.some(item => item.enrollmentId === registration.id) || next.records.some(item => item.month === registration.month && item.studentId === registration.studentId) || next.sessions.some(item => item.month === registration.month && (item.attendance[registration.studentId]?.length || 0) > 0);
      if (hasHistory) fail('ثبت‌نام دارای سابقه پرداخت، حضور یا امتیاز است و حذف نمی‌شود.');
      next.enrollments = next.enrollments.filter(item => item.id !== registration.id);
      for (const item of next.sessions.filter(item => item.month === registration.month)) delete item.attendance[registration.studentId];
      break;
    }
    case 'payment.add': {
      object(input, ['type', 'payload']);
      const payload = object(input.payload, ['enrollmentId', 'amount', 'date', 'note']);
      next.payments.push(payment({ ...payload, id: randomUUID() }));
      break;
    }
    case 'payment.delete': {
      object(input, ['type', 'id']);
      const selectedId = id(input.id);
      if (!next.payments.some(item => item.id === selectedId)) fail('پرداخت پیدا نشد.');
      next.payments = next.payments.filter(item => item.id !== selectedId);
      break;
    }
    case 'session.save': {
      object(input, ['type', 'payload']);
      const payload = object(input.payload, ['date', 'shift', 'supervisor', 'supervisorPhone', 'slots'], ['id']);
      const existing = payload.id === undefined ? undefined : next.sessions.find(item => item.id === id(payload.id));
      if (payload.id !== undefined && !existing) fail('فرم حضور و غیاب پیدا نشد.');
      const sessionDate = date(payload.date);
      const saved = session({ ...payload, id: existing?.id || randomUUID(), date: sessionDate, month: dateMonth(sessionDate), attendance: existing?.attendance || {} });
      if (existing && (saved.date !== existing.date || saved.shift !== existing.shift)) fail('تاریخ و شیفت فرم ذخیره‌شده قابل تغییر نیست؛ برای تاریخ یا شیفت دیگر فرم تازه بسازید.');
      if (existing && saved.slots.some((slot, index) => slot.id !== existing.slots[index].id)) fail('شناسه و ترتیب زنگ‌های فرم ذخیره‌شده قابل تغییر نیست.');
      if (existing) next.sessions[next.sessions.indexOf(existing)] = saved;
      else next.sessions.push(saved);
      break;
    }
    case 'attendance.toggle': {
      object(input, ['type', 'sessionId', 'studentId', 'slotId']);
      const selected = findSession(input.sessionId);
      const studentId = id(input.studentId), slotId = id(input.slotId);
      if (!selected.slots.some(slot => slot.id === slotId)) fail('زنگ حضور و غیاب معتبر نیست.');
      if (!next.enrollments.some(item => item.studentId === studentId && item.month === selected.month)) fail('دانش‌آموز در ماه این فرم ثبت‌نام نشده است.');
      const present = selected.attendance[studentId] || [];
      const updated = present.includes(slotId) ? present.filter(item => item !== slotId) : [...present, slotId];
      if (updated.length) selected.attendance[studentId] = updated;
      else delete selected.attendance[studentId];
      break;
    }
    case 'attendance.all': {
      object(input, ['type', 'sessionId', 'slotId', 'present']);
      const selected = findSession(input.sessionId), slotId = id(input.slotId);
      if (typeof input.present !== 'boolean') fail('وضعیت حضور معتبر نیست.');
      if (!selected.slots.some(slot => slot.id === slotId)) fail('زنگ حضور و غیاب معتبر نیست.');
      for (const item of next.enrollments.filter(item => item.month === selected.month)) {
        const present = selected.attendance[item.studentId] || [];
        const updated = input.present ? [...new Set([...present, slotId])] : present.filter(item => item !== slotId);
        if (updated.length) selected.attendance[item.studentId] = updated;
        else delete selected.attendance[item.studentId];
      }
      break;
    }
    case 'record.add': {
      object(input, ['type', 'payload']);
      const payload = object(input.payload, ['studentId', 'date', 'kind', 'title', 'points', 'notes']);
      const recordDate = date(payload.date);
      next.records.push(record({ ...payload, id: randomUUID(), date: recordDate, month: dateMonth(recordDate) }));
      break;
    }
    case 'record.delete': {
      object(input, ['type', 'id']);
      const selectedId = id(input.id);
      if (!next.records.some(item => item.id === selectedId)) fail('امتیاز یا تخلف پیدا نشد.');
      next.records = next.records.filter(item => item.id !== selectedId);
      break;
    }
    case 'settings.save': {
      object(input, ['type', 'payload']);
      next.settings = settings(input.payload);
      break;
    }
    case 'backup.restore': {
      object(input, ['type', 'payload']);
      return validateState(input.payload);
    }
    default: fail('نوع درخواست شناخته‌شده نیست.');
  }
  return validateState(next);
}
