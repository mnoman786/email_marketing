'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { smtpApi } from '@/lib/api'
import { SMTPAccount } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatDateTime } from '@/lib/utils'
import {
  Plus, Server, Trash2, Edit, CheckCircle, XCircle, FlaskConical, AlertCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { SMTPFormDialog } from '@/components/smtp/smtp-form-dialog'
import { SMTPTestDialog } from '@/components/smtp/smtp-test-dialog'

export default function SMTPPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editAccount, setEditAccount] = useState<SMTPAccount | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [testAccount, setTestAccount] = useState<SMTPAccount | null>(null)

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['smtp-accounts'],
    queryFn: () => smtpApi.getAll().then(r => r.data.items || []),
  })

  const { data: stats } = useQuery({
    queryKey: ['smtp-stats'],
    queryFn: () => smtpApi.stats().then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => smtpApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['smtp-accounts'] })
      qc.invalidateQueries({ queryKey: ['smtp-stats'] })
      toast.success('SMTP account deleted')
      setDeleteId(null)
    },
  })

  const totalWeight = stats?.reduce((sum: number, s: any) => sum + (s.is_active ? s.weight : 0), 0) || 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">SMTP Accounts</h1>
          <p className="text-sm text-muted-foreground">Configure sending servers with probability-based routing</p>
        </div>
        <Button onClick={() => { setEditAccount(null); setShowForm(true) }}>
          <Plus size={16} /> Add SMTP Account
        </Button>
      </div>

      {/* Probability routing overview */}
      {stats && stats.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Server size={15} />
            Probability Routing Distribution
          </h3>
          <div className="space-y-3">
            {stats.filter((s: any) => s.is_active).map((account: any) => {
              const prob = totalWeight > 0 ? (account.weight / totalWeight * 100).toFixed(1) : 0
              return (
                <div key={account.id} className="flex items-center gap-3">
                  <div className="w-36 text-sm truncate font-medium">{account.name}</div>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${prob}%` }}
                    />
                  </div>
                  <div className="w-20 text-right text-sm text-muted-foreground">
                    {prob}% (w:{account.weight})
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : !accounts?.length ? (
        <EmptyState
          icon={Server}
          title="No SMTP accounts configured"
          description="Add SMTP accounts to start sending campaigns. Configure multiple accounts for load distribution."
          action={{ label: 'Add SMTP Account', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Account</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Host / Port</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">From Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Security</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Weight</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Test</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((account: SMTPAccount) => (
                <tr key={account.id} className="table-row-hover">
                  <td className="px-4 py-3">
                    <p className="font-medium">{account.name}</p>
                    <p className="text-xs text-muted-foreground">{account.username}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {account.host}:{account.port}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p>{account.from_email}</p>
                      <p className="text-xs text-muted-foreground">{account.from_name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={account.security === 'ssl' ? 'success' : account.security === 'tls' ? 'info' : 'secondary'}>
                      {account.security.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="font-medium">{account.weight}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={account.is_active ? 'success' : 'secondary'}>
                      {account.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {account.last_tested_at ? (
                      <div className="flex items-center gap-1.5">
                        {account.last_test_success ? (
                          <CheckCircle size={14} className="text-green-600" />
                        ) : (
                          <XCircle size={14} className="text-red-500" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(account.last_tested_at)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <AlertCircle size={13} className="text-amber-500" /> Not tested
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setTestAccount(account)}
                        title="Test connection"
                      >
                        <FlaskConical size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => { setEditAccount(account); setShowForm(true) }}
                      >
                        <Edit size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(account.id)}
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
      )}

      <SMTPFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        account={editAccount}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['smtp-accounts'] })
          qc.invalidateQueries({ queryKey: ['smtp-stats'] })
          setShowForm(false)
        }}
      />
      <SMTPTestDialog
        open={!!testAccount}
        onClose={() => setTestAccount(null)}
        account={testAccount}
        onTested={() => {
          qc.invalidateQueries({ queryKey: ['smtp-accounts'] })
          qc.invalidateQueries({ queryKey: ['smtp-stats'] })
        }}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete SMTP Account"
        description="This SMTP account will be removed permanently."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
