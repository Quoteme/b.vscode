// The animation panel as HTML, like the Events, State and History views of ProB for Rodin.
// Pure: rows carry the actions their keys send, and the webview's script only posts them back.
import { Array, Option, Schema } from 'effect'
import { type AnimationView, type Located, type Table, VisualizationKind } from './protocol.ts'

// ---------------------------------------------------------------------------
// What the panel sends

const count = { count: Schema.optionalWith(Schema.Int, { default: () => 1 }) }
export const Execute = Schema.TaggedStruct('Execute', { id: Schema.String })
export const With = Schema.TaggedStruct('With', { event: Schema.optional(Schema.String), parameters: Schema.optional(Schema.String) })
export const Goto = Schema.TaggedStruct('Goto', { index: Schema.Int })
export const Source = Schema.TaggedStruct('Source', { uri: Schema.String, line: Schema.Int, character: Schema.Int })
export const Visualize = Schema.TaggedStruct('Visualize', { kind: VisualizationKind, command: Schema.String, name: Schema.String, arity: Schema.Int })
export const PickVisualization = Schema.TaggedStruct('PickVisualization', {})
export const Graphics = Schema.TaggedStruct('Graphics', {})
export const Back = Schema.TaggedStruct('Back', count)
export const Forward = Schema.TaggedStruct('Forward', count)
export const Random = Schema.TaggedStruct('Random', count)
export const Find = Schema.TaggedStruct('Find', {})
export const ModelCheck = Schema.TaggedStruct('ModelCheck', {})
export const Restart = Schema.TaggedStruct('Restart', {})
export const Stop = Schema.TaggedStruct('Stop', {})
export const Toggle = Schema.TaggedStruct('Toggle', { flag: Schema.Literal('help', 'expanded') })
/** Sent by the webview once its script listens, so that it gets the current state. */
export const Ready = Schema.TaggedStruct('Ready', {})

export const UiAction = Schema.Union(
  Execute, With, Goto, Source, Visualize, PickVisualization, Graphics, Back, Forward, Random, Find, ModelCheck, Restart, Stop, Toggle, Ready,
)
export type UiAction = typeof UiAction.Type

/** Keys of the panel, their help, and what they send when no row overrides them. */
export const keys: ReadonlyArray<readonly [key: string, help: string, action?: UiAction]> = [
  ['Enter', 'execute the event, go to the step, or show the source'],
  ['p', 'execute an event with a parameter predicate', With.make({})],
  ['u', 'step back ([count])', Back.make({})],
  ['U', 'step forward ([count])', Forward.make({})],
  ['r', 'execute [count] random events', Random.make({})],
  ['f', 'find a state satisfying a predicate', Find.make({})],
  ['m', 'model check from here; jump to a counterexample', ModelCheck.make({})],
  ['v', 'show a visualisation of the state (graph, table)', PickVisualization.make({})],
  ['I', 'open the graphical animation with its images, or VisB', Graphics.make({})],
  ['d', 'show the source of the item'],
  ['R', 'restart the animation', Restart.make({})],
  ['q', 'stop the animation', Stop.make({})],
  ['?', 'toggle this help', Toggle.make({ flag: 'help' })],
]

// ---------------------------------------------------------------------------
// State

export interface State {
  readonly view: Option.Option<AnimationView>
  readonly error: Option.Option<string>
  readonly busy: boolean
  /** The model was saved since the animation started. */
  readonly stale: boolean
  readonly help: boolean
  /** The VISUALIZE section lists its entries. */
  readonly expanded: boolean
}

export const initial: State = { view: Option.none(), error: Option.none(), busy: false, stale: false, help: false, expanded: false }

// ---------------------------------------------------------------------------
// HTML combinators

type Html = string
type RowKeys = Partial<Record<'Enter' | 'p' | 'd', UiAction>>

const escape = (text: string): Html => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const span = (cls: string) => (text: string): Html => `<span class="${cls}">${escape(text)}</span>`
const [title, help, fail, ok, changed] = [span('title'), span('help'), span('fail'), span('ok'), span('changed')]
const [value, name, event, dim, open, key, current] = [span('value'), span('name'), span('event'), span('dim'), span('open'), span('key'), span('current')]

/** A table row; with keys it can be focused, and Enter or a click sends `keys.Enter`. */
const row =
  (rowKeys: RowKeys = {}) =>
  (...cells: ReadonlyArray<Html>): Html => {
    const focusable = Object.keys(rowKeys).length > 0
    const attributes = focusable ? ` tabindex="0" data-keys="${escape(JSON.stringify(rowKeys))}"` : ''
    return `<tr${attributes}>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`
  }
