# arxiv-pdf-downloader

This is a Chrome extension designed to download PDFs published on arXiv directly to your Google Drive.

![upload notification](https://imgur.com/kuUj1eX.png)

![google drive](https://imgur.com/70wp72e.png)

## How to install
- Clone this repository.
- Load this extentsion through `Load unpacked`.
  ![chrome extension](https://imgur.com/GIaa4bi.png)
  - FYI: https://support.google.com/chrome/a/answer/2714278
- Enable the Google Drive API at https://console.developers.google.com/apis.
- Create credentials (OAuth 2.0 client ID).
  ![Google Cloud credentials](https://imgur.com/xqVtmCM.png)
- Set your Clident ID obtained from the credential into `manifest.json`.
- Allow notifications.
  - On PC
    ![PC setting](https://imgur.com/gDlX2JV.png)
  - For the chrome extension
    ![chrome extension setting](https://imgur.com/U217UbL.png)

## USAGE
- **[CMD + B] (for MAC) or [CTRL + SHIFT + B] (for OTHERS)** on arXiv abstract or PDF pages (you can change the shortcut command in `manifest.json`).
- Perform interactive authentication the first time.
- You can see an `arXiv` directory in your Google Drive that includes the uploaded paper PDF.
