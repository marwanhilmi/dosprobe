import type { ReactNode } from 'react';
import { clsx } from 'clsx';

interface PanelProps {
  title: string;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, toolbar, children, className }: PanelProps) {
  return (
    <div className={clsx('flex flex-col bg-bg-panel border border-border-default rounded', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-secondary border-b border-border-default shrink-0">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{title}</span>
        {toolbar && <div className="flex items-center gap-1">{toolbar}</div>}
      </div>
      <div className="flex-1 overflow-auto p-2">
        {children}
      </div>
    </div>
  );
}
