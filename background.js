function addCorsHeader(details) {
    const responseHeaders = details.responseHeaders;
    responseHeaders.push({
        name: 'Access-Control-Allow-Origin',
        value: '*'
    });
    return { responseHeaders: responseHeaders };
}

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

    uploadFile(file, responseCallback) {
        let me = this;
        console.log('Uploading file:', file);

        me.authenticateUser(function (token) {
            if (!token) {
                console.error('Failed to authenticate user');
                return;
            }
            fetch(file.path)
                .then(response => response.blob())
                .then(blob => {
                    me.createFolder({
                        filename: 'arXiv',
                        token: token
                    }, function (parentFolder) {
                        console.log('Folder created or found:', parentFolder);
                        me.putOnDrive({
                            blob: blob,
                            filename: file.name,
                            mimetype: blob.type,
                            parent: parentFolder.id,
                            token: token
                        }, responseCallback);
                    });
                })
                .catch(error => console.error('Error fetching file:', error));
        });
    }

    authenticateUser(responseCallback) {
        console.log('Authenticating user...');
        chrome.identity.getAuthToken({ 'interactive': true }, function (token) {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                responseCallback(null);
                return;
            }
            console.log('Authenticated, token:', token);
            responseCallback(token);
        });
    }

    createFolder(folder, responseCallback) {
        let me = this;
        console.log('Creating folder:', folder.filename);

        fetch(`${me.apiUrl}?q=name='${folder.filename}' and mimeType='application/vnd.google-apps.folder'`, {
            headers: {
                'Authorization': `Bearer ${folder.token}`
            }
        })
            .then(response => response.json())
            .then(result => {
                console.log('Folder search result:', result);

                if (result.files.length > 0) {
                    return responseCallback({ id: result.files[0].id });
                }

                fetch(me.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${folder.token}`
                    },
                    body: JSON.stringify({
                        name: folder.filename,
                        parents: ['root'],
                        mimeType: 'application/vnd.google-apps.folder'
                    })
                })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(result => {
                        console.log('Folder created:', result);
                        return responseCallback({ id: result.id });
                    })
                    .catch(error => console.error('Error creating folder:', error));
            })
            .catch(error => console.error('Error searching folder:', error));
    }

    putOnDrive(file, responseCallback) {
        const metadata = {
            name: file.filename,
            parents: [file.parent]
        };
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', file.blob);

        fetch(this.uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${file.token}`
            },
            body: formData
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(result => {
                console.log('File upload result:', result);
                responseCallback({ status: 'ok', result: result });
            })
            .catch(error => console.error('Error uploading file to drive:', error));
    }
}

GetUrlAndName = async function (tab) {
    const pattern_abst = /https:\/\/arxiv.org\/abs\/\S+/;
    const pattern_pdf = /https:\/\/arxiv.org\/pdf\/\S+/;

    if (pattern_abst.test(String(tab.url))) {
        const [prefix, fileid] = tab.url.split("abs");
        const filepdf_url = `${prefix}pdf${fileid}.pdf`;
        const save_filename = `${tab.title}.pdf`;
        return [filepdf_url, save_filename];

    } else if (pattern_pdf.test(String(tab.url))) {
        const filepdf_url = tab.url;
        const paper_id = tab.url.split('/').pop().replace(".pdf", "");

        try {
            const abs_url = `https://arxiv.org/abs/${paper_id}`;
            const response = await fetch(abs_url);
            const text = await response.text();
            const title_match = text.match(/<title>(.*?)<\/title>/);

            if (!title_match || title_match.length < 2) {
                console.error('Error: Title not found in abs page');
                return null;
            }

            // タイトルの前にIDを追加しないように修正
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

CreateRequestObj = function (name, tab) {
    const file = {
        name: name,
        path: tab.url
    };
    const request = {
        file: file,
        action: 'putFileOnGoogleDrive',
        tab: tab.id
    };
    return request;
}

chrome.commands.onCommand.addListener(async function (command) {
    console.log('Command received:', command);
    chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
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
        googleDriveUploader.uploadFile(request.file, function (response) {
            response.file = request.file;
            console.log('File uploaded:', response);
        });
        console.log(`Downloading ${save_filename}`);
    });
});

console.log('Background script loaded');
