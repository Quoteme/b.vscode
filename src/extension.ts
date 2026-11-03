// The B Language Server extension: starts b-language-server for B and Event-B files and adds what
// the server leaves to its client: the animation panel, the proof obligation list, Event-B
// detection and Rodin's keyboard.
import * as vscode from 'vscode'
import { Array, Effect, Option, Schema } from 'effect'
import { LanguageClient } from 'vscode-languageclient/node'
import { animation } from './animation.ts'
import { isEventB, settle } from './eventb.ts'
import { call, type ProofObligation, ProofObligations } from './protocol.ts'
import { ClientSettings, read, Settings } from './settings.ts'
import { bundled, makeExecutable, onPath, serverCommand } from './server.ts'
import { symbols } from './symbols.ts'
import { pick, reveal, run } from './ui.ts'

const section = (scope?: string) => ({ ...vscode.workspace.getConfiguration('prob', scope === undefined ? undefined : vscode.Uri.parse(scope)) })
const invalid = (message: string) => void vscode.window.showWarningMessage(`ProB: invalid settings: ${message}`)
const serverSettings = (scope?: string) => Schema.encodeSync(Settings)(read(Settings, invalid)(section(scope)))
const clientSettings = () => read(ClientSettings, invalid)(section())

const icons: Record<ProofObligation['status'], string> = { discharged: '$(pass)', disproved: '$(error)', undischarged: '$(question)' }

const showObligations = (obligations: ReadonlyArray<ProofObligation>) =>
  pick(obligations, (po) => ({ label: `${icons[po.status]} ${po.name}`, description: po.status, detail: po.detail }), 'Proof obligations').pipe(
    Effect.flatMap(reveal),
  )

/** The document of the editor active when this runs, not when the extension loaded. */
const activeDocument = Effect.suspend(() => Effect.fromNullable(vscode.window.activeTextEditor)).pipe(
  Effect.map((editor) => editor.document),
  // Not a cancelled prompt, so `run` shows it.
  Effect.orElseFail(() => ({ _tag: 'NoEditor', message: 'open a B or Event-B file in an editor to animate it' }) as const),
)

const pickSymbol = Effect.gen(function* () {
  const editor = yield* Effect.fromNullable(vscode.window.activeTextEditor)
  const combo = yield* pick(
    Array.dedupeWith(symbols, (a, b) => a.symbol === b.symbol),
    (c) => ({ label: c.symbol, description: c.ascii, detail: c.description }),
    'Event-B symbol',
  )
  yield* Effect.promise(() => Promise.resolve(editor.edit((edit) => editor.selections.forEach((s) => edit.replace(s, combo.symbol)))))
})

/** Event-B in Camille notation shares `.mch` with classical B. */
const detectEventB = (document: vscode.TextDocument) =>
  document.languageId === 'b' && document.uri.path.endsWith('.mch') && isEventB(document.getText(new vscode.Range(0, 0, 100, 0)))
    ? vscode.languages.setTextDocumentLanguage(document, 'eventb')
    : undefined

/** Rodin's keyboard: a typed character settles the combination before it. */
const keyboard = (event: vscode.TextDocumentChangeEvent) => {
  const [change, ...more] = event.contentChanges
  const document = event.document
  if (!change || more.length > 0 || event.reason !== undefined || document.languageId !== 'eventb' || change.rangeLength !== 0) {
    return
  }
  if (!clientSettings().keyboard || !(change.text.length === 1 || /^\r?\n\s*$/.test(change.text))) {
    return
  }
  const before = document.getText(new vscode.Range(new vscode.Position(0, 0), change.range.start))
  Option.map(settle(before, change.text.slice(0, 1)), (r) => {
    const edit = new vscode.WorkspaceEdit()
    edit.replace(document.uri, new vscode.Range(document.positionAt(r.start), document.positionAt(r.end)), r.text)
    return vscode.workspace.applyEdit(edit)
  })
}

export const activate = async (context: vscode.ExtensionContext) => {
  const { command, args } = serverCommand(
    clientSettings().server.command,
    () => onPath('b-language-server'),
    () => bundled(context.extensionPath),
  )
  if (command === bundled(context.extensionPath)?.command) {
    makeExecutable(context.extensionPath)
  }
  const client: LanguageClient = new LanguageClient(
    'prob',
    'B Language Server',
    { command, args: [...args] },
    {
      documentSelector: ['b', 'eventb'].map((language) => ({ scheme: 'file', language })),
      synchronize: { configurationSection: 'prob' },
      middleware: {
        workspace: { configuration: (params) => params.items.map((item) => (item.section === 'prob' ? serverSettings(item.scopeUri) : null)) },
        // The server answers prob.showPOs with the obligations, for the client to list.
        executeCommand: (id, args, next) =>
          id === 'prob.showPOs' ? run(call(ProofObligations)(() => Promise.resolve(next(id, args))).pipe(Effect.flatMap(showObligations))) : next(id, args),
      },
    },
  )
  const animate = animation(client, () => clientSettings().visualization.format)
  // The client registers the server's own commands (prob.animate, prob.showPOs, …); these must not clash with them.
  const commands: Record<string, (...args: ReadonlyArray<unknown>) => Effect.Effect<void, { readonly _tag: string; readonly message: string }>> = {
    'prob.animation.start': () => Effect.flatMap(activeDocument, (document) => animate.start(document.uri)),
    // The "ProB: animate" code action passes the model's URI.
    'prob.animate.open': (uri) => (typeof uri === 'string' ? animate.start(vscode.Uri.parse(uri)) : Effect.flatMap(activeDocument, (d) => animate.start(d.uri))),
    'prob.animation.stop': () => animate.stop,
    'prob.pickSymbol': () => pickSymbol,
  }
  context.subscriptions.push(
    client,
    ...animate.disposables,
    ...Object.entries(commands).map(([id, f]) => vscode.commands.registerCommand(id, (...a: ReadonlyArray<unknown>) => run(f(...a)))),
    vscode.workspace.onDidOpenTextDocument(detectEventB),
    vscode.workspace.onDidChangeTextDocument(keyboard),
  )
  vscode.workspace.textDocuments.forEach(detectEventB)
  await client.start().catch((e: unknown) =>
    vscode.window.showErrorMessage(`ProB: cannot start ${command} (${e instanceof Error ? e.message : String(e)}); is b-language-server on the PATH, or set in prob.server.command?`),
  )
}
