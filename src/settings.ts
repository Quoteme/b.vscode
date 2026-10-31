// The `prob` configuration section: what the server reads (b-language-server: config/Settings.kt) and
// what only the extension reads. Defaults here match those package.json shows in the settings UI.
import { Either, Schema } from 'effect'

const withDefault = <A, I>(schema: Schema.Schema<A, I>, value: NoInfer<A>) => Schema.optionalWith(schema, { default: () => value })

export class Settings extends Schema.Class<Settings>('Settings')({
  probHome: withDefault(Schema.String, 'DEFAULT'),
  wdChecks: withDefault(Schema.Boolean, true),
  strictChecks: withDefault(Schema.Boolean, true),
  performanceHints: withDefault(Schema.Boolean, true),
  debugMode: withDefault(Schema.Boolean, false),
  /** Milliseconds ProB may spend on each proof obligation. */
  poTimeout: withDefault(Schema.Int, 1000),
  /** States the model checker explores at most. */
  modelCheckStates: withDefault(Schema.Int, 100000),
}) {}

export class ClientSettings extends Schema.Class<ClientSettings>('ClientSettings')({
  server: withDefault(Schema.Struct({ command: Schema.NonEmptyArray(Schema.String) }), { command: ['b-language-server', '--stdio'] }),
  /** Replace ASCII combinations by Event-B symbols while typing, like Rodin. */
  keyboard: withDefault(Schema.Boolean, true),
  /** Format Graphviz renders graphs to. */
  visualization: withDefault(Schema.Struct({ format: Schema.Literal('svg', 'pdf', 'png') }), { format: 'svg' }),
}) {}

/**
 * Reads a configuration section with `schema`; values of the wrong type fall back to the defaults
 * after `invalid` reported them.
 */
export const read =
  <A, I>(schema: Schema.Schema<A, I>, invalid: (message: string) => void) =>
  (section: unknown): A =>
    Either.getOrElse(Schema.decodeUnknownEither(schema)(section), (e) => {
      invalid(e.message)
      return Schema.decodeUnknownSync(schema)({})
    })
