# Getting Started

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- API keys for Anthropic, Resend (and optionally Gmail/Outlook OAuth)

## Setup

1. **Clone and install**

   ```bash
   npm install
   ```

2. **Environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Fill in all values in `.env.local`. Never commit this file.

3. **Database**

   Apply the initial migration in your Supabase project:

   - Open Supabase Dashboard → SQL Editor
   - Run `supabase/migrations/001_initial_schema.sql`

   Or use the Supabase CLI:

   ```bash
   supabase db push
   ```

4. **Storage**

   Create a private bucket named `documents` in Supabase Storage.

5. **Run locally**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Project layout

```
app/
  (auth)/     CPA login/signup
  (cpa)/      CPA dashboard
  (client)/   Client portal (OTP)
  api/        API routes
components/   UI components
lib/
  supabase/   All database queries
  claude/     AI extraction
  email/      Resend + Gmail/Outlook
types/        Shared TypeScript types
```

## Next steps

- Scaffold the Next.js app with the structure above
- Implement CPA auth via Supabase
- Add client OTP flow and document upload portal
- Connect Claude for extraction and build the CPA review dashboard