const line = (text: Html): Html => `<p>${text}</p>`
const table = (rows: ReadonlyArray<Html>): Html => `<table>${rows.join('')}</table>`

/** A titled section, left out without rows. */
const section =
  (heading: Html) =>
  (rows: ReadonlyArray<Html>): Option.Option<Html> =>
    Option.liftPredicate(`<h3>${heading}</h3>${table(rows)}`, () => rows.length > 0)

/** The action showing where `item` is declared. */
const source = (item: Located): Option.Option<UiAction> =>
  Option.map(Option.all([Option.fromNullable(item.uri), Option.fromNullable(item.line)]), ([uri, line]) =>
    Source.make({ uri, line, character: item.character ?? 0 }),
  )
const sourceKeys = (item: Located): RowKeys => Option.match(source(item), { onNone: () => ({}), onSome: (s) => ({ Enter: s, d: s }) })

const mark = (status: boolean | undefined): Html => (status === undefined ? dim('?') : status ? ok('✓') : fail('✗'))

// ---------------------------------------------------------------------------
// Sections

const header = (state: State): ReadonlyArray<Html> => {
  const machine = Option.match(state.view, { onNone: () => '', onSome: (v) => ` · ${v.machine}` })
  const step = Option.match(state.view, { onNone: () => '', onSome: (v) => help(`   step ${v.step}`) })
  return [
    line(title(`◆ ProB${machine}`) + step + (state.busy ? changed('  …') : '')),
    ...(state.stale ? [line(changed('model changed · R restarts'))] : []),
    ...Option.toArray(Option.map(Option.filter(Option.map(state.view, (v) => v.message), (m) => m !== ''), (m) => line(changed(m)))),
    ...Option.toArray(Option.map(state.error, (e) => line(fail(e)))),
  ]
}

const events = (view: AnimationView) =>
  section('EVENTS')([
    ...view.enabled.map((e) =>
      row({ Enter: Execute.make({ id: e.id }), p: With.make({ event: e.event, parameters: e.parameters }), ...Option.match(source(e), { onNone: () => ({}), onSome: (d) => ({ d }) }) })(
        ok('▶'), event(e.name), dim(e.parameters),
      ),
    ),
    ...view.disabled.map((e) =>
      row({ ...sourceKeys(e), p: With.make({ event: e.name }) })(
        dim('○'), dim(e.name), e.guards.filter((g) => g.ok === false).map((g) => fail(`${g.label} ✗`)).join(' '),
      ),
    ),
    ...(view.deadlock ? [row()(fail('⚠'), fail('deadlock: no event is enabled'))] : []),
  ])

const values = (heading: string, shown: boolean, entries: AnimationView['variables']) =>
  section(heading)(
    shown ? entries.map((v) => row(sourceKeys(v))('', name(v.name), (v.changed ? changed : value)(`${v.value ?? '?'}${v.changed ? ' *' : ''}`))) : [],
  )

const invariants = (view: AnimationView) =>
  section(view.context ? 'AXIOMS' : 'INVARIANTS')([
    ...view.invariants.map((i) => row(sourceKeys(i))(mark(i.ok), escape(i.label))),
    ...view.errors.map((e) => row()(fail('⚠'), fail(e))),
  ])

const graphics = (view: AnimationView) => {
  const cells = view.graphics ?? []
  const images = cells.some((r) => r.some((c) => c.image !== undefined))
  const opener = (label: string, kind: 'graphics' | 'visb') =>
    row({ Enter: Visualize.make({ kind, command: '', name: kind, arity: 0 }) })('', open(label))
  return section('GRAPHICS')([
    ...cells.map((r) => row()(...r.map((c) => (c.image === undefined ? escape(c.text) : value(c.text))))),
    ...(images ? [opener('⧉ show with images', 'graphics')] : []),
    ...(view.visb ? [opener('⧉ show VisB', 'visb')] : []),
  ])
}

/** The Visualize menu of ProB Tcl/Tk: graphs open in a viewer, tables beside the panel. */
const visualizations = (view: AnimationView, expanded: boolean) => {
  const available = view.visualizations.filter((v) => v.available)
  const label = (v: { readonly name: string }) => v.name.replace(/\.\.\.$/, '')
  return available.length === 0
    ? Option.none()
    : section(`<span tabindex="0" data-keys="${escape(JSON.stringify({ Enter: Toggle.make({ flag: 'expanded' }) }))}">VISUALIZE ${help(expanded ? '▾' : `▸ ${available.length}`)}</span>`)(
        expanded
          ? available.map((v) => row({ Enter: Visualize.make({ kind: v.kind, command: v.command, name: label(v), arity: v.arity }) })(open(v.kind === 'table' ? '▤' : '⧉'), escape(label(v))))
          : [],
      )
}

