import { useMemo, useState, type FormEvent } from 'react';
import { Award, ChevronDown, ClipboardList, Plus, Search, ShieldAlert, Trash2 } from 'lucide-react';
import type { ConductRecord, PageProps } from '../../shared/types';
import { fa, firstDayOfMonth, jalaliDate, monthLabel, monthOf, today } from '../../shared/utils';
import { EmptyState, Field, Modal, PageHeader, PersianDateInput, StatCard } from '../components/ui';

const presets = {
  negative: [
    { title: 'تأخیر', points: 2 },
    { title: 'استفاده از تلفن همراه', points: 5 },
    { title: 'ایجاد سروصدا', points: 3 },
    { title: 'بی‌نظمی', points: 3 },
    { title: 'خروج بدون هماهنگی', points: 5 },
  ],
  positive: [
    { title: 'حضور به‌موقع و منظم', points: 2 },
    { title: 'تمرکز و مطالعه مؤثر', points: 3 },
    { title: 'همکاری با سرپرست', points: 2 },
    { title: 'کمک به هم‌کلاسی‌ها', points: 2 },
    { title: 'رعایت کامل نظم سالن', points: 3 },
  ],
};

export default function Conduct({ state, month, act, busy }: PageProps) {
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'positive' | 'negative'>('all');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<ConductRecord | null>(null);
  const [kind, setKind] = useState<'positive' | 'negative'>('negative');
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState(today());
  const [preset, setPreset] = useState(presets.negative[0].title);
  const [title, setTitle] = useState(presets.negative[0].title);
  const [points, setPoints] = useState('2');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const enrolled = useMemo(() => state.enrollments.filter(e => e.month === month).map(e => ({ ...e, student: state.students.find(s => s.id === e.studentId) })).filter(e => !!e.student).sort((a, b) => a.desk - b.desk), [state.enrollments, state.students, month]);
  const records = state.records.filter(r => r.month === month);
  const filtered = records.filter(r => {
    const student = state.students.find(s => s.id === r.studentId);
    return (kindFilter === 'all' || r.kind === kindFilter) && `${student?.name || ''} ${r.title} ${r.notes}`.includes(search.trim());
  }).sort((a, b) => b.date.localeCompare(a.date));
  const positive = records.filter(r => r.kind === 'positive').reduce((sum, r) => sum + r.points, 0);
  const negative = records.filter(r => r.kind === 'negative').reduce((sum, r) => sum + r.points, 0);

  function openForm() {
    setKind('negative'); setStudentId(enrolled[0]?.studentId || '');
    setDate(monthOf(today()) === month ? today() : firstDayOfMonth(month));
    setPreset(presets.negative[0].title); setTitle(presets.negative[0].title);
    setPoints('2'); setNotes(''); setError(''); setAdding(true);
  }

  function changeKind(value: 'positive' | 'negative') {
    const first = presets[value][0];
    setKind(value); setPreset(first.title); setTitle(first.title); setPoints(String(first.points));
  }

  function changePreset(value: string) {
    setPreset(value);
    const chosen = presets[kind].find(p => p.title === value);
    if (chosen) { setTitle(chosen.title); setPoints(String(chosen.points)); }
    else { setTitle(''); setPoints('1'); }
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!studentId || !enrolled.some(e => e.studentId === studentId)) { setError('یک دانش‌آموز ثبت‌نام‌شده در این ماه انتخاب کنید.'); return; }
    if (!date || monthOf(date) !== month) { setError(`تاریخ ثبت باید در ${monthLabel(month)} باشد.`); return; }
    if (!title.trim()) { setError('عنوان مورد را بنویسید.'); return; }
    const amount = Number(points);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 100) { setError('امتیاز باید یک عدد صحیح بین ۱ تا ۱۰۰ باشد.'); return; }
    const ok = await act({ type: 'record.add', payload: { studentId, date, kind, title: title.trim(), points: amount, notes: notes.trim() } });
    if (ok) setAdding(false);
  }

  return <div className="page conduct-page">
    <PageHeader eyebrow="نظم، انگیزه و پیشرفت" title="انضباط و امتیازها" description={`ثبت نکات مثبت و موارد انضباطی دانش‌آموزان در ${monthLabel(month)}`} actions={<button className="btn btn-primary" onClick={openForm} disabled={!enrolled.length || busy}><Plus size={18} />ثبت مورد جدید</button>} />
    <div className="stats-grid">
      <StatCard label="موارد ثبت‌شده" value={fa(records.length)} icon={ClipboardList} detail="در ماه انتخاب‌شده" />
      <StatCard label="امتیازهای مثبت" value={fa(positive)} icon={Award} detail={`${fa(records.filter(r => r.kind === 'positive').length)} مورد تشویقی`} tone="green" />
      <StatCard label="امتیازهای منفی" value={fa(negative)} icon={ShieldAlert} detail={`${fa(records.filter(r => r.kind === 'negative').length)} مورد انضباطی`} tone="orange" />
    </div>
    {!enrolled.length ? <EmptyState icon={ClipboardList} title="ابتدا ثبت‌نام این ماه را انجام دهید" description="بعد از ثبت‌نام دانش‌آموزان، می‌توانید نکات مثبت و موارد انضباطی آن‌ها را ثبت کنید." /> : <section className="card">
      <div className="table-toolbar">
        <div><h2>دفتر انضباط ماهانه</h2><p className="muted">امتیاز هر مورد در گزارش ماهانه محاسبه می‌شود.</p></div>
        <div className="toolbar-controls">
          <label className="search-field"><Search size={18} /><input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="جست‌وجوی نام یا عنوان…" aria-label="جست‌وجوی موارد انضباطی" /></label>
          <label className="select-field"><select className="input" value={kindFilter} aria-label="نوع مورد" onChange={e => setKindFilter(e.target.value as typeof kindFilter)}><option value="all">همه موارد</option><option value="negative">موارد منفی</option><option value="positive">امتیازهای مثبت</option></select><ChevronDown size={16} /></label>
        </div>
      </div>
      {!filtered.length ? <EmptyState icon={ClipboardList} title={records.length ? 'موردی با این جست‌وجو پیدا نشد' : 'هنوز موردی ثبت نشده'} description={records.length ? 'نام یا فیلتر نوع مورد را تغییر دهید.' : 'نکات مثبت و موارد انضباطی این ماه را از اینجا ثبت کنید.'} action={!records.length ? <button className="btn btn-secondary" onClick={openForm}><Plus size={16} />ثبت اولین مورد</button> : undefined} /> : <div className="table-wrap"><table>
        <thead><tr><th>دانش‌آموز</th><th>تاریخ</th><th>عنوان و توضیحات</th><th>نوع</th><th>امتیاز</th><th>عملیات</th></tr></thead>
        <tbody>{filtered.map(record => { const student = state.students.find(s => s.id === record.studentId); const enrollment = enrolled.find(e => e.studentId === record.studentId); return <tr key={record.id}>
          <td><strong>{student?.name || 'دانش‌آموز'}</strong>{enrollment && <small className="table-subtext">میز {fa(enrollment.desk)}</small>}</td>
          <td className="nowrap">{jalaliDate(record.date)}</td>
          <td><strong>{record.title}</strong>{record.notes && <small className="table-subtext">{record.notes}</small>}</td>
          <td><span className={`badge ${record.kind === 'positive' ? 'badge-success' : 'badge-warning'}`}>{record.kind === 'positive' ? 'مثبت' : 'منفی'}</span></td>
          <td><span className={record.kind === 'positive' ? 'text-success' : 'text-danger'}>{record.kind === 'positive' ? '+' : '−'}{fa(record.points)}</span></td>
          <td><button className="btn btn-ghost icon-btn" aria-label={`حذف ${record.title} برای ${student?.name || 'دانش‌آموز'}`} disabled={busy} onClick={() => setDeleting(record)}><Trash2 size={17} /></button></td>
        </tr>; })}</tbody>
      </table></div>}
    </section>}
    {adding && <Modal title="ثبت مورد انضباطی یا امتیاز مثبت" onClose={() => !busy && setAdding(false)}>
      <form onSubmit={save} className="form-stack">
        <div className="segmented" aria-label="نوع مورد"><button type="button" className={kind === 'negative' ? 'active' : ''} onClick={() => changeKind('negative')}><ShieldAlert size={17} />مورد منفی</button><button type="button" className={kind === 'positive' ? 'active' : ''} onClick={() => changeKind('positive')}><Award size={17} />امتیاز مثبت</button></div>
        <div className="form-grid">
          <Field label="دانش‌آموز"><select className="input" value={studentId} onChange={e => setStudentId(e.target.value)} required>{enrolled.map(e => <option key={e.id} value={e.studentId}>{e.student!.name} · میز {fa(e.desk)}</option>)}</select></Field>
          <Field label="تاریخ ثبت"><PersianDateInput value={date} onChange={setDate} label="تاریخ ثبت" /></Field>
          <Field label="عنوان مورد"><select className="input" value={preset} onChange={e => changePreset(e.target.value)}>{presets[kind].map(p => <option key={p.title} value={p.title}>{p.title}</option>)}<option value="custom">عنوان دلخواه…</option></select></Field>
          <Field label={kind === 'positive' ? 'مقدار امتیاز مثبت' : 'مقدار امتیاز منفی'} hint="عدد مثبت از ۱ تا ۱۰۰"><input className="input" type="number" min="1" max="100" step="1" value={points} onChange={e => setPoints(e.target.value)} required /></Field>
        </div>
        {preset === 'custom' && <Field label="عنوان دلخواه"><input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={150} placeholder="عنوان مورد را بنویسید" required /></Field>}
        <Field label="توضیحات (اختیاری)"><textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} placeholder="توضیح کوتاه برای پیگیری بهتر…" /></Field>
        <p className="muted">{kind === 'positive' ? `امتیازهای مثبت تا سقف ${fa(state.settings.positiveTarget)} امتیاز، در بخش تشویقی گزارش ماهانه محاسبه می‌شوند.` : `در گزارش ماهانه، هر امتیاز منفی ${fa(state.settings.negativeMultiplier)} نمره از نمره نهایی کم می‌کند.`}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button className="btn btn-primary" type="submit" disabled={busy}><Plus size={17} />{busy ? 'در حال ثبت…' : 'ثبت مورد'}</button><button className="btn btn-secondary" type="button" onClick={() => setAdding(false)} disabled={busy}>انصراف</button></div>
      </form>
    </Modal>}
    {deleting && <Modal title="حذف مورد ثبت‌شده" onClose={() => !busy && setDeleting(null)}><p>مورد «{deleting.title}» برای {state.students.find(s => s.id === deleting.studentId)?.name} حذف شود؟ امتیاز گزارش ماهانه هم اصلاح می‌شود.</p><div className="modal-actions"><button className="btn btn-danger" disabled={busy} onClick={async () => { if (await act({ type: 'record.delete', id: deleting.id })) setDeleting(null); }}><Trash2 size={17} />حذف مورد</button><button className="btn btn-secondary" disabled={busy} onClick={() => setDeleting(null)}>انصراف</button></div></Modal>}
  </div>;
}
