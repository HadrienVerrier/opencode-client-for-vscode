import { randomBytes } from "node:crypto"

/**
 * Page the extension owns: full-bleed iframe GUI, a server form for the first run, and a relay that
 * forwards messages between the webview API and the iframe. The GUI must run on a loopback origin,
 * not `vscode-webview://`, because the OpenCode server only allows `http://127.0.0.1:*` origins.
 */
export function webviewHtml(frameUrl: string) {
  const nonce = randomBytes(16).toString("base64")

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http: https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:;" />
<style>
html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; background: transparent; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
iframe { display: block; width: 100%; height: 100%; border: 0; background: transparent; }
#setup { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; overflow: auto; background: var(--vscode-editor-background, #1e1e1e); }
#setup[hidden] { display: none; }
#setup form { width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: 12px; }
#setup h1 { margin: 0; font-size: 1.15em; font-weight: 600; }
#setup p { margin: 0; }
#setup code { font-family: var(--vscode-editor-font-family, monospace); }
#setup label { display: flex; flex-direction: column; gap: 4px; }
#setup input { padding: 6px 8px; border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font: inherit; }
#setup input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
#setup .hint { opacity: 0.8; font-size: 0.9em; }
#setup .error { color: var(--vscode-errorForeground); }
#setup .actions { display: flex; align-items: center; gap: 8px; }
#setup button { padding: 6px 14px; border: 0; border-radius: 2px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); font: inherit; cursor: pointer; }
#setup button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
#setup button:disabled { opacity: 0.6; cursor: default; }
#setup button.link { background: none; color: var(--vscode-textLink-foreground); }
#setup button.link:hover { background: none; text-decoration: underline; }
#setup #install { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; }
#setup #install[hidden] { display: none; }
#setup #install pre { margin: 0; padding: 6px 8px; overflow-x: auto; background: var(--vscode-textCodeBlock-background, #0002); }
#setup .install-actions { display: flex; gap: 8px; }
</style>
</head>
<body>
<div id="setup" hidden>
<form id="form">
<h1>Connect to an OpenCode server</h1>
<div id="install" hidden>
<p id="install-message"></p>
<pre><code id="install-command"></code></pre>
<div class="install-actions">
<button id="install-button" type="button">Install OpenCode</button>
<button id="retry" type="button" class="link">Retry</button>
</div>
</div>
<p class="hint">Run <code>opencode serve --hostname 0.0.0.0 --port 4096</code> where your project lives, or leave the URL empty to start OpenCode locally.</p>
<p id="local" class="hint" hidden></p>
<label>Server URL
<input id="url" type="url" autocomplete="off" spellcheck="false" placeholder="http://127.0.0.1:4096" />
</label>
<label>Password
<input id="password" type="password" autocomplete="off" />
</label>
<p id="status" class="hint" role="status"></p>
<div class="actions">
<button id="save" type="submit">Connect</button>
<button id="later" type="button" class="link">Hide</button>
</div>
</form>
</div>
<iframe id="frame" src="${escapeAttribute(frameUrl)}" allow="clipboard-read; clipboard-write"></iframe>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const frame = document.getElementById("frame");
const setup = document.getElementById("setup");
const url = document.getElementById("url");
const password = document.getElementById("password");
const status = document.getElementById("status");
const save = document.getElementById("save");
const install = document.getElementById("install");
const installMessage = document.getElementById("install-message");
const installCommand = document.getElementById("install-command");
const installButton = document.getElementById("install-button");
const local = document.getElementById("local");
const target = new URL(frame.src).origin;
let ready = false;
let attempts = 0;
// Chat requests made while the GUI boots: it ignores messages posted before its ready handshake.
const queued = [];

function post(data) {
if (frame.contentWindow) frame.contentWindow.postMessage(data, target);
}

function show(state) {
setup.hidden = false;
save.disabled = false;
if (state.serverUrl) url.value = state.serverUrl;
password.value = "";
password.placeholder = state.hasPassword ? "stored, leave blank to keep it" : "optional";
install.hidden = !state.install;
installMessage.textContent = !state.install
  ? ""
  : state.install.reason === "outdated"
    ? "OpenCode " + state.install.version + " is installed, but this extension needs OpenCode 2. Install it, then retry."
    : "OpenCode 2 is not installed on this machine. Install it, then retry.";
installCommand.textContent = state.install ? state.install.command : "";
local.hidden = !state.localServer;
local.textContent = state.localServer ? "Using the local server at " + state.localServer + "." : "";
status.textContent = state.error || "";
status.className = state.error ? "error" : "hint";
if (state.install) installButton.focus();
else url.focus();
}

installButton.addEventListener("click", () => vscode.postMessage({ type: "opencode/install" }));
document.getElementById("retry").addEventListener("click", () => vscode.postMessage({ type: "opencode/retry" }));

document.getElementById("form").addEventListener("submit", (event) => {
event.preventDefault();
status.textContent = "Connecting…";
status.className = "hint";
save.disabled = true;
vscode.postMessage({ type: "opencode/saveServer", serverUrl: url.value.trim(), password: password.value || undefined });
});

document.getElementById("later").addEventListener("click", () => (setup.hidden = true));

window.addEventListener("message", (event) => {
data = event.data;
if (!data) return;
if (event.source === frame.contentWindow) {
if (data.type === "opencode/ready") { ready = true; while (queued.length) post(queued.shift()); }
vscode.postMessage(data);
return;
}
if (data.type === "opencode/config") { if (data.config && data.config.serverUrl) setup.hidden = true; post(data); return; }
if (data.type === "opencode/theme") { post(data); return; }
if (data.type === "opencode/context" || data.type === "opencode/editors" || data.type === "opencode/newSession") { if (ready) post(data); else queued.push(data); return; }
if (data.type === "opencode/setup") show(data);
});

// VS Code restores the page before the extension listens on the asset port, so the first request can
// time out and leave an empty frame: retry until the GUI answers.
setInterval(() => {
if (ready || attempts++ > 4) return;
frame.src = frame.src;
}, 2000);
</script>
</body>
</html>`
}

function escapeAttribute(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char)
}
