// Login page logic.
//
// Kept separate from app.js on purpose: app.js assumes the full dashboard
// DOM and attaches listeners to it unconditionally (see the "GOAL FORM"
// block), so it cannot be reused on a page without that markup.

const DEFAULT_NEXT = "index.html";

const els = {
  googleBtn: document.querySelector("#googleBtn"),
  authStatus: document.querySelector("#authStatus"),
  authError: document.querySelector("#authError"),
  authAccount: document.querySelector("#authAccount"),
  authAvatar: document.querySelector("#authAvatar"),
  authName: document.querySelector("#authName"),
  authEmail: document.querySelector("#authEmail"),
  signOutBtn: document.querySelector("#signOutBtn"),
  guestLink: document.querySelector("#guestLink"),
};


// Only same-origin absolute paths are accepted, so a crafted
// ?next=https://example.com cannot turn this page into an open redirect.
function resolveNextUrl() {
  const raw =
    new URLSearchParams(
      location.search
    ).get("next");

  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//")
  ) {
    return DEFAULT_NEXT;
  }

  return raw;
}

const nextUrl = resolveNextUrl();

els.guestLink.href = nextUrl;

function getUserName(user) {
  return (
    user.displayName ||
    user.email ||
    "User"
  );
}

function setStatus(text) {
  els.authStatus.textContent = text;
  els.authStatus.hidden = !text;
}

function showError(code, message) {
  els.authError.textContent =
    `${code} — ${message}`;

  els.authError.hidden = false;
}

function clearError() {
  els.authError.textContent = "";
  els.authError.hidden = true;
}

function renderAvatar(user) {
  els.authAvatar.replaceChildren();

  if (user.photoURL) {
    const img =
      document.createElement("img");

    img.src = user.photoURL;
    img.alt = "";

    els.authAvatar.append(img);
    return;
  }

  els.authAvatar.textContent =
    getUserName(user).charAt(0).toUpperCase();
}

function renderSignedIn(user) {
  els.googleBtn.hidden = true;
  els.authAccount.hidden = false;

  els.authName.textContent = getUserName(user);
  els.authEmail.textContent = user.email || "";
  els.guestLink.textContent = "Continue to dashboard";

  renderAvatar(user);
}

function renderSignedOut() {
  els.googleBtn.hidden = false;
  els.authAccount.hidden = true;
  els.guestLink.textContent = "Continue without an account";
}

function renderUnavailable(code, message) {
  els.googleBtn.hidden = true;

  setStatus("");
  showError(code, message);
}

function initLogin() {
  if (
    typeof firebase === "undefined" ||
    firebase.apps.length === 0
  ) {
    renderUnavailable(
      "auth/not-configured",
      "No Firebase config in firebase.init.js."
    );
    return;
  }

  if (location.protocol === "file:") {
    renderUnavailable(
      "auth/invalid-context",
      "Open the site over http(s) — sign-in cannot work from a local file."
    );
    return;
  }

  const provider =
    new firebase.auth.GoogleAuthProvider();

  firebase
    .auth()
    .onAuthStateChanged((user) => {
      if (user) {
        renderSignedIn(user);
      } else {
        renderSignedOut();
      }
    });

  els.googleBtn.addEventListener(
    "click",
    async () => {
      els.googleBtn.disabled = true;
      clearError();
      setStatus("Opening Google…");

      try {
        await firebase
          .auth()
          .signInWithPopup(provider);

        location.href = nextUrl;
      } catch (error) {
        if (
          error.code ===
          "auth/popup-closed-by-user"
        ) {
          setStatus("Sign-in cancelled.");
        } else {
          setStatus("");
          showError(
            error.code || "auth/unknown-error",
            error.message || "Unknown error."
          );
        }

        els.googleBtn.disabled = false;
      }
    }
  );

  els.signOutBtn.addEventListener(
    "click",
    () => {
      firebase
        .auth()
        .signOut();
    }
  );
}

initLogin();
