import type { ReactNode } from 'react';
import { StatusBar } from './StatusBar';

interface ShellProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

export function Shell({ left, center, right }: ShellProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 grid grid-cols-[280px_1fr_360px] grid-rows-[1fr_1fr] gap-px bg-border-muted min-h-0">
        {/* Left column spans both rows */}
        <div className="row-span-2 flex flex-col gap-px bg-border-muted">
          {left}
        </div>
        {/* Center column spans both rows */}
        <div className="row-span-2 flex flex-col gap-px bg-border-muted">
          {center}
        </div>
        {/* Right column: two rows */}
        {right}
      </div>
      <StatusBar />
    </div>
  );
}
