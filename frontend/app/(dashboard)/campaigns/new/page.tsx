'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CampaignForm } from '@/components/campaigns/campaign-form'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Megaphone, ArrowRight } from 'lucide-react'

export default function NewCampaignPage() {
  const router = useRouter()
  // Instantly-style: name the campaign first in a modal, then open the editor.
  const [name, setName] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  if (confirmed) {
    return <CampaignForm initialName={name.trim()} />
  }

  const submit = () => {
    if (!name.trim()) return
    setConfirmed(true)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) router.push('/campaigns') }}>
      <DialogContent className="max-w-md">
        <div className="flex flex-col items-center text-center pt-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
            <Megaphone size={22} />
          </div>
          <h2 className="text-lg font-semibold">Let’s create a new campaign</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Give your campaign a name to get started — you can change it any time.
          </p>
        </div>

        <div className="mt-4 space-y-2 text-left">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Campaign name
          </label>
          <Input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="e.g. Cold Outreach — Q3 SaaS Founders"
            className="h-11"
          />
        </div>

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => router.push('/campaigns')}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()}>
            Continue <ArrowRight size={15} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
