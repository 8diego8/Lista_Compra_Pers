
(() => {
  "use strict";

  const STORAGE_KEY = "lista-compra-v1";
  const $ = selector => document.querySelector(selector);

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

  const authPanel = $("#auth-panel");
  const appContent = $("#app-content");
  const authForm = $("#auth-form");
  const authEmail = $("#auth-email");
  const authPassword = $("#auth-password");
  const authError = $("#auth-error");
  const authStatus = $("#auth-status");
  const configWarning = $("#config-warning");
  const userEmail = $("#user-email");
  const syncStatus = $("#sync-status");

  let state = loadState();
  let toastTimer;
  let auth = null;
  let db = null;
  let currentUser = null;
  let cloudRef = null;
  let unsubscribeSnapshot = null;
  let cloudReady = false;
  let lastCloudWrite = Promise.resolve();

  // ------------------------------
  // ALMACENAMIENTO LOCAL
  // ------------------------------

  function cleanName(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);
  }

  function normalize(value) {
    return cleanName(value).toLocaleLowerCase("es");
  }

  function makeId() {
    return window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function sanitizeState(value) {
    const source = value && typeof value === "object" ? value : {};
    const items = Array.isArray(source.items) ? source.items : [];
    const history = Array.isArray(source.history) ? source.history : [];

    return {
      items: items
        .filter(item => item && typeof item.name === "string")
        .map(item => ({
          id: String(item.id || makeId()),
          name: cleanName(item.name),
          bought: Boolean(item.bought)
        }))
        .filter(item => item.name),
      history: [
        ...new Set(
          history
            .filter(name => typeof name === "string")
            .map(cleanName)
            .filter(Boolean)
        )
      ]
    };
  }

  function loadState() {
    try {
      return sanitizeState(
        JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
      );
    } catch (error) {
      return { items: [], history: [] };
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error("Error guardando en localStorage:", error);
      showToast("No se pudo guardar una copia local.");
      return false;
    }
  }

  function mergeStates(cloudState, localState) {
    const cloud = sanitizeState(cloudState);
    const local = sanitizeState(localState);

    const items = [...cloud.items];
    const knownNames = new Set(items.map(item => normalize(item.name)));

    // Conservar productos locales que aún no existan en la nube.
    local.items.forEach(item => {
      const key = normalize(item.name);
      if (!knownNames.has(key)) {
        items.push(item);
        knownNames.add(key);
      }
    });

    const history = [...cloud.history];
    const historyNames = new Set(history.map(normalize));

    local.history.forEach(name => {
      const key = normalize(name);
      if (!historyNames.has(key)) {
        history.push(name);
        historyNames.add(key);
      }
    });

    // Todo producto actual debe estar también en el historial.
    items.forEach(item => {
      const key = normalize(item.name);
      if (!historyNames.has(key)) {
        history.push(item.name);
        historyNames.add(key);
      }
    });

    return { items, history };
  }

  // Guarda primero en local y después envía la actualización a Firestore.
  function persist() {
    saveLocal();

    if (!currentUser || !cloudReady || !cloudRef) {
      return;
    }

    const payload = {
      items: state.items,
      history: state.history,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Ordenar las escrituras para evitar que una actualización anterior
    // termine escribiéndose después de una más reciente.
    lastCloudWrite = lastCloudWrite
      .catch(() => {})
      .then(() => cloudRef.set(payload))
      .then(() => {
        if (currentUser) {
          syncStatus.textContent = "Cambios sincronizados con la nube.";
        }
      })
      .catch(error => {
        console.error("Error guardando en Firestore:", error);
        syncStatus.textContent =
          "No se pudo sincronizar. Comprueba tu conexión.";
        showToast("Guardado localmente; no se pudo sincronizar.");
      });
  }

  // ------------------------------
  // FIREBASE
  // ------------------------------

  function setupFirebase() {
    const config = window.FIREBASE_CONFIG;

    const configured =
      config &&
      typeof config.apiKey === "string" &&
      config.apiKey.length > 0 &&
      !config.apiKey.startsWith("PEGA_AQUI_") &&
      typeof config.projectId === "string" &&
      config.projectId.length > 0 &&
      !config.projectId.startsWith("PEGA_AQUI_") &&
      typeof config.appId === "string" &&
      config.appId.length > 0 &&
      !config.appId.startsWith("PEGA_AQUI_");

    if (!configured || typeof firebase === "undefined") {
      configWarning.hidden = false;
      authError.textContent =
        "Firebase no está configurado correctamente. Revisa firebase-config.js y la carga de los scripts.";
      $("#login-button").disabled = true;
      $("#register-button").disabled = true;
      $("#reset-button").disabled = true;
      return false;
    }

    try {
      const app = firebase.initializeApp(config);
      auth = app.auth();
      db = app.firestore();

      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .catch(error => {
          console.error("No se pudo configurar la persistencia:", error);
        });

      return true;
    } catch (error) {
      console.error("Error inicializando Firebase:", error);
      authError.textContent =
        "No se pudo iniciar Firebase. Revisa la configuración del proyecto.";
      return false;
    }
  }

  function showAuthError(error) {
    console.error(error);

    const messages = {
      "auth/invalid-email": "El correo electrónico no es válido.",
      "auth/missing-password": "Escribe tu contraseña.",
      "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
      "auth/email-already-in-use": "Ese correo ya tiene una cuenta. Inicia sesión.",
      "auth/invalid-credential": "Correo o contraseña incorrectos.",
      "auth/user-not-found": "No existe una cuenta con esos datos.",
      "auth/wrong-password": "La contraseña no es correcta.",
      "auth/too-many-requests": "Demasiados intentos. Espera un poco y vuelve a probar.",
      "auth/network-request-failed": "No hay conexión. Comprueba Internet.",
      "auth/operation-not-allowed": "Activa el acceso por correo y contraseña en Firebase Authentication.",
      "auth/unauthorized-domain": "Añade el dominio de tu web en los dominios autorizados de Firebase.",
      "permission-denied": "Firestore ha rechazado el acceso. Comprueba las reglas de seguridad."
    };

    authError.textContent =
      messages[error.code] ||
      "Ha ocurrido un error. Revisa la configuración de Firebase e inténtalo de nuevo.";
  }

  async function initializeCloudForUser(user) {
    cloudReady = false;
    syncStatus.textContent = "Cargando tu lista desde la nube…";

    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }

    // La lista pertenece exclusivamente a este usuario.
    cloudRef = db
      .collection("users")
      .doc(user.uid)
      .collection("lists")
      .doc("main");

    try {
      const localBeforeLogin = sanitizeState(state);
      const document = await cloudRef.get();

      if (document.exists) {
        // Si ya existe una lista en la nube, conservar también los
        // productos locales que todavía no estén allí.
        state = mergeStates(document.data(), localBeforeLogin);
      } else {
        // Primera conexión de esta cuenta: migrar la lista local.
        state = sanitizeState(localBeforeLogin);
      }

      saveLocal();
      render();

      // La primera escritura crea la lista o incorpora los datos locales.
      await cloudRef.set({
        items: state.items,
        history: state.history,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      cloudReady = true;
      syncStatus.textContent = "Sincronización activada.";

      // Escuchar los cambios hechos desde otros dispositivos.
      unsubscribeSnapshot = cloudRef.onSnapshot(
        snapshot => {
          if (!currentUser || !cloudReady || !snapshot.exists) {
            return;
          }

          state = sanitizeState(snapshot.data());
          saveLocal();
          render();
          syncStatus.textContent = "Lista sincronizada con la nube.";
        },
        error => {
          console.error("Error escuchando Firestore:", error);
          syncStatus.textContent =
            "No se pudieron recibir cambios de la nube.";
        }
      );
    } catch (error) {
      console.error("Error inicializando la lista en la nube:", error);
      cloudReady = false;
      syncStatus.textContent =
        "No se pudo cargar la nube. Comprueba las reglas y tu conexión.";
      showToast("Error al conectar con la nube.");
    }
  }

  function setupAuthListener() {
    auth.onAuthStateChanged(async user => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      currentUser = user;
      cloudReady = false;
      cloudRef = null;

      if (!user) {
        authPanel.hidden = false;
        appContent.hidden = true;
        userEmail.textContent = "";
        syncStatus.textContent = "";
        authStatus.textContent = "";
        return;
      }

      authPanel.hidden = true;
      appContent.hidden = false;
      userEmail.textContent = user.email || "Cuenta conectada";
      authError.textContent = "";
      authStatus.textContent = "";

      await initializeCloudForUser(user);
    });
  }

  // ------------------------------
  // MENSAJES Y RENDERIZADO
  // ------------------------------

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
    }, 2600);
  }

  function activeNames() {
    return new Set(state.items.map(item => normalize(item.name)));
  }

  function render() {
    currentList.replaceChildren();
    historyList.replaceChildren();

    const pending = state.items.filter(item => !item.bought);
    const bought = state.items.filter(item => item.bought);

    [...pending, ...bought].forEach(item => {
      const row = document.createElement("label");
      row.className = `product-row${item.bought ? " is-bought" : ""}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "product-check";
      checkbox.checked = item.bought;
      checkbox.setAttribute(
        "aria-label",
        `${item.bought ? "Desmarcar" : "Marcar como comprado"}: ${item.name}`
      );

      checkbox.addEventListener("change", () => {
        const target = state.items.find(product => product.id === item.id);
        if (!target) return;

        target.bought = checkbox.checked;
        persist();
        render();
      });

      const name = document.createElement("span");
      name.className = "product-name";
      name.textContent = item.name;

      row.append(checkbox, name);
      currentList.append(row);
    });

    emptyList.hidden = state.items.length > 0;

    countLabel.textContent =
      `${state.items.length} ${state.items.length === 1 ? "producto" : "productos"}`;

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

      button.addEventListener("click", () => {
        addProduct(name, { fromHistory: true });
      });

      row.append(label, button);
      historyList.append(row);
    });

    emptyHistory.hidden = availableHistory.length > 0;
  }

  // ------------------------------
  // PRODUCTOS
  // ------------------------------

  function addProduct(rawName, options = {}) {
    const name = cleanName(rawName);

    if (!name) {
      formError.textContent = "Escribe el nombre de un producto.";
      return false;
    }

    const existing = state.items.find(
      item => normalize(item.name) === normalize(name)
    );

    if (existing) {
      showToast("Ese producto ya está en la lista.");
      return false;
    }

    state.items.push({
      id: makeId(),
      name,
      bought: false
    });

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

    if (!window.confirm(
      "¿Quieres vaciar la cesta? Todos los productos se guardarán en Productos anteriores."
    )) {
      return;
    }

    state.items.forEach(item => {
      if (!state.history.some(name => normalize(name) === normalize(item.name))) {
        state.history.push(item.name);
      }
    });

    const total = state.items.length;
    state.items = [];

    persist();
    render();

    showToast(
      `${total} ${total === 1 ? "producto guardado" : "productos guardados"} en Productos anteriores.`
    );
  }

  function openAddDialog() {
    formError.textContent = "";
    productInput.value = "";

    if (typeof addDialog.showModal === "function") {
      addDialog.showModal();
    } else {
      addDialog.setAttribute("open", "");
    }

    setTimeout(() => productInput.focus(), 60);
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  // ------------------------------
  // COMPARTIR
  // ------------------------------

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

    if (typeof shareDialog.showModal === "function") {
      shareDialog.showModal();
    } else {
      shareDialog.setAttribute("open", "");
    }
  }

  // ------------------------------
  // EVENTOS DE AUTENTICACIÓN
  // ------------------------------

  authForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!auth) return;

    authError.textContent = "";
    authStatus.textContent = "Iniciando sesión…";

    try {
      await auth.signInWithEmailAndPassword(
        authEmail.value.trim(),
        authPassword.value
      );

      authPassword.value = "";
      authStatus.textContent = "";
    } catch (error) {
      authStatus.textContent = "";
      showAuthError(error);
    }
  });

  $("#register-button").addEventListener("click", async () => {
    if (!auth) return;

    authError.textContent = "";
    authStatus.textContent = "Creando cuenta…";

    try {
      await auth.createUserWithEmailAndPassword(
        authEmail.value.trim(),
        authPassword.value
      );

      authPassword.value = "";
      authStatus.textContent = "";
    } catch (error) {
      authStatus.textContent = "";
      showAuthError(error);
    }
  });

  $("#reset-button").addEventListener("click", async () => {
    if (!auth) return;

    const email = authEmail.value.trim();

    if (!email) {
      authError.textContent = "Escribe tu correo para recuperar la contraseña.";
      authEmail.focus();
      return;
    }

    authError.textContent = "";
    authStatus.textContent = "";

    try {
      await auth.sendPasswordResetEmail(email);
      authStatus.textContent = "Te hemos enviado un correo para restablecer la contraseña.";
    } catch (error) {
      showAuthError(error);
    }
  });

  $("#logout-button").addEventListener("click", async () => {
    if (!auth) return;

    try {
      // Esperar las escrituras pendientes antes de cerrar sesión.
      await lastCloudWrite.catch(() => {});
      await auth.signOut();
      showToast("Has cerrado sesión.");
    } catch (error) {
      showAuthError(error);
    }
  });

  // ------------------------------
  // EVENTOS DE LA APLICACIÓN
  // ------------------------------

  $("#open-add").addEventListener("click", openAddDialog);
  $("#empty-basket").addEventListener("click", emptyBasket);

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
        if (error && error.name !== "AbortError") {
          $("#share-status").textContent =
            "No se pudo abrir el menú de compartir. Prueba otra opción.";
        }
      }
    } else {
      $("#share-status").textContent =
        "Este navegador no ofrece el menú nativo. Puedes copiar el texto o abrir WhatsApp.";
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

        if (!document.execCommand("copy")) {
          throw new Error("No se pudo copiar");
        }
      }

      $("#share-status").textContent = "Texto copiado.";
    } catch (error) {
      $("#share-status").textContent =
        "No se pudo copiar automáticamente. Mantén pulsado el texto para copiarlo.";
    }
  });

  $("#whatsapp-share").addEventListener("click", () => {
    const text = $("#share-text").value;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer"
    );
  });

  // ------------------------------
  // ARRANQUE
  // ------------------------------

  render();

  if (setupFirebase()) {
    setupAuthListener();
  }
})();
