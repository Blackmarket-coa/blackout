param()

$ErrorActionPreference = 'Stop'
pnpm build
Write-Host "Deploy from infra/railway, infra/cloudflare, or deploy/docker based on target environment."
