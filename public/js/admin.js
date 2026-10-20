import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { auth, watchAuthState, signInWithPassword, signOutUser, friendlyAuthError, isAdminUser } from "./auth.js";
import { uploadImage, deleteImages, sized } from "./cloudinary.js";
import {
  $,
  el,
  toast,
  formatNAD,
  timeAgo,
  toFirestoreDate,
  whatsappHref,
  itemImages,
  sellFee,
  AD_SLOTS,
  CATEGORIES,
  CONDITIONS,
  MAX_PHOTOS,
} from "./utils.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const WHATSAPP_KEY = "csn.admin.whatsapp";

// folder ids that aren't a client
const ALL = "__all";
const NO_CLIENT = "__none";

const signinView = $("[data-signin]");
const dashboardView = $("[data-dashboard]");

const form = $("[data-post-form]");
const field = (name) => form.querySelector(`[data-field="${name}"]`);
const photoGrid = $("[data-photo-grid]");
const submitBtn = $("[data-submit]");
const cancelEditBtn = $("[data-cancel-edit]");
const formTitle = $("[data-form-title]");

const mineList = $("[data-mine]");
const mineLoading = $("[data-mine-loading]");
const mineEmpty = $("[data-mine-empty]");
const foldersView = $("[data-folders-view]");
const folderView = $("[data-folder-view]");

let items = [];
let clients = []; // [{ id, name, whatsapp?, pieces?, bank? }], A–Z
let apps = []; // pending seller applications, newest first
let editing = null; // the item being edited, if any
let openFolder = null; // ALL, NO_CLIENT, a client id, or null for the folder grid

// The form's photos, cover first: { url, publicId } already uploaded, or
// { file, preview } picked but not uploaded yet.
let photos = [];

// ---------------------------------------------------------------------
// who's here
// ---------------------------------------------------------------------
function show(signedIn) {
  signinView.hidden = signedIn;
  dashboardView.hidden = !signedIn;
}

watchAuthState(async (user) => {
  if (user && !isAdminUser(user)) {
    // left over from an older login — only the admin account belongs here
    await signOutUser();
    return;
  }
  show(!!user);
  if (user) loadAll();
  else $("[data-password]").focus();
});

$("[data-login-form]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("[data-password]");
  const btn = $("[data-login-btn]");
  if (!input.value) {
    toast("Enter the password.", "error");
    input.focus();
    return;
  }
  btn.disabled = true;
  btn.textContent = "Logging in…";
  try {
    await signInWithPassword(input.value);
    input.value = "";
  } catch (err) {
    toast(friendlyAuthError(err), "error");
    input.select();
  } finally {
    btn.disabled = false;
    btn.textContent = "Log in";
  }
});

$("[data-signout]").addEventListener("click", () => signOutUser());

// ---------------------------------------------------------------------
// the form
// ---------------------------------------------------------------------
const option = (value, label = value) => el("option", { value }, label);
field("category").append(el("option", { value: "", disabled: true, selected: true }, "Pick one"), ...CATEGORIES.map((c) => option(c)));
field("condition").append(el("option", { value: "", disabled: true, selected: true }, "Pick one"), ...CONDITIONS.map((c) => option(c)));

function paintClientSelect() {
  const select = field("client");
  const current = select.value;
  select.replaceChildren(option("", "Me — not for a client"), ...clients.map((c) => option(c.id, c.name)));
  select.value = clients.some((c) => c.id === current) ? current : "";
}

function rememberedWhatsapp() {
  try {
    return localStorage.getItem(WHATSAPP_KEY) || "";
  } catch {
    return "";
  }
}

function rememberWhatsapp(value) {
  try {
    localStorage.setItem(WHATSAPP_KEY, value);
  } catch {
    /* it'll just need typing again next time */
  }
}

field("whatsapp").value = rememberedWhatsapp();

