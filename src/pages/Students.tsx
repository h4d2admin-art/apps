import { useMemo, useState, type FormEvent } from 'react';
import { Armchair, Check, Copy, Pencil, Plus, Search, Trash2, UserRound, UsersRound, Wallet } from 'lucide-react';
import type { Enrollment, PageProps, Student } from '../../shared/types';
import { fa, latin, money, monthLabel, moveMonth, paidFor } from '../../shared/utils';
import { EmptyState, Field, Modal, PageHeader, StatCard } from '../components/ui';
import './StudentsPayments.css';

type RegistrationForm = {
  enrollmentId?: string; studentId: string; mode: 'new' | 'existing';
  name: string; phone: string; parentName: string; parentPhone: string; notes: string;
  desk: string; fee: string;
};
const normalize = (value: string) => latin(value).replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase().trim();
const integer = (value: string) => { const clean = latin(value).replace(/[,٬\s]/g, ''); return /^\d+$/.test(clean) ? Number(clean) : NaN; };

export default function Students({ state, month, act, busy }: PageProps) {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<RegistrationForm | null>(null);
  const [error, setError] = useState('');
  const [remove, setRemove] = useState<Enrollment | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState('');
  const students = useMemo(() => new Map(state.students.map(s => [s.id, s])), [state.students]);
  const enrollments = state.enrollments.filter(e => e.month === month).sort((a, b) => a.desk - b.desk);
  const occupied = new Set(enrollments.map(e => e.desk));
  const freeDesks = Array.from({ length: state.settings.deskCount }, (_, i) => i + 1).filter(d => !occupied.has(d));
  const previousMonth = moveMonth(month, -1);
  const previous = state.enrollments.filter(e => e.month === previousMonth && !enrollments.some(current => current.studentId === e.studentId));
  const availableStudents = state.students.filter(s => !enrollments.some(e => e.studentId === s.id));
  const query = normalize(search);
  const filtered = enrollments.filter(e => {
    const student = students.get(e.studentId);
    return student && normalize(`${student.name} ${student.phone} ${student.parentName} ${student.parentPhone} ${e.desk}`).includes(query);
  });

  function openNew() {
    setError('');
    setForm({ mode: 'new', studentId: crypto.randomUUID(), name: '', phone: '', parentName: '', parentPhone: '', notes: '', desk: String(freeDesks[0] || ''), fee: String(state.settings.defaultFee) });
  }
  function openEdit(enrollment: Enrollment) {
    const student = students.get(enrollment.studentId);
    if (!student) return;
    setError('');
    setForm({ ...student, studentId: student.id, mode: 'existing', enrollmentId: enrollment.id, desk: String(enrollment.desk), fee: String(enrollment.fee) });
  }
  function selectStudent(id: string) {
    const student = students.get(id);
    if (!student) return;
    setForm(current => current ? { ...current, studentId: student.id, name: student.name, phone: student.phone, parentName: student.parentName, parentPhone: student.parentPhone, notes: student.notes } : current);
  }
  function patch(values: Partial<RegistrationForm>) { setForm(current => current ? { ...current, ...values } : null); }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setError('');
    const desk = integer(form.desk), fee = integer(form.fee);
    if (!form.name.trim()) { setError('نام و نام خانوادگی دانش‌آموز را وارد کنید.'); return; }
    if (!Number.isSafeInteger(desk) || desk < 1 || desk > state.settings.deskCount) { setError(`شماره میز باید بین ۱ تا ${fa(state.settings.deskCount)} باشد.`); return; }
    if (enrollments.some(e => e.desk === desk && e.id !== form.enrollmentId)) { setError('این میز برای دانش‌آموز دیگری ثبت شده است. یک میز آزاد انتخاب کنید.'); return; }
    if (!Number.isSafeInteger(fee) || fee < 0) { setError('شهریه را به تومان و به‌صورت عدد صحیح وارد کنید.'); return; }
    if (form.enrollmentId && fee < paidFor(state, form.enrollmentId)) { setError('شهریه نمی‌تواند از مجموع پرداخت‌های ثبت‌شده کمتر باشد. ابتدا پرداخت اشتباه را از صفحه شهریه اصلاح کنید.'); return; }
    const saved = await act({ type: 'student.save', payload: { id: form.studentId, name: form.name.trim(), phone: latin(form.phone.trim()), parentName: form.parentName.trim(), parentPhone: latin(form.parentPhone.trim()), notes: form.notes.trim() } });
    if (!saved) return;
    if (await act({ type: 'enrollment.save', payload: { id: form.enrollmentId, studentId: form.studentId, month, desk, fee } })) setForm(null);
  }

  async function copyPrevious() {
    setCopying(true);
    const used = new Set(occupied);
    let copied = 0;
    for (const enrollment of previous.sort((a, b) => a.desk - b.desk)) {
      const desk = !used.has(enrollment.desk) && enrollment.desk <= state.settings.deskCount ? enrollment.desk : Array.from({ length: state.settings.deskCount }, (_, i) => i + 1).find(d => !used.has(d));
      if (!desk) break;
      if (!await act({ type: 'enrollment.save', payload: { studentId: enrollment.studentId, month, desk, fee: enrollment.fee } })) break;
      used.add(desk); copied++;
    }
    setCopying(false); setCopyOpen(false);
    setNotice(`${fa(copied)} دانش‌آموز از ${monthLabel(previousMonth)} ثبت‌نام شد.${copied < previous.length ? ' برای ثبت‌نام باقی دانش‌آموزان، ظرفیت میزها و پیام خطا را بررسی کنید.' : ''}`);
  }

  function hasHistory(enrollment: Enrollment) {
    return state.payments.some(p => p.enrollmentId === enrollment.id) || state.records.some(r => r.studentId === enrollment.studentId && r.month === month) || state.sessions.some(s => s.month === month && (s.attendance[enrollment.studentId] || []).length > 0);
  }

  return <div className="student-payment-page">
    <PageHeader eyebrow="از اولین روز، مرتب و منظم" title="دانش‌آموزان و ثبت‌نام" description={`ثبت‌نام و چیدمان میزهای ${monthLabel(month)}`} actions={<>
      <button className="btn btn-secondary" onClick={() => setCopyOpen(true)} disabled={busy || copying || previous.length === 0 || freeDesks.length === 0}><Copy size={17} /> انتقال از ماه قبل</button>
      <button className="btn btn-primary" onClick={openNew} disabled={busy || copying || freeDesks.length === 0}><Plus size={19} /> ثبت‌نام دانش‌آموز</button>
    </>} />
    <div className="stats-grid">
      <StatCard label="دانش‌آموزان این ماه" value={fa(enrollments.length)} icon={UsersRound} detail={monthLabel(month)} />
      <StatCard label="میزهای آزاد" value={fa(freeDesks.length)} icon={Armchair} detail={`از مجموع ${fa(state.settings.deskCount)} میز`} tone="green" />
      <StatCard label="مجموع شهریه ماه" value={money(enrollments.reduce((sum, e) => sum + e.fee, 0))} icon={Wallet} detail="بر اساس ثبت‌نام‌های این ماه" tone="amber" />
    </div>
    {notice && <div className="sp-notice" role="status"><Check size={18} /><span>{notice}</span><button className="btn btn-ghost" onClick={() => setNotice('')}>بستن</button></div>}
    <section className="card sp-list-card">
      <div className="sp-list-head"><div><h2>فهرست ثبت‌نام‌ها <span className="badge">{fa(enrollments.length)} نفر</span></h2><p className="muted">میز هر دانش‌آموز در این ماه اختصاصی است.</p></div><label className="sp-search"><Search size={18} /><input aria-label="جست‌وجوی دانش‌آموز" placeholder="نام، شماره میز یا تلفن…" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      {enrollments.length === 0 ? <EmptyState icon={UsersRound} title="اولین دانش‌آموز این ماه را ثبت‌نام کنید" description="نام، شماره میز، اطلاعات خانواده و شهریه را یک‌بار وارد کنید تا حضور و غیاب و پرداخت‌ها آماده باشند." action={<button className="btn btn-primary" onClick={openNew} disabled={freeDesks.length === 0}><Plus size={18} /> ثبت‌نام دانش‌آموز</button>} /> : filtered.length === 0 ? <EmptyState icon={Search} title="دانش‌آموزی پیدا نشد" description="نام، شماره میز یا شماره تلفن دیگری را جست‌وجو کنید." action={<button className="btn btn-secondary" onClick={() => setSearch('')}>پاک کردن جست‌وجو</button>} /> : <div className="table-wrap"><table className="table"><thead><tr><th>میز</th><th>دانش‌آموز</th><th>ولی دانش‌آموز</th><th>شهریه ماه</th><th>وضعیت پرداخت</th><th><span className="sp-sr-only">عملیات</span></th></tr></thead><tbody>{filtered.map(enrollment => {
        const student = students.get(enrollment.studentId) as Student;
        const paid = paidFor(state, enrollment.id), settled = paid >= enrollment.fee;
        const history = hasHistory(enrollment);
        return <tr key={enrollment.id}><td><span className="sp-desk">{fa(enrollment.desk)}</span></td><td><div className="sp-person"><span className="sp-avatar"><UserRound size={19} /></span><span><strong>{student.name}</strong><small dir="ltr">{student.phone ? fa(student.phone) : 'شماره تماس ثبت نشده'}</small></span></div></td><td><strong className="sp-normal">{student.parentName || '—'}</strong>{student.parentPhone && <small className="sp-sub" dir="ltr">{fa(student.parentPhone)}</small>}</td><td className="sp-nowrap">{money(enrollment.fee)}</td><td><span className={`badge ${settled ? 'sp-badge-green' : paid > 0 ? 'sp-badge-amber' : 'sp-badge-neutral'}`}>{settled ? 'تسویه‌شده' : paid > 0 ? 'پرداخت بخشی' : 'پرداخت نشده'}</span></td><td><div className="sp-row-actions"><button className="btn btn-ghost sp-icon-btn" aria-label={`ویرایش ${student.name}`} title="ویرایش ثبت‌نام" onClick={() => openEdit(enrollment)} disabled={busy}><Pencil size={17} /></button><button className="btn btn-ghost sp-icon-btn sp-danger" aria-label={`حذف ثبت‌نام ${student.name}`} title={history ? 'ثبت‌نام دارای سابقه قابل حذف نیست' : 'حذف ثبت‌نام اشتباه'} onClick={() => setRemove(enrollment)} disabled={busy || history}><Trash2 size={17} /></button></div></td></tr>;
      })}</tbody></table></div>}
      {enrollments.length > 0 && <div className="sp-table-foot"><span>{fa(filtered.length)} دانش‌آموز در فهرست</span><span>{freeDesks.length ? `اولین میز آزاد: ${fa(freeDesks[0])}` : 'ظرفیت سالن تکمیل است'}</span></div>}
    </section>

    {form && <Modal title={form.enrollmentId ? 'ویرایش ثبت‌نام' : 'ثبت‌نام دانش‌آموز'} onClose={() => !busy && setForm(null)} wide><form onSubmit={save} className="sp-form">
      <div className="sp-modal-context"><Armchair size={19} /><span>ثبت‌نام برای <strong>{monthLabel(month)}</strong></span></div>
      {!form.enrollmentId && availableStudents.length > 0 && <><div className="sp-segment" aria-label="نوع ثبت‌نام"><button type="button" className={form.mode === 'new' ? 'active' : ''} onClick={() => patch({ mode: 'new', studentId: crypto.randomUUID(), name: '', phone: '', parentName: '', parentPhone: '', notes: '' })}>دانش‌آموز جدید</button><button type="button" className={form.mode === 'existing' ? 'active' : ''} onClick={() => { patch({ mode: 'existing' }); selectStudent(availableStudents[0].id); }}>دانش‌آموز قبلی</button></div>{form.mode === 'existing' && <Field label="انتخاب دانش‌آموز"><select className="input" value={form.studentId} onChange={e => selectStudent(e.target.value)}>{availableStudents.map(s => <option key={s.id} value={s.id}>{s.name}{s.phone ? ` — ${fa(s.phone)}` : ''}</option>)}</select></Field>}</>}
      <div className="form-grid">
        <Field label="نام و نام خانوادگی *"><input className="input" autoFocus value={form.name} onChange={e => patch({ name: e.target.value })} required maxLength={120} placeholder="نام کامل دانش‌آموز" /></Field>
        <Field label="شماره تماس دانش‌آموز"><input className="input" type="tel" dir="ltr" value={form.phone} onChange={e => patch({ phone: e.target.value })} maxLength={30} placeholder="09…" /></Field>
        <Field label="نام و نام خانوادگی ولی"><input className="input" value={form.parentName} onChange={e => patch({ parentName: e.target.value })} maxLength={120} placeholder="نام پدر، مادر یا سرپرست" /></Field>
        <Field label="شماره تماس ولی"><input className="input" type="tel" dir="ltr" value={form.parentPhone} onChange={e => patch({ parentPhone: e.target.value })} maxLength={30} placeholder="09…" /></Field>
        <Field label="شماره میز *" hint={`${fa(freeDesks.length)} میز آزاد در این ماه`}><select className="input" value={form.desk} onChange={e => patch({ desk: e.target.value })} required><option value="" disabled>انتخاب میز</option>{Array.from({ length: state.settings.deskCount }, (_, i) => i + 1).filter(d => !occupied.has(d) || (form.enrollmentId && enrollments.find(e => e.id === form.enrollmentId)?.desk === d)).map(d => <option key={d} value={d}>میز {fa(d)}</option>)}</select></Field>
        <Field label="شهریه ماه (تومان) *"><input className="input" inputMode="numeric" value={form.fee} onChange={e => patch({ fee: e.target.value })} required dir="ltr" />{Number.isFinite(integer(form.fee)) && <small className="muted">{money(integer(form.fee))}</small>}</Field>
      </div>
      <Field label="یادداشت"><textarea className="input" rows={3} maxLength={2000} value={form.notes} onChange={e => patch({ notes: e.target.value })} placeholder="نکته‌ای درباره دانش‌آموز یا هماهنگی با خانواده…" /></Field>
      {error && <p className="sp-error" role="alert">{error}</p>}
      <div className="sp-modal-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : form.enrollmentId ? 'ذخیره تغییرات' : 'ثبت‌نام دانش‌آموز'}</button><button className="btn btn-secondary" type="button" onClick={() => setForm(null)} disabled={busy}>انصراف</button></div>
    </form></Modal>}
    {copyOpen && <Modal title="انتقال ثبت‌نام‌های ماه قبل" onClose={() => !copying && setCopyOpen(false)}><div className="sp-form"><p>ثبت‌نام {fa(previous.length)} دانش‌آموز از <strong>{monthLabel(previousMonth)}</strong> به <strong>{monthLabel(month)}</strong> منتقل می‌شود. شهریه قبلی حفظ می‌شود و می‌توانید پس از انتقال آن را ویرایش کنید.</p><p className="muted">اگر میز قبلی اشغال باشد، اولین میز آزاد اختصاص پیدا می‌کند. پرداخت‌ها و حضور و غیاب منتقل نمی‌شوند.</p>{previous.length > freeDesks.length && <p className="sp-error">فقط برای {fa(freeDesks.length)} نفر میز آزاد دارید؛ باقی افراد منتقل نمی‌شوند.</p>}<div className="sp-modal-actions"><button className="btn btn-primary" onClick={copyPrevious} disabled={busy || copying}>{copying ? 'در حال انتقال…' : 'انتقال ثبت‌نام‌ها'}</button><button className="btn btn-secondary" onClick={() => setCopyOpen(false)} disabled={copying}>انصراف</button></div></div></Modal>}
    {remove && <Modal title="حذف ثبت‌نام اشتباه" onClose={() => !busy && setRemove(null)}><div className="sp-form"><p>ثبت‌نام <strong>{students.get(remove.studentId)?.name}</strong> از {monthLabel(month)} حذف شود؟ مشخصات دانش‌آموز حفظ می‌شود.</p><p className="muted">فقط ثبت‌نامی که سابقه حضور، پرداخت یا امتیاز ندارد قابل حذف است.</p><div className="sp-modal-actions"><button className="btn sp-delete-btn" onClick={async () => { if (await act({ type: 'enrollment.delete', id: remove.id })) setRemove(null); }} disabled={busy}>حذف ثبت‌نام</button><button className="btn btn-secondary" onClick={() => setRemove(null)} disabled={busy}>انصراف</button></div></div></Modal>}
  </div>;
}
