import type { ClearedDocuments, DocumentListItem, DocumentType } from '@lomi/contracts'
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { statusColor, typeLabel } from '../format'

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
  const [documents, setDocuments] = useState<DocumentListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [type, setType] = useState<DocumentType | null>('invoice')
  const [busy, setBusy] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const next = await api<DocumentListItem[]>('/api/documents')
        if (stop) return
        setDocuments(next)
        setError(null)
        if (next.some((document) => document.status === 'queued' || document.status === 'extracting')) {
          timer = setTimeout(() => void tick(), 2000)
        }
      } catch (err) {
        if (stop) return
        setError(err instanceof Error ? err.message : 'Failed to load documents')
      }
    }
    void tick()
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
  }, [nonce])

  async function clearData() {
    if (busy) return
    if (!window.confirm('Delete every document, review, and stored PDF?')) return
    setBusy(true)
    setError(null)
    try {
      await api<ClearedDocuments>('/api/documents', { method: 'DELETE' })
      setNonce((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setBusy(false)
    }
  }

  async function upload() {
    if (!file || !type) {
      setError('Choose a PDF and a document type')
      return
    }
    setBusy(true)
    setError(null)
    const body = new FormData()
    body.set('file', file)
    body.set('type', type)
    try {
      await api('/api/documents', { method: 'POST', body })
      setFile(null)
      setNonce((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack>
      <Title order={2}>Documents</Title>
      <Paper withBorder p="md">
        <Group align="flex-end">
          <FileInput
            label="PDF"
            placeholder="Choose a file"
            accept="application/pdf,.pdf"
            value={file}
            onChange={setFile}
            style={{ flex: 1 }}
          />
          <Select
            label="Type"
            data={typeOptions}
            value={type}
            onChange={(value) => {
              if (isDocumentType(value)) setType(value)
            }}
            allowDeselect={false}
            w={200}
          />
          <Button onClick={() => void upload()} loading={busy}>
            Upload
          </Button>
          <Button color="red" variant="light" onClick={() => void clearData()} loading={busy}>
            Clear data
          </Button>
        </Group>
      </Paper>
      {error ? <Alert color="red">{error}</Alert> : null}
      <Table.ScrollContainer minWidth={720}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Document</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Review</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {documents.map((document) => (
              <Table.Tr key={document.id}>
                <Table.Td>
                  <AnchorTitle document={document} />
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
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {documents.length === 0 ? <Text c="dimmed">No documents yet.</Text> : null}
    </Stack>
  )
}

function AnchorTitle({ document }: { document: DocumentListItem }) {
  return (
    <Text component={Link} to={`/documents/${document.id}`} fw={600}>
      {document.title}
    </Text>
  )
}