function paintPhotos() {
  photoGrid.innerHTML = "";
  photos.forEach((photo, i) => {
    const src = photo.preview || sized(photo.url, 300, { square: true });
    photoGrid.append(
      el("div", { class: `photo-slot${i === 0 ? " photo-slot--cover" : ""}` }, [
        el(
          "button",
          {
            type: "button",
            class: "photo-slot__pick",
            "aria-label": i === 0 ? `Photo ${i + 1}, the cover` : `Photo ${i + 1} — make it the cover`,
            onClick: () => makeCover(i),
          },
          el("img", { src, alt: "" })
        ),
        i === 0 ? el("span", { class: "photo-slot__badge" }, "Cover") : null,
        el(
          "button",
          { type: "button", class: "photo-slot__remove", "aria-label": `Remove photo ${i + 1}`, onClick: () => removePhoto(i) },
          el("i", { class: "ico ico--close", "aria-hidden": "true" })
        ),
      ])
    );
  });

  if (photos.length < MAX_PHOTOS) {
    photoGrid.append(
      el("label", { class: `photo-slot photo-slot--add${photos.length ? "" : " photo-slot--first"}`, for: "post-photo" }, [
        el("i", { class: `ico ico--${photos.length ? "plus" : "camera"} ico--xl`, "aria-hidden": "true" }),
        el("span", {}, photos.length ? `Add (${photos.length}/${MAX_PHOTOS})` : "Tap to add photos"),
      ])
    );
  }
}

function makeCover(i) {
  if (i === 0) return;
  photos.unshift(...photos.splice(i, 1));
  paintPhotos();
}

function removePhoto(i) {
  const [gone] = photos.splice(i, 1);
  if (gone?.preview) URL.revokeObjectURL(gone.preview);
  paintPhotos();
}

field("image").addEventListener("change", () => {
  const files = [...(field("image").files || [])];
  field("image").value = "";
  const room = MAX_PHOTOS - photos.length;
  const tooBig = files.filter((f) => f.size > MAX_IMAGE_BYTES);
  const ok = files.filter((f) => f.size <= MAX_IMAGE_BYTES);

  if (tooBig.length) toast(`${tooBig.length === 1 ? "A photo was" : `${tooBig.length} photos were`} over 8MB and skipped.`, "error");
  if (ok.length > room) toast(`Only ${MAX_PHOTOS} photos per piece — kept the first ${room}.`, "error");

  ok.slice(0, room).forEach((file) => photos.push({ file, preview: URL.createObjectURL(file) }));
  paintPhotos();
});

function clearPhotos() {
  photos.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
  photos = [];
  paintPhotos();
}

/** The client a new post defaults to: whoever's folder is open. */
const folderClient = () => (clients.some((c) => c.id === openFolder) ? openFolder : "");

function resetForm() {
  const whatsapp = field("whatsapp").value;
  form.reset();
  field("whatsapp").value = whatsapp;
  field("client").value = folderClient();
  clearPhotos();
  editing = null;
  formTitle.textContent = "Post a Piece";
  submitBtn.textContent = "Post to feed";
  cancelEditBtn.hidden = true;
}

