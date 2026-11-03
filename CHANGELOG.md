# Changelog

## 0.1.2

- **Fix:** "ProB: Animate with ProB" did nothing when the extension had loaded before an editor
  was active; it now opens the animation, or says that no B or Event-B file is open.
- **Z3:** the bundled ProB on Linux x64 and macOS now brings Z3 (5.0.0), which it uses for proof
  obligations its own solver cannot decide. ProB has no Z3 on Windows.

## 0.1.1

- Extension icon.

## 0.1.0

- First release on the Marketplace: diagnostics, proof obligations, hover, completion, animation
  and Rodin's keyboard, with b-language-server, ProB and a Java runtime bundled per platform.
