# annakut-menu-selection

This repo contains the Node.js + React version of the Annakut offering flow, using Firebase Authentication with email/password sign-in, Firebase Realtime Database persistence, and Geoapify-powered Thunder Bay-only address autocomplete.

## Stack

- `client/`: React + Vite frontend
- `server/`: Express API with Firebase ID-token validation and Firebase Realtime Database writes
- `frontend/static/seva/data/menu.json`: menu source used by the API
- `frontend/static/assets/`: image assets served by the API

## App flow

The app supports the current seva journey:

`Home -> Rules -> Category -> Subcategory -> Food List -> Cart -> Details -> Summary -> Confirmed`

It also supports modifying an existing offering, booked-item locking, reminder emails for released held items, and PDF receipt download.

## Item reservation behavior

- When a devotee selects an item, the app places that item on hold for `10 minutes`.
- If the devotee does not complete submission in that window, the hold expires automatically and the item becomes available again.
- Once the offering is submitted successfully, the held items become permanently taken.
- When a devotee returns later, the app resumes their latest offering so new selections update the same order by default.

## Confirmation emails

- The backend can send confirmation emails after a successful submission when SMTP is configured.
- If SMTP is not configured, the app still provides the on-screen confirmation and downloadable PDF receipt.

## Auth setup

1. Create a Firebase project.
2. In Firebase Authentication, enable `Email/Password`.
3. Create a Firebase Realtime Database instance.
4. Copy:
   - [client/.env.example](c:/Users/patel/Downloads/annakut-project/annakut-project/annakut-menu-selection/client/.env.example) to `client/.env`
   - [server/.env.example](c:/Users/patel/Downloads/annakut-project/annakut-project/annakut-menu-selection/server/.env.example) to `server/.env`
5. Fill in:
   - Firebase web app values in `client/.env`
   - `VITE_GEOAPIFY_API_KEY` in `client/.env` for Thunder Bay address autocomplete
   - Firebase service account values and `FIREBASE_DATABASE_URL` in `server/.env`
   - Optional SMTP values in `server/.env` if you want confirmation emails
6. Start the server with those env vars available in your shell.

## Run locally

1. Install dependencies:
   - `npm install`
   - `npm install --prefix server`
   - `npm install --prefix client`
2. Start both apps:
   - `npm run dev`
3. Open:
   - React frontend: `http://localhost:5173`
   - Node API: `http://localhost:3001`

## Notes

- Offerings are now stored in Firebase Realtime Database.
- The backend verifies Firebase ID tokens before it returns or mutates offering data.
- Firebase Authentication is used in the React app, and Firebase Realtime Database is used on the backend.
- Address entry is restricted to Thunder Bay suggestions returned by Geoapify autocomplete in the client.
- The old Django project files have been removed. The remaining `frontend/static` folder is intentionally kept for shared menu and image assets.
