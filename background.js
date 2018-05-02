chrome.commands.onCommand.addListener(function(command) {
    chrome.tabs.getSelected(null, function(tab) {
        var [prefix, fileid] = tab.url.split("abs");
        var filepdf_url = prefix + "pdf" + fileid + ".pdf";
        var save_filename = tab.title + ".pdf";
        chrome.downloads.download({
            url: tab.url,
            filename: save_filename
        }, e => console.log(e))
    });
});
