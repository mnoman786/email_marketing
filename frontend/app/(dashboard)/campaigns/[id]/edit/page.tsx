'use client'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { campaignsApi } from '@/lib/api'
import { Campaign } from '@/lib/types'
import { CampaignForm } from '@/components/campaigns/campaign-form'
import { PageSkeleton } from '@/components/shared/loading-skeleton'

export default function EditCampaignPage() {
  const { id } = useParams()
  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignsApi.get(Number(id)).then(r => r.data as Campaign),
    enabled: !!id,
  })
  if (isLoading) return <PageSkeleton />
  if (!campaign) return <div className="p-6">Campaign not found</div>
  return <CampaignForm campaign={campaign} />
}
