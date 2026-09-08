# Database

Postgres 16. Migrations live in `db/migrations/NNNN_name.sql`, applied in order by
`node src/db/migrate.ts` (tracked in `schema_migrations`). Local: `docker compose up -d`,
`DATABASE_URL=postgres://kennel:kennel@127.0.0.1:5433/kennel`.

The app connects as a superuser only for migrations. At runtime it uses role `kennel_app`
(created by 0001) and sets `app.tenant_id` per transaction; RLS does the rest.
