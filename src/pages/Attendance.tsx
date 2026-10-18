import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, Check, CheckCheck, Clock3, Download, LoaderCircle, Moon, Settings2, ShieldCheck, Star, Sun, Users } from 'lucide-react';
import { toPng } from 'html-to-image';
import type { Action, PageProps, Shift, Slot } from '../../shared/types';
import { defaultSlots, fa, firstDayOfMonth, jalaliDate, longDate, monthLabel, monthOf, slotMinutes, today } from '../../shared/utils';
import { EmptyState, Field, Modal, PageHeader, PersianDateInput } from '../components/ui';
import './Attendance.css';

const dateForMonth = (month: string) => monthOf(today()) === month ? today() : firstDayOfMonth(month);
const shiftLabel = (shift: Shift) => shift === 'morning' ? 'صبح' : 'عصر';
const bellLabels = ['زنگ اول', 'زنگ دوم', 'زنگ سوم', 'زنگ چهارم'];

export default function Attendance({ state, month, act, busy, onMonthChange }: PageProps) {
  const [date, setDate] = useState(() => dateForMonth(month));
  const [dateValid, setDateValid] = useState(true);
  const [shift, setShift] = useState<Shift>('morning');
  const [editing, setEditing] = useState(false);
  const [supervisor, setSupervisor] = useState('');
  const [supervisorPhone, setSupervisorPhone] = useState('');
  const [draftSlots, setDraftSlots] = useState<Slot[]>(defaultSlots('morning'));
  const [formError, setFormError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [pending, setPending] = useState(false);
  const requestPending = useRef(false);
  const exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setDate(current => monthOf(current) === month ? current : dateForMonth(month)); setDateValid(true); }, [month]);

  const selectedMonth = monthOf(date);
  const session = state.sessions.find(item => item.date === date && item.shift === shift);
  const slots = session?.slots ?? defaultSlots(shift);
  const roster = useMemo(() => state.enrollments
    .filter(enrollment => enrollment.month === selectedMonth)
    .map(enrollment => ({ enrollment, student: state.students.find(student => student.id === enrollment.studentId) }))
    .filter((item): item is typeof item & { student: NonNullable<typeof item.student> } => Boolean(item.student))
    .sort((a, b) => a.enrollment.desk - b.enrollment.desk), [state.enrollments, state.students, selectedMonth]);
  const isPresent = (studentId: string, slotId: string) => Boolean(session?.attendance[studentId]?.includes(slotId));
  const totals = slots.map(slot => roster.filter(({ student }) => isPresent(student.id, slot.id)).length);
  const totalPresent = roster.filter(({ student }) => slots.some(slot => isPresent(student.id, slot.id))).length;
  const totalHours = slots.reduce((sum, slot, index) => sum + totals[index] * slotMinutes(slot) / 60, 0);
  const disabled = busy || pending || !dateValid;
  const groupCount = Math.min(3, Math.max(1, Math.ceil(roster.length / 25)));
  const groupSize = Math.ceil(roster.length / groupCount);
  const exportGroups = Array.from({ length: groupCount }, (_, index) => roster.slice(index * groupSize, (index + 1) * groupSize));

  async function run(action: Action) {
    if (requestPending.current || busy) return false;
    requestPending.current = true;
    setPending(true);
    try { return await act(action); }
    finally { requestPending.current = false; setPending(false); }
  }

  function openEditor() {
    const previous = [...state.sessions].reverse().find(item => item.shift === shift);
    setSupervisor(session?.supervisor ?? previous?.supervisor ?? '');
    setSupervisorPhone(session?.supervisorPhone ?? previous?.supervisorPhone ?? '');
    setDraftSlots((session?.slots ?? defaultSlots(shift)).map(slot => ({ ...slot })));
    setFormError('');
    setEditing(true);
  }

  async function saveSession(event: FormEvent) {
    event.preventDefault();
    if (!supervisor.trim()) { setFormError('نام سرپرست این شیفت را وارد کنید.'); return; }
    if (draftSlots.some((slot, index) => slotMinutes(slot) <= 0 || (index > 0 && slot.start < draftSlots[index - 1].end))) {
      setFormError('زمان پایان هر زنگ باید بعد از شروع آن باشد و زنگ‌ها با هم تداخل نداشته باشند.');
      return;
    }
    setFormError('');
    const saved = await run({ type: 'session.save', payload: { ...(session ? { id: session.id } : {}), date, shift, supervisor: supervisor.trim(), supervisorPhone: supervisorPhone.trim(), slots: draftSlots } });
    if (saved) setEditing(false);
  }

  async function exportImage() {
    if (!exportRef.current || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      await document.fonts.ready;
      const dataUrl = await toPng(exportRef.current, { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: false });
      const link = document.createElement('a');
      link.download = `حضور و غیاب - ${state.settings.hallName} - ${jalaliDate(date).replaceAll('/', '-')} - ${shiftLabel(shift)}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setExportError('دریافت تصویر انجام نشد. کمی صبر کنید و دوباره دکمه خروجی تصویر را بزنید.');
    } finally { setExporting(false); }
  }

  return <div className="page attendance-page">
    <PageHeader eyebrow="هر ستاره، یک قدم رو به جلو" title="حضور و غیاب" description="تاریخ و شیفت را انتخاب کنید و حضور هر دانش‌آموز را با یک ستاره ثبت کنید." actions={<button className="btn btn-primary" onClick={exportImage} disabled={!session || !roster.length || exporting || disabled}>{exporting ? <LoaderCircle size={18} className="att-spin" /> : <Download size={18} />} {exporting ? 'در حال ساخت تصویر…' : 'خروجی تصویر'}</button>} />

    <div className="att-controls card">
      <div className="att-date-control" onChange={event => { if (event.target instanceof HTMLInputElement) setDateValid(event.target.validity.valid); }}><span className="att-control-label"><CalendarDays size={17} /> تاریخ حضور و غیاب</span><PersianDateInput value={date} onChange={next => { setDate(next); if (monthOf(next) !== month) onMonthChange?.(monthOf(next)); }} label="تاریخ حضور و غیاب" /><span className={`att-day ${dateValid ? '' : 'att-date-invalid'}`}>{dateValid ? new Intl.DateTimeFormat('fa-IR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : 'تاریخ شمسی معتبر وارد کنید.'}</span></div>
      <div className="att-shift-control"><span className="att-control-label">شیفت مطالعه</span><div className="att-shift-tabs" role="group" aria-label="انتخاب شیفت مطالعه"><button className={shift === 'morning' ? 'active' : ''} onClick={() => setShift('morning')} aria-pressed={shift === 'morning'}><Sun size={18} /> صبح <span>۴ زنگ</span></button><button className={shift === 'evening' ? 'active' : ''} onClick={() => setShift('evening')} aria-pressed={shift === 'evening'}><Moon size={18} /> عصر <span>۴ زنگ</span></button></div></div>
      <div className="att-supervisor-control"><span className="att-control-label"><ShieldCheck size={17} /> سرپرست شیفت {shiftLabel(shift)}</span><strong>{session?.supervisor || 'هنوز مشخص نشده'}</strong>{session?.supervisorPhone && <span className="att-supervisor-phone" dir="ltr">{fa(session.supervisorPhone)}</span>}<button className="btn btn-ghost att-session-edit" onClick={openEditor} disabled={disabled}><Settings2 size={15} /> {session ? 'ویرایش شیفت و زنگ‌ها' : 'ثبت شیفت و سرپرست'}</button></div>
    </div>

    <div className="att-summary">
      <div><span className="att-summary-icon violet"><Users size={20} /></span><span><span className="att-summary-label">دانش‌آموزان این ماه</span><strong>{fa(roster.length)} <small>نفر</small></strong></span></div>
      <div><span className="att-summary-icon green"><CheckCheck size={20} /></span><span><span className="att-summary-label">حاضر در این شیفت</span><strong>{fa(totalPresent)} <small>از {fa(roster.length)} نفر</small></strong></span></div>
      <div><span className="att-summary-icon amber"><Clock3 size={20} /></span><span><span className="att-summary-label">مجموع مطالعه ثبت‌شده</span><strong>{fa(totalHours)} <small>ساعت</small></strong></span></div>
    </div>

    {exportError && <p className="att-error" role="alert">{exportError}</p>}
    {!roster.length ? <div className="card"><EmptyState icon={Users} title="لیست این ماه هنوز خالی است" description={`ابتدا دانش‌آموزان ${monthLabel(selectedMonth)} را ثبت‌نام کنید و برای هر نفر شماره میز تعیین کنید.`} action={<a className="btn btn-primary" href="#students">ثبت‌نام دانش‌آموز</a>} /></div> : <div className="card att-roster-card">
      <div className="att-roster-heading"><div><h2>لیست حضور و غیاب</h2><p>{longDate(date)} <span>•</span> شیفت {shiftLabel(shift)}</p></div><span className="att-autosave">{session ? <><span /> حضورها خودکار ذخیره می‌شوند</> : <><CalendarDays size={15} /> ثبت شیفت الزامی است</>}</span></div>
      {!session && <div className="att-start-notice"><span>برای شروع، نام سرپرست و ساعت زنگ‌های شیفت {shiftLabel(shift)} را ثبت کنید.</span><button className="btn btn-primary" onClick={openEditor} disabled={disabled}>شروع حضور و غیاب</button></div>}
      <div className="table-wrap att-table-wrap"><table className="att-table"><thead><tr><th className="att-row-number">ردیف</th><th className="att-student-col">نام و نام خانوادگی</th><th className="att-desk-col">شماره میز</th>{slots.map((slot, index) => <th key={slot.id} className="att-slot-heading"><span>{bellLabels[index]}</span><small dir="ltr">{fa(slot.start)} — {fa(slot.end)}</small><button className={`att-all-button ${totals[index] === roster.length ? 'is-all' : ''}`} title={totals[index] === roster.length ? 'لغو حضور همه در این زنگ' : 'ثبت حضور همه در این زنگ'} aria-label={`${totals[index] === roster.length ? 'لغو' : 'ثبت'} حضور همه در ${bellLabels[index]}`} onClick={() => session && run({ type: 'attendance.all', sessionId: session.id, slotId: slot.id, present: totals[index] !== roster.length })} disabled={!session || disabled}><Check size={12} /> همه</button></th>)}<th className="att-total-col">ساعت مطالعه</th></tr></thead><tbody>{roster.map(({ student, enrollment }, index) => { const hours = slots.filter(slot => isPresent(student.id, slot.id)).reduce((sum, slot) => sum + slotMinutes(slot) / 60, 0); return <tr key={enrollment.id}><td className="att-row-number">{fa(index + 1)}</td><td><div className="att-student-name"><span className={`att-avatar att-avatar-${index % 5}`}>{student.name.trim().charAt(0)}</span><strong>{student.name}</strong></div></td><td><span className="att-desk-number">{fa(enrollment.desk)}</span></td>{slots.map((slot, slotIndex) => <td className="att-star-cell" key={slot.id}><button className={`att-star-button ${isPresent(student.id, slot.id) ? 'is-present' : ''}`} disabled={!session || disabled} aria-pressed={isPresent(student.id, slot.id)} aria-label={`${isPresent(student.id, slot.id) ? 'لغو حضور' : 'ثبت حضور'} ${student.name} در ${bellLabels[slotIndex]}`} title={isPresent(student.id, slot.id) ? 'حاضر؛ برای لغو کلیک کنید' : session ? 'ثبت حضور' : 'ابتدا شیفت و سرپرست را ثبت کنید'} onClick={() => session && run({ type: 'attendance.toggle', sessionId: session.id, studentId: student.id, slotId: slot.id })}><Star size={23} fill={isPresent(student.id, slot.id) ? 'currentColor' : 'none'} strokeWidth={1.7} /></button></td>)}<td className="att-hours">{hours ? <>{fa(hours)} <small>ساعت</small></> : <span className="att-no-hours">—</span>}</td></tr>; })}</tbody><tfoot><tr><td colSpan={3}>مجموع حاضرین هر زنگ</td>{totals.map((total, index) => <td key={index}>{fa(total)} <small>نفر</small></td>)}<td>{fa(totalHours)} <small>ساعت</small></td></tr></tfoot></table></div>
      <div className="att-roster-footer"><span><Star size={15} fill="currentColor" /> ستاره سبز یعنی حضور ثبت شده</span><span>ثبت‌نام‌شدگان {monthLabel(selectedMonth)} <span className="att-footer-dot">•</span> {fa(roster.length)} دانش‌آموز</span></div>
    </div>}
    <p className="att-export-hint"><Download size={15} /> خروجی تصویر، یک فرم کامل از همه دانش‌آموزان این شیفت است؛ آماده ارسال برای اولیا.</p>

    <div className="att-export-stage" aria-hidden="true"><div ref={exportRef} className="att-export-sheet" dir="rtl">
      <div className="att-export-header"><div><strong>حضور و غیاب روزانه {state.settings.hallName}</strong><span>{longDate(date)} · شیفت {shiftLabel(shift)}</span></div><div><span>سرپرست: <b>{session?.supervisor || '—'}</b></span>{session?.supervisorPhone && <span>تماس سرپرست: <b dir="ltr">{fa(session.supervisorPhone)}</b></span>}</div></div>
      <div className="att-export-groups">{exportGroups.map((group, groupIndex) => <table key={groupIndex} className="att-export-table"><thead><tr><th rowSpan={2} className="att-export-desk">میز</th><th rowSpan={2} className="att-export-name">نام و نام خانوادگی</th><th colSpan={4}>وقت مطالعه</th></tr><tr>{slots.map((slot, index) => <th key={slot.id}>{fa(index + 1)}<small>{fa(slot.start)}</small></th>)}</tr></thead><tbody>{group.map(({ enrollment, student }) => <tr key={enrollment.id}><td className="att-export-desk">{fa(enrollment.desk)}</td><td className="att-export-name">{student.name}</td>{slots.map(slot => <td key={slot.id} className={isPresent(student.id, slot.id) ? 'att-export-present' : ''}>{isPresent(student.id, slot.id) ? '★' : ''}</td>)}</tr>)}</tbody><tfoot><tr><td colSpan={2}>جمع حاضرین</td>{slots.map(slot => <td key={slot.id}>{fa(group.filter(({ student }) => isPresent(student.id, slot.id)).length)}</td>)}</tr></tfoot></table>)}</div>
      <div className="att-export-total"><span>مجموع دانش‌آموزان: {fa(roster.length)} نفر</span><span>حاضر در شیفت: {fa(totalPresent)} نفر</span><span>مجموع مطالعه: {fa(totalHours)} ساعت</span></div>
    </div></div>

    {editing && <Modal title={`${session ? 'ویرایش' : 'ثبت'} شیفت ${shiftLabel(shift)}`} onClose={() => !disabled && setEditing(false)} wide><form onSubmit={saveSession} className="att-session-form"><p className="att-modal-date"><CalendarDays size={17} /> {longDate(date)} · شیفت {shiftLabel(shift)}</p><div className="att-form-grid"><Field label="نام و نام خانوادگی سرپرست"><input className="input" value={supervisor} onChange={event => setSupervisor(event.target.value)} placeholder="مثلاً محمد رضایی" autoFocus required maxLength={100} /></Field><Field label="شماره تماس سرپرست" hint="اختیاری؛ در خروجی فرم نمایش داده می‌شود."><input className="input" value={supervisorPhone} onChange={event => setSupervisorPhone(event.target.value)} placeholder="۰۹۱۲…" type="tel" dir="ltr" maxLength={20} /></Field></div><div className="att-bell-settings"><h3>ساعت چهار زنگ مطالعه</h3><p>هر ستاره به اندازه زمان همان زنگ، ساعت مطالعه ثبت می‌کند.</p>{draftSlots.map((slot, index) => <div className="att-bell-setting" key={slot.id}><strong>{bellLabels[index]}</strong><label>شروع<input aria-label={`شروع ${bellLabels[index]}`} className="input" type="time" value={slot.start} required onChange={event => setDraftSlots(previous => previous.map((item, i) => i === index ? { ...item, start: event.target.value } : item))} /></label><span>تا</span><label>پایان<input aria-label={`پایان ${bellLabels[index]}`} className="input" type="time" value={slot.end} required onChange={event => setDraftSlots(previous => previous.map((item, i) => i === index ? { ...item, end: event.target.value } : item))} /></label><span className="att-duration">{slotMinutes(slot) > 0 ? `${fa(slotMinutes(slot))} دقیقه` : 'زمان نامعتبر'}</span></div>)}</div>{session && <p className="att-edit-warning">با تغییر ساعت زنگ‌ها، ساعت مطالعه حضورهای همین شیفت هم دوباره محاسبه می‌شود.</p>}{formError && <p className="att-error" role="alert">{formError}</p>}<div className="att-modal-actions"><button type="submit" className="btn btn-primary" disabled={disabled}>{disabled ? <LoaderCircle size={17} className="att-spin" /> : <Check size={17} />} ذخیره شیفت</button><button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} disabled={disabled}>انصراف</button></div></form></Modal>}
  </div>;
}
