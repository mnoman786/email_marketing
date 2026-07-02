'use client'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { listsApi } from '@/lib/api'
import { ContactList } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  list: ContactList | null
  onSaved: () => void
}

export function ListFormDialog({ open, onClose, list, onSaved }: Props) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (list) {
      reset({ name: list.name, description: list.description })
    } else {
      reset({ name: '', description: '' })
    }
  }, [list, reset])

  const mutation = useMutation({
    mutationFn: (data: FormData) => list
      ? listsApi.update(list.id, data)
      : listsApi.create(data),
    onSuccess: () => {
      toast.success(list ? 'List updated' : 'List created')
      onSaved()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.name?.[0] || 'Failed to save list')
    },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{list ? 'Edit List' : 'Create Lead List'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <div>
            <Label>List Name *</Label>
            <Input {...register('name')} placeholder="Newsletter Subscribers" className="mt-1" />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              {...register('description')}
              placeholder="Brief description of this list..."
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>
              {list ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
