import assert from 'node:assert/strict'
import test from 'node:test'
import { holdForApi } from './hold-for-api.mjs'

test('returns as soon as the health check succeeds', async () => {
  let slept = 0
  await holdForApi('http://127.0.0.1:3000/health', {
    now: () => 0,
    sleep: async (ms) => {
      slept += ms
    },
    fetch: async () => ({ ok: true }),
  })
  assert.equal(slept, 0)
})

test('retries while the API is refusing connections', async () => {
  let clock = 0
  let calls = 0
  await holdForApi('http://127.0.0.1:3000/health', {
    timeoutMs: 1_000,
    intervalMs: 200,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    },
    fetch: async () => {
      calls += 1
      if (calls < 3) throw new Error('connect ECONNREFUSED')
      return { ok: true }
    },
  })
  assert.equal(calls, 3)
  assert.equal(clock, 400)
})

test('gives up when the API never starts', async () => {
  let clock = 0
  let calls = 0
  await holdForApi('http://127.0.0.1:3000/health', {
    timeoutMs: 500,
    intervalMs: 200,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    },
    fetch: async () => {
      calls += 1
      return { ok: false }
    },
  })
  assert.equal(clock, 500)
  assert.ok(calls >= 2)
})
