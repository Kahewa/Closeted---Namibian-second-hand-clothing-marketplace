import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { $, el, initials, normalizeUsername } from "./utils.js";

const form = $("[data-search-form]");
const input = $("[data-search-input]");
const results = $("[data-search-results]");
const status = $("[data-search-status]");

// Prefix search on the username field. Firestore has no "contains", but a
// range from the term up to term + HIGH (a code point that sorts after any
// realistic suffix) matches everything starting with it, using the automatic
// single-field index — no composite index needed.
const HIGH = "";

async function runSearch(term) {
  const q = normalizeUsername(term);
  results.innerHTML = "";

  if (q.length < 2) {
    say("Type at least 2 characters.");
    return;
  }

  say("Searching…");
  try {
    const snap = await getDocs(
      query(
        collection(db, "users"),
        where("username", ">=", q),
        where("username", "<=", q + HIGH),
        orderBy("username"),
        limit(25)
      )
    );

    const people = snap.docs
      .map((d) => ({ uid: d.id, ...d.data() }))
      .filter((u) => u.username && !u.deleted && !u.banned);

    if (!people.length) {
      say(`Nobody found for “@${q}”.`);
      return;
    }

    status.hidden = true;
    people.forEach((u) => results.append(personRow(u)));
  } catch (err) {
    console.error(err);
    say(`Couldn't search right now: ${err.message}`);
  }
}

function personRow(user) {
  const avatar = user.profilePicURL
    ? el("img", { class: "avatar-bubble", src: user.profilePicURL, alt: "" })
    : el("span", { class: "avatar-bubble" }, initials(user.displayName));

  return el("a", { class: "account", href: `profile.html?uid=${user.uid}` }, [
    avatar,
    el("div", { class: "account__who" }, [
      el("p", { class: "account__name" }, user.displayName || "Closet Seller"),
      el("p", { class: "account__meta" }, `@${user.username}${user.bio ? " · " + user.bio.slice(0, 60) : ""}`),
    ]),
    el("span", { class: "account__go" }, "›"),
  ]);
}

function say(message) {
  status.hidden = false;
  status.textContent = message;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const term = input.value;
  history.replaceState({}, "", `search.html?q=${encodeURIComponent(normalizeUsername(term))}`);
  runSearch(term);
});

// Deep link: /search.html?q=grace
const preset = new URLSearchParams(location.search).get("q");
if (preset) {
  input.value = preset;
  runSearch(preset);
}
