'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { smtpApi } from '@/lib/api'
import { SMTPAccount } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TableContainer, TableScroll, Table, TableHead, TableBody, TableHeaderRow, TH, TR, TD } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatDateTime } from '@/lib/utils'
import {
  Plus, Server, Trash2, Edit, CheckCircle, XCircle, FlaskConical, AlertCircle, Flame, ShieldCheck
} from 'lucide-react'
import toast from 'react-hot-toast'
import { SMTPFormDialog } from '@/components/smtp/smtp-form-dialog'
import { SMTPTestDialog } from '@/components/smtp/smtp-test-dialog'
import { WarmupDialog } from '@/components/smtp/warmup-dialog'
import { DeliverabilityDialog } from '@/components/smtp/deliverability-dialog'

export default function SMTPPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editAccount, setEditAccount] = useState<SMTPAccount | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [testAccount, setTestAccount] = useState<SMTPAccount | null>(null)
  const [warmupAccount, setWarmupAccount] = useState<SMTPAccount | null>(null)
  const [deliverabilityAccount, setDeliverabilityAccount] = useState<SMTPAccount | null>(null)

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">SMTP Accounts</h1>
          <p className="text-sm text-muted-foreground">Connect the mailboxes you send from. Each campaign picks its own accounts, which rotate equally.</p>
        </div>
        <Button onClick={() => { setEditAccount(null); setShowForm(true) }}>
          <Plus size={16} /> Add SMTP Account
        </Button>
      </div>


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
        <TableContainer>
          <TableScroll>
            <Table>
              <TableHead>
                <TableHeaderRow>
                  <TH>Account</TH>
                  <TH>Host / Port</TH>
                  <TH>From Email</TH>
                  <TH>Security</TH>
                  <TH>Status</TH>
                  <TH>Last Test</TH>
                  <TH className="w-24" />
                </TableHeaderRow>
              </TableHead>
              <TableBody>
                {accounts.map((account: SMTPAccount) => (
                  <TR key={account.id}>
                    <TD>
                      <p className="font-medium">{account.name}</p>
                      <p className="text-xs text-muted-foreground">{account.username}</p>
                    </TD>
                    <TD className="font-mono text-xs whitespace-nowrap">
                      {account.host}:{account.port}
                    </TD>
                    <TD>
                      <div>
                        <p>{account.from_email}</p>
                        <p className="text-xs text-muted-foreground">{account.from_name}</p>
                      </div>
                    </TD>
                    <TD>
                      <Badge variant={account.security === 'ssl' ? 'success' : account.security === 'tls' ? 'info' : 'secondary'}>
                        {account.security.toUpperCase()}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge variant={account.is_active ? 'success' : 'secondary'}>
                        {account.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TD>
                    <TD>
                      {account.last_tested_at ? (
                        <div className="flex items-center gap-1.5">
                          {account.last_test_success ? (
                            <CheckCircle size={14} className="text-green-600" />
                          ) : (
                            <XCircle size={14} className="text-red-500" />
                          )}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(account.last_tested_at)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                          <AlertCircle size={13} className="text-amber-500" /> Not tested
                        </span>
                      )}
                    </TD>
                    <TD>
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
                          onClick={() => setWarmupAccount(account)}
                          title="Warmup"
                        >
                          <Flame size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeliverabilityAccount(account)}
                          title="Check SPF/DKIM/DMARC"
                        >
                          <ShieldCheck size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Edit account"
                          onClick={() => { setEditAccount(account); setShowForm(true) }}
                        >
                          <Edit size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Delete account"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(account.id)}
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
        </TableContainer>
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
      <WarmupDialog
        open={!!warmupAccount}
        onClose={() => setWarmupAccount(null)}
        account={warmupAccount}
      />
      <DeliverabilityDialog
        open={!!deliverabilityAccount}
        onClose={() => setDeliverabilityAccount(null)}
        account={deliverabilityAccount}
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