function startEdit(item) {
  editing = item;
  form.reset();
  field("client").value = clients.some((c) => c.id === item.clientId) ? item.clientId : "";
  field("category").value = item.category || "";
  field("condition").value = item.condition || "";
  field("price").value = item.price ?? "";
  field("size").value = item.size || "";
  field("brand").value = item.brand || "";
  field("whatsapp").value = item.whatsapp || field("whatsapp").value;
  field("notes").value = item.notes || "";
  clearPhotos();
  photos = itemImages(item).map((img) => ({ ...img }));
  paintPhotos();
  formTitle.textContent = "Edit Piece";
  submitBtn.textContent = "Save changes";
  cancelEditBtn.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

cancelEditBtn.addEventListener("click", resetForm);

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const draft = {
    clientId: field("client").value || null,
    category: field("category").value,
    condition: field("condition").value,
    price: Number(field("price").value),
    size: field("size").value.trim(),
    brand: field("brand").value.trim(),
    whatsapp: field("whatsapp").value.trim(),
    notes: field("notes").value.trim(),
  };

  const problem = !photos.length
    ? "Add at least one photo."
    : !draft.category
      ? "Pick a category."
      : !draft.price || draft.price <= 0
        ? "Add a price."
        : !draft.size
          ? "Add a size."
          : !draft.condition
            ? "Pick a condition."
            : !whatsappHref(draft.whatsapp)
              ? "Add a WhatsApp number buyers can reach (e.g. 081 234 5678)."
              : null;
  if (problem) {
    toast(problem, "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add("btn--loading");
  submitBtn.textContent = editing ? "Saving…" : "Posting…";

  const uploadedNow = [];
  try {
    const uid = auth.currentUser.uid;
    const images = await Promise.all(
      photos.map(async (photo) => {
        if (!photo.file) {
          const kept = { url: photo.url, publicId: photo.publicId || null };
          if (photo.w && photo.h) Object.assign(kept, { w: photo.w, h: photo.h });
          return kept;
        }
        const uploaded = await uploadImage(photo.file, `items/${uid}`);
        uploadedNow.push(uploaded.publicId);
        // w/h let the feed reserve the photo's shape before it loads
        return { url: uploaded.url, publicId: uploaded.publicId, w: uploaded.w, h: uploaded.h };
      })
    );
    // imageURL/publicId mirror the cover, so anything that only shows one
    // photo (cart rows, older code) keeps working
    const media = { images, imageURL: images[0].url, publicId: images[0].publicId };

    if (editing) {
      await updateDoc(doc(db, "items", editing.id), { ...draft, ...media });
      // photos taken off the post are no longer referenced anywhere
      const kept = new Set(images.map((img) => img.publicId));
      cleanUpImages(itemImages(editing).map((img) => img.publicId).filter((id) => !kept.has(id)));
      toast("Changes saved");
    } else {
      await setDoc(doc(collection(db, "items")), {
        ...draft,
        ...media,
        sold: false,
        createdAt: serverTimestamp(),
      });
      toast("Posted — it's on the feed");
    }

    rememberWhatsapp(draft.whatsapp);
    resetForm();
    loadMine();
  } catch (err) {
    console.error(err);
    // the post didn't save, so whatever just uploaded belongs to nothing
    if (uploadedNow.length) cleanUpImages(uploadedNow);
    toast(saveError(err), "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove("btn--loading");
    submitBtn.textContent = editing ? "Save changes" : "Post to feed";
  }
});

function saveError(err) {
  const denied = err?.code === "permission-denied" || /insufficient permissions/i.test(err?.message || "");
  return denied
    ? "Firestore turned that down — the security rules may need redeploying (firebase deploy --only firestore:rules)."
    : err?.message || "Couldn't save that. Please try again.";
}

// ---------------------------------------------------------------------
// clients — the people whose pieces you sell
// ---------------------------------------------------------------------
async function loadClients() {
  const snap = await getDocs(query(collection(db, "clients"), orderBy("name")));
  clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  paintClientSelect();
}

const clientName = (id) => clients.find((c) => c.id === id)?.name;
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

$("[data-client-add]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("[data-client-name]");
  const numberInput = $("[data-client-number]");
  const name = input.value.trim().replace(/\s+/g, " ");
  const whatsapp = numberInput.value.trim();
  if (!name) {
    toast("Type the client's name first.", "error");
    return;
  }
  if (clients.some((c) => sameName(c.name, name))) {
    toast(`${name} is already in your list.`, "error");
    return;
  }
  if (whatsapp && !whatsappHref(whatsapp)) {
    toast("That number doesn't look right (e.g. 081 234 5678).", "error");
    numberInput.focus();
    return;
  }

  const btn = e.submitter;
  if (btn) btn.disabled = true;
  try {
    const extra = whatsapp ? { whatsapp } : {};
    const ref = await addDoc(collection(db, "clients"), { name, ...extra, createdAt: serverTimestamp() });
    clients = [...clients, { id: ref.id, name, ...extra }].sort((a, b) => a.name.localeCompare(b.name));
    input.value = "";
    numberInput.value = "";
    paintClientSelect();
    paintMine();
    toast(`Added ${name}`);
  } catch (err) {
    console.error(err);
    toast(saveError(err), "error");
  } finally {
    if (btn) btn.disabled = false;
  }
});

$("[data-folder-rename]").addEventListener("click", async () => {
  const client = clients.find((c) => c.id === openFolder);
  if (!client) return;
  const name = (prompt("Rename this client:", client.name) || "").trim().replace(/\s+/g, " ");
  if (!name || name === client.name) return;
  if (clients.some((c) => c.id !== client.id && sameName(c.name, name))) {
    toast(`${name} is already in your list.`, "error");
    return;
  }
  try {
    await updateDoc(doc(db, "clients", client.id), { name });
    client.name = name;
    clients.sort((a, b) => a.name.localeCompare(b.name));
    paintClientSelect();
    paintMine();
    toast("Renamed");
  } catch (err) {
    console.error(err);
    toast(saveError(err), "error");
  }
});

$("[data-folder-number]").addEventListener("click", async () => {
  const client = clients.find((c) => c.id === openFolder);
  if (!client) return;
  const answer = prompt(`${client.name}'s WhatsApp number:`, client.whatsapp || "");
  if (answer === null) return;
  const whatsapp = answer.trim();
  if (whatsapp && !whatsappHref(whatsapp)) {
    toast("That number doesn't look right (e.g. 081 234 5678).", "error");
    return;
  }
  try {
    await updateDoc(doc(db, "clients", client.id), { whatsapp });
    client.whatsapp = whatsapp;
    paintMine();
    toast(whatsapp ? "Number saved" : "Number removed");
  } catch (err) {
    console.error(err);
    toast(saveError(err), "error");
  }
});

$("[data-folder-delete]").addEventListener("click", async () => {
  const client = clients.find((c) => c.id === openFolder);
  if (!client) return;
  const theirs = items.filter((i) => i.clientId === client.id);
  const warning = theirs.length
    ? `Remove ${client.name} from your clients? Their ${theirs.length} piece${theirs.length === 1 ? "" : "s"} stay on the feed and move to “Not for a client”.`
    : `Remove ${client.name} from your clients?`;
  if (!confirm(warning)) return;

  try {
    // 500 writes per batch is Firestore's cap; one client won't come close
    const batch = writeBatch(db);
    theirs.forEach((i) => batch.update(doc(db, "items", i.id), { clientId: null }));
    batch.delete(doc(db, "clients", client.id));
    await batch.commit();
    theirs.forEach((i) => (i.clientId = null));
    clients = clients.filter((c) => c.id !== client.id);
    paintClientSelect();
    openFolderView(null);
    toast(`Removed ${client.name}`);
  } catch (err) {
    console.error(err);
    toast(saveError(err), "error");
  }
});

// ---------------------------------------------------------------------
// Local Business Feature — the three poster spaces in the home page hero
// ---------------------------------------------------------------------
async function loadAds() {
  const box = $("[data-ad-admin]");
  try {
    const ads = await Promise.all(
      AD_SLOTS.map(async (id) => {
        const snap = await getDoc(doc(db, "ads", id));
        return { id, ...(snap.exists() ? snap.data() : {}) };
      })
    );
    box.replaceChildren(...ads.map((ad, i) => adCard(ad, i)));
  } catch (err) {
    console.error("Couldn't load the featured businesses:", err);
    box.replaceChildren(el("p", { class: "muted" }, `Couldn't load them: ${saveError(err)}`));
  }
}

function adCard(ad, i) {
  let file = null;
  const preview = el("div", { class: "ad-admin__preview" });
  const paintPreview = (src) =>
    preview.replaceChildren(
      src
        ? el("img", { src, alt: "" })
        : el("span", { class: "ad-admin__empty" }, [el("i", { class: "ico ico--camera ico--lg", "aria-hidden": "true" }), "Add poster"])
    );
  paintPreview(ad.imageURL ? sized(ad.imageURL, 400) : null);

  const fileInput = el("input", { type: "file", accept: "image/*", class: "visually-hidden-file", id: `ad-file-${ad.id}` });
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    if (f.size > MAX_IMAGE_BYTES) {
      toast("That photo is over 8MB — try a smaller one.", "error");
      fileInput.value = "";
      return;
    }
    file = f;
    paintPreview(URL.createObjectURL(f));
  });

  const input = (label, attrs, value = "") => {
    const id = `ad-${attrs["data-k"]}-${ad.id}`;
    const tag = attrs.rows ? "textarea" : "input";
    const node = el(tag, { id, ...attrs });
    node.value = value;
    return [node, el("div", { class: "field" }, [el("label", { for: id }, label), node])];
  };
  const [nameIn, nameField] = input("Business name (optional)", { type: "text", maxlength: "60", "data-k": "name" }, ad.name || "");
  const [descIn, descField] = input("Description", { rows: "3", maxlength: "400", "data-k": "desc", placeholder: "What they do, where they are, opening hours…" }, ad.description || "");
  const [waIn, waField] = input("WhatsApp number", { type: "tel", maxlength: "30", "data-k": "wa", placeholder: "081 234 5678" }, ad.whatsapp || "");

  const saveBtn = el("button", { type: "button", class: "btn btn--primary btn--sm" }, "Save");
  const clearBtn = el("button", { type: "button", class: "btn btn--chrome btn--sm", hidden: !ad.imageURL }, "Clear slot");

  saveBtn.addEventListener("click", async () => {
    const data = {
      name: nameIn.value.trim(),
      description: descIn.value.trim(),
      whatsapp: waIn.value.trim(),
    };
    if (!file && !ad.imageURL) return toast("Add a poster first.", "error");
    if (!data.description) return toast("Add a short description.", "error");
    if (!whatsappHref(data.whatsapp)) return toast("Add a WhatsApp number (e.g. 081 234 5678).", "error");

    saveBtn.disabled = true;
    saveBtn.classList.add("btn--loading");
    try {
      let media = { imageURL: ad.imageURL, publicId: ad.publicId || null };
      if (file) {
        const up = await uploadImage(file, `ads/${auth.currentUser.uid}`);
        media = { imageURL: up.url, publicId: up.publicId };
      }
      await setDoc(doc(db, "ads", ad.id), { ...data, ...media, updatedAt: serverTimestamp() });
      // the old poster is no longer used once a new one replaced it
      if (file && ad.publicId) cleanUpImages([ad.publicId]);
      Object.assign(ad, data, media);
      file = null;
      clearBtn.hidden = false;
      toast(`Slot ${i + 1} saved — it's on the home page`);
    } catch (err) {
      console.error(err);
      toast(saveError(err), "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.classList.remove("btn--loading");
    }
  });

  clearBtn.addEventListener("click", async () => {
    if (!confirm(`Clear slot ${i + 1}? It will go back to “Advertise your business here”.`)) return;
    try {
      await deleteDoc(doc(db, "ads", ad.id));
      if (ad.publicId) cleanUpImages([ad.publicId]);
      ["name", "description", "whatsapp", "imageURL", "publicId"].forEach((k) => delete ad[k]);
      nameIn.value = descIn.value = waIn.value = "";
      file = null;
      paintPreview(null);
      clearBtn.hidden = true;
      toast(`Slot ${i + 1} cleared`);
    } catch (err) {
      console.error(err);
      toast(saveError(err), "error");
    }
  });

  return el("article", { class: "review ad-admin__card" }, [
    el("p", { class: "review__seller" }, `Slot ${i + 1}`),
    el("label", { class: "ad-admin__pick", for: fileInput.id }, [preview, fileInput]),
    nameField,
    descField,
    waField,
    el("div", { class: "review__actions" }, [saveBtn, clearBtn]),
  ]);
}

