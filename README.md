# CodaKid Content Intelligence Dashboard

Private Netlify dashboard for monitoring CodaKid blog pillars, internal links, content opportunities, competitor activity, and AI-generated SEO recommendations.

## Local Setup

```bash
npm install
npm run dev
```

For Netlify Functions locally:

```bash
npx netlify dev
```

## Environment

Copy `.env.example` to `.env` and add keys as needed. The dashboard works without Search Console or GA4 in WordPress-only mode, but login requires Neon.

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
VITE_SITE_NAME=CodaKid
VITE_WORDPRESS_BASE=https://codakid.com
DATABASE_URL=
NETLIFY_DATABASE_URL=
NEON_DATABASE_URL=
DASHBOARD_ADMIN_EMAIL=
DASHBOARD_ADMIN_PASSWORD=
```

For deployed Netlify builds, set these in **Netlify > Site configuration > Environment variables**. Local `.env` files are ignored by git and will not be pushed.

## Secure Access

The app is invite-only. There is no public signup.

Auth uses:

- Neon Postgres tables for users, invitations, and sessions
- HTTP-only session cookies
- 30-day session persistence
- Passwords hashed with Node `scrypt`
- Admin-only invite links

Set one of these database URLs:

```bash
NETLIFY_DATABASE_URL=
DATABASE_URL=
NEON_DATABASE_URL=
```

If Netlify's Neon integration is enabled, it may provide `NETLIFY_DATABASE_URL` automatically.

To bootstrap the first admin, set:

```bash
DASHBOARD_ADMIN_EMAIL=you@company.com
DASHBOARD_ADMIN_PASSWORD=use-a-strong-12-character-password
```

On first auth request, the app creates the tables and first admin if no users exist. After logging in, admins can create invite links from the dashboard.

## Current Data Sources

- Public WordPress REST API: posts, categories, content, links
- Public competitor sitemap sampling
- Deterministic fallback insights until `OPENAI_API_KEY` is configured

## Next Integrations

- Google Search Console API
- GA4 Data API
- Supabase historical snapshots
- Meta/Facebook Ads API overlay
- Optional SERP provider such as DataForSEO or SerpApi
