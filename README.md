# B Language Server

> [!CAUTION]
> **Parts of this project were AI generated!** Proceed with caution!

VS Code extension for the B method and Event-B that brings the
[B language server](https://github.com/Quoteme/b-language-server) and the
[ProB](https://prob.hhu.de/) animator and model checker into the editor, like
[b.nvim](https://github.com/Quoteme/b.nvim) does for Neovim.

## Installation

```bash
git clone https://github.com/Quoteme/b.vscode && cd b.vscode
npm install && npm run package
code --install-extension b-language-server-*.vsix

# option 1: open vscode inside a nix shell with this:
nix shell github:Quoteme/b.nvim#b-language-server --command code .
# option 2: for the lazy people (introduces hidden state!):
nix profile install github:Quoteme/b.nvim#b-language-server
```

## Features

- **Diagnostics:** ProB's errors and Rodin's proof obligations, with hover and completion.
- **Animation** beside the model (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd>), with current values shown inline.
- **Proof obligation list** and model checking as code actions.
- **Rodin's keyboard** for Event-B (`:` → `∈`), and a symbol picker (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd>).
- **Highlighting** for classical B and Event-B.

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
another location. b.nvim's flake (see [Installation](#installation)) brings its
own Java, Graphviz and ProB.

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
