// --- Language handling ---
let lang = {};

async function loadLanguage(code) {
  const resp = await fetch(`lang/${code}.json`);
  lang = await resp.json();

  document.title = lang.title;
  document.getElementById("page_title").innerText = lang.title;
  document.getElementById("label_num_d6").innerText = lang.label_num_d6;
  document.getElementById("label_num_d6_input").innerText =
    lang.label_num_d6_input;
  document.getElementById("label_target").innerText = lang.label_target;
  document.getElementById("label_target_input").innerText =
    lang.label_target_input;
  document.getElementById("label_d12_mode").innerText = lang.label_d12_mode;
  document.getElementById("option_normal").innerText = lang.option_normal;
  document.getElementById("option_favored").innerText = lang.option_favored;
  document.getElementById("option_illfavored").innerText =
    lang.option_illfavored;
  document.getElementById("label_modifiers").innerText = lang.label_modifiers;
  document.getElementById("label_tired").innerText = lang.label_tired;
  document.getElementById("label_demoralized").innerText =
    lang.label_demoralized;
  document.getElementById("label_result").innerText = lang.label_result;

  calculateAndUpdate();
}

function switchLanguage(code) {
  loadLanguage(code);
}

// --- Rules ---
const D12Mode = { NORMAL: 0, FAVORED: 1, ILLFAVORED: -1 };

class Roll {
  constructor(
    num_d6,
    target,
    d12_mode = D12Mode.NORMAL,
    tired = false,
    demoralized = false,
  ) {
    if (num_d6 < 0) {
      throw new Error("num_d6 must be >= 0");
    }

    this.num_d6 = num_d6;
    this.target = target;
    this.d12_mode = d12_mode;
    this.tired = tired;
    this.demoralized = demoralized;
  }
}

// --- Exact optimized D6 distribution ---
function d6Distribution(num_d6, tired) {
  let dp = new Map();
  dp.set("0,0", 1);

  for (let i = 0; i < num_d6; i++) {
    const next = new Map();

    for (const [key, count] of dp.entries()) {
      const [sum, sixes] = key.split(",").map(Number);

      for (let face = 1; face <= 6; face++) {
        const val = tired && face <= 3 ? 0 : face;

        const newSum = sum + val;
        const newSixes = sixes + (face === 6 ? 1 : 0);

        const newKey = `${newSum},${newSixes}`;

        next.set(newKey, (next.get(newKey) || 0) + count);
      }
    }

    dp = next;
  }

  return dp;
}

// --- D12 distribution ---
function d12Distribution(mode) {
  const dist = new Map();
  const faces = [...Array(12).keys()]; // 0..11

  if (mode === D12Mode.NORMAL) {
    for (const v of faces) {
      dist.set(v, 1);
    }

    return dist;
  }

  for (const a of faces) {
    for (const b of faces) {
      const result = mode === D12Mode.FAVORED ? Math.max(a, b) : Math.min(a, b);

      dist.set(result, (dist.get(result) || 0) + 1);
    }
  }

  return dist;
}

// --- Success rules ---
function isSuccess(sum_d6, d12_val, roll) {
  // Gandalf rune = automatic success
  if (d12_val === 11) {
    return true;
  }

  // Eye of Sauron = automatic failure if demoralized
  if (roll.demoralized && d12_val === 0) {
    return false;
  }

  return sum_d6 + d12_val >= roll.target;
}

// --- Success probability ---
function probabilitySuccess(roll) {
  const d6 = d6Distribution(roll.num_d6, roll.tired);
  const d12 = d12Distribution(roll.d12_mode);

  let total = 0;
  let success = 0;

  for (const [key, w_d6] of d6.entries()) {
    const [sum_d6] = key.split(",").map(Number);

    for (const [d12_val, w_d12] of d12.entries()) {
      const weight = w_d6 * w_d12;

      total += weight;

      if (isSuccess(sum_d6, d12_val, roll)) {
        success += weight;
      }
    }
  }

  return success / total;
}

// --- Great success probability ---
function probabilityGrandSuccess(roll) {
  const d6 = d6Distribution(roll.num_d6, roll.tired);
  const d12 = d12Distribution(roll.d12_mode);

  const ge = { 1: 0, 2: 0, 3: 0, 4: 0 };

  let total = 0;

  for (const [key, w_d6] of d6.entries()) {
    const [sum_d6, n_sixes] = key.split(",").map(Number);

    for (const [d12_val, w_d12] of d12.entries()) {
      const weight = w_d6 * w_d12;

      total += weight;

      // Great success requires a normal success first
      if (!isSuccess(sum_d6, d12_val, roll)) {
        continue;
      }

      // Requires at least one Tengwar (6)
      if (n_sixes <= 0) {
        continue;
      }

      for (let i = 1; i <= Math.min(n_sixes, 4); i++) {
        ge[i] += weight;
      }
    }
  }

  for (const k in ge) {
    ge[k] /= total;
  }

  return ge;
}

// --- UI helpers ---
function attachNumberButtons(id) {
  const input = document.getElementById(id);
  const container = input.parentNode;

  const btnDec = container.querySelector(".decrement");
  const btnInc = container.querySelector(".increment");

  btnDec.addEventListener("click", () => {
    input.value = Math.max(Number(input.min) || 0, Number(input.value) - 1);

    calculateAndUpdate();
  });

  btnInc.addEventListener("click", () => {
    input.value = Number(input.value) + 1;

    calculateAndUpdate();
  });
}

// --- D12 mode helper ---
function getD12Mode() {
  const selected = document.querySelector('input[name="d12_mode"]:checked');

  return Number(selected.value);
}

// --- Main UI update ---
function calculateAndUpdate() {
  const roll = new Roll(
    Number(document.getElementById("num_d6").value),
    Number(document.getElementById("target").value),
    getD12Mode(),
    document.getElementById("tired").checked,
    document.getElementById("demoralized").checked,
  );

  const prob = probabilitySuccess(roll);
  const ge = probabilityGrandSuccess(roll);

  const lambe = '<img src="img/tengwar-lambe.png" class="lambe-icon">';

  document.getElementById("result").innerHTML = `
    ${lang.result_success}: ${(prob * 100).toFixed(2)}%<br>
    ${lambe}: ${(ge[1] * 100).toFixed(2)}%<br>
    ${lambe}${lambe}: ${(ge[2] * 100).toFixed(2)}%<br>
    ${lambe}${lambe}${lambe}: ${(ge[3] * 100).toFixed(2)}%<br>
    ${lambe}${lambe}${lambe}${lambe}: ${(ge[4] * 100).toFixed(2)}%
  `;
}

// --- Event wiring ---
["num_d6", "target"].forEach(attachNumberButtons);

["num_d6", "target", "tired", "demoralized"].forEach((id) => {
  const el = document.getElementById(id);

  el.addEventListener("input", calculateAndUpdate);
  el.addEventListener("change", calculateAndUpdate);
});

document.querySelectorAll('input[name="d12_mode"]').forEach((radio) => {
  radio.addEventListener("change", calculateAndUpdate);
});

// --- Init ---
loadLanguage("es");
