'use client'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { templatesApi } from '@/lib/api'
import { TemplateEditor } from '@/components/templates/template-editor'
import { PageSkeleton } from '@/components/shared/loading-skeleton'

export default function EditTemplatePage() {
  const { id } = useParams()

  const { data, isLoading } = useQuery({
    queryKey: ['template', id],
    queryFn: () => templatesApi.get(Number(id)).then(r => r.data),
    enabled: !!id,
  })

  if (isLoading) return <PageSkeleton />
  if (!data) return <div className="p-6 text-muted-foreground">Template not found</div>

  return <TemplateEditor template={data} />
}
