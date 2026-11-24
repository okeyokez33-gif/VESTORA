# VESTORA Luxury Upgrade — Settings + Welcome Animation

This is an add-on patch. It does not replace `app.js`, `index.html`, wallet logic, markets logic, or deposit RPCs.

## Files
- `vestora-settings.js` — adds the Settings page and its handlers.
- `vestora-luxury.css` — premium styling, theme overrides, and login/welcome animations.

## Install from GitHub on iPhone

1. Upload both files to the root of the `VESTORA` repository.
2. Open `index.html` and edit the `<head>` section.
3. Directly under the existing `markets.css` link, add:
   `<link rel="stylesheet" href="vestora-luxury.css">`
4. At the bottom of `index.html`, find the existing scripts:
   `config.js`, Lightweight Charts, `markets.js`, and `app.js`.
5. Directly after the existing `app.js` script line, add:
   `<script src="vestora-settings.js"></script>`
6. Commit the changes and wait for Render to deploy.

Keep the existing scripts and their order. Do not delete or replace existing files.

## What this adds
- Settings navigation and page.
- Dark/light theme preference saved in this browser.
- Passkey list, registration and removal controls.
- Password change with current-password verification.
- Feedback/report form that inserts into the existing `user_feedback` table.
- Removes the old passkey setup notice from the Overview page.
- A short animated VESTORA welcome reveal after login.

## Important notes
- Passkeys are not the same as a permanent Face ID toggle. The device decides whether authentication uses Face ID, fingerprint, device PIN or another supported method.
- The feedback table policy currently allows the signed-in user to insert their own feedback. A support/admin inbox or retrieval workflow is not yet configured; the form confirms database storage only.
- The password change handler re-verifies the current password. Test this carefully with a non-critical account before launch.
- Theme preference is stored locally in the browser and does not sync across devices.
- Do not publish this app for customers until authentication, RLS policies, deposit verification, support access and production security have been independently reviewed.
