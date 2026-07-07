'use client'
import { useState } from 'react'
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
  Plus, Search, Trash2, MoreHorizontal, Users, ShieldCheck
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ContactFormDialog } from '@/components/contacts/contact-form-dialog'
import { VerificationDot, SpamRiskBadge } from '@/components/contacts/verification-badges'

export default function ContactsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

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
    onError: (err: any) => {
      // 409 when the lead is linked to a campaign.
      toast.error(err.response?.data?.detail || 'Failed to delete lead')
      setDeleteId(null)
    },
  })

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: number[]) => contactsApi.bulkDelete(ids),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      const { deleted = 0, skipped = 0 } = res.data || {}
      if (skipped) {
        toast.success(`${deleted} deleted · ${skipped} kept (linked to a campaign)`)
      } else {
        toast.success(`${deleted} leads deleted`)
      }
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
            description="Add leads manually, or import them from the Email Validation section."
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
