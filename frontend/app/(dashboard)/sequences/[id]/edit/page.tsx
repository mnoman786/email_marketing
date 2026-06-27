'use client'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { sequencesApi } from '@/lib/api'
import { Sequence } from '@/lib/types'
import { SequenceForm } from '@/components/sequences/sequence-form'
import { PageSkeleton } from '@/components/shared/loading-skeleton'

export default function EditSequencePage() {
  const { id } = useParams()

  const { data: sequence, isLoading } = useQuery({
    queryKey: ['sequence', id],
    queryFn: () => sequencesApi.get(Number(id)).then(r => r.data as Sequence),
    enabled: !!id,
  })

  if (isLoading) return <PageSkeleton />
  if (!sequence) return <div className="p-6">Sequence not found</div>

  return <SequenceForm sequence={sequence} />
}
