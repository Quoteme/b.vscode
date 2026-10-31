// Animates a model with ProB in a panel beside it, as b.nvim's lua/prob/animate.lua does: the panel
// lists the enabled events, the state and the history, and the model shows the current values inline.
// The state lives in a SubscriptionRef; every change repaints the panel and the model's editors.
import { randomUUID } from 'node:crypto'
import * as vscode from 'vscode'
import { Array, Effect, Fiber, Match, Option, Schema, Stream, SubscriptionRef } from 'effect'
import type { BaseLanguageClient } from 'vscode-languageclient'
import * as protocol from './protocol.ts'
import * as view from './view.ts'
import { ask, nonEmpty, pick, reveal, run } from './ui.ts'

interface Session {
  readonly client: BaseLanguageClient
  readonly source: vscode.Uri
  readonly panel: vscode.WebviewPanel
  readonly state: SubscriptionRef.SubscriptionRef<view.State>
}

type Visualization = Pick<protocol.VisualizationEntry, 'kind' | 'command' | 'name' | 'arity'>

const nonce = () => randomUUID().replaceAll('-', '')

/** The text shown after the declarations in the model, per item. */
const annotations = (state: view.State): ReadonlyArray<readonly [protocol.Located, string]> =>
  Option.match(state.view, {
    onNone: () => [],
    onSome: (v) => [
      ...(v.initialised ? v.variables : []).map((x) => [x, `${x.name} = ${x.value ?? '?'}${x.changed ? ' *' : ''}`] as const),
      ...(v.constantsSetUp ? v.constants : []).map((c) => [c, `${c.name} = ${c.value ?? '?'}`] as const),
      ...v.invariants.map((i) => [i, i.ok === false ? '✗' : '✓'] as const),
      ...Array.dedupeWith(v.enabled, (a, b) => a.name === b.name).map((e) => [e, '▶ enabled'] as const),
    ],
  })

/** Shows the annotations of `state` in the visible editors; several declarations may share a line. */
const annotate = (decoration: vscode.TextEditorDecorationType) => (state: view.State) => {
  const located = Array.filterMap(annotations(state), ([item, text]) =>
    Option.map(Option.all({ uri: Option.fromNullable(item.uri), line: Option.fromNullable(item.line) }), ({ uri, line }) => ({
      uri: vscode.Uri.parse(uri).toString(),
      line,
      text,
    })),
  )
  const lines = Object.values(Array.groupBy(located, (a) => `${a.line}:${a.uri}`))
  for (const editor of vscode.window.visibleTextEditors) {
    const document = editor.document
    const here = lines.filter(([first]) => first.uri === document.uri.toString() && first.line < document.lineCount)
    editor.setDecorations(
      decoration,
      here.map((group) => ({
        range: document.lineAt(group[0].line).range.with({ start: document.lineAt(group[0].line).range.end }),
        renderOptions: { after: { contentText: group.map((a) => a.text).join('   ') } },
      })),
    )
  }
}

