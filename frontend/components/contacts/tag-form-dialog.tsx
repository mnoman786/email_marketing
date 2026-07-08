'use client'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { tagsApi } from '@/lib/api'
import { Tag } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Check, Pipette } from 'lucide-react'
import toast from 'react-hot-toast'

// Matches the app's existing badge-* variants in globals.css (see StatusBadge)
// instead of inventing separate ad-hoc colors — same tested contrast/dark-mode
// handling everywhere else in the app already relies on. Custom hex colors
// (from the color picker below) are handled separately via getTagBadgeProps.
export const TAG_COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'blue', 'purple'] as const

export const TAG_COLOR_CLASSES: Record<string, string> = {
  gray: 'badge-gray',
  red: 'badge-red',
  orange: 'badge-orange',
  amber: 'badge-amber',
  green: 'badge-green',
  blue: 'badge-blue',
  purple: 'badge-purple',
}

// Solid swatch fill for the color-picker dots below — these aren't badges (no
// text to contrast against), so a plain solid Tailwind color works fine here.
const TAG_SWATCH_CLASSES: Record<string, string> = {
  gray: 'bg-slate-400',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
}

const HEX_RE = /^#[0-9a-f]{6}$/i

export function isCustomColor(color: string): boolean {
  return HEX_RE.test(color)
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** className + inline style for rendering a tag badge, given tag.color — use
 * this everywhere a tag renders (Tags page, contact picker, Leads list)
 * instead of looking up TAG_COLOR_CLASSES directly, so custom hex colors from
 * the picker below render correctly too. */
export function getTagBadgeProps(color: string): { className: string; style?: React.CSSProperties } {
  if (TAG_COLOR_CLASSES[color]) {
    return { className: cn('badge', TAG_COLOR_CLASSES[color]) }
  }
  if (isCustomColor(color)) {
    return {
      className: 'badge',
      style: {
        backgroundColor: hexToRgba(color, 0.15),
        color,
        border: `1px solid ${hexToRgba(color, 0.4)}`,
      },
    }
  }
  return { className: cn('badge', TAG_COLOR_CLASSES.gray) }
}

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  color: z.string(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  tag: Tag | null
  onSaved: () => void
}

export function TagFormDialog({ open, onClose, tag, onSaved }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  const color = watch('color') || 'gray'
  const isCustom = isCustomColor(color)
  const colorInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (tag) reset({ name: tag.name, color: tag.color })
    else reset({ name: '', color: 'gray' })
  }, [tag, open, reset])

  const mutation = useMutation({
    mutationFn: (data: FormData) => tag ? tagsApi.update(tag.id, data) : tagsApi.create(data),
    onSuccess: () => {
      toast.success(tag ? 'Tag updated' : 'Tag created')
      onSaved()
    },
    onError: (err: any) => toast.error(err.response?.data?.name?.[0] || 'Failed to save tag'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tag ? 'Edit Tag' : 'New Tag'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <div>
            <Label>Tag Name *</Label>
            <Input {...register('name')} placeholder="e.g. Interested" className="mt-1" />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <Label>Color</Label>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              {TAG_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue('color', c)}
                  className={cn(
                    'relative w-9 h-9 rounded-full flex items-center justify-center transition-all',
                    TAG_SWATCH_CLASSES[c],
                    color === c
                      ? 'ring-2 ring-offset-2 ring-foreground scale-110 shadow-md'
                      : 'opacity-60 hover:opacity-100'
                  )}
                  title={c}
                >
                  {color === c && <Check size={16} className="text-white drop-shadow" strokeWidth={3} />}
                </button>
              ))}

              {/* Custom color — click opens the native color picker; the swatch
                  itself shows the current custom color once one's picked. */}
              <button
                type="button"
                onClick={() => colorInputRef.current?.click()}
                title="Custom color"
                style={isCustom ? { backgroundColor: color } : undefined}
                className={cn(
                  'relative w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0',
                  !isCustom && 'bg-[conic-gradient(from_0deg,red,orange,yellow,green,blue,purple,red)]',
                  isCustom
                    ? 'ring-2 ring-offset-2 ring-foreground scale-110 shadow-md'
                    : 'opacity-70 hover:opacity-100'
                )}
              >
                {isCustom ? (
                  <Check size={16} className="text-white drop-shadow" strokeWidth={3} />
                ) : (
                  <Pipette size={14} className="text-white drop-shadow" />
                )}
              </button>
              <input
                ref={colorInputRef}
                type="color"
                value={isCustom ? color : '#6366f1'}
                onChange={e => setValue('color', e.target.value)}
                className="sr-only"
                tabIndex={-1}
              />

              {isCustom && (
                <Input
                  value={color}
                  onChange={e => setValue('color', e.target.value)}
                  placeholder="#6366f1"
                  className="h-9 w-28 text-xs font-mono"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>{tag ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
