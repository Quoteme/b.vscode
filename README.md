# B Language Server

> [!CAUTION]
> **Parts of this project were AI generated!** Proceed with caution!

VS Code extension for the B method and Event-B that brings the
[B language server](https://github.com/Quoteme/b-language-server) and the
[ProB](https://prob.hhu.de/) animator and model checker into the editor, like
[b.nvim](https://github.com/Quoteme/b.nvim) does for Neovim.

<img width="973" height="570" alt="image" src="https://github.com/user-attachments/assets/19382739-7eea-4c67-9d45-5f13d35c5254" />

## Installation

### From the Marketplace (recommended)

Install [B/ProB Advanced Language Support](https://marketplace.visualstudio.com/items?itemName=happel.prob-language-extension)
from the Extensions view, or run:

```bash
code --install-extension happel.prob-language-extension
```

- **Benefits:** nothing else to install. On Linux x64, macOS and Windows x64 the extension brings
  b-language-server, ProB with Z3 and a Java runtime along, and VS Code keeps it up to date.
- **Downsides:** a large download (around 80 MB per platform). Graph visualisations still need
  [Graphviz](https://graphviz.org/). ProB has no Z3 on Windows, and Z3 needs glibc 2.39 or
  newer on Linux. Other platforms get no bundled server. On NixOS the bundled ProB and Java only
  run with `nix-ld`.

### With Nix

A `b-language-server` on the `PATH` takes precedence over the bundled one. b.nvim's flake builds
it with its own Java, ProB, Z3 and Graphviz, so it works on NixOS without `nix-ld`:

```bash
# option 1: open vscode inside a nix shell with this:
nix shell github:Quoteme/b.nvim#b-language-server --command code .
# option 2: for the lazy people (introduces hidden state!):
nix profile install github:Quoteme/b.nvim#b-language-server
```

### From source

This builds the extension without a bundled server, so it needs `b-language-server` on the `PATH`
(see [With Nix](#with-nix)):

```bash
git clone https://github.com/Quoteme/b.vscode && cd b.vscode
npm install && npm run package
code --install-extension prob-language-extension-*.vsix
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

The extension starts, in this order: the command in `prob.server.command`;
`b-language-server --stdio` if it is on the `PATH` (b.nvim's flake brings its own
Java, Graphviz and ProB); the server bundled with the platform's vsix.

## Settings

| Setting                     | Default                             |
| --------------------------- | ----------------------------------- |
| `prob.server.command`       | `[]` (PATH, then bundled)           |
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
B_LANGUAGE_SERVER=$(which b-language-server) npm test  # also against the real server
npm run package # prob-language-extension-<version>.vsix
code --extensionDevelopmentPath=$PWD path/to/models

# a vsix with the server bundled, for the platform this runs on (needs a JDK 21 for jlink)
scripts/prepare-server-jar.sh path/to/b-language-server-all.jar linux-x64 /tmp/server.jar
scripts/bundle-server.sh /tmp/server.jar
npx vsce package --target linux-x64
```

| File               | Contents                                                          |
| ------------------ | ----------------------------------------------------------------- |
| `src/extension.ts` | language client, commands, Event-B detection, keyboard hook       |
| `src/server.ts`    | which server command to start: setting, PATH or bundled           |
| `src/protocol.ts`  | Schemas of the server's wire types, and the typed commands        |
| `src/settings.ts`  | the `prob` settings as `Schema.Class`es                           |
| `src/animation.ts` | the animation session: panel, inline values, actions              |
| `src/view.ts`      | the panel's HTML and the actions it sends (pure)                  |
| `src/eventb.ts`    | Rodin's keyboard and Event-B detection (pure)                     |
| `src/ui.ts`        | VS Code prompts as effects                                        |

### Releasing

Pushing a tag `v<version>` matching `package.json`'s version runs
`.github/workflows/release.yml`: it builds b-language-server at `SERVER_REF`, adds Z3 to its probcli
(`scripts/prepare-server-jar.sh`; ProB has no Z3 on Windows), packages a vsix per platform with
the server and a jlinked Java runtime, tests it against the bundled server and
publishes all of them by trusted publishing: the publisher `happel` has a policy for this
repository and `release.yml`, so no token is stored.

## Alternatives

[hhu-stups/b-language-extension](https://github.com/hhu-stups/b-language-extension)
offers parts of the features of this project.

## Acknowledgements

This project builds on
[hhu-stups/b-language-server](https://github.com/hhu-stups/b-language-server).
