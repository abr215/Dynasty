# Dynasty T20 V2 — targeted V3 upgrades

This is a targeted upgrade of the supplied project. The existing React/TypeScript architecture, save format, player IDs, career records, fixtures, match engine and UI structure have been retained.

## Changes

- **Safe career import / player-pool migration:** imported saves are merged with the bundled 300-player pool by stable player ID. Existing player objects and career records are retained; missing pool players are appended without duplicates.
- **Pakistan auction exclusion:** Pakistan-origin players are marked `auctionEligible: false`. Unowned Pakistan-origin players are removed from the imported player pool and auction lot lists. If a Pakistan-origin player is already owned by a franchise, the player record and career history are preserved, but the player is not eligible for future auctions or releases into the auction pool.
- **Rohit Sharma:** verified in the bundled player pool. Import checks for him and will add the bundled record if the save did not already contain it.
- **Skip current auction player:** the new Skip Player action is available before bidding starts on that lot. Only AI franchises are evaluated. The best eligible AI franchise may buy at base price; if no bot can take the player, the player is marked unsold. Human franchises are never awarded a skipped lot.
- **Player catalogue:** search and tier filters remain available; the catalogue now supports paginated viewing and a Show All Players mode.
- **Franchise controls:** add/remove empty AI franchises before the auction, edit each franchise's pitch profile, and configure overseas squad/XI quotas. Team structure is locked once the auction begins to protect fixture and roster integrity.
- **Auction budget:** setup and pre-auction controls support ₹20 Cr to ₹100 Cr per franchise.
- **Day/night and dew:** each match is assigned a day/night setting, editable before the toss. Night fixtures can generate dew; day fixtures do not. Dew increases second-innings batting assistance and reduces bowling grip through the existing match-condition model.

## Compatibility notes

- Existing IDs, player career records, season archives, match histories and save names are not regenerated.
- Existing live auction position is restored by player ID after the Pakistan-player filter is applied.
- Team count, purse and overseas limits are editable only before the auction starts. Pitch and match day/night conditions can be changed at their respective control screens.
- The project remains a Vite + React + TypeScript application. Open this folder in VS Code and run `npm install`, then `npm run dev`.

## Validation

The modified TypeScript/TSX files passed TypeScript transpilation syntax checks. A full project type-check/build could not be completed in this environment because the uploaded `node_modules` installation was incomplete and dependency installation did not finish; run `npm install` locally before deployment.
