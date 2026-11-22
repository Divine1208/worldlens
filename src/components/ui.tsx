import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Tone = 'sky' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate' | 'indigo';
const TONES: Record<Tone, string> = {
  sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/30',
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/30',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30',
  purple: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30',
  slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30',
};

export function Badge({ tone = 'slate', children, className, title, onClick }: { tone?: Tone; children: ReactNode; className?: string; title?: string; onClick?: () => void }) {
  const Cmp = onClick ? 'button' : 'span';
  return (
    <Cmp
      title={title}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide whitespace-nowrap',
        TONES[tone],
        onClick && 'hover:brightness-110 cursor-pointer',
        className,
      )}
    >
      {children}
    </Cmp>
  );
}

export function Btn({
  variant = 'ghost',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger' }) {
  const v = {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-900/30',
    ghost: 'hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200',
    outline: 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white',
  }[variant];
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
        v,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 shadow-sm', className)}>
      {children}
    </div>
  );
}

export function Inset({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800/80 dark:bg-slate-950/70', className)}>{children}</div>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-8" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div
        className={cx('w-full rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900', wide ? 'max-w-5xl' : 'max-w-2xl')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="text-base font-bold">{title}</h2>
          <Btn onClick={onClose} aria-label="Close">✕</Btn>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function SectionTitle({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">{children}</h2>
        {sub && <p className="text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">{children}</div>;
}

export function Spinner({ spinning }: { spinning: boolean }) {
  return <span className={cx('inline-block', spinning && 'animate-spin')}>⟳</span>;
}
