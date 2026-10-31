import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isEventB, typed } from '../src/eventb.ts'

// The keyboard specs of b.nvim (tests/spec/keyboard), from the Rodin Keyboard User Guide.
const cases: ReadonlyArray<readonly [typed: string, text: string]> = [
  ["a - b * c / d <= e >= 1..2", "a − b ∗ c ÷ d ≤ e ≥ 1‥2"],
  ["x := y + 1", "x ≔ y + 1"],
  ["x :: S", "x :∈ S"],
  ["x :| x' > x", "x :∣ x' > x"],
  ["x : S // not : here", "x ∈ S // not : here"],
  ["f : A +-> B & f : A --> B & f : A >+> B & f : A >-> B & f : A +>> B & f : A ->> B & f : A >->> B", "f ∈ A ⇸ B ∧ f ∈ A → B ∧ f ∈ A ⤔ B ∧ f ∈ A ↣ B ∧ f ∈ A ⤀ B ∧ f ∈ A ↠ B ∧ f ∈ A ⤖ B"],
  ["%x.x : INT | x", "λx·x ∈ ℤ ∣ x"],
  ["a => b or not c <=> true", "a ⇒ b ∨ ¬ c ⇔ ⊤"],
  ["a |-> b ,, c ** d", "a ↦ b ↦ c × d"],
  ["x : S & y /: T", "x ∈ S ∧ y ∉ T"],
  ["!x.(x : NAT => #y.y > x)", "∀x·(x ∈ ℕ ⇒ ∃y·y > x)"],
  ["s <| r |> t <<| q |>> p <+ o >< n || m ~ circ l", "s ◁ r ▷ t ⩤ q ⩥ p  o ⊗ n ∥ m ∼ ∘ l"],
  ["r : S <-> T & r : S <<-> T & r : S <->> T & r : S <<->> T", "r ∈ S ↔ T ∧ r ∈ S  T ∧ r ∈ S  T ∧ r ∈ S  T"],
  ["POW(S) \\/ {} /\\ T \\ U", "ℙ(S) ∪ ∅ ∩ T ∖ U"],
  ["a <: b & a <<: c & a /<: d & a /<<: e", "a ⊆ b ∧ a ⊂ c ∧ a ⊈ d ∧ a ⊄ e"],
  ["NAT1 NATURAL INTER UNION POW1 x oftype INT", "ℕ1 NATURAL ⋂ ⋃ ℙ1 x ⦂ ℤ"],
]

for (const [input, text] of cases) {
  test(`typing ${input}`, () => assert.equal(typed(input), text))
}

test('Event-B is told from classical B by its first keyword', () => {
  assert.equal(isEventB('/* c */\n// x\nmachine m0 sees c0'), true)
  assert.equal(isEventB('context c0'), true)
  assert.equal(isEventB('MACHINE M\nEND'), false)
  assert.equal(isEventB('machines'), false)
})
