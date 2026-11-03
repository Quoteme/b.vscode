// Talks to a real b-language-server, named by $B_LANGUAGE_SERVER, and reads its answers with the
// extension's Schemas. Skipped without it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Schema } from 'effect'
import * as rpc from 'vscode-jsonrpc/node.js'
import { AnimationResponse, ProofObligations, VisualizationResponse } from '../src/protocol.ts'
import { Settings } from '../src/settings.ts'

const server = process.env['B_LANGUAGE_SERVER']

const models = {
  'Counter.mch': `MACHINE Counter
VARIABLES n
INVARIANT n : 0..3
INITIALISATION n := 0
OPERATIONS
  inc = PRE n < 3 THEN n := n + 1 END;
  set(v) = PRE v : 0..3 THEN n := v END
END
`,
  'Ctx.mch': `context Ctx
constants limit
axioms
  @axm1 limit ∈ ℕ1
end
`,
  // ProB checks the theorem with Z3 when its own solver gives up.
  'Persons.mch': `context Persons
sets P
constants a b
axioms
  @axm1 partition(P, {a}, {b})
  theorem @thm1 ∀p·(p ∈ P ⇒ (p = a ∨ p = b))
end
`,
  'Bank.mch': `machine Bank sees Ctx
variables n
invariants
  @inv1 n ∈ 0‥limit
events
  event INITIALISATION
    then
      @act1 n ≔ 0
  end
  event inc
    where
      @grd1 n < limit
    then
      @act1 n ≔ n + 1
  end
end
`,
}

test('the server answers as the extension reads it', { skip: server === undefined, timeout: 240_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'b-vscode-'))
  Object.entries(models).forEach(([name, text]) => writeFileSync(join(dir, name), text))
  const uri = (name: keyof typeof models) => pathToFileURL(join(dir, name)).href

  const child = spawn(server ?? '', ['--stdio'], { stdio: ['pipe', 'pipe', 'ignore'] })
  const connection = rpc.createMessageConnection(new rpc.StreamMessageReader(child.stdout), new rpc.StreamMessageWriter(child.stdin))
  const settings = Schema.encodeSync(Settings)(Schema.decodeUnknownSync(Settings)({}))
  connection.onRequest('workspace/configuration', (params: { items: ReadonlyArray<unknown> }) => params.items.map(() => settings))
  connection.onRequest(() => null)
  const diagnostics = new Map<string, ReadonlyArray<{ message: string }>>()
  connection.onNotification('textDocument/publishDiagnostics', (p: { uri: string; diagnostics: ReadonlyArray<{ message: string }> }) =>
    diagnostics.set(p.uri, p.diagnostics),
  )
  connection.onNotification(() => {})
  connection.listen()

  const execute =
    <A, I>(schema: Schema.Schema<A, I>) =>
    async (command: string, argument: unknown) =>
      Schema.decodeUnknownSync(schema)(await connection.sendRequest('workspace/executeCommand', { command, arguments: [argument] }))
  const animate = async (request: object) => {
    const response = await execute(AnimationResponse)('prob.animate', { uri: uri('Counter.mch'), ...request })
    assert.equal(response._tag, 'AnimationView', JSON.stringify(response))
    return response._tag === 'AnimationView' ? response : assert.fail()
  }
  const open = (name: keyof typeof models, languageId: string) =>
    connection.sendNotification('textDocument/didOpen', { textDocument: { uri: uri(name), languageId, version: 1, text: models[name] } })

  try {
    const init = await connection.sendRequest<{ capabilities: { executeCommandProvider: { commands: Array<string> } } }>('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(dir).href,
      capabilities: { workspace: { configuration: true } },
    })
    const serverCommands = init.capabilities.executeCommandProvider.commands
    assert.ok(['prob.animate', 'prob.visualize', 'prob.showPOs'].every((c) => serverCommands.includes(c)))
    // VS Code refuses to register a command twice, and the client registers the server's.
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { contributes: { commands: Array<{ command: string }> } }
    const clientCommands = [...manifest.contributes.commands.map((c) => c.command), 'prob.animate.open']
    assert.deepEqual(clientCommands.filter((c) => serverCommands.includes(c)), [])
    await connection.sendNotification('initialized', {})
    await open('Counter.mch', 'b')

    const started = await animate({ action: 'start' })
    const initialised = await animate({ action: 'execute', argument: started.enabled[0]?.id })
    const inc = initialised.enabled.find((e) => e.name.startsWith('inc'))
    await animate({ action: 'execute', argument: inc?.id })
    const set = await animate({ action: 'executeWith', argument: 'set\0v = 3' })
    assert.deepEqual(set.variables.map((v) => [v.name, v.value]), [['n', '3']])
    assert.deepEqual(set.history.map((h) => h.label), ['INITIALISATION', 'inc', 'set(3)'])
    assert.deepEqual((await animate({ action: 'find', argument: 'n = 2' })).variables.map((v) => v.value), ['2'])

    const table = set.visualizations.find((v) => v.available && v.kind === 'table' && v.arity === 0)
    if (table) {
      const result = await execute(VisualizationResponse)('prob.visualize', { kind: 'table', command: table.command, formulas: [], format: 'svg' })
      assert.equal(result._tag, 'Table')
    }
    assert.equal((await execute(AnimationResponse)('prob.animate', { action: 'stop' }))._tag, 'Stopped')

    await open('Ctx.mch', 'eventb')
    await open('Bank.mch', 'eventb')
    // The server lists the obligations once it checked the file.
    const obligations = async (tries: number): Promise<ReadonlyArray<unknown>> => {
      const found = await execute(ProofObligations)('prob.showPOs', uri('Bank.mch'))
      return found.length > 0 || tries === 0 ? found : new Promise((r) => setTimeout(() => r(obligations(tries - 1)), 500))
    }
    assert.ok((await obligations(120)).length > 0)

    await open('Persons.mch', 'eventb')
    const checked = async (tries: number): Promise<ReadonlyArray<{ message: string }>> => {
      const found = diagnostics.get(uri('Persons.mch'))
      return found !== undefined || tries === 0 ? (found ?? []) : new Promise((r) => setTimeout(() => r(checked(tries - 1)), 500))
    }
    // Without Z3, ProB reports "File for component does not exist: …/lib/z3interface.so".
    assert.deepEqual((await checked(120)).map((d) => d.message).filter((m) => /z3/i.test(m)), [])
  } finally {
    await connection.sendRequest('shutdown').catch(() => undefined)
    await connection.sendNotification('exit').catch(() => undefined)
    connection.dispose()
    child.kill()
  }
})
