import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDownToLine, Banknote, Check, ChevronLeft, CircleCheck, Clock3, History, Plus, Receipt, Search, Trash2, UserRound, Wallet } from 'lucide-react';
import type { Enrollment, PageProps } from '../../shared/types';
import { fa, jalaliDate, latin, money, monthLabel, paidFor, today } from '../../shared/utils';
import { EmptyState, Field, Modal, PageHeader, PersianDateInput, StatCard } from '../components/ui';
import './StudentsPayments.css';

type Status = 'all' | 'unpaid' | 'partial' | 'paid';
type PaymentForm = { enrollmentId: string; amount: string; date: string; note: string };
const normalize = (value: string) => latin(value).replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase().trim();
const integer = (value: string) => { const clean = latin(value).replace(/[,٬\s]/g, ''); return /^\d+$/.test(clean) ? Number(clean) : NaN; };

export default function Payments({ state, month, act, busy }: PageProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [form, setForm] = useState<PaymentForm | null>(null);
  const [error, setError] = useState('');
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const students = useMemo(() => new Map(state.students.map(s => [s.id, s])), [state.students]);
  const enrollments = state.enrollments.filter(e => e.month === month).sort((a, b) => a.desk - b.desk);
  const rows = enrollments.map(enrollment => {
    const paid = paidFor(state, enrollment.id), remaining = Math.max(0, enrollment.fee - paid);
    return { enrollment, student: students.get(enrollment.studentId), paid, remaining, status: (remaining === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid') as Exclude<Status, 'all'> };
  });
  const payable = rows.filter(row => row.remaining > 0);
  const totalFee = enrollments.reduce((sum, e) => sum + e.fee, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalRemaining = rows.reduce((sum, row) => sum + row.remaining, 0);
  const filtered = rows.filter(row => (status === 'all' || status === row.status) && normalize(`${row.student?.name || ''} ${row.student?.phone || ''} ${row.enrollment.desk}`).includes(normalize(search)));
  const selected = form ? rows.find(row => row.enrollment.id === form.enrollmentId) : undefined;
  const history = historyId ? rows.find(row => row.enrollment.id === historyId) : undefined;
  const historyPayments = state.payments.filter(p => p.enrollmentId === historyId).sort((a, b) => b.date.localeCompare(a.date));

  function openPayment(enrollment?: Enrollment) {
    const row = enrollment ? rows.find(r => r.enrollment.id === enrollment.id) : payable[0];
    if (!row) return;
    setError('');
    setForm({ enrollmentId: row.enrollment.id, amount: String(row.remaining), date: today(), note: '' });
  }
  function chooseEnrollment(id: string) {
    const row = rows.find(r => r.enrollment.id === id);
    if (row) setForm(current => current ? { ...current, enrollmentId: id, amount: String(row.remaining) } : current);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || !selected) return;
    const amount = integer(form.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) { setError('مبلغ پرداختی را به تومان و به‌صورت عدد صحیح بیشتر از صفر وارد کنید.'); return; }
    if (amount > selected.remaining) { setError(`مبلغ واردشده از مانده شهریه (${money(selected.remaining)}) بیشتر است.`); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || Number.isNaN(new Date(`${form.date}T12:00:00Z`).getTime())) { setError('تاریخ پرداخت را به‌درستی وارد کنید.'); return; }
    setError('');
    if (await act({ type: 'payment.add', payload: { enrollmentId: form.enrollmentId, amount, date: form.date, note: form.note.trim() } })) setForm(null);
  }
  function exportCsv() {
    const cell = (value: string | number) => { let text = String(value); if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
    const csv = [['ماه', 'میز', 'دانش‌آموز', 'شهریه (تومان)', 'پرداخت‌شده (تومان)', 'مانده (تومان)', 'وضعیت'], ...filtered.map(row => [monthLabel(month), row.enrollment.desk, row.student?.name || '', row.enrollment.fee, row.paid, row.remaining, row.status === 'paid' ? 'تسویه‌شده' : row.status === 'partial' ? 'پرداخت بخشی' : 'پرداخت نشده'])].map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `payments-${month}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="student-payment-page">
    <PageHeader eyebrow="حساب‌ها روشن و به‌روز" title="شهریه و پرداخت‌ها" description={`پیگیری شهریه دانش‌آموزان ${monthLabel(month)}`} actions={<>
      <button className="btn btn-secondary" onClick={exportCsv} disabled={filtered.length === 0}><ArrowDownToLine size={17} /> خروجی اکسل (CSV)</button>
      <button className="btn btn-primary" onClick={() => openPayment()} disabled={busy || payable.length === 0}><Plus size={19} /> ثبت پرداخت</button>
    </>} />
    <div className="stats-grid">
      <StatCard label="شهریه کل ماه" value={money(totalFee)} icon={Wallet} detail={`${fa(enrollments.length)} ثبت‌نام در این ماه`} />
      <StatCard label="مبلغ دریافت‌شده" value={money(totalPaid)} icon={CircleCheck} detail={`${fa(rows.filter(r => r.status === 'paid').length)} دانش‌آموز تسویه کرده‌اند`} tone="green" />
      <StatCard label="مانده شهریه" value={money(totalRemaining)} icon={Clock3} detail={`${fa(payable.length)} دانش‌آموز با مانده شهریه`} tone="amber" />
    </div>
    {totalFee > 0 && <div className="card sp-progress-card"><div className="sp-progress-label"><span><span className="sp-dot" /> وضعیت دریافت شهریه ماه</span><strong>{fa(Math.min(100, Math.round(totalPaid / totalFee * 100)))}٪</strong></div><div className="sp-progress-track"><span style={{ width: `${Math.min(100, totalPaid / totalFee * 100)}%` }} /></div><small className="muted">{money(totalPaid)} از {money(totalFee)} دریافت شده است.</small></div>}
    <section className="card sp-list-card">
      <div className="sp-list-head"><div><h2>دفتر شهریه <span className="badge">{fa(rows.length)} نفر</span></h2><p className="muted">هر پرداخت به ثبت‌نام همین ماه متصل است.</p></div><label className="sp-search"><Search size={18} /><input aria-label="جست‌وجو در پرداخت‌ها" placeholder="نام دانش‌آموز یا شماره میز…" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      {rows.length > 0 && <div className="sp-tabs" role="group" aria-label="فیلتر وضعیت پرداخت">{([['all', 'همه'], ['unpaid', 'پرداخت نشده'], ['partial', 'پرداخت بخشی'], ['paid', 'تسویه‌شده']] as [Status, string][]).map(([key, label]) => <button key={key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>{label}<span>{fa(key === 'all' ? rows.length : rows.filter(row => row.status === key).length)}</span></button>)}</div>}
      {rows.length === 0 ? <EmptyState icon={Receipt} title="دفتر شهریه این ماه هنوز خالی است" description="ابتدا در صفحه «دانش‌آموزان» ثبت‌نام این ماه و مبلغ شهریه را وارد کنید؛ سپس پرداخت کامل یا قسطی را اینجا ثبت کنید." /> : filtered.length === 0 ? <EmptyState icon={Search} title="موردی با این فیلتر پیدا نشد" description="جست‌وجو یا وضعیت پرداخت را تغییر دهید." action={<button className="btn btn-secondary" onClick={() => { setStatus('all'); setSearch(''); }}>نمایش همه</button>} /> : <div className="table-wrap"><table className="table"><thead><tr><th>میز</th><th>دانش‌آموز</th><th>شهریه</th><th>پرداخت‌شده</th><th>مانده</th><th>وضعیت</th><th><span className="sp-sr-only">عملیات</span></th></tr></thead><tbody>{filtered.map(row => <tr key={row.enrollment.id}><td><span className="sp-desk">{fa(row.enrollment.desk)}</span></td><td><div className="sp-person"><span className="sp-avatar"><UserRound size={19} /></span><strong>{row.student?.name || 'دانش‌آموز'}</strong></div></td><td className="sp-nowrap">{money(row.enrollment.fee)}</td><td className="sp-nowrap sp-paid">{money(row.paid)}</td><td className={`sp-nowrap ${row.remaining > 0 ? 'sp-outstanding' : ''}`}>{money(row.remaining)}</td><td><span className={`badge ${row.status === 'paid' ? 'sp-badge-green' : row.status === 'partial' ? 'sp-badge-amber' : 'sp-badge-neutral'}`}>{row.status === 'paid' ? 'تسویه‌شده' : row.status === 'partial' ? 'پرداخت بخشی' : 'پرداخت نشده'}</span></td><td><div className="sp-row-actions">{row.remaining > 0 && <button className="btn btn-ghost sp-pay-btn" onClick={() => openPayment(row.enrollment)} disabled={busy}><Plus size={16} /> پرداخت</button>}<button className="btn btn-ghost sp-icon-btn" onClick={() => { setHistoryId(row.enrollment.id); setDeleteId(null); }} aria-label={`سوابق پرداخت ${row.student?.name || ''}`} title="سوابق پرداخت"><History size={18} /></button></div></td></tr>)}</tbody></table></div>}
      {rows.length > 0 && <div className="sp-table-foot"><span>{fa(filtered.length)} دانش‌آموز در فهرست</span><span>همه مبلغ‌ها به تومان است.</span></div>}
    </section>

    {form && <Modal title="ثبت پرداخت شهریه" onClose={() => !busy && setForm(null)}><form className="sp-form" onSubmit={save}>
      <div className="sp-modal-context"><Banknote size={20} /><span>پرداخت شهریه <strong>{monthLabel(month)}</strong></span></div>
      <Field label="دانش‌آموز"><select className="input" value={form.enrollmentId} onChange={e => chooseEnrollment(e.target.value)}>{payable.map(row => <option key={row.enrollment.id} value={row.enrollment.id}>{row.student?.name} — میز {fa(row.enrollment.desk)}</option>)}</select></Field>
      {selected && <div className="sp-payment-summary"><div><span>شهریه ماه</span><strong>{money(selected.enrollment.fee)}</strong></div><div><span>دریافتی قبلی</span><strong>{money(selected.paid)}</strong></div><div><span>مانده قابل پرداخت</span><strong>{money(selected.remaining)}</strong></div></div>}
      <Field label="مبلغ پرداختی (تومان) *" hint="برای ثبت قسط، مبلغ دلخواه را وارد کنید."><input className="input" inputMode="numeric" dir="ltr" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required autoFocus />{Number.isFinite(integer(form.amount)) && <small className="muted">{money(integer(form.amount))}</small>}</Field>
      <Field label="تاریخ پرداخت *"><PersianDateInput label="تاریخ پرداخت" value={form.date} onChange={date => setForm({ ...form, date })} /></Field>
      <Field label="یادداشت پرداخت"><textarea className="input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={3} maxLength={1000} placeholder="روش پرداخت، شماره پیگیری یا توضیح…" /></Field>
      {error && <p role="alert" className="sp-error">{error}</p>}
      <div className="sp-modal-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'در حال ثبت…' : 'ثبت پرداخت'}<Check size={17} /></button><button className="btn btn-secondary" type="button" onClick={() => setForm(null)} disabled={busy}>انصراف</button></div>
    </form></Modal>}

    {history && <Modal title="سوابق پرداخت" onClose={() => !busy && setHistoryId(null)}><div className="sp-form"><div className="sp-history-person"><span className="sp-avatar"><UserRound size={24} /></span><div><h3>{history.student?.name}</h3><p className="muted">میز {fa(history.enrollment.desk)} · {monthLabel(month)}</p></div></div><div className="sp-payment-summary"><div><span>شهریه ماه</span><strong>{money(history.enrollment.fee)}</strong></div><div><span>پرداخت‌شده</span><strong>{money(history.paid)}</strong></div><div><span>مانده</span><strong>{money(history.remaining)}</strong></div></div>
      {historyPayments.length === 0 ? <div className="sp-history-empty"><Receipt size={30} /><p>هنوز پرداختی ثبت نشده است.</p></div> : <div className="sp-payment-history">{historyPayments.map(payment => <div key={payment.id} className="sp-history-item"><div className="sp-history-top"><span className="sp-receipt-icon"><Receipt size={18} /></span><div><strong>{money(payment.amount)}</strong><small>{jalaliDate(payment.date)}</small></div><button className="btn btn-ghost sp-icon-btn sp-danger" onClick={() => setDeleteId(payment.id)} disabled={busy} aria-label={`حذف پرداخت ${money(payment.amount)}`} title="حذف پرداخت اشتباه"><Trash2 size={16} /></button></div>{payment.note && <p className="sp-payment-note">{payment.note}</p>}{deleteId === payment.id && <div className="sp-delete-confirm"><p>این پرداخت اشتباه حذف شود؟ مانده شهریه دوباره محاسبه می‌شود.</p><div><button className="btn sp-delete-btn" disabled={busy} onClick={async () => { if (await act({ type: 'payment.delete', id: payment.id })) setDeleteId(null); }}>حذف پرداخت</button><button className="btn btn-secondary" disabled={busy} onClick={() => setDeleteId(null)}>انصراف</button></div></div>}</div>)}</div>}
      <div className="sp-modal-actions">{history.remaining > 0 && <button className="btn btn-primary" onClick={() => { setHistoryId(null); openPayment(history.enrollment); }} disabled={busy}>ثبت پرداخت جدید <ChevronLeft size={17} /></button>}<button className="btn btn-secondary" onClick={() => setHistoryId(null)} disabled={busy}>بستن</button></div>
    </div></Modal>}
  </div>;
}
