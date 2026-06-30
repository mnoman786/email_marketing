'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { trackingDomainsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, XCircle, Trash2, RefreshCw, Star, Plus, Globe, Copy } from 'lucide-react'
import toast from 'react-hot-toast'

interface TrackingDomain {
  id: number
  domain: string
  is_verified: boolean
  is_primary: boolean
  verified_at: string | null
  last_checked_at: string | null
  cname_target: string
}

export function TrackingDomainsCard() {
  const qc = useQueryClient()
  const [newDomain, setNewDomain] = useState('')

  const { data: domains } = useQuery({
    queryKey: ['tracking-domains'],
    queryFn: () => trackingDomainsApi.getAll().then(r => r.data as TrackingDomain[]),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tracking-domains'] })

  const addMut = useMutation({
    mutationFn: () => trackingDomainsApi.create(newDomain.trim()),
    onSuccess: () => { setNewDomain(''); invalidate(); toast.success('Domain added — add the CNAME, then verify') },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not add domain'),
  })

  const verifyMut = useMutation({
    mutationFn: (id: number) => trackingDomainsApi.verify(id),
    onSuccess: () => { invalidate(); toast.success('Domain verified!') },
    onError: (e: any) => { invalidate(); toast.error(e.response?.data?.detail || 'Verification failed') },
  })

  const primaryMut = useMutation({
    mutationFn: (id: number) => trackingDomainsApi.setPrimary(id),
    onSuccess: () => { invalidate(); toast.success('Primary domain updated') },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => trackingDomainsApi.delete(id),
    onSuccess: () => { invalidate(); toast.success('Domain removed') },
  })

  const target = domains?.[0]?.cname_target || 'your-app-host'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe size={18} /> Custom Tracking Domains
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Send open &amp; click tracking links from your own domain instead of the shared one — this
          isolates your sending reputation and improves deliverability. Add a subdomain like{' '}
          <code className="px-1 rounded bg-muted">track.yourcompany.com</code>, point a{' '}
          <strong>CNAME</strong> at <code className="px-1 rounded bg-muted">{target}</code>, then verify.
        </p>

        <div className="flex gap-2">
          <Input
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            placeholder="track.yourcompany.com"
            onKeyDown={e => { if (e.key === 'Enter' && newDomain.trim()) addMut.mutate() }}
          />
          <Button onClick={() => addMut.mutate()} loading={addMut.isPending} disabled={!newDomain.trim()}>
            <Plus size={15} /> Add
          </Button>
        </div>

        <div className="space-y-2">
          {domains?.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No tracking domains yet — sends use the shared domain.</p>
          )}
          {domains?.map(d => (
            <div key={d.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{d.domain}</span>
                  {d.is_primary && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">PRIMARY</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                  {d.is_verified ? (
                    <><CheckCircle2 size={12} className="text-green-600" /><span className="text-green-600">Verified</span></>
                  ) : (
                    <><XCircle size={12} className="text-amber-500" /><span className="text-amber-600">Not verified — add CNAME → {d.cname_target}</span></>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon-sm" title="Re-check DNS"
                  onClick={() => verifyMut.mutate(d.id)} disabled={verifyMut.isPending}>
                  <RefreshCw size={14} className={verifyMut.isPending ? 'animate-spin' : ''} />
                </Button>
                {d.is_verified && !d.is_primary && (
                  <Button variant="ghost" size="icon-sm" title="Make primary" onClick={() => primaryMut.mutate(d.id)}>
                    <Star size={14} />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive"
                  title="Remove" onClick={() => deleteMut.mutate(d.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {domains && domains.length > 0 && (
          <button
            onClick={() => { navigator.clipboard.writeText(target); toast.success('CNAME target copied') }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Copy size={12} /> Copy CNAME target ({target})
          </button>
        )}
      </CardContent>
    </Card>
  )
}
