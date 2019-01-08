# arxiv-pdf-downloader

This is a chrome extension to download pdfs published on arxiv into the google drive.

## How to install
- Clone this repository.
- Turn on the developer mode of Google Chrome extension.
- Load this extension through `LOAD UNPACKED`.
  - FYI: https://developer.chrome.com/extensions/getstarted
- Enable Google Drive API on https://console.developers.google.com/apis.
- Create credentials (OAuth client ID).
  - Application type is `Chrome App`.
  - Application ID of the extension can be obtained on `chrome://extensions/`.
- Set your Clident ID obtained from the credential in `manifest.json`.

## USAGE
- **[CMD + B] (for MAC) or [CTRL + SHIFT + B] (OTHERS)** on arXiv abstract or pdf pages.
- Interactive authentication.
- You can see `arXiv` directory in the google drive.
