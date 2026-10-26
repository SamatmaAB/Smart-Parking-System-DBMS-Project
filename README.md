# Parkwise Smart Parking

A smart parking management mini project based on `smart_parking_chen_er.drawio`.
The browser dashboard runs locally with SQLite or on Vercel with Neon Postgres.

## Run it

1. Install Node.js 22.5 or newer.
2. Open this folder in a terminal.
3. Run `node server.js` (or `npm.cmd start` in PowerShell).
4. Open [http://localhost:3000](http://localhost:3000).

The local server creates `smart_parking.db` in this folder on first start and seeds a Central Plaza lot with a dozen spaces. The SQLite schema covers the 14 entities in the E-R diagram. The MySQL version is available separately in `smart_parking_schema.sql`.

## Deploy to Vercel

1. Import `SamatmaAB/Smart-Parking-System-DBMS-Project` from the Vercel dashboard and keep the project root as the repository root.
2. Create and connect a Neon Postgres database through Vercel Marketplace. This provides the `DATABASE_URL` environment variable to the project.
3. Deploy. The first API request creates the Postgres tables and seeds a Central Plaza lot with 12 spaces.

Vercel serves the dashboard from `public/` and routes `/api/*` to the serverless function in `api/[...path].js`. Do not use the SQLite file for deployed writes: Vercel Functions do not provide persistent shared local storage.

## Current workflows

- Review lot capacity, available spaces, active sessions, and payment totals.
- Add lots, zones, spaces, customers, and vehicles.
- Create a reservation for an available space.
- Check a vehicle in and check it out with payment recording.
- Review reservations and parking activity.

The diagram marks loyalty points as derived but does not define an award rule. The app therefore leaves that calculation out. Lot capacity is calculated from the number of spaces in each lot.
