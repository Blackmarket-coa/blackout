# Blackout Client

Blackout Client is the modern web runtime for Blackout in this repository. It is the primary browser client and the base we are migrating toward.

## Repository role

- `apps/blackout-client` is the actual client runtime.
- `apps/blackout-web` is the customization transfer shell used to move presets and feature bundles into the client.
- Desktop and mobile surfaces live elsewhere in the repo and build on the same Blackout direction.

## Local development

From the repository root:

```sh
pnpm install
pnpm --dir apps/blackout-client start
```

Useful commands:

```sh
pnpm --dir apps/blackout-client build
pnpm --dir apps/blackout-client typecheck
```

The dev server uses Vite and serves the client locally for iteration.

## Configuration

- Runtime defaults live in [config.json](./config.json).
- Shared docs and repo guidance live under [`/docs`](../../docs).
- The app still carries some compatibility fallbacks while the migration away from inherited Cinny/Element structures continues.

## Build output

Production assets are emitted to `dist/` when you run:

```sh
pnpm --dir apps/blackout-client build
```

Those assets can be served by any static web server.

## Support

- Repository: [Blackmarket-coa/blackout](https://github.com/Blackmarket-coa/blackout)
- Issues: [GitHub issue tracker](https://github.com/Blackmarket-coa/blackout/issues)
- Contribution guidance: [CONTRIBUTING.md](./CONTRIBUTING.md)
