'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import { UserSession } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/lib/utils'
import { Laptop, MapPin, LogOut, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'

export function SessionsCard() {
  const qc = useQueryClient()

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['active-sessions'],
    queryFn: () => authApi.sessions().then(r => r.data as UserSession[]),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['active-sessions'] })

  const revokeMut = useMutation({
    mutationFn: (id: number) => authApi.revokeSession(id),
    onSuccess: () => { invalidate(); toast.success('Session signed out') },
    onError: () => toast.error('Failed to revoke session'),
  })

  const revokeOthersMut = useMutation({
    mutationFn: () => authApi.revokeOtherSessions(),
    onSuccess: () => { invalidate(); toast.success('Signed out of all other devices') },
    onError: () => toast.error('Failed to revoke other sessions'),
  })

  const otherCount = (sessions || []).filter(s => !s.is_current).length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Laptop size={18} /> Active Sessions
        </CardTitle>
        {otherCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => revokeOthersMut.mutate()}
            loading={revokeOthersMut.isPending}
          >
            <LogOut size={14} /> Log out other devices
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Loading…' : `${sessions?.length || 0} device${sessions?.length === 1 ? '' : 's'} currently signed in.`}
        </p>

        <div className="space-y-2">
          {sessions?.map(s => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{s.device}</span>
                  {s.is_current && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                      <ShieldCheck size={10} /> THIS DEVICE
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  {s.ip_address && (
                    <span className="flex items-center gap-1"><MapPin size={11} />{s.ip_address}</span>
                  )}
                  <span>Active {formatDateTime(s.last_active_at)}</span>
                </div>
              </div>
              {!s.is_current && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive shrink-0"
                  title="Sign out this device"
                  onClick={() => revokeMut.mutate(s.id)}
                  disabled={revokeMut.isPending}
                >
                  <LogOut size={14} />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
