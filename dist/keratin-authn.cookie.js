(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.KeratinAuthN = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
var verbs_1 = require("./verbs");
var inflight = false;
var ISSUER = '';
function setHost(URL) {
    ISSUER = URL.replace(/\/$/, '');
}
exports.setHost = setHost;
function signup(credentials) {
    return new Promise(function (fulfill, reject) {
        if (inflight) {
            reject("duplicate");
            return;
        }
        else {
            inflight = true;
        }
        verbs_1.post(url('/accounts'), credentials)
            .then(function (result) { return fulfill(result.id_token); }, function (errors) { return reject(errors); }).then(function () { return inflight = false; });
    });
}
exports.signup = signup;
function isAvailable(username) {
    return verbs_1.get(url('/accounts/available'), { username: username });
}
exports.isAvailable = isAvailable;
function refresh() {
    return verbs_1.get(url('/sessions/refresh'), {})
        .then(function (result) { return result.id_token; });
}
exports.refresh = refresh;
function login(credentials) {
    return verbs_1.post(url('/sessions'), credentials)
        .then(function (result) { return result.id_token; });
}
exports.login = login;
function logout() {
    return new Promise(function (fulfill) {
        var iframe = document.createElement('iframe');
        iframe.onload = function () {
            iframe.remove();
            fulfill();
        };
        iframe.src = url('/sessions/logout');
        var style = iframe.style;
        style.height = '0';
        style.width = '0';
        style.border = '0';
        document.querySelector('body').appendChild(iframe);
    });
}
exports.logout = logout;
function url(path) {
    if (!ISSUER.length) {
        throw "ISSUER not set";
    }
    return "" + ISSUER + path;
}

},{"./verbs":7}],2:[function(require,module,exports){
"use strict";
var session_1 = require("./session");
var CookieSessionStore = (function () {
    function CookieSessionStore(cookieName) {
        this.sessionName = cookieName;
        this.secureFlag = (window.location.protocol === 'https:') ? '; secure' : '';
        var current = document.cookie.replace("(?:(?:^|.*;s*)" + this.sessionName + "s*=s*([^;]*).*$)|^.*$", "$1");
        if (current) {
            this.session = new session_1.Session(current);
        }
    }
    CookieSessionStore.prototype.update = function (val) {
        this.session = new session_1.Session(val);
        document.cookie = this.sessionName + "=" + val + this.secureFlag;
    };
    CookieSessionStore.prototype.delete = function () {
        this.session = undefined;
        document.cookie = this.sessionName + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    };
    return CookieSessionStore;
}());
exports.CookieSessionStore = CookieSessionStore;

},{"./session":5}],3:[function(require,module,exports){
"use strict";
// takes a simple map, returns a string
function formData(data) {
    return Object.keys(data)
        .map(function (k) { return formDataItem(k, data[k]); })
        .join('&');
}
exports.formData = formData;
function formDataItem(k, v) {
    return k + "=" + encodeURIComponent(v);
}

},{}],4:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
var session_manager_1 = require("./session_manager");
var cookie_store_1 = require("./cookie_store");
var api_1 = require("./api");
var unconfigured = "AuthN must be configured with setSession()";
var store;
var manager;
function setSessionName(cookieName) {
    store = new cookie_store_1.CookieSessionStore(cookieName);
    manager = new session_manager_1.SessionManager(store);
    manager.maintain();
}
exports.setSessionName = setSessionName;
function signup(credentials) {
    return api_1.signup(credentials)
        .then(updateAndReturn);
}
exports.signup = signup;
function login(credentials) {
    return api_1.login(credentials)
        .then(updateAndReturn);
}
exports.login = login;
function logout() {
    return api_1.logout()
        .then(function () {
        if (!store) {
            throw unconfigured;
        }
        ;
        store.delete();
    });
}
exports.logout = logout;
// export remaining API methods unmodified
__export(require("./api"));
function updateAndReturn(token) {
    if (!manager) {
        throw unconfigured;
    }
    ;
    manager.updateAndMaintain(token);
    return token;
}

},{"./api":1,"./cookie_store":2,"./session_manager":6}],5:[function(require,module,exports){
"use strict";
var Session = (function () {
    function Session(token) {
        this.token = token;
        this.claims = jwt_claims(token);
    }
    Session.prototype.iat = function () {
        return this.claims.iat;
    };
    Session.prototype.exp = function () {
        return this.claims.exp;
    };
    Session.prototype.halflife = function () {
        return (this.exp() - this.iat()) / 2;
    };
    return Session;
}());
exports.Session = Session;
function jwt_claims(jwt) {
    return JSON.parse(atob(jwt.split('.')[1]));
}

},{}],6:[function(require,module,exports){
"use strict";
var api_1 = require("./api");
var SessionManager = (function () {
    function SessionManager(store) {
        this.store = store;
    }
    Object.defineProperty(SessionManager.prototype, "session", {
        get: function () {
            return this.store.session;
        },
        enumerable: true,
        configurable: true
    });
    SessionManager.prototype.maintain = function () {
        if (!this.session) {
            return;
        }
        var refreshAt = (this.session.iat() + this.session.halflife()) * 1000; // in ms
        var now = (new Date).getTime();
        // NOTE: if the client's clock is quite wrong, we'll end up being pretty aggressive about
        // maintaining their session on pretty much every page load.
        if (now < this.session.iat() || now >= refreshAt) {
            this.refresh();
        }
        else {
            this.scheduleRefresh(refreshAt - now);
        }
    };
    SessionManager.prototype.updateAndMaintain = function (id_token) {
        this.store.update(id_token);
        if (this.session) {
            this.scheduleRefresh(this.session.halflife() * 1000);
        }
    };
    SessionManager.prototype.scheduleRefresh = function (delay) {
        var _this = this;
        clearTimeout(this.timeoutID);
        this.timeoutID = setTimeout(function () { return _this.refresh(); }, delay);
    };
    SessionManager.prototype.refresh = function () {
        var _this = this;
        api_1.refresh().then(function (id_token) { return _this.updateAndMaintain(id_token); }, function (error) {
            if (error === 'Unauthorized') {
                _this.store.delete();
            }
        });
    };
    return SessionManager;
}());
exports.SessionManager = SessionManager;

},{"./api":1}],7:[function(require,module,exports){
"use strict";
var form_data_1 = require("./form_data");
function get(url, data) {
    return jhr(function (xhr) {
        xhr.open("GET", url + "?" + form_data_1.formData(data));
        xhr.send();
    });
}
exports.get = get;
function post(url, data) {
    return jhr(function (xhr) {
        xhr.open("POST", url);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.send(form_data_1.formData(data));
    });
}
exports.post = post;
function jhr(sender) {
    return new Promise(function (fulfill, reject) {
        var xhr = new XMLHttpRequest();
        xhr.withCredentials = true; // enable authentication server cookies
        xhr.onreadystatechange = function () {
            if (xhr.readyState == XMLHttpRequest.DONE) {
                var data = (xhr.responseText.length > 1) ? JSON.parse(xhr.responseText) : {};
                if (data.result) {
                    fulfill(data.result);
                }
                else if (data.errors) {
                    reject(data.errors);
                }
                else {
                    reject(xhr.statusText);
                }
            }
        };
        sender(xhr);
    });
}

},{"./form_data":3}]},{},[4])(4)
});