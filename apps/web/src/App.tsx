import { Anchor, AppShell, Container, Group, Text } from '@mantine/core'
import { Link, Route, Routes } from 'react-router-dom'
import { DetailPage } from './pages/DetailPage'
import { ListPage } from './pages/ListPage'

export function App() {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Anchor component={Link} to="/" fw={700} c="black" underline="never">
            Lomi Labs
          </Anchor>
          <Text size="sm" c="dimmed">
            Document review
          </Text>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="lg">
          <Routes>
            <Route path="/" element={<ListPage />} />
            <Route path="/documents/:id" element={<DetailPage />} />
          </Routes>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
