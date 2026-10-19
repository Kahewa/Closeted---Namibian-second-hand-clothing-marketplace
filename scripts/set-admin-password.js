// Creates the admin's Firebase account for a password and points the site
// at it. Run with `npm run admin:password`.
//
// The account's sign-in email is a one-way hash of the password — the same
// one public/js/auth.js works out at login — so no email or password ever
// has to be written into the code. What does get written is the new
// account's id, into public/js/utils.js and firebase/firestore.rules.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const root = path.join(__dirname, "..");
const files = {
  config: path.join(root, "public/js/local-config.js"),
  utils: path.join(root, "public/js/utils.js"),
  rules: path.join(root, "firebase/firestore.rules"),
};

function loginEmail(password) {
  const hex = crypto.createHash("sha256").update(`closet-admin:${password}`).digest("hex");
  return `${hex.slice(0, 32)}@closet-bg.firebaseapp.com`;
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = false;
    rl._writeToOutput = (s) => rl.output.write(rl.stdoutMuted ? (s.includes("\n") ? "\n" : "") : s);
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    rl.stdoutMuted = true;
  });
}

async function main() {
  const apiKey = (fs.readFileSync(files.config, "utf8").match(/apiKey:\s*"([^"]+)"/) || [])[1];
  if (!apiKey) throw new Error("Couldn't find the Firebase apiKey in public/js/local-config.js.");

  const password = await askHidden("New admin password: ");
  if (password.length < 6) throw new Error("Firebase needs at least 6 characters.");
  if ((await askHidden("Type it again: ")) !== password) throw new Error("The two didn't match.");

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Referer: "http://localhost:3000/" },
    body: JSON.stringify({ email: loginEmail(password), password, returnSecureToken: false }),
  });
  const data = await res.json();
  if (data.error) {
    const why = data.error.message;
    throw new Error(
      why === "EMAIL_EXISTS"
        ? "An admin account for that password already exists — nothing to do."
        : why.startsWith("OPERATION_NOT_ALLOWED")
          ? "Turn on Email/Password under Firebase Console → Authentication → Sign-in method, then run this again."
          : `Firebase said: ${why}`
    );
  }

  const uid = data.localId;
  const utils = fs.readFileSync(files.utils, "utf8").replace(/export const ADMIN_UID = "[^"]*";/, `export const ADMIN_UID = "${uid}";`);
  const rules = fs.readFileSync(files.rules, "utf8").replace(/request\.auth\.uid == '[^']*'/, `request.auth.uid == '${uid}'`);
  fs.writeFileSync(files.utils, utils);
  fs.writeFileSync(files.rules, rules);

  console.log(`
Admin account created (id ${uid}) and written into utils.js and firestore.rules.

Next:
  1. Firebase Console → Firestore Database → Rules: paste in firebase/firestore.rules → Publish.
  2. Push to GitHub / Vercel.
  3. Firebase Console → Authentication → Users: delete any older admin account.`);
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
