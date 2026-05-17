import { buildDesktopAssets, run, workspaceRoot } from './desktop-build-utils.mjs'

run('node', ['scripts/generate-desktop-icon.mjs'])
buildDesktopAssets()

run(
  'npx.cmd',
  ['electron-builder', '--config', 'electron-builder.json', '--win', 'nsis'],
  workspaceRoot,
  {
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    },
  },
)
