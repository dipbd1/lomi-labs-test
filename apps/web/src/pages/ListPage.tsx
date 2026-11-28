import type { ClearedDocuments, DocumentListItem, DocumentType } from '@lomi/contracts'
import { ActionIcon, Alert, Badge, Button, Group, Menu, Modal, Select, Stack, Table, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { statusColor, typeLabel } from '../format'
import { PdfUpload, type UploadGate } from '../pdf-upload'
import { usePoll } from '../use-poll'

const typeOptions = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'lease', label: 'Lease' },
  { value: 'market_report', label: 'Market report' },
]

function isDocumentType(value: string | null): value is DocumentType {
  switch (value) {
    case 'invoice':
    case 'lease':
    case 'market_report':
      return true
    default:
      return false
  }
}

export function ListPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<DocumentType>('invoice')
  const [busy, setBusy] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [gate, setGate] = useState<UploadGate>({ uploading: false, open: false })
  const locked = busy || gate.uploading
  const { data, error: loadError, refresh } = usePoll(
    () => api<DocumentListItem[]>('/api/documents'),
    (next) => next.some((document) => document.status === 'queued' || document.status === 'extracting'),
    [],
    true,
    'Failed to load documents',
  )
  const documents = data ?? []
  const pageError = error ?? loadError

  async function remove(document: DocumentListItem) {
    if (locked) return
    if (!window.confirm(`Delete ${document.title} and its stored PDFs?`)) return
    setBusy(true)
    setError(null)
    try {
      await api<ClearedDocuments>(`/api/documents/${document.id}`, { method: 'DELETE' })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  function askClear() {
    if (locked || gate.open) return
    setConfirmClear(true)
  }

  async function clearData() {
    if (locked) return
    setBusy(true)
    setError(null)
    try {
      await api<ClearedDocuments>('/api/documents', { method: 'DELETE' })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setBusy(false)
      setConfirmClear(false)
    }
  }

  async function uploadDocument(file: File) {
    const body = new FormData()
    body.set('file', file)
    body.set('type', type)
    await api('/api/documents', { method: 'POST', body })
    refresh()
  }

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2} mb={0}>
          Documents
        </Title>
        <Button color="red" variant="light" onClick={askClear} loading={busy} disabled={locked || gate.open}>
          Clear data
        </Button>
      </Group>
      <PdfUpload
        busy={busy}
        label="Upload"
        confirmLabel="Add document"
        onUpload={uploadDocument}
        onClose={() => setType('invoice')}
        onGate={setGate}
      >
        {(uploading) => (
          <Select
            label="Type"
            data={typeOptions}
            value={type}
            onChange={(value) => {
              if (isDocumentType(value)) setType(value)
            }}
            allowDeselect={false}
            disabled={uploading}
          />
        )}
      </PdfUpload>
      <Modal
        opened={confirmClear}
        onClose={() => {
          if (busy) return
          setConfirmClear(false)
        }}
        title="Clear data"
        size="sm"
      >
        <Stack>
          <Text>Delete every document, review, and stored PDF?</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmClear(false)} disabled={busy}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void clearData()} loading={busy}>
              Delete all
            </Button>
          </Group>
        </Stack>
      </Modal>
      {pageError ? <Alert color="red">{pageError}</Alert> : null}
      <Table.ScrollContainer minWidth={720}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Document</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Review</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {documents.map((document) => (
              <Table.Tr
                key={document.id}
                tabIndex={0}
                aria-label={`Open ${document.title}`}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/documents/${document.id}`)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  navigate(`/documents/${document.id}`)
                }}
              >
                <Table.Td>
                  <Text fw={600}>{document.title}</Text>
                  <Text size="sm" c="dimmed">
                    {typeLabel(document.type)} · v{document.currentVersionNumber}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={statusColor(document.status)}>{document.status}</Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={document.progress.pending > 0 ? 700 : 400} c={document.progress.pending > 0 ? 'orange' : undefined}>
                    {document.progress.pending} pending
                  </Text>
                  <Text size="xs" c="dimmed">
                    {document.progress.approved} approved · {document.progress.corrected} corrected · {document.progress.carriedOver} carried over
                  </Text>
                </Table.Td>
                <Table.Td onClick={(event) => event.stopPropagation()}>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${document.title}`} disabled={locked}>
                        ⋮
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item color="red" disabled={locked} onClick={() => void remove(document)}>
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {documents.length === 0 ? <Text c="dimmed">No documents yet.</Text> : null}
    </Stack>
  )
}
