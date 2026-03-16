import { useState } from "react"
import type { KeyboardEvent } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface AddressInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  className?: string
}

export function AddressInput({
  value,
  onChange,
  onSubmit,
  placeholder = "0x00000",
  className,
}: AddressInputProps) {
  const [valid, setValid] = useState(true)

  function handleChange(raw: string) {
    onChange(raw)
    const isValid =
      /^(0x[0-9a-fA-F]+|[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}|\d+)$/.test(raw.trim()) ||
      raw.trim() === ""
    setValid(isValid)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && valid && onSubmit) {
      onSubmit(value.trim())
    }
  }

  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={cn(
        "h-7 font-mono text-xs",
        !valid && "border-destructive focus-visible:border-destructive",
        className,
      )}
    />
  )
}
