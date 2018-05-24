var GoogleDriveUploader = function() {
    // Google Drive API URL
    this.apiUrl = 'https://www.googleapis.com/drive/v2/files';
    // Google Drive upload URL
    this.uploadUrl = 'https://www.googleapis.com/upload/drive/v2/files?uploadType=resumable';
};


GoogleDriveUploader.prototype.uploadFile = function(file, responseCallback) {
    var me = this;

    me._authenticateUser(function(token) {
        var xhr = new XMLHttpRequest();
        xhr.responseType = 'blob';
        xhr.open('GET', file.path);

        xhr.onload = function() {
            me._createFolder({
                filename: 'arXiv',
                token: token
            }, function(parentFolder) {
                console.log(parentFolder);
                me._putOnDrive({
                    blob: xhr.response,
                    filename: file.name,
                    mimetype: xhr.getResponseHeader('Content-Type'),
                    parent: parentFolder,
                    token: token
                }, responseCallback);
            });
        };
        xhr.send();
    });
};


GoogleDriveUploader.prototype._authenticateUser = function(responseCallback) {
    var me = self;
    chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
        responseCallback(token);
    });
};


GoogleDriveUploader.prototype._createFolder = function(folder, responseCallback) {
    var me = this;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', `${me.apiUrl}?maxResults=1&trashed=false&q=title = '${folder.filename}'`);
    xhr.setRequestHeader('Authorization', `Bearer ${folder.token}`);

    xhr.onload = function() {
        const result = JSON.parse(this.response);

        if (result.items.length > 0) {
            return responseCallback({id: result.items[0].id});
        }

        var xhr = new XMLHttpRequest();
        xhr.open('POST', me.apiUrl);
        xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
        xhr.setRequestHeader('Authorization', `Bearer ${folder.token}`);

        xhr.onload = function() {
            const result = JSON.parse(this.response);
            return responseCallback({id: result.id});
        };

        xhr.send(JSON.stringify({
            title: folder.filename,
            parents: [{id: 'root'}], //For the top directory of my drive
            //parents: [{id: 'Specific_Drive_ID'}], //For a specific directory
            mimeType: 'application/vnd.google-apps.folder'
        }));
    };
    xhr.send();
};


GoogleDriveUploader.prototype._putOnDrive = function(file, responseCallback) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', this.uploadUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
    xhr.setRequestHeader('Authorization', `Bearer ${file.token}`);

    xhr.onload = function() {
        if (this.status != 200) {
            responseCallback({status: this.status});
        }

        var xhr = new XMLHttpRequest();
        xhr.open('POST', this.getResponseHeader('Location'), true);
        xhr.setRequestHeader('Content-Type', file.mimetype);
        xhr.setRequestHeader('Authorization', `Bearer ${file.token}`);

        xhr.send(file.blob);
    };

    xhr.send(JSON.stringify({
        parents: [file.parent],
        title: file.filename
    }));
};


GetUrlAndName = function(tab){
    const pattern_abst = /https:\/\/arxiv.org\/abs\/\S+/;
    const pattern_pdf = /https:\/\/arxiv.org\/pdf\/\S+/;

    if(pattern_abst.test(String(tab.url))) {
        const [prefix, fileid] = tab.url.split("abs");
        const filepdf_url = `${prefix}pdf${fileid}.pdf`;
        const save_filename = `${tab.title}.pdf`;

        return [filepdf_url, save_filename];

    } else if (pattern_pdf.test(String(tab.url))) {
        const filepdf_url = tab.url;
        const paper_id = tab.title.replace(".pdf", "");

        function loadXMLDoc(myurl) {
            var xhttp = new XMLHttpRequest();
            xhttp.onreadystatechange = function() {
                if (this.readyState == 4 && this.status == 200) {
                    return xhttp.responseText;
                }
            };
            xhttp.open("GET", myurl, false);
            xhttp.send();
            return xhttp.onreadystatechange();
        }

        const response = loadXMLDoc(`http://export.arxiv.org/api/query?search_query=${paper_id}`);
        const title_with_tag = String(response.match(/<title>(.|\s)*?<\/title>/g));
        const save_filename = `[${paper_id}] ${String(title_with_tag.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g,''))}.pdf`;

        return [filepdf_url, save_filename];

    } else {
        alert("This extension is valid only in arXiv abstract or pdf pages!!");
        return null;
    }
};


CreateRequestObj = function(name, tab){
    const file = {
        name: name,
        path: tab.url
    };
    const request = {
        file: file,
        action: 'putFileOnGoogleDrive',
        tab: tab.id
    };
    return request
};


chrome.commands.onCommand.addListener(function(command) {
    chrome.tabs.getSelected(null, function(tab) {

        // Exit if the website is not arXiv
        if (!GetUrlAndName(tab)){return;}

        const [filepdf_url, save_filename] = GetUrlAndName(tab);
        tab.url = filepdf_url
        console.log(save_filename);

        var googleDriveUploader = new GoogleDriveUploader();
        const request = CreateRequestObj(save_filename, tab);
        googleDriveUploader.uploadFile(request.file, function(response){
            response.file = request.file;
            sendResponse(response, responseCallback);
        });
        alert(`Downloading ${save_filename}`);
    });
});