// ---------------------------------------------------------------------
// seller applications — from sell.html
// ---------------------------------------------------------------------
async function loadApplications() {
  try {
    // equality-only, so no composite index; sorted here instead
    const snap = await getDocs(query(collection(db, "applications"), where("status", "==", "pending")));
    const millis = (a) => toFirestoreDate(a.createdAt)?.getTime() || 0;
    apps = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b) - millis(a));
    paintApps();
  } catch (err) {
    console.error("Couldn't load applications:", err);
    $("[data-apps-empty]").hidden = false;
    $("[data-apps-empty]").textContent = `Couldn't load applications: ${saveError(err)}`;
  }
}

const fullName = (a) => `${a.firstName} ${a.surname}`.trim();

/** Bank details as a small definition list. */
function bankList(bank = {}) {
  const rows = [
    ["Bank", bank.bankName],
    ["Account holder", bank.accountHolder],
    ["Account number", bank.accountNumber],
    ["Branch code", bank.branchCode],
  ].filter(([, v]) => v);
  return el("dl", { class: "bank-list" }, rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)]));
}

function whatsappButton(number, label = number) {
  const href = whatsappHref(number);
  return href
    ? el("a", { class: "btn btn--lime btn--sm", href, target: "_blank", rel: "noopener noreferrer" }, [
        el("i", { class: "ico ico--chat", "aria-hidden": "true" }),
        ` ${label}`,
      ])
    : null;
}

