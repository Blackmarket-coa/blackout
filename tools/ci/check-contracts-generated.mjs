import { execFileSync } from 'node:child_process';

execFileSync('pnpm', ['--filter', '@blackout/contracts', 'generate'], { stdio: 'inherit' });

try {
  execFileSync('git', ['diff', '--exit-code', '--', 'packages/contracts/src/generated'], { stdio: 'inherit' });
} catch {
  console.error('\nContract generation drift detected.');
  console.error('Run: pnpm contracts:generate and commit updated files under packages/contracts/src/generated.');
  process.exit(1);
}

console.log('Generated contracts are up to date.');
