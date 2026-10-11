'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi, listsApi, campaignsApi } from '@/lib/api'
import { Contact, ContactList, CampaignListItem, PaginatedResponse } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { SearchInput } from '@/components/ui/search-input'
import { NativeSelect } from '@/components/ui/native-select'
import { TableContainer, TableScroll, Table, TableHead, TableBody, TableHeaderRow, TH, TR, TD } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { TablePagination } from '@/components/shared/table-pagination'
import { BulkActionBar } from '@/components/shared/bulk-action-bar'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { formatDateTime, cn } from '@/lib/utils'
import {
  Plus, Trash2, Pencil, Users, ListFilter, X, Upload, Eye
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ContactFormDialog } from '@/components/contacts/contact-form-dialog'
import { LeadImportDialog } from '@/components/contacts/lead-import-dialog'
import { VerificationDot, SpamRiskBadge } from '@/components/contacts/verification-badges'
import { getTagBadgeProps } from '@/components/contacts/tag-form-dialog'

function ContactsContent() {
  const qc = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const listIdParam = searchParams.get('list_id')
  const listId = listIdParam ? Number(listIdParam) : undefined

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [leadStage, setLeadStage] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selected, setSelected] = useState<number[]>([])
  const [showCampaignPicker, setShowCampaignPicker] = useState(false)
  const [campaignId, setCampaignId] = useState<number | null>(null)
  const { data: campaigns } = useQuery({
    queryKey: ['campaigns', 'lead-picker'],
    queryFn: async () => {
      const first = (await campaignsApi.getAll({ page: 1 })).data as PaginatedResponse<CampaignListItem>
      const items = [...first.items]
      for (let page = 2; items.length < first.count; page++) {
        const next = (await campaignsApi.getAll({ page })).data as PaginatedResponse<CampaignListItem>
        if (!next.items.length) break
        items.push(...next.items)
      }
      return items
    },
    enabled: showCampaignPicker,
  })
  const enrollMut = useMutation({
    mutationFn: () => campaignsApi.enrollSelected(campaignId!, selected),
    onSuccess: (res) => {
      toast.success(`${res.data.added} leads added to campaign${res.data.skipped ? ` · ${res.data.skipped} skipped` : ''}`)
      setSelected([])
      setShowCampaignPicker(false)
      setCampaignId(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Could not add leads'),
  })
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contacts', { search, status, leadStage, page, pageSize, listId }],
    queryFn: () => contactsApi.getAll({ search, status: status || undefined, lead_stage: leadStage || undefined, list_id: listId, page, page_size: pageSize }).then(r => r.data as PaginatedResponse<Contact>),
  })

  // Resolve the filtered list's name for the "Filtered by" chip below.
  const { data: filterList } = useQuery({
    queryKey: ['list', listId],
    queryFn: () => listsApi.get(listId as number).then(r => r.data as ContactList),
    enabled: !!listId,
  })

  const clearListFilter = () => router.push('/leads')

  // Jumping in from a different list (or clearing the filter) should always
  // land on page 1 — a stale page number from the previous list's pagination
  // could otherwise point past the end of the new, smaller result set.
  useEffect(() => { setPage(1) }, [listId])

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

  const contacts = data?.items || []
  const total = data?.count || 0

  const toggleSelect = (id: number) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const toggleAll = () =>
    setSelected(selected.length === contacts.length ? [] : contacts.map(c => c.id))

  const allSelected = contacts.length > 0 && selected.length === contacts.length
  const someSelected = selected.length > 0 && !allSelected

  return (
    <div className="workspace-page space-y-6">
      {/* Header */}
      <div className="page-intro flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">Manage your lead base</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload size={16} /> Import Leads
          </Button>
          <Button onClick={() => { setEditContact(null); setShowForm(true) }}>
            <Plus size={16} /> Add Lead
          </Button>
        </div>
      </div>

      {/* Active list filter, set by clicking a list on the Lists page */}
      {listId && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered by list:</span>
          <span className="inline-flex items-center gap-1.5 badge bg-primary/10 text-primary border-primary/20">
            <ListFilter size={12} />
            {filterList?.name || '…'}
            <button
              type="button"
              onClick={clearListFilter}
              className="rounded-full p-0.5 hover:bg-primary/20 transition-colors"
              aria-label="Clear list filter"
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <SearchInput
          wrapperClassName="flex-1 min-w-48"
          placeholder="Search by email, name..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
        <NativeSelect
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="bounced">Bounced</option>
          <option value="complained">Complained</option>
        </NativeSelect>
        <NativeSelect value={leadStage} onChange={e => { setLeadStage(e.target.value); setPage(1); setSelected([]) }}>
          <option value="">All Stages</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="replied">Replied</option>
          <option value="qualified">Qualified</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </NativeSelect>
      </div>

      {/* Table */}
      <TableContainer>
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : isError ? (
          <ErrorState description="Could not load your leads. Check your connection and try again." onRetry={() => refetch()} />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No leads found"
            description="Add a lead manually or import a CSV or Excel file."
            action={{ label: 'Add Lead', onClick: () => setShowForm(true) }}
            secondaryAction={{ label: 'Import Leads', onClick: () => setShowImport(true) }}
          />
        ) : (
          <>
            <TableScroll>
              <Table>
                <TableHead>
                  <TableHeaderRow>
                    <TH className="w-10">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={toggleAll}
                        aria-label="Select all leads on this page"
                      />
                    </TH>
                    <TH>Name / Email</TH>
                    <TH>Company</TH>
                    <TH>Stage / Follow-up</TH>
                    <TH>Lists</TH>
                    <TH>Tags</TH>
                    <TH>Spam risk</TH>
                    <TH>Added</TH>
                    <TH className="w-16" />
                  </TableHeaderRow>
                </TableHead>
                <TableBody>
                  {contacts.map(contact => (
                    <TR
                      key={contact.id}
                      selected={selected.includes(contact.id)}
                      className="cursor-pointer"
                      onClick={() => router.push(`/leads/${contact.id}`)}
                    >
                      <TD>
                        <Checkbox
                          checked={selected.includes(contact.id)}
                          onChange={() => toggleSelect(contact.id)}
                          onClick={e => e.stopPropagation()}
                          aria-label={`Select ${contact.email}`}
                        />
                      </TD>
                      <TD>
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
                      </TD>
                      <TD className="text-muted-foreground">{contact.company || '—'}</TD>
                      <TD>
                        <span className="badge bg-muted text-muted-foreground text-xs capitalize">{contact.lead_stage || 'new'}</span>
                        {contact.next_follow_up_at && <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{contact.next_follow_up_at}</p>}
                      </TD>
                      <TD>
                        {contact.list_names.length > 0 ? (
                          <div className="flex gap-1 flex-nowrap items-center max-w-40">
                            <span className="badge bg-muted text-muted-foreground text-xs truncate min-w-0">{contact.list_names[0].name}</span>
                            {contact.list_names.length > 1 && (
                              <span className="badge bg-muted text-muted-foreground text-xs shrink-0">+{contact.list_names.length - 1}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD>
                        {contact.tags_detail.length > 0 ? (
                          <div className="flex gap-1 flex-nowrap items-center max-w-40">
                            {(() => {
                              const badge = getTagBadgeProps(contact.tags_detail[0].color)
                              return (
                                <span className={cn('text-xs truncate min-w-0', badge.className)} style={badge.style}>
                                  {contact.tags_detail[0].name}
                                </span>
                              )
                            })()}
                            {contact.tags_detail.length > 1 && (
                              <span className="badge bg-muted text-muted-foreground text-xs shrink-0">+{contact.tags_detail.length - 1}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD>
                        <SpamRiskBadge contact={contact} />
                      </TD>
                      <TD className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(contact.created_at)}</TD>
                      <TD>
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon-sm" title="View lead details" onClick={() => router.push(`/leads/${contact.id}`)}>
                            <Eye size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Edit lead"
                            onClick={() => { setEditContact(contact); setShowForm(true) }}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Delete lead"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(contact.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>

            <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage}
              pageSizeOptions={[20, 50, 100]} onPageSizeChange={size => { setPageSize(size); setPage(1); setSelected([]) }} />
          </>
        )}
      </TableContainer>

      {/* Floating bulk actions */}
      <BulkActionBar count={selected.length} onClear={() => setSelected([])} noun="lead">
        <Button variant="outline" size="sm" onClick={() => setShowCampaignPicker(true)}>
          <Users size={14} /> Add to campaign
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => bulkDeleteMut.mutate(selected)}
          loading={bulkDeleteMut.isPending}
        >
          <Trash2 size={14} /> Delete
        </Button>
      </BulkActionBar>

      <Dialog open={showCampaignPicker} onOpenChange={setShowCampaignPicker}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add {selected.length} selected leads to a campaign</DialogTitle></DialogHeader>
          <NativeSelect value={campaignId ?? ''} onChange={e => setCampaignId(Number(e.target.value) || null)}>
            <option value="">Choose a campaign</option>
            {(campaigns || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">Only active, eligible leads are added. Leads already in the campaign are skipped.</p>
          <DialogFooter>
            <Button disabled={!campaignId || enrollMut.isPending} loading={enrollMut.isPending} onClick={() => enrollMut.mutate()}>Add leads</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <LeadImportDialog open={showImport} onClose={() => setShowImport(false)} listId={listId} />
      <ContactFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        contact={editContact}
        onSaved={(saved, keepOpen) => {
          qc.invalidateQueries({ queryKey: ['contacts'] })
          if (!keepOpen) { setShowForm(false); router.push(`/leads/${saved.id}`) }
        }}
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

export default function ContactsPage() {
  return (
    <Suspense fallback={
      <div className="p-6">
        <TableSkeleton rows={6} cols={6} />
      </div>
    }>
      <ContactsContent />
    </Suspense>
  )
}
