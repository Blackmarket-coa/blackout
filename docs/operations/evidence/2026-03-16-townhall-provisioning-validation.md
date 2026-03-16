# Evidence — Townhall staging provisioning assets validation

## Artifacts

- `infra/townhall-staging/docker-compose.yml`
- `infra/townhall-staging/livekit.yaml`
- `docs/operations/runbooks/townhall-livekit-coturn-provisioning.md`

## Validation command

- `ruby -ryaml -e 'YAML.load_file("infra/townhall-staging/docker-compose.yml"); YAML.load_file("infra/townhall-staging/livekit.yaml"); puts "validated yaml files"'`

## Result

- YAML parsing succeeded for both provisioning files.
- Staging topology now has explicit, versioned provisioning assets in-repo.
