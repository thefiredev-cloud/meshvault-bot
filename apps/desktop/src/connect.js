const form = document.querySelector("#server-form");
const input = document.querySelector("#server-origin");
const button = document.querySelector("#connect");
const status = document.querySelector("#status");
const hint = document.querySelector("#hint");

function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

async function loadSettings() {
  const settings = await window.meshvaultDesktop.server.settings();
  input.value = settings.currentOrigin ?? settings.savedOrigin ?? "";
  if (settings.error) showStatus(settings.error, true);
  if (settings.override) {
    hint.textContent =
      "MESHVAULT_WEB_URL controls startup while it is set. A server chosen here is still saved.";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  showStatus("Connecting…");
  try {
    await window.meshvaultDesktop.server.connect(input.value);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "Could not connect to that server.", true);
    button.disabled = false;
  }
});

loadSettings().catch((error) => {
  showStatus(error instanceof Error ? error.message : "Could not read the server setting.", true);
});
