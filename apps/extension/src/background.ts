/**
 * MedScribe Pain Pro — Manifest V3 Background Service Worker
 * Zero-retention design: never stores transcripts or PHI in chrome.storage.
 */

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id && chrome.sidePanel?.open) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  }
});
