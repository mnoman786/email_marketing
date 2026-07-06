'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { validationApi, listsApi } from '@/lib/api'
import { ImportBatch, StagedLead, PaginatedResponse, VerificationBucket } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/empty-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { cn } from '@/lib/utils'
import {
  VerificationDot, SpamRiskBadge, SUB_STATUS_LABEL,
} from '@/components/contacts/verification-badges'
import {
  ArrowLeft, Search, Loader2, ShieldCheck, Send, CheckCircle2, Users,
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

  const { data: leadsData, isLoading } = useQuery({
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
  const totalPages = Math.ceil(total / 25)
  const counts = batch?.counts || {}
  const validCount = counts.valid || 0

  const selectableOnPage = leads.filter(l => !l.promoted).map(l => l.id)
  const toggle = (id: number) =>
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const toggleAll = () =>
    setSelected(selected.length === selectableOnPage.length ? [] : selectableOnPage)

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
          <select
            value={listId}
            onChange={e => setListId(e.target.value ? Number(e.target.value) : '')}
            className="h-9 px-3 rounded-lg border border-input bg-background text-sm"
          >
            <option value="">None (just add as leads)</option>
            {listsData?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
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
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
        <Input placeholder="Search this batch..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6"><TableSkeleton rows={6} cols={5} /></div>
        ) : leads.length === 0 ? (
          <EmptyState
            icon={verifying ? Loader2 : ShieldCheck}
            title={verifying ? 'Verifying…' : 'No leads in this tab'}
            description={verifying ? 'Results appear here as each address is checked.' : 'Try a different tab or search.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox"
                        checked={selectableOnPage.length > 0 && selected.length === selectableOnPage.length}
                        onChange={toggleAll} className="rounded" />
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Result</th>
                    <th className="px-4 py-3 text-left font-medium">Risk</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leads.map(lead => {
                    const sub = lead.verification_detail?.sub_status
                    return (
                      <tr key={lead.id} className={cn('hover:bg-muted/30', lead.promoted && 'opacity-60')}>
                        <td className="px-4 py-3">
                          <input type="checkbox" disabled={lead.promoted}
                            checked={selected.includes(lead.id)}
                            onChange={() => toggle(lead.id)} className="rounded" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <VerificationDot contact={lead} />
                            <span className="font-medium">{lead.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {`${lead.first_name} ${lead.last_name}`.trim() || '—'}
                          {lead.company && <span className="block text-xs">{lead.company}</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {sub ? (SUB_STATUS_LABEL[sub] || sub) : '—'}
                        </td>
                        <td className="px-4 py-3"><SpamRiskBadge contact={lead} /></td>
                        <td className="px-4 py-3">
                          {lead.promoted
                            ? <span className="text-green-600 text-xs flex items-center gap-1"><CheckCircle2 size={12} /> Pushed</span>
                            : <span className="text-muted-foreground text-xs">Staged</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * 25) + 1}–{Math.min(page * 25, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>Next</Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
