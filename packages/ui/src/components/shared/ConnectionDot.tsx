import { clsx } from 'clsx';

const colorMap = {
  connected: 'bg-accent-green',
  running: 'bg-accent-green',
  paused: 'bg-accent-orange',
  launching: 'bg-accent-blue',
  disconnected: 'bg-text-muted',
  error: 'bg-accent-red',
} as const;

type DotStatus = keyof typeof colorMap;

export function ConnectionDot({ status, className }: { status: DotStatus; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-block h-2 w-2 rounded-full',
        colorMap[status],
        (status === 'running' || status === 'launching') && 'animate-pulse',
        className,
      )}
    />
  );
}
