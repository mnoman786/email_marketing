'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { validationApi, listsApi } from '@/lib/api'
import { ImportBatch, StagedLead, PaginatedResponse, VerificationBucket } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { SearchInput } from '@/components/ui/search-input'
import { NativeSelect } from '@/components/ui/native-select'
import { TableContainer, TableScroll, Table, TableHead, TableBody, TableHeaderRow, TH, TR, TD } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { TablePagination } from '@/components/shared/table-pagination'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { cn } from '@/lib/utils'
import {
  VerificationDot, SpamRiskBadge, SUB_STATUS_LABEL,
} from '@/components/contacts/verification-badges'
import {
  ArrowLeft, Loader2, ShieldCheck, Send, CheckCircle2, Users,
} from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'all' | VerificationBucket

// Tab order + colour. `always` tabs show even at zero count.
const TABS: { key: Tab; label: string; dot: string; always?: boolean }[] = [
  { key: 'all', label: 'All', dot: 'bg-muted-foreground', always: true },
  { key: 'valid', label: 'Valid', dot: 'bg-green-500', always: true },
  { key: 'risky', label: 'Risky', dot: 'bg-amber-400' },
  { key: 'invalid', label: 'Invalid', dot: 'bg-red-500', always: true },
  { key: 'disposable', label: 'Disposable', dot: 'bg-red-400' },
  { key: 'unknown', label: 'Unknown', dot: 'bg-amber-300' },
  { key: 'unverified', label: 'Unverified', dot: 'bg-gray-300' },
]

