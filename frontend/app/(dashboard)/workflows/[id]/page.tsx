'use client'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { workflowsApi, listsApi, campaignsApi } from '@/lib/api'
import { Workflow, ContactList, CampaignListItem, PaginatedResponse } from '@/lib/types'
import { WorkflowCanvas } from '@/components/workflows/workflow-canvas'

export default function WorkflowBuilderPage() {
  const params = useParams()
  const id = Number(params.id)

  const { data: workflow, isLoading: loadingWorkflow } = useQuery({
    queryKey: ['workflow', id],
    queryFn: () => workflowsApi.get(id).then(r => r.data as Workflow),
  })
  const { data: lists } = useQuery({
    queryKey: ['contact-lists-all'],
    queryFn: () => listsApi.getAll().then(r => r.data as ContactList[] | PaginatedResponse<ContactList>),
  })
  const { data: campaigns } = useQuery({
    queryKey: ['campaigns-all'],
    queryFn: () => campaignsApi.getAll({ page: 1 }).then(r => r.data as PaginatedResponse<CampaignListItem>),
  })

  if (loadingWorkflow || !workflow) {
    return <div className="p-6 text-sm text-muted-foreground">Loading workflow...</div>
  }

  const listItems = Array.isArray(lists) ? lists : lists?.items || []
  const campaignItems = campaigns?.items || []

  return (
    <WorkflowCanvas key={workflow.id} workflow={workflow} lists={listItems} campaigns={campaignItems} />
  )
}
