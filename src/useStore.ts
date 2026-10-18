import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, AppState } from '../shared/types';

export function useStore() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const reload = useCallback(async () => {
    try { const r = await fetch('/api/state'); if (!r.ok) throw new Error('دریافت اطلاعات انجام نشد.'); const data: AppState = await r.json(); setState(data); setError(''); } catch { setError('ارتباط با سرور برقرار نشد. اتصال و اجرای برنامه را بررسی کنید.'); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const act = useCallback((action: Action): Promise<boolean> => {
    const task = queue.current.then(async () => {
      setBusy(true);
      try {
        const r = await fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'ذخیره اطلاعات انجام نشد.');
        setState(data); setError(''); return true;
      } catch (e) { setError(e instanceof Error ? e.message : 'خطا در ارتباط با سرور؛ تغییر ذخیره نشد.'); return false; }
      finally { setBusy(false); }
    });
    queue.current = task.catch(() => false);
    return task;
  }, []);
  return { state, error, setError, busy, act, reload };
}
