'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '@/lib/api'
import { Contact, PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { formatDateTime } from '@/lib/utils'
import {
  Plus, Search, Trash2, Upload, UserX, Download, MoreHorizontal, Users, ShieldCheck
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ContactFormDialog } from '@/components/contacts/contact-form-dialog'
import { BulkImportDialog } from '@/components/contacts/bulk-import-dialog'

// Small coloured dot conveying email-verification status at a glance.
const VERIFY_META: Record<string, { color: string; title: string }> = {
  valid: { color: 'bg-green-500', title: 'Email verified — domain accepts mail' },
  invalid: { color: 'bg-red-500', title: 'Invalid — bad address or no mail server' },
  unknown: { color: 'bg-amber-400', title: 'Unverified — lookup was inconclusive' },
  unverified: { color: 'bg-gray-300', title: 'Not yet verified' },
}

// Human-readable labels for the verifier's sub_status.
const SUB_STATUS_LABEL: Record<string, string> = {
  ok: 'Deliverable',
  invalid_syntax: 'Invalid format',
  disposable: 'Disposable / temp address',
  no_mx: 'Domain has no mail server',
  mx_lookup_failed: 'DNS lookup inconclusive',
  possible_typo: 'Possible typo',
  role_account: 'Role-based mailbox',
  gibberish: 'Gibberish / random address',
  mailbox_not_found: 'Mailbox does not exist',
}

function VerificationDot({ contact }: { contact: Contact }) {
  const m = VERIFY_META[contact.verification_status] || VERIFY_META.unverified
  const d = contact.verification_detail || {}
  const parts = [m.title]
  if (d.sub_status && SUB_STATUS_LABEL[d.sub_status]) parts.push(SUB_STATUS_LABEL[d.sub_status])
  if (typeof d.score === 'number') parts.push(`Score ${d.score}/10`)
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${m.color}`} title={parts.join(' · ')} />
}

// Per-lead spam / send-risk badge derived from verification_detail.
const RISK_META: Record<string, { color: string; label: string }> = {
  low: { color: 'bg-green-100 text-green-700', label: 'Low' },
  medium: { color: 'bg-amber-100 text-amber-700', label: 'Medium' },
  high: { color: 'bg-red-100 text-red-700', label: 'High' },
}

function SpamRiskBadge({ contact }: { contact: Contact }) {
  const d = contact.verification_detail || {}
  if (typeof d.spam_score !== 'number' || !d.risk) {
    return <span className="text-muted-foreground text-xs">—</span>
  }
  const m = RISK_META[d.risk] || RISK_META.low
  return (
    <span
      className={`badge ${m.color} text-xs`}
      title={`Spam risk ${d.spam_score}/100 — higher means more likely to hurt sender reputation`}
    >
      {m.label} · {d.spam_score}
    </span>
  )
}

export default function ContactsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [importTaskId, setImportTaskId] = useState<string | null>(null)
  const [verifyTaskId, setVerifyTaskId] = useState<string | null>(null)

  const { data: importStatus } = useQuery({
    queryKey: ['import-status', importTaskId],
    queryFn: () => contactsApi.importStatus(importTaskId!).then(r => r.data),
    enabled: !!importTaskId,
    refetchInterval: (query) => {
      const state = (query.state.data as any)?.state
      return state === 'success' || state === 'failure' ? false : 2000
    },
  })

  useEffect(() => {
    if (!importStatus) return
    const s = (importStatus as any).state
    if (s === 'success') {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['lists-all'] })
      const st = importStatus as any
      const blocked = st.blocked ? `, ${st.blocked} temp-mail blocked` : ''
      toast.success(`Import done: ${st.created} created, ${st.updated} updated${blocked}`)
      setImportTaskId(null)
    } else if (s === 'failure') {
      toast.error('Import failed')
      setImportTaskId(null)
    }
  }, [importStatus])

  const { data: verifyStatus } = useQuery({
    queryKey: ['verify-status', verifyTaskId],
    queryFn: () => contactsApi.verifyStatus(verifyTaskId!).then(r => r.data),
    enabled: !!verifyTaskId,
    refetchInterval: (query) => {
      const state = (query.state.data as any)?.state
      return state === 'success' || state === 'failure' ? false : 2000
    },
  })

  useEffect(() => {
    if (!verifyStatus) return
    const s = (verifyStatus as any).state
    if (s === 'success') {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      const v = verifyStatus as any
      toast.success(`Verified ${v.total}: ${v.valid} valid, ${v.invalid} invalid, ${v.unknown} unknown`)
      setVerifyTaskId(null)
    } else if (s === 'failure') {
      toast.error('Verification failed')
      setVerifyTaskId(null)
    }
  }, [verifyStatus])

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', { search, status, page }],
    queryFn: () => contactsApi.getAll({ search, status: status || undefined, page }).then(r => r.data as PaginatedResponse<Contact>),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => contactsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Lead deleted')
      setDeleteId(null)
    },
  })

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: number[]) => contactsApi.bulkDelete(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success(`${selected.length} leads deleted`)
      setSelected([])
    },
  })

  const verifyBulkMut = useMutation({
    mutationFn: (ids?: number[]) => contactsApi.verifyBulk(ids?.length ? { contact_ids: ids } : {}),
    onSuccess: (res) => {
      setVerifyTaskId(res.data.task_id)
      toast.success(`Verifying ${res.data.total} lead(s)…`)
      setSelected([])
    },
  })

  const verifyOneMut = useMutation({
    mutationFn: (id: number) => contactsApi.verify(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Lead re-verified')
    },
  })

  const contacts = data?.items || []
  const total = data?.count || 0
  const totalPages = Math.ceil(total / 20)

  const toggleSelect = (id: number) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const toggleAll = () =>
    setSelected(selected.length === contacts.length ? [] : contacts.map(c => c.id))

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">Manage your lead base</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload size={16} /> Import
          </Button>
          <Button onClick={() => { setEditContact(null); setShowForm(true) }}>
            <Plus size={16} /> Add Lead
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input
            placeholder="Search by email, name..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="h-9 px-3 rounded-lg border border-input bg-background text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="bounced">Bounced</option>
          <option value="complained">Complained</option>
        </select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => verifyBulkMut.mutate(selected.length ? selected : undefined)}
          loading={verifyBulkMut.isPending || !!verifyTaskId}
          title={selected.length ? `Verify ${selected.length} selected` : 'Verify all leads'}
        >
          <ShieldCheck size={14} />
          {verifyTaskId
            ? `Verifying ${(verifyStatus as any)?.percent ?? 0}%`
            : selected.length ? `Verify ${selected.length}` : 'Verify all'}
        </Button>

        {selected.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => bulkDeleteMut.mutate(selected)}
            loading={bulkDeleteMut.isPending}
          >
            <Trash2 size={14} /> Delete {selected.length}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No leads found"
            description="Import leads or add them manually to get started."
            action={{ label: 'Add Lead', onClick: () => setShowForm(true) }}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="w-10 px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selected.length === contacts.length}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name / Email</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Lists</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Spam risk</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Added</th>
                    <th className="px-4 py-3 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {contacts.map(contact => (
                    <tr key={contact.id} className="table-row-hover">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.includes(contact.id)}
                          onChange={() => toggleSelect(contact.id)}
                          className="rounded"
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium flex items-center gap-1.5">
                            {contact.full_name}
                            {contact.verification_detail?.is_disposable && (
                              <span className="badge bg-red-100 text-red-700 text-[10px]">Disposable</span>
                            )}
                            {contact.verification_detail?.is_role && (
                              <span className="badge bg-amber-100 text-amber-700 text-[10px]">Role</span>
                            )}
                            {contact.verification_detail?.is_gibberish && (
                              <span className="badge bg-red-100 text-red-700 text-[10px]">Fake?</span>
                            )}
                          </p>
                          <p className="text-muted-foreground text-xs flex items-center gap-1">
                            <VerificationDot contact={contact} />
                            {contact.email}
                          </p>
                          {contact.verification_detail?.suggestion && (
                            <p className="text-[11px] text-amber-600">
                              Did you mean {contact.verification_detail.suggestion}?
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{contact.company || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {contact.list_names.slice(0, 2).map(l => (
                            <span key={l.id} className="badge bg-muted text-muted-foreground text-xs">{l.name}</span>
                          ))}
                          {contact.list_names.length > 2 && (
                            <span className="badge bg-muted text-muted-foreground text-xs">+{contact.list_names.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={contact.status} />
                      </td>
                      <td className="px-4 py-3">
                        <SpamRiskBadge contact={contact} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatDateTime(contact.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Re-verify email"
                            loading={verifyOneMut.isPending && verifyOneMut.variables === contact.id}
                            onClick={() => verifyOneMut.mutate(contact.id)}
                          >
                            <ShieldCheck size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => { setEditContact(contact); setShowForm(true) }}
                          >
                            <MoreHorizontal size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(contact.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>Next</Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Dialogs */}
      <ContactFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        contact={editContact}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['contacts'] }); setShowForm(false) }}
      />
      <BulkImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={(taskId) => setImportTaskId(taskId)}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete Lead"
        description="Are you sure? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
