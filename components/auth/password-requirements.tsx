import { Check, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PASSWORD_REQUIREMENTS } from '@/lib/validations/auth'

interface PasswordRequirementsProps {
  password: string
  confirmPassword?: string
}

export function PasswordRequirements({
  password,
  confirmPassword,
}: PasswordRequirementsProps) {
  const showMatch = confirmPassword !== undefined && confirmPassword.length > 0
  const passwordsMatch = password.length > 0 && password === confirmPassword

  const items = [
    ...PASSWORD_REQUIREMENTS.map((req) => ({
      id: req.id,
      label: req.label,
      met: password.length > 0 && req.test(password),
    })),
    ...(showMatch
      ? [
          {
            id: 'match',
            label: 'Passwords match',
            met: passwordsMatch,
          },
        ]
      : []),
  ]

  const hasInput = password.length > 0

  return (
    <ul
      className="space-y-1.5 rounded-md border bg-muted/40 px-3 py-2.5"
      aria-label="Password requirements"
    >
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            'flex items-center gap-2 text-xs transition-colors',
            !hasInput && item.id !== 'match'
              ? 'text-muted-foreground'
              : item.met
                ? 'text-green-600 dark:text-green-400'
                : 'text-muted-foreground'
          )}
        >
          {item.met ? (
            <Check className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Circle className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}
