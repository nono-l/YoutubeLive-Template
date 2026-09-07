"use strict";

function $(id) {
  return document.getElementById(id);
}

let selectedId = "";

function setPreview(template) {
  selectedId = template ? String(template.id) : "";
  $("preview").dataset.id = selectedId;
  $("title").value = template ? template.name : "";
  $("body").value = template ? template.value : "";
  $("videotags").value = template ? template.videotag || "" : "";
  $("category").value = template ? template.category || "" : "";
  $("gameTitle").value = template ? template.gameTitle || "" : "";
  $("playlists").value = template ? template.playlists || "" : "";
}

async function paint() {
  const ul = document.querySelector("#list ul");
  ul.innerHTML = "";
  const templates = await YltStorage.getTemplates();
  templates.forEach((t) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#";
    a.className = "template-title" + (String(t.id) === selectedId ? " active" : "");
    a.dataset.id = t.id;
    a.textContent = t.name;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      setPreview(t);
      paint();
    });
    li.appendChild(a);
    ul.appendChild(li);
  });
  $("count").textContent = templates.length + "件";
}

document.addEventListener("DOMContentLoaded", async () => {
  $("delete").addEventListener("click", async () => {
    if (!selectedId) return;
    if (!window.confirm("このテンプレートを削除しますか？")) return;
    await YltStorage.deleteTemplate(selectedId);
    setPreview(null);
    await paint();
  });

  $("edit").addEventListener("click", async () => {
    if (!selectedId) {
      const name = $("title").value.trim();
      if (!name) return alert("タイトルを入力してください");
      await YltStorage.saveTemplate(name, $("body").value, $("videotags").value, {
        category: $("category").value,
        gameTitle: $("gameTitle").value,
        playlists: $("playlists").value
      });
      await paint();
      return;
    }
    await YltStorage.updateTemplate(selectedId, {
      name: $("title").value.trim() || "無題",
      value: $("body").value,
      videotag: $("videotags").value,
      category: $("category").value,
      gameTitle: $("gameTitle").value,
      playlists: $("playlists").value
    });
    await paint();
  });

  $("add").addEventListener("click", () => {
    setPreview(null);
    $("title").focus();
    paint();
  });

  $("export").addEventListener("click", async () => {
    const templates = await YltStorage.getTemplates();
    const blob = new Blob([JSON.stringify({ version: "3.2.5.0", templates }, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "youtubelive-templates.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  $("import-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incoming = YltStorage.normalize(parsed.templates || parsed);
      const current = await YltStorage.getTemplates();
      const merged = current.concat(
        incoming.map((t) => ({ ...t, id: String(Date.now()) + "-" + t.id }))
      );
      await YltStorage.setTemplates(merged);
      setPreview(null);
      await paint();
    } catch (_err) {
      alert("JSONを読めませんでした");
    }
    e.target.value = "";
  });

  await paint();
});
