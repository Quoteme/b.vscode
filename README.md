# B Language Server

> [!CAUTION]
> **Parts of this project were AI generated!** Proceed with caution!

VS Code extension for the B method and Event-B, using the
[B language server](https://github.com/Quoteme/b-language-server) and the
[ProB](https://prob.hhu.de/) animator and model checker. It is the VS Code
counterpart of [b.nvim](https://github.com/Quoteme/b.nvim).

- ProB's parse, type and well-definedness errors, and Rodin's static checks and
  proof obligations, as diagnostics. Hover documentation and completion come
  with them.
- **Animation** in a panel beside the model (code action _ProB: animate_,
  `ProB: Animate with ProB`, <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd>). The
  panel lists the enabled events, the state, the invariants and the history.
  The model shows the current values next to their declarations.
- **Proof obligations** in a list you can jump from (code action _ProB: list
  proof obligations_). Code actions also model check and discharge them.
- **Rodin's keyboard** in Event-B: `:` becomes `∈`, `-->` becomes `→`, `NAT`
  becomes `ℕ`, and so on. `ProB: Insert an Event-B symbol`
  (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd>) picks a symbol from a list.
- Highlighting for classical B (`.mch`, `.ref`, `.imp`, `.rmch`, `.def`) and
  for Event-B in Camille notation (`.mch` files starting with `machine` or
  `context`).

## Animation panel keys

| Key                 | Action                                                    |
| ------------------- | --------------------------------------------------------- |
| <kbd>⏎</kbd>, click | execute the event, go to the history step, or show source |
| `p`                 | execute an event with a parameter predicate               |
| `u` / `U`           | step back / forward (`3u` steps back three times)         |
| `r`                 | execute random events (`[count]r`)                        |
| `f`                 | find a state satisfying a predicate                       |
| `m`                 | model check from here                                     |
| `v`                 | visualise the state (graphs open in a viewer, tables in a split) |
| `I`                 | open the graphical animation, or VisB                     |
| `d`                 | show the source of the item                               |
| `R` / `q`           | restart / stop the animation                              |
| `j` `k`, arrows     | move between rows                                         |
| `?`                 | toggle help                                               |

## Requirements

`b-language-server` must be on the `PATH`; set `prob.server.command` to use
another location. With Nix, b.nvim's flake provides it together with its Java,
Graphviz and ProB:

```sh
nix shell github:Quoteme/b.nvim#b-language-server
code .
```

## Settings

| Setting                     | Default                             |
| --------------------------- | ----------------------------------- |
| `prob.server.command`       | `["b-language-server", "--stdio"]`  |
| `prob.keyboard`             | `true`                              |
| `prob.visualization.format` | `svg`                               |
| `prob.probHome`             | `DEFAULT`                           |
| `prob.wdChecks`             | `true`                              |
| `prob.strictChecks`         | `true`                              |
| `prob.performanceHints`     | `true`                              |
| `prob.debugMode`            | `false`                             |
| `prob.poTimeout`            | `1000` (ms per proof obligation)    |
| `prob.modelCheckStates`     | `100000`                            |

## Development

```sh
npm install
npm run check   # strict type check
npm test        # keyboard, wire format and panel tests
npm run package # b-language-server-<version>.vsix
code --extensionDevelopmentPath=$PWD path/to/models
```

| File               | Contents                                                          |
| ------------------ | ----------------------------------------------------------------- |
| `src/extension.ts` | language client, commands, Event-B detection, keyboard hook       |
| `src/protocol.ts`  | Schemas of the server's wire types, and the typed commands        |
| `src/settings.ts`  | the `prob` settings as `Schema.Class`es                           |
| `src/animation.ts` | the animation session: panel, inline values, actions              |
| `src/view.ts`      | the panel's HTML and the actions it sends (pure)                  |
| `src/eventb.ts`    | Rodin's keyboard and Event-B detection (pure)                     |
| `src/ui.ts`        | VS Code prompts as effects                                        |
