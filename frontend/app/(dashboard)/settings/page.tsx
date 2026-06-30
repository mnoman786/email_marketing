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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrackingDomainsCard } from '@/components/settings/tracking-domains-card'
import { SessionsCard } from '@/components/settings/sessions-card'
import { User, Lock, Laptop, Globe, BadgeCheck, ShieldAlert, Building2, AtSign, Clock3, KeyRound, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
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

const tabs = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'security', label: 'Security', icon: Lock },
  { key: 'sessions', label: 'Sessions', icon: Laptop },
  { key: 'domains', label: 'Domains', icon: Globe },
] as const

type TabKey = typeof tabs[number]['key']

export default function SettingsPage() {
  const { user, updateUser } = useAuth()
  const [tab, setTab] = useState<TabKey>('profile')
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account, security and workspace preferences</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-start max-w-7xl">
        {/* Tab nav */}
        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible rounded-xl border bg-card p-2 shadow-sm">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0',
                tab === t.key
                  ? 'bg-gradient-to-r from-primary to-purple-600 text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </nav>

        {/* Panel */}
        <div className="space-y-6 min-w-0">
          {tab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><User size={16} className="text-primary" /> Profile Information</CardTitle>
                  <CardDescription>Update your personal details and how your name appears across the app</CardDescription>
                </CardHeader>
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
                      <Label className="flex items-center gap-1.5"><AtSign size={12} /> Email</Label>
                      <Input value={user?.email || ''} disabled className="mt-1 opacity-60" />
                      <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
                    </div>
                    <div>
                      <Label className="flex items-center gap-1.5"><Building2 size={12} /> Company Name</Label>
                      <Input {...profileForm.register('company_name')} className="mt-1" />
                    </div>
                    <div>
                      <Label className="flex items-center gap-1.5"><Clock3 size={12} /> Timezone</Label>
                      <Input {...profileForm.register('timezone')} placeholder="UTC" className="mt-1" />
                    </div>
                    <Button type="submit">Save Profile</Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><Sparkles size={15} className="text-primary" /> Account Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Username</span>
                    <span className="font-medium">{user?.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Member since</span>
                    <span className="font-medium">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Email status</span>
                    {user?.is_email_verified ? (
                      <Badge variant="success" className="gap-1"><BadgeCheck size={11} /> Verified</Badge>
                    ) : (
                      <Badge variant="warning" className="gap-1"><ShieldAlert size={11} /> Unverified</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {tab === 'security' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><KeyRound size={16} className="text-primary" /> Change Password</CardTitle>
                <CardDescription>Use a strong, unique password to keep your account secure</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={pwForm.handleSubmit(onChangePassword)} className="space-y-4 max-w-md">
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
          )}

          {tab === 'sessions' && <SessionsCard />}

          {tab === 'domains' && <TrackingDomainsCard />}
        </div>
      </div>
    </div>
  )
}
