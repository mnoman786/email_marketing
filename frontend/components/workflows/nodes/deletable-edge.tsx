'use client'
import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react'
import { X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SHORTCUTS } from './shortcuts'

export interface DeletableEdgeData {
  onInsert?: (kind: string, actionType?: string) => void
  [key: string]: unknown
}

export function DeletableEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, label, markerEnd, data,
}: EdgeProps) {
  const { setEdges } = useReactFlow()
  const [showMenu, setShowMenu] = useState(false)
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const onInsert = (data as DeletableEdgeData | undefined)?.onInsert

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan relative flex items-center gap-1"
        >
          {label != null && (
            <span className={cn(
              'text-[11px] font-semibold px-1.5 py-0.5 rounded shadow-sm',
              label === 'Yes' ? 'text-green-700 bg-green-50' : label === 'No' ? 'text-red-700 bg-red-50' : 'text-muted-foreground bg-card border'
            )}>
              {label as string}
            </span>
          )}

          {onInsert && (
            <button
              type="button"
              onClick={() => setShowMenu(v => !v)}
              title="Insert a node on this connection"
              className="flex items-center justify-center w-4.5 h-4.5 rounded-full border bg-card text-muted-foreground shadow-sm hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
            >
              <Plus size={10} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setEdges(eds => eds.filter(e => e.id !== id))}
            title="Delete connection"
            className="flex items-center justify-center w-4.5 h-4.5 rounded-full border bg-card text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
          >
            <X size={10} />
          </button>

          {showMenu && onInsert && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 w-52 rounded-xl border bg-card shadow-lg p-1.5">
                {SHORTCUTS.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { onInsert(s.kind, s.actionType); setShowMenu(false) }}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-accent transition-colors text-left"
                  >
                    <s.icon size={13} className="text-muted-foreground shrink-0" />
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const EDGE_TYPES = { deletable: DeletableEdge }
