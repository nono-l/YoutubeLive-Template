"use strict";

function $(id) {
  return document.getElementById(id);
}

function showMessage(text, kind) {
  const n = $("message");
  const panel = $("message-panel");
  n.textContent = text;
  n.className = kind || "info";
  panel.style.display = "block";
  panel.className = "";
  setTimeout(() => {
    panel.className = "fadeout";
    setTimeout(() => {
      panel.style.display = "none";
      panel.className = "";
    }, 400);
  }, 2800);
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function isStudioUrl(url) {
  if (!url) return false;
  return /https:\/\/(studio\.youtube\.com|www\.youtube\.com\/(live_dashboard|livestreaming))/i.test(url);
}

async function injectBridge(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["scripts/bridge-a.js", "scripts/bridge-b.js"]
  });
}

async function fetchFromPage(tabId) {
  await injectBridge(tabId);
  const [inj] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => (window.__yltBridge ? window.__yltBridge.fetch() : { ok: false, reason: "no-bridge" })
  });
  return (inj && inj.result) || { ok: false };
}

async function applyToPage(tabId, template) {
  await injectBridge(tabId);
  const [inj] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (args) => (window.__yltBridge ? window.__yltBridge.apply(args) : { ok: false, reason: "no-bridge" }),
    args: [
      {
        title: template.name,
        body: template.value,
        videotag: template.videotag || "",
        category: template.category || "",
        categoryId: template.categoryId || "",
        gameTitle: template.gameTitle || "",
        playlists: template.playlists || ""
      }
    ]
  });
  return (inj && inj.result) || { ok: false };
}

function renderList(templates) {
  const list = $("list");
  list.innerHTML = "";
  if (!templates.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "テンプレートはまだありません。Studioの配信詳細を開いて保存してください。";
    list.appendChild(empty);
    return;
  }
  templates.forEach((t) => {
    const row = document.createElement("div");
    row.className = "template-row";
    row.dataset.id = t.id;
    const btn = document.createElement("button");
    btn.className = "btn apply";
    btn.textContent = "適用";
    const name = document.createElement("p");
    name.className = "name";
    name.textContent = t.name;
    name.title = t.name;
    row.appendChild(btn);
    row.appendChild(name);
    row.addEventListener("click", async () => {
      const tab = await activeTab();
      if (!tab) return showMessage("タブを取得できませんでした", "error");
      if (!isStudioUrl(tab.url)) {
        return showMessage("YouTube Studio の配信詳細ページで使ってください", "error");
      }
      try {
        const result = await applyToPage(tab.id, t);
        if (result.ok) showMessage("適用しました。Studio側で保存を押してください");
        else showMessage("欄が見つかりません。詳細設定を開いた状態で試してください", "error");
      } catch (e) {
        showMessage("適用に失敗しました: " + (e.message || e), "error");
      }
    });
    list.appendChild(row);
  });
}

async function refresh() {
  const templates = await YltStorage.getTemplates();
  renderList(templates);
}

document.addEventListener("DOMContentLoaded", async () => {
  $("option").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  $("open-studio").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://studio.youtube.com/" });
  });

  $("open-manage").addEventListener("click", async () => {
    const tab = await activeTab();
    chrome.runtime.sendMessage({ type: "ylt-open-manage", tabId: tab && tab.id });
    window.close();
  });

  $("fetch").addEventListener("click", async () => {
    const tab = await activeTab();
    if (!tab) return showMessage("タブを取得できませんでした", "error");
    if (!isStudioUrl(tab.url)) {
      return showMessage("YouTube Studio の配信詳細ページで保存してください", "error");
    }
    try {
      const data = await fetchFromPage(tab.id);
      if (!data.ok || !data.title) {
        return showMessage("タイトル欄が見つかりません。詳細パネルを開いてください", "error");
      }
      const saved = await YltStorage.saveTemplate(data.title, data.body, data.videotag, {
        category: data.category || "",
        categoryId: data.categoryId || "",
        gameTitle: data.gameTitle || "",
        playlists: data.playlists || ""
      });
      if (saved.ok) {
        showMessage("テンプレートとして保存しました");
        await refresh();
      } else {
        showMessage("保存に失敗しました", "error");
      }
    } catch (e) {
      showMessage("保存に失敗しました: " + (e.message || e), "error");
    }
  });

  await refresh();
});
