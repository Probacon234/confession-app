# 心事牆

An anonymous community wall for sharing personal stories and offering supportive replies.

## Run & Operate

- Install Node.js 24 and pnpm 10, then run `pnpm install`.
- Copy `.env.example` to `.env` and replace the PostgreSQL and Clerk placeholders with working development credentials.
- Provision a PostgreSQL database, then run `pnpm --filter @workspace/db run push`.
- Start the API in one terminal with `pnpm --filter @workspace/api-server run dev` (port 5000).
- Start the frontend in another terminal with `pnpm --filter @workspace/confession-community run dev` (port 5173), then open `http://localhost:5173`.
- The Vite development server proxies `/api` to `API_SERVER_URL`, which defaults to `http://127.0.0.1:5000`.
- `PORT` overrides the relevant server port; `BASE_PATH` defaults to `/`.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck and build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY`.
- Optional env: `CONFESSION_MODERATOR_EMAILS` (comma-separated verified moderator email addresses), `API_SERVER_URL`, `BASE_PATH`, and `PORT`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: Vite and esbuild

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

- Browse and filter anonymous confessions, including a popularity-ranked feed.
- Sign in to post, react, comment, and report content.
- Moderators can review reported confessions.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
