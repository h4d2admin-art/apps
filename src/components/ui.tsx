import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Inbox, type LucideIcon } from 'lucide-react';
import { gregorianFromJalali, jalaliDate, latin } from '../../shared/utils';

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => { dialog.close(); }; }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-label={title}><div className="modal-inner"><div className="modal-heading"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="بستن"><X size={21}/></button></div>{children}</div></dialog>;
}
export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title: string; description: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon"><Icon size={30} strokeWidth={1.4}/></div><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) { return <header className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function StatCard({ label, value, icon: Icon, detail, tone = 'green' }: { label: string; value: ReactNode; icon?: LucideIcon; detail?: string; tone?: string }) { return <div className={`stat-card stat-${tone}`}><div className="stat-top"><span>{label}</span>{Icon && <span className="stat-icon"><Icon size={21} strokeWidth={1.65}/></span>}</div><strong>{value}</strong>{detail && <small>{detail}</small>}</div>; }
export function PersianDateInput({ value, onChange, label = 'تاریخ', required = true }: { value: string; onChange: (value: string) => void; label?: string; required?: boolean }) {
  const [text, setText] = useState(() => value ? jalaliDate(value) : '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setText(value ? jalaliDate(value) : ''); ref.current?.setCustomValidity(''); }, [value]);
  return <input ref={ref} className="input date-input" dir="ltr" aria-label={label} placeholder="۱۴۰۵/۰۷/۲۶" inputMode="numeric" required={required} value={text} onChange={e => { const raw = e.target.value; setText(raw); const result = gregorianFromJalali(raw); e.target.setCustomValidity(result || (!required && !raw) ? '' : 'تاریخ شمسی معتبر وارد کنید؛ مانند ۱۴۰۵/۰۷/۲۶'); if (result) onChange(result); }} onBlur={e => { const result = gregorianFromJalali(latin(text)); if (result) { setText(jalaliDate(result)); e.target.setCustomValidity(''); } }} />;
}
