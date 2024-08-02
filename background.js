// Utility function
const addCorsHeader = (details) => {
    const responseHeaders = details.responseHeaders;
    responseHeaders.push({
        name: 'Access-Control-Allow-Origin',
        value: '*'
    });
    return { responseHeaders: responseHeaders };
};

const GetUrlAndName = async (tab) => {
    const pattern_abst = /https:\/\/arxiv.org\/abs\/\S+/;
    const pattern_pdf = /https:\/\/arxiv.org\/pdf\/\S+/;

    if (pattern_abst.test(String(tab.url))) {
        const [prefix, fileid] = tab.url.split("abs");
        const filepdf_url = `${prefix}pdf${fileid}.pdf`;

        try {
            const response = await fetch(tab.url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            const title_match = text.match(/<title>(.*?)<\/title>/);

            if (!title_match || title_match.length < 2) {
                console.error('Error: Title not found in abs page');
                return null;
            }

            const title = title_match[1].replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, '');
            const save_filename = `${title}.pdf`;
            return [filepdf_url, save_filename];
        } catch (error) {
            console.error('Error fetching title from abs page:', error);
            return null;
        }
    } else if (pattern_pdf.test(String(tab.url))) {
        const filepdf_url = tab.url;
        const paper_id = tab.url.split('/').pop().replace(".pdf", "");

        try {
            const abs_url = `https://arxiv.org/abs/${paper_id}`;
            const response = await fetch(abs_url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            const title_match = text.match(/<title>(.*?)<\/title>/);

            if (!title_match || title_match.length < 2) {
                console.error('Error: Title not found in abs page');
                return null;
            }

            const title = title_match[1].replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, '');
            const save_filename = `${title}.pdf`;
            return [filepdf_url, save_filename];
        } catch (error) {
            console.error('Error fetching title from abs page:', error);
            return null;
        }
    } else {
        console.log("This extension is valid only in arXiv abstract or pdf pages!!");
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

// Set event listner
chrome.webRequest.onHeadersReceived.addListener(
    addCorsHeader,
    { urls: ["https://arxiv.org/*"] },
    ["blocking", "responseHeaders"]
);

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

// Set command listner
chrome.commands.onCommand.addListener(async (command) => {
    console.log('Command received:', command);
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        let tab = tabs[0];
        console.log('Selected tab:', tab);

        const result = await GetUrlAndName(tab);
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
