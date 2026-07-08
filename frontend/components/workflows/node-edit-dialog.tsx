'use client'
import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { ContactList, CampaignListItem, Tag } from '@/lib/types'
import { TRIGGER_LABELS, ACTION_META } from './nodes/automation-nodes'

const STATUS_CHOICES = ['active', 'unsubscribed', 'bounced', 'complained']

interface Props {
  open: boolean
  onClose: () => void
  nodeType: 'trigger' | 'condition' | 'action' | 'end' | null
  initialConfig: Record<string, any>
  lists: ContactList[]
  campaigns: CampaignListItem[]
  tags: Tag[]
  onSave: (config: Record<string, any>) => void
  onDelete?: () => void
  onCreateTag?: (name: string) => Promise<Tag>
}

export function NodeEditDialog({ open, onClose, nodeType, initialConfig, lists, campaigns, tags, onSave, onDelete, onCreateTag }: Props) {
  const [config, setConfig] = useState<Record<string, any>>({})
  const [newTagName, setNewTagName] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)

  useEffect(() => {
    if (open) { setConfig(initialConfig || {}); setNewTagName('') }
  }, [open, initialConfig])

  const set = (patch: Record<string, any>) => setConfig(prev => ({ ...prev, ...patch }))

  // Shared by the trigger/condition/action tag pickers below — lets you create
  // a brand-new tag inline instead of bouncing out to a separate tags page.
  const renderTagField = (label: string, value: number | undefined, onChange: (id: number | undefined) => void) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <NativeSelect wrapperClassName="w-full" value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)}>
        <option value="">Select a tag...</option>
        {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </NativeSelect>
      {onCreateTag && (
        <div className="flex gap-1.5">
          <Input
            placeholder="Or create a new tag..." value={newTagName}
            onChange={e => setNewTagName(e.target.value)} className="h-8 text-xs"
          />
          <Button
            type="button" size="sm" variant="outline" className="shrink-0"
            disabled={!newTagName.trim() || creatingTag}
            onClick={async () => {
              setCreatingTag(true)
              try {
                const tag = await onCreateTag(newTagName.trim())
                onChange(tag.id)
                setNewTagName('')
              } finally {
                setCreatingTag(false)
              }
            }}
          >
            Add
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {nodeType === 'trigger' && 'Configure Trigger'}
            {nodeType === 'condition' && 'Configure Condition'}
            {nodeType === 'action' && 'Configure Action'}
            {nodeType === 'end' && 'End Workflow'}
          </DialogTitle>
          <DialogDescription>
            {nodeType === 'end' ? 'This branch stops here — no further actions run.' : 'Set what this node checks or does.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {nodeType === 'trigger' && (
            <>
              <div className="space-y-1.5">
                <Label>When this happens</Label>
                <NativeSelect wrapperClassName="w-full" value={config.trigger_type || ''}
                  onChange={e => set({ trigger_type: e.target.value, list_id: undefined, tag_id: undefined, campaign_id: undefined, days: undefined })}>
                  <option value="">Select trigger...</option>
                  {Object.entries(TRIGGER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </NativeSelect>
              </div>

              {['opened', 'clicked', 'replied', 'bounced'].includes(config.trigger_type) && (
                <div className="space-y-1.5">
                  <Label>Campaign (optional)</Label>
                  <NativeSelect wrapperClassName="w-full" value={config.campaign_id ?? ''}
                    onChange={e => set({ campaign_id: e.target.value ? Number(e.target.value) : undefined })}>
                    <option value="">Any campaign</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </NativeSelect>
                </div>
              )}

              {config.trigger_type === 'added_to_list' && (
                <div className="space-y-1.5">
                  <Label>List</Label>
                  <NativeSelect wrapperClassName="w-full" value={config.list_id ?? ''}
                    onChange={e => set({ list_id: e.target.value ? Number(e.target.value) : undefined })}>
                    <option value="">Select a list...</option>
                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </NativeSelect>
                </div>
              )}

              {config.trigger_type === 'tag_added' &&
                renderTagField('Tag', config.tag_id, id => set({ tag_id: id }))}

              {config.trigger_type === 'no_reply_after' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Days</Label>
                    <Input type="number" min={1} value={config.days ?? ''}
                      onChange={e => set({ days: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Campaign (optional)</Label>
                    <NativeSelect wrapperClassName="w-full" value={config.campaign_id ?? ''}
                      onChange={e => set({ campaign_id: e.target.value ? Number(e.target.value) : undefined })}>
                      <option value="">Any campaign</option>
                      {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </NativeSelect>
                  </div>
                </div>
              )}
            </>
          )}

          {nodeType === 'condition' && (
            <>
              <div className="space-y-1.5">
                <Label>Check</Label>
                <NativeSelect wrapperClassName="w-full" value={config.field || ''}
                  onChange={e => set({ field: e.target.value, list_id: undefined, tag_id: undefined, status: undefined })}>
                  <option value="">Select condition...</option>
                  <option value="list">Contact is in list</option>
                  <option value="tag">Contact has tag</option>
                  <option value="status">Contact status equals</option>
                </NativeSelect>
              </div>
              {config.field === 'list' && (
                <div className="space-y-1.5">
                  <Label>List</Label>
                  <NativeSelect wrapperClassName="w-full" value={config.list_id ?? ''}
                    onChange={e => set({ list_id: e.target.value ? Number(e.target.value) : undefined })}>
                    <option value="">Select a list...</option>
                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </NativeSelect>
                </div>
              )}
              {config.field === 'tag' &&
                renderTagField('Tag', config.tag_id, id => set({ tag_id: id }))}
              {config.field === 'status' && (
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <NativeSelect wrapperClassName="w-full" value={config.status || ''}
                    onChange={e => set({ status: e.target.value || undefined })}>
                    <option value="">Select status...</option>
                    {STATUS_CHOICES.map(s => <option key={s} value={s}>{s}</option>)}
                  </NativeSelect>
                </div>
              )}
            </>
          )}

          {nodeType === 'action' && (
            <>
              <div className="space-y-1.5">
                <Label>Do this</Label>
                <NativeSelect wrapperClassName="w-full" value={config.action_type || ''}
                  onChange={e => set({ action_type: e.target.value, list_id: undefined, tag_id: undefined, campaign_id: undefined, status: undefined, url: undefined })}>
                  <option value="">Select action...</option>
                  {Object.entries(ACTION_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                </NativeSelect>
              </div>

              {(config.action_type === 'add_to_list' || config.action_type === 'remove_from_list') && (
                <div className="space-y-1.5">
                  <Label>List</Label>
                  <NativeSelect wrapperClassName="w-full" value={config.list_id ?? ''}
                    onChange={e => set({ list_id: e.target.value ? Number(e.target.value) : undefined })}>
                    <option value="">Select a list...</option>
                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </NativeSelect>
                </div>
              )}

              {(config.action_type === 'add_tag' || config.action_type === 'remove_tag') &&
                renderTagField('Tag', config.tag_id, id => set({ tag_id: id }))}

              {(config.action_type === 'start_sequence' || config.action_type === 'stop_sequence') && (
                <div className="space-y-1.5">
                  <Label>Campaign</Label>
                  <NativeSelect wrapperClassName="w-full" value={config.campaign_id ?? ''}
                    onChange={e => set({ campaign_id: e.target.value ? Number(e.target.value) : undefined })}>
                    <option value="">{config.action_type === 'stop_sequence' ? 'Any active sequence' : 'Select a campaign...'}</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </NativeSelect>
                </div>
              )}

              {config.action_type === 'update_contact_status' && (
                <div className="space-y-1.5">
                  <Label>New status</Label>
                  <NativeSelect wrapperClassName="w-full" value={config.status || ''}
                    onChange={e => set({ status: e.target.value || undefined })}>
                    <option value="">Select status...</option>
                    {STATUS_CHOICES.map(s => <option key={s} value={s}>{s}</option>)}
                  </NativeSelect>
                </div>
              )}

              {config.action_type === 'webhook' && (
                <div className="space-y-1.5">
                  <Label>Webhook URL</Label>
                  <Input placeholder="https://hooks.example.com/..." value={config.url || ''}
                    onChange={e => set({ url: e.target.value })} />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {onDelete && (
            <Button variant="destructive" onClick={() => { onDelete(); onClose() }}>Delete Node</Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { onSave(config); onClose() }}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
