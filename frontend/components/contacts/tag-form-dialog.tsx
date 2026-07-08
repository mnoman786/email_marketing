'use client'
import { useEffect, useState } from 'react'
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
import toast from 'react-hot-toast'

export const TAG_COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'blue', 'purple', 'pink'] as const

export const TAG_COLOR_CLASSES: Record<string, string> = {
  gray: 'bg-muted text-muted-foreground',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
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
            <div className="mt-2 flex flex-wrap gap-2">
              {TAG_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue('color', c)}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition-transform',
                    TAG_COLOR_CLASSES[c].split(' ')[0],
                    color === c ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  title={c}
                />
              ))}
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
