'use client'
import '@xyflow/react/dist/style.css'
import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, Panel,
  type Node, type Edge, type Connection, type NodeTypes,
} from '@xyflow/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { workflowsApi } from '@/lib/api'
import { Workflow, ContactList, CampaignListItem } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  ArrowLeft, Save, Zap, GitBranch, ListPlus, ListMinus, Play, Square, Tag, Webhook, XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { NODE_TYPES } from './nodes/automation-nodes'
import { NodeEditDialog } from './node-edit-dialog'

const nodeTypes: NodeTypes = NODE_TYPES as any

let tempIdCounter = 0
const nextTempId = () => `new-${Date.now()}-${tempIdCounter++}`

const SHORTCUTS: { kind: 'trigger' | 'condition' | 'end' | 'action'; actionType?: string; label: string; icon: any }[] = [
  { kind: 'trigger', label: 'Trigger', icon: Zap },
  { kind: 'condition', label: 'Condition (If/Else)', icon: GitBranch },
  { kind: 'action', actionType: 'add_to_list', label: 'Add to List', icon: ListPlus },
  { kind: 'action', actionType: 'remove_from_list', label: 'Remove from List', icon: ListMinus },
  { kind: 'action', actionType: 'start_sequence', label: 'Start Sequence', icon: Play },
  { kind: 'action', actionType: 'stop_sequence', label: 'Stop Sequence', icon: Square },
  { kind: 'action', actionType: 'update_contact_status', label: 'Update Status', icon: Tag },
  { kind: 'action', actionType: 'webhook', label: 'Send Webhook', icon: Webhook },
  { kind: 'end', label: 'End Workflow', icon: XCircle },
]

function toRFNodes(workflow: Workflow, listsById: Record<number, string>, campaignsById: Record<number, string>): Node[] {
  return workflow.nodes.map(n => ({
    id: String(n.id),
    type: n.node_type,
    position: { x: n.position_x, y: n.position_y },
    data: { config: n.config, listsById, campaignsById },
  }))
}

function toRFEdges(workflow: Workflow): Edge[] {
  return workflow.edges.map(e => ({
    id: String(e.id),
    source: String(e.source_node),
    target: String(e.target_node),
    sourceHandle: e.label || undefined,
    label: e.label === 'yes' ? 'Yes' : e.label === 'no' ? 'No' : undefined,
    style: e.label === 'yes' ? { stroke: '#16a34a' } : e.label === 'no' ? { stroke: '#dc2626' } : undefined,
  }))
}

interface Props {
  workflow: Workflow
  lists: ContactList[]
  campaigns: CampaignListItem[]
}

function CanvasInner({ workflow, lists, campaigns }: Props) {
  const router = useRouter()
  const qc = useQueryClient()

  const listsById = useMemo(() => Object.fromEntries(lists.map(l => [l.id, l.name])), [lists])
  const campaignsById = useMemo(() => Object.fromEntries(campaigns.map(c => [c.id, c.name])), [campaigns])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(toRFNodes(workflow, listsById, campaignsById))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(toRFEdges(workflow))
  const [name, setName] = useState(workflow.name)
  const [isActive, setIsActive] = useState(workflow.is_active)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)

  const editingNode = nodes.find(n => n.id === editingNodeId) || null

  const onConnect = useCallback((connection: Connection) => {
    const isYes = connection.sourceHandle === 'yes'
    const isNo = connection.sourceHandle === 'no'
    setEdges(eds => addEdge({
      ...connection,
      label: isYes ? 'Yes' : isNo ? 'No' : undefined,
      style: isYes ? { stroke: '#16a34a' } : isNo ? { stroke: '#dc2626' } : undefined,
    }, eds))
  }, [setEdges])

  const addNode = (kind: string, actionType?: string) => {
    const id = nextTempId()
    const offset = nodes.length * 40
    const config = kind === 'action' ? { action_type: actionType } : {}
    setNodes(nds => [...nds, {
      id, type: kind, position: { x: 300 + (offset % 400), y: 80 + offset },
      data: { config, listsById, campaignsById },
    }])
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      await workflowsApi.update(workflow.id, { name, is_active: isActive })
      return workflowsApi.saveGraph(workflow.id, {
        nodes: nodes.map(n => ({
          client_id: n.id, node_type: n.type as string, config: (n.data as any).config || {},
          position_x: n.position.x, position_y: n.position.y,
        })),
        edges: edges.map(e => ({
          source_client_id: e.source, target_client_id: e.target,
          label: e.sourceHandle === 'yes' ? 'yes' : e.sourceHandle === 'no' ? 'no' : '',
        })),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      qc.invalidateQueries({ queryKey: ['workflow', workflow.id] })
      toast.success('Workflow saved')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save workflow'),
  })

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/workflows')}>
            <ArrowLeft size={16} />
          </Button>
          <Input value={name} onChange={e => setName(e.target.value)} className="w-64 font-medium" />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <span className="text-sm text-muted-foreground">{isActive ? 'Active' : 'Inactive'}</span>
          </div>
          <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending}>
            <Save size={15} /> Save
          </Button>
        </div>
      </div>

      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setEditingNodeId(node.id)}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable className="bg-card!" />
          <Panel position="top-right">
            <div className="rounded-xl border bg-card shadow-sm p-3 w-56 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Shortcuts</p>
              {SHORTCUTS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => addNode(s.kind, s.actionType)}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                >
                  <s.icon size={14} className="text-muted-foreground shrink-0" />
                  {s.label}
                </button>
              ))}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      <NodeEditDialog
        open={!!editingNode}
        onClose={() => setEditingNodeId(null)}
        nodeType={(editingNode?.type as any) || null}
        initialConfig={(editingNode?.data as any)?.config || {}}
        lists={lists}
        campaigns={campaigns}
        onSave={(config) => {
          setNodes(nds => nds.map(n => n.id === editingNodeId ? { ...n, data: { ...n.data, config } } : n))
        }}
        onDelete={() => {
          setNodes(nds => nds.filter(n => n.id !== editingNodeId))
          setEdges(eds => eds.filter(e => e.source !== editingNodeId && e.target !== editingNodeId))
        }}
      />
    </div>
  )
}

export function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}
