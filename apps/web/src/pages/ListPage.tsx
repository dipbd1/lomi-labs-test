import type { ClearedDocuments, DocumentListItem, DocumentType } from '@lomi/contracts'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { formatBytes, isPdfFile, statusColor, typeLabel } from '../format'

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
  const [documents, setDocuments] = useState<DocumentListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [type, setType] = useState<DocumentType>('invoice')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [nonce, setNonce] = useState(0)
  const picker = useRef<HTMLInputElement>(null)

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

  async function remove(document: DocumentListItem) {
    if (busy) return
    if (!window.confirm(`Delete ${document.title} and its stored PDFs?`)) return
    setBusy(true)
    setError(null)
    try {
      await api<ClearedDocuments>(`/api/documents/${document.id}`, { method: 'DELETE' })
      setNonce((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  function askClear() {
    if (busy || uploading || file) return
    setConfirmClear(true)
  }

  async function clearData() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await api<ClearedDocuments>('/api/documents', { method: 'DELETE' })
      setNonce((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setBusy(false)
      setConfirmClear(false)
    }
  }

  function openPicker() {
    if (busy || uploading || file) return
    picker.current?.click()
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const next = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!next) return
    if (!isPdfFile(next)) {
      setError('Choose a PDF')
      return
    }
    setError(null)
    setUploadError(null)
    setType('invoice')
    setFile(next)
  }

  function closeUpload() {
    if (uploading) return
    setFile(null)
    setUploadError(null)
    setType('invoice')
  }

  async function upload() {
    if (!file || uploading || busy) return
    setUploading(true)
    setUploadError(null)
    const body = new FormData()
    body.set('file', file)
    body.set('type', type)
    try {
      await api('/api/documents', { method: 'POST', body })
      setFile(null)
      setUploadError(null)
      setType('invoice')
      setNonce((value) => value + 1)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2} mb={0}>
          Documents
        </Title>
        <Button color="red" variant="light" onClick={askClear} loading={busy} disabled={uploading || file !== null}>
          Clear data
        </Button>
      </Group>
      <Button onClick={openPicker} disabled={busy || uploading || file !== null} w="fit-content">
        Upload
      </Button>
      <input
        ref={picker}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPick}
      />
      <Modal
        opened={file !== null}
        onClose={closeUpload}
        title={file?.name}
        size="sm"
        closeOnClickOutside={!uploading}
        closeOnEscape={!uploading}
        withCloseButton={!uploading}
      >
        {file ? (
          <Stack>
            <Text size="sm" c="dimmed">
              {formatBytes(file.size)}
            </Text>
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
            {uploadError ? <Alert color="red">{uploadError}</Alert> : null}
            <Group justify="flex-end">
              <Button variant="default" onClick={closeUpload} disabled={uploading}>
                Cancel
              </Button>
              <Button onClick={() => void upload()} loading={uploading}>
                Add document
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
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
      {error ? <Alert color="red">{error}</Alert> : null}
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
                      <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${document.title}`}>
                        ⋮
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item color="red" onClick={() => void remove(document)}>
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