function paintApps() {
  $("[data-apps-count]").textContent = apps.length;
  $("[data-apps-empty]").hidden = apps.length > 0;
  const list = $("[data-apps]");
  list.innerHTML = "";
  apps.forEach((app) => {
    const fee = sellFee(app.pieces);
    list.append(
      el("article", { class: "review app-card" }, [
        el("div", { class: "review__head" }, [
          el("div", {}, [
            el("p", { class: "review__seller" }, fullName(app)),
            el(
              "p",
              { class: "review__meta" },
              `${app.pieces} pieces · fee ${fee ? formatNAD(fee) : "—"} · applied ${timeAgo(toFirestoreDate(app.createdAt)) || "just now"}`
            ),
          ]),
          el("span", { class: "status-pill status-pill--pending" }, "new"),
        ]),
        el("div", { class: "app-card__contact" }, [whatsappButton(app.whatsapp)]),
        bankList(app.bank),
        el("div", { class: "review__actions" }, [
          el("button", { class: "btn btn--primary btn--sm", type: "button", onClick: (e) => approve(e.currentTarget, app) }, [
            el("i", { class: "ico ico--check", "aria-hidden": "true" }),
            " approve",
          ]),
          el("button", { class: "btn btn--chrome btn--sm", type: "button", onClick: (e) => decline(e.currentTarget, app) }, [
            el("i", { class: "ico ico--close", "aria-hidden": "true" }),
            " decline",
          ]),
        ]),
      ])
    );
  });
}

