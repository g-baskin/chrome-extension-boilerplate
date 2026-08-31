chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error: unknown) => {
  console.error("Social Finder could not configure side-panel opening.", error);
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) {
    console.error("Social Finder could not identify the active tab.");
    return;
  }
  chrome.sidePanel.open({ tabId: tab.id }).catch((error: unknown) => {
    console.error("Social Finder could not open its side panel.", error);
  });
});
