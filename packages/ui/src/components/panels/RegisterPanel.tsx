import { useRegisters } from "../../hooks/useRegisters"
import { toHex16, toHex32 } from "../../lib/hex"
import { Panel } from "../layout/Panel"
import { HexValue } from "../shared/HexValue"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Registers } from "../../types/api"

const GENERAL_REGS = ["eax", "ecx", "edx", "ebx"] as const
const POINTER_REGS = ["esp", "ebp", "esi", "edi", "eip"] as const
const SEGMENT_REGS = ["cs", "ss", "ds", "es", "fs", "gs"] as const

function RegRow({
  name,
  value,
  prevValue,
  is16,
}: {
  name: string
  value: number
  prevValue?: number
  is16?: boolean
}) {
  const hex = is16 ? toHex16(value) : toHex32(value)
  const changed = prevValue !== undefined && prevValue !== value

  return (
    <TableRow className="hover:bg-accent/50 border-0">
      <TableCell className="py-0.5 pr-3 text-muted-foreground font-semibold text-xs">
        {name.toUpperCase()}
      </TableCell>
      <TableCell className="py-0.5 font-mono text-xs">
        <HexValue value={`0x${hex}`} changed={changed} />
      </TableCell>
      <TableCell className="py-0.5 text-muted-foreground pl-2 text-xs">{value}</TableCell>
    </TableRow>
  )
}

function RegGroup({
  title,
  regs,
  registers,
  prevRegisters,
  is16,
}: {
  title: string
  regs: readonly (keyof Registers)[]
  registers: Registers
  prevRegisters: Registers | null
  is16?: boolean
}) {
  return (
    <>
      <TableRow className="border-0">
        <TableCell
          colSpan={3}
          className="pt-2 pb-0.5 text-muted-foreground text-[10px] uppercase tracking-wider"
        >
          {title}
        </TableCell>
      </TableRow>
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
  )
}

export function RegisterPanel() {
  const { registers, prevRegisters, loading, error, refresh } = useRegisters()

  const toolbar = (
    <Button variant="outline" size="xs" onClick={refresh} disabled={loading}>
      {loading ? "..." : "Refresh"}
    </Button>
  )

  return (
    <Panel title="Registers" toolbar={toolbar}>
      {error && <div className="text-destructive text-xs mb-2">{error}</div>}
      {registers ? (
        <Table>
          <TableHeader className="sr-only">
            <TableRow>
              <TableHead>Register</TableHead>
              <TableHead>Hex</TableHead>
              <TableHead>Decimal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <RegGroup
              title="General"
              regs={GENERAL_REGS}
              registers={registers}
              prevRegisters={prevRegisters}
            />
            <RegGroup
              title="Pointers"
              regs={POINTER_REGS}
              registers={registers}
              prevRegisters={prevRegisters}
            />
            <RegGroup
              title="Segments"
              regs={SEGMENT_REGS}
              registers={registers}
              prevRegisters={prevRegisters}
              is16
            />
            <TableRow className="border-0">
              <TableCell
                colSpan={3}
                className="pt-2 pb-0.5 text-muted-foreground text-[10px] uppercase tracking-wider"
              >
                Flags
              </TableCell>
            </TableRow>
            <RegRow name="EFLAGS" value={registers.eflags} prevValue={prevRegisters?.eflags} />
          </TableBody>
        </Table>
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
          {loading ? "Loading..." : "No register data"}
        </div>
      )}
    </Panel>
  )
}
