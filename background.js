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
                filename: 'Chrome Upload',
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
    xhr.open('GET', me.apiUrl+'?maxResults=1&trashed=false&q=title = \''+folder.filename+'\'');
    xhr.setRequestHeader('Authorization', 'Bearer '+folder.token);

    xhr.onload = function() {
        var result = JSON.parse(this.response);

        if (result.items.length > 0) {
            return responseCallback({id: result.items[0].id});
        }

        var xhr = new XMLHttpRequest();
        xhr.open('POST', me.apiUrl);
        xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
        xhr.setRequestHeader('Authorization', 'Bearer '+folder.token);

        xhr.onload = function() {
            var result = JSON.parse(this.response);
            return responseCallback({id: result.id});
        };

        xhr.send(JSON.stringify({
            title: folder.filename,
            parents: [{id: 'root'}],
            mimeType: 'application/vnd.google-apps.folder'
        }));
    };
    xhr.send();
};


GoogleDriveUploader.prototype._putOnDrive = function(file, responseCallback) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', this.uploadUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
    xhr.setRequestHeader('Authorization', 'Bearer '+file.token);

    xhr.onload = function() {
        if (this.status != 200) {
            responseCallback({status: this.status});
        }

        var xhr = new XMLHttpRequest();
        xhr.open('POST', this.getResponseHeader('Location'), true);
        xhr.setRequestHeader('Content-Type', file.mimetype);
        xhr.setRequestHeader('Authorization', 'Bearer '+file.token);

        xhr.send(file.blob);
    };

    xhr.send(JSON.stringify({
        parents: [file.parent],
        title: file.filename
    }));
};


CreateRequestObj = function(name, tab){
    var file = {
        name: name,
        path: tab.url
    };
    var request = {
        file: file,
        action: 'putFileOnGoogleDrive',
        tab: tab.id
    };
    return request
};


chrome.commands.onCommand.addListener(function(command) {
    chrome.tabs.getSelected(null, function(tab) {
        var [prefix, fileid] = tab.url.split("abs");
        var filepdf_url = prefix + "pdf" + fileid + ".pdf";
        var save_filename = tab.title + ".pdf";
        tab.url = filepdf_url

        var googleDriveUploader = new GoogleDriveUploader();
        var request = CreateRequestObj(save_filename, tab);
        //alert(tab.url);
        //alert(tab.id);
        //alert(tab.title);
        googleDriveUploader.uploadFile(request.file, function(response){
            response.file = request.file;
            sendResponse(response, responseCallback);
        });
    });
});

