# VESTORA V1 demo website

Files: `index.html`, `styles.css`, `app.js`, `config.js`.

## Included
- Supabase email/password sign-up, login and password reset
- Customer profile and role lookup
- Read-only demo wallet
- Investment plan catalogue
- Cryptocurrency asset catalogue (no live prices)
- Read-only activity history
- Admin-only navigation and read-only plan list
- Responsive futuristic UI for mobile and desktop

## Before testing
1. Supabase Authentication > Providers: enable Email.
2. Supabase Authentication > URL Configuration: set Site URL to your deployed URL and add the deployed URL to Redirect URLs.
3. Register your own account in VESTORA.
4. To grant your own account admin access, find your user UUID in Supabase Authentication > Users and run this in SQL Editor, replacing the UUID:
   `insert into public.user_roles (user_id, role) values ('YOUR_USER_UUID','admin') on conflict (user_id) do update set role='admin';`

Never give customers admin role. Never place a service_role/secret key in browser files.

## Demo-only limitations
No real deposits, withdrawals, transfers, trades or investment purchases are implemented. Wallet is read-only. Crypto prices are not live. Plan figures are illustrative only, not offers, forecasts or promised returns. The admin view is read-only.

Before real-money services, obtain appropriate regulatory approvals/partners and implement server-side payment verification, secure ledger accounting, audit logs, fraud controls and tested access policies. Never credit balances from browser code.

## Hosting
This is a static frontend. Check any hosting provider's current free-tier limits, commercial-use terms, sleep behavior and domain costs before launch.
