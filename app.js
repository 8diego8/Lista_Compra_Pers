(() => {
  "use strict";

  const STORAGE_KEY = "lista-compra-v1";
  const $ = (selector) => document.querySelector(selector);
  const currentList = $("#current-list");
  const historyList = $("#history-list");
  const emptyList = $("#empty-list");
  const emptyHistory = $("#empty-history");
  const countLabel = $("#count-label");
  const addDialog = $("#add-dialog");
  const shareDialog = $("#share-dialog");
  const productInput = $("#product-name");
  const formError = $("#form-error");
  const toast = $("#toast");

  let state = loadState();
  let toastTimer;

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const history = Array.isArray(parsed.history) ? parsed.history : [];
      return {
        items: items.filter(x => x && typeof x.name === "string").map(x => ({
          id: String(x.id || makeId()), name: cleanName(x.name), bought: Boolean(x.bought)
        })).filter(x => x.name),
        history: [...new Set(history.filter(x => typeof x === "string").map(cleanName).filter(Boolean))]
      };
    } catch (error) {
      return { items: [], history: [] };
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      showToast("No se pudieron guardar los cambios. Comprueba el espacio disponible.");
    }
  }

  function makeId() {
    return (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function cleanName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  }

  function normalize(value) {
    return cleanName(value).toLocaleLowerCase("es");
  }

  function escapeText(value) {
    return String(value);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
  }

  function activeNames() {
    return new Set(state.items.map(item => normalize(item.name)));
  }

  function render() {
    currentList.replaceChildren();
    historyList.replaceChildren();

    const pending = state.items.filter(item => !item.bought);
    const bought = state.items.filter(item => item.bought);
    const ordered = [...pending, ...bought];

    ordered.forEach(item => {
      const row = document.createElement("label");
      row.className = `product-row${item.bought ? " is-bought" : ""}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "product-check";
      checkbox.checked = item.bought;
      checkbox.setAttribute("aria-label", `${item.bought ? "Desmarcar" : "Marcar como comprado"}: ${item.name}`);
      checkbox.addEventListener("change", () => {
        const target = state.items.find(x => x.id === item.id);
        if (!target) return;
        target.bought = checkbox.checked;
        persist();
        render();
      });

      const name = document.createElement("span");
      name.className = "product-name";
      name.textContent = escapeText(item.name);
      row.append(checkbox, name);
      currentList.append(row);
    });

    emptyList.hidden = state.items.length > 0;
    countLabel.textContent = `${state.items.length} ${state.items.length === 1 ? "producto" : "productos"}`;

    const active = activeNames();
    const availableHistory = state.history
      .filter(name => !active.has(normalize(name)))
      .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

    availableHistory.forEach(name => {
      const row = document.createElement("div");
      row.className = "history-row";
      const label = document.createElement("span");
      label.className = "history-name";
      label.textContent = name;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-small";
      button.textContent = "+ Añadir";
      button.addEventListener("click", () => addProduct(name, { fromHistory: true }));
      row.append(label, button);
      historyList.append(row);
    });
    emptyHistory.hidden = availableHistory.length > 0;
  }

  function addProduct(rawName, options = {}) {
    const name = cleanName(rawName);
    if (!name) {
      formError.textContent = "Escribe el nombre de un producto.";
      return false;
    }
    const existing = state.items.find(item => normalize(item.name) === normalize(name));
    if (existing) {
      if (options.fromHistory) showToast("Ese producto ya está en la lista.");
      else showToast("Ese producto ya está en la lista.");
      return false;
    }

    state.items.push({ id: makeId(), name, bought: false });
    if (!state.history.some(old => normalize(old) === normalize(name))) {
      state.history.push(name);
    }
    persist();
    render();
    if (addDialog.open) addDialog.close();
    productInput.value = "";
    formError.textContent = "";
    showToast("Producto añadido.");
    return true;
  }
function emptyBasket() {
  if (state.items.length === 0) {
    showToast("La cesta ya está vacía.");
    return;
  }

  const confirmed = window.confirm(
    "¿Quieres vaciar la cesta? Todos los productos se guardarán en Productos anteriores."
  );

  if (!confirmed) {
    return;
  }

  // Conservar todos los productos en el historial.
  state.items.forEach(item => {
    const alreadySaved = state.history.some(
      name => normalize(name) === normalize(item.name)
    );

    if (!alreadySaved) {
      state.history.push(item.name);
    }
  });

  // Vaciar la lista actual, sin borrar el historial.
  const total = state.items.length;
  state.items = [];

  // Guardar y actualizar la interfaz.
  persist();
  render();

  showToast(
    `${total} ${total === 1 ? "producto guardado" : "productos guardados"} en Productos anteriores.`
  );
}
  function openAddDialog() {
    formError.textContent = "";
    productInput.value = "";
    if (typeof addDialog.showModal === "function") addDialog.showModal();
    else addDialog.setAttribute("open", "");
    setTimeout(() => productInput.focus(), 60);
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function buildShareText() {
    const pending = state.items.filter(item => !item.bought);
    const bought = state.items.filter(item => item.bought);
    const lines = ["Lista de la compra"];
    if (pending.length) {
      lines.push("", "Pendiente:", ...pending.map(item => `• ${item.name}`));
    }
    if (bought.length) {
      lines.push("", "Ya comprado:", ...bought.map(item => `• ${item.name}`));
    }
    return lines.join("\n");
  }

  function openShareDialog() {
    if (!state.items.length) {
      showToast("No hay productos que compartir.");
      return;
    }
    $("#share-text").value = buildShareText();
    $("#share-status").textContent = "";
    if (typeof shareDialog.showModal === "function") shareDialog.showModal();
    else shareDialog.setAttribute("open", "");
  }

  $("#open-add").addEventListener("click", openAddDialog);
  $("#cancel-add").addEventListener("click", () => closeDialog(addDialog));
  $("#close-dialog").addEventListener("click", () => closeDialog(addDialog));
  $("#close-share").addEventListener("click", () => closeDialog(shareDialog));

  addDialog.addEventListener("click", event => {
    if (event.target === addDialog) closeDialog(addDialog);
  });
  shareDialog.addEventListener("click", event => {
    if (event.target === shareDialog) closeDialog(shareDialog);
  });

  $("#add-form").addEventListener("submit", event => {
    event.preventDefault();
    addProduct(productInput.value);
  });

  $("#share-button").addEventListener("click", openShareDialog);

  $("#native-share").addEventListener("click", async () => {
    const text = $("#share-text").value;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Lista de la compra", text });
        $("#share-status").textContent = "Se ha abierto el menú para compartir.";
      } catch (error) {
        if (error && error.name !== "AbortError") $("#share-status").textContent = "No se pudo abrir el menú de compartir. Prueba otra opción.";
      }
    } else {
      $("#share-status").textContent = "Este navegador no ofrece el menú nativo. Puedes copiar el texto o abrir WhatsApp.";
    }
  });

  $("#copy-share").addEventListener("click", async () => {
    const text = $("#share-text").value;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = $("#share-text");
        textarea.focus();
        textarea.select();
        const copied = document.execCommand("copy");
        if (!copied) throw new Error("No se pudo copiar");
      }
      $("#share-status").textContent = "Texto copiado.";
    } catch (error) {
      $("#share-status").textContent = "No se pudo copiar automáticamente. Mantén pulsado el texto para copiarlo.";
    }
  });

  $("#whatsapp-share").addEventListener("click", () => {
    const text = $("#share-text").value;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  });

  // Register the offline worker only when served over HTTPS or localhost.
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  render();
})();
