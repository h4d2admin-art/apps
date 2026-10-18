import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Settings2, Download, Upload, Save, DatabaseBackup, CheckCircle2 } from 'lucide-react';
import type { AppState, PageProps } from '../../shared/types';
import { Field, PageHeader } from '../components/ui';
import { fa } from '../../shared/utils';

export default function Settings({ state, act, busy }: PageProps) {
  const [form, setForm] = useState(state.settings);
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setForm(state.settings); }, [state.settings]);
  const field = (name: keyof typeof form, value: string | number) => { setForm(f => ({ ...f, [name]: value })); setSaved(false); };
  const save = async (event: FormEvent) => { event.preventDefault(); if (await act({ type: 'settings.save', payload: form })) setSaved(true); };
  const restore = async (file: File) => {
    setLocalError('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('حجم فایل پشتیبان نباید بیشتر از ۱۰ مگابایت باشد.');
      const data = JSON.parse(await file.text()) as AppState;
      if (data.version !== 1 || !Array.isArray(data.students) || !Array.isArray(data.enrollments)) throw new Error('این فایل، پشتیبان معتبر هم‌درس نیست.');
      if (!window.confirm(`این نسخه شامل ${fa(data.students.length)} دانش‌آموز است. بازیابی، تمام اطلاعات فعلی را جایگزین می‌کند. قبل از ادامه، از اطلاعات فعلی نسخه پشتیبان بگیرید. ادامه می‌دهید؟`)) return;
      setRestoring(true);
      if (await act({ type: 'backup.restore', payload: data })) setSaved(true);
    } catch (error) { setLocalError(error instanceof Error ? error.message : 'خواندن فایل انجام نشد.'); }
    finally { setRestoring(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  return <><PageHeader eyebrow="متناسب با سالن شما" title="تنظیمات و پشتیبان" description="قوانین سالن، شیوه محاسبه نمره و نگهداری از اطلاعات."/>
    {saved && <div className="success-banner"><CheckCircle2 size={19}/> اطلاعات با موفقیت ذخیره شد.</div>}
    {localError && <div role="alert" className="error-banner">{localError}</div>}
    <form onSubmit={save} className="settings-layout"><section className="card settings-card"><div className="card-heading"><h2><Settings2 size={21}/> مشخصات سالن</h2></div><Field label="نام سالن مطالعه"><input className="input" required maxLength={100} value={form.hallName} onChange={e => field('hallName', e.target.value)}/></Field><div className="form-grid"><Field label="تعداد میزها"><input className="input" type="number" required min={1} max={1000} value={form.deskCount} onChange={e => field('deskCount', Number(e.target.value))}/></Field><Field label="شهریه پیش‌فرض ماهانه (تومان)"><input className="input" type="number" required min={0} step={1000} value={form.defaultFee} onChange={e => field('defaultFee', Number(e.target.value))}/></Field></div><p className="field-help">شهریه پیش‌فرض در ثبت‌نام‌های جدید استفاده می‌شود. مبلغ هر دانش‌آموز جداگانه قابل تغییر است.</p></section>
      <section className="card settings-card"><div className="card-heading"><h2>قانون نمره ماهانه</h2><span className="badge badge-green">از ۱۰۰</span></div><div className="form-grid"><Field label="هدف مطالعه ماهانه (ساعت)"><input className="input" type="number" required min={1} max={744} value={form.monthlyTargetHours} onChange={e => field('monthlyTargetHours', Number(e.target.value))}/></Field><Field label="سهم حضور از ۱۰۰ نمره"><input className="input" type="number" required min={0} max={100} value={form.attendanceWeight} onChange={e => field('attendanceWeight', Number(e.target.value))}/></Field><Field label="هدف امتیاز مثبت در ماه"><input className="input" type="number" required min={1} max={10000} value={form.positiveTarget} onChange={e => field('positiveTarget', Number(e.target.value))}/></Field><Field label="کسر نمره به ازای هر امتیاز منفی"><input className="input" type="number" required min={0} max={100} step={0.1} value={form.negativeMultiplier} onChange={e => field('negativeMultiplier', Number(e.target.value))}/></Field></div><div className="formula-note"><strong>نمره چگونه محاسبه می‌شود؟</strong><p>تحقق هدف مطالعه، حداکثر {fa(form.attendanceWeight)} نمره؛ امتیازهای مثبت، حداکثر {fa(100 - form.attendanceWeight)} نمره. به ازای هر امتیاز منفی، {fa(form.negativeMultiplier)} نمره کسر می‌شود. نمره نهایی بین صفر تا صد است.</p><p>ساعت مطالعه از مدت واقعی زنگ‌های ستاره‌خورده در هر دو شیفت صبح و عصر جمع می‌شود.</p></div></section><div className="settings-save"><button className="btn btn-primary" disabled={busy} type="submit"><Save size={18}/> ذخیره تنظیمات</button></div></form>
    <section className="card backup-card"><div className="backup-icon"><DatabaseBackup size={32}/></div><div><h2>اطلاعات سالن، همیشه همراه شما</h2><p>نسخه پشتیبان شامل دانش‌آموزان، حضورها، پرداخت‌ها و امتیازهاست. آن را در محل امن نگه دارید؛ این فایل حاوی اطلاعات شخصی است.</p><div className="backup-actions"><a className="btn btn-primary" href="/api/backup" download><Download size={18}/> دریافت نسخه پشتیبان</a><button className="btn btn-secondary" disabled={busy || restoring} onClick={() => fileRef.current?.click()}><Upload size={18}/> بازیابی پشتیبان</button><input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="فایل نسخه پشتیبان" onChange={e => { const f = e.target.files?.[0]; if (f) void restore(f); }}/></div></div></section>
  </>;
}
