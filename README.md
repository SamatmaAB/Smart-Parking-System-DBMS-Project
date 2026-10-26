# Parkwise Smart Parking

A local smart parking management mini project based on `smart_parking_chen_er.drawio`.
The browser dashboard uses Node.js and its built-in SQLite module, so it has no package dependencies.

## Run it

1. Install Node.js 22.5 or newer.
2. Open this folder in a terminal.
3. Run `npm start`.
4. Open [http://localhost:3000](http://localhost:3000).

The app creates `smart_parking.db` in this folder on first start and seeds a Central Plaza lot with a dozen spaces. The SQLite schema covers the 14 entities in the E-R diagram. The MySQL version is available separately in `smart_parking_schema.sql`.

## Current workflows

- Review lot capacity, available spaces, active sessions, and payment totals.
- Add lots, zones, spaces, customers, and vehicles.
- Create a reservation for an available space.
- Check a vehicle in and check it out with payment recording.
- Review reservations and parking activity.

The diagram marks loyalty points as derived but does not define an award rule. The app therefore leaves that calculation out. Lot capacity is calculated from the number of spaces in each lot.
