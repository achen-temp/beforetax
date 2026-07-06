'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface ClientRow {
  id: string
  name: string
  email: string
  phone: string | null
  created_at: string
  last_accessed_at: string | null
}

export function ClientsPanel() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadClients() {
    const res = await fetch('/api/clients')
    const data = await res.json()
    if (res.ok) setClients(data.clients ?? [])
  }

  useEffect(() => {
    loadClients()
  }, [])

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phone || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add client')

      setName('')
      setEmail('')
      setPhone('')

      if (data.devOtp) {
        setMessage(
          `Client added. Dev mode — OTP: ${data.devOtp}. Portal: ${data.portalUrl}`
        )
      } else {
        setMessage(`Invitation sent to ${data.client.email}`)
      }

      await loadClients()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add client')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend(clientId: string) {
    setSendingId(clientId)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch(`/api/clients/${clientId}/send-otp`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send OTP')

      if (data.devOtp) {
        setMessage(`Dev mode — new OTP: ${data.devOtp}. Portal: ${data.portalUrl}`)
      } else {
        setMessage('New access code sent to client.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send OTP')
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a client to send a secure OTP email for document upload.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add client</CardTitle>
          <CardDescription>
            An OTP email is sent automatically when you add a client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddClient} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-emerald-600">{message}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Client name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding…' : 'Add client & send OTP'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client list</CardTitle>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clients yet.</p>
          ) : (
            <ul className="divide-y">
              {clients.map((client) => (
                <li key={client.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium">{client.name}</p>
                    <p className="text-sm text-muted-foreground">{client.email}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sendingId === client.id}
                    onClick={() => handleResend(client.id)}
                  >
                    {sendingId === client.id ? 'Sending…' : 'Resend OTP'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
