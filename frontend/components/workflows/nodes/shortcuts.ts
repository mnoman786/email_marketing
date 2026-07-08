import { Zap, GitBranch, ListPlus, ListMinus, Play, Square, Tag, Webhook, XCircle, type LucideIcon } from 'lucide-react'

export interface ShortcutDef {
  kind: 'trigger' | 'condition' | 'end' | 'action'
  actionType?: string
  label: string
  icon: LucideIcon
}

export const SHORTCUTS: ShortcutDef[] = [
  { kind: 'trigger', label: 'Trigger', icon: Zap },
  { kind: 'condition', label: 'Condition (If/Else)', icon: GitBranch },
  { kind: 'action', actionType: 'add_to_list', label: 'Add to List', icon: ListPlus },
  { kind: 'action', actionType: 'remove_from_list', label: 'Remove from List', icon: ListMinus },
  { kind: 'action', actionType: 'start_sequence', label: 'Start Sequence', icon: Play },
  { kind: 'action', actionType: 'stop_sequence', label: 'Stop Sequence', icon: Square },
  { kind: 'action', actionType: 'update_contact_status', label: 'Update Status', icon: Tag },
  { kind: 'action', actionType: 'webhook', label: 'Send Webhook', icon: Webhook },
  { kind: 'end', label: 'End Workflow', icon: XCircle },
]
