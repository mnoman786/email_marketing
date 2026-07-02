'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { leadsApi, listsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Search, Download, Mail, Lock, ChevronLeft, ChevronRight, Plus, Loader2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

interface LeadPerson {
  id: string
  name: string
  first_name: string
  last_name: string
  title: string
  email: string | null
  email_status: string
  company: string
  industry: string
  city: string
  state: string
  country: string
  linkedin_url: string
  phone: string
}

export default function LeadFinderPage() {
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [page, setPage] = useState(1)
  const [searched, setSearched] = useState(false)
  const [searchParams, setSearchParams] = useState<any>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [revealingId, setRevealingId] = useState<string | null>(null)
  const [revealedEmails, setRevealedEmails] = useState<Record<string, string>>({})
  const [importListId, setImportListId] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  const { data: lists } = useQuery({
    queryKey: ['lists-all'],
    queryFn: () => listsApi.getAll({ page_size: 100 }).then(r => r.data.items || []),
  })

  const { data: results, isFetching, refetch } = useQuery({
    queryKey: ['lead-search', searchParams, page],
    queryFn: () =>
      leadsApi.search({ ...searchParams, page }).then(r => r.data as {
        people: LeadPerson[]
        total: number
        page: number
        per_page: number
      }),
    enabled: !!searchParams,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchParams({ query, title, company, location })
    setPage(1)
    setSearched(true)
    setSelected(new Set())
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const people = results?.people || []
    if (selected.size === people.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(people.map(p => p.id)))
    }
  }

  const handleReveal = async (person: LeadPerson) => {
    setRevealingId(person.id)
    try {
      const res = await leadsApi.reveal(person.id)
      if (res.data.email) {
        setRevealedEmails(prev => ({ ...prev, [person.id]: res.data.email }))
        toast.success('Email revealed')
      } else {
        toast.error('Email not available for this contact')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to reveal email')
    } finally {
      setRevealingId(null)
    }
  }

  const handleImport = async () => {
    const people = (results?.people || []).filter(p => selected.has(p.id))
    if (!people.length) return
    setImporting(true)
    try {
      const enriched = people.map(p => ({
        ...p,
        email: revealedEmails[p.id] || p.email,
      }))
      const res = await leadsApi.import({ people: enriched, list_id: importListId })
      const { created, updated, skipped } = res.data
      toast.success(`Imported: ${created} created, ${updated} updated, ${skipped} skipped`)
      setSelected(new Set())
      setShowImportModal(false)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const totalPages = results ? Math.ceil(results.total / results.per_page) : 0
  const people = results?.people || []

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lead Finder</h1>
        <p className="text-sm text-muted-foreground">Search Apollo.io's B2B database and import prospects into your contact lists</p>
      </div>

      {/* Search form */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Keyword / Name</Label>
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="e.g. John Smith"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Job Title</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. VP Engineering"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Company</Label>
              <Input
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="e.g. Stripe"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Location</Label>
              <Input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. San Francisco"
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
              <Button type="submit" loading={isFetching} className="gap-2">
                <Search size={15} /> Search
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {searched && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">
              {isFetching ? 'Searching…' : results ? `${results.total.toLocaleString()} results` : ''}
            </span>
            <div className="flex-1" />
            {selected.size > 0 && (
              <Button size="sm" onClick={() => setShowImportModal(true)} className="gap-1.5">
                <Download size={14} /> Import {selected.size} selected
              </Button>
            )}
          </div>

          {/* Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={people.length > 0 && selected.size === people.length}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Title</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {isFetching ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                        Searching…
                      </td>
                    </tr>
                  ) : people.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No results found. Try broadening your search filters.
                      </td>
                    </tr>
                  ) : (
                    people.map(person => {
                      const email = revealedEmails[person.id] || person.email
                      const hasEmail = !!email
                      const isLocked = !hasEmail

                      return (
                        <tr key={person.id} className={cn('border-b last:border-0 hover:bg-muted/30', selected.has(person.id) && 'bg-primary/5')}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(person.id)}
                              onChange={() => toggleSelect(person.id)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{person.name}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{person.title || '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground">{person.company || '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {[person.city, person.state, person.country].filter(Boolean).join(', ') || '—'}
                          </td>
                          <td className="px-4 py-3">
                            {hasEmail ? (
                              <span className="flex items-center gap-1 text-xs">
                                <Mail size={12} className="text-green-600 flex-none" />
                                {email}
                              </span>
                            ) : (
                              <button
                                onClick={() => handleReveal(person)}
                                disabled={revealingId === person.id}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                              >
                                {revealingId === person.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Lock size={12} />
                                )}
                                Reveal email
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {person.linkedin_url && (
                              <a href={person.linkedin_url} target="_blank" rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary">
                                <ExternalLink size={13} />
                              </a>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1 || isFetching}
                onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={15} />
              </Button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages || isFetching}
                onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={15} />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Import modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card className="w-full max-w-sm mx-4 shadow-xl">
            <CardHeader>
              <CardTitle className="text-base">Import {selected.size} Lead{selected.size !== 1 ? 's' : ''}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm">Add to contact list (optional)</Label>
                <select
                  value={importListId ?? ''}
                  onChange={e => setImportListId(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 w-full border rounded px-3 py-2 text-sm bg-background"
                >
                  <option value="">No list — contacts only</option>
                  {(lists || []).map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name} ({l.contact_count})</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Leads without a visible email address will be skipped. Reveal emails first to import them.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowImportModal(false)}>Cancel</Button>
                <Button size="sm" loading={importing} onClick={handleImport} className="gap-1.5">
                  <Plus size={14} /> Import
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
