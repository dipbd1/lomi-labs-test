import type { CreatedDocument, DocumentDetail, ExtractedValueView, ReviewView } from '@lomi/contracts'
import {
  Accordion,
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { attentionRank, fieldLabel, reviewColor, statusColor, typeLabel } from '../format'

export function DetailPage() {
  const params = useParams()
  const id = params.id
  const [selection, setSelection] = useState<number | null>(null)
  const [detail, setDetail] = useState<DocumentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const path = !id ? '' : selection == null ? `/api/documents/${id}` : `/api/documents/${id}/versions/${selection}`

  useEffect(() => {
    if (!path) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const next = await api<DocumentDetail>(path)
        if (stop) return
        setDetail(next)
        setError(null)
        if (next.version.status === 'queued' || next.version.status === 'extracting') {
          timer = setTimeout(() => void tick(), 2000)
        }
      } catch (err) {
        if (stop) return
        setError(err instanceof Error ? err.message : 'Failed to load document')
      }
    }
    void tick()
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
  }, [path, nonce])

  if (!id) return <Text>Missing document.</Text>

  async function uploadVersion() {
    if (!id || !file) return
    setBusy(true)
    setError(null)
    const body = new FormData()
    body.set('file', file)
    try {
      const created = await api<CreatedDocument>(`/api/documents/${id}/versions`, { method: 'POST', body })
      setFile(null)
      setSelection(created.versionNumber)
      setNonce((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function retry() {
    if (!id) return
    setBusy(true)
    setError(null)
    try {
      const created = await api<CreatedDocument>(`/api/documents/${id}/retry`, { method: 'POST' })
      setSelection(created.versionNumber)
      setNonce((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed')
    } finally {
      setBusy(false)
    }
  }

  const values = [...(detail?.version.values ?? [])].sort((a, b) => attentionRank(a) - attentionRank(b))

  return (
    <Stack>
      <Text component={Link} to="/" size="sm">
        Back to documents
      </Text>
      {error ? <Alert color="red">{error}</Alert> : null}
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
            <Button onClick={() => void retry()} loading={busy} w="fit-content">
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
                  <FieldRow key={value.id} value={value} onChanged={() => setNonce((current) => current + 1)} />
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
          <Group align="flex-end">
            <FileInput
              label="New version"
              placeholder="Revised PDF"
              accept="application/pdf,.pdf"
              value={file}
              onChange={setFile}
              style={{ flex: 1 }}
            />
            <Button onClick={() => void uploadVersion()} loading={busy} disabled={!file}>
              Upload version
            </Button>
          </Group>
        </>
      )}
    </Stack>
  )
}

function FieldRow({ value, onChanged }: { value: ExtractedValueView; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [corrected, setCorrected] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const standing = value.latestReview?.action === 'correct' ? value.latestReview.value : null
  const quiet = value.reviewState === 'carried_over'

  async function approve() {
    setBusy(true)
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
      setBusy(false)
    }
  }

  async function correct() {
    if (!corrected.trim()) {
      setError('Enter a corrected value')
      return
    }
    setBusy(true)
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
      setBusy(false)
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
            <Button size="xs" variant="light" onClick={() => void approve()} loading={busy}>
              Approve
            </Button>
          ) : null}
          <Button size="xs" variant="default" onClick={() => setOpen((current) => !current)}>
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
              <Button size="xs" onClick={() => void correct()} loading={busy}>
                Save correction
              </Button>
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
