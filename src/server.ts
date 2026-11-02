// Which command starts b-language-server: the one the user set, one on the PATH (as b.nvim's flake
// provides), or the one bundled in the platform's vsix: a jlinked Java runtime and the server's jar,
// whose prob-java brings probcli along (see scripts/bundle-server.sh).
import * as fs from 'node:fs'
import * as path from 'node:path'

export interface ServerCommand {
  readonly command: string
  readonly args: ReadonlyArray<string>
}

const isFile = (file: string) => fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false

/** The executable `name` in a directory of the PATH of `env`, if any. */
export const onPath = (name: string, env: NodeJS.ProcessEnv = process.env, platform = process.platform, exists = isFile): string | undefined => {
  const separator = platform === 'win32' ? ';' : ':'
  const directories = (env['PATH'] ?? env['Path'] ?? '').split(separator).filter((d) => d !== '')
  const extensions = platform === 'win32' ? (env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';') : ['']
  const join = platform === 'win32' ? path.win32.join : path.posix.join
  return directories.flatMap((d) => extensions.map((e) => join(d, name + e))).find(exists)
}

/** The server bundled in the extension at `root`, if this vsix bundles one. */
export const bundled = (root: string, platform = process.platform, exists = isFile): ServerCommand | undefined => {
  const join = platform === 'win32' ? path.win32.join : path.posix.join
  const java = join(root, 'server', 'jre', 'bin', platform === 'win32' ? 'java.exe' : 'java')
  const jar = join(root, 'server', 'b-language-server.jar')
  return exists(java) && exists(jar) ? { command: java, args: ['-jar', jar, '--stdio'] } : undefined
}

/** The command the user set, else b-language-server on the PATH, else the bundled server. */
export const serverCommand = (setting: ReadonlyArray<string>, onPath: () => string | undefined, bundled: () => ServerCommand | undefined): ServerCommand => {
  const [command, ...args] = setting
  if (command !== undefined) {
    return { command, args }
  }
  const found = onPath()
  return found !== undefined ? { command: found, args: ['--stdio'] } : (bundled() ?? { command: 'b-language-server', args: ['--stdio'] })
}

/** Makes the bundled runtime's programs executable, should unpacking the vsix have dropped the mode. */
export const makeExecutable = (root: string) => {
  if (process.platform === 'win32') {
    return
  }
  const jre = path.join(root, 'server', 'jre')
  const programs = [
    ...fs.readdirSync(path.join(jre, 'bin')).map((name) => path.join(jre, 'bin', name)),
    path.join(jre, 'lib', 'jspawnhelper'),
  ]
  for (const program of programs.filter(isFile)) {
    const mode = fs.statSync(program).mode
    if ((mode & 0o111) !== 0o111) {
      fs.chmodSync(program, mode | 0o755)
    }
  }
}
