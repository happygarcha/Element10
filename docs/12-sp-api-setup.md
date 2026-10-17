# Connect your Amazon seller account (SP-API, free, private app for yourself)

Source for the steps: Amazon's SP-API docs ("Onboarding as a Developer", "Self Authorization", "Connect to the SP-API"). Those pages are 1-4 years old in search results, so **follow what Seller Central shows today if it differs**. Role names and token lifetimes in particular were reported inconsistently (one page says refresh tokens do not expire, another says 365 days; client secrets 180 days). Plan to re-authorise if calls start failing with 401/403.

## What you get, and what you do not
- Catalogue details, category and best-seller rank for ASINs you type in (both amazon.ca and amazon.com; the Canada marketplace id is `A2EUQ1WTGCTBG2`, US `ATVPDKIKX0DER`).
- Amazon's own fee estimate (referral + FBA) for an ASIN at a price.
- **Not** competitor sales, search volume, keyword ranks or a browsable product database. Brand Analytics needs Brand Registry. Element10 does not call anything beyond Catalog Items and Product Fees today.

## Steps
1. **Seller account type:** developer registration normally needs a Professional selling plan. Check in Seller Central -> Settings -> Account Info.
2. **Register as a developer (private, own use):** Seller Central -> Apps and Services -> **Develop Apps** (Developer Central). Create a developer profile. When asked, choose the *private developer / building for your own seller account* option. Roles to request: **Product Listing** (Catalog Items) and **Pricing** (Product Fees). Do **not** request roles for orders, customer data, finances or listings changes: Element10 does not need them and extra roles mean extra review.
3. **Create the app** (name: Element10, type: SP-API). Add the roles above. Save as draft.
4. **Get credentials** (Login with Amazon): on the app page choose **View** next to the LWA credentials. You get a **Client ID** and **Client secret**.
5. **Self-authorise:** on the app page choose **Authorize** (or "Authorize app") for your own seller account. Amazon shows a **refresh token** once. If you added roles after publishing, include `version=beta` in the authorisation if you authorise from a URL, and generate a new token after any role change.
6. **Store them as server secrets, never in chat or GitHub.** On your computer, with the Supabase CLI logged in and linked (docs/06):
   ```
   supabase secrets set SPAPI_LWA_CLIENT_ID=... SPAPI_LWA_CLIENT_SECRET=... SPAPI_REFRESH_TOKEN=...
   supabase secrets set ALLOWED_ORIGINS=https://happygarcha.github.io ALLOWED_EMAILS=<your login email>
   supabase functions deploy status spapi
   ```
7. In Element10: **Connections** should show Amazon SP-API "secret set". Open a product (import one ASIN first) and press **Amazon SP-API: catalogue + rank**. The result is Amazon's real answer, or the real error text.

## Safety
- Do not paste the client secret or refresh token into any chat, issue or file in the repository. If one leaks, rotate the client secret in Developer Central and generate a new refresh token.
- The function is read-only and only answers your logged-in account.
- Not yet tested against the live Amazon API: the first call is the real test. If it fails, send me the error message (not the secrets).
