# GreetSync backend hotfix — 2026-10-03

Fixed the production TypeScript error in `server.ts` media sample upload route.

## Error
`Cannot find name 'getPlatformMetaConfig'. Did you mean 'metaPlatformConfig'?`

## Fix
Changed the invalid helper call:

```ts
const platform = await getPlatformMetaConfig();
```

to the existing project helper:

```ts
const platform = await metaPlatformConfig();
```

No database migration is required specifically for this hotfix.
