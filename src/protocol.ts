// What the B language server sends and expects, as Schemas of its wire types
// (b-language-server: analysis/prob/animation/Animation{Request,Response}.kt, server/ProofObligationView.kt).
// The server leaves out null properties, so nullable fields are optional here.
import { Data, Effect, Schema } from 'effect'
import type { BaseLanguageClient } from 'vscode-languageclient'

/** Gives a struct of the server a `_tag`, so that unions of them can be matched on. */
const tagged =
  <Tag extends string>(tag: Tag) =>
  <Fields extends Schema.Struct.Fields>(fields: Fields) =>
    Schema.Struct(fields).pipe(Schema.attachPropertySignature('_tag', tag))

/** Where an item is declared, if the server knows it. */
const located = {
  uri: Schema.optional(Schema.String),
  line: Schema.optional(Schema.Int),
  character: Schema.optional(Schema.Int),
}
export type Located = Schema.Struct.Type<typeof located>

export const NamedValue = Schema.Struct({ name: Schema.String, value: Schema.optional(Schema.String), changed: Schema.Boolean, ...located })
export const PredicateStatus = Schema.Struct({ label: Schema.String, ok: Schema.optional(Schema.Boolean), ...located })
export const EnabledEvent = Schema.Struct({ id: Schema.String, name: Schema.String, event: Schema.String, parameters: Schema.String, ...located })
export const DisabledEvent = Schema.Struct({
  name: Schema.String,
  guards: Schema.Array(Schema.Struct({ label: Schema.String, ok: Schema.optional(Schema.Boolean) })),
  ...located,
})
export const HistoryEntry = Schema.Struct({ label: Schema.String, index: Schema.Int, future: Schema.Boolean })
export const GraphicsCell = Schema.Struct({ text: Schema.String, image: Schema.optional(Schema.String) })

export const VisualizationKind = Schema.Literal('graphics', 'visb', 'dot', 'table')
export const VisualizationEntry = Schema.Struct({
  kind: VisualizationKind,
  command: Schema.String,
  name: Schema.String,
  description: Schema.String,
  arity: Schema.Int,
  available: Schema.Boolean,
  reason: Schema.String,
})
export type VisualizationEntry = typeof VisualizationEntry.Type

export const AnimationView = tagged('AnimationView')({
  machine: Schema.String,
  file: Schema.String,
  step: Schema.Int,
  history: Schema.Array(HistoryEntry),
  canBack: Schema.Boolean,
  canForward: Schema.Boolean,
  initialised: Schema.Boolean,
  constantsSetUp: Schema.Boolean,
  constants: Schema.Array(NamedValue),
  variables: Schema.Array(NamedValue),
  invariants: Schema.Array(PredicateStatus),
  enabled: Schema.Array(EnabledEvent),
  disabled: Schema.Array(DisabledEvent),
  deadlock: Schema.Boolean,
  context: Schema.Boolean,
  errors: Schema.Array(Schema.String),
  message: Schema.String,
  graphics: Schema.optional(Schema.Array(Schema.Array(GraphicsCell))),
  visualizations: Schema.Array(VisualizationEntry),
  visb: Schema.Boolean,
})
export type AnimationView = typeof AnimationView.Type

const Failure = tagged('Failure')({ error: Schema.String })
const Stopped = tagged('Stopped')({ stopped: Schema.Boolean })
/** A file to show, such as a rendered graph or a page following the animation. */
const Page = tagged('Page')({ path: Schema.String })
export const Table = tagged('Table')({ title: Schema.String, header: Schema.Array(Schema.String), rows: Schema.Array(Schema.Array(Schema.String)) })
export type Table = typeof Table.Type

export const AnimationResponse = Schema.Union(AnimationView, Failure, Stopped)
export const VisualizationResponse = Schema.Union(Failure, Page, Table)

export const AnimationAction = Schema.Literal(
  'start', 'stop', 'view', 'execute', 'executeWith', 'back', 'forward', 'goto', 'random', 'find', 'modelCheck', 'restart',
)
export const AnimationRequest = Schema.Struct({
  action: AnimationAction,
  uri: Schema.optional(Schema.String),
  /** The transition id, step, predicate, or event and predicate separated by NUL. */
  argument: Schema.optional(Schema.String),
  count: Schema.optional(Schema.Int),
})
export type AnimationRequest = typeof AnimationRequest.Type

export const VisualizationRequest = Schema.Struct({
  kind: VisualizationKind,
  command: Schema.String,
  formulas: Schema.Array(Schema.String),
  format: Schema.String,
})

export const ProofObligation = Schema.Struct({
  uri: Schema.String,
  line: Schema.Int,
  character: Schema.Int,
  name: Schema.String,
  status: Schema.Literal('discharged', 'disproved', 'undischarged'),
  detail: Schema.String,
})
export type ProofObligation = typeof ProofObligation.Type

export class ServerError extends Data.TaggedError('ServerError')<{ readonly message: string }> {}

/** Runs a request and reads its answer with `response`. */
export const call =
  <A, I>(response: Schema.Schema<A, I>) =>
  (send: () => PromiseLike<unknown>): Effect.Effect<A, ServerError> =>
    Effect.tryPromise(() => Promise.resolve(send())).pipe(
      Effect.flatMap(Schema.decodeUnknown(response)),
      Effect.mapError((e) => new ServerError({ message: e._tag === 'UnknownException' ? String(e.error) : e.message })),
    )

/** A command of the server taking one argument described by `request`. */
const command =
  <R, RI, A, AI>(id: string, request: Schema.Schema<R, RI>, response: Schema.Schema<A, AI>) =>
  (client: BaseLanguageClient) =>
  (argument: R): Effect.Effect<A, ServerError> =>
    call(response)(() => client.sendRequest('workspace/executeCommand', { command: id, arguments: [Schema.encodeSync(request)(argument)] }))

export const animate = command('prob.animate', AnimationRequest, AnimationResponse)
export const visualize = command('prob.visualize', VisualizationRequest, VisualizationResponse)
export const ProofObligations = Schema.Array(ProofObligation)
