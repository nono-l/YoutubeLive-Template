"use strict";

/**
 * Templates live in chrome.storage.local (descriptions can exceed sync quota).
 * First launch copies any leftover sync templates so v2 data is not lost.
 */
const YltStorage = (() => {
  function dedupePlaylistField(raw) {
    const seen = new Set();
    const parts = [];
    String(raw || "")
      .split(/[,、\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((part) => {
        const bar = part.lastIndexOf("|");
        const id = bar > 0 ? part.slice(bar + 1).trim() : "";
        const key = id || part;
        if (seen.has(key)) return;
        seen.add(key);
        parts.push(part);
      });
    return parts.join(", ");
  }

  function normalize(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((t) => t && (t.name || t.title || t.value || t.body))
      .map((t, i) => ({
        id: t.id != null ? String(t.id) : String(Date.now()) + "-" + i,
        name: String(t.name || t.title || "無題"),
        value: String(t.value || t.body || ""),
        videotag: String(t.videotag || t.tags || ""),
        category: String(t.category || ""),
        categoryId: String(t.categoryId || ""),
        gameTitle: String(t.gameTitle || t.game || ""),
        playlists: dedupePlaylistField(t.playlists || t.playlist || "")
      }));
  }

  async function migrateFromSyncIfNeeded() {
    const local = await chrome.storage.local.get({ templates: [], migratedFromSync: false });
    if (local.migratedFromSync) return;
    try {
      const sync = await chrome.storage.sync.get({ templates: [] });
      const syncList = normalize(sync.templates);
      const localList = normalize(local.templates);
      if (syncList.length && localList.length === 0) {
        await chrome.storage.local.set({ templates: syncList, migratedFromSync: true });
      } else {
        await chrome.storage.local.set({ migratedFromSync: true });
      }
    } catch (_e) {
      await chrome.storage.local.set({ migratedFromSync: true });
    }
  }

  async function getTemplates() {
    await migrateFromSyncIfNeeded();
    const data = await chrome.storage.local.get({ templates: [] });
    return normalize(data.templates);
  }

  async function setTemplates(templates) {
    await chrome.storage.local.set({ templates: normalize(templates) });
  }

  async function saveTemplate(name, value, videotag, extra) {
    const title = (name || "").trim();
    if (!title) return { ok: false, reason: "empty-title" };
    extra = extra || {};
    const templates = await getTemplates();
    templates.push({
      id: String(Date.now()),
      name: title,
      value: value || "",
      videotag: videotag || "",
      category: extra.category || "",
      categoryId: extra.categoryId || "",
      gameTitle: extra.gameTitle || "",
      playlists: extra.playlists || ""
    });
    await setTemplates(templates);
    return { ok: true };
  }

  async function updateTemplate(id, fields) {
    const templates = await getTemplates();
    const idx = templates.findIndex((t) => String(t.id) === String(id));
    if (idx < 0) return { ok: false, reason: "missing" };
    templates[idx] = {
      ...templates[idx],
      name: fields.name != null ? fields.name : templates[idx].name,
      value: fields.value != null ? fields.value : templates[idx].value,
      videotag: fields.videotag != null ? fields.videotag : templates[idx].videotag,
      category: fields.category != null ? fields.category : templates[idx].category,
      categoryId: fields.categoryId != null ? fields.categoryId : templates[idx].categoryId,
      gameTitle: fields.gameTitle != null ? fields.gameTitle : templates[idx].gameTitle,
      playlists: fields.playlists != null ? fields.playlists : templates[idx].playlists
    };
    await setTemplates(templates);
    return { ok: true };
  }

  async function deleteTemplate(id) {
    const templates = await getTemplates();
    await setTemplates(templates.filter((t) => String(t.id) !== String(id)));
    return { ok: true };
  }

  async function getById(id) {
    const templates = await getTemplates();
    return templates.find((t) => String(t.id) === String(id)) || null;
  }

  return { getTemplates, setTemplates, saveTemplate, updateTemplate, deleteTemplate, getById, normalize };
})();
