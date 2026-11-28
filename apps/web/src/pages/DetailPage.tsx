import type { CreatedDocument, DocumentDetail, ExtractedValueView, ReviewView } from '@lomi/contracts'
import { Accordion, Alert, Badge, Button, Group, Select, Stack, Table, Text, Textarea, TextInput, Title } from '@mantine/core'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { attentionRank, canApprove, fieldLabel, reviewColor, statusColor, typeLabel } from '../format'
import { PdfUpload, type UploadGate } from '../pdf-upload'
import { usePoll } from '../use-poll'

export function DetailPage() {
  const params = useParams()
  const id = params.id
  const [selection, setSelection] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [gate, setGate] = useState<UploadGate>({ uploading: false, open: false })
  const locked = busy || gate.uploading
  const path = !id ? '' : selection == null ? `/api/documents/${id}` : `/api/documents/${id}/versions/${selection}`
  const { data: detail, error: loadError, refresh } = usePoll(
    () => api<DocumentDetail>(path),
    (next) => next.version.status === 'queued' || next.version.status === 'extracting',
    [path],
    path !== '',
    'Failed to load document',
  )
  const pageError = actionError ?? loadError

  if (!id) return <Text>Missing document.</Text>

  async function retry() {
    if (locked) return
    setBusy(true)
    setActionError(null)
    try {
      const created = await api<CreatedDocument>(`/api/documents/${id}/retry`, { method: 'POST' })
      setSelection(created.versionNumber)
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Retry failed')
    } finally {
      setBusy(false)
    }
  }

  async function uploadVersion(file: File) {
    const body = new FormData()
    body.set('file', file)
    const created = await api<CreatedDocument>(`/api/documents/${id}/versions`, { method: 'POST', body })
    setSelection(created.versionNumber)
    refresh()
  }

  const values = [...(detail?.version.values ?? [])].sort((a, b) => attentionRank(a) - attentionRank(b))

  return (
    <Stack>
      <Text component={Link} to="/" size="sm">
        Back to documents
      </Text>
      {pageError ? <Alert color="red">{pageError}</Alert> : null}
      {!detail ? (
        <Text c="dimmed">Loading…</Text>
      ) : (
        <>
          <Group justify="space-between" align="flex-end">
            <div>
              <Title order={2}>{detail.title}</Title>
              <Text c="dimmed">{typeLabel(detail.type)}</Text>
            </div>
            <Group>
              <Select
                label="Version"
                data={detail.versionNumbers.map((number) => ({
                  value: String(number),
                  label: number === detail.currentVersionNumber ? `v${number} · current` : `v${number}`,
                }))}
                value={String(detail.version.number)}
                onChange={(value) => {
                  if (!value) return
                  setSelection(Number(value))
                }}
                allowDeselect={false}
                w={180}
              />
              <Badge color={statusColor(detail.version.status)} size="lg">
                {detail.version.status}
              </Badge>
            </Group>
          </Group>
          {detail.version.error ? <Alert color="red">{detail.version.error}</Alert> : null}
          {detail.version.status === 'failed' && detail.version.number === detail.currentVersionNumber ? (
            <Button onClick={() => void retry()} loading={busy} disabled={locked} w="fit-content">
              Retry extraction
            </Button>
          ) : null}
          {(detail.version.status === 'queued' || detail.version.status === 'extracting') && (
            <Text c="dimmed">Extraction is in progress. This page refreshes every 2 seconds.</Text>
          )}
          <Table.ScrollContainer minWidth={860}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Field</Table.Th>
                  <Table.Th>Value</Table.Th>
                  <Table.Th>Evidence</Table.Th>
                  <Table.Th>Review</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {values.map((value) => (
                  <FieldRow key={value.id} value={value} onChanged={() => refresh()} />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {values.length === 0 ? <Text c="dimmed">No extracted values yet.</Text> : null}
          <Accordion variant="contained">
            <Accordion.Item value="text">
              <Accordion.Control>Parsed text</Accordion.Control>
              <Accordion.Panel>
                <Text style={{ whiteSpace: 'pre-wrap' }}>{detail.version.parsedText || 'No parsed text yet.'}</Text>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          <PdfUpload
            busy={busy}
            label="Upload version"
            confirmLabel="Upload version"
            onUpload={uploadVersion}
            onGate={setGate}
          />
        </>
      )}
    </Stack>
  )
}

function FieldRow({ value, onChanged }: { value: ExtractedValueView; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [corrected, setCorrected] = useState('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<'approve' | 'correct' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const standing = value.latestReview?.action === 'correct' ? value.latestReview.value : null
  const quiet = value.reviewState === 'carried_over'
  const allowApprove = canApprove(value)

  async function approve() {
    if (!allowApprove || pending) return
    setPending('approve')
    setError(null)
    try {
      await api(`/api/values/${value.id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setPending(null)
    }
  }

  function cancel() {
    setOpen(false)
    setCorrected('')
    setNote('')
    setError(null)
  }

  async function correct() {
    if (!corrected.trim()) {
      setError('Enter a corrected value')
      return
    }
    if (pending) return
    setPending('correct')
    setError(null)
    const payload: { action: 'correct'; value: string; note?: string } = {
      action: 'correct',
      value: corrected.trim(),
    }
    if (note.trim()) payload.note = note.trim()
    try {
      await api(`/api/values/${value.id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setOpen(false)
      setCorrected('')
      setNote('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Correction failed')
    } finally {
      setPending(null)
    }
  }

  return (
    <Table.Tr style={{ opacity: quiet ? 0.65 : 1, background: value.reviewState === 'pending' ? 'var(--mantine-color-yellow-0)' : undefined }}>
      <Table.Td>
        <Text fw={600}>{fieldLabel(value.fieldKey)}</Text>
        <Badge color={reviewColor(value.reviewState)} variant="light" mt={4}>
          {value.reviewState.replace('_', ' ')}
        </Badge>
      </Table.Td>
      <Table.Td>
        {standing ? (
          <Stack gap={4}>
            <Text fw={700}>{standing}</Text>
            <Text size="sm" c="dimmed">
              Extracted: {value.value ?? `Gap — ${value.gapReason ?? 'unknown'}`}
            </Text>
            {value.latestReview?.note ? <Text size="sm">{value.latestReview.note}</Text> : null}
          </Stack>
        ) : value.value ? (
          <Text>{value.value}</Text>
        ) : (
          <Text c="red">Gap — {value.gapReason}</Text>
        )}
        {value.previous ? <PreviousLine previous={value.previous} review={value.previous.latestReview} /> : null}
      </Table.Td>
      <Table.Td>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {value.evidence ?? '—'}
        </Text>
      </Table.Td>
      <Table.Td>
        <Stack gap="xs">
          {value.value !== null ? (
            <Button
              size="xs"
              variant={allowApprove ? 'filled' : 'default'}
              color={allowApprove ? 'blue' : 'gray'}
              disabled={!allowApprove || pending !== null}
              loading={pending === 'approve'}
              onClick={() => void approve()}
            >
              Approve
            </Button>
          ) : null}
          <Button size="xs" variant="default" onClick={() => setOpen((current) => !current)} disabled={pending !== null}>
            Correct
          </Button>
          {open ? (
            <>
              <TextInput
                label="Corrected value"
                value={corrected}
                onChange={(event) => setCorrected(event.currentTarget.value)}
              />
              <Textarea
                label="Note"
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
                minRows={2}
              />
              <Group gap="xs">
                <Button size="xs" onClick={() => void correct()} loading={pending === 'correct'} disabled={pending !== null}>
                  Save correction
                </Button>
                <Button size="xs" variant="default" onClick={cancel} disabled={pending !== null}>
                  Cancel
                </Button>
              </Group>
            </>
          ) : null}
          {error ? (
            <Text size="sm" c="red">
              {error}
            </Text>
          ) : null}
        </Stack>
      </Table.Td>
    </Table.Tr>
  )
}

function PreviousLine({
  previous,
  review,
}: {
  previous: NonNullable<ExtractedValueView['previous']>
  review: ReviewView | null
}) {
  const shown = review?.action === 'correct' ? review.value : (previous.value ?? previous.gapReason)
  return (
    <Text size="sm" c="dimmed" mt={6}>
      Previous: {shown ?? '—'}
      {review ? ` · ${review.action}${review.note ? ` (${review.note})` : ''}` : ' · no review'}
    </Text>
  )
}
