import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Either, Option, Schema } from 'effect'
import { AnimationResponse, AnimationView, ProofObligations, VisualizationResponse } from '../src/protocol.ts'
import { Settings } from '../src/settings.ts'
import { Execute, Goto, initial, render, Source, UiAction } from '../src/view.ts'

// An answer of the server as lsp4j sends it: null properties are left out.
const wire = {
  machine: 'Counter',
  file: '/m/Counter.mch',
  step: 1,
  history: [{ label: 'INITIALISATION', index: 1, future: false }, { label: 'inc', index: 2, future: true }],
  canBack: true,
  canForward: true,
  initialised: true,
  constantsSetUp: false,
  constants: [],
  variables: [{ name: 'x', value: '0', changed: true, uri: 'file:///m/Counter.mch', line: 3, character: 2 }],
  invariants: [{ label: 'inv1', ok: true }, { label: 'inv2' }],
  enabled: [{ id: '7', name: 'inc', event: 'inc', parameters: '', uri: 'file:///m/Counter.mch', line: 9 }],
  disabled: [{ name: 'dec', guards: [{ label: 'grd1', ok: false }] }],
  deadlock: false,
  context: false,
  errors: [],
  message: '',
  visualizations: [],
  visb: false,
}

const decode = Schema.decodeUnknownSync(AnimationResponse)

test('answers of the animation are told apart by their shape', () => {
  assert.equal(decode(wire)._tag, 'AnimationView')
  assert.equal(decode({ error: 'no model' })._tag, 'Failure')
  assert.equal(decode({ stopped: true })._tag, 'Stopped')
  assert.equal(Schema.decodeUnknownSync(VisualizationResponse)({ title: 't', header: ['a'], rows: [['1']] })._tag, 'Table')
  assert.ok(Either.isLeft(Schema.decodeUnknownEither(AnimationResponse)({ ...wire, step: 'one' })))
})

test('proof obligations are read with their status', () => {
  const [po] = Schema.decodeUnknownSync(ProofObligations)([{ uri: 'file:///m', line: 0, character: 0, name: 'inv1/INV', status: 'disproved', detail: 'x=1' }])
  assert.equal(po?.status, 'disproved')
})

test('missing and unknown settings take their defaults', () => {
  const settings = Schema.decodeUnknownSync(Settings)({ poTimeout: 5, other: 1 })
  assert.deepEqual(Schema.encodeSync(Settings)(settings), {
    probHome: 'DEFAULT', wdChecks: true, strictChecks: true, performanceHints: true, debugMode: false, poTimeout: 5, modelCheckStates: 100000,
  })
})

const attribute = (action: UiAction) => JSON.stringify(action).replace(/"/g, '&#34;')

test('rows of the panel carry the actions of their keys', () => {
  const html = render({ ...initial, view: Option.some(Schema.decodeUnknownSync(AnimationView)(wire)) })
  assert.match(html, /EVENTS/)
  assert.match(html, /grd1 ✗/)
  assert.ok(html.includes(attribute(Execute.make({ id: '7' }))))
  assert.ok(html.includes(attribute(Goto.make({ index: 2 }))))
  assert.ok(html.includes(attribute(Source.make({ uri: 'file:///m/Counter.mch', line: 3, character: 2 }))))
  assert.doesNotMatch(html, /CONSTANTS/)
})

test('the panel shows failures and escapes the server text', () => {
  const html = render({ ...initial, error: Option.some('<b>cannot load</b>') })
  assert.match(html, /&#60;b&#62;cannot load/)
})

test('the webview sends actions the extension can read', () => {
  assert.deepEqual(Schema.decodeUnknownSync(UiAction)({ _tag: 'Back', count: 3 }), { _tag: 'Back', count: 3 })
  assert.deepEqual(Schema.decodeUnknownSync(UiAction)({ _tag: 'Execute', id: '7', count: 1 }), { _tag: 'Execute', id: '7' })
  assert.ok(Either.isLeft(Schema.decodeUnknownEither(UiAction)({ _tag: 'Execute' })))
})
