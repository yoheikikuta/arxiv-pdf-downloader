const fetchTitleFromAbsPage = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const text = await response.text();
        const titleMatch = text.match(/<title>(.*?)<\/title>/);
        if (!titleMatch || titleMatch.length < 2) throw new Error('Title not found in abs page');

        const title = titleMatch[1].replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, '');
        return title;
    } catch (error) {
        console.error('Error fetching title from abs page:', error);
        return null;
    }
};

const getUrlAndName = async (tab) => {
    const url = String(tab.url);
    const patternAbst = /https:\/\/arxiv.org\/abs\/\S+/;
    const patternPdf = /https:\/\/arxiv.org\/pdf\/\S+/;

    let filePdfUrl, absUrl, title;

    if (patternAbst.test(url)) {
        const [prefix, fileId] = url.split("abs");
        filePdfUrl = `${prefix}pdf${fileId}.pdf`;
        title = await fetchTitleFromAbsPage(url);
    } else if (patternPdf.test(url)) {
        filePdfUrl = url;
        const paperId = url.split('/').pop().replace(".pdf", "");
        absUrl = `https://arxiv.org/abs/${paperId}`;
        title = await fetchTitleFromAbsPage(absUrl);
    } else {
        console.log("This extension is valid only in arXiv abstract or pdf pages!!");
        return null;
    }

    if (title) {
        const saveFilename = `${title}.pdf`;
        return [filePdfUrl, saveFilename];
    } else {
        return null;
    }
};

const CreateRequestObj = (name, tab) => {
    const file = {
        name: name,
        path: tab.url
    };
    return {
        file: file,
        action: 'putFileOnGoogleDrive',
        tab: tab.id
    };
};


class GoogleDriveUploader {
    constructor() {
        this.apiUrl = 'https://www.googleapis.com/drive/v3/files';
        this.uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    }

    async uploadFile(file, responseCallback) {
        console.log('Uploading file:', file);

        try {
            const token = await this.authenticateUser();
            if (!token) {
                console.error('Failed to authenticate user');
                return;
            }

            const blob = await this.fetchFileBlob(file.path);
            const parentFolder = await this.createFolder('arXiv', token);
            console.log('Folder created or found:', parentFolder);

            const result = await this.putOnDrive({
                blob: blob,
                filename: file.name,
                mimetype: blob.type,
                parent: parentFolder.id,
                token: token
            });

            responseCallback({ status: 'ok', result: result });
        } catch (error) {
            console.error('Error uploading file:', error);
        }
    }

    async authenticateUser() {
        console.log('Authenticating user...');
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ 'interactive': true }, (token) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    reject(null);
                } else {
                    console.log('Authenticated, token:', token);
                    resolve(token);
                }
            });
        });
    }

    async fetchFileBlob(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.blob();
        } catch (error) {
            console.error('Error fetching file:', error);
            throw error;
        }
    }

    async createFolder(folderName, token) {
        console.log('Creating folder:', folderName);

        const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder'`);
        const folderSearchUrl = `${this.apiUrl}?q=${query}`;

        try {
            const searchResponse = await fetch(folderSearchUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const searchResult = await searchResponse.json();
            console.log('Folder search result:', searchResult);

            if (searchResult.files.length > 0) {
                return { id: searchResult.files[0].id };
            }

            const createResponse = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: folderName,
                    parents: ['root'],
                    mimeType: 'application/vnd.google-apps.folder'
                })
            });
            if (!createResponse.ok) {
                throw new Error(`HTTP error! status: ${createResponse.status}`);
            }
            const createResult = await createResponse.json();
            console.log('Folder created:', createResult);
            return { id: createResult.id };
        } catch (error) {
            console.error('Error creating/searching folder:', error);
            throw error;
        }
    }

    async putOnDrive(file) {
        const metadata = {
            name: file.filename,
            parents: [file.parent]
        };
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', file.blob);

        try {
            const response = await fetch(this.uploadUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${file.token}`
                },
                body: formData
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            console.log('File upload result:', result);
            return result;
        } catch (error) {
            console.error('Error uploading file to drive:', error);
            throw error;
        }
    }
}


chrome.commands.onCommand.addListener(async (command) => {
    console.log('Command received:', command);
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        let tab = tabs[0];
        console.log('Selected tab:', tab);

        const result = await getUrlAndName(tab);
        if (!result) {
            console.log('Invalid URL:', tab.url);
            return;
        }

        const [filepdf_url, save_filename] = result;
        tab.url = filepdf_url;
        console.log('File URL and name:', filepdf_url, save_filename);

        const googleDriveUploader = new GoogleDriveUploader();
        const request = CreateRequestObj(save_filename, tab);
        googleDriveUploader.uploadFile(request.file, (response) => {
            response.file = request.file;
            console.log('File uploaded:', response);
        });
        console.log(`Downloading ${save_filename}`);
    });
});

console.log('Background script loaded');
