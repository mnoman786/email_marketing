'use client'
import '@xyflow/react/dist/style.css'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, Panel,
  type Node, type Edge, type Connection, type NodeTypes, type EdgeTypes,
} from '@xyflow/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { workflowsApi, tagsApi } from '@/lib/api'
import { Workflow, ContactList, CampaignListItem, Tag as TagType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { NODE_TYPES } from './nodes/automation-nodes'
import { EDGE_TYPES } from './nodes/deletable-edge'
import { SHORTCUTS } from './nodes/shortcuts'
import { NodeEditDialog } from './node-edit-dialog'

const nodeTypes: NodeTypes = NODE_TYPES as any
const edgeTypes: EdgeTypes = EDGE_TYPES as any

let tempIdCounter = 0
const nextTempId = () => `new-${Date.now()}-${tempIdCounter++}`

function toRFNodes(
  workflow: Workflow, listsById: Record<number, string>, campaignsById: Record<number, string>, tagsById: Record<number, string>
): Node[] {
  return workflow.nodes.map(n => ({
    id: String(n.id),
    type: n.node_type,
    position: { x: n.position_x, y: n.position_y },
    data: { config: n.config, listsById, campaignsById, tagsById },
  }))
}

function toRFEdges(workflow: Workflow): Edge[] {
  return workflow.edges.map(e => ({
    id: String(e.id),
    source: String(e.source_node),
    target: String(e.target_node),
    sourceHandle: e.label || undefined,
    targetHandle: 'input',
    type: 'deletable',
    label: e.label === 'yes' ? 'Yes' : e.label === 'no' ? 'No' : undefined,
    style: e.label === 'yes' ? { stroke: '#16a34a' } : e.label === 'no' ? { stroke: '#dc2626' } : undefined,
  }))
}

interface Props {
  workflow: Workflow
  lists: ContactList[]
  campaigns: CampaignListItem[]
  tags: TagType[]
}

function CanvasInner({ workflow, lists, campaigns, tags }: Props) {
  const router = useRouter()
  const qc = useQueryClient()

  const listsById = useMemo(() => Object.fromEntries(lists.map(l => [l.id, l.name])), [lists])
  const campaignsById = useMemo(() => Object.fromEntries(campaigns.map(c => [c.id, c.name])), [campaigns])
  const tagsById = useMemo(() => Object.fromEntries(tags.map(t => [t.id, t.name])), [tags])

  // Stable trampoline: edges call insertNodeOnEdgeRef.current(...) at click time,
  // so an edge created on mount still reaches the *current* insertNodeOnEdge
  // closure (with up-to-date nodes/edges) instead of the one from creation time.
  const insertNodeOnEdgeRef = useRef<(edgeId: string, kind: string, actionType?: string) => void>(() => {})
  const withInsertHandler = useCallback((edge: Edge): Edge => ({
    ...edge,
    data: { ...edge.data, onInsert: (kind: string, actionType?: string) => insertNodeOnEdgeRef.current(edge.id, kind, actionType) },
  }), [])

  // Same "latest ref" trampoline for the node delete button (X in the corner
  // of every node card) — see deleteNode below.
  const deleteNodeRef = useRef<(nodeId: string) => void>(() => {})
  const withDeleteHandler = useCallback((node: Node): Node => ({
    ...node,
    data: { ...node.data, onDelete: () => deleteNodeRef.current(node.id) },
  }), [])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    toRFNodes(workflow, listsById, campaignsById, tagsById).map(withDeleteHandler)
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(toRFEdges(workflow).map(withInsertHandler))
  const [name, setName] = useState(workflow.name)
  const [isActive, setIsActive] = useState(workflow.is_active)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)

  const editingNode = nodes.find(n => n.id === editingNodeId) || null

  const onConnect = useCallback((connection: Connection) => {
    const isYes = connection.sourceHandle === 'yes'
    const isNo = connection.sourceHandle === 'no'
    const edgeId = nextTempId()
    setEdges(eds => addEdge(withInsertHandler({
      ...connection,
      id: edgeId,
      type: 'deletable',
      label: isYes ? 'Yes' : isNo ? 'No' : undefined,
      style: isYes ? { stroke: '#16a34a' } : isNo ? { stroke: '#dc2626' } : undefined,
    } as Edge), eds))
  }, [setEdges, withInsertHandler])

  const addNode = (kind: string, actionType?: string) => {
    const id = nextTempId()
    const offset = nodes.length * 40
    const config = kind === 'action' ? { action_type: actionType } : {}
    setNodes(nds => [...nds, withDeleteHandler({
      id, type: kind, position: { x: 300 + (offset % 400), y: 80 + offset },
      data: { config, listsById, campaignsById, tagsById },
    })])
  }

  // Removes a node and any edges attached to it — used by both the node's own
  // corner X button and the "Delete Node" button inside its edit dialog.
  const deleteNode = useCallback((nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId))
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
    setEditingNodeId(current => (current === nodeId ? null : current))
  }, [setNodes, setEdges])

  deleteNodeRef.current = deleteNode

  // Splits an existing edge in two around a freshly-created node: source -> new
  // node -> old target. A newly inserted 'action' node passes straight through
  // (single output handle); 'condition'/'end' nodes don't get an auto-generated
  // continuation edge since they either need an explicit Yes/No choice or have
  // no outgoing handle at all — the user wires those up manually.
  //
  // Reads `edges`/`nodes` directly (not the setState-updater form) and calls
  // setNodes/setEdges exactly once each, at the top level — never nested inside
  // one another. Strict Mode double-invokes updater *functions* to check they're
  // pure, and a setNodes call nested inside a setEdges updater is a side effect
  // that genuinely re-fires on that second invocation, which duplicated the node.
  const insertNodeOnEdge = useCallback((edgeId: string, kind: string, actionType?: string) => {
    const edge = edges.find(e => e.id === edgeId)
    if (!edge) return

    const newNodeId = nextTempId()
    const config = kind === 'action' ? { action_type: actionType } : {}
    const sourceNode = nodes.find(n => n.id === edge.source)
    const targetNode = nodes.find(n => n.id === edge.target)
    const midX = sourceNode && targetNode ? (sourceNode.position.x + targetNode.position.x) / 2 : 300
    const midY = sourceNode && targetNode ? (sourceNode.position.y + targetNode.position.y) / 2 : 200

    setNodes(nds => [...nds, withDeleteHandler({
      id: newNodeId, type: kind, position: { x: midX, y: midY }, data: { config, listsById, campaignsById, tagsById },
    })])

    const firstHalf = withInsertHandler({
      ...edge, id: nextTempId(), target: newNodeId, targetHandle: 'input',
    })
    const rest = edges.filter(e => e.id !== edgeId)
    if (kind !== 'action') {
      setEdges([...rest, firstHalf])
      return
    }

    const secondHalf = withInsertHandler({
      id: nextTempId(), source: newNodeId, sourceHandle: 'output',
      target: edge.target, targetHandle: edge.targetHandle, type: 'deletable',
    } as Edge)
    setEdges([...rest, firstHalf, secondHalf])
  }, [edges, nodes, setEdges, setNodes, withInsertHandler, withDeleteHandler, listsById, campaignsById, tagsById])

  insertNodeOnEdgeRef.current = insertNodeOnEdge

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

  const handleCreateTag = useCallback(async (name: string) => {
    const res = await tagsApi.create({ name })
    qc.invalidateQueries({ queryKey: ['tags-all'] })
    return res.data as TagType
  }, [qc])

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* React Flow renders edge labels (our +/X buttons + insert menu) in a
          layer that sits below the nodes layer in the DOM with no z-index of
          its own, so a nearby node always paints over it. Documented React
          Flow quirk — bumping this above the (implicit, unset) nodes z-index
          fixes it globally for this canvas. */}
      <style>{`.react-flow__edgelabel-renderer { z-index: 1000; }`}</style>
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
          edgeTypes={edgeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable className="bg-card!" />
          <Panel position="top-right" className="mr-2 mt-2">
            <div className="rounded-xl border bg-card shadow-sm p-3 w-60 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Shortcuts</p>
              <p className="text-[11px] text-muted-foreground mb-2">
                Click to drop a node on the canvas, then drag from the dot on one node to another to connect them.
              </p>
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
        tags={tags}
        onCreateTag={handleCreateTag}
        onSave={(config) => {
          setNodes(nds => nds.map(n => n.id === editingNodeId ? { ...n, data: { ...n.data, config } } : n))
        }}
        onDelete={() => editingNodeId && deleteNode(editingNodeId)}
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