export const animation = (client: BaseLanguageClient, format: () => string) => {
  let session: Option.Option<Session> = Option.none()
  const decoration = vscode.window.createTextEditorDecorationType({
    after: { margin: '0 0 0 2em', color: new vscode.ThemeColor('editorInlayHint.foreground'), fontStyle: 'italic' },
  })
  const paintSource = annotate(decoration)

  const update = (s: Session, f: (state: view.State) => view.State) => SubscriptionRef.update(s.state, f)
  const repaint = (s: Session) => Effect.map(SubscriptionRef.get(s.state), paint(s))
  const paint = (s: Session) => (state: view.State) => {
    void s.panel.webview.postMessage({ html: view.render(state) })
    paintSource(state)
  }

  /** Runs one request at a time; its failure is shown in the panel. */
  const exclusive =
    (s: Session) =>
    <A>(effect: Effect.Effect<A, protocol.ServerError>): Effect.Effect<void> =>
      SubscriptionRef.modify(s.state, (state) => [!state.busy, { ...state, busy: true }] as const).pipe(
        Effect.flatMap((free) =>
          free
            ? effect.pipe(
                Effect.catchAll((e) => update(s, (state) => ({ ...state, error: Option.some(e.message) }))),
                Effect.ensuring(update(s, (state) => ({ ...state, busy: false }))),
              )
            : Effect.void,
        ),
        Effect.asVoid,
      )

  const animate = (s: Session) => (request: Omit<protocol.AnimationRequest, 'uri'>) =>
    exclusive(s)(
      protocol.animate(s.client)({ ...request, uri: s.source.toString() }).pipe(
        Effect.flatMap((response) =>
          update(s, (state) =>
            Match.valueTags(response, {
              AnimationView: (v) => ({
                ...state,
                view: Option.some(v),
                error: Option.none(),
                stale: state.stale && request.action !== 'start' && request.action !== 'restart',
              }),
              Failure: (f) => ({ ...state, view: Option.none(), error: Option.some(f.error) }),
              Stopped: () => state,
            }),
          ),
        ),
      ),
    )

  const showTable = (t: protocol.Table) => {
    const panel = vscode.window.createWebviewPanel('prob.table', `ProB: ${t.title}`, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {})
    panel.webview.html = view.page(nonce(), panel.webview.cspSource, view.renderTable(t))
  }

  /** Asks for the formulas `v` takes, then shows it: files in their viewer, tables beside the panel. */
  const visualize = (s: Session) => (v: Visualization) =>
    Effect.forEach(globalThis.Array.from({ length: v.arity }, (_, i) => i + 1), (i) =>
      nonEmpty(ask(v.arity > 1 ? `${v.name} (formula ${i} of ${v.arity})` : v.name)),
    ).pipe(
      Effect.flatMap((formulas) =>
        exclusive(s)(
          protocol.visualize(s.client)({ kind: v.kind, command: v.command, formulas, format: format() }).pipe(
            Effect.flatMap((result) =>
              Match.valueTags(result, {
                Failure: (f) => update(s, (state) => ({ ...state, error: Option.some(f.error) })),
                Page: (p) => Effect.promise(() => Promise.resolve(vscode.env.openExternal(vscode.Uri.file(p.path)))),
                Table: (t) => Effect.sync(() => showTable(t)),
              }),
            ),
          ),
        ),
      ),
    )

  const currentView = (s: Session) => Effect.flatMap(SubscriptionRef.get(s.state), (state) => state.view)

  /** Executes an event with a predicate on its parameters; without an event, asks for one. */
  const executeWith = (s: Session) => (w: typeof view.With.Type) =>
    (w.event !== undefined
      ? Effect.succeed({ event: w.event, parameters: w.parameters ?? '' })
      : currentView(s).pipe(
          Effect.flatMap((v) =>
            pick(Array.dedupe([...v.enabled.map((e) => e.event), ...v.disabled.map((e) => e.name)]), (label) => ({ label }), 'Event'),
          ),
          Effect.map((event) => ({ event, parameters: '' })),
        )
    ).pipe(
      Effect.flatMap(({ event, parameters }) =>
        ask(`${event} with`, parameters.replaceAll(', ', ' ∧ ')).pipe(Effect.map((predicate) => `${event}\0${predicate}`)),
      ),
      Effect.flatMap((argument) => animate(s)({ action: 'executeWith', argument })),
    )

  const handle = (s: Session) =>
    Match.type<view.UiAction>().pipe(
      Match.tagsExhaustive({
        Execute: ({ id }) => animate(s)({ action: 'execute', argument: id }),
        With: executeWith(s),
        Goto: ({ index }) => animate(s)({ action: 'goto', argument: String(index) }),
        Back: ({ count }) => animate(s)({ action: 'back', count }),
        Forward: ({ count }) => animate(s)({ action: 'forward', count }),
        Random: ({ count }) => animate(s)({ action: 'random', count }),
        Find: () => nonEmpty(ask('Find a state where')).pipe(Effect.flatMap((argument) => animate(s)({ action: 'find', argument }))),
        ModelCheck: () => animate(s)({ action: 'modelCheck' }),
        Restart: () => animate(s)({ action: 'restart' }),
        Stop: () => stop,
        Source: (at) => reveal(at, Option.getOrUndefined(sourceColumn(s)) ?? vscode.ViewColumn.One),
        Visualize: visualize(s),
        PickVisualization: () =>
          currentView(s).pipe(
            Effect.flatMap((v) =>
              pick(v.visualizations.filter((e) => e.available), (e) => ({ label: e.name.replace(/\.\.\.$/, ''), detail: e.description }), 'Visualise'),
            ),
            Effect.flatMap((e) => visualize(s)({ ...e, name: e.name.replace(/\.\.\.$/, '') })),
          ),
        Graphics: () =>
          currentView(s).pipe(
            Effect.flatMap((v) => {
              const kind = (v.graphics ?? []).length === 0 && v.visb ? 'visb' : 'graphics'
              return visualize(s)({ kind, command: '', name: kind, arity: 0 })
            }),
          ),
        Toggle: ({ flag }) => update(s, (state) => ({ ...state, [flag]: !state[flag] })),
        Ready: () => repaint(s),
      }),
    )

  /** The column of an editor showing the model, for jumping to its declarations. */
  const sourceColumn = (s: Session) =>
    Array.findFirst(vscode.window.visibleTextEditors, (e) => e.document.uri.toString() === s.source.toString()).pipe(
      Option.flatMap((e) => Option.fromNullable(e.viewColumn)),
    )

  /** Stops the animation and closes its panel. */
  const stop: Effect.Effect<void> = Effect.suspend(() =>
    Option.match(session, {
      onNone: () => Effect.void,
      onSome: (s) => {
        session = Option.none()
        vscode.window.visibleTextEditors.forEach((e) => e.setDecorations(decoration, []))
        s.panel.dispose()
        return Effect.forkDaemon(protocol.animate(s.client)({ action: 'stop' }).pipe(Effect.ignore))
      },
    }),
  )

  const supported = (commands: ReadonlyArray<string>) => ['prob.animate', 'prob.visualize'].every((c) => commands.includes(c))

  /** Animates the model at `source`, or shows its panel if it is animated already. */
  const start = (source: vscode.Uri) =>
    Effect.gen(function* () {
      const running = Option.filter(session, (s) => s.source.toString() === source.toString())
      if (Option.isSome(running)) {
        return running.value.panel.reveal()
      }
      yield* stop
      if (!supported(client.initializeResult?.capabilities.executeCommandProvider?.commands ?? [])) {
        return yield* new protocol.ServerError({ message: 'this b-language-server cannot animate; it is older than the extension' })
      }
      if (vscode.workspace.textDocuments.some((d) => d.uri.toString() === source.toString() && d.isDirty)) {
        void vscode.window.showWarningMessage('ProB animates the file on disk; save it first')
      }
      const panel = vscode.window.createWebviewPanel(
        'prob.animation',
        'ProB animation',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: true, retainContextWhenHidden: true },
      )
      panel.webview.html = view.page(nonce(), panel.webview.cspSource, view.render(view.initial))
      const s: Session = { client, source, panel, state: yield* SubscriptionRef.make(view.initial) }
      session = Option.some(s)
      const painter = Effect.runFork(Stream.runForEach(s.state.changes, (state) => Effect.sync(() => paint(s)(state))))
      panel.onDidDispose(() => run(Effect.zipRight(Fiber.interrupt(painter), stop)))
      panel.webview.onDidReceiveMessage((message: unknown) =>
        Option.map(Schema.decodeUnknownOption(view.UiAction)(message), (action) => run(handle(s)(action))),
      )
      yield* animate(s)({ action: 'start' })
    })

  /** What happens to the open session when the editors change. */
  const onSession = (f: (s: Session) => Effect.Effect<void>) => () => Option.map(session, (s) => run(f(s)))

  const disposables: ReadonlyArray<vscode.Disposable> = [
    decoration,
    vscode.window.onDidChangeVisibleTextEditors(onSession(repaint)),
    vscode.workspace.onDidSaveTextDocument((document) =>
      onSession((s) => (document.uri.toString() === s.source.toString() ? update(s, (state) => ({ ...state, stale: true })) : Effect.void))(),
    ),
    { dispose: () => void run(stop) },
  ]

  return { start, stop, disposables }
}

