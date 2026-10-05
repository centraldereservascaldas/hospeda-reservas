<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/edbabd71-ac78-4216-b8da-f7238d02739c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Guest accounts and Stays synchronization

Guest signup/login is provided by Supabase Auth. Only an email-confirmed account can be synchronized to Stays or start checkout. The browser uses the public Supabase URL/anon key; the server validates access tokens and uses the service-role key to store the private mapping from Supabase user ID to Stays client ID. Stays receives the guest name/email and `isUser: true`; it never receives or stores the website password.

1. Create a Supabase project and enable email confirmations in **Authentication → Providers → Email**.
2. Add the local site URL (for example `http://localhost:3000/`) to **Authentication → URL Configuration → Redirect URLs**.
3. Copy `.env.example` to `.env`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase project settings; set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the server only. Keep the service-role key secret and do not expose it with a `VITE_` prefix.
4. In the Supabase SQL editor, apply `supabase/migrations/20261005000000_guest_profiles.sql`.
5. Ensure the Stays API credential is allowed to create and update booking clients (`POST/PATCH /booking/clients`). The app links an existing client only after Supabase confirms the same email; otherwise it creates one and marks `isUser` true.
6. Restart the server after changing `.env` and run `npm run dev`.

The site blocks checkout if authentication, email confirmation, profile persistence, or Stays synchronization fails. Configure the Supabase email delivery settings before production use.
