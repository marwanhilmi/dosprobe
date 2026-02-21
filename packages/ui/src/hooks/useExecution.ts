import { useCallback, useState } from 'react';
import type { Registers } from '../types/api';
import { pauseExecution, resumeExecution, stepExecution } from '../lib/api';

interface UseExecutionResult {
  pause: () => Promise<Registers | null>;
  resume: () => Promise<void>;
  step: () => Promise<Registers | null>;
  busy: boolean;
}

export function useExecution(): UseExecutionResult {
  const [busy, setBusy] = useState(false);

  const pause = useCallback(async () => {
    setBusy(true);
    try {
      const res = await pauseExecution();
      return res.registers;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const resume = useCallback(async () => {
    setBusy(true);
    try {
      await resumeExecution();
    } finally {
      setBusy(false);
    }
  }, []);

  const step = useCallback(async () => {
    setBusy(true);
    try {
      const res = await stepExecution();
      return res.registers;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { pause, resume, step, busy };
}
