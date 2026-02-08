(() => {
  const $ = (id) => document.getElementById(id);

  const monthEl = $("month");
  const newMonthBtn = $("newMonthBtn");

  const nameEl = $("name");
  const priceEl = $("price");
  const quadEl = $("quad");
  const addBtn = $("addBtn");

  const sumEl = $("sum");
  const remainEl = $("remain");
  const budgetEl = $("budget");
  const budgetFillEl = $("budgetFill");
  const budgetNoteEl = $("budgetNote");

  const clearSelectedBtn = $("clearSelectedBtn");
  const deleteSelectedBtn = $("deleteSelectedBtn");

  const lists = {
    IU: $("list_IU"),
    I: $("list_I"),
    U: $("list_U"),
    N: $("list_N"),
  };

  const STORAGE_KEY = "wish_matrix_v2";

  /**
   * db structure:
   * {
   *   months: {
   *     "2026-02": [ { id, name, price, quad, selected } ],
   *     ...
   *   },
   *   budgets: {
   *     "2026-02": 15000,
   *     ...
   *   }
   * }
   */
  let db = loadDB();
  let currentMonth = getThisMonth();

  // drag state
  let draggingId = null;

  init();

  function init() {
    monthEl.value = currentMonth;

    monthEl.addEventListener("change", () => {
      currentMonth = monthEl.value || getThisMonth();
      monthEl.value = currentMonth;
      render();
    });

    newMonthBtn.addEventListener("click", () => {
      currentMonth = getThisMonth();
      monthEl.value = currentMonth;
      render();
    });

    addBtn.addEventListener("click", onAdd);

    clearSelectedBtn.addEventListener("click", () => {
      const items = getItems(currentMonth);
      items.forEach((it) => (it.selected = false));
      setItems(currentMonth, items);
      render();
    });

    deleteSelectedBtn.addEventListener("click", () => {
      const items = getItems(currentMonth);
      const remain = items.filter((it) => !it.selected);
      setItems(currentMonth, remain);
      render();
    });

    // 予算入力
    budgetEl.addEventListener("input", () => {
      const v = toInt(budgetEl.value);
      if (Number.isNaN(v) || v < 0) {
        // 入力途中は保存しない（空や変な文字を許容）
        setBudget(currentMonth, null);
      } else {
        setBudget(currentMonth, v);
      }
      renderBudgetOnly();
      saveDB();
    });

    // Enterで追加
    [nameEl, priceEl].forEach((el) => {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") onAdd();
      });
    });

    // drop先イベント（4象限）
    Object.values(lists).forEach((ul) => wireDropZone(ul));

    render();
  }

  function onAdd() {
    const name = (nameEl.value || "").trim();
    const price = toInt(priceEl.value);
    const quad = quadEl.value;

    if (!name) {
      alert("アイテム名を入れてください");
      return;
    }
    if (price < 0 || Number.isNaN(price)) {
      alert("金額（0以上）を入れてください");
      return;
    }

    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
      name,
      price,
      quad,
      selected: false,
    };

    const items = getItems(currentMonth);
    items.push(item);
    setItems(currentMonth, items);

    nameEl.value = "";
    priceEl.value = "";
    nameEl.focus();

    render();
  }

  function render() {
    // 予算入力欄
    const b = getBudget(currentMonth);
    budgetEl.value = (typeof b === "number" && Number.isFinite(b)) ? String(b) : "";

    // リストを空に
    Object.values(lists).forEach((ul) => (ul.innerHTML = ""));

    const items = getItems(currentMonth);

    // 4象限に出し分け（価格高い順）
    items
      .slice()
      .sort((a, b) => b.price - a.price)
      .forEach((it) => {
        const li = renderItem(it);
        (lists[it.quad] || lists.N).appendChild(li);
      });

    renderBudgetOnly();

    saveDB();
  }

  function renderBudgetOnly() {
    const items = getItems(currentMonth);

    const selectedSum = items.reduce((acc, it) => acc + (it.selected ? it.price : 0), 0);
    sumEl.textContent = formatYen(selectedSum);

    const budget = getBudget(currentMonth);
    const hasBudget = typeof budget === "number" && Number.isFinite(budget) && budget >= 0;

    if (!hasBudget) {
      remainEl.textContent = "0";
      budgetFillEl.style.width = "0%";
      budgetFillEl.classList.remove("over");
      budgetNoteEl.classList.remove("over");
      budgetNoteEl.textContent = "予算を入れると、選択合計の進捗が表示されます。";
      return;
    }

    const remain = budget - selectedSum;
    remainEl.textContent = formatYen(remain);

    const ratio = budget === 0 ? (selectedSum > 0 ? 1 : 0) : Math.min(selectedSum / budget, 1.25); // 表示上限ゆるめ
    const percent = Math.min(ratio * 100, 125); // 125%まで表示
    budgetFillEl.style.width = `${percent}%`;

    const over = selectedSum > budget;
    budgetFillEl.classList.toggle("over", over);
    budgetNoteEl.classList.toggle("over", over);

    if (over) {
      budgetNoteEl.textContent = `予算オーバー：${formatYen(selectedSum - budget)}円`;
    } else {
      budgetNoteEl.textContent = `予算内：残り ${formatYen(budget - selectedSum)}円`;
    }
  }

  function renderItem(it) {
    const li = document.createElement("li");
    li.className = "item";
    li.draggable = true;
    li.dataset.id = it.id;

    li.addEventListener("dragstart", (e) => {
      draggingId = it.id;
      li.classList.add("dragging");
      try {
        e.dataTransfer.setData("text/plain", it.id);
        e.dataTransfer.effectAllowed = "move";
      } catch {}
    });

    li.addEventListener("dragend", () => {
      draggingId = null;
      li.classList.remove("dragging");
      Object.values(lists).forEach((ul) => ul.classList.remove("dragover"));
    });

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!it.selected;
    checkbox.addEventListener("change", () => {
      it.selected = checkbox.checked;
      saveDB();
      renderBudgetOnly();
    });

    const meta = document.createElement("div");
    meta.className = "meta";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = it.name;

    const price = document.createElement("div");
    price.className = "price";
    price.textContent = `${formatYen(it.price)}円`;

    meta.appendChild(name);
    meta.appendChild(price);

    const actions = document.createElement("div");
    actions.className = "rowActions";

    const editBtn = document.createElement("button");
    editBtn.className = "iconBtn ghost";
    editBtn.type = "button";
    editBtn.textContent = "編集";
    editBtn.addEventListener("click", () => onEdit(it.id));

    const delBtn = document.createElement("button");
    delBtn.className = "iconBtn danger";
    delBtn.type = "button";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", () => onDelete(it.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(checkbox);
    li.appendChild(meta);
    li.appendChild(actions);

    return li;
  }

  function wireDropZone(ul) {
    ul.addEventListener("dragover", (e) => {
      e.preventDefault();
      ul.classList.add("dragover");
      try { e.dataTransfer.dropEffect = "move"; } catch {}
    });

    ul.addEventListener("dragleave", () => {
      ul.classList.remove("dragover");
    });

    ul.addEventListener("drop", (e) => {
      e.preventDefault();
      ul.classList.remove("dragover");

      const targetQuad = ul.dataset.quad;
      if (!targetQuad) return;

      let id = null;
      try { id = e.dataTransfer.getData("text/plain"); } catch {}
      if (!id) id = draggingId;
      if (!id) return;

      moveItemToQuad(id, targetQuad);
    });
  }

  function moveItemToQuad(id, quad) {
    if (!["IU", "I", "U", "N"].includes(quad)) return;

    const items = getItems(currentMonth);
    const it = items.find((x) => x.id === id);
    if (!it) return;

    it.quad = quad;
    setItems(currentMonth, items);
    render();
  }

  function onEdit(id) {
    const items = getItems(currentMonth);
    const it = items.find((x) => x.id === id);
    if (!it) return;

    const newName = prompt("アイテム名", it.name);
    if (newName === null) return;

    const newPriceStr = prompt("金額（円）", String(it.price));
    if (newPriceStr === null) return;

    const newQuad = prompt(
      "分類：IU=Imp.&Urg. / I=Important / U=Urgent / N=Neither",
      it.quad
    );
    if (newQuad === null) return;

    const name = newName.trim();
    const price = toInt(newPriceStr);
    const quad = (newQuad || "").trim().toUpperCase();

    if (!name) {
      alert("名前が空です");
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      alert("金額が不正です");
      return;
    }
    if (!["IU", "I", "U", "N"].includes(quad)) {
      alert("分類は IU / I / U / N のどれかです");
      return;
    }

    it.name = name;
    it.price = price;
    it.quad = quad;

    setItems(currentMonth, items);
    render();
  }

  function onDelete(id) {
    const items = getItems(currentMonth);
    const target = items.find((x) => x.id === id);
    if (!target) return;

    const ok = confirm(`削除しますか？\n\n${target.name}（${formatYen(target.price)}円）`);
    if (!ok) return;

    const remain = items.filter((x) => x.id !== id);
    setItems(currentMonth, remain);
    render();
  }

  // ---- DB helpers ----

  function ensureShape(obj) {
    if (!obj || typeof obj !== "object") obj = {};
    if (!obj.months || typeof obj.months !== "object") obj.months = {};
    if (!obj.budgets || typeof obj.budgets !== "object") obj.budgets = {};
    return obj;
  }

  function getItems(monthKey) {
    db = ensureShape(db);
    if (!db.months[monthKey]) db.months[monthKey] = [];
    return db.months[monthKey];
  }

  function setItems(monthKey, items) {
    db = ensureShape(db);
    db.months[monthKey] = items;
    saveDB();
  }

  function getBudget(monthKey) {
    db = ensureShape(db);
    const v = db.budgets[monthKey];
    return (typeof v === "number" && Number.isFinite(v)) ? v : null;
  }

  function setBudget(monthKey, valueOrNull) {
    db = ensureShape(db);
    if (typeof valueOrNull === "number" && Number.isFinite(valueOrNull) && valueOrNull >= 0) {
      db.budgets[monthKey] = valueOrNull;
    } else {
      delete db.budgets[monthKey];
    }
  }

  function loadDB() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return ensureShape({});
      const parsed = JSON.parse(raw);
      return ensureShape(parsed);
    } catch {
      return ensureShape({});
    }
  }

  function saveDB() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // storage満杯など
    }
  }

  // ---- util ----

  function getThisMonth() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function toInt(v) {
    const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) ? n : NaN;
  }

  function formatYen(n) {
    const s = String(Math.trunc(n));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
})();
