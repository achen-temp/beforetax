'use client'

import { useRef, useState, type KeyboardEvent, type ClipboardEvent } from 'react'
import { cn } from '@/lib/utils'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function OtpInput({ value, onChange, disabled }: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')

  function updateDigit(index: number, digit: string) {
    const next = digits.map((d, i) => (i === index ? digit : d === ' ' ? '' : d))
    onChange(next.join('').replace(/\s/g, '').slice(0, 6))
  }

  function handleChange(index: number, nextValue: string) {
    const cleaned = nextValue.replace(/\D/g, '')

    // Empty (deletion) or a single digit: update just this box.
    if (cleaned.length <= 1) {
      updateDigit(index, cleaned)
      if (cleaned && index < 5) inputsRef.current[index + 1]?.focus()
      return
    }

    // Multiple digits arriving at once (OTP autofill from SMS, or a paste that
    // lands as input): spread them across boxes starting at the current one.
    const chars = cleaned.slice(0, 6 - index).split('')
    const arr = digits.map((d) => (d === ' ' ? '' : d))
    chars.forEach((c, i) => {
      arr[index + i] = c
    })
    onChange(arr.join('').replace(/\s/g, '').slice(0, 6))
    inputsRef.current[Math.min(index + chars.length, 5)]?.focus()
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index]?.trim() && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    onChange(pasted)
    const focusIndex = Math.min(pasted.length, 5)
    inputsRef.current[focusIndex]?.focus()
  }

  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          value={digits[index]?.trim() ?? ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className={cn(
            'size-12 rounded-xl border-2 bg-white text-center text-lg font-semibold text-slate-900 outline-none transition-all sm:size-14 sm:text-xl',
            'focus:border-[#0061FF] focus:ring-4 focus:ring-[#0061FF]/15',
            digits[index]?.trim()
              ? 'border-[#0061FF]/40'
              : 'border-slate-200',
            disabled && 'opacity-60'
          )}
        />
      ))}
    </div>
  )
}
