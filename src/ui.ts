// VS Code's prompts as effects: a cancelled prompt fails with NoSuchElementException, which ends
// the effect quietly when `run` runs it.
import * as vscode from 'vscode'
import { Cause, Effect } from 'effect'

/** Asks for a line of text. */
export const ask = (prompt: string, value = ''): Effect.Effect<string, Cause.NoSuchElementException> =>
  Effect.promise(() => Promise.resolve(vscode.window.showInputBox({ prompt, value }))).pipe(Effect.flatMap(Effect.fromNullable))

/** Fails like a cancelled prompt on empty text. */
export const nonEmpty = <E, R>(text: Effect.Effect<string, E, R>) =>
  Effect.filterOrFail(text, (t) => t !== '', () => new Cause.NoSuchElementException())

/** Lets the user pick one of `items`, shown with `show`. */
export const pick = <A>(items: ReadonlyArray<A>, show: (item: A) => vscode.QuickPickItem, placeHolder: string): Effect.Effect<A, Cause.NoSuchElementException> =>
  Effect.promise(() =>
    Promise.resolve(vscode.window.showQuickPick(items.map((item) => ({ ...show(item), item })), { placeHolder, matchOnDescription: true, matchOnDetail: true })),
  ).pipe(
    Effect.flatMap(Effect.fromNullable),
    Effect.map((picked) => picked.item),
  )

/** Shows `line` and `character` (0-based) of `uri`, in `viewColumn`. */
export const reveal = (at: { readonly uri: string; readonly line: number; readonly character: number }, viewColumn = vscode.ViewColumn.Active) => {
  const position = new vscode.Position(at.line, at.character)
  return Effect.promise(() =>
    Promise.resolve(vscode.window.showTextDocument(vscode.Uri.parse(at.uri), { viewColumn, selection: new vscode.Range(position, position) })),
  ).pipe(Effect.asVoid)
}

/** Runs `effect` from a VS Code callback, showing its failures unless a prompt was cancelled. */
export const run = <E extends { readonly _tag: string; readonly message: string }>(effect: Effect.Effect<unknown, E>): Promise<void> =>
  Effect.runPromise(
    effect.pipe(
      Effect.asVoid,
      Effect.catchAll((e) => (e._tag === 'NoSuchElementException' ? Effect.void : Effect.sync(() => void vscode.window.showErrorMessage(`ProB: ${e.message}`)))),
    ),
  )
