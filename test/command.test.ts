import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bundled, onPath, serverCommand } from '../src/server.ts'

const exists = (files: ReadonlyArray<string>) => (file: string) => files.includes(file)

test('b-language-server is found on the PATH', () => {
  const env = { PATH: '/usr/bin:/nix/store/x/bin' }
  assert.equal(onPath('b-language-server', env, 'linux', exists(['/nix/store/x/bin/b-language-server'])), '/nix/store/x/bin/b-language-server')
  assert.equal(onPath('b-language-server', env, 'linux', exists([])), undefined)
  assert.equal(
    onPath('b-language-server', { Path: 'C:\\bin', PATHEXT: '.EXE;.BAT' }, 'win32', exists(['C:\\bin\\b-language-server.BAT'])),
    'C:\\bin\\b-language-server.BAT',
  )
})

test('the bundled server runs its jar with its own Java', () => {
  const files = ['/ext/server/jre/bin/java', '/ext/server/b-language-server.jar']
  assert.deepEqual(bundled('/ext', 'linux', exists(files)), {
    command: '/ext/server/jre/bin/java',
    args: ['-jar', '/ext/server/b-language-server.jar', '--stdio'],
  })
  assert.equal(bundled('/ext', 'linux', exists(files.slice(1))), undefined)
})

test('the setting wins over the PATH, which wins over the bundled server', () => {
  const bundle = () => ({ command: 'java', args: ['-jar', 'x.jar', '--stdio'] })
  assert.deepEqual(serverCommand(['my-server', '-v'], () => '/bin/b-language-server', bundle), { command: 'my-server', args: ['-v'] })
  assert.deepEqual(serverCommand([], () => '/bin/b-language-server', bundle), { command: '/bin/b-language-server', args: ['--stdio'] })
  assert.deepEqual(serverCommand([], () => undefined, bundle), bundle())
  assert.deepEqual(serverCommand([], () => undefined, () => undefined), { command: 'b-language-server', args: ['--stdio'] })
})
