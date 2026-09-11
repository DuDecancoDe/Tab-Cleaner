# Stale Tab Cleaner

A Chrome extension that flags tabs you've had open for a long time, asks if you're still using them, and lets you close them with one click.

## How it works

- Tracks when each tab was opened (or last confirmed as "still in use").
- Every 15 minutes (configurable), scans all tabs and flags any open longer than your threshold (default: 2 hours).
- Shows a badge count on the toolbar icon and an optional system notification.
- Click the icon to see the list of stale tabs. For each one you can:
  - **Still using** — resets its clock, so it won't nag you again for a while.
  - **Close** — closes it immediately.
  - Select multiple and use the bulk bar to close, snooze (1 hour), or mark several as still-in-use at once.
- Pinned tabs and tabs currently playing audio/video are ignored by default (configurable in Settings).

## Install (unpacked, for development/testing)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right toggle).
3. Click **Load unpacked**.
4. Select this `tab-cleaner` folder.
5. The extension icon will appear in your toolbar. Pin it for easy access.

## Settings

Click the ⚙ icon in the popup (or right-click the extension icon → Options) to adjust:
- How long a tab must be open before it's flagged
- How often the background check runs
- Whether to show notifications
- Whether to ignore pinned tabs or tabs playing audio/video

## Notes

- Tab "age" is based on when it was opened in this browser session (or since the extension was installed for tabs already open). It resets whenever you click "Still using" on a tab.
- All data stays local to your browser (`chrome.storage.local`) — nothing is sent anywhere.
