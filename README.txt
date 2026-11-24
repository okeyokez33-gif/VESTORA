VESTORA WEBSITE BUNDLE

Files:
- index.html
- app.js
- styles.css
- config.js

DEPLOY
1. Extract this ZIP.
2. Upload all four files together to the root of your static website hosting project, replacing the existing files.
3. Keep the file names exactly as shown.
4. Redeploy the site.
5. Test login, signup, passkey, wallet and deposit request submission.

IMPORTANT LIMITATIONS
- This bundle connects to the Supabase project already configured in config.js.
- The deposit request UI uses the Supabase RPCs already created: submit_deposit_request, approve_deposit, reject_deposit.
- The current backend does NOT automatically monitor Bitcoin or BNB Smart Chain. An administrator must independently verify each transaction on the correct blockchain before approval.
- The current approval RPC credits the USD wallet based on the USD amount entered by the administrator. Test carefully with non-production accounts before any real funds are accepted.
- The company deposit addresses are included as supplied. Verify ownership, custody, network support, and address correctness before publishing them or accepting deposits.
- Live crypto price feeds and interactive charts are NOT implemented in this bundle. The markets page explicitly says live data integration is pending.
- Do not treat this site as ready to accept real customer funds until blockchain monitoring, secure reconciliation, ledger controls, operational procedures, legal/regulatory requirements, and end-to-end security testing are complete.
- Face ID/passkey login and registration code is retained.
- Customer signup/login remains enabled.
- Never add a Supabase service_role key to config.js.
