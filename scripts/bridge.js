"use strict";

/**
 * Injected into YouTube Studio / live dashboard tabs.
 * Finds title, description, and tags across several Studio generations.
 */
(function attachYltBridge() {
  if (window.__yltBridge && window.__yltBridge.version === "3.2.5.0") return;

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const st = window.getComputedStyle(el);
    return r.width + r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
  }

  function editorRoot() {
    const dialog = document.querySelector("ytls-broadcast-create-dialog");
    if (dialog) {
      const box = dialog.getBoundingClientRect();
      if (box.width + box.height > 0 || dialog.querySelector("#title-textarea, #description-textarea")) {
        return dialog;
      }
    }
    return document;
  }

  function deepQueryAll(root, selector) {
    const out = [];
    const seen = new Set();
    const walk = (node) => {
      if (!node || !node.querySelectorAll) return;
      try {
        node.querySelectorAll(selector).forEach((el) => {
          if (!seen.has(el)) {
            seen.add(el);
            out.push(el);
          }
        });
      } catch (_e) {}
      try {
        node.querySelectorAll("*").forEach((el) => {
          if (el.shadowRoot) walk(el.shadowRoot);
        });
      } catch (_e) {}
      if (node.shadowRoot) walk(node.shadowRoot);
    };
    walk(root);
    return out;
  }

  function first(selectors, root) {
    const scope = root || editorRoot();
    for (const sel of selectors) {
      try {
        const nodes = deepQueryAll(scope, sel);
        for (const n of nodes) {
          if (visible(n) || n.isContentEditable) return n;
        }
        if (nodes[0]) return nodes[0];
      } catch (_e) {}
    }
    return null;
  }

  function titleBox() {
    return first([
      "ytcp-social-suggestions-textbox#title-textarea #textbox",
      "#title-textarea #textbox",
      "ytcp-video-title #textbox",
      ".input-container.title #textbox",
      "ytcp-mention-textbox#title-textarea #textbox"
    ]);
  }

  function descriptionBox() {
    const title = titleBox();
    const desc = first([
      "ytcp-social-suggestions-textbox#description-textarea #textbox",
      "#description-textarea #textbox",
      "ytcp-video-description #textbox",
      "ytcp-video-description .input-container.description #textbox",
      ".input-container.description.wide-content #textbox",
      "ytcp-mention-textbox#description-textarea #textbox"
    ]);
    if (desc && desc !== title) return desc;
    return null;
  }

  function tagInput() {
    return first([
      "#tags-container #text-input",
      "#tags-container input",
      "ytcp-form-input-container#tags-container input",
      ".video-settings-add-tag",
      "ytcp-video-metadata-editor-advanced #text-input",
      'input[aria-label*="タグ"]',
      'input[aria-label*="tag" i]',
      'input[placeholder*="タグ"]',
      'input[placeholder*="tag" i]'
    ]);
  }

  function tagChips() {
    const roots = [
      document.querySelector("#tags-container"),
      document.querySelector("ytcp-form-input-container#tags-container"),
      document.querySelector(".video-settings-tags"),
      document.querySelector("ytcp-chip-bar")
    ].filter(Boolean);
    const chips = [];
    const seen = new Set();
    const collect = (root) => {
      root.querySelectorAll("ytcp-chip, yt-chip, .yt-chip, [id='chip-text'], .chip").forEach((el) => {
        const textEl = el.querySelector("#chip-text, .chip-text, #text") || el;
        const text = (textEl.innerText || textEl.textContent || "").trim();
        if (text && !seen.has(text)) {
          seen.add(text);
          chips.push({ el, text });
        }
      });
    };
    if (roots.length) roots.forEach(collect);
    else collect(document.body);
    return chips;
  }

  function readText(el) {
    if (!el) return "";
    if ("value" in el && typeof el.value === "string" && !el.isContentEditable) return el.value;
    return (el.innerText || el.textContent || "").replace(/\u00a0/g, " ").trim();
  }

  function fireInput(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText" }));
  }

  function setContentEditable(el, text) {
    el.focus();
    try {
      document.execCommand("selectAll", false, null);
      const ok = document.execCommand("insertText", false, text == null ? "" : String(text));
      if (!ok) {
        el.textContent = text == null ? "" : String(text);
      }
    } catch (_e) {
      el.textContent = text == null ? "" : String(text);
    }
    fireInput(el);
    el.blur();
  }

  function enableSaveButtons() {
    document.querySelectorAll(
      "#save-button, #save-changes-button, ytcp-button#save, button[aria-label*='保存'], button[aria-label*='Save']"
    ).forEach((btn) => {
      try {
        btn.removeAttribute("disabled");
        btn.disabled = false;
      } catch (_e) {}
    });
  }

  function parseTags(raw) {
    if (!raw) return [];
    const out = [];
    const re = /"([^"]+)"|(\S+)/g;
    let m;
    while ((m = re.exec(String(raw)))) {
      const tag = (m[1] || m[2] || "").trim();
      if (tag) out.push(tag);
    }
    return out;
  }

  function clearTags() {
    const chips = tagChips();
    chips.forEach(({ el }) => {
      const btn = el.querySelector(
        "#delete-icon, #remove, button, .remove, [aria-label*='削除'], [aria-label*='Remove'], [aria-label*='remove']"
      );
      if (btn) btn.click();
      else el.remove();
    });
  }

  function applyTags(raw) {
    const tags = parseTags(raw);
    clearTags();
    const input = tagInput();
    if (!input) return { applied: false, count: tags.length };
    tags.forEach((tag) => {
      input.focus();
      input.value = tag;
      fireInput(input);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      const form = input.closest("form");
      if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    return { applied: true, count: tags.length };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(fn, timeout) {
    const limit = Date.now() + (timeout || 1500);
    while (Date.now() < limit) {
      const value = fn();
      if (value) return value;
      await sleep(50);
    }
    return null;
  }

  function categoryTrigger() {
    return document.querySelector(
      "#category-container ytcp-form-select#category ytcp-dropdown-trigger, #category ytcp-text-dropdown-trigger ytcp-dropdown-trigger, ytcp-form-select#category ytcp-dropdown-trigger"
    );
  }

  function categoryLabel() {
    const el = document.querySelector(
      "#category-container ytcp-form-select#category .dropdown-trigger-text, #category .dropdown-trigger-text"
    );
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  }

  const CATEGORY_IDS = {
    "エンターテイメント": "CREATOR_VIDEO_CATEGORY_ENTERTAINMENT",
    Entertainment: "CREATOR_VIDEO_CATEGORY_ENTERTAINMENT",
    ゲーム: "CREATOR_VIDEO_CATEGORY_GADGETS",
    Gaming: "CREATOR_VIDEO_CATEGORY_GADGETS",
    コメディ: "CREATOR_VIDEO_CATEGORY_COMEDY",
    Comedy: "CREATOR_VIDEO_CATEGORY_COMEDY",
    スポーツ: "CREATOR_VIDEO_CATEGORY_SPORTS",
    Sports: "CREATOR_VIDEO_CATEGORY_SPORTS",
    "ニュースと政治": "CREATOR_VIDEO_CATEGORY_NEWS",
    "News & Politics": "CREATOR_VIDEO_CATEGORY_NEWS",
    "ハウツーとスタイル": "CREATOR_VIDEO_CATEGORY_HOWTO",
    "Howto & Style": "CREATOR_VIDEO_CATEGORY_HOWTO",
    ブログ: "CREATOR_VIDEO_CATEGORY_PEOPLE",
    "People & Blogs": "CREATOR_VIDEO_CATEGORY_PEOPLE",
    "ペットと動物": "CREATOR_VIDEO_CATEGORY_PETS",
    "Pets & Animals": "CREATOR_VIDEO_CATEGORY_PETS",
    "映画とアニメ": "CREATOR_VIDEO_CATEGORY_FILM",
    "Film & Animation": "CREATOR_VIDEO_CATEGORY_FILM",
    音楽: "CREATOR_VIDEO_CATEGORY_MUSIC",
    Music: "CREATOR_VIDEO_CATEGORY_MUSIC",
    "科学と技術": "CREATOR_VIDEO_CATEGORY_SCIENCE",
    "Science & Technology": "CREATOR_VIDEO_CATEGORY_SCIENCE",
    教育: "CREATOR_VIDEO_CATEGORY_EDUCATION",
    Education: "CREATOR_VIDEO_CATEGORY_EDUCATION",
    "自動車と乗り物": "CREATOR_VIDEO_CATEGORY_AUTOS",
    "自動車と交通機関": "CREATOR_VIDEO_CATEGORY_AUTOS",
    "Autos & Vehicles": "CREATOR_VIDEO_CATEGORY_AUTOS",
    "非営利団体と社会活動": "CREATOR_VIDEO_CATEGORY_GOVERNMENT",
    "Nonprofits & Activism": "CREATOR_VIDEO_CATEGORY_GOVERNMENT",
    "旅行とイベント": "CREATOR_VIDEO_CATEGORY_TRAVEL",
    "Travel & Events": "CREATOR_VIDEO_CATEGORY_TRAVEL"
  };

  function categoryIdFromLabel(label) {
    return CATEGORY_IDS[(label || "").replace(/\s+/g, " ").trim()] || "";
  }

  function categoryMenuItems() {
    const lists = document.querySelectorAll("tp-yt-paper-listbox#paper-list, ytcp-text-menu #paper-list");
    for (const list of lists) {
      const items = list.querySelectorAll('tp-yt-paper-item.selectable-item[test-id^="CREATOR_VIDEO_CATEGORY_"]');
      if (items.length) return Array.from(items);
    }
    return [];
  }

  function itemLabel(el) {
    const text = el.querySelector("yt-formatted-string.item-text, .item-text.main-text");
    return ((text && text.textContent) || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function gameTitleInput() {
    return first([
      'ytcp-form-gaming input[aria-label*="ゲームのタイトル"]',
      'ytcp-form-autocomplete input[aria-label*="ゲームのタイトル"]',
      'input[aria-label="ゲームのタイトル（省略可）"]',
      'input[aria-label*="ゲームのタイトル"]',
      "ytcp-form-gaming input.style-scope.ytcp-form-autocomplete",
      "ytcp-form-gaming input",
      'input[aria-label*="Game title" i]',
      'input[placeholder="なし"]'
    ]);
  }

  function gameMenuItems() {
    const nodes = deepQueryAll(
      document,
      "ytcp-form-gaming ytcp-text-menu tp-yt-paper-item, ytcp-form-autocomplete ytcp-text-menu tp-yt-paper-item, ytcp-text-menu tp-yt-paper-item.selectable-item"
    );
    return nodes.filter((el) => {
      if (el.getAttribute("test-id") && el.getAttribute("test-id").indexOf("CREATOR_VIDEO_CATEGORY_") === 0) {
        return false;
      }
      const text = itemLabel(el);
      if (!text) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  function setNativeInput(el, value) {
    el.focus();
    el.click();
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    if (desc && desc.set) {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: value, inputType: "insertText" }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: value.slice(-1) || "a", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: value.slice(-1) || "a", bubbles: true }));
  }

  async function applyCategory(label, categoryId) {
    const want = (label || "").replace(/\s+/g, " ").trim();
    const wantId = categoryId || categoryIdFromLabel(want);
    if (!want && !wantId) return { applied: false, reason: "empty" };
    const trigger = categoryTrigger();
    if (!trigger) return { applied: false, reason: "no-trigger" };
    if (want && categoryLabel() === want) return { applied: true, already: true, id: wantId };
    trigger.click();
    const item = await waitFor(() => {
      const items = categoryMenuItems();
      if (wantId) {
        const byId = items.find((el) => el.getAttribute("test-id") === wantId);
        if (byId) return byId;
      }
      if (want) return items.find((el) => itemLabel(el) === want);
      return null;
    }, 2500);
    if (!item) {
      document.body.click();
      return { applied: false, reason: "option-not-found", want: want, id: wantId };
    }
    item.click();
    await sleep(400);
    return { applied: true, value: categoryLabel(), id: item.getAttribute("test-id") };
  }

  async function applyGameTitle(title) {
    const want = (title || "").trim();
    if (!want) return { applied: false, reason: "empty" };
    const input = await waitFor(() => gameTitleInput(), 2500);
    if (!input) return { applied: false, reason: "no-input" };
    setNativeInput(input, "");
    await sleep(80);
    setNativeInput(input, want);
    const choice = await waitFor(() => {
      const items = gameMenuItems();
      return (
        items.find((el) => itemLabel(el) === want) ||
        items.find((el) => itemLabel(el).indexOf(want) !== -1) ||
        items[0] ||
        null
      );
    }, 1800);
    if (choice) choice.click();
    await sleep(120);
    return { applied: true, picked: choice ? itemLabel(choice) : "", raw: input.value };
  }

  function pageHint() {
    const href = location.href;
    if (/studio\.youtube\.com/.test(href)) return "studio";
    if (/youtube\.com\/live_dashboard/.test(href)) return "legacy-dashboard";
    return "other";
  }

  function createDialog() {
    return document.querySelector("ytls-broadcast-create-dialog");
  }

  function playlistContext() {
    const href = location.href;
    if (/\/livestreaming\/manage/i.test(href) || createDialog()) return "manage";
    if (/\/video\/[^/]+\/edit/i.test(href)) return "video-edit";
    return "video-edit";
  }

  function playlistTargetBoxes() {
    return playlistContext() === "manage" ? playlistBoxes() : visiblePlaylistBoxes();
  }

  function playlistHost() {
    const dialog = createDialog();
    const roots = dialog ? [dialog, document] : [document];
    for (const root of roots) {
      const hosts = deepQueryAll(root, "ytcp-video-metadata-playlists");
      const hit = hosts.find((h) => visible(h) || h.querySelector("ytcp-dropdown-trigger"));
      if (hit) return hit;
      if (hosts[0]) return hosts[0];
    }
    return null;
  }

  function playlistTrigger() {
    if (playlistContext() === "manage") {
      const fromDialog = first([
        "ytcp-video-metadata-playlists ytcp-dropdown-trigger",
        "ytcp-video-metadata-playlists ytcp-text-dropdown-trigger",
        'ytcp-dropdown-trigger[aria-label="再生リストを選択"]'
      ]);
      if (fromDialog) return fromDialog;
    }
    const host = playlistHost();
    if (!host) return null;
    return (
      host.querySelector('ytcp-dropdown-trigger[aria-label="再生リストを選択"]') ||
      host.querySelector("ytcp-dropdown-trigger") ||
      host.querySelector("ytcp-text-dropdown-trigger") ||
      host
    );
  }

  function playlistLabel() {
    const el = first([
      "ytcp-video-metadata-playlists .dropdown-trigger-text",
      "ytcp-video-metadata-playlists ytcp-text-dropdown-trigger .dropdown-trigger-text"
    ]);
    const text = el ? el.textContent.replace(/\s+/g, " ").trim() : "";
    if (!text || text === "選択" || text === "Select" || text === "選択する") return "";
    return text;
  }

  function formatPlaylistEntries(entries) {
    const seen = new Set();
    const parts = [];
    (entries || []).forEach((e) => {
      const name = (e && e.name ? String(e.name) : "").trim();
      const id = (e && e.id ? String(e.id) : "").trim();
      const key = id || name;
      if (!key || seen.has(key)) return;
      seen.add(key);
      parts.push(name && id ? name + "|" + id : name || id);
    });
    return parts.join(", ");
  }

  function parsePlaylistEntries(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((e) => {
          if (!e) return null;
          if (typeof e === "string") return parsePlaylistEntries(e)[0];
          return { name: String(e.name || "").trim(), id: String(e.id || e.testId || "").trim() };
        })
        .filter(Boolean);
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsePlaylistEntries(parsed);
    } catch (_e) {}
    const out = [];
    String(raw)
      .split(/[,、\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((part) => {
        const bar = part.lastIndexOf("|");
        if (bar > 0) {
          const name = part.slice(0, bar).trim();
          const id = part.slice(bar + 1).trim();
          out.push({ name: name, id: id });
        } else {
          out.push({ name: part, id: "" });
        }
      });
    const uniq = [];
    const seen = new Set();
    out.forEach((e) => {
      const key = e.id || e.name;
      if (!key || seen.has(key)) return;
      seen.add(key);
      uniq.push(e);
    });
    return uniq;
  }

  function playlistBoxes() {
    const byId = new Map();
    deepQueryAll(document, 'ytcp-checkbox-lit[test-id^="PL"]').forEach((box) => {
      const id = box.getAttribute("test-id") || "";
      if (id && !byId.has(id)) byId.set(id, box);
    });
    return Array.from(byId.values());
  }

  function usablePlaylistBox(box) {
    if (!box) return false;
    const inner = box.querySelector("#checkbox") || box;
    const st = window.getComputedStyle(inner);
    if (st.display === "none" || st.visibility === "hidden") return false;
    if (box.closest("[hidden]") && !box.closest("ytcp-playlist-dialog, tp-yt-paper-dialog")) return false;
    return true;
  }

  function visiblePlaylistBoxes() {
    const boxes = playlistBoxes().filter(usablePlaylistBox);
    const shown = boxes.filter((box) => visible(box) || visible(box.querySelector("#checkbox")));
    return shown.length ? shown : boxes;
  }

  function isCreateWizardButton(el) {
    if (!el) return false;
    if (el.id === "create-button" || el.id === "next-button" || el.id === "back-button") return true;
    return !!el.closest("ytls-broadcast-create-dialog .footer, ytls-broadcast-create-dialog #create-button");
  }

  function playlistDoneButton() {
    const boxes = visiblePlaylistBoxes();
    const group = boxes[0] && (boxes[0].closest("ytcp-checkbox-group") || boxes[0].closest("ytcp-playlist-dialog"));
    const roots = [
      document.querySelector("ytcp-playlist-dialog"),
      group && group.closest("ytcp-playlist-dialog"),
      group && group.closest("tp-yt-paper-dialog"),
      group
    ].filter(Boolean);
    const match = (b) => {
      if (isCreateWizardButton(b)) return false;
      const label = ((b.textContent || "") + " " + (b.getAttribute("aria-label") || "")).replace(/\s+/g, "");
      return /完了|Done/.test(label);
    };
    for (const root of roots) {
      if (!root || (root.matches && root.matches("ytls-broadcast-create-dialog"))) continue;
      const hit = deepQueryAll(root, "ytcp-button, button, ytcp-button-shape button").find(match);
      if (hit) return hit;
    }
    return deepQueryAll(document, "ytcp-button, button, ytcp-button-shape button").find(
      (b) => match(b) && (visible(b) || b.getBoundingClientRect().width > 0)
    );
  }

  function playlistNameForBox(box) {
    const labelled = box.getAttribute("aria-labelledby");
    if (labelled) {
      const lab = document.getElementById(labelled);
      const text = lab && lab.querySelector(".label-text, .label");
      if (text) return text.textContent.replace(/\s+/g, " ").trim();
      if (lab) return lab.textContent.replace(/\s+/g, " ").trim();
    }
    const parent = box.closest("label") || box.parentElement;
    const span = parent && parent.querySelector(".label-text, span.label");
    return span ? span.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function playlistChecked(box) {
    const inner = box.querySelector("#checkbox") || box;
    return inner.getAttribute("aria-checked") === "true";
  }

  function closePlaylistPicker() {
    if (playlistContext() === "manage") {
      const buttons = deepQueryAll(document, "ytcp-button, button");
      const done = buttons.find((b) =>
        /完了|Done/.test((b.textContent || "") + (b.getAttribute("aria-label") || ""))
      );
      if (done) {
        done.click();
        return true;
      }
      const trigger = playlistTrigger();
      if (trigger) trigger.click();
      return !!trigger;
    }
    const done = playlistDoneButton();
    if (done) {
      done.click();
      return true;
    }
    return false;
  }

  async function openPlaylistPicker() {
    if (playlistTargetBoxes().length) return true;
    const trigger = playlistTrigger();
    if (!trigger) return false;
    try {
      trigger.scrollIntoView({ block: "center", inline: "nearest" });
    } catch (_e) {}
    if (playlistContext() === "manage") {
      trigger.click();
    } else {
      const clickable = trigger.querySelector("[role='button'].container") || trigger;
      clickable.click();
    }
    const found = await waitFor(() => (playlistTargetBoxes().length ? true : null), 4000);
    return !!found;
  }

  async function readPlaylists() {
    const opened = await openPlaylistPicker();
    if (!opened) {
      const label = playlistLabel();
      return label ? formatPlaylistEntries([{ name: label, id: "" }]) : "";
    }
    const selected = playlistTargetBoxes()
      .filter(playlistChecked)
      .map((box) => ({ id: box.getAttribute("test-id") || "", name: playlistNameForBox(box) }));
    closePlaylistPicker();
    await sleep(150);
    return formatPlaylistEntries(selected);
  }

  async function applyPlaylists(raw) {
    const want = parsePlaylistEntries(raw);
    const trigger = playlistTrigger();
    if (!trigger) return { applied: false, reason: "no-trigger" };
    if (!want.length) return { applied: true, empty: true };
    const opened = await openPlaylistPicker();
    if (!opened) return { applied: false, reason: "no-dialog" };
    const ids = new Set(want.map((w) => w.id).filter((id) => /^PL/.test(id)));
    const names = new Set(want.map((w) => w.name).filter(Boolean));
    let clicked = 0;
    for (const box of playlistTargetBoxes()) {
      const id = box.getAttribute("test-id") || "";
      const name = playlistNameForBox(box);
      const should = (id && ids.has(id)) || (!ids.size && name && names.has(name));
      if (should !== playlistChecked(box)) {
        const inner = box.querySelector("#checkbox") || box;
        inner.click();
        clicked += 1;
        await sleep(playlistContext() === "manage" ? 50 : 80);
      }
    }
    const closed = closePlaylistPicker();
    await sleep(250);
    return { applied: true, clicked: clicked, closed: closed, label: playlistLabel(), want: want };
  }

  async function fetchFields() {
    const titleEl = titleBox();
    const bodyEl = descriptionBox();
    const tags = tagChips().map((c) => (/\s/.test(c.text) ? `"${c.text}"` : c.text)).join(" ");
    const gameEl = gameTitleInput();
    const playlists = await readPlaylists();
    return {
      ok: !!(titleEl || bodyEl || categoryTrigger()),
      page: pageHint(),
      title: readText(titleEl),
      body: readText(bodyEl),
      videotag: tags,
      category: categoryLabel(),
      categoryId: categoryIdFromLabel(categoryLabel()),
      gameTitle: gameEl ? (gameEl.value || "").trim() : "",
      playlists: playlists,
      found: {
        title: !!titleEl,
        body: !!bodyEl,
        tags: !!tagInput() || tagChips().length > 0,
        category: !!categoryTrigger(),
        gameTitle: !!gameEl,
        playlists: !!playlistTrigger()
      }
    };
  }

  async function applyFields(args) {
    const titleEl = titleBox();
    const bodyEl = descriptionBox();
    if (!titleEl && !bodyEl && !categoryTrigger()) {
      return { ok: false, page: pageHint(), reason: "fields-not-found" };
    }
    if (titleEl && bodyEl && titleEl === bodyEl) {
      return { ok: false, page: pageHint(), reason: "title-description-collapsed" };
    }
    if (titleEl && args.title != null) setContentEditable(titleEl, args.title);
    if (bodyEl && args.body != null && bodyEl !== titleEl) setContentEditable(bodyEl, args.body);
    if (args.videotag != null) applyTags(args.videotag);
    let category = null;
    let game = null;
    if ((args.category && args.category !== "") || (args.categoryId && args.categoryId !== "")) {
      category = await applyCategory(args.category, args.categoryId);
    }
    if (args.gameTitle != null) {
      game = await applyGameTitle(args.gameTitle);
    }
    let playlists = null;
    if (args.playlists != null && args.playlists !== "") {
      playlists = await applyPlaylists(args.playlists);
    }
    enableSaveButtons();
    return {
      ok: true,
      page: pageHint(),
      found: {
        title: !!titleEl,
        body: !!bodyEl,
        tags: !!tagInput(),
        category: !!categoryTrigger(),
        gameTitle: !!gameTitleInput(),
        playlists: !!playlistTrigger()
      },
      category: category,
      game: game,
      playlists: playlists
    };
  }

  window.__yltBridge = {
    version: "3.2.5.0",
    fetch: fetchFields,
    apply: applyFields
  };

  if (!window.__yltBridgeListener) {
    window.__yltBridgeListener = true;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || !message.type) return;
      if (message.type === "ylt-fetch") {
        Promise.resolve(fetchFields()).then(sendResponse);
        return true;
      }
      if (message.type === "ylt-apply") {
        Promise.resolve(applyFields(message.args || {})).then(sendResponse);
        return true;
      }
    });
  }
})();
