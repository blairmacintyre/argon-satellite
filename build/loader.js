/*
 * convenience functions for loading shaders, and loading meshes in a simple JSON format.
 *
 * loadFile/loadFiles from http://stackoverflow.com/questions/4878145/javascript-and-webgl-external-scripts
 * loadMesh adapted from various loaders in http://threejs.org
 */
define(["require", "exports"], function (require, exports) {
    "use strict";
    function loadFile(url, data, callback, errorCallback) {
        // Set up an asynchronous request
        var request = new XMLHttpRequest();
        request.open('GET', url, true);
        // Hook the event that gets called as the request progresses
        request.onreadystatechange = function () {
            // If the request is "DONE" (completed or failed)
            if (request.readyState == 4) {
                // If we got HTTP status 200 (OK)
                if (request.status == 200) {
                    callback(request.responseText, data);
                }
                else {
                    errorCallback(url);
                }
            }
        };
        request.send(null);
    }
    function loadFiles(urls, callback, errorCallback) {
        var numUrls = urls.length;
        var numComplete = 0;
        var result = [];
        // Callback for a single file
        function partialCallback(text, urlIndex) {
            result[urlIndex] = text;
            numComplete++;
            // When all files have downloaded
            if (numComplete == numUrls) {
                callback(result);
            }
        }
        for (var i = 0; i < numUrls; i++) {
            loadFile(urls[i], i, partialCallback, errorCallback);
        }
    }
    exports.loadFiles = loadFiles;
    /*
     * Load a TLE file asynchronously from a file stored on the web.
     * The results will be provided to the "onLoad" callback, and are a dictionary of TLE strings
     * (where each entry is an array of two strings)
     *
     * For example:
     * var onLoad = function (tle) {
     *  	console.log("got a set of tle definitions");
     * }
     * var onProgress = function (progress: ProgressEvent) {
     *  	console.log("loading: " + progress.loaded + " of " + progress.total + "...");
     * }
     * var onError = function (error: ErrorEvent) {
     *  	console.log("error! " + error);
     * }
     *
     * loader.loadTLEs("http://celestrak.com/NORAD/elements/visual.txt", onLoad, onProgress, onError);
     *
     */
    // if there is a current request outstanding, this will be set to it
    var currentRequest = undefined;
    function loadTLEs(url, onLoad, onProgress, onError) {
        // if there is a request in progress, abort it.
        if (currentRequest !== undefined) {
            request.abort();
            currentRequest = undefined;
        }
        // set up the new request	
        var request = new XMLHttpRequest();
        request.open('GET', url, true);
        currentRequest = request; // save it, so we can abort if another request is made by the user
        var dict = {};
        request.addEventListener('load', function (event) {
            // finished with the current request now
            currentRequest = undefined;
            var lines = this.response.split("\n");
            for (var i = 0; i < lines.length; i++) {
                var name_1 = lines[i++].trim();
                var arr = [lines[i++], lines[i]];
                dict[name_1] = arr;
            }
            onLoad(dict);
        }, false);
        if (onProgress !== undefined) {
            request.addEventListener('progress', function (event) {
                onProgress(event);
            }, false);
        }
        if (onError !== undefined) {
            request.addEventListener('error', function (event) {
                currentRequest = undefined; // request failed, clear the current request field
                if (onError)
                    onError(event);
            }, false);
        }
        // ask for a "json" file
        //request.responseType = "json";
        request.send(null);
        return request;
    }
    exports.loadTLEs = loadTLEs;
});
//# sourceMappingURL=loader.js.map