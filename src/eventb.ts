// Event-B specifics without VS Code: telling Event-B from classical B, and Rodin's keyboard, which
// replaces ASCII combinations such as `:` or `-->` by their symbols (`∈`, `→`) once the next
// character shows that the combination is complete. Combinations made of letters (`NAT`, `or`)
// are only replaced as whole words. A port of b.nvim's lua/prob/keyboard.lua.
import { Array, Option, pipe } from 'effect'
import { symbols } from './symbols.ts'

/** Replaces `text[start, end)` of the text before the cursor. */
export interface Replacement {
  readonly start: number
  readonly end: number
  readonly text: string
}

const [operatorCombos, wordCombos] = Array.partition(symbols, (c) => /^\w+$/.test(c.ascii))
const words = new Map(wordCombos.map((c) => [c.ascii, c.symbol]))
const operators = new Map(operatorCombos.map((c) => [c.ascii, c.symbol]))
const prefixes = new Set(operatorCombos.flatMap((c) => Array.makeBy(c.ascii.length, (i) => c.ascii.slice(0, i + 1))))
const operatorChars = new Set(operatorCombos.flatMap((c) => [...c.ascii]))

const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && char !== '' && (/\w/.test(char) || char.charCodeAt(0) >= 128)

/** Whether the end of `text` lies in a comment, which keeps its spelling. */
const inComment = (text: string): boolean => /\/\/[^\n]*$/.test(text) || text.lastIndexOf('/*') > text.lastIndexOf('*/')

/** Lengths from `max` down to 1, for longest-first matching. */
const longestFirst = (max: number): Array<number> => (max < 1 ? [] : Array.reverse(Array.range(1, max)))

/** Replaces the combinations in a run of operator characters, longest first. */
const translate = (run: string): string =>
  run === ''
    ? ''
    : pipe(
        longestFirst(Math.min(5, run.length)),
        Array.findFirst((n) => Option.map(Option.fromNullable(operators.get(run.slice(0, n))), (symbol) => [n, symbol] as const)),
        Option.match({
          onNone: () => run.slice(0, 1) + translate(run.slice(1)),
          onSome: ([n, symbol]) => symbol + translate(run.slice(n)),
        }),
      )

/** The operator run that `text` ends with, keeping the longest tail that `next` may still complete. */
const settleOperator = (run: string, start: number, next: string | undefined): Option.Option<Replacement> => {
  const pending =
    next !== undefined && operatorChars.has(next)
      ? pipe(
          longestFirst(run.length + 1),
          Array.findFirst((n) => prefixes.has((run + next).slice(-n))),
          Option.match({ onNone: () => 0, onSome: (n) => n - 1 }),
        )
      : 0
  const head = run.slice(0, run.length - pending)
  return Option.liftPredicate({ start, end: start + head.length, text: translate(head) }, () => head !== '')
}

/** The combination of letters that `text` ends with, if it is a whole word and not a label. */
const settleWord = (text: string): Option.Option<Replacement> =>
  pipe(
    Option.fromNullable(text.match(/\w+$/)?.[0]),
    Option.flatMap((word) => {
      const before = text.slice(-word.length - 1, -word.length)
      return isWordChar(before) || before === '@'
        ? Option.none()
        : Option.map(Option.fromNullable(words.get(word)), (symbol) => ({ start: text.length - word.length, end: text.length, text: symbol }))
    }),
  )

/** The replacement of the combination at the end of `text`, followed by `next` (nothing: end of input). */
export const settle = (text: string, next?: string): Option.Option<Replacement> => {
  if (inComment(text)) {
    return Option.none()
  }
  const punctuation = text.match(/[!-/:-@[-`{-~]*$/)?.[0] ?? ''
  const skip = Option.getOrElse(Array.findFirstIndex([...punctuation], (c) => operatorChars.has(c)), () => punctuation.length)
  const run = punctuation.slice(skip)
  const start = text.length - run.length
  if (run.includes('//') || run.includes('/*') || (run.endsWith('/') && (next === '/' || next === '*'))) {
    return Option.none()
  }
  return pipe(
    run !== '' ? settleOperator(run, start, next) : isWordChar(next) ? Option.none() : settleWord(text),
    Option.filter((r) => r.text !== text.slice(r.start, r.end)),
  )
}

export const apply = (text: string) => (r: Replacement): string => text.slice(0, r.start) + r.text + text.slice(r.end)

const settled = (text: string, next?: string): string => Option.match(settle(text, next), { onNone: () => text, onSome: apply(text) })

/** `input` as it reads after typing it character by character. */
export const typed = (input: string): string => settled(Array.reduce([...input], '', (text, char) => settled(text, char) + char))

/** Event-B in Camille notation (`machine m0`, `context c0`) starts with a lowercase keyword. */
export const isEventB = (text: string): boolean =>
  /^\s*(machine|context)\b/.test(text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' '))
