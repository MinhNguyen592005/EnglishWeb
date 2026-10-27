import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/services/api.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
let sequence = 0
const freshApi = () => import(`data:text/javascript;base64,${Buffer.from(compiled + `\n// ${sequence++}`).toString('base64')}`)
globalThis.window = new EventTarget()
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })

// Concurrent mutations share the initial token fetch.
{
  const { api } = await freshApi()
  let tokens = 0
  globalThis.fetch = async path => path.endsWith('/csrf') ? (tokens++, json({ token: 'first' })) : json({})
  await Promise.all([api.login('alice', 'password'), api.login('bob', 'password')])
  assert.equal(tokens, 1)
}

// A rotated token is refreshed once and the rejected mutation is retried.
{
  const { api } = await freshApi()
  let tokens = 0, mutations = 0
  globalThis.fetch = async (path, init) => {
    if (path.endsWith('/csrf')) return json({ token: `token-${++tokens}` })
    if (++mutations === 1) return json({ code: 'CSRF_INVALID' }, 403)
    assert.equal(init.headers['X-XSRF-TOKEN'], 'token-2')
    return json({ id: 1 })
  }
  assert.equal((await api.login('alice', 'password')).id, 1)
  assert.equal(mutations, 2)
}

// Permission failures are never replayed; persistent CSRF failures stop after one retry.
for (const code of ['FORBIDDEN', 'CSRF_INVALID']) {
  const { api } = await freshApi()
  let mutations = 0
  globalThis.fetch = async path => path.endsWith('/csrf') ? json({ token: 'token' }) : (mutations++, json({ code }, 403))
  await assert.rejects(api.login('alice', 'password'), error => error.status === 403 && error.code === code)
  assert.equal(mutations, code === 'FORBIDDEN' ? 1 : 2)
}
console.log('API session regression checks passed')
