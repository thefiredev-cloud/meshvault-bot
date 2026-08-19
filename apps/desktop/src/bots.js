const rosterEl = document.querySelector("#roster");
const statusEl = document.querySelector("#status");
const searchEl = document.querySelector("#search");
const createForm = document.querySelector("#create-form");
const nameEl = document.querySelector("#bot-name");
const titleEl = document.querySelector("#bot-title");
const createBtn = document.querySelector("#create");
const chatTitle = document.querySelector("#chat-title");
const chatMeta = document.querySelector("#chat-meta");
const threadEl = document.querySelector("#thread");
const draftEl = document.querySelector("#draft");
const sendBtn = document.querySelector("#send");
const sessionsBtn = document.querySelector("#sessions");
const hideBtn = document.querySelector("#hide");
const meshvaultBtn = document.querySelector("#meshvault");

function showStatus(message, error = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", error);
}

function render(snapshot) {
  rosterEl.replaceChildren();
  for (const bot of snapshot.roster) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = bot.hidden ? "bot hidden" : "bot";
    const item = document.createElement("li");
    item.append(button);
    if (bot.name === snapshot.selectedBot) button.setAttribute("aria-current", "page");
    const title = document.createElement("strong");
    title.textContent = bot.title;
    const preview = document.createElement("span");
    preview.textContent = bot.preview || `@${bot.handle}`;
    button.append(title, preview);
    button.addEventListener("click", () => {
      window.meshbotDesktop.botMode.openChat(bot.name).then(render).catch(fail);
    });
    rosterEl.append(item);
  }
  const active = snapshot.roster.find((bot) => bot.name === snapshot.selectedBot);
  chatTitle.textContent = active?.title || "Bot Mode";
  chatMeta.textContent = snapshot.sessionsWorkspace
    ? `Sessions for @${active?.handle || snapshot.selectedBot}`
    : "Canonical Bot Chat";
  hideBtn.textContent = active?.hidden ? "Unhide bot" : "Hide bot";
  threadEl.replaceChildren();
  const rows = snapshot.sessionsWorkspace ? snapshot.sessions : snapshot.messages;
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = snapshot.sessionsWorkspace
      ? "No stored sessions yet."
      : "Open a bot to pin its forever Bot Chat. Messages stay on this computer until you send them through MeshVault.";
    threadEl.append(empty);
  }
  for (const row of rows) {
    const article = document.createElement("article");
    article.className = row.role === "user" ? "message user" : "message";
    article.textContent = row.text || row.title || row.preview || "Untitled session";
    if (row.id) {
      article.style.cursor = "pointer";
      article.addEventListener("click", () => {
        window.meshbotDesktop.botMode
          .openSession(snapshot.selectedBot, row.id)
          .then(render)
          .catch(fail);
      });
    }
    threadEl.append(article);
  }
}

function fail(error) {
  showStatus(error instanceof Error ? error.message : "Bot Mode failed.", true);
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  createBtn.disabled = true;
  try {
    const snapshot = await window.meshbotDesktop.botMode.createBot({
      name: nameEl.value,
      title: titleEl.value,
    });
    nameEl.value = "";
    titleEl.value = "";
    showStatus("Agent created.");
    render(snapshot);
  } catch (error) {
    fail(error);
  } finally {
    createBtn.disabled = false;
  }
});

searchEl.addEventListener("input", () => {
  window.meshbotDesktop.botMode.setQuery(searchEl.value).then(render).catch(fail);
});

sendBtn.addEventListener("click", async () => {
  sendBtn.disabled = true;
  try {
    const snapshot = await window.meshbotDesktop.botMode.sendMessage(draftEl.value);
    draftEl.value = "";
    render(snapshot);
  } catch (error) {
    fail(error);
  } finally {
    sendBtn.disabled = false;
  }
});

sessionsBtn.addEventListener("click", () => {
  window.meshbotDesktop.botMode
    .snapshot()
    .then((snapshot) => window.meshbotDesktop.botMode.openSessions(snapshot.selectedBot))
    .then(render)
    .catch(fail);
});

hideBtn.addEventListener("click", () => {
  window.meshbotDesktop.botMode
    .snapshot()
    .then((snapshot) => {
      const active = snapshot.roster.find((bot) => bot.name === snapshot.selectedBot);
      return window.meshbotDesktop.botMode.hideBot(snapshot.selectedBot, !active?.hidden);
    })
    .then(render)
    .catch(fail);
});

meshvaultBtn.addEventListener("click", () => {
  window.meshbotDesktop.botMode.openMeshVault().catch(fail);
});

window.meshbotDesktop.botMode.snapshot().then(render).catch(fail);
