# Vault Frontend

React + TypeScript + Vite frontend for the Vault document-signing API. This is a separate frontend project; it does not modify the backend.

## Requirements

- Node.js 20+ (the backend is currently being used with Node 22)
- pnpm
- Vault backend running with MongoDB, Redis, OpenBao, and Supabase configured

## Run locally

1. Copy `.env.example` to `.env`.
2. Ensure `VITE_BACKEND_URL` matches the backend's `PORT` in `backend/.env`. The example uses `http://127.0.0.1:7860`; change it to `http://127.0.0.1:7001` if you're using the backend's default port.
3. Install and start:

   ```bash
   pnpm install
   pnpm dev
   ```

4. Open <http://127.0.0.1:5173>.

Vite proxies `/api` to the backend so cookies and CSRF requests use the same browser origin during local development. Do not expose backend secrets in frontend environment variables.

## Implemented screens

- Sign in and registration, including handle availability.
- Dashboard and paginated document library.
- PDF upload with preflight result, explicit `vault-strict-v1` vs `vault-pdf-text-v1` selection, and password reauthentication before signing.
- Document details, version history, verified downloads, and signed manifest/proof view.
- Candidate PDF verification with separate proof-chain, byte-integrity, and text-evidence results.
- Account sessions, key versions, key rotation/revocation, profile update, and password change.

## API assumptions

The frontend follows `docs/api/documents-v1.md` from the supplied backend baseline. PDF upload and candidate verification use raw `application/pdf` request bodies, not multipart form data. Authenticated cookies are HTTP-only; CSRF tokens are held in memory and refreshed through `/api/v1/auth/me` after page reload.

For a separate frontend origin in production, configure backend CORS to allow the frontend origin, credentials, and the `X-CSRF-Token` and `X-Document-Name` request headers. The development proxy avoids that cross-origin requirement locally.

## Limitations / notes

- The verification picker initially lists the latest signed version for each document; use a document's detail page to inspect older versions. (A direct deep link to an older version should be supported where provided.)
- The dashboard summary counts signed/pending/text-ready versions among the latest 20 returned items; the total document card uses backend pagination metadata.
- Visual-only PDF changes are outside the current text-evidence profile's guarantees; the UI states this explicitly.
