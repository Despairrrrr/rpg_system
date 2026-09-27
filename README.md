# Neon Goal Tracker — frontend CRUD demo

Vanilla **HTML + CSS + JavaScript** frontend based on the dashboard concept from the conversation.

Works fully offline with `localStorage`. Optionally, Google sign-in syncs progress to **Firebase (Auth + Cloud Firestore)** so it can be opened from any device.

## Files

- `index.html` — semantic structure, dashboard, dialogs and templates.
- `login.html` — optional sign-in page with a single "Continue with Google" button.
- `skill.html` — per-skill page: skill goal text and its goals rendered as a tree (no type columns).
- `styles.css` — visual system, responsive layout, neon theme.
- `app.js` — state, rendering, CRUD logic, `localStorage` and cloud sync.
- `login.js` — login page logic, kept separate from `app.js` (which needs the full dashboard DOM).
- `firebase.init.js` — Firebase configuration + initialization (paste your `firebaseConfig` here).
- `CRUD.md` — detailed CRUD documentation.

## Run

The CRUD part works by simply opening `index.html` in a browser.

**Sign-in, however, only works over `http(s)`** — it needs a real origin. From a
`file://` page the browser sends no `Referer` at all, which Firebase Auth rejects.
Use any static server, for example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000            dashboard
http://localhost:8000/login.html sign-in page
```

The sign-in page is `login.html`, and it is completely optional — "Continue without
an account" goes straight to the dashboard, which keeps working on `localStorage`.
Signing in and signing up are the same action: the first "Continue with Google"
creates the Firebase user, later ones just sign it in.

## Main features

- Goal CRUD:
  - create a goal;
  - read/render all goals;
  - update a goal;
  - mark a goal completed;
  - delete a goal.
- Skill CRUD:
  - create a skill;
  - read/render skills;
  - update a skill;
  - delete a skill.
- Profile name editing.
- Browser persistence through `localStorage`.
- Search across goals and skills.
- Automatic goal counts.
- Clicking a skill opens its detail page with a goal tree (parent long goals nest their children).
- Exponential level/XP curve (reaching level N requires (N-1)^2 * 100 XP).
- Daily streak: completing at least one goal per day grows an animated flame next to the profile name; missing a day resets it at local 00:00.
- Optional sign-in via a dedicated `login.html` page with a "Continue with Google" button, syncing progress across devices (last-write-wins).
- Responsive layout.

## Data persistence

All app state is stored under:

```text
neonGoalTracker.v1
```

in `localStorage`.

Delete that key in DevTools → Application/Storage → Local Storage to reset the app.

## Google sign-in + cloud sync (Firebase)

Optional but needed to keep progress across devices. Setup once (free tier is enough):

1. Create a project at https://console.firebase.google.com
2. **Build → Authentication → Sign-in method → Google → Enable.**
3. **Build → Firestore Database → Create database** (production mode).
4. In Firestore, set these rules (Database → Rules):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

5. **Project settings → Your apps → `</>` (Web app)** — register the app and copy the
   `firebaseConfig` object into `firebase.init.js` (replace the empty `{}`). The sign-in
   link in the top-right only appears once a valid config is present.
6. **Authentication → Settings → Authorized domains**: if you deploy to GitHub Pages, add
   `your-username.github.io`. (`localhost` is allowed by default for local development.)
   Remove `localhost` here to block sign-in locally.

### API key restrictions

The Web API key lives in **Google Cloud Console → APIs & Services → Credentials**, not
in the Firebase console. Leave **Application restrictions** empty, or the popup flow
breaks in confusing ways:

- the sign-in popup runs through a hidden iframe on your `authDomain`
  (`<project>.firebaseapp.com`), and *that* iframe calls Google with itself as the
  referer — so the `authDomain` must be allowed too;
- browsers send only the bare origin (`https://site.com`, no path) as the `Referer` for
  cross-origin requests, so a path-scoped rule like `https://site.com/repo/*` never
  matches.

A blocked key does not report itself clearly. Depending on which of the two calls gets
refused, you either get the popup page saying *"The requested action is invalid"* or
`auth/requests-from-referer-...-are-blocked`. Restricting the key buys nothing here
anyway — it ships in the client code, so the real boundary is **Authorized domains**
plus the Firestore rules above.

### How sync works

When signed in, every state change is stored to `users/{uid}` as a single document
(`state` JSON + `updatedAt` ms). On sign-in the local copy and the cloud copy are compared
and the **newer one wins (last-write-wins)**. The first sign-in uploads whatever progress
already exists locally. Without a connection the app keeps working locally and retries on
the next save.

### Publish on GitHub Pages

The site is purely static — no server needed:

1. Put `index.html`, `login.html`, `skill.html`, `app.js`, `login.js`, `firebase.init.js`,
   `styles.css` into a repo root (or move them into the repo root from the `front/` folder).
2. GitHub repo → **Settings → Pages → Build and deployment → Deploy from a branch →
   main / root.**
3. The app is then live at `https://<your-username>.github.io/<repo>/` with HTTPS.
4. Add `your-username.github.io` to the Firebase **Authorized domains** (step 6 above).
