'use client'
import 'grapesjs/dist/css/grapes.min.css'
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import type { Editor } from 'grapesjs'

export interface GrapesEditorHandle {
  exportHtml: () => string
  getProjectData: () => object
  loadHtml: (html: string) => void
}

interface Props {
  projectData?: object | null
  initialHtml?: string | null
  minHeight?: string
}

function parseEmailHtml(raw: string): { bodyHtml: string; css: string } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')
  const css = Array.from(doc.querySelectorAll('style'))
    .map(s => s.textContent ?? '')
    .join('\n')
    .trim()
  return { bodyHtml: doc.body.innerHTML, css }
}

function applyHtml(editor: Editor, raw: string) {
  const { bodyHtml, css } = parseEmailHtml(raw)

  // Clear canvas then inject via wrapper so GrapesJS doesn't re-parse through
  // newsletter component types (which strip gradient/shadow inline styles).
  editor.DomComponents.clear()
  editor.CssComposer.clear()

  const wrapper = editor.getWrapper()
  if (wrapper) {
    wrapper.components(bodyHtml)
  } else {
    editor.setComponents(bodyHtml)
  }

  if (css) editor.setStyle(css)
}

// After the newsletter preset registers its component types, widen their
// stylable list so inline styles (gradients, shadows, etc.) are preserved.
function unlockComponentStyles(editor: Editor) {
  const TYPES = ['cell', 'row', 'table', 'text', 'link', 'image', 'button', 'default']
  TYPES.forEach(type => {
    try {
      editor.DomComponents.addType(type, {
        model: {
          defaults: { stylable: true },
        },
      })
    } catch {
      // type may not exist in this preset version — ignore
    }
  })
}

export const GrapesEmailEditor = forwardRef<GrapesEditorHandle, Props>(
  ({ projectData, initialHtml, minHeight = 'calc(100vh - 130px)' }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const editorRef = useRef<Editor | null>(null)
    const pendingHtmlRef = useRef<string | null>(null)

    useImperativeHandle(ref, () => ({
      exportHtml: () => {
        const e = editorRef.current
        if (!e) return ''
        const html = e.getHtml()
        const css = e.getCss({ avoidProtected: true })
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<style>${css}</style>
</head>
<body style="margin:0;padding:0;">${html}</body>
</html>`
      },
      getProjectData: () => editorRef.current?.getProjectData() ?? {},
      loadHtml: (raw: string) => {
        if (editorRef.current) {
          applyHtml(editorRef.current, raw)
        } else {
          pendingHtmlRef.current = raw
        }
      },
    }))

    useEffect(() => {
      if (!containerRef.current || editorRef.current) return
      let alive = true

      ;(async () => {
        const grapesjs = (await import('grapesjs')).default
        const newsletter = (await import('grapesjs-preset-newsletter')).default

        if (!alive || !containerRef.current) return

        const editor = grapesjs.init({
          container: containerRef.current,
          height: '100%',
          width: 'auto',
          storageManager: false,
          undoManager: { trackSelection: false },
          // Keep inline styles exactly as authored — don't convert to classes
          avoidInlineStyle: false,
          forceClass: false,
          plugins: [newsletter],
          pluginsOpts: { [newsletter as any]: {} },
          canvas: {
            styles: [
              'body { margin:0; padding:20px; background:#f4f4f4; font-family:Arial,sans-serif; }',
              'table { border-collapse:collapse; }',
            ],
          },
        })

        // Widen style restrictions imposed by the newsletter preset
        unlockComponentStyles(editor)

        // Apply pending import, restore saved project, or load raw HTML
        if (pendingHtmlRef.current) {
          applyHtml(editor, pendingHtmlRef.current)
          pendingHtmlRef.current = null
        } else if (projectData) {
          editor.loadProjectData(
            projectData as Parameters<typeof editor.loadProjectData>[0]
          )
        } else if (initialHtml) {
          applyHtml(editor, initialHtml)
        }

        editorRef.current = editor
      })()

      return () => {
        alive = false
        if (editorRef.current) {
          editorRef.current.destroy()
          editorRef.current = null
        }
      }
    }, [])

    return (
      <div
        ref={containerRef}
        style={{ height: '100%', minHeight }}
        className="grapes-wrapper"
      />
    )
  }
)

GrapesEmailEditor.displayName = 'GrapesEmailEditor'
