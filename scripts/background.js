"use strict";

/**
 * Do not cache UC… across clicks.
 * Multiple Google accounts / channel switcher change the studio.youtube.com
 * redirect target every time. The only safe ID is:
 *   1) the channel already in the current tab URL, or
 *   2) the ID that appears after this click's redirect from studio.youtube.com/
 */

function channelIdFromUrl(url) {
  const m = String(url || "").match(/studio\.youtube\.com\/channel\/(UC[\w-]+)/i);
  return m ? m[1] : null;
}

function manageUrl(channelId) {
  return "https://studio.youtube.com/channel/" + channelId + "/livestreaming/manage";
}

function isManageUrl(url) {
  return /studio\.youtube\.com\/channel\/UC[\w-]+\/livestreaming\/manage\/?(\?|$)/i.test(String(url || ""));
}

function watchRedirectToManage(tabId) {
  const onUpdated = (updatedId, info) => {
    if (updatedId !== tabId || !info.url) return;
    if (/^https:\/\/studio\.youtube\.com\/?(\?|$)/i.test(info.url)) return;
    const id = channelIdFromUrl(info.url);
    if (!id) return;
    chrome.tabs.onUpdated.removeListener(onUpdated);
    if (isManageUrl(info.url)) return;
    chrome.tabs.update(tabId, { url: manageUrl(id) });
  };
  chrome.tabs.onUpdated.addListener(onUpdated);
  setTimeout(() => chrome.tabs.onUpdated.removeListener(onUpdated), 20000);
}

async function openManage(preferredTabId) {
  let tab = null;
  if (preferredTabId) {
    try {
      tab = await chrome.tabs.get(preferredTabId);
    } catch (_e) {}
  }

  const currentId = tab ? channelIdFromUrl(tab.url) : null;
  if (currentId) {
    if (isManageUrl(tab.url)) {
      await chrome.tabs.update(tab.id, { active: true });
      return { ok: true, url: tab.url };
    }
    const url = manageUrl(currentId);
    await chrome.tabs.update(tab.id, { url, active: true });
    return { ok: true, url };
  }

  if (tab && /https:\/\/studio\.youtube\.com\/?(\?|$)/i.test(tab.url || "")) {
    watchRedirectToManage(tab.id);
    await chrome.tabs.reload(tab.id);
    return { ok: true, pending: true };
  }

  const created = await chrome.tabs.create({ url: "https://studio.youtube.com/" });
  watchRedirectToManage(created.id);
  return { ok: true, pending: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "ylt-open-manage") return;
  openManage(message.tabId).then(sendResponse);
  return true;
});
