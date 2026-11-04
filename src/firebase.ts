/* Dynasty T20 Firebase foundation.
 * Firebase compat SDK is loaded from Google's CDN in index.html.
 * This avoids adding an npm dependency or changing the existing lockfile.
 */

declare global {
  interface Window {
    firebase: any;
    dynastyFirebase: {
      app: any;
      auth: any;
      database: any;
    };
  }
}

const firebaseConfig = {
  apiKey: "AIzaSyBpENtvAuq60Cdop4jkYGRUDZpmm8GXAL0",
  authDomain: "dynasty-t20.firebaseapp.com",
  databaseURL: "https://dynasty-t20-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dynasty-t20",
  storageBucket: "dynasty-t20.firebasestorage.app",
  messagingSenderId: "941245597910",
  appId: "1:941245597910:web:da4a7f67b432483643e177",
};

const sdk = window.firebase;

let app: any = null;
let auth: any = null;
let database: any = null;
let authReady: Promise<any> = Promise.resolve(null);

if (!sdk) {
  // Never prevent the existing single-player game from loading if the CDN is unavailable.
  console.error("Dynasty T20 Firebase SDK did not load. Online services are unavailable.");
} else {
  app = sdk.apps.length ? sdk.app() : sdk.initializeApp(firebaseConfig);
  auth = sdk.auth();
  database = sdk.database();

  // Anonymous sign-in gives each browser a Firebase UID without asking friends
  // to create an email/password account. Errors are logged but never block the game.
  authReady = auth.currentUser
    ? Promise.resolve(auth.currentUser)
    : auth.signInAnonymously().catch((error: unknown) => {
        console.error("Dynasty T20 Firebase sign-in failed:", error);
        return null;
      });

  window.dynastyFirebase = { app, auth, database };
}

export { app, auth, database, authReady };
