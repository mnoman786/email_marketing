'use client'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contactsApi, listsApi, tagsApi } from '@/lib/api'
import { Contact } from '@/lib/types'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, UserRound, Tag as TagIcon, X, ListFilter, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { getTagBadgeProps, randomTagColor } from './tag-form-dialog'

const schema = z.object({
  email: z.string().email('Invalid email'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  website: z.union([z.url().refine(value => /^https?:\/\//i.test(value)), z.literal('')]).optional(),
  linkedin_url: z.union([z.url().refine(value => /^https?:\/\//i.test(value)), z.literal('')]).optional(),
  title: z.string().optional(),
  industry: z.string().optional(),
  company_size: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  lead_source: z.string().optional(),
  lead_stage: z.enum(['new', 'contacted', 'replied', 'qualified', 'won', 'lost']),
  next_follow_up_at: z.string().optional(),
  notes: z.string().optional(),
  list_ids: z.array(z.number()).optional(),
  tag_ids: z.array(z.number()).optional(),
})

type FormData = z.infer<typeof schema>

interface TagLite { id: number; name: string; color: string }

interface Props {
  open: boolean
  onClose: () => void
  contact: Contact | null
  onSaved: () => void
}

export function ContactFormDialog({ open, onClose, contact, onSaved }: Props) {
  const qc = useQueryClient()
  const [newTagName, setNewTagName] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)
  const [showMoreDetails, setShowMoreDetails] = useState(false)
  const [extraFields, setExtraFields] = useState<{ id: number; key: string; value: string }[]>([])

  const { data: listsData } = useQuery({
    queryKey: ['lists-all'],
    queryFn: () => listsApi.getAll({ page_size: 100 }).then(r => r.data.items || []),
  })
  const { data: tagsData } = useQuery({
    queryKey: ['tags-all'],
    queryFn: () => tagsApi.getAll().then(r => (r.data || []) as TagLite[]),
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const selectedLists = watch('list_ids') || []
  const selectedTags = watch('tag_ids') || []

  useEffect(() => {
    if (contact) {
      reset({
        email: contact.email,
        first_name: contact.first_name,
        last_name: contact.last_name,
        phone: contact.phone,
        company: contact.company,
        website: contact.website || '',
        linkedin_url: contact.linkedin_url || '',
        title: contact.title || '',
        industry: contact.industry || '',
        company_size: contact.company_size || '',
        city: contact.city || '',
        state: contact.state || '',
        country: contact.country || '',
        lead_source: contact.lead_source || '',
        lead_stage: contact.lead_stage || 'new',
        next_follow_up_at: contact.next_follow_up_at || '',
        notes: contact.notes || '',
        list_ids: contact.list_ids,
        tag_ids: contact.tag_ids,
      })
      setExtraFields(Object.entries(contact.custom_fields || {}).map(([key, value], id) => ({ id, key, value: String(value ?? '') })))
      setShowMoreDetails(Boolean(contact.website || contact.linkedin_url || contact.title || contact.industry || contact.company_size || contact.city || contact.state || contact.country || contact.lead_source || (contact.lead_stage && contact.lead_stage !== 'new') || contact.next_follow_up_at || contact.notes || Object.keys(contact.custom_fields || {}).length))
    } else {
      reset({ email: '', first_name: '', last_name: '', phone: '', company: '', website: '', linkedin_url: '', title: '', industry: '', company_size: '', city: '', state: '', country: '', lead_source: '', lead_stage: 'new', next_follow_up_at: '', notes: '', list_ids: [], tag_ids: [] })
      setExtraFields([])
      setShowMoreDetails(false)
    }
    setNewTagName('')
  }, [contact, open, reset])

  const mutation = useMutation({
    mutationFn: (data: Omit<FormData, 'next_follow_up_at'> & { custom_fields: Record<string, unknown>; next_follow_up_at: string | null }) => contact
      ? contactsApi.update(contact.id, data)
      : contactsApi.create(data),
    onSuccess: () => {
      toast.success(contact ? 'Lead updated' : 'Lead created')
      onSaved()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.email?.[0] || err.response?.data?.detail || 'Failed to save'
      toast.error(msg)
    },
  })

  const toggleList = (id: number) => {
    const current = selectedLists
    setValue('list_ids', current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  }

  const toggleTag = (id: number) => {
    const current = selectedTags
    setValue('tag_ids', current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  }

  // The chips currently applied to this lead, resolved from ids → tag objects.
  const selectedTagObjs = useMemo(
    () => (tagsData || []).filter(t => selectedTags.includes(t.id)),
    [tagsData, selectedTags]
  )

  // Existing tags not yet applied, filtered by what's being typed — shown as
  // one-click suggestions beneath the input (the "Tagify" affordance).
  const query = newTagName.trim().toLowerCase()
  const suggestions = useMemo(
    () => (tagsData || [])
      .filter(t => !selectedTags.includes(t.id) && (!query || t.name.toLowerCase().includes(query)))
      .slice(0, 12),
    [tagsData, selectedTags, query]
  )
  const exactMatch = (tagsData || []).find(t => t.name.toLowerCase() === query)

  // Enter (or the Add button) either selects a matching existing tag or creates
  // a brand-new one with a random color, then selects it.
  const addOrCreateTag = async () => {
    const name = newTagName.trim()
    if (!name) return
    const existing = (tagsData || []).find(t => t.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      if (!selectedTags.includes(existing.id)) setValue('tag_ids', [...selectedTags, existing.id])
      setNewTagName('')
      return
    }
    setCreatingTag(true)
    try {
      const res = await tagsApi.create({ name, color: randomTagColor() })
      await qc.invalidateQueries({ queryKey: ['tags-all'] })
      setValue('tag_ids', [...selectedTags, res.data.id])
      setNewTagName('')
    } catch {
      toast.error('Failed to create tag')
    } finally {
      setCreatingTag(false)
    }
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addOrCreateTag()
    } else if (e.key === 'Backspace' && !newTagName && selectedTags.length > 0) {
      // Backspace on an empty field removes the last chip — standard tag-input UX.
      setValue('tag_ids', selectedTags.slice(0, -1))
    }
  }

  const saveLead = (data: FormData) => {
    const namedFields = extraFields.filter(field => field.key.trim())
    const keys = namedFields.map(field => field.key.trim())
    if (new Set(keys.map(key => key.toLowerCase())).size !== keys.length) {
      toast.error('Custom field names must be unique')
      return
    }
    const custom_fields = Object.fromEntries(namedFields.map(field => {
      const key = field.key.trim()
      const oldValue = contact?.custom_fields?.[key]
      return [key, oldValue !== undefined && String(oldValue ?? '') === field.value ? oldValue : field.value]
    }))
    mutation.mutate({ ...data, next_follow_up_at: data.next_follow_up_at || null, custom_fields })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(
        'w-[calc(100vw-2rem)] max-h-[92vh] p-0 gap-0 overflow-hidden transition-[max-width] duration-200',
        showMoreDetails ? 'max-w-6xl' : 'max-w-xl'
      )}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-5 border-b bg-muted/30">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary shrink-0">
            <UserRound size={20} />
          </div>
          <div>
            <DialogTitle className="text-lg font-semibold leading-tight">{contact ? 'Edit Lead' : 'Add Lead'}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-0">
              {contact ? 'Update this contact’s details, lists and tags.' : 'Create a new contact in your lead base.'}
            </DialogDescription>
          </div>
        </div>

        <form onSubmit={handleSubmit(saveLead, () => setShowMoreDetails(true))}>
          {/* Body */}
          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            <div>
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input {...register('email')} placeholder="contact@example.com" className="mt-1.5" />
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <Input {...register('first_name')} placeholder="John" className="mt-1.5" />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input {...register('last_name')} placeholder="Doe" className="mt-1.5" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input {...register('phone')} placeholder="+1 234 567 890" className="mt-1.5" />
              </div>
              <div>
                <Label>Company</Label>
                <Input {...register('company')} placeholder="Acme Inc." className="mt-1.5" />
              </div>
            </div>

            <div className={cn('rounded-xl border transition-colors', showMoreDetails ? 'border-primary/40 bg-primary/[0.02]' : 'border-primary/30 bg-primary/[0.05] hover:border-primary/60 hover:bg-primary/[0.08]')}>
              <button type="button" onClick={() => setShowMoreDetails(value => !value)}
                aria-expanded={showMoreDetails}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Plus size={18} /></span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{showMoreDetails ? 'More lead details' : 'Add more lead details'}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">Work, location, source, follow-up, notes and custom fields</span>
                  </span>
                </span>
                {showMoreDetails ? <ChevronUp size={18} className="shrink-0 text-primary" /> : <ChevronDown size={18} className="shrink-0 text-primary" />}
              </button>
              {showMoreDetails && (
                <div className="grid grid-cols-1 gap-5 border-t border-primary/20 bg-background px-4 py-5 lg:grid-cols-2">
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work and company</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Job title</Label><Input {...register('title')} placeholder="Marketing Manager" className="mt-1.5" /></div>
                      <div><Label>Industry</Label><Input {...register('industry')} placeholder="Software" className="mt-1.5" /></div>
                      <div><Label>Company size</Label><Input {...register('company_size')} placeholder="11–50 employees" className="mt-1.5" /></div>
                      <div><Label>Website</Label><Input {...register('website')} type="url" placeholder="https://example.com" className="mt-1.5" />{errors.website && <p className="mt-1 text-xs text-destructive">Enter a valid URL</p>}</div>
                      <div className="col-span-2"><Label>LinkedIn profile</Label><Input {...register('linkedin_url')} type="url" placeholder="https://linkedin.com/in/name" className="mt-1.5" />{errors.linkedin_url && <p className="mt-1 text-xs text-destructive">Enter a valid URL</p>}</div>
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div><Label>City</Label><Input {...register('city')} className="mt-1.5" /></div>
                      <div><Label>State / region</Label><Input {...register('state')} className="mt-1.5" /></div>
                      <div><Label>Country</Label><Input {...register('country')} className="mt-1.5" /></div>
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tracking</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Lead source</Label><Input {...register('lead_source')} placeholder="Referral, event, website…" className="mt-1.5" /></div>
                      <div><Label>Stage</Label><NativeSelect {...register('lead_stage')} wrapperClassName="mt-1.5 w-full"><option value="new">New</option><option value="contacted">Contacted</option><option value="replied">Replied</option><option value="qualified">Qualified</option><option value="won">Won</option><option value="lost">Lost</option></NativeSelect></div>
                      <div className="col-span-2"><Label>Next follow-up</Label><Input {...register('next_follow_up_at')} type="date" className="mt-1.5" /></div>
                    </div>
                    <div className="mt-3"><Label>Notes</Label><Textarea {...register('notes')} placeholder="Conversation history, interests, or anything your team should remember" rows={4} className="mt-1.5" /></div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom details</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => setExtraFields(fields => [...fields, { id: Math.max(0, ...fields.map(field => field.id)) + 1, key: '', value: '' }])}><Plus size={13} /> Add field</Button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {extraFields.map(field => (
                        <div key={field.id} className="flex items-center gap-2">
                          <Input aria-label="Custom field name" placeholder="Field name" value={field.key} onChange={e => setExtraFields(fields => fields.map(item => item.id === field.id ? { ...item, key: e.target.value } : item))} />
                          <Input aria-label="Custom field value" placeholder="Value" value={field.value} onChange={e => setExtraFields(fields => fields.map(item => item.id === field.id ? { ...item, value: e.target.value } : item))} />
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove custom field" onClick={() => setExtraFields(fields => fields.filter(item => item.id !== field.id))}><X size={15} /></Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {listsData && listsData.length > 0 && (
              <div>
                <Label className="flex items-center gap-1.5">
                  <ListFilter size={13} className="text-muted-foreground" /> Assign to Lists
                </Label>
                <div className="mt-1.5 grid grid-cols-2 gap-1 max-h-36 overflow-y-auto rounded-lg border border-input p-1.5">
                  {listsData.map((list: any) => {
                    const active = selectedLists.includes(list.id)
                    return (
                      <label
                        key={list.id}
                        className={cn(
                          'flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 transition-colors',
                          active ? 'bg-primary/10 font-medium' : 'hover:bg-muted'
                        )}
                      >
                        <Checkbox checked={active} onChange={() => toggleList(list.id)} />
                        <span className="truncate">{list.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tags — Tagify-style chip input */}
            <div>
              <Label className="flex items-center gap-1.5">
                <TagIcon size={13} className="text-muted-foreground" /> Tags
              </Label>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-2 transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:border-ring">
                {selectedTagObjs.map(tag => {
                  const badge = getTagBadgeProps(tag.color)
                  return (
                    <span
                      key={tag.id}
                      className={cn('gap-1', badge.className)}
                      style={badge.style}
                    >
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className="-mr-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                        aria-label={`Remove ${tag.name}`}
                      >
                        <X size={11} strokeWidth={2.5} />
                      </button>
                    </span>
                  )
                })}
                <input
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder={selectedTagObjs.length ? 'Add a tag…' : 'Type to add or create tags…'}
                  className="flex-1 min-w-28 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
                />
                {newTagName.trim() && !exactMatch && (
                  <Button
                    type="button" size="sm" variant="outline" className="h-7 shrink-0"
                    disabled={creatingTag}
                    onClick={addOrCreateTag}
                  >
                    <Plus size={13} /> Create “{newTagName.trim()}”
                  </Button>
                )}
              </div>

              {/* Suggestions — existing tags you can click to apply */}
              {suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {suggestions.map(tag => {
                    const badge = getTagBadgeProps(tag.color)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={cn('inline-flex items-center gap-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity', badge.className)}
                        style={badge.style}
                      >
                        <Plus size={11} strokeWidth={2.5} /> {tag.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/30">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>
              {contact ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
