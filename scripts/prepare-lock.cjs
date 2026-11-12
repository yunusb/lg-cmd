const { existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
// Bootstrap only: never rewrite a committed lockfile on an EAS builder.
if (!existsSync('package-lock.json')) {
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { stdio: 'inherit' });
}
