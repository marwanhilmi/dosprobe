import { useState } from 'react';
import type { KeyboardEvent } from 'react';

interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function AddressInput({ value, onChange, onSubmit, placeholder = '0x00000', className }: AddressInputProps) {
  const [valid, setValid] = useState(true);

  function handleChange(raw: string) {
    onChange(raw);
    // Accept hex (0xNNNN), segment:offset (NNNN:NNNN), or plain decimal
    const isValid = /^(0x[0-9a-fA-F]+|[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}|\d+)$/.test(raw.trim()) || raw.trim() === '';
    setValid(isValid);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && valid && onSubmit) {
      onSubmit(value.trim());
    }
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={`bg-bg-tertiary border px-2 py-1 text-xs font-mono rounded ${valid ? 'border-border-default' : 'border-accent-red'} text-text-primary focus:outline-none focus:border-accent-blue ${className ?? ''}`}
    />
  );
}
