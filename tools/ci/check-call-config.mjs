import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const files = {
  compose: 'infra/townhall-staging/docker-compose.yml',
  livekit: 'infra/townhall-staging/livekit.yaml',
  deployDocA: 'docs/deploy-fedora-tauri.md',
  deployDocB: 'docs/deploying-blackout-fedora-tauri.md',
};

const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), 'utf8');

const compose = read(files.compose);
const livekit = read(files.livekit);
const deployA = read(files.deployDocA);
const deployB = read(files.deployDocB);

const errors = [];

if (!/livekit\/livekit-server/.test(compose)) {
  errors.push('townhall-staging compose is missing livekit/livekit-server image.');
}
if (!/7880:7880/.test(compose)) {
  errors.push('townhall-staging compose is missing 7880 mapping.');
}
if (!/port:\s*7880/.test(livekit) || !/tcp_port:\s*7881/.test(livekit)) {
  errors.push('townhall-staging livekit.yaml is missing RTC ports 7880/7881.');
}
if (!/rtc_foci|element_call/.test(deployA) || !/livekit\/sfu/.test(deployA)) {
  errors.push('deploy-fedora-tauri.md is missing element_call/livekit configuration references.');
}
if (!/element_call/.test(deployB) || !/livekit\/sfu/.test(deployB)) {
  errors.push('deploying-blackout-fedora-tauri.md is missing element_call/livekit configuration references.');
}

if (errors.length > 0) {
  console.error('Call configuration readiness checks failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('Call configuration readiness checks passed.');
