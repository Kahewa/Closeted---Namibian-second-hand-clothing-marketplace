import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { $, el, toast, formatNAD, whatsappHref, sellFee, SELL_MIN, SELL_MAX, SELL_TIERS } from "./utils.js";

// sell.html — how selling through us works, and the application form.
// Applications land in Firestore (applications/{id}); anyone can create
// one, only the admin can read them (firebase/firestore.rules).

$("[data-fee-rows]").append(
  ...SELL_TIERS.map((t) => el("tr", {}, [el("td", {}, `${t.from} – ${t.to} pieces`), el("td", {}, formatNAD(t.fee))]))
);

const form = $("[data-apply-form]");
const field = (name) => form.querySelector(`[data-a="${name}"]`);
const feeLine = $("[data-apply-fee]");

function paintFee() {
  const fee = sellFee(field("pieces").value);
  feeLine.textContent = fee
    ? `Service fee for ${field("pieces").value} pieces: ${formatNAD(fee)}`
    : `Service fee: enter ${SELL_MIN} to ${SELL_MAX} pieces`;
  feeLine.classList.toggle("apply-fee--set", !!fee);
}
field("pieces").addEventListener("input", paintFee);

const clean = (name) => field(name).value.trim().replace(/\s+/g, " ");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pieces = Number(field("pieces").value);
  const data = {
    firstName: clean("firstName"),
    surname: clean("surname"),
    whatsapp: clean("whatsapp"),
    pieces,
    bank: {
      bankName: field("bankName").value,
      accountHolder: clean("accountHolder"),
      accountNumber: field("accountNumber").value.replace(/[\s-]/g, ""),
      branchCode: field("branchCode").value.replace(/[\s-]/g, ""),
    },
  };

  const problem = !data.firstName
    ? ["firstName", "Add your name."]
    : !data.surname
      ? ["surname", "Add your surname."]
      : !whatsappHref(data.whatsapp)
        ? ["whatsapp", "Add a WhatsApp number we can reach (e.g. 081 234 5678)."]
        : !Number.isInteger(pieces) || !sellFee(pieces)
          ? ["pieces", `We take batches of ${SELL_MIN} to ${SELL_MAX} pieces.`]
          : !data.bank.bankName
            ? ["bankName", "Pick your bank."]
            : !data.bank.accountHolder
              ? ["accountHolder", "Add the account holder's name."]
              : !/^\d{4,30}$/.test(data.bank.accountNumber)
                ? ["accountNumber", "Add your account number (digits only)."]
                : !field("agree").checked
                  ? ["agree", "Please tick the box to confirm you've read how payment works."]
                  : null;
  if (problem) {
    toast(problem[1], "error");
    field(problem[0]).focus();
    return;
  }

  const btn = $("[data-apply-submit]");
  btn.disabled = true;
  btn.classList.add("btn--loading");
  try {
    await addDoc(collection(db, "applications"), { ...data, status: "pending", createdAt: serverTimestamp() });
    form.hidden = true;
    $("[data-apply-done]").hidden = false;
    $("[data-apply-done]").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) {
    console.error("Couldn't send the application:", err);
    toast("Couldn't send that — check your connection and try again.", "error");
  } finally {
    btn.disabled = false;
    btn.classList.remove("btn--loading");
  }
});
