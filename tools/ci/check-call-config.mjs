import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const files = {
  compose: 'infra/townhall-staging/docker-compose.yml',
  livekit: 'infra/townhall-staging/livekit.yaml',
  deployDocA: 'docs/deploy-fedora-tauri.md',
  deployDocB: 'docs/deploying-blackout-fedora-tauri.md',
  prodCompose: 'infra/single-server-baseline/docker-compose.yml',
  prodLivekit: 'infra/single-server-baseline/livekit/livekit.yaml.template',
  prodNginx: 'infra/single-server-baseline/nginx/sites-available/theblackout.app.conf',
  prodEnv: 'infra/single-server-baseline/.env.example',
};

const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), 'utf8');

const compose = read(files.compose);
const livekit = read(files.livekit);
const deployA = read(files.deployDocA);
const deployB = read(files.deployDocB);
const prodCompose = read(files.prodCompose);
const prodLivekit = read(files.prodLivekit);
const prodNginx = read(files.prodNginx);
const prodEnv = read(files.prodEnv);

const errors = [];

if (!/livekit\/livekit-server/.test(compose)) {
  errors.push('townhall-staging compose is missing livekit/livekit-server image.');
}
if (!/lk-jwt-service/.test(compose)) {
  errors.push('townhall-staging compose is missing the lk-jwt-service token bridge.');
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

// Production single-server baseline: the SFU, the token bridge, the nginx
// exposure, and the well-known focus advertisement must all be present —
// any one missing leaves calls in degraded/unconfigured mode.
if (!/livekit\/livekit-server/.test(prodCompose)) {
  errors.push('single-server-baseline compose is missing livekit/livekit-server.');
}
if (!/lk-jwt-service/.test(prodCompose)) {
  errors.push('single-server-baseline compose is missing the lk-jwt-service token bridge.');
}
if (!/tcp_port:\s*7881/.test(prodLivekit) || !/port_range_start:\s*50100/.test(prodLivekit)) {
  errors.push('single-server-baseline livekit.yaml.template is missing RTC ports (7881 tcp, 50100+ udp).');
}
if (!/location \^~ \/livekit\/jwt\//.test(prodNginx) || !/location \^~ \/livekit\/sfu\//.test(prodNginx)) {
  errors.push('single-server-baseline nginx conf is missing the /livekit/jwt and /livekit/sfu locations.');
}
if (!/org\.matrix\.msc4143\.rtc_foci/.test(prodNginx) || !/livekit_service_url/.test(prodNginx)) {
  errors.push('single-server-baseline well-known client response is missing the MSC4143 rtc_foci focus.');
}
if (!/LIVEKIT_API_KEY/.test(prodEnv) || !/LIVEKIT_PUBLIC_WS_URL/.test(prodEnv)) {
  errors.push('single-server-baseline .env.example is missing the LIVEKIT_* variables.');
}

if (errors.length > 0) {
  console.error('Call configuration readiness checks failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('Call configuration readiness checks passed.');
