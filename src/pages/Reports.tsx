import { useMemo, useRef, useState } from 'react';
import { Award, BarChart3, Clock3, Download, FileDown, Search, Star, Users } from 'lucide-react';
import { toPng } from 'html-to-image';
import type { Enrollment, PageProps } from '../../shared/types';
import { fa, jalaliDate, monthLabel, reportFor, slotMinutes } from '../../shared/utils';
import { EmptyState, Modal, PageHeader, StatCard } from '../components/ui';

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Reports({ state, month }: PageProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => state.enrollments.filter(e => e.month === month).map(enrollment => ({ enrollment, student: state.students.find(s => s.id === enrollment.studentId), report: reportFor(state, enrollment) })).sort((a, b) => a.enrollment.desk - b.enrollment.desk), [state, month]);
  const filtered = rows.filter(r => `${r.student?.name || ''} ${fa(r.enrollment.desk)} ${r.enrollment.desk}`.includes(search.trim()));
  const selected = rows.find(r => r.enrollment.id === selectedId);
  const totalHours = rows.reduce((sum, row) => sum + row.report.hours, 0);
  const totalPositive = rows.reduce((sum, row) => sum + row.report.positive, 0);
  const averageScore = rows.length ? rows.reduce((sum, row) => sum + row.report.score, 0) / rows.length : 0;
  const settings = state.settings;
  const selectedRecords = selected ? state.records.filter(r => r.studentId === selected.enrollment.studentId && r.month === month).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const sessions = state.sessions.filter(s => s.month === month).sort((a, b) => b.date.localeCompare(a.date) || a.shift.localeCompare(b.shift));

  function exportCsv() {
    const headers = ['ماه', 'نام دانش‌آموز', 'شماره میز', 'ساعت مطالعه', 'تعداد زنگ حضور', 'امتیاز مثبت', 'امتیاز منفی', 'نمره حضور', 'نمره تشویقی', 'کسر انضباطی', 'نمره از ۱۰۰'];
    const content = [headers, ...filtered.map(row => [monthLabel(month), row.student?.name || '', row.enrollment.desk, Number(row.report.hours.toFixed(2)), row.report.presentSlots, row.report.positive, row.report.negative, Number(row.report.attendanceScore.toFixed(2)), Number(row.report.positiveScore.toFixed(2)), row.report.penalty, row.report.score])].map(row => row.map(csvCell).join(',')).join('\r\n');
    downloadBlob(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8;' }), `study-report-${month}.csv`);
  }

  async function exportImage() {
    if (!reportRef.current || !selected) return;
    setExporting(true); setError('');
    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none;';
    try {
      await document.fonts.ready;
      const sheet = reportRef.current.cloneNode(true) as HTMLDivElement;
      sheet.style.width = '820px'; sheet.style.maxWidth = 'none'; sheet.style.overflow = 'visible';
      sheet.querySelectorAll<HTMLElement>('.table-wrap').forEach(el => { el.style.overflow = 'visible'; });
      stage.appendChild(sheet); document.body.appendChild(stage);
      const data = await toPng(sheet, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const a = document.createElement('a'); a.href = data; a.download = `report-${month}-desk-${selected.enrollment.desk}.png`; a.click();
    } catch { setError('ساخت تصویر انجام نشد. دوباره تلاش کنید یا از خروجی جدول استفاده کنید.'); }
    finally { stage.remove(); setExporting(false); }
  }

  function openReport(enrollment: Enrollment) { setSelectedId(enrollment.id); setError(''); }

  return <div className="page reports-page">
    <PageHeader eyebrow="تصویر روشن از تلاش هر دانش‌آموز" title="گزارش ماهانه" description={`ساعت مطالعه، امتیازها و کارنامه ${monthLabel(month)}`} actions={<button className="btn btn-secondary" onClick={exportCsv} disabled={!filtered.length}><FileDown size={18} />خروجی اکسل (CSV)</button>} />
    <div className="stats-grid">
      <StatCard label="دانش‌آموزان این ماه" value={fa(rows.length)} icon={Users} detail="ثبت‌نام فعال در ماه انتخاب‌شده" />
      <StatCard label="مجموع ساعت مطالعه" value={fa(totalHours)} icon={Clock3} detail="بر اساس زنگ‌های حضور ثبت‌شده" tone="green" />
      <StatCard label="امتیازهای مثبت" value={fa(totalPositive)} icon={Award} detail="مجموع امتیازهای تشویقی ماه" tone="orange" />
      <StatCard label="میانگین نمره" value={fa(averageScore)} icon={BarChart3} detail="از ۱۰۰ نمره" />
    </div>
    <section className="card report-formula">
      <div className="section-heading"><span className="section-icon"><BarChart3 size={21} /></span><div><h2>نمره ماهانه چطور محاسبه می‌شود؟</h2><p className="muted">هدف مطالعه: {fa(settings.monthlyTargetHours)} ساعت · هدف امتیاز مثبت: {fa(settings.positiveTarget)} امتیاز</p></div></div>
      <div className="formula-parts"><span>حضور: حداکثر <strong>{fa(settings.attendanceWeight)}</strong> نمره</span><span>امتیاز مثبت: حداکثر <strong>{fa(100 - settings.attendanceWeight)}</strong> نمره</span><span>هر امتیاز منفی: کسر <strong>{fa(settings.negativeMultiplier)}</strong> نمره</span></div>
      <p className="muted formula-explanation">نمره حضور = نسبت ساعت مطالعه به هدف × وزن حضور؛ نمره تشویقی = نسبت امتیاز مثبت به هدف × وزن تشویقی. هر بخش تا سقف وزن خودش محاسبه می‌شود. پس از کسر امتیازهای منفی، نتیجه گرد شده و بین صفر تا صد قرار می‌گیرد. هدف‌ها و وزن‌ها در تنظیمات قابل تغییرند.</p>
    </section>
    {!rows.length ? <EmptyState icon={BarChart3} title="کارنامه این ماه هنوز آماده نیست" description="ابتدا دانش‌آموزان این ماه را ثبت‌نام کنید. سپس با ثبت حضور و امتیازها، کارنامه هر دانش‌آموز به‌روز می‌شود." /> : <section className="card">
      <div className="table-toolbar"><div><h2>کارنامه دانش‌آموزان</h2><p className="muted">برای دیدن جزئیات حضور و دریافت تصویر، گزارش هر دانش‌آموز را باز کنید.</p></div><label className="search-field"><Search size={18} /><input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="جست‌وجوی نام یا شماره میز…" aria-label="جست‌وجوی گزارش دانش‌آموز" /></label></div>
      {!filtered.length ? <EmptyState icon={Search} title="دانش‌آموزی پیدا نشد" description="نام یا شماره میز دیگری را جست‌وجو کنید." /> : <div className="table-wrap"><table><thead><tr><th>دانش‌آموز</th><th>شماره میز</th><th>ساعت مطالعه</th><th>امتیاز مثبت</th><th>امتیاز منفی</th><th>نمره از ۱۰۰</th><th>کارنامه</th></tr></thead><tbody>{filtered.map(({ enrollment, student, report }) => <tr key={enrollment.id}>
        <td><strong>{student?.name || 'دانش‌آموز'}</strong><small className="table-subtext">{monthLabel(month)}</small></td>
        <td><span className="desk-badge">{fa(enrollment.desk)}</span></td><td><strong>{fa(report.hours)}</strong> <small className="muted">ساعت</small><small className="table-subtext">{fa(report.presentSlots)} زنگ حضور</small></td>
        <td><span className="text-success">{fa(report.positive)}</span></td><td><span className={report.negative ? 'text-danger' : 'muted'}>{fa(report.negative)}</span></td>
        <td><div className="score-cell"><strong>{fa(report.score)}</strong><div className="score-track"><span style={{ width: `${report.score}%` }} /></div></div></td>
        <td><button className="btn btn-ghost" onClick={() => openReport(enrollment)}><BarChart3 size={17} />گزارش</button></td>
      </tr>)}</tbody></table></div>}
    </section>}
    {selected && <Modal title={`کارنامه ${selected.student?.name || 'دانش‌آموز'}`} onClose={() => !exporting && setSelectedId(null)} wide>
      <div className="student-report" ref={reportRef} style={{ background: '#fff', color: '#172d29', padding: '24px', borderRadius: '16px' }}>
        <div className="report-heading"><div><p className="report-eyebrow">{settings.hallName}</p><h2>کارنامه ماهانه مطالعه</h2><p>{monthLabel(month)}</p></div><div className="report-final-score"><strong>{fa(selected.report.score)}</strong><span>از ۱۰۰ نمره</span></div></div>
        <div className="report-student-info"><strong>{selected.student?.name || 'دانش‌آموز'}</strong><span>شماره میز: {fa(selected.enrollment.desk)}</span><span>سرپرست خانوار: {selected.student?.parentName || 'ثبت نشده'}</span></div>
        <div className="report-metrics"><div><Clock3 size={20} /><strong>{fa(selected.report.hours)}</strong><span>ساعت مطالعه</span></div><div><Star size={20} /><strong>{fa(selected.report.presentSlots)}</strong><span>زنگ حضور</span></div><div><Award size={20} /><strong>{fa(selected.report.positive)}</strong><span>امتیاز مثبت</span></div><div><BarChart3 size={20} /><strong>{fa(selected.report.negative)}</strong><span>امتیاز منفی</span></div></div>
        <div className="report-score-breakdown"><h3>جزئیات نمره</h3><p>نمره حضور: <strong>{fa(selected.report.attendanceScore)}</strong> از {fa(settings.attendanceWeight)} · نمره تشویقی: <strong>{fa(selected.report.positiveScore)}</strong> از {fa(100 - settings.attendanceWeight)} · کسر انضباطی: <strong>{fa(selected.report.penalty)}</strong></p><p className="muted">هدف ماه: {fa(settings.monthlyTargetHours)} ساعت مطالعه و {fa(settings.positiveTarget)} امتیاز مثبت. ضریب هر امتیاز منفی: {fa(settings.negativeMultiplier)}. نمره نهایی پس از گرد کردن بین صفر و صد قرار می‌گیرد.</p></div>
        <h3 className="report-section-title">ریز حضور و ساعت مطالعه</h3>
        {!sessions.length ? <p className="muted">در این ماه هنوز جلسه حضور و غیابی ثبت نشده است.</p> : <div className="table-wrap"><table className="report-attendance-table"><thead><tr><th>تاریخ</th><th>شیفت</th><th>زنگ‌های حضور</th><th>ساعت</th></tr></thead><tbody>{sessions.map(session => {
          const present = session.attendance[selected.enrollment.studentId] || [];
          const hours = session.slots.filter(slot => present.includes(slot.id)).reduce((sum, slot) => sum + slotMinutes(slot) / 60, 0);
          return <tr key={session.id}><td>{jalaliDate(session.date)}</td><td>{session.shift === 'morning' ? 'صبح' : 'عصر'}</td><td><div className="report-slot-stars">{session.slots.map((slot, i) => <span className={present.includes(slot.id) ? 'is-present' : ''} key={slot.id} title={`${slot.label} · ${slot.start} تا ${slot.end}`} aria-label={`زنگ ${fa(i + 1)}: ${present.includes(slot.id) ? 'حاضر' : 'غایب'}`}>{fa(i + 1)} {present.includes(slot.id) ? '★' : '—'}</span>)}</div></td><td>{fa(hours)}</td></tr>;
        })}</tbody></table></div>}
        <h3 className="report-section-title">نکات مثبت و موارد انضباطی</h3>
        {!selectedRecords.length ? <p className="muted">در این ماه موردی ثبت نشده است.</p> : <div className="table-wrap"><table><thead><tr><th>تاریخ</th><th>عنوان</th><th>امتیاز</th><th>توضیحات</th></tr></thead><tbody>{selectedRecords.map(record => <tr key={record.id}><td>{jalaliDate(record.date)}</td><td>{record.title}</td><td>{record.kind === 'positive' ? '+' : '−'}{fa(record.points)}</td><td>{record.notes || '—'}</td></tr>)}</tbody></table></div>}
        <p className="report-footer">{settings.hallName} · گزارش {monthLabel(month)} · محاسبه بر اساس اطلاعات ثبت‌شده در سامانه</p>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="btn btn-primary" disabled={exporting} onClick={exportImage}><Download size={17} />{exporting ? 'در حال ساخت تصویر…' : 'دریافت تصویر کارنامه'}</button><button className="btn btn-secondary" disabled={exporting} onClick={() => setSelectedId(null)}>بستن</button></div>
    </Modal>}
  </div>;
}
