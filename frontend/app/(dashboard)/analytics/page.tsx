'use client'
import { useState, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { analyticsApi, campaignsApi } from '@/lib/api'
import { SendLog, PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { SearchInput } from '@/components/ui/search-input'
import { NativeSelect } from '@/components/ui/native-select'
import { TableContainer, TableScroll, Table, TableHead, TableBody, TableHeaderRow, TH, TR, TD } from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { TablePagination } from '@/components/shared/table-pagination'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateTime } from '@/lib/utils'
import { BarChart3, RefreshCw, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'next/navigation'

function AnalyticsContent() {
  const searchParams = useSearchParams()
  const defaultCampaign = searchParams.get('campaign') || ''

  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [campaign, setCampaign] = useState(defaultCampaign)
  const [page, setPage] = useState(1)
  const [selectedFailed, setSelectedFailed] = useState<number[]>([])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['logs', { search, status, campaign, page }],
    queryFn: () => analyticsApi.logs({
      search,
      status: status || undefined,
      campaign: campaign || undefined,
      page,
    }).then(r => r.data as PaginatedResponse<SendLog>),
    refetchInterval: 15000,
  })

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns-list'],
    queryFn: () => campaignsApi.getAll({ page_size: 100 }).then(r => r.data.items || []),
  })

  const retryMut = useMutation({
    mutationFn: () => analyticsApi.retryFailed(
      campaign
        ? { campaign_id: campaign }
        : { log_ids: selectedFailed }
    ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['logs'] })
      toast.success(`${res.data.queued} emails queued for retry`)
      setSelectedFailed([])
    },
  })

  const logs = data?.items || []
  const total = data?.count || 0

  const failedOnPage = logs.filter(l => l.status === 'failed').map(l => l.id)
  const allFailedSelected = failedOnPage.length > 0 && selectedFailed.length === failedOnPage.length
  const someFailedSelected = selectedFailed.length > 0 && !allFailedSelected

  const failedCount = logs.filter(l => l.status === 'failed').length
  const sentCount = logs.filter(l => l.status === 'sent').length

  const toggleSelect = (id: number) =>
    setSelectedFailed(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Send Logs & Analytics</h1>
          <p className="text-sm text-muted-foreground">Track email delivery performance across all campaigns</p>
        </div>
        <div className="flex gap-2">
          {(failedCount > 0 || selectedFailed.length > 0) && (
            <Button
              variant="warning"
              onClick={() => retryMut.mutate()}
              loading={retryMut.isPending}
            >
              <RefreshCw size={15} />
              Retry Failed {selectedFailed.length > 0 ? `(${selectedFailed.length})` : ''}
            </Button>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total in View', value: total, color: 'text-foreground' },
          { label: 'Sent', value: sentCount, color: 'text-green-600' },
          { label: 'Failed', value: failedCount, color: 'text-red-500' },
          { label: 'Rate', value: total > 0 ? `${((sentCount / total) * 100).toFixed(1)}%` : '—', color: 'text-blue-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <SearchInput
          wrapperClassName="flex-1 min-w-48"
          placeholder="Search by email or campaign..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
        <NativeSelect
          value={campaign}
          onChange={e => { setCampaign(e.target.value); setPage(1) }}
          className="max-w-48"
        >
          <option value="">All Campaigns</option>
          {campaigns?.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
        >
          <option value="">All Status</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="bounced">Bounced</option>
          <option value="opened">Opened</option>
        </NativeSelect>
      </div>

      {/* Table */}
      <TableContainer>
        {isLoading ? (
          <div className="p-6"><TableSkeleton rows={8} cols={5} /></div>
        ) : isError ? (
          <ErrorState description="Could not load send logs. Check your connection and try again." onRetry={() => refetch()} />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No logs found"
            description="Send a campaign to see delivery logs here."
          />
        ) : (
          <>
            <TableScroll>
              <Table>
                <TableHead>
                  <TableHeaderRow>
                    <TH className="w-10">
                      <Checkbox
                        checked={allFailedSelected}
                        indeterminate={someFailedSelected}
                        disabled={failedOnPage.length === 0}
                        onChange={e => setSelectedFailed(e.target.checked ? failedOnPage : [])}
                        aria-label="Select all failed logs on this page"
                      />
                    </TH>
                    <TH>Contact</TH>
                    <TH>Campaign</TH>
                    <TH>SMTP</TH>
                    <TH>Status</TH>
                    <TH>Sent At</TH>
                    <TH>Error</TH>
                  </TableHeaderRow>
                </TableHead>
                <TableBody>
                  {logs.map(log => (
                    <TR key={log.id} selected={selectedFailed.includes(log.id)}>
                      <TD>
                        {log.status === 'failed' && (
                          <Checkbox
                            checked={selectedFailed.includes(log.id)}
                            onChange={() => toggleSelect(log.id)}
                            aria-label={`Select failed log for ${log.contact_email}`}
                          />
                        )}
                      </TD>
                      <TD>
                        <p className="font-medium text-xs">{log.contact_name}</p>
                        <p className="text-muted-foreground text-xs">{log.contact_email}</p>
                      </TD>
                      <TD className="text-xs text-muted-foreground max-w-40 truncate">{log.campaign_name}</TD>
                      <TD className="text-xs text-muted-foreground">{log.smtp_name || '—'}</TD>
                      <TD>
                        <StatusBadge status={log.status} />
                      </TD>
                      <TD className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(log.sent_at || log.created_at)}
                      </TD>
                      <TD>
                        {log.error_message && (
                          <div className="flex items-center gap-1 text-red-500 text-xs" title={log.error_message}>
                            <AlertCircle size={12} />
                            <span className="max-w-32 truncate">{log.error_message}</span>
                          </div>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
            <TablePagination page={page} pageSize={20} total={total} onPageChange={setPage} />
          </>
        )}
      </TableContainer>
    </div>
  )
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 skeleton rounded-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-20 skeleton rounded-xl" />)}
        </div>
        <div className="h-96 skeleton rounded-xl" />
      </div>
    }>
      <AnalyticsContent />
    </Suspense>
  )
}
