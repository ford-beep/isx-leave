# Design preview

`index.html` is a **static snapshot** of the interface, rendered from:

* the application's real stylesheet (`src/app/globals.css`), and
* the real seeded demo database (as at 14 August 2026).

Open it in any browser to review the design without running the app. Buttons
and forms are inert — run `npm run dev` for the working application.

`build-preview.ts` regenerates the snapshot (requires a seeded database and
`psql` on PATH):

```bash
npx tsx design-preview/build-preview.ts
```

It is a review aid, not part of the application, and is safe to delete.
