DYNASTY T20 — START HERE

1. Extract the ZIP fully.
2. Open VS Code.
3. Choose File > Open Folder.
4. Open this exact folder: Dynasty-T20-Delivery\React-Project
   IMPORTANT: this is the folder that directly contains package.json.
5. Open Terminal > New Terminal. Confirm the prompt ends with \React-Project>.
6. Run each command separately:

   npm install

   Wait for it to finish successfully. Then run:

   npm run dev

7. Open the localhost URL shown in the terminal.

If you see ENOENT package.json at E:\package.json, the terminal is in the wrong folder. Run:

   cd .\Dynasty-T20-Delivery\React-Project

Then run npm install, wait for completion, and run npm run dev.

PLAYER CATALOGUE FIX
The catalogue shows all player identities and marks each as Available or Already signed. Only unassigned players are placed into a new auction queue. Use Reload Player Pool to verify counts.

SAVE SAFETY
A copy of the Bhopal Premier League save is included at:
React-Project\public\bhopal-premier-league-backup.json
Keep a separate copy of your own career JSON before importing or changing seasons.

TESTS
After dependencies install, run:
   npm run test:project
   npm run test:engine
   npm run build

See React-Project\QA-REPORT.md for verification status and known limitations.
