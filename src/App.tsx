import { useEffect, useState } from 'react';
import { BookOpen, LayoutDashboard, Users, Star, ShieldCheck, Wallet, ChartNoAxesCombined, Settings as SettingsIcon, ChevronRight, ChevronLeft, Menu, X, CircleHelp, LoaderCircle, Check, ArrowUpLeft } from 'lucide-react';
import { useStore } from './useStore';
import { fa, longDate, monthLabel, monthOf, monthNames, today } from '../shared/utils';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Attendance from './pages/Attendance';
import Conduct from './pages/Conduct';
import Payments from './pages/Payments';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

const navigation = [
  { id: 'dashboard', label: 'نمای کلی', icon: LayoutDashboard },
  { id: 'students', label: 'دانش‌آموزان', icon: Users },
  { id: 'attendance', label: 'حضور و غیاب', icon: Star },
  { id: 'conduct', label: 'انضباط و امتیاز', icon: ShieldCheck },
  { id: 'payments', label: 'شهریه و پرداخت', icon: Wallet },
  { id: 'reports', label: 'گزارش ماهانه', icon: ChartNoAxesCombined },
];
function route() { const key = window.location.hash.slice(1); return [...navigation.map(n => n.id), 'settings'].includes(key) ? key : 'dashboard'; }
export default function App() {
  const { state, error, setError, busy, act, reload } = useStore();
  const [page, setPage] = useState(route);
  const [month, setMonth] = useState(monthOf(today()));
  const [menu, setMenu] = useState(false);
  useEffect(() => { const change = () => { setPage(route()); setMenu(false); window.scrollTo(0, 0); }; window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  const changeMonth = (delta: number) => { const [y, m] = month.split('-').map(Number); const n = y * 12 + m - 1 + delta; setMonth(`${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`); };
  const [year, monthNumber] = month.split('-');
  const current = navigation.find(n => n.id === page);
  return <div className="app-shell">
    {menu && <button className="nav-overlay" onClick={() => setMenu(false)} aria-label="بستن فهرست"/>}
    <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`}>
      <a className="brand" href="#dashboard"><span className="brand-symbol"><BookOpen size={29}/><span/></span><div><strong>هم‌درس<span>°</span></strong><small>همراهِ روزهای پُرتلاش</small></div></a>
      <div className="sidebar-label">مدیریت سالن مطالعه</div>
      <nav aria-label="منوی اصلی">{navigation.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined}><Icon size={21} strokeWidth={1.7}/><span>{label}</span>{id === 'students' && state && <small>{fa(state.enrollments.filter(e => e.month === month).length)}</small>}</a>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><span className="tip-spark">✦</span><strong>قدم‌های کوچک، آینده‌های بزرگ</strong><p>اینجا هر ساعتِ تلاش دیده می‌شود.</p><a href="#reports">دیدن گزارش این ماه <ArrowUpLeft size={15}/></a></div><a href="#settings" className={`nav-item ${page === 'settings' ? 'active' : ''}`}><SettingsIcon size={20}/><span>تنظیمات و پشتیبان</span></a><div className="sidebar-foot"><span className="status-dot"/>فضای مدیریت هم‌درس <span>نسخه ۱.۰</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button menu-toggle" onClick={() => setMenu(!menu)} aria-label="باز کردن فهرست"><Menu size={23}/></button><span className="top-hall">{state?.settings.hallName || 'سالن مطالعه'}</span><span className="breadcrumb-separator">/</span><span>{current?.label || 'تنظیمات'}</span></div><div className="topbar-end"><span className={`save-status ${busy ? 'saving' : ''}`}>{busy ? <LoaderCircle size={14} className="spin"/> : <Check size={14}/>} {busy ? 'در حال ذخیره' : 'ذخیره خودکار'}</span><span className="top-date">{longDate(today())}</span><span className="avatar">م</span></div></header>
      <main className="main-content">
        <div className="context-row"><div className="context-caption"><span className="status-dot"/> مدیریت منظم، مطالعه آسوده</div><div className="month-picker" aria-label="انتخاب ماه"><button className="icon-button" onClick={() => changeMonth(-1)} aria-label="ماه قبل"><ChevronRight size={17}/></button><select aria-label="ماه ثبت‌نام" value={monthNumber} onChange={e => setMonth(`${year}-${e.target.value}`)}>{monthNames.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}</select><select aria-label="سال ثبت‌نام" value={year} onChange={e => setMonth(`${e.target.value}-${monthNumber}`)}>{Array.from({ length: 11 }, (_, i) => Number(year) - 5 + i).map(y => <option key={y} value={y}>{fa(y)}</option>)}</select><button className="icon-button" onClick={() => changeMonth(1)} aria-label="ماه بعد"><ChevronLeft size={17}/></button></div></div>
        {error && <div role="alert" className="error-banner"><span>{error}</span><div>{!state && <button className="btn btn-small btn-secondary" onClick={() => void reload()}>تلاش دوباره</button>}<button className="icon-button" onClick={() => setError('')} aria-label="بستن پیام"><X size={17}/></button></div></div>}
        {!state ? <div className="loading-state"><LoaderCircle className="spin" size={32}/><p>در حال دریافت اطلاعات سالن…</p></div> : <div key={page} className="page-enter">{page === 'dashboard' ? <Dashboard state={state} month={month} act={act} busy={busy}/> : page === 'students' ? <Students state={state} month={month} act={act} busy={busy}/> : page === 'attendance' ? <Attendance state={state} month={month} act={act} busy={busy} onMonthChange={setMonth}/> : page === 'conduct' ? <Conduct state={state} month={month} act={act} busy={busy}/> : page === 'payments' ? <Payments state={state} month={month} act={act} busy={busy}/> : page === 'reports' ? <Reports state={state} month={month} act={act} busy={busy}/> : <Settings state={state} month={month} act={act} busy={busy}/>}</div>}
        <footer className="page-footer"><span>با هم، برای روزهای بهتر <span className="footer-spark">✦</span></span><span>هم‌درس · {monthLabel(month)}</span></footer>
      </main>
    </div>
  </div>;
}
