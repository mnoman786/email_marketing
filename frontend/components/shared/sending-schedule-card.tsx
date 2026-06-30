'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Clock } from 'lucide-react'

const DAYS = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
]

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Karachi', 'Asia/Kolkata',
  'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
]

export interface SendingSchedule {
  schedule_enabled: boolean
  schedule_days: number[]
  schedule_start_time: string
  schedule_end_time: string
  schedule_timezone: string
}

interface Props {
  value: SendingSchedule
  onChange: (patch: Partial<SendingSchedule>) => void
}

export function SendingScheduleCard({ value, onChange }: Props) {
  const toggleDay = (day: number) => {
    onChange({
      schedule_days: value.schedule_days.includes(day)
        ? value.schedule_days.filter(d => d !== day)
        : [...value.schedule_days, day].sort(),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2"><Clock size={14} /> Sending Schedule</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Restrict to business hours</Label>
            <p className="text-xs text-muted-foreground">
              Only send within the days/hours below — sending in the middle of the night looks like a bot and hurts deliverability.
            </p>
          </div>
          <Switch checked={value.schedule_enabled} onCheckedChange={v => onChange({ schedule_enabled: v })} />
        </div>

        {value.schedule_enabled && (
          <div className="space-y-4 pt-1">
            <div>
              <Label className="text-xs">Days</Label>
              <div className="flex gap-1.5 mt-1.5">
                {DAYS.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      value.schedule_days.includes(d.value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start time</Label>
                <input
                  type="time"
                  value={value.schedule_start_time}
                  onChange={e => onChange({ schedule_start_time: e.target.value })}
                  className="w-full h-9 px-3 mt-1 rounded-lg border border-input bg-background text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">End time</Label>
                <input
                  type="time"
                  value={value.schedule_end_time}
                  onChange={e => onChange({ schedule_end_time: e.target.value })}
                  className="w-full h-9 px-3 mt-1 rounded-lg border border-input bg-background text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Timezone</Label>
              <select
                value={value.schedule_timezone}
                onChange={e => onChange({ schedule_timezone: e.target.value })}
                className="w-full h-9 px-3 mt-1 rounded-lg border border-input bg-background text-sm"
              >
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
