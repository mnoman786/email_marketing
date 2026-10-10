'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { smtpApi } from '@/lib/api'
import { SMTPAccount } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TableContainer, TableScroll, Table, TableHead, TableBody, TableHeaderRow, TH, TR, TD } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import {
  Plus, Server, Trash2, Edit, FlaskConical, Flame, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'
import { SMTPFormDialog } from '@/components/smtp/smtp-form-dialog'
import { SMTPTestDialog } from '@/components/smtp/smtp-test-dialog'
import { WarmupDialog } from '@/components/smtp/warmup-dialog'
import { AddSendingAccountDialog } from '@/components/smtp/add-sending-account-dialog'
import { useMailboxOAuthPopup } from '@/components/smtp/use-mailbox-oauth-popup'

export default function SMTPPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [showAddOptions, setShowAddOptions] = useState(false)
  const [editAccount, setEditAccount] = useState<SMTPAccount | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [testAccount, setTestAccount] = useState<SMTPAccount | null>(null)
  const [warmupAccount, setWarmupAccount] = useState<SMTPAccount | null>(null)

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['smtp-accounts'],
    queryFn: () => smtpApi.getAll().then(r => r.data.items || []),
  })

  const { start: startOAuth, pendingProvider } = useMailboxOAuthPopup(() => setShowAddOptions(false))

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
          <h1 className="text-2xl font-bold">Email Accounts</h1>
          <p className="text-sm text-muted-foreground">Connect the mailboxes you send from. Each campaign picks its own accounts, which rotate equally.</p>
        </div>
        {!!accounts?.length && <Button onClick={() => setShowAddOptions(true)}><Plus size={16} /> Add new</Button>}
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : !accounts?.length ? (
        <EmptyState
          icon={Server}
          title="No email accounts yet"
          description="Connect a mailbox to start sending campaigns."
          action={{ label: 'Add new', onClick: () => setShowAddOptions(true) }}
        />
      ) : (
        <TableContainer>
          <TableScroll>
            <Table>
              <TableHead>
                <TableHeaderRow>
                  <TH>Account</TH>
                  <TH>SMTP</TH>
                  <TH>From Email</TH>
                  <TH>Status</TH>
                  <TH className="w-24" />
                </TableHeaderRow>
              </TableHead>
              <TableBody>
                {accounts.map((account: SMTPAccount) => (
                  <TR key={account.id}>
                    <TD>
                      <p className="font-medium">{account.name}</p>
                      {account.oauth_provider && <p className="text-xs text-muted-foreground mt-1">{account.oauth_provider === 'google' ? 'Google' : 'Microsoft'} · OAuth</p>}
                    </TD>
                    <TD className="font-mono text-xs whitespace-nowrap">
                      {account.host || 'Connected mailbox'}
                    </TD>
                    <TD>
                      <div>
                        <p>{account.from_email}</p>
                        <p className="text-xs text-muted-foreground">{account.from_name}</p>
                      </div>
                    </TD>
                    <TD>
                      <Badge variant={account.oauth_reconnect_required ? 'warning' : account.bounce_protection_disabled ? 'warning' : account.is_active ? 'success' : 'secondary'}>
                        {account.oauth_reconnect_required ? 'Reconnect required' : account.bounce_protection_disabled ? 'Bounce protection' : account.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex gap-1">
                        {account.oauth_provider && (
                          <Button variant="ghost" size="icon-sm" title="Reconnect mailbox"
                            disabled={!!pendingProvider}
                            onClick={() => account.oauth_provider && startOAuth(account.oauth_provider, account.id)}>
                            <RefreshCw size={14} />
                          </Button>
                        )}
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

      <AddSendingAccountDialog
        open={showAddOptions}
        onClose={() => setShowAddOptions(false)}
        onProvider={provider => { void startOAuth(provider) }}
        onManual={() => { setShowAddOptions(false); setEditAccount(null); setShowForm(true) }}
        pendingProvider={pendingProvider}
      />
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