const history = (view: AnimationView) =>
  section('HISTORY')(
    view.history.map((h) => {
      const style = h.future ? dim : h.index === view.step ? current : escape
      return row({ Enter: Goto.make({ index: h.index }) })(h.index === view.step ? current('▸') : '', help(String(h.index)), style(h.label))
    }),
  )

const footer = (state: State): Html =>
  state.help
    ? table(keys.map(([k, h]) => row()(key(k), help(h))))
    : line([['⏎', 'run'], ['p', 'with'], ['u', 'back'], ['r', 'random'], ['?', 'help']].map(([k = '', h = '']) => `${key(k)} ${help(h)}`).join(help(' · ')))

/** The body of the panel. */
export const render = (state: State): Html =>
  [
    ...header(state),
    ...Option.match(state.view, {
      onNone: () => [],
      onSome: (view) =>
        Array.getSomes([
          events(view),
          values('STATE', view.initialised, view.variables),
          values('CONSTANTS', view.constantsSetUp, view.constants),
          invariants(view),
          graphics(view),
          visualizations(view, state.expanded),
          history(view),
        ]),
    }),
    footer(state),
  ].join('\n')

/** A table visualisation. */
export const renderTable = (t: Table): Html =>
  `<h3>${escape(t.title)}</h3><table class="grid"><tr>${t.header.map((h) => `<th>${escape(h)}</th>`).join('')}</tr>${t.rows.map((r) => row()(...r.map(escape))).join('')}</table>`

/** The page around a body, with the script that posts the rows' actions. */
export const page = (nonce: string, cspSource: string, body: Html): Html => `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); padding: 0 .5em; }
  h3 { font-size: 1em; margin: 1em 0 .2em; color: var(--vscode-symbolIcon-keywordForeground, var(--vscode-foreground)); }
  p { margin: .2em 0; } table { border-collapse: collapse; } td, th { padding: 0 .6em 0 0; white-space: nowrap; vertical-align: top; text-align: left; }
  table.grid td, table.grid th { border-bottom: 1px solid var(--vscode-panel-border); padding: .1em .6em; }
  [data-keys] { cursor: pointer; } [data-keys]:hover { background: var(--vscode-list-hoverBackground); }
  [data-keys]:focus { outline: 1px solid var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); }
  .title { font-weight: bold; } .help, .dim { color: var(--vscode-descriptionForeground); } .dim { opacity: .7; }
  .fail { color: var(--vscode-errorForeground); } .ok { color: var(--vscode-testing-iconPassed); }
  .changed { color: var(--vscode-editorWarning-foreground); } .value { color: var(--vscode-debugTokenExpression-string); }
  .name { color: var(--vscode-debugTokenExpression-name); } .event { color: var(--vscode-symbolIcon-functionForeground); }
  .open { color: var(--vscode-textLink-foreground); } .key, .current { color: var(--vscode-textPreformat-foreground); font-weight: bold; }
</style></head>
<body><main>${body}</main>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi(), main = document.querySelector('main')
  const globalKeys = ${JSON.stringify(Object.fromEntries(keys.flatMap(([k, , a]) => (a ? [[k, a]] : []))))}
  const rows = () => [...document.querySelectorAll('[data-keys]')]
  const send = (row, k) => { const a = (row ? JSON.parse(row.dataset.keys)[k] : undefined) ?? globalKeys[k]; if (a) vscode.postMessage({ ...a, count: Number(count) || 1 }); count = '' }
  let count = ''
  document.addEventListener('click', (e) => send(e.target.closest('[data-keys]'), 'Enter'))
  document.addEventListener('keydown', (e) => {
    const all = rows(), i = all.indexOf(document.activeElement), k = e.key
    if (/^[0-9]$/.test(k)) return void (count += k)
    if (k === 'j' || k === 'ArrowDown' || k === 'k' || k === 'ArrowUp') {
      all[Math.max(0, Math.min(all.length - 1, i + (k === 'j' || k === 'ArrowDown' ? 1 : -1)))]?.focus()
      return e.preventDefault()
    }
    send(all[i], k)
  })
  window.addEventListener('message', ({ data }) => {
    const i = rows().indexOf(document.activeElement)
    main.innerHTML = data.html
    rows()[Math.max(i, 0)]?.focus()
  })
  vscode.postMessage({ _tag: 'Ready' })
</script></body></html>`