/** Approving adds them to the name bank, number and bank details included. */
async function approve(btn, app) {
  let name = fullName(app);
  for (let n = 2; clients.some((c) => sameName(c.name, name)); n++) name = `${fullName(app)} (${n})`;

  btn.disabled = true;
  try {
    const clientRef = doc(collection(db, "clients"));
    const client = {
      name,
      whatsapp: app.whatsapp,
      pieces: app.pieces,
      bank: app.bank,
      applicationId: app.id,
    };
    const batch = writeBatch(db);
    batch.set(clientRef, { ...client, createdAt: serverTimestamp() });
    batch.update(doc(db, "applications", app.id), { status: "approved", clientId: clientRef.id });
    await batch.commit();

    clients = [...clients, { id: clientRef.id, ...client }].sort((a, b) => a.name.localeCompare(b.name));
    apps = apps.filter((a) => a.id !== app.id);
    paintClientSelect();
    paintApps();
    paintMine();
    toast(`${name} is now one of your clients`);
  } catch (err) {
    console.error(err);
    toast(saveError(err), "error");
    btn.disabled = false;
  }
}

/** Declining deletes the application — and the bank details in it. */
async function decline(btn, app) {
  if (!confirm(`Decline ${fullName(app)}'s application? It will be deleted, bank details included.`)) return;
  btn.disabled = true;
  try {
    await deleteDoc(doc(db, "applications", app.id));
    apps = apps.filter((a) => a.id !== app.id);
    paintApps();
    toast("Application declined");
  } catch (err) {
    console.error(err);
    toast(saveError(err), "error");
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------
// what's posted — folders by client
// ---------------------------------------------------------------------
async function loadAll() {
  try {
    await loadClients();
  } catch (err) {
    console.error("Couldn't load clients:", err);
    toast(saveError(err), "error");
  }
  loadMine();
  loadApplications();
  loadAds();
}

async function loadMine() {
  try {
    const snap = await getDocs(query(collection(db, "items"), orderBy("createdAt", "desc"), limit(300)));
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // pre-fill the number from the latest post on a fresh device
    if (!field("whatsapp").value && items[0]?.whatsapp) field("whatsapp").value = items[0].whatsapp;
    paintMine();
  } catch (err) {
    console.error(err);
    mineLoading.hidden = false;
    mineLoading.textContent = `Couldn't load your posts: ${err.message}`;
  }
}

/** The posts in a folder. A post whose client was removed counts as no client. */
function inFolder(folder) {
  if (folder === ALL) return items;
  if (folder === NO_CLIENT) return items.filter((i) => !clientName(i.clientId));
  return items.filter((i) => i.clientId === folder);
}

function folderLabel(folder) {
  if (folder === ALL) return "All posts";
  if (folder === NO_CLIENT) return "Not for a client";
  return clientName(folder) || "Client";
}

function openFolderView(folder) {
  openFolder = folder;
  if (!editing) field("client").value = folderClient();
  paintMine();
  (folder ? folderView : foldersView).scrollIntoView({ behavior: "smooth", block: "start" });
}

$("[data-folder-back]").addEventListener("click", () => openFolderView(null));

function paintMine() {
  mineLoading.hidden = true;
  $("[data-count]").textContent = clients.length;

  // a folder that's been removed elsewhere closes itself
  if (openFolder && openFolder !== ALL && openFolder !== NO_CLIENT && !clientName(openFolder)) openFolder = null;

  foldersView.hidden = !!openFolder;
  folderView.hidden = !openFolder;
  $("[data-folders-note]").hidden = !!openFolder;

  if (!openFolder) {
    paintFolders();
    return;
  }

  const list = inFolder(openFolder);
  const sold = list.filter((i) => i.sold).length;
  $("[data-folder-title]").replaceChildren(
    folderLabel(openFolder),
    el("span", { class: "folder-head__meta" }, `${list.length} posted · ${sold} sold`)
  );
  $("[data-folder-actions]").hidden = openFolder === ALL || openFolder === NO_CLIENT;
  paintClientInfo(clients.find((c) => c.id === openFolder));
  mineEmpty.hidden = list.length > 0;
  mineList.innerHTML = "";
  list.forEach((item) => mineList.append(row(item)));
}

/** The open client's number (tap for WhatsApp), batch and bank details. */
function paintClientInfo(client) {
  const box = $("[data-client-info]");
  box.hidden = !client;
  if (!client) return;
  const fee = sellFee(client.pieces);
  box.replaceChildren(
    el("div", { class: "client-info__row" }, [
      client.whatsapp && whatsappHref(client.whatsapp)
        ? whatsappButton(client.whatsapp, `WhatsApp ${client.whatsapp}`)
        : el("p", { class: "muted client-info__none" }, "No number yet — use “number” to add one."),
      client.pieces
        ? el("p", { class: "client-info__batch" }, `${client.pieces} pieces · service fee ${fee ? formatNAD(fee) : "—"}`)
        : null,
    ]),
    client.bank
      ? el("details", { class: "client-info__bank" }, [el("summary", {}, "Banking details"), bankList(client.bank)])
      : null
  );
}

function paintFolders() {
  const folders = [ALL, ...clients.map((c) => c.id), NO_CLIENT];
  const grid = $("[data-folders]");
  grid.innerHTML = "";
  folders.forEach((folder) => {
    const list = inFolder(folder);
    if (folder === NO_CLIENT && !list.length) return;
    const available = list.filter((i) => !i.sold);
    const covers = list.slice(0, 3).map((i) => itemImages(i)[0]?.url).filter(Boolean);
    grid.append(
      el(
        "button",
        {
          type: "button",
          class: `folder${folder === ALL ? " folder--all" : ""}`,
          onClick: () => openFolderView(folder),
        },
        [
          el(
            "span",
            { class: "folder__peek", "aria-hidden": "true" },
            covers.length
              ? covers.map((url) => el("img", { src: sized(url, 160, { square: true }), alt: "", loading: "lazy", decoding: "async" }))
              : el("i", { class: `ico ico--${folder === ALL ? "grid" : "user"} ico--lg` })
          ),
          el("span", { class: "folder__name" }, folderLabel(folder)),
          el(
            "span",
            { class: "folder__meta" },
            list.length ? `${list.length} piece${list.length === 1 ? "" : "s"} · ${available.length} available` : "Nothing posted yet"
          ),
        ]
      )
    );
  });
}

function row(item) {
  const button = (label, icon, onClick, cls = "btn--chrome") =>
    el("button", { class: `btn ${cls} btn--sm`, type: "button", onClick }, [
      el("i", { class: `ico ico--${icon}`, "aria-hidden": "true" }),
      ` ${label}`,
    ]);

  const photoCount = itemImages(item).length;
  const owner = openFolder === ALL ? clientName(item.clientId) : null;

  return el("article", { class: "review posted" }, [
    el("div", { class: "posted__thumb-wrap" }, [
      el("img", { class: "posted__thumb", src: sized(item.imageURL, 200, { square: true }), alt: "", loading: "lazy", decoding: "async" }),
      photoCount > 1 ? el("span", { class: "posted__photo-count" }, `${photoCount} photos`) : null,
    ]),
    el("div", { class: "posted__body" }, [
      el("div", { class: "review__head" }, [
        el("div", {}, [
          el("p", { class: "review__seller" }, `${item.category || "Item"}${item.brand ? ` · ${item.brand}` : ""}`),
          el(
            "p",
            { class: "review__meta" },
            `Size ${item.size || "—"} · ${formatNAD(item.price)} · ${item.condition || ""} · ${timeAgo(toFirestoreDate(item.createdAt))}${owner ? ` · for ${owner}` : ""}`
          ),
        ]),
        el(
          "span",
          { class: `status-pill status-pill--${item.sold ? "rejected" : "approved"}` },
          item.sold ? "sold" : "available"
        ),
      ]),
      el("div", { class: "review__actions" }, [
        button("edit", "pencil", () => startEdit(item)),
        button(item.sold ? "mark available" : "mark sold", item.sold ? "undo" : "check", (e) => toggleSold(e.currentTarget, item), "btn--outline"),
        button("delete", "trash", (e) => remove(e.currentTarget, item)),
      ]),
    ]),
  ]);
}

async function toggleSold(btn, item) {
  btn.disabled = true;
  try {
    await updateDoc(doc(db, "items", item.id), { sold: !item.sold });
    item.sold = !item.sold;
    toast(item.sold ? "Marked as sold" : "Back on the rack");
    paintMine();
  } catch (err) {
    console.error(err);
    toast("Couldn't update that piece.", "error");
    btn.disabled = false;
  }
}

async function remove(btn, item) {
  if (!confirm("Delete this piece from the feed? This can't be undone.")) return;
  btn.disabled = true;
  try {
    await deleteDoc(doc(db, "items", item.id));
    cleanUpImages(itemImages(item).map((img) => img.publicId));
    if (editing?.id === item.id) resetForm();
    items = items.filter((i) => i.id !== item.id);
    toast("Deleted");
    paintMine();
  } catch (err) {
    console.error(err);
    toast("Couldn't delete that piece.", "error");
    btn.disabled = false;
  }
}

/**
 * Best-effort: if the server or Cloudinary keys aren't available the post
 * is still gone from the feed — worst case a photo lingers in Cloudinary.
 */
async function cleanUpImages(publicIds) {
  const ids = publicIds.filter(Boolean);
  if (!ids.length) return;
  try {
    const idToken = await auth.currentUser.getIdToken();
    await deleteImages(ids, idToken);
  } catch (err) {
    console.warn("Couldn't delete the photo from Cloudinary:", err);
  }
}

paintClientSelect();
paintPhotos();