export default function ValidationBatchPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const batchId = Number(id)

  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number[]>([])
  const [listId, setListId] = useState<number | ''>('')

  const { data: batch } = useQuery({
    queryKey: ['validation-batch', batchId],
    queryFn: () => validationApi.getBatch(batchId).then(r => r.data as ImportBatch),
    refetchInterval: (query) =>
      (query.state.data as ImportBatch | undefined)?.status === 'verifying' ? 2000 : false,
  })

  const { data: listsData } = useQuery({
    queryKey: ['lists-all'],
    queryFn: () => listsApi.getAll({ page_size: 100 }).then(r => r.data.items || []),
  })

  const verifying = batch?.status === 'verifying'

  const { data: leadsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['validation-leads', batchId, tab, search, page],
    queryFn: () => validationApi.leads(batchId, {
      verification: tab === 'all' ? undefined : tab,
      search: search || undefined,
      page,
    }).then(r => r.data as PaginatedResponse<StagedLead>),
    // While still verifying, keep results live so buckets fill in.
    refetchInterval: verifying ? 2500 : false,
  })

  const promoteMut = useMutation({
    mutationFn: (payload: { lead_ids?: number[]; bucket?: string }) =>
      validationApi.promote(batchId, { ...payload, list_id: listId || undefined }),
    onSuccess: (res) => {
      const { promoted = 0, added_to_list = 0 } = res.data || {}
      qc.invalidateQueries({ queryKey: ['validation-batch', batchId] })
      qc.invalidateQueries({ queryKey: ['validation-leads', batchId] })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      setSelected([])
      toast.success(
        promoted === 0 ? 'Those leads were already pushed.'
          : `${promoted} pushed to leads${added_to_list ? ` · added to list` : ''}`
      )
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to push leads'),
  })

  const leads = leadsData?.items || []
  const total = leadsData?.count || 0
  const counts = batch?.counts || {}
  const validCount = counts.valid || 0

  const selectableOnPage = leads.filter(l => !l.promoted).map(l => l.id)
  const toggle = (id: number) =>
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const toggleAll = () =>
    setSelected(selected.length === selectableOnPage.length ? [] : selectableOnPage)
  const allSelected = selectableOnPage.length > 0 && selected.length === selectableOnPage.length
  const someSelected = selected.length > 0 && !allSelected

  const visibleTabs = TABS.filter(t => t.always || (counts[t.key as keyof typeof counts] || 0) > 0)

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/validation')} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{batch?.name || 'Validation'}</h1>
          <p className="text-sm text-muted-foreground">
            {batch?.total?.toLocaleString() || 0} addresses
            {verifying && <> · <span className="text-amber-600">verifying {batch?.percent ?? 0}%</span></>}
          </p>
        </div>
      </div>

      {/* Action bar: push valid / push selected + list picker */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-sm">
          <Users size={15} className="text-muted-foreground" />
          <span>Add to list:</span>
          <NativeSelect
            value={listId}
            onChange={e => setListId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">None (just add as leads)</option>
            {listsData?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </NativeSelect>
        </div>

        <div className="flex-1" />

        {selected.length > 0 && (
          <Button variant="outline" onClick={() => promoteMut.mutate({ lead_ids: selected })} loading={promoteMut.isPending}>
            <Send size={14} /> Push {selected.length} selected
          </Button>
        )}
        <Button
          onClick={() => promoteMut.mutate({ bucket: 'valid' })}
          disabled={validCount === 0 || promoteMut.isPending}
          loading={promoteMut.isPending}
          title="Push every valid lead to your lead base"
        >
          <ShieldCheck size={14} /> Push all valid ({validCount})
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {visibleTabs.map(t => {
          const active = tab === t.key
          const count = t.key === 'all' ? (counts.total || 0) : (counts[t.key as keyof typeof counts] || 0)
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); setSelected([]) }}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full', t.dot)} />
              {t.label}
              <span className={cn('text-[10px] font-semibold rounded-full px-1.5 py-0.5',
                active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                {count}
              </span>
              {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <SearchInput
        wrapperClassName="max-w-sm"
        placeholder="Search this batch..."
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1) }}
      />

      {/* Table */}
      <TableContainer>
        {isLoading ? (
          <div className="p-6"><TableSkeleton rows={6} cols={5} /></div>
        ) : isError ? (
          <ErrorState description="Could not load this batch. Check your connection and try again." onRetry={() => refetch()} />
        ) : leads.length === 0 ? (
          <EmptyState
            icon={verifying ? Loader2 : ShieldCheck}
            title={verifying ? 'Verifying…' : 'No leads in this tab'}
            description={verifying ? 'Results appear here as each address is checked.' : 'Try a different tab or search.'}
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
                        aria-label="Select all selectable leads on this page"
                      />
                    </TH>
                    <TH>Email</TH>
                    <TH>Name</TH>
                    <TH>Result</TH>
                    <TH>Risk</TH>
                    <TH>Status</TH>
                  </TableHeaderRow>
                </TableHead>
                <TableBody>
                  {leads.map(lead => {
                    const sub = lead.verification_detail?.sub_status
                    return (
                      <TR key={lead.id} selected={selected.includes(lead.id)} className={cn(lead.promoted && 'opacity-60')}>
                        <TD>
                          <Checkbox disabled={lead.promoted}
                            checked={selected.includes(lead.id)}
                            onChange={() => toggle(lead.id)}
                            aria-label={`Select ${lead.email}`} />
                        </TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <VerificationDot contact={lead} />
                            <span className="font-medium">{lead.email}</span>
                          </div>
                        </TD>
                        <TD className="text-muted-foreground">
                          {`${lead.first_name} ${lead.last_name}`.trim() || '—'}
                          {lead.company && <span className="block text-xs">{lead.company}</span>}
                        </TD>
                        <TD className="text-muted-foreground text-xs">
                          {sub ? (SUB_STATUS_LABEL[sub] || sub) : '—'}
                        </TD>
                        <TD><SpamRiskBadge contact={lead} /></TD>
                        <TD>
                          {lead.promoted
                            ? <span className="text-green-600 text-xs flex items-center gap-1"><CheckCircle2 size={12} /> Pushed</span>
                            : <span className="text-muted-foreground text-xs">Staged</span>}
                        </TD>
                      </TR>
                    )
                  })}
                </TableBody>
              </Table>
            </TableScroll>

            <TablePagination page={page} pageSize={25} total={total} onPageChange={setPage} />
          </>
        )}
      </TableContainer>
    </div>
  )
}
