'use client'
import { Handle, Position } from '@xyflow/react'
import { Zap, GitBranch, Mail, Tag, Tags, UserCog, Webhook, Play, Square, XCircle, ListPlus, ListMinus, X, LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export const TRIGGER_LABELS: Record<string, string> = {
  opened: 'Email Opened',
  clicked: 'Email Clicked',
  replied: 'Email Replied',
  bounced: 'Email Bounced',
  added_to_list: 'Added to List',
  tag_added: 'Tag Added',
  no_reply_after: 'No Reply After',
}

export const ACTION_META: Record<string, { label: string; icon: LucideIcon }> = {
  add_to_list: { label: 'Add to List', icon: ListPlus },
  remove_from_list: { label: 'Remove from List', icon: ListMinus },
  add_tag: { label: 'Add Tag', icon: Tag },
  remove_tag: { label: 'Remove Tag', icon: Tags },
  start_sequence: { label: 'Start Sequence', icon: Play },
  stop_sequence: { label: 'Stop Sequence', icon: Square },
  update_contact_status: { label: 'Update Status', icon: UserCog },
  webhook: { label: 'Call Webhook', icon: Webhook },
}

interface NodeData {
  config: Record<string, any>
  listsById: Record<number, string>
  campaignsById: Record<number, string>
  tagsById: Record<number, string>
  onDelete?: () => void
}

const handleCls = 'bg-muted-foreground! w-2.5! h-2.5!'

function NodeShell({
  icon: Icon, iconClass, title, subtitle, selected, onDelete, children,
}: {
  icon: LucideIcon; iconClass: string; title: string; subtitle?: string; selected?: boolean
  onDelete?: () => void; children?: React.ReactNode
}) {
  return (
    <div className={cn(
      'relative w-56 rounded-xl border-2 bg-card shadow-md px-3 py-2.5 cursor-pointer transition-colors',
      selected ? 'border-primary' : 'border-border'
    )}>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Delete node"
          className="nodrag absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 rounded-full border bg-card text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
        >
          <X size={11} />
        </button>
      )}
      <div className="flex items-center gap-2">
        <div className={cn('flex items-center justify-center w-7 h-7 rounded-lg shrink-0', iconClass)}>
          <Icon size={14} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function triggerSubtitle(cfg: Record<string, any>, data: NodeData) {
  if (!cfg.trigger_type) return 'Select trigger...'
  const label = TRIGGER_LABELS[cfg.trigger_type]
  if (cfg.trigger_type === 'added_to_list') return `${label}: ${data.listsById[cfg.list_id] || 'Select list...'}`
  if (cfg.trigger_type === 'tag_added') return `${label}: ${data.tagsById[cfg.tag_id] || 'Select tag...'}`
  if (cfg.trigger_type === 'no_reply_after') return `${label} ${cfg.days ? `${cfg.days}d` : ''}`.trim()
  if (cfg.campaign_id) return `${label} (${data.campaignsById[cfg.campaign_id] || 'campaign'})`
  return label
}

export function TriggerNode({ data, selected }: { data: NodeData; selected?: boolean }) {
  return (
    <>
      <NodeShell icon={Zap} iconClass="bg-primary/15 text-primary" title="Trigger"
        subtitle={triggerSubtitle(data.config || {}, data)} selected={selected} onDelete={data.onDelete} />
      <Handle type="source" position={Position.Bottom} id="output" className={cn(handleCls, 'bg-primary!')} />
    </>
  )
}

function conditionSubtitle(cfg: Record<string, any>, data: NodeData) {
  if (cfg.field === 'list') return `In list: ${data.listsById[cfg.list_id] || 'select...'}`
  if (cfg.field === 'tag') return `Has tag: ${data.tagsById[cfg.tag_id] || 'select...'}`
  if (cfg.field === 'status') return `Status = ${cfg.status || 'select...'}`
  return 'Select condition...'
}

export function ConditionNode({ data, selected }: { data: NodeData; selected?: boolean }) {
  return (
    <>
      <Handle type="target" position={Position.Top} id="input" className={handleCls} />
      <NodeShell icon={GitBranch} iconClass="bg-amber-500/15 text-amber-600" title="If / Else"
        subtitle={conditionSubtitle(data.config || {}, data)} selected={selected} onDelete={data.onDelete}>
        <div className="flex justify-between mt-2 text-[11px] font-semibold px-1">
          <span className="text-green-600">Yes</span>
          <span className="text-red-600">No</span>
        </div>
      </NodeShell>
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: '28%' }} className={cn(handleCls, 'bg-green-600!')} />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: '72%' }} className={cn(handleCls, 'bg-red-600!')} />
    </>
  )
}

function actionSubtitle(cfg: Record<string, any>, data: NodeData) {
  if (cfg.action_type === 'webhook') return cfg.url || 'Set webhook URL...'
  if (cfg.action_type === 'update_contact_status') return cfg.status ? `Set status: ${cfg.status}` : 'Select status...'
  if (cfg.action_type === 'add_to_list' || cfg.action_type === 'remove_from_list') {
    return cfg.list_id ? data.listsById[cfg.list_id] || `List #${cfg.list_id}` : 'Select list...'
  }
  if (cfg.action_type === 'add_tag' || cfg.action_type === 'remove_tag') {
    return cfg.tag_id ? data.tagsById[cfg.tag_id] || `Tag #${cfg.tag_id}` : 'Select tag...'
  }
  if (cfg.action_type === 'start_sequence' || cfg.action_type === 'stop_sequence') {
    if (!cfg.campaign_id) return cfg.action_type === 'stop_sequence' ? 'Any active sequence' : 'Select campaign...'
    return data.campaignsById[cfg.campaign_id] || `Campaign #${cfg.campaign_id}`
  }
  return 'Configure...'
}

export function ActionNode({ data, selected }: { data: NodeData; selected?: boolean }) {
  const cfg = data.config || {}
  const meta = ACTION_META[cfg.action_type] || { label: 'Action', icon: Mail }
  return (
    <>
      <Handle type="target" position={Position.Top} id="input" className={handleCls} />
      <NodeShell icon={meta.icon} iconClass="bg-blue-500/15 text-blue-600" title={meta.label}
        subtitle={actionSubtitle(cfg, data)} selected={selected} onDelete={data.onDelete} />
      <Handle type="source" position={Position.Bottom} id="output" className={cn(handleCls, 'bg-blue-600!')} />
    </>
  )
}

export function EndNode({ data, selected }: { data: NodeData; selected?: boolean }) {
  return (
    <>
      <Handle type="target" position={Position.Top} id="input" className={handleCls} />
      <NodeShell icon={XCircle} iconClass="bg-muted text-muted-foreground" title="End Workflow" selected={selected} onDelete={data.onDelete} />
    </>
  )
}

export const NODE_TYPES = { trigger: TriggerNode, condition: ConditionNode, action: ActionNode, end: EndNode }
