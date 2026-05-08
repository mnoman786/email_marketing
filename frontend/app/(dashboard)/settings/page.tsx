'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/components/providers/auth-provider'
import { authApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import toast from 'react-hot-toast'

const profileSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  company_name: z.string().optional(),
  timezone: z.string().optional(),
})

const pwSchema = z.object({
  old_password: z.string().min(1, 'Required'),
  new_password: z.string().min(8, 'At least 8 characters'),
})

type ProfileForm = z.infer<typeof profileSchema>
type PwForm = z.infer<typeof pwSchema>

export default function SettingsPage() {
  const { user, updateUser } = useAuth()
  const [pwLoading, setPwLoading] = useState(false)

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      company_name: user?.company_name || '',
      timezone: user?.timezone || 'UTC',
    },
  })

  const pwForm = useForm<PwForm>({ resolver: zodResolver(pwSchema) })

  const onUpdateProfile = async (data: ProfileForm) => {
    await updateUser(data)
  }

  const onChangePassword = async (data: PwForm) => {
    setPwLoading(true)
    try {
      await authApi.changePassword(data)
      toast.success('Password changed')
      pwForm.reset()
    } catch (err: any) {
      toast.error(err.response?.data?.old_password?.[0] || 'Failed to change password')
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account preferences</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader><CardTitle>Profile Information</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onUpdateProfile)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <Input {...profileForm.register('first_name')} className="mt-1" />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input {...profileForm.register('last_name')} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled className="mt-1 opacity-60" />
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
            </div>
            <div>
              <Label>Company Name</Label>
              <Input {...profileForm.register('company_name')} className="mt-1" />
            </div>
            <div>
              <Label>Timezone</Label>
              <Input {...profileForm.register('timezone')} placeholder="UTC" className="mt-1" />
            </div>
            <Button type="submit">Save Profile</Button>
          </form>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={pwForm.handleSubmit(onChangePassword)} className="space-y-4">
            <div>
              <Label>Current Password</Label>
              <Input {...pwForm.register('old_password')} type="password" className="mt-1" />
              {pwForm.formState.errors.old_password && (
                <p className="text-xs text-destructive mt-1">{pwForm.formState.errors.old_password.message}</p>
              )}
            </div>
            <div>
              <Label>New Password</Label>
              <Input {...pwForm.register('new_password')} type="password" className="mt-1" />
              {pwForm.formState.errors.new_password && (
                <p className="text-xs text-destructive mt-1">{pwForm.formState.errors.new_password.message}</p>
              )}
            </div>
            <Button type="submit" loading={pwLoading}>Change Password</Button>
          </form>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader><CardTitle>Account Info</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Username</span>
            <span className="font-medium">{user?.username}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Member since</span>
            <span className="font-medium">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
