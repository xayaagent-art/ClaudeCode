import type { StatusColor, ActionHint } from '../lib/types'

interface StatusBadgeProps {
  status: StatusColor
  action: ActionHint
}

const statusStyles: Record<StatusColor, string> = {
  green: 'bg-rh-green/15 text-rh-green',
  yellow: 'bg-rh-yellow/15 text-rh-yellow',
  red: 'bg-rh-red/15 text-rh-red',
}

const statusDots: Record<StatusColor, string> = {
  green: 'bg-rh-green',
  yellow: 'bg-rh-yellow',
  red: 'bg-rh-red',
}

export default function StatusBadge({ status, action }: StatusBadgeProps) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${statusDots[status]}`} />
      {action}
    </div>
  )
}
