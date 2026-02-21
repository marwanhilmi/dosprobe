import { useRegisters } from '../../hooks/useRegisters';
import { toHex16, toHex32 } from '../../lib/hex';
import { Panel } from '../layout/Panel';
import { HexValue } from '../shared/HexValue';
import type { Registers } from '../../types/api';

const GENERAL_REGS = ['eax', 'ecx', 'edx', 'ebx'] as const;
const POINTER_REGS = ['esp', 'ebp', 'esi', 'edi', 'eip'] as const;
const SEGMENT_REGS = ['cs', 'ss', 'ds', 'es', 'fs', 'gs'] as const;

function RegRow({ name, value, prevValue, is16 }: { name: string; value: number; prevValue?: number; is16?: boolean }) {
  const hex = is16 ? toHex16(value) : toHex32(value);
  const changed = prevValue !== undefined && prevValue !== value;

  return (
    <tr className="hover:bg-bg-tertiary">
      <td className="pr-3 text-text-secondary font-semibold">{name.toUpperCase()}</td>
      <td className="font-mono">
        <HexValue value={`0x${hex}`} changed={changed} />
      </td>
      <td className="text-text-muted pl-2">{value}</td>
    </tr>
  );
}

function RegGroup({ title, regs, registers, prevRegisters, is16 }: {
  title: string;
  regs: readonly (keyof Registers)[];
  registers: Registers;
  prevRegisters: Registers | null;
  is16?: boolean;
}) {
  return (
    <>
      <tr>
        <td colSpan={3} className="pt-2 pb-0.5 text-text-muted text-[10px] uppercase tracking-wider">{title}</td>
      </tr>
      {regs.map((reg) => (
        <RegRow
          key={reg}
          name={reg}
          value={registers[reg]}
          prevValue={prevRegisters?.[reg]}
          is16={is16}
        />
      ))}
    </>
  );
}

export function RegisterPanel() {
  const { registers, prevRegisters, loading, error, refresh } = useRegisters();

  const toolbar = (
    <button
      onClick={refresh}
      disabled={loading}
      className="px-2 py-0.5 text-xs bg-bg-tertiary border border-border-default rounded hover:border-accent-blue disabled:opacity-50"
    >
      {loading ? '...' : 'Refresh'}
    </button>
  );

  return (
    <Panel title="Registers" toolbar={toolbar}>
      {error && <div className="text-accent-red text-xs mb-2">{error}</div>}
      {registers ? (
        <table className="text-xs w-full">
          <tbody>
            <RegGroup title="General" regs={GENERAL_REGS} registers={registers} prevRegisters={prevRegisters} />
            <RegGroup title="Pointers" regs={POINTER_REGS} registers={registers} prevRegisters={prevRegisters} />
            <RegGroup title="Segments" regs={SEGMENT_REGS} registers={registers} prevRegisters={prevRegisters} is16 />
            <tr>
              <td colSpan={3} className="pt-2 pb-0.5 text-text-muted text-[10px] uppercase tracking-wider">Flags</td>
            </tr>
            <RegRow name="EFLAGS" value={registers.eflags} prevValue={prevRegisters?.eflags} />
          </tbody>
        </table>
      ) : (
        <div className="flex items-center justify-center h-full text-text-muted text-xs">
          {loading ? 'Loading...' : 'No register data'}
        </div>
      )}
    </Panel>
  );
}
