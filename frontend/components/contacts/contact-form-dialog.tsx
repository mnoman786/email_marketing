'use client'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { contactsApi, listsApi } from '@/lib/api'
import { Contact } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

const schema = z.object({
  email: z.string().email('Invalid email'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  list_ids: z.array(z.number()).optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  contact: Contact | null
  onSaved: () => void
}

export function ContactFormDialog({ open, onClose, contact, onSaved }: Props) {
  const { data: listsData } = useQuery({
    queryKey: ['lists-all'],
    queryFn: () => listsApi.getAll({ page_size: 100 }).then(r => r.data.items || []),
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const selectedLists = watch('list_ids') || []

  useEffect(() => {
    if (contact) {
      reset({
        email: contact.email,
        first_name: contact.first_name,
        last_name: contact.last_name,
        phone: contact.phone,
        company: contact.company,
        list_ids: contact.list_ids,
      })
    } else {
      reset({ email: '', first_name: '', last_name: '', phone: '', company: '', list_ids: [] })
    }
  }, [contact, reset])

  const mutation = useMutation({
    mutationFn: (data: FormData) => contact
      ? contactsApi.update(contact.id, data)
      : contactsApi.create(data),
    onSuccess: () => {
      toast.success(contact ? 'Lead updated' : 'Lead created')
      onSaved()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.email?.[0] || err.response?.data?.detail || 'Failed to save'
      toast.error(msg)
    },
  })

  const toggleList = (id: number) => {
    const current = selectedLists
    setValue('list_ids', current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{contact ? 'Edit Lead' : 'Add Lead'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <div>
            <Label>Email *</Label>
            <Input {...register('email')} placeholder="contact@example.com" className="mt-1" />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First Name</Label>
              <Input {...register('first_name')} placeholder="John" className="mt-1" />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input {...register('last_name')} placeholder="Doe" className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input {...register('phone')} placeholder="+1 234 567 890" className="mt-1" />
            </div>
            <div>
              <Label>Company</Label>
              <Input {...register('company')} placeholder="Acme Inc." className="mt-1" />
            </div>
          </div>

          {listsData && listsData.length > 0 && (
            <div>
              <Label>Assign to Lists</Label>
              <div className="mt-2 grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                {listsData.map((list: any) => (
                  <label key={list.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedLists.includes(list.id)}
                      onChange={() => toggleList(list.id)}
                      className="rounded"
                    />
                    {list.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>
              {contact ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
