import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { formatBytes, isPdfFile } from './format'

export type UploadGate = {
  uploading: boolean
  open: boolean
}

export function PdfUpload({
  busy,
  label,
  confirmLabel,
  onUpload,
  onClose,
  onGate,
  children,
}: {
  busy: boolean
  label: string
  confirmLabel: string
  onUpload: (file: File) => Promise<void>
  onClose?: () => void
  onGate: (gate: UploadGate) => void
  children?: (uploading: boolean) => ReactNode
}) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const open = file !== null

  useEffect(() => {
    onGate({ uploading, open })
  }, [onGate, open, uploading])

  function openPicker() {
    if (busy || uploading || open) return
    picker.current?.click()
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const next = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!next) return
    if (!isPdfFile(next)) {
      setPickError('Choose a PDF')
      return
    }
    setPickError(null)
    setUploadError(null)
    setFile(next)
  }

  function closeUpload() {
    if (uploading) return
    setFile(null)
    setUploadError(null)
    onClose?.()
  }

  async function upload() {
    if (!file || uploading || busy) return
    setUploading(true)
    setUploadError(null)
    try {
      await onUpload(file)
      setFile(null)
      setUploadError(null)
      setPickError(null)
      onClose?.()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <Button onClick={openPicker} disabled={busy || uploading || open} w="fit-content">
        {label}
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
      {pickError ? <Alert color="red">{pickError}</Alert> : null}
      <Modal
        opened={open}
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
            {children?.(uploading)}
            {uploadError ? <Alert color="red">{uploadError}</Alert> : null}
            <Group justify="flex-end">
              <Button variant="default" onClick={closeUpload} disabled={uploading}>
                Cancel
              </Button>
              <Button onClick={() => void upload()} loading={uploading}>
                {confirmLabel}
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </>
  )
}
