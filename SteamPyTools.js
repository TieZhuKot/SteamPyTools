// ==UserScript==
// @name            SteamPyTools
// @name:zh-CN      SteamPyTools
// @name:en         SteamPyTools
// @version         2.7
// @description     SteamPyTools 增强脚本：CDKey 市场按价格/好评/已拥有游戏筛选，游戏卡片显示 Steam 好评等级与评价数，支持鼠标中键直达 Steam 商店；卖家页显示历史最低价、在售排名与最低价提示，并新增按库存数量排序；支持手动同步 Steam 已拥有/愿望单数据，多地区接口适配与本地缓存。
// @description:en  SteamPyTools enhances SteamPy: filter CDKey listings by price, rating and owned games; show Steam review tiers and counts on game cards; open Steam store with middle click; seller page gets historical low price, sale rank, lowest-price hints and stock sorting; manual Steam library/wishlist sync with multi-region support and local caching.
// @author          TieZhuKot
// @match           https://steampy.com/*
// @match           https://www.steampy.com/*
// @grant           GM_setValue
// @grant           GM_getValue
// @grant           GM_xmlhttpRequest
// @grant           GM_registerMenuCommand
// @grant           GM_notification
// @grant           GM_cookie
// @grant           GM_info
// @icon            https://steampy.com/logo.ico
// @connect         steampy.com
// @connect         store.steampowered.com
// @connect         steamcommunity.com
// @connect         login.steampowered.com
// @run-at          document-start
// @license         MIT
// @namespace       TieZhuKot
// ==/UserScript==

/* ===== bootstrap: 在任何依赖之前打点，便于判断脚本是否被加载 ===== */
(function () {
    console.info('[SteamPyTools] ===== 文件已加载 =====', {
        readyState: document.readyState,
        href: location.href,
        at: Date.now()
    });
    window.__steamPyFileLoadedAt = Date.now();

    // 页面右上角红色徽章：不用开控制台也能看出脚本到底有没有加载/执行到主逻辑
    function spShowBadge(text, color) {
        try {
            let badge = document.getElementById('__spDiagBadge');
            if (!badge) {
                badge = document.createElement('div');
                badge.id = '__spDiagBadge';
                badge.style.cssText = 'position:fixed;top:0;right:0;z-index:2147483647;background:#d32f2f;color:#fff;font:14px/1.6 sans-serif;padding:4px 12px;box-shadow:0 2px 6px rgba(0,0,0,.3);pointer-events:none;';
                (document.body || document.documentElement).appendChild(badge);
            }
            badge.textContent = text;
            badge.style.background = color || '#d32f2f';
        } catch (e) {
            console.error('[SteamPyTools] 徽章插入失败:', e);
        }
    }
    window.__spShowBadge = spShowBadge;
    spShowBadge('SteamPy 文件已加载 v2.3');
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', function () {
            spShowBadge('SteamPy 文件已加载 v2.3');
        });
    }

    window.addEventListener('error', function (e) {
        const stack = String((e.error && e.error.stack) || '');
        const filename = String(e.filename || '');
        if (stack.indexOf('SteamPy') >= 0 || filename.indexOf('userscript') >= 0 || filename.indexOf('SteamPyTools') >= 0) {
            console.error('[SteamPyTools] 捕获未处理异常:', e.message, stack || filename);
        }
    });
})();


/* ===== inlined dependency: ajaxHooker.js ===== */
try {
var ajaxHooker = function() {
    'use strict';
    const version = '1.4.8';
    const hookInst = {
        hookFns: [],
        filters: []
    };
    const win = window.unsafeWindow || document.defaultView || window;
    let winAh = win.__ajaxHooker;
    const resProto = win.Response.prototype;
    const xhrResponses = ['response', 'responseText', 'responseXML'];
    const fetchResponses = ['arrayBuffer', 'blob', 'formData', 'json', 'text'];
    const xhrExtraProps = ['responseType', 'timeout', 'withCredentials'];
    const fetchExtraProps = ['cache', 'credentials', 'integrity', 'keepalive', 'mode', 'priority', 'redirect', 'referrer', 'referrerPolicy', 'signal'];
    const xhrAsyncEvents = ['readystatechange', 'load', 'loadend'];
    const getType = ({}).toString.call.bind(({}).toString);
    const getDescriptor = Object.getOwnPropertyDescriptor.bind(Object);
    const emptyFn = () => {};
    const errorFn = e => console.error(e);
    function isThenable(obj) {
        return obj && ['object', 'function'].includes(typeof obj) && typeof obj.then === 'function';
    }
    function catchError(fn, ...args) {
        try {
            const result = fn(...args);
            if (isThenable(result)) return result.then(null, errorFn);
            return result;
        } catch (err) {
            console.error(err);
        }
    }
    function defineProp(obj, prop, getter, setter) {
        Object.defineProperty(obj, prop, {
            configurable: true,
            enumerable: true,
            get: getter,
            set: setter
        });
    }
    function readonly(obj, prop, value = obj[prop]) {
        defineProp(obj, prop, () => value, emptyFn);
    }
    function writable(obj, prop, value = obj[prop]) {
        Object.defineProperty(obj, prop, {
            configurable: true,
            enumerable: true,
            writable: true,
            value: value
        });
    }
    function parseHeaders(obj) {
        const headers = {};
        switch (getType(obj)) {
            case '[object String]':
                for (const line of obj.trim().split(/[\r\n]+/)) {
                    const [header, value] = line.split(/(?<=^[^:]+)\s*:\s*/);
                    if (!value) continue;
                    const lheader = header.toLowerCase();
                    headers[lheader] = lheader in headers ? `${headers[lheader]}, ${value}` : value;
                }
                break;
            case '[object Headers]':
                for (const [key, val] of obj) {
                    headers[key] = val;
                }
                break;
            case '[object Object]':
                return {...obj};
        }
        return headers;
    }
    function stopImmediatePropagation() {
        this.ajaxHooker_isStopped = true;
    }
    class SyncThenable {
        then(fn) {
            fn && fn();
            return new SyncThenable();
        }
    }
    class AHRequest {
        constructor(request) {
            this.request = request;
            this.requestClone = {...this.request};
        }
        _recoverRequestKey(key) {
            if (key in this.requestClone) this.request[key] = this.requestClone[key];
            else delete this.request[key];
        }
        shouldFilter(filters) {
            const {type, url, method, async} = this.request;
            return filters.length && !filters.find(obj => {
                switch (true) {
                    case obj.type && obj.type !== type:
                    case getType(obj.url) === '[object String]' && !url.includes(obj.url):
                    case getType(obj.url) === '[object RegExp]' && !obj.url.test(url):
                    case obj.method && obj.method.toUpperCase() !== method.toUpperCase():
                    case 'async' in obj && obj.async !== async:
                        return false;
                }
                return true;
            });
        }
        waitForRequestKeys() {
            if (!this.request.async) {
                win.__ajaxHooker.hookInsts.forEach(({hookFns, filters}) => {
                    if (this.shouldFilter(filters)) return;
                    hookFns.forEach(fn => {
                        if (getType(fn) === '[object Function]') catchError(fn, this.request);
                    });
                    for (const key in this.request) {
                        if (isThenable(this.request[key])) this._recoverRequestKey(key);
                    }
                });
                return new SyncThenable();
            }
            const promises = [];
            const ignoreKeys = new Set(['type', 'async', 'response']);
            win.__ajaxHooker.hookInsts.forEach(({hookFns, filters}) => {
                if (this.shouldFilter(filters)) return;
                promises.push(Promise.all(hookFns.map(fn => catchError(fn, this.request))).then(() => {
                    const requestKeys = [];
                    for (const key in this.request) !ignoreKeys.has(key) && requestKeys.push(key);
                    return Promise.all(requestKeys.map(key => Promise.resolve(this.request[key]).then(
                        val => this.request[key] = val,
                        () => this._recoverRequestKey(key)
                    )))
                }));
            });
            return Promise.all(promises);
        }
        waitForResponseKeys(response) {
            const responseKeys = this.request.type === 'xhr' ? xhrResponses : fetchResponses;
            if (!this.request.async) {
                if (getType(this.request.response) === '[object Function]') {
                    catchError(this.request.response, response);
                    responseKeys.forEach(key => {
                        if ('get' in getDescriptor(response, key) || isThenable(response[key])) {
                            delete response[key];
                        }
                    });
                }
                return new SyncThenable();
            }
            return Promise.resolve(catchError(this.request.response, response)).then(() =>
                Promise.all(responseKeys.map(key => {
                    const descriptor = getDescriptor(response, key);
                    if (descriptor && 'value' in descriptor) {
                        return Promise.resolve(descriptor.value).then(
                            val => response[key] = val,
                            () => delete response[key]
                        );
                    } else {
                        delete response[key];
                    }
                }))
            );
        }
    }
    const proxyHandler = {
        get(target, prop) {
            const descriptor = getDescriptor(target, prop);
            if (descriptor && !descriptor.configurable && !descriptor.writable && !descriptor.get) return target[prop];
            const ah = target.__ajaxHooker;
            if (ah && ah.proxyProps) {
                if (prop in ah.proxyProps) {
                    const pDescriptor = ah.proxyProps[prop];
                    if ('get' in pDescriptor) return pDescriptor.get();
                    if (typeof pDescriptor.value === 'function') return pDescriptor.value.bind(ah);
                    return pDescriptor.value;
                }
                if (typeof target[prop] === 'function') return target[prop].bind(target);
            }
            return target[prop];
        },
        set(target, prop, value) {
            const descriptor = getDescriptor(target, prop);
            if (descriptor && !descriptor.configurable && !descriptor.writable && !descriptor.set) return true;
            const ah = target.__ajaxHooker;
            if (ah && ah.proxyProps && prop in ah.proxyProps) {
                const pDescriptor = ah.proxyProps[prop];
                pDescriptor.set ? pDescriptor.set(value) : (pDescriptor.value = value);
            } else {
                target[prop] = value;
            }
            return true;
        }
    };
    class XhrHooker {
        constructor(xhr) {
            const ah = this;
            Object.assign(ah, {
                originalXhr: xhr,
                proxyXhr: new Proxy(xhr, proxyHandler),
                resThenable: new SyncThenable(),
                proxyProps: {},
                proxyEvents: {}
            });
            xhr.addEventListener('readystatechange', e => {
                if (ah.proxyXhr.readyState === 4 && ah.request && typeof ah.request.response === 'function') {
                    const response = {
                        finalUrl: ah.proxyXhr.responseURL,
                        status: ah.proxyXhr.status,
                        responseHeaders: parseHeaders(ah.proxyXhr.getAllResponseHeaders())
                    };
                    const tempValues = {};
                    for (const key of xhrResponses) {
                        try {
                            tempValues[key] = ah.originalXhr[key];
                        } catch (err) {}
                        defineProp(response, key, () => {
                            return response[key] = tempValues[key];
                        }, val => {
                            delete response[key];
                            response[key] = val;
                        });
                    }
                    ah.resThenable = new AHRequest(ah.request).waitForResponseKeys(response).then(() => {
                        for (const key of xhrResponses) {
                            ah.proxyProps[key] = {get: () => {
                                if (!(key in response)) response[key] = tempValues[key];
                                return response[key];
                            }};
                        }
                    });
                }
                ah.dispatchEvent(e);
            });
            xhr.addEventListener('load', e => ah.dispatchEvent(e));
            xhr.addEventListener('loadend', e => ah.dispatchEvent(e));
            for (const evt of xhrAsyncEvents) {
                const onEvt = 'on' + evt;
                ah.proxyProps[onEvt] = {
                    get: () => ah.proxyEvents[onEvt] || null,
                    set: val => ah.addEvent(onEvt, val)
                };
            }
            for (const method of ['setRequestHeader', 'addEventListener', 'removeEventListener', 'open', 'send']) {
                ah.proxyProps[method] = {value: ah[method]};
            }
        }
        toJSON() {} // Converting circular structure to JSON
        addEvent(type, event) {
            if (type.startsWith('on')) {
                this.proxyEvents[type] = typeof event === 'function' ? event : null;
            } else {
                if (typeof event === 'object' && event !== null) event = event.handleEvent;
                if (typeof event !== 'function') return;
                this.proxyEvents[type] = this.proxyEvents[type] || new Set();
                this.proxyEvents[type].add(event);
            }
        }
        removeEvent(type, event) {
            if (type.startsWith('on')) {
                this.proxyEvents[type] = null;
            } else {
                if (typeof event === 'object' && event !== null) event = event.handleEvent;
                this.proxyEvents[type] && this.proxyEvents[type].delete(event);
            }
        }
        dispatchEvent(e) {
            e.stopImmediatePropagation = stopImmediatePropagation;
            defineProp(e, 'target', () => this.proxyXhr);
            defineProp(e, 'currentTarget', () => this.proxyXhr);
            defineProp(e, 'srcElement', () => this.proxyXhr);
            this.proxyEvents[e.type] && this.proxyEvents[e.type].forEach(fn => {
                this.resThenable.then(() => !e.ajaxHooker_isStopped && fn.call(this.proxyXhr, e));
            });
            if (e.ajaxHooker_isStopped) return;
            const onEvent = this.proxyEvents['on' + e.type];
            onEvent && this.resThenable.then(onEvent.bind(this.proxyXhr, e));
        }
        setRequestHeader(header, value) {
            this.originalXhr.setRequestHeader(header, value);
            if (!this.request) return;
            const headers = this.request.headers;
            headers[header] = header in headers ? `${headers[header]}, ${value}` : value;
        }
        addEventListener(...args) {
            if (xhrAsyncEvents.includes(args[0])) {
                this.addEvent(args[0], args[1]);
            } else {
                this.originalXhr.addEventListener(...args);
            }
        }
        removeEventListener(...args) {
            if (xhrAsyncEvents.includes(args[0])) {
                this.removeEvent(args[0], args[1]);
            } else {
                this.originalXhr.removeEventListener(...args);
            }
        }
        open(method, url, async = true, ...args) {
            this.request = {
                type: 'xhr',
                url: url.toString(),
                method: method.toUpperCase(),
                abort: false,
                headers: {},
                data: null,
                response: null,
                async: !!async
            };
            this.openArgs = args;
            this.resThenable = new SyncThenable();
            ['responseURL', 'readyState', 'status', 'statusText', ...xhrResponses].forEach(key => {
                delete this.proxyProps[key];
            });
            return this.originalXhr.open(method, url, async, ...args);
        }
        send(data) {
            const ah = this;
            const xhr = ah.originalXhr;
            const request = ah.request;
            if (!request) return xhr.send(data);
            request.data = data;
            new AHRequest(request).waitForRequestKeys().then(() => {
                if (request.abort) {
                    if (typeof request.response === 'function') {
                        Object.assign(ah.proxyProps, {
                            responseURL: {value: request.url},
                            readyState: {value: 4},
                            status: {value: 200},
                            statusText: {value: 'OK'}
                        });
                        xhrAsyncEvents.forEach(evt => xhr.dispatchEvent(new Event(evt)));
                    }
                } else {
                    xhr.open(request.method, request.url, request.async, ...ah.openArgs);
                    for (const header in request.headers) {
                        xhr.setRequestHeader(header, request.headers[header]);
                    }
                    for (const prop of xhrExtraProps) {
                        if (prop in request) xhr[prop] = request[prop];
                    }
                    xhr.send(request.data);
                }
            });
        }
    }
    function fakeXHR() {
        const xhr = new winAh.realXHR();
        if ('__ajaxHooker' in xhr) console.warn('检测到不同版本的ajaxHooker，可能发生冲突！');
        xhr.__ajaxHooker = new XhrHooker(xhr);
        return xhr.__ajaxHooker.proxyXhr;
    }
    fakeXHR.prototype = win.XMLHttpRequest.prototype;
    Object.keys(win.XMLHttpRequest).forEach(key => fakeXHR[key] = win.XMLHttpRequest[key]);
    function fakeFetch(url, options = {}) {
        if (!url) return winAh.realFetch.call(win, url, options);
        return new Promise(async (resolve, reject) => {
            const init = {};
            if (getType(url) === '[object Request]') {
                init.method = url.method;
                init.headers = url.headers;
                if (url.body) init.body = await url.arrayBuffer();
                for (const prop of fetchExtraProps) init[prop] = url[prop];
                url = url.url;
            }
            url = url.toString();
            Object.assign(init, options);
            init.method = init.method || 'GET';
            init.headers = init.headers || {};
            const request = {
                type: 'fetch',
                url: url,
                method: init.method.toUpperCase(),
                abort: false,
                headers: parseHeaders(init.headers),
                data: init.body,
                response: null,
                async: true
            };
            const req = new AHRequest(request);
            await req.waitForRequestKeys();
            if (request.abort) {
                if (typeof request.response === 'function') {
                    const response = {
                        finalUrl: request.url,
                        status: 200,
                        responseHeaders: {}
                    };
                    await req.waitForResponseKeys(response);
                    const key = fetchResponses.find(k => k in response);
                    let val = response[key];
                    if (key === 'json' && typeof val === 'object') {
                        val = catchError(JSON.stringify.bind(JSON), val);
                    }
                    const res = new Response(val, {
                        status: 200,
                        statusText: 'OK'
                    });
                    defineProp(res, 'type', () => 'basic');
                    defineProp(res, 'url', () => request.url);
                    resolve(res);
                } else {
                    reject(new DOMException('aborted', 'AbortError'));
                }
                return;
            }
            init.method = request.method;
            init.headers = request.headers;
            init.body = request.data;
            for (const prop of fetchExtraProps) {
                if (prop in request) init[prop] = request[prop];
            }
            winAh.realFetch.call(win, request.url, init).then(res => {
                if (typeof request.response === 'function') {
                    const response = {
                        finalUrl: res.url,
                        status: res.status,
                        responseHeaders: parseHeaders(res.headers)
                    };
                    if (res.ok) {
                        fetchResponses.forEach(key => res[key] = function() {
                            if (key in response) return Promise.resolve(response[key]);
                            return resProto[key].call(this).then(val => {
                                response[key] = val;
                                return req.waitForResponseKeys(response).then(() => key in response ? response[key] : val);
                            });
                        });
                    } else {
                        catchError(request.response, response);
                    }
                }
                resolve(res);
            }, reject);
        });
    }
    function fakeFetchClone() {
        const descriptors = Object.getOwnPropertyDescriptors(this);
        const res = winAh.realFetchClone.call(this);
        Object.defineProperties(res, descriptors);
        return res;
    }
    winAh = win.__ajaxHooker = winAh || {
        version, fakeXHR, fakeFetch, fakeFetchClone,
        realXHR: win.XMLHttpRequest,
        realFetch: win.fetch,
        realFetchClone: resProto.clone,
        hookInsts: new Set()
    };
    if (winAh.version !== version) console.warn('检测到不同版本的ajaxHooker，可能发生冲突！');
    win.XMLHttpRequest = winAh.fakeXHR;
    win.fetch = winAh.fakeFetch;
    resProto.clone = winAh.fakeFetchClone;
    winAh.hookInsts.add(hookInst);
    // 针对头条、抖音 secsdk.umd.js 的兼容性处理
    class AHFunction extends Function {
        call(thisArg, ...args) {
            if (thisArg && thisArg.__ajaxHooker && thisArg.__ajaxHooker.proxyXhr === thisArg) {
                thisArg = thisArg.__ajaxHooker.originalXhr;
            }
            return Reflect.apply(this, thisArg, args);
        }
        apply(thisArg, args) {
            if (thisArg && thisArg.__ajaxHooker && thisArg.__ajaxHooker.proxyXhr === thisArg) {
                thisArg = thisArg.__ajaxHooker.originalXhr;
            }
            return Reflect.apply(this, thisArg, args || []);
        }
    }
    function hookSecsdk(csrf) {
        Object.setPrototypeOf(csrf.nativeXMLHttpRequestSetRequestHeader, AHFunction.prototype);
        Object.setPrototypeOf(csrf.nativeXMLHttpRequestOpen, AHFunction.prototype);
        Object.setPrototypeOf(csrf.nativeXMLHttpRequestSend, AHFunction.prototype);
    }
    if (win.secsdk) {
        if (win.secsdk.csrf && win.secsdk.csrf.nativeXMLHttpRequestOpen) hookSecsdk(win.secsdk.csrf);
    } else {
        defineProp(win, 'secsdk', emptyFn, secsdk => {
            delete win.secsdk;
            win.secsdk = secsdk;
            defineProp(secsdk, 'csrf', emptyFn, csrf => {
                delete secsdk.csrf;
                secsdk.csrf = csrf;
                if (csrf.nativeXMLHttpRequestOpen) hookSecsdk(csrf);
            })
        });
    }
    return {
        hook: fn => hookInst.hookFns.push(fn),
        filter: arr => {
            if (Array.isArray(arr)) hookInst.filters = arr;
        },
        protect: () => {
            readonly(win, 'XMLHttpRequest', winAh.fakeXHR);
            readonly(win, 'fetch', winAh.fakeFetch);
            readonly(resProto, 'clone', winAh.fakeFetchClone);
        },
        unhook: () => {
            winAh.hookInsts.delete(hookInst);
            if (!winAh.hookInsts.size) {
                writable(win, 'XMLHttpRequest', winAh.realXHR);
                writable(win, 'fetch', winAh.realFetch);
                writable(resProto, 'clone', winAh.realFetchClone);
                delete win.__ajaxHooker;
            }
        }
    };
}();
} catch (e) {
    console.error('[SteamPyTools] 依赖加载失败: ajaxHooker.js', e);
}

/* ===== inlined dependency: ElementGetter.js ===== */
try {
var elmGetter = function() {
    const win = window.unsafeWindow || document.defaultView || window;
    const doc = win.document;
    const listeners = new WeakMap();
    let mode = 'css';
    let $;
    const elProto = win.Element.prototype;
    const matches = elProto.matches || elProto.matchesSelector || elProto.webkitMatchesSelector ||
        elProto.mozMatchesSelector || elProto.oMatchesSelector;
    const MutationObs = win.MutationObserver || win.WebkitMutationObserver || win.MozMutationObserver;
    let defaultTimeout = 0;
    let defaultOnTimeout = () => null;
    function addObserver(target, callback) {
        const observer = new MutationObs(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    callback(mutation.target, 'attr');
                    if (observer.canceled) return;
                }
                for (const node of mutation.addedNodes) {
                    if (node instanceof Element) callback(node, 'insert');
                    if (observer.canceled) return;
                }
            }
        });
        observer.canceled = false;
        observer.observe(target, {childList: true, subtree: true, attributes: true});
        return () => {
            observer.canceled = true;
            observer.disconnect();
        };
    }
    function addFilter(target, filter) {
        let listener = listeners.get(target);
        if (!listener) {
            listener = {
                filters: new Set(),
                remove: addObserver(target, (el, reason) => listener.filters.forEach(f => f(el, reason)))
            };
            listeners.set(target, listener);
        }
        listener.filters.add(filter);
    }
    function removeFilter(target, filter) {
        const listener = listeners.get(target);
        if (!listener) return;
        listener.filters.delete(filter);
        if (!listener.filters.size) {
            listener.remove();
            listeners.delete(target);
        }
    }
    function query(selector, parent, root, curMode, reason) {
        switch (curMode) {
            case 'css': {
                if (reason === 'attr') return matches.call(parent, selector) ? parent : null;
                const checkParent = parent !== root && matches.call(parent, selector);
                return checkParent ? parent : parent.querySelector(selector);
            }
            case 'jquery': {
                if (reason === 'attr') return $(parent).is(selector) ? $(parent) : null;
                const jNodes = $(parent !== root ? parent : []).add([...parent.querySelectorAll('*')]).filter(selector);
                return jNodes.length ? $(jNodes.get(0)) : null;
            }
            case 'xpath': {
                const ownerDoc = parent.ownerDocument || parent;
                selector += '/self::*';
                return ownerDoc.evaluate(selector, reason === 'attr' ? root : parent, null, 9, null).singleNodeValue;
            }
        }
    }
    function queryAll(selector, parent, root, curMode, reason) {
        switch (curMode) {
            case 'css': {
                if (reason === 'attr') return matches.call(parent, selector) ? [parent] : [];
                const checkParent = parent !== root && matches.call(parent, selector);
                const result = parent.querySelectorAll(selector);
                return checkParent ? [parent, ...result] : [...result];
            }
            case 'jquery': {
                if (reason === 'attr') return $(parent).is(selector) ? [$(parent)] : [];
                const jNodes = $(parent !== root ? parent : []).add([...parent.querySelectorAll('*')]).filter(selector);
                return $.map(jNodes, el => $(el));
            }
            case 'xpath': {
                const ownerDoc = parent.ownerDocument || parent;
                selector += '/self::*';
                const xPathResult = ownerDoc.evaluate(selector, reason === 'attr' ? root : parent, null, 7, null);
                const result = [];
                for (let i = 0; i < xPathResult.snapshotLength; i++) {
                    result.push(xPathResult.snapshotItem(i));
                }
                return result;
            }
        }
    }
    function isJquery(jq) {
        return jq && jq.fn && typeof jq.fn.jquery === 'string';
    }
    function getOne(selector, parent, timeout) {
        const curMode = mode;
        return new Promise(resolve => {
            const node = query(selector, parent, parent, curMode);
            if (node) return resolve(node);
            let timer;
            const filter = (el, reason) => {
                const node = query(selector, el, parent, curMode, reason);
                if (node) {
                    removeFilter(parent, filter);
                    timer && clearTimeout(timer);
                    resolve(node);
                }
            };
            addFilter(parent, filter);
            if (timeout > 0) {
                timer = setTimeout(() => {
                    removeFilter(parent, filter);
                    const result = defaultOnTimeout(selector);
                    if (result !== void 0) resolve(result);
                }, timeout);
            }
        });
    }
    return {
        get currentSelector() {
            return mode;
        },
        get(selector, ...args) {
            let parent = typeof args[0] !== 'number' && args.shift() || doc;
            if (mode === 'jquery' && parent instanceof $) parent = parent.get(0);
            const timeout = args[0] || defaultTimeout;
            if (Array.isArray(selector)) {
                return Promise.all(selector.map(s => getOne(s, parent, timeout)));
            }
            return getOne(selector, parent, timeout);
        },
        each(selector, ...args) {
            let parent = typeof args[0] !== 'function' && args.shift() || doc;
            if (mode === 'jquery' && parent instanceof $) parent = parent.get(0);
            const callback = args[0];
            const curMode = mode;
            const refs = new WeakSet();
            for (const node of queryAll(selector, parent, parent, curMode)) {
                refs.add(curMode === 'jquery' ? node.get(0) : node);
                if (callback(node, false) === false) return;
            }
            const filter = (el, reason) => {
                for (const node of queryAll(selector, el, parent, curMode, reason)) {
                    const _el = curMode === 'jquery' ? node.get(0) : node;
                    if (refs.has(_el)) break;
                    refs.add(_el);
                    if (callback(node, true) === false) {
                        return removeFilter(parent, filter);
                    }
                }
            };
            addFilter(parent, filter);
        },
        create(domString, ...args) {
            const returnList = typeof args[0] === 'boolean' && args.shift();
            const parent = args[0];
            const template = doc.createElement('template');
            template.innerHTML = domString;
            const node = template.content.firstElementChild;
            if (!node) return null;
            parent ? parent.appendChild(node) : node.remove();
            if (returnList) {
                const list = {};
                node.querySelectorAll('[id]').forEach(el => list[el.id] = el);
                list[0] = node;
                return list;
            }
            return node;
        },
        selector(desc) {
            switch (true) {
                case isJquery(desc):
                    $ = desc;
                    return mode = 'jquery';
                case !desc || typeof desc.toLowerCase !== 'function':
                    return mode = 'css';
                case desc.toLowerCase() === 'jquery':
                    for (const jq of [window.jQuery, window.$, win.jQuery, win.$]) {
                        if (isJquery(jq)) {
                            $ = jq;
                            break;
                        }
                    }
                    return mode = $ ? 'jquery' : 'css';
                case desc.toLowerCase() === 'xpath':
                    return mode = 'xpath';
                default:
                    return mode = 'css';
            }
        },
        onTimeout(...args) {
            defaultTimeout = typeof args[0] === 'number' && args.shift() || defaultTimeout;
            defaultOnTimeout = args[0] || defaultOnTimeout;
        }
    };
}();
} catch (e) {
    console.error('[SteamPyTools] 依赖加载失败: ElementGetter.js', e);
}

/* ===== inlined dependency: ajax.js ===== */
try {
var ajax = function() {
    let defaultOptions = {};
    const requests = new WeakMap();
    function isString(str) {
        return typeof str === 'string' || str instanceof String;
    }
    function isPlainObject(obj) {
        if (typeof obj !== 'object' || obj === null) return false;
        let proto = obj;
        while (Object.getPrototypeOf(proto) !== null) {
            proto = Object.getPrototypeOf(proto);
        }
        return Object.getPrototypeOf(obj) === proto;
    }
    function isSimpleObject(obj) {
        if (!isPlainObject(obj)) return false;
        for (const key in obj) {
            if (typeof obj[key] === 'object') {
                return false;
            }
        }
        return true;
    }
    function parseUrlString(obj) {
        if (typeof obj !== 'object' || obj === null) return '';
        let str = '';
        for (const key in obj) {
            str += `&${key}=${encodeURIComponent(obj[key])}`;
        }
        return str.substr(1);
    }
    function lowerHeaders(headers) {
        if (typeof headers !== 'object' || headers === null) return {};
        const lheaders = {};
        for (const key in headers) {
            lheaders[key.toLowerCase()] = headers[key];
        }
        return lheaders;
    }
    function parseHeaders(str) {
        if (!str) return {};
        const headers = {};
        const arr = str.trim().split(/[\r\n]+/);
        for (const line of arr) {
            const parts = line.split(/:\s*/);
            const lheader = parts[0].toLowerCase();
            if (lheader in headers) {
                headers[lheader] += ', ' + parts[1];
            } else {
                headers[lheader] = parts[1];
            }
        }
        return headers;
    }
    function parseJson(str) {
        let result = str;
        try {
            while (typeof result !== 'object') {
                result = JSON.parse(result);
            }
        } catch (e) {
            result = null;
        }
        return result;
    }
    function parseDom(str, contentType) {
        let mimeType = contentType ? contentType.split(';').shift() : 'text/html';
        switch (mimeType) {
            case 'text/html':
            case 'text/xml':
            case 'application/xml':
            case 'application/xhtml+xml':
            case 'image/svg+xml':
                break;
            default:
                mimeType = 'text/html';
        }
        return new DOMParser().parseFromString(str, mimeType);
    }
    function objToString() {
        return JSON.stringify(this);
    }
    function adaptData(options) {
        if (!('data' in options)) return;
        if (options.method === 'get') {
            let search;
            if (isString(options.data)) {
                search = options.data;
            } else if (isSimpleObject(options.data)) {
                search = parseUrlString(options.data);
            }
            if (search) options.url += (options.url.includes('?') ? '&' : '?') + search;
        }
        if (options.method === 'post') {
            if (!('content-type' in options.headers)) {
                switch (true) {
                    case isString(options.data):
                        options.headers['content-type'] = 'application/x-www-form-urlencoded';
                        break;
                    case isSimpleObject(options.data):
                        options.headers['content-type'] = 'application/x-www-form-urlencoded';
                        options.data = parseUrlString(options.data);
                        break;
                    case isPlainObject(options.data):
                        options.headers['content-type'] = 'application/json';
                        options.data = JSON.stringify(options.data);
                        break;
                }
            } else if (!isString(options.data)) {
                const mimeType = options.headers['content-type'].split(';').shift();
                switch (mimeType) {
                    case 'application/x-www-form-urlencoded':
                        options.data = parseUrlString(options.data);
                        break;
                    case 'application/json':
                        options.data = JSON.stringify(options.data);
                        break;
                }
            }
        }
    }
    function ajaxGM(GM_xhr, options) {
        const {_status, _detail, _nocatch, ..._options} = options;
        let abort = () => {};
        const promise = new Promise((resolve, reject) => {
            const _resolve = data => {
                requests.delete(promise);
                resolve(_detail ? data : data.response);
            };
            const _reject = (reason, status = 0) => {
                requests.delete(promise);
                const err = {
                    url: _options.url,
                    status: status,
                    error: reason
                };
                err.toString = objToString;
                _nocatch ? resolve(_detail ? err : null) : reject(err);
            };
            const responseType = _options.responseType;
            if (['text', 'json', 'document'].includes(responseType)) delete _options.responseType;
            const xhr = GM_xhr({
                ..._options,
                onload: res => {
                    if (_status.includes(res.status)) {
                        let result;
                        const headers = parseHeaders(res.responseHeaders);
                        switch (responseType) {
                            case 'text':
                                result = res.responseText;
                                break;
                            case 'json':
                                result = parseJson(res.responseText);
                                if (!result) return _reject('parse json failed', res.status);
                                break;
                            case 'document':
                                const contentType = _options.overrideMimeType || headers['content-type'];
                                result = parseDom(res.responseText, contentType);
                                break;
                            default:
                                result = res.response;
                        }
                        _resolve({
                            finalUrl: res.finalUrl,
                            status: res.status,
                            response: result,
                            responseHeaders: headers
                        });
                    } else {
                        _reject('bad status', res.status);
                    }
                },
                onerror: () => _reject('request failed'),
                onabort: () => _reject('aborted'), // Don't work in Tampermonkey < 4.9.5927
                ontimeout: () => _reject('timeout')
            });
            if (xhr && typeof xhr.abort === 'function') {
                abort = () => {
                    xhr.abort();
                    _reject('aborted');
                };
            }
        });
        requests.set(promise, {abort});
        return promise;
    }
    function ajaxXHR(options) {
        const {_status, _detail, _nocatch, ..._options} = options;
        const xhr = new XMLHttpRequest();
        const abort = xhr.abort.bind(xhr);
        const promise = new Promise((resolve, reject) => {
            const _resolve = data => {
                requests.delete(promise);
                resolve(_detail ? data : data.response);
            };
            const _reject = reason => {
                requests.delete(promise);
                const err = {
                    url: _options.url,
                    status: xhr.status,
                    error: reason
                };
                err.toString = objToString;
                _nocatch ? resolve(_detail ? err : null) : reject(err);
            };
            xhr.open(_options.method, _options.url, true, _options.user, _options.password);
            for (const header in _options.headers) {
                xhr.setRequestHeader(header, _options.headers[header]);
            }
            if ('overrideMimeType' in _options) {
                xhr.overrideMimeType(_options.overrideMimeType);
                delete _options.overrideMimeType;
            }
            const responseType = _options.responseType;
            if (responseType === 'json') _options.responseType = 'text';
            for (const key in _options) {
                switch (typeof xhr[key]) {
                    case 'object':
                        if (key.startsWith('on')) {
                            xhr[key] = e => _options[key].call(xhr, e.target);
                        } else {
                            xhr[key] = _options[key];
                        }
                        break;
                    case 'function':
                    case 'undefined':
                        break;
                    default:
                        xhr[key] = _options[key];
                }
            }
            xhr.onload = () => {
                if (_status.includes(xhr.status)) {
                    let result;
                    if (responseType === 'json') {
                        result = parseJson(xhr.responseText);
                        if (!result) _reject('parse json failed');
                    } else {
                        result = xhr.response;
                    }
                    _resolve({
                        finalUrl: xhr.responseURL,
                        status: xhr.status,
                        response: result,
                        responseHeaders: parseHeaders(xhr.getAllResponseHeaders())
                    });
                } else {
                    _reject('bad status');
                }
            };
            xhr.onerror = () => _reject('request failed');
            xhr.onabort = () => _reject('aborted');
            xhr.ontimeout = () => _reject('timeout');
            xhr.send(_options.data);
        });
        requests.set(promise, {abort});
        return promise;
    }
    function ajax(desc, obj = {}) {
        switch (desc) {
            case 'default':
                defaultOptions = obj;
                defaultOptions.headers = lowerHeaders(defaultOptions.headers);
                return;
            case 'abort':
                if (requests.has(obj)) {
                    requests.get(obj).abort();
                }
                return;
        }
        const {onload, onerror, onabort, ontimeout, _mode, ...options} = {
            method: 'get',
            responseType: 'text',
            _status: [200],
            _detail: false,
            _nocatch: false,
            ...defaultOptions,
            ...obj,
            url: desc
        };
        options.method = options.method.toLowerCase();
        options.headers = lowerHeaders(options.headers);
        if ('headers' in defaultOptions) {
            options.headers = {...defaultOptions.headers, ...options.headers};
        }
        if ('cookie' in options) {
            options.headers.cookie = options.cookie;
            delete options.cookie;
        }
        adaptData(options);
        let GM_xhr;
        switch (_mode) {
            case 'GM_xhr':
            case 'GM_xmlhttpRequest':
                if (!window.GM_xmlhttpRequest) {
                    return Promise.reject('缺少GM_xmlhttpRequest，请检查你的脚本声明。');
                }
                GM_xhr = window.GM_xmlhttpRequest;
                break;
            case 'GM.xhr':
            case 'GM.xmlHttpRequest':
                if (!window.GM || !window.GM.xmlHttpRequest) {
                    return Promise.reject('缺少GM.xmlHttpRequest，请检查你的脚本声明。');
                }
                GM_xhr = window.GM.xmlHttpRequest;
                break;
            case 'xhr':
            case 'XMLHttpRequest':
                break;
            default:
                GM_xhr = window.GM_xmlhttpRequest || (window.GM && window.GM.xmlHttpRequest);
        }
        return GM_xhr ? ajaxGM(GM_xhr.bind(window), options) : ajaxXHR(options);
    }
    return ajax;
}();
} catch (e) {
    console.error('[SteamPyTools] 依赖加载失败: ajax.js', e);
}

/* ===== inlined dependency: jquery.js ===== */
try {
/*! jQuery v3.7.1 | (c) OpenJS Foundation and other contributors | jquery.org/license */
!function(e,t){"use strict";"object"==typeof module&&"object"==typeof module.exports?module.exports=e.document?t(e,!0):function(e){if(!e.document)throw new Error("jQuery requires a window with a document");return t(e)}:t(e)}("undefined"!=typeof window?window:this,function(ie,e){"use strict";var oe=[],r=Object.getPrototypeOf,ae=oe.slice,g=oe.flat?function(e){return oe.flat.call(e)}:function(e){return oe.concat.apply([],e)},s=oe.push,se=oe.indexOf,n={},i=n.toString,ue=n.hasOwnProperty,o=ue.toString,a=o.call(Object),le={},v=function(e){return"function"==typeof e&&"number"!=typeof e.nodeType&&"function"!=typeof e.item},y=function(e){return null!=e&&e===e.window},C=ie.document,u={type:!0,src:!0,nonce:!0,noModule:!0};function m(e,t,n){var r,i,o=(n=n||C).createElement("script");if(o.text=e,t)for(r in u)(i=t[r]||t.getAttribute&&t.getAttribute(r))&&o.setAttribute(r,i);n.head.appendChild(o).parentNode.removeChild(o)}function x(e){return null==e?e+"":"object"==typeof e||"function"==typeof e?n[i.call(e)]||"object":typeof e}var t="3.7.1",l=/HTML$/i,ce=function(e,t){return new ce.fn.init(e,t)};function c(e){var t=!!e&&"length"in e&&e.length,n=x(e);return!v(e)&&!y(e)&&("array"===n||0===t||"number"==typeof t&&0<t&&t-1 in e)}function fe(e,t){return e.nodeName&&e.nodeName.toLowerCase()===t.toLowerCase()}ce.fn=ce.prototype={jquery:t,constructor:ce,length:0,toArray:function(){return ae.call(this)},get:function(e){return null==e?ae.call(this):e<0?this[e+this.length]:this[e]},pushStack:function(e){var t=ce.merge(this.constructor(),e);return t.prevObject=this,t},each:function(e){return ce.each(this,e)},map:function(n){return this.pushStack(ce.map(this,function(e,t){return n.call(e,t,e)}))},slice:function(){return this.pushStack(ae.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},even:function(){return this.pushStack(ce.grep(this,function(e,t){return(t+1)%2}))},odd:function(){return this.pushStack(ce.grep(this,function(e,t){return t%2}))},eq:function(e){var t=this.length,n=+e+(e<0?t:0);return this.pushStack(0<=n&&n<t?[this[n]]:[])},end:function(){return this.prevObject||this.constructor()},push:s,sort:oe.sort,splice:oe.splice},ce.extend=ce.fn.extend=function(){var e,t,n,r,i,o,a=arguments[0]||{},s=1,u=arguments.length,l=!1;for("boolean"==typeof a&&(l=a,a=arguments[s]||{},s++),"object"==typeof a||v(a)||(a={}),s===u&&(a=this,s--);s<u;s++)if(null!=(e=arguments[s]))for(t in e)r=e[t],"__proto__"!==t&&a!==r&&(l&&r&&(ce.isPlainObject(r)||(i=Array.isArray(r)))?(n=a[t],o=i&&!Array.isArray(n)?[]:i||ce.isPlainObject(n)?n:{},i=!1,a[t]=ce.extend(l,o,r)):void 0!==r&&(a[t]=r));return a},ce.extend({expando:"jQuery"+(t+Math.random()).replace(/\D/g,""),isReady:!0,error:function(e){throw new Error(e)},noop:function(){},isPlainObject:function(e){var t,n;return!(!e||"[object Object]"!==i.call(e))&&(!(t=r(e))||"function"==typeof(n=ue.call(t,"constructor")&&t.constructor)&&o.call(n)===a)},isEmptyObject:function(e){var t;for(t in e)return!1;return!0},globalEval:function(e,t,n){m(e,{nonce:t&&t.nonce},n)},each:function(e,t){var n,r=0;if(c(e)){for(n=e.length;r<n;r++)if(!1===t.call(e[r],r,e[r]))break}else for(r in e)if(!1===t.call(e[r],r,e[r]))break;return e},text:function(e){var t,n="",r=0,i=e.nodeType;if(!i)while(t=e[r++])n+=ce.text(t);return 1===i||11===i?e.textContent:9===i?e.documentElement.textContent:3===i||4===i?e.nodeValue:n},makeArray:function(e,t){var n=t||[];return null!=e&&(c(Object(e))?ce.merge(n,"string"==typeof e?[e]:e):s.call(n,e)),n},inArray:function(e,t,n){return null==t?-1:se.call(t,e,n)},isXMLDoc:function(e){var t=e&&e.namespaceURI,n=e&&(e.ownerDocument||e).documentElement;return!l.test(t||n&&n.nodeName||"HTML")},merge:function(e,t){for(var n=+t.length,r=0,i=e.length;r<n;r++)e[i++]=t[r];return e.length=i,e},grep:function(e,t,n){for(var r=[],i=0,o=e.length,a=!n;i<o;i++)!t(e[i],i)!==a&&r.push(e[i]);return r},map:function(e,t,n){var r,i,o=0,a=[];if(c(e))for(r=e.length;o<r;o++)null!=(i=t(e[o],o,n))&&a.push(i);else for(o in e)null!=(i=t(e[o],o,n))&&a.push(i);return g(a)},guid:1,support:le}),"function"==typeof Symbol&&(ce.fn[Symbol.iterator]=oe[Symbol.iterator]),ce.each("Boolean Number String Function Array Date RegExp Object Error Symbol".split(" "),function(e,t){n["[object "+t+"]"]=t.toLowerCase()});var pe=oe.pop,de=oe.sort,he=oe.splice,ge="[\\x20\\t\\r\\n\\f]",ve=new RegExp("^"+ge+"+|((?:^|[^\\\\])(?:\\\\.)*)"+ge+"+$","g");ce.contains=function(e,t){var n=t&&t.parentNode;return e===n||!(!n||1!==n.nodeType||!(e.contains?e.contains(n):e.compareDocumentPosition&&16&e.compareDocumentPosition(n)))};var f=/([\0-\x1f\x7f]|^-?\d)|^-$|[^\x80-\uFFFF\w-]/g;function p(e,t){return t?"\0"===e?"\ufffd":e.slice(0,-1)+"\\"+e.charCodeAt(e.length-1).toString(16)+" ":"\\"+e}ce.escapeSelector=function(e){return(e+"").replace(f,p)};var ye=C,me=s;!function(){var e,b,w,o,a,T,r,C,d,i,k=me,S=ce.expando,E=0,n=0,s=W(),c=W(),u=W(),h=W(),l=function(e,t){return e===t&&(a=!0),0},f="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",t="(?:\\\\[\\da-fA-F]{1,6}"+ge+"?|\\\\[^\\r\\n\\f]|[\\w-]|[^\0-\\x7f])+",p="\\["+ge+"*("+t+")(?:"+ge+"*([*^$|!~]?=)"+ge+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+t+"))|)"+ge+"*\\]",g=":("+t+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+p+")*)|.*)\\)|)",v=new RegExp(ge+"+","g"),y=new RegExp("^"+ge+"*,"+ge+"*"),m=new RegExp("^"+ge+"*([>+~]|"+ge+")"+ge+"*"),x=new RegExp(ge+"|>"),j=new RegExp(g),A=new RegExp("^"+t+"$"),D={ID:new RegExp("^#("+t+")"),CLASS:new RegExp("^\\.("+t+")"),TAG:new RegExp("^("+t+"|[*])"),ATTR:new RegExp("^"+p),PSEUDO:new RegExp("^"+g),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+ge+"*(even|odd|(([+-]|)(\\d*)n|)"+ge+"*(?:([+-]|)"+ge+"*(\\d+)|))"+ge+"*\\)|)","i"),bool:new RegExp("^(?:"+f+")$","i"),needsContext:new RegExp("^"+ge+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+ge+"*((?:-\\d)?\\d*)"+ge+"*\\)|)(?=[^-]|$)","i")},N=/^(?:input|select|textarea|button)$/i,q=/^h\d$/i,L=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,H=/[+~]/,O=new RegExp("\\\\[\\da-fA-F]{1,6}"+ge+"?|\\\\([^\\r\\n\\f])","g"),P=function(e,t){var n="0x"+e.slice(1)-65536;return t||(n<0?String.fromCharCode(n+65536):String.fromCharCode(n>>10|55296,1023&n|56320))},M=function(){V()},R=J(function(e){return!0===e.disabled&&fe(e,"fieldset")},{dir:"parentNode",next:"legend"});try{k.apply(oe=ae.call(ye.childNodes),ye.childNodes),oe[ye.childNodes.length].nodeType}catch(e){k={apply:function(e,t){me.apply(e,ae.call(t))},call:function(e){me.apply(e,ae.call(arguments,1))}}}function I(t,e,n,r){var i,o,a,s,u,l,c,f=e&&e.ownerDocument,p=e?e.nodeType:9;if(n=n||[],"string"!=typeof t||!t||1!==p&&9!==p&&11!==p)return n;if(!r&&(V(e),e=e||T,C)){if(11!==p&&(u=L.exec(t)))if(i=u[1]){if(9===p){if(!(a=e.getElementById(i)))return n;if(a.id===i)return k.call(n,a),n}else if(f&&(a=f.getElementById(i))&&I.contains(e,a)&&a.id===i)return k.call(n,a),n}else{if(u[2])return k.apply(n,e.getElementsByTagName(t)),n;if((i=u[3])&&e.getElementsByClassName)return k.apply(n,e.getElementsByClassName(i)),n}if(!(h[t+" "]||d&&d.test(t))){if(c=t,f=e,1===p&&(x.test(t)||m.test(t))){(f=H.test(t)&&U(e.parentNode)||e)==e&&le.scope||((s=e.getAttribute("id"))?s=ce.escapeSelector(s):e.setAttribute("id",s=S)),o=(l=Y(t)).length;while(o--)l[o]=(s?"#"+s:":scope")+" "+Q(l[o]);c=l.join(",")}try{return k.apply(n,f.querySelectorAll(c)),n}catch(e){h(t,!0)}finally{s===S&&e.removeAttribute("id")}}}return re(t.replace(ve,"$1"),e,n,r)}function W(){var r=[];return function e(t,n){return r.push(t+" ")>b.cacheLength&&delete e[r.shift()],e[t+" "]=n}}function F(e){return e[S]=!0,e}function $(e){var t=T.createElement("fieldset");try{return!!e(t)}catch(e){return!1}finally{t.parentNode&&t.parentNode.removeChild(t),t=null}}function B(t){return function(e){return fe(e,"input")&&e.type===t}}function _(t){return function(e){return(fe(e,"input")||fe(e,"button"))&&e.type===t}}function z(t){return function(e){return"form"in e?e.parentNode&&!1===e.disabled?"label"in e?"label"in e.parentNode?e.parentNode.disabled===t:e.disabled===t:e.isDisabled===t||e.isDisabled!==!t&&R(e)===t:e.disabled===t:"label"in e&&e.disabled===t}}function X(a){return F(function(o){return o=+o,F(function(e,t){var n,r=a([],e.length,o),i=r.length;while(i--)e[n=r[i]]&&(e[n]=!(t[n]=e[n]))})})}function U(e){return e&&"undefined"!=typeof e.getElementsByTagName&&e}function V(e){var t,n=e?e.ownerDocument||e:ye;return n!=T&&9===n.nodeType&&n.documentElement&&(r=(T=n).documentElement,C=!ce.isXMLDoc(T),i=r.matches||r.webkitMatchesSelector||r.msMatchesSelector,r.msMatchesSelector&&ye!=T&&(t=T.defaultView)&&t.top!==t&&t.addEventListener("unload",M),le.getById=$(function(e){return r.appendChild(e).id=ce.expando,!T.getElementsByName||!T.getElementsByName(ce.expando).length}),le.disconnectedMatch=$(function(e){return i.call(e,"*")}),le.scope=$(function(){return T.querySelectorAll(":scope")}),le.cssHas=$(function(){try{return T.querySelector(":has(*,:jqfake)"),!1}catch(e){return!0}}),le.getById?(b.filter.ID=function(e){var t=e.replace(O,P);return function(e){return e.getAttribute("id")===t}},b.find.ID=function(e,t){if("undefined"!=typeof t.getElementById&&C){var n=t.getElementById(e);return n?[n]:[]}}):(b.filter.ID=function(e){var n=e.replace(O,P);return function(e){var t="undefined"!=typeof e.getAttributeNode&&e.getAttributeNode("id");return t&&t.value===n}},b.find.ID=function(e,t){if("undefined"!=typeof t.getElementById&&C){var n,r,i,o=t.getElementById(e);if(o){if((n=o.getAttributeNode("id"))&&n.value===e)return[o];i=t.getElementsByName(e),r=0;while(o=i[r++])if((n=o.getAttributeNode("id"))&&n.value===e)return[o]}return[]}}),b.find.TAG=function(e,t){return"undefined"!=typeof t.getElementsByTagName?t.getElementsByTagName(e):t.querySelectorAll(e)},b.find.CLASS=function(e,t){if("undefined"!=typeof t.getElementsByClassName&&C)return t.getElementsByClassName(e)},d=[],$(function(e){var t;r.appendChild(e).innerHTML="<a id='"+S+"' href='' disabled='disabled'></a><select id='"+S+"-\r\\' disabled='disabled'><option selected=''></option></select>",e.querySelectorAll("[selected]").length||d.push("\\["+ge+"*(?:value|"+f+")"),e.querySelectorAll("[id~="+S+"-]").length||d.push("~="),e.querySelectorAll("a#"+S+"+*").length||d.push(".#.+[+~]"),e.querySelectorAll(":checked").length||d.push(":checked"),(t=T.createElement("input")).setAttribute("type","hidden"),e.appendChild(t).setAttribute("name","D"),r.appendChild(e).disabled=!0,2!==e.querySelectorAll(":disabled").length&&d.push(":enabled",":disabled"),(t=T.createElement("input")).setAttribute("name",""),e.appendChild(t),e.querySelectorAll("[name='']").length||d.push("\\["+ge+"*name"+ge+"*="+ge+"*(?:''|\"\")")}),le.cssHas||d.push(":has"),d=d.length&&new RegExp(d.join("|")),l=function(e,t){if(e===t)return a=!0,0;var n=!e.compareDocumentPosition-!t.compareDocumentPosition;return n||(1&(n=(e.ownerDocument||e)==(t.ownerDocument||t)?e.compareDocumentPosition(t):1)||!le.sortDetached&&t.compareDocumentPosition(e)===n?e===T||e.ownerDocument==ye&&I.contains(ye,e)?-1:t===T||t.ownerDocument==ye&&I.contains(ye,t)?1:o?se.call(o,e)-se.call(o,t):0:4&n?-1:1)}),T}for(e in I.matches=function(e,t){return I(e,null,null,t)},I.matchesSelector=function(e,t){if(V(e),C&&!h[t+" "]&&(!d||!d.test(t)))try{var n=i.call(e,t);if(n||le.disconnectedMatch||e.document&&11!==e.document.nodeType)return n}catch(e){h(t,!0)}return 0<I(t,T,null,[e]).length},I.contains=function(e,t){return(e.ownerDocument||e)!=T&&V(e),ce.contains(e,t)},I.attr=function(e,t){(e.ownerDocument||e)!=T&&V(e);var n=b.attrHandle[t.toLowerCase()],r=n&&ue.call(b.attrHandle,t.toLowerCase())?n(e,t,!C):void 0;return void 0!==r?r:e.getAttribute(t)},I.error=function(e){throw new Error("Syntax error, unrecognized expression: "+e)},ce.uniqueSort=function(e){var t,n=[],r=0,i=0;if(a=!le.sortStable,o=!le.sortStable&&ae.call(e,0),de.call(e,l),a){while(t=e[i++])t===e[i]&&(r=n.push(i));while(r--)he.call(e,n[r],1)}return o=null,e},ce.fn.uniqueSort=function(){return this.pushStack(ce.uniqueSort(ae.apply(this)))},(b=ce.expr={cacheLength:50,createPseudo:F,match:D,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(e){return e[1]=e[1].replace(O,P),e[3]=(e[3]||e[4]||e[5]||"").replace(O,P),"~="===e[2]&&(e[3]=" "+e[3]+" "),e.slice(0,4)},CHILD:function(e){return e[1]=e[1].toLowerCase(),"nth"===e[1].slice(0,3)?(e[3]||I.error(e[0]),e[4]=+(e[4]?e[5]+(e[6]||1):2*("even"===e[3]||"odd"===e[3])),e[5]=+(e[7]+e[8]||"odd"===e[3])):e[3]&&I.error(e[0]),e},PSEUDO:function(e){var t,n=!e[6]&&e[2];return D.CHILD.test(e[0])?null:(e[3]?e[2]=e[4]||e[5]||"":n&&j.test(n)&&(t=Y(n,!0))&&(t=n.indexOf(")",n.length-t)-n.length)&&(e[0]=e[0].slice(0,t),e[2]=n.slice(0,t)),e.slice(0,3))}},filter:{TAG:function(e){var t=e.replace(O,P).toLowerCase();return"*"===e?function(){return!0}:function(e){return fe(e,t)}},CLASS:function(e){var t=s[e+" "];return t||(t=new RegExp("(^|"+ge+")"+e+"("+ge+"|$)"))&&s(e,function(e){return t.test("string"==typeof e.className&&e.className||"undefined"!=typeof e.getAttribute&&e.getAttribute("class")||"")})},ATTR:function(n,r,i){return function(e){var t=I.attr(e,n);return null==t?"!="===r:!r||(t+="","="===r?t===i:"!="===r?t!==i:"^="===r?i&&0===t.indexOf(i):"*="===r?i&&-1<t.indexOf(i):"$="===r?i&&t.slice(-i.length)===i:"~="===r?-1<(" "+t.replace(v," ")+" ").indexOf(i):"|="===r&&(t===i||t.slice(0,i.length+1)===i+"-"))}},CHILD:function(d,e,t,h,g){var v="nth"!==d.slice(0,3),y="last"!==d.slice(-4),m="of-type"===e;return 1===h&&0===g?function(e){return!!e.parentNode}:function(e,t,n){var r,i,o,a,s,u=v!==y?"nextSibling":"previousSibling",l=e.parentNode,c=m&&e.nodeName.toLowerCase(),f=!n&&!m,p=!1;if(l){if(v){while(u){o=e;while(o=o[u])if(m?fe(o,c):1===o.nodeType)return!1;s=u="only"===d&&!s&&"nextSibling"}return!0}if(s=[y?l.firstChild:l.lastChild],y&&f){p=(a=(r=(i=l[S]||(l[S]={}))[d]||[])[0]===E&&r[1])&&r[2],o=a&&l.childNodes[a];while(o=++a&&o&&o[u]||(p=a=0)||s.pop())if(1===o.nodeType&&++p&&o===e){i[d]=[E,a,p];break}}else if(f&&(p=a=(r=(i=e[S]||(e[S]={}))[d]||[])[0]===E&&r[1]),!1===p)while(o=++a&&o&&o[u]||(p=a=0)||s.pop())if((m?fe(o,c):1===o.nodeType)&&++p&&(f&&((i=o[S]||(o[S]={}))[d]=[E,p]),o===e))break;return(p-=g)===h||p%h==0&&0<=p/h}}},PSEUDO:function(e,o){var t,a=b.pseudos[e]||b.setFilters[e.toLowerCase()]||I.error("unsupported pseudo: "+e);return a[S]?a(o):1<a.length?(t=[e,e,"",o],b.setFilters.hasOwnProperty(e.toLowerCase())?F(function(e,t){var n,r=a(e,o),i=r.length;while(i--)e[n=se.call(e,r[i])]=!(t[n]=r[i])}):function(e){return a(e,0,t)}):a}},pseudos:{not:F(function(e){var r=[],i=[],s=ne(e.replace(ve,"$1"));return s[S]?F(function(e,t,n,r){var i,o=s(e,null,r,[]),a=e.length;while(a--)(i=o[a])&&(e[a]=!(t[a]=i))}):function(e,t,n){return r[0]=e,s(r,null,n,i),r[0]=null,!i.pop()}}),has:F(function(t){return function(e){return 0<I(t,e).length}}),contains:F(function(t){return t=t.replace(O,P),function(e){return-1<(e.textContent||ce.text(e)).indexOf(t)}}),lang:F(function(n){return A.test(n||"")||I.error("unsupported lang: "+n),n=n.replace(O,P).toLowerCase(),function(e){var t;do{if(t=C?e.lang:e.getAttribute("xml:lang")||e.getAttribute("lang"))return(t=t.toLowerCase())===n||0===t.indexOf(n+"-")}while((e=e.parentNode)&&1===e.nodeType);return!1}}),target:function(e){var t=ie.location&&ie.location.hash;return t&&t.slice(1)===e.id},root:function(e){return e===r},focus:function(e){return e===function(){try{return T.activeElement}catch(e){}}()&&T.hasFocus()&&!!(e.type||e.href||~e.tabIndex)},enabled:z(!1),disabled:z(!0),checked:function(e){return fe(e,"input")&&!!e.checked||fe(e,"option")&&!!e.selected},selected:function(e){return e.parentNode&&e.parentNode.selectedIndex,!0===e.selected},empty:function(e){for(e=e.firstChild;e;e=e.nextSibling)if(e.nodeType<6)return!1;return!0},parent:function(e){return!b.pseudos.empty(e)},header:function(e){return q.test(e.nodeName)},input:function(e){return N.test(e.nodeName)},button:function(e){return fe(e,"input")&&"button"===e.type||fe(e,"button")},text:function(e){var t;return fe(e,"input")&&"text"===e.type&&(null==(t=e.getAttribute("type"))||"text"===t.toLowerCase())},first:X(function(){return[0]}),last:X(function(e,t){return[t-1]}),eq:X(function(e,t,n){return[n<0?n+t:n]}),even:X(function(e,t){for(var n=0;n<t;n+=2)e.push(n);return e}),odd:X(function(e,t){for(var n=1;n<t;n+=2)e.push(n);return e}),lt:X(function(e,t,n){var r;for(r=n<0?n+t:t<n?t:n;0<=--r;)e.push(r);return e}),gt:X(function(e,t,n){for(var r=n<0?n+t:n;++r<t;)e.push(r);return e})}}).pseudos.nth=b.pseudos.eq,{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})b.pseudos[e]=B(e);for(e in{submit:!0,reset:!0})b.pseudos[e]=_(e);function G(){}function Y(e,t){var n,r,i,o,a,s,u,l=c[e+" "];if(l)return t?0:l.slice(0);a=e,s=[],u=b.preFilter;while(a){for(o in n&&!(r=y.exec(a))||(r&&(a=a.slice(r[0].length)||a),s.push(i=[])),n=!1,(r=m.exec(a))&&(n=r.shift(),i.push({value:n,type:r[0].replace(ve," ")}),a=a.slice(n.length)),b.filter)!(r=D[o].exec(a))||u[o]&&!(r=u[o](r))||(n=r.shift(),i.push({value:n,type:o,matches:r}),a=a.slice(n.length));if(!n)break}return t?a.length:a?I.error(e):c(e,s).slice(0)}function Q(e){for(var t=0,n=e.length,r="";t<n;t++)r+=e[t].value;return r}function J(a,e,t){var s=e.dir,u=e.next,l=u||s,c=t&&"parentNode"===l,f=n++;return e.first?function(e,t,n){while(e=e[s])if(1===e.nodeType||c)return a(e,t,n);return!1}:function(e,t,n){var r,i,o=[E,f];if(n){while(e=e[s])if((1===e.nodeType||c)&&a(e,t,n))return!0}else while(e=e[s])if(1===e.nodeType||c)if(i=e[S]||(e[S]={}),u&&fe(e,u))e=e[s]||e;else{if((r=i[l])&&r[0]===E&&r[1]===f)return o[2]=r[2];if((i[l]=o)[2]=a(e,t,n))return!0}return!1}}function K(i){return 1<i.length?function(e,t,n){var r=i.length;while(r--)if(!i[r](e,t,n))return!1;return!0}:i[0]}function Z(e,t,n,r,i){for(var o,a=[],s=0,u=e.length,l=null!=t;s<u;s++)(o=e[s])&&(n&&!n(o,r,i)||(a.push(o),l&&t.push(s)));return a}function ee(d,h,g,v,y,e){return v&&!v[S]&&(v=ee(v)),y&&!y[S]&&(y=ee(y,e)),F(function(e,t,n,r){var i,o,a,s,u=[],l=[],c=t.length,f=e||function(e,t,n){for(var r=0,i=t.length;r<i;r++)I(e,t[r],n);return n}(h||"*",n.nodeType?[n]:n,[]),p=!d||!e&&h?f:Z(f,u,d,n,r);if(g?g(p,s=y||(e?d:c||v)?[]:t,n,r):s=p,v){i=Z(s,l),v(i,[],n,r),o=i.length;while(o--)(a=i[o])&&(s[l[o]]=!(p[l[o]]=a))}if(e){if(y||d){if(y){i=[],o=s.length;while(o--)(a=s[o])&&i.push(p[o]=a);y(null,s=[],i,r)}o=s.length;while(o--)(a=s[o])&&-1<(i=y?se.call(e,a):u[o])&&(e[i]=!(t[i]=a))}}else s=Z(s===t?s.splice(c,s.length):s),y?y(null,t,s,r):k.apply(t,s)})}function te(e){for(var i,t,n,r=e.length,o=b.relative[e[0].type],a=o||b.relative[" "],s=o?1:0,u=J(function(e){return e===i},a,!0),l=J(function(e){return-1<se.call(i,e)},a,!0),c=[function(e,t,n){var r=!o&&(n||t!=w)||((i=t).nodeType?u(e,t,n):l(e,t,n));return i=null,r}];s<r;s++)if(t=b.relative[e[s].type])c=[J(K(c),t)];else{if((t=b.filter[e[s].type].apply(null,e[s].matches))[S]){for(n=++s;n<r;n++)if(b.relative[e[n].type])break;return ee(1<s&&K(c),1<s&&Q(e.slice(0,s-1).concat({value:" "===e[s-2].type?"*":""})).replace(ve,"$1"),t,s<n&&te(e.slice(s,n)),n<r&&te(e=e.slice(n)),n<r&&Q(e))}c.push(t)}return K(c)}function ne(e,t){var n,v,y,m,x,r,i=[],o=[],a=u[e+" "];if(!a){t||(t=Y(e)),n=t.length;while(n--)(a=te(t[n]))[S]?i.push(a):o.push(a);(a=u(e,(v=o,m=0<(y=i).length,x=0<v.length,r=function(e,t,n,r,i){var o,a,s,u=0,l="0",c=e&&[],f=[],p=w,d=e||x&&b.find.TAG("*",i),h=E+=null==p?1:Math.random()||.1,g=d.length;for(i&&(w=t==T||t||i);l!==g&&null!=(o=d[l]);l++){if(x&&o){a=0,t||o.ownerDocument==T||(V(o),n=!C);while(s=v[a++])if(s(o,t||T,n)){k.call(r,o);break}i&&(E=h)}m&&((o=!s&&o)&&u--,e&&c.push(o))}if(u+=l,m&&l!==u){a=0;while(s=y[a++])s(c,f,t,n);if(e){if(0<u)while(l--)c[l]||f[l]||(f[l]=pe.call(r));f=Z(f)}k.apply(r,f),i&&!e&&0<f.length&&1<u+y.length&&ce.uniqueSort(r)}return i&&(E=h,w=p),c},m?F(r):r))).selector=e}return a}function re(e,t,n,r){var i,o,a,s,u,l="function"==typeof e&&e,c=!r&&Y(e=l.selector||e);if(n=n||[],1===c.length){if(2<(o=c[0]=c[0].slice(0)).length&&"ID"===(a=o[0]).type&&9===t.nodeType&&C&&b.relative[o[1].type]){if(!(t=(b.find.ID(a.matches[0].replace(O,P),t)||[])[0]))return n;l&&(t=t.parentNode),e=e.slice(o.shift().value.length)}i=D.needsContext.test(e)?0:o.length;while(i--){if(a=o[i],b.relative[s=a.type])break;if((u=b.find[s])&&(r=u(a.matches[0].replace(O,P),H.test(o[0].type)&&U(t.parentNode)||t))){if(o.splice(i,1),!(e=r.length&&Q(o)))return k.apply(n,r),n;break}}}return(l||ne(e,c))(r,t,!C,n,!t||H.test(e)&&U(t.parentNode)||t),n}G.prototype=b.filters=b.pseudos,b.setFilters=new G,le.sortStable=S.split("").sort(l).join("")===S,V(),le.sortDetached=$(function(e){return 1&e.compareDocumentPosition(T.createElement("fieldset"))}),ce.find=I,ce.expr[":"]=ce.expr.pseudos,ce.unique=ce.uniqueSort,I.compile=ne,I.select=re,I.setDocument=V,I.tokenize=Y,I.escape=ce.escapeSelector,I.getText=ce.text,I.isXML=ce.isXMLDoc,I.selectors=ce.expr,I.support=ce.support,I.uniqueSort=ce.uniqueSort}();var d=function(e,t,n){var r=[],i=void 0!==n;while((e=e[t])&&9!==e.nodeType)if(1===e.nodeType){if(i&&ce(e).is(n))break;r.push(e)}return r},h=function(e,t){for(var n=[];e;e=e.nextSibling)1===e.nodeType&&e!==t&&n.push(e);return n},b=ce.expr.match.needsContext,w=/^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i;function T(e,n,r){return v(n)?ce.grep(e,function(e,t){return!!n.call(e,t,e)!==r}):n.nodeType?ce.grep(e,function(e){return e===n!==r}):"string"!=typeof n?ce.grep(e,function(e){return-1<se.call(n,e)!==r}):ce.filter(n,e,r)}ce.filter=function(e,t,n){var r=t[0];return n&&(e=":not("+e+")"),1===t.length&&1===r.nodeType?ce.find.matchesSelector(r,e)?[r]:[]:ce.find.matches(e,ce.grep(t,function(e){return 1===e.nodeType}))},ce.fn.extend({find:function(e){var t,n,r=this.length,i=this;if("string"!=typeof e)return this.pushStack(ce(e).filter(function(){for(t=0;t<r;t++)if(ce.contains(i[t],this))return!0}));for(n=this.pushStack([]),t=0;t<r;t++)ce.find(e,i[t],n);return 1<r?ce.uniqueSort(n):n},filter:function(e){return this.pushStack(T(this,e||[],!1))},not:function(e){return this.pushStack(T(this,e||[],!0))},is:function(e){return!!T(this,"string"==typeof e&&b.test(e)?ce(e):e||[],!1).length}});var k,S=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/;(ce.fn.init=function(e,t,n){var r,i;if(!e)return this;if(n=n||k,"string"==typeof e){if(!(r="<"===e[0]&&">"===e[e.length-1]&&3<=e.length?[null,e,null]:S.exec(e))||!r[1]&&t)return!t||t.jquery?(t||n).find(e):this.constructor(t).find(e);if(r[1]){if(t=t instanceof ce?t[0]:t,ce.merge(this,ce.parseHTML(r[1],t&&t.nodeType?t.ownerDocument||t:C,!0)),w.test(r[1])&&ce.isPlainObject(t))for(r in t)v(this[r])?this[r](t[r]):this.attr(r,t[r]);return this}return(i=C.getElementById(r[2]))&&(this[0]=i,this.length=1),this}return e.nodeType?(this[0]=e,this.length=1,this):v(e)?void 0!==n.ready?n.ready(e):e(ce):ce.makeArray(e,this)}).prototype=ce.fn,k=ce(C);var E=/^(?:parents|prev(?:Until|All))/,j={children:!0,contents:!0,next:!0,prev:!0};function A(e,t){while((e=e[t])&&1!==e.nodeType);return e}ce.fn.extend({has:function(e){var t=ce(e,this),n=t.length;return this.filter(function(){for(var e=0;e<n;e++)if(ce.contains(this,t[e]))return!0})},closest:function(e,t){var n,r=0,i=this.length,o=[],a="string"!=typeof e&&ce(e);if(!b.test(e))for(;r<i;r++)for(n=this[r];n&&n!==t;n=n.parentNode)if(n.nodeType<11&&(a?-1<a.index(n):1===n.nodeType&&ce.find.matchesSelector(n,e))){o.push(n);break}return this.pushStack(1<o.length?ce.uniqueSort(o):o)},index:function(e){return e?"string"==typeof e?se.call(ce(e),this[0]):se.call(this,e.jquery?e[0]:e):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(e,t){return this.pushStack(ce.uniqueSort(ce.merge(this.get(),ce(e,t))))},addBack:function(e){return this.add(null==e?this.prevObject:this.prevObject.filter(e))}}),ce.each({parent:function(e){var t=e.parentNode;return t&&11!==t.nodeType?t:null},parents:function(e){return d(e,"parentNode")},parentsUntil:function(e,t,n){return d(e,"parentNode",n)},next:function(e){return A(e,"nextSibling")},prev:function(e){return A(e,"previousSibling")},nextAll:function(e){return d(e,"nextSibling")},prevAll:function(e){return d(e,"previousSibling")},nextUntil:function(e,t,n){return d(e,"nextSibling",n)},prevUntil:function(e,t,n){return d(e,"previousSibling",n)},siblings:function(e){return h((e.parentNode||{}).firstChild,e)},children:function(e){return h(e.firstChild)},contents:function(e){return null!=e.contentDocument&&r(e.contentDocument)?e.contentDocument:(fe(e,"template")&&(e=e.content||e),ce.merge([],e.childNodes))}},function(r,i){ce.fn[r]=function(e,t){var n=ce.map(this,i,e);return"Until"!==r.slice(-5)&&(t=e),t&&"string"==typeof t&&(n=ce.filter(t,n)),1<this.length&&(j[r]||ce.uniqueSort(n),E.test(r)&&n.reverse()),this.pushStack(n)}});var D=/[^\x20\t\r\n\f]+/g;function N(e){return e}function q(e){throw e}function L(e,t,n,r){var i;try{e&&v(i=e.promise)?i.call(e).done(t).fail(n):e&&v(i=e.then)?i.call(e,t,n):t.apply(void 0,[e].slice(r))}catch(e){n.apply(void 0,[e])}}ce.Callbacks=function(r){var e,n;r="string"==typeof r?(e=r,n={},ce.each(e.match(D)||[],function(e,t){n[t]=!0}),n):ce.extend({},r);var i,t,o,a,s=[],u=[],l=-1,c=function(){for(a=a||r.once,o=i=!0;u.length;l=-1){t=u.shift();while(++l<s.length)!1===s[l].apply(t[0],t[1])&&r.stopOnFalse&&(l=s.length,t=!1)}r.memory||(t=!1),i=!1,a&&(s=t?[]:"")},f={add:function(){return s&&(t&&!i&&(l=s.length-1,u.push(t)),function n(e){ce.each(e,function(e,t){v(t)?r.unique&&f.has(t)||s.push(t):t&&t.length&&"string"!==x(t)&&n(t)})}(arguments),t&&!i&&c()),this},remove:function(){return ce.each(arguments,function(e,t){var n;while(-1<(n=ce.inArray(t,s,n)))s.splice(n,1),n<=l&&l--}),this},has:function(e){return e?-1<ce.inArray(e,s):0<s.length},empty:function(){return s&&(s=[]),this},disable:function(){return a=u=[],s=t="",this},disabled:function(){return!s},lock:function(){return a=u=[],t||i||(s=t=""),this},locked:function(){return!!a},fireWith:function(e,t){return a||(t=[e,(t=t||[]).slice?t.slice():t],u.push(t),i||c()),this},fire:function(){return f.fireWith(this,arguments),this},fired:function(){return!!o}};return f},ce.extend({Deferred:function(e){var o=[["notify","progress",ce.Callbacks("memory"),ce.Callbacks("memory"),2],["resolve","done",ce.Callbacks("once memory"),ce.Callbacks("once memory"),0,"resolved"],["reject","fail",ce.Callbacks("once memory"),ce.Callbacks("once memory"),1,"rejected"]],i="pending",a={state:function(){return i},always:function(){return s.done(arguments).fail(arguments),this},"catch":function(e){return a.then(null,e)},pipe:function(){var i=arguments;return ce.Deferred(function(r){ce.each(o,function(e,t){var n=v(i[t[4]])&&i[t[4]];s[t[1]](function(){var e=n&&n.apply(this,arguments);e&&v(e.promise)?e.promise().progress(r.notify).done(r.resolve).fail(r.reject):r[t[0]+"With"](this,n?[e]:arguments)})}),i=null}).promise()},then:function(t,n,r){var u=0;function l(i,o,a,s){return function(){var n=this,r=arguments,e=function(){var e,t;if(!(i<u)){if((e=a.apply(n,r))===o.promise())throw new TypeError("Thenable self-resolution");t=e&&("object"==typeof e||"function"==typeof e)&&e.then,v(t)?s?t.call(e,l(u,o,N,s),l(u,o,q,s)):(u++,t.call(e,l(u,o,N,s),l(u,o,q,s),l(u,o,N,o.notifyWith))):(a!==N&&(n=void 0,r=[e]),(s||o.resolveWith)(n,r))}},t=s?e:function(){try{e()}catch(e){ce.Deferred.exceptionHook&&ce.Deferred.exceptionHook(e,t.error),u<=i+1&&(a!==q&&(n=void 0,r=[e]),o.rejectWith(n,r))}};i?t():(ce.Deferred.getErrorHook?t.error=ce.Deferred.getErrorHook():ce.Deferred.getStackHook&&(t.error=ce.Deferred.getStackHook()),ie.setTimeout(t))}}return ce.Deferred(function(e){o[0][3].add(l(0,e,v(r)?r:N,e.notifyWith)),o[1][3].add(l(0,e,v(t)?t:N)),o[2][3].add(l(0,e,v(n)?n:q))}).promise()},promise:function(e){return null!=e?ce.extend(e,a):a}},s={};return ce.each(o,function(e,t){var n=t[2],r=t[5];a[t[1]]=n.add,r&&n.add(function(){i=r},o[3-e][2].disable,o[3-e][3].disable,o[0][2].lock,o[0][3].lock),n.add(t[3].fire),s[t[0]]=function(){return s[t[0]+"With"](this===s?void 0:this,arguments),this},s[t[0]+"With"]=n.fireWith}),a.promise(s),e&&e.call(s,s),s},when:function(e){var n=arguments.length,t=n,r=Array(t),i=ae.call(arguments),o=ce.Deferred(),a=function(t){return function(e){r[t]=this,i[t]=1<arguments.length?ae.call(arguments):e,--n||o.resolveWith(r,i)}};if(n<=1&&(L(e,o.done(a(t)).resolve,o.reject,!n),"pending"===o.state()||v(i[t]&&i[t].then)))return o.then();while(t--)L(i[t],a(t),o.reject);return o.promise()}});var H=/^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;ce.Deferred.exceptionHook=function(e,t){ie.console&&ie.console.warn&&e&&H.test(e.name)&&ie.console.warn("jQuery.Deferred exception: "+e.message,e.stack,t)},ce.readyException=function(e){ie.setTimeout(function(){throw e})};var O=ce.Deferred();function P(){C.removeEventListener("DOMContentLoaded",P),ie.removeEventListener("load",P),ce.ready()}ce.fn.ready=function(e){return O.then(e)["catch"](function(e){ce.readyException(e)}),this},ce.extend({isReady:!1,readyWait:1,ready:function(e){(!0===e?--ce.readyWait:ce.isReady)||(ce.isReady=!0)!==e&&0<--ce.readyWait||O.resolveWith(C,[ce])}}),ce.ready.then=O.then,"complete"===C.readyState||"loading"!==C.readyState&&!C.documentElement.doScroll?ie.setTimeout(ce.ready):(C.addEventListener("DOMContentLoaded",P),ie.addEventListener("load",P));var M=function(e,t,n,r,i,o,a){var s=0,u=e.length,l=null==n;if("object"===x(n))for(s in i=!0,n)M(e,t,s,n[s],!0,o,a);else if(void 0!==r&&(i=!0,v(r)||(a=!0),l&&(a?(t.call(e,r),t=null):(l=t,t=function(e,t,n){return l.call(ce(e),n)})),t))for(;s<u;s++)t(e[s],n,a?r:r.call(e[s],s,t(e[s],n)));return i?e:l?t.call(e):u?t(e[0],n):o},R=/^-ms-/,I=/-([a-z])/g;function W(e,t){return t.toUpperCase()}function F(e){return e.replace(R,"ms-").replace(I,W)}var $=function(e){return 1===e.nodeType||9===e.nodeType||!+e.nodeType};function B(){this.expando=ce.expando+B.uid++}B.uid=1,B.prototype={cache:function(e){var t=e[this.expando];return t||(t={},$(e)&&(e.nodeType?e[this.expando]=t:Object.defineProperty(e,this.expando,{value:t,configurable:!0}))),t},set:function(e,t,n){var r,i=this.cache(e);if("string"==typeof t)i[F(t)]=n;else for(r in t)i[F(r)]=t[r];return i},get:function(e,t){return void 0===t?this.cache(e):e[this.expando]&&e[this.expando][F(t)]},access:function(e,t,n){return void 0===t||t&&"string"==typeof t&&void 0===n?this.get(e,t):(this.set(e,t,n),void 0!==n?n:t)},remove:function(e,t){var n,r=e[this.expando];if(void 0!==r){if(void 0!==t){n=(t=Array.isArray(t)?t.map(F):(t=F(t))in r?[t]:t.match(D)||[]).length;while(n--)delete r[t[n]]}(void 0===t||ce.isEmptyObject(r))&&(e.nodeType?e[this.expando]=void 0:delete e[this.expando])}},hasData:function(e){var t=e[this.expando];return void 0!==t&&!ce.isEmptyObject(t)}};var _=new B,z=new B,X=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,U=/[A-Z]/g;function V(e,t,n){var r,i;if(void 0===n&&1===e.nodeType)if(r="data-"+t.replace(U,"-$&").toLowerCase(),"string"==typeof(n=e.getAttribute(r))){try{n="true"===(i=n)||"false"!==i&&("null"===i?null:i===+i+""?+i:X.test(i)?JSON.parse(i):i)}catch(e){}z.set(e,t,n)}else n=void 0;return n}ce.extend({hasData:function(e){return z.hasData(e)||_.hasData(e)},data:function(e,t,n){return z.access(e,t,n)},removeData:function(e,t){z.remove(e,t)},_data:function(e,t,n){return _.access(e,t,n)},_removeData:function(e,t){_.remove(e,t)}}),ce.fn.extend({data:function(n,e){var t,r,i,o=this[0],a=o&&o.attributes;if(void 0===n){if(this.length&&(i=z.get(o),1===o.nodeType&&!_.get(o,"hasDataAttrs"))){t=a.length;while(t--)a[t]&&0===(r=a[t].name).indexOf("data-")&&(r=F(r.slice(5)),V(o,r,i[r]));_.set(o,"hasDataAttrs",!0)}return i}return"object"==typeof n?this.each(function(){z.set(this,n)}):M(this,function(e){var t;if(o&&void 0===e)return void 0!==(t=z.get(o,n))?t:void 0!==(t=V(o,n))?t:void 0;this.each(function(){z.set(this,n,e)})},null,e,1<arguments.length,null,!0)},removeData:function(e){return this.each(function(){z.remove(this,e)})}}),ce.extend({queue:function(e,t,n){var r;if(e)return t=(t||"fx")+"queue",r=_.get(e,t),n&&(!r||Array.isArray(n)?r=_.access(e,t,ce.makeArray(n)):r.push(n)),r||[]},dequeue:function(e,t){t=t||"fx";var n=ce.queue(e,t),r=n.length,i=n.shift(),o=ce._queueHooks(e,t);"inprogress"===i&&(i=n.shift(),r--),i&&("fx"===t&&n.unshift("inprogress"),delete o.stop,i.call(e,function(){ce.dequeue(e,t)},o)),!r&&o&&o.empty.fire()},_queueHooks:function(e,t){var n=t+"queueHooks";return _.get(e,n)||_.access(e,n,{empty:ce.Callbacks("once memory").add(function(){_.remove(e,[t+"queue",n])})})}}),ce.fn.extend({queue:function(t,n){var e=2;return"string"!=typeof t&&(n=t,t="fx",e--),arguments.length<e?ce.queue(this[0],t):void 0===n?this:this.each(function(){var e=ce.queue(this,t,n);ce._queueHooks(this,t),"fx"===t&&"inprogress"!==e[0]&&ce.dequeue(this,t)})},dequeue:function(e){return this.each(function(){ce.dequeue(this,e)})},clearQueue:function(e){return this.queue(e||"fx",[])},promise:function(e,t){var n,r=1,i=ce.Deferred(),o=this,a=this.length,s=function(){--r||i.resolveWith(o,[o])};"string"!=typeof e&&(t=e,e=void 0),e=e||"fx";while(a--)(n=_.get(o[a],e+"queueHooks"))&&n.empty&&(r++,n.empty.add(s));return s(),i.promise(t)}});var G=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,Y=new RegExp("^(?:([+-])=|)("+G+")([a-z%]*)$","i"),Q=["Top","Right","Bottom","Left"],J=C.documentElement,K=function(e){return ce.contains(e.ownerDocument,e)},Z={composed:!0};J.getRootNode&&(K=function(e){return ce.contains(e.ownerDocument,e)||e.getRootNode(Z)===e.ownerDocument});var ee=function(e,t){return"none"===(e=t||e).style.display||""===e.style.display&&K(e)&&"none"===ce.css(e,"display")};function te(e,t,n,r){var i,o,a=20,s=r?function(){return r.cur()}:function(){return ce.css(e,t,"")},u=s(),l=n&&n[3]||(ce.cssNumber[t]?"":"px"),c=e.nodeType&&(ce.cssNumber[t]||"px"!==l&&+u)&&Y.exec(ce.css(e,t));if(c&&c[3]!==l){u/=2,l=l||c[3],c=+u||1;while(a--)ce.style(e,t,c+l),(1-o)*(1-(o=s()/u||.5))<=0&&(a=0),c/=o;c*=2,ce.style(e,t,c+l),n=n||[]}return n&&(c=+c||+u||0,i=n[1]?c+(n[1]+1)*n[2]:+n[2],r&&(r.unit=l,r.start=c,r.end=i)),i}var ne={};function re(e,t){for(var n,r,i,o,a,s,u,l=[],c=0,f=e.length;c<f;c++)(r=e[c]).style&&(n=r.style.display,t?("none"===n&&(l[c]=_.get(r,"display")||null,l[c]||(r.style.display="")),""===r.style.display&&ee(r)&&(l[c]=(u=a=o=void 0,a=(i=r).ownerDocument,s=i.nodeName,(u=ne[s])||(o=a.body.appendChild(a.createElement(s)),u=ce.css(o,"display"),o.parentNode.removeChild(o),"none"===u&&(u="block"),ne[s]=u)))):"none"!==n&&(l[c]="none",_.set(r,"display",n)));for(c=0;c<f;c++)null!=l[c]&&(e[c].style.display=l[c]);return e}ce.fn.extend({show:function(){return re(this,!0)},hide:function(){return re(this)},toggle:function(e){return"boolean"==typeof e?e?this.show():this.hide():this.each(function(){ee(this)?ce(this).show():ce(this).hide()})}});var xe,be,we=/^(?:checkbox|radio)$/i,Te=/<([a-z][^\/\0>\x20\t\r\n\f]*)/i,Ce=/^$|^module$|\/(?:java|ecma)script/i;xe=C.createDocumentFragment().appendChild(C.createElement("div")),(be=C.createElement("input")).setAttribute("type","radio"),be.setAttribute("checked","checked"),be.setAttribute("name","t"),xe.appendChild(be),le.checkClone=xe.cloneNode(!0).cloneNode(!0).lastChild.checked,xe.innerHTML="<textarea>x</textarea>",le.noCloneChecked=!!xe.cloneNode(!0).lastChild.defaultValue,xe.innerHTML="<option></option>",le.option=!!xe.lastChild;var ke={thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};function Se(e,t){var n;return n="undefined"!=typeof e.getElementsByTagName?e.getElementsByTagName(t||"*"):"undefined"!=typeof e.querySelectorAll?e.querySelectorAll(t||"*"):[],void 0===t||t&&fe(e,t)?ce.merge([e],n):n}function Ee(e,t){for(var n=0,r=e.length;n<r;n++)_.set(e[n],"globalEval",!t||_.get(t[n],"globalEval"))}ke.tbody=ke.tfoot=ke.colgroup=ke.caption=ke.thead,ke.th=ke.td,le.option||(ke.optgroup=ke.option=[1,"<select multiple='multiple'>","</select>"]);var je=/<|&#?\w+;/;function Ae(e,t,n,r,i){for(var o,a,s,u,l,c,f=t.createDocumentFragment(),p=[],d=0,h=e.length;d<h;d++)if((o=e[d])||0===o)if("object"===x(o))ce.merge(p,o.nodeType?[o]:o);else if(je.test(o)){a=a||f.appendChild(t.createElement("div")),s=(Te.exec(o)||["",""])[1].toLowerCase(),u=ke[s]||ke._default,a.innerHTML=u[1]+ce.htmlPrefilter(o)+u[2],c=u[0];while(c--)a=a.lastChild;ce.merge(p,a.childNodes),(a=f.firstChild).textContent=""}else p.push(t.createTextNode(o));f.textContent="",d=0;while(o=p[d++])if(r&&-1<ce.inArray(o,r))i&&i.push(o);else if(l=K(o),a=Se(f.appendChild(o),"script"),l&&Ee(a),n){c=0;while(o=a[c++])Ce.test(o.type||"")&&n.push(o)}return f}var De=/^([^.]*)(?:\.(.+)|)/;function Ne(){return!0}function qe(){return!1}function Le(e,t,n,r,i,o){var a,s;if("object"==typeof t){for(s in"string"!=typeof n&&(r=r||n,n=void 0),t)Le(e,s,n,r,t[s],o);return e}if(null==r&&null==i?(i=n,r=n=void 0):null==i&&("string"==typeof n?(i=r,r=void 0):(i=r,r=n,n=void 0)),!1===i)i=qe;else if(!i)return e;return 1===o&&(a=i,(i=function(e){return ce().off(e),a.apply(this,arguments)}).guid=a.guid||(a.guid=ce.guid++)),e.each(function(){ce.event.add(this,t,i,r,n)})}function He(e,r,t){t?(_.set(e,r,!1),ce.event.add(e,r,{namespace:!1,handler:function(e){var t,n=_.get(this,r);if(1&e.isTrigger&&this[r]){if(n)(ce.event.special[r]||{}).delegateType&&e.stopPropagation();else if(n=ae.call(arguments),_.set(this,r,n),this[r](),t=_.get(this,r),_.set(this,r,!1),n!==t)return e.stopImmediatePropagation(),e.preventDefault(),t}else n&&(_.set(this,r,ce.event.trigger(n[0],n.slice(1),this)),e.stopPropagation(),e.isImmediatePropagationStopped=Ne)}})):void 0===_.get(e,r)&&ce.event.add(e,r,Ne)}ce.event={global:{},add:function(t,e,n,r,i){var o,a,s,u,l,c,f,p,d,h,g,v=_.get(t);if($(t)){n.handler&&(n=(o=n).handler,i=o.selector),i&&ce.find.matchesSelector(J,i),n.guid||(n.guid=ce.guid++),(u=v.events)||(u=v.events=Object.create(null)),(a=v.handle)||(a=v.handle=function(e){return"undefined"!=typeof ce&&ce.event.triggered!==e.type?ce.event.dispatch.apply(t,arguments):void 0}),l=(e=(e||"").match(D)||[""]).length;while(l--)d=g=(s=De.exec(e[l])||[])[1],h=(s[2]||"").split(".").sort(),d&&(f=ce.event.special[d]||{},d=(i?f.delegateType:f.bindType)||d,f=ce.event.special[d]||{},c=ce.extend({type:d,origType:g,data:r,handler:n,guid:n.guid,selector:i,needsContext:i&&ce.expr.match.needsContext.test(i),namespace:h.join(".")},o),(p=u[d])||((p=u[d]=[]).delegateCount=0,f.setup&&!1!==f.setup.call(t,r,h,a)||t.addEventListener&&t.addEventListener(d,a)),f.add&&(f.add.call(t,c),c.handler.guid||(c.handler.guid=n.guid)),i?p.splice(p.delegateCount++,0,c):p.push(c),ce.event.global[d]=!0)}},remove:function(e,t,n,r,i){var o,a,s,u,l,c,f,p,d,h,g,v=_.hasData(e)&&_.get(e);if(v&&(u=v.events)){l=(t=(t||"").match(D)||[""]).length;while(l--)if(d=g=(s=De.exec(t[l])||[])[1],h=(s[2]||"").split(".").sort(),d){f=ce.event.special[d]||{},p=u[d=(r?f.delegateType:f.bindType)||d]||[],s=s[2]&&new RegExp("(^|\\.)"+h.join("\\.(?:.*\\.|)")+"(\\.|$)"),a=o=p.length;while(o--)c=p[o],!i&&g!==c.origType||n&&n.guid!==c.guid||s&&!s.test(c.namespace)||r&&r!==c.selector&&("**"!==r||!c.selector)||(p.splice(o,1),c.selector&&p.delegateCount--,f.remove&&f.remove.call(e,c));a&&!p.length&&(f.teardown&&!1!==f.teardown.call(e,h,v.handle)||ce.removeEvent(e,d,v.handle),delete u[d])}else for(d in u)ce.event.remove(e,d+t[l],n,r,!0);ce.isEmptyObject(u)&&_.remove(e,"handle events")}},dispatch:function(e){var t,n,r,i,o,a,s=new Array(arguments.length),u=ce.event.fix(e),l=(_.get(this,"events")||Object.create(null))[u.type]||[],c=ce.event.special[u.type]||{};for(s[0]=u,t=1;t<arguments.length;t++)s[t]=arguments[t];if(u.delegateTarget=this,!c.preDispatch||!1!==c.preDispatch.call(this,u)){a=ce.event.handlers.call(this,u,l),t=0;while((i=a[t++])&&!u.isPropagationStopped()){u.currentTarget=i.elem,n=0;while((o=i.handlers[n++])&&!u.isImmediatePropagationStopped())u.rnamespace&&!1!==o.namespace&&!u.rnamespace.test(o.namespace)||(u.handleObj=o,u.data=o.data,void 0!==(r=((ce.event.special[o.origType]||{}).handle||o.handler).apply(i.elem,s))&&!1===(u.result=r)&&(u.preventDefault(),u.stopPropagation()))}return c.postDispatch&&c.postDispatch.call(this,u),u.result}},handlers:function(e,t){var n,r,i,o,a,s=[],u=t.delegateCount,l=e.target;if(u&&l.nodeType&&!("click"===e.type&&1<=e.button))for(;l!==this;l=l.parentNode||this)if(1===l.nodeType&&("click"!==e.type||!0!==l.disabled)){for(o=[],a={},n=0;n<u;n++)void 0===a[i=(r=t[n]).selector+" "]&&(a[i]=r.needsContext?-1<ce(i,this).index(l):ce.find(i,this,null,[l]).length),a[i]&&o.push(r);o.length&&s.push({elem:l,handlers:o})}return l=this,u<t.length&&s.push({elem:l,handlers:t.slice(u)}),s},addProp:function(t,e){Object.defineProperty(ce.Event.prototype,t,{enumerable:!0,configurable:!0,get:v(e)?function(){if(this.originalEvent)return e(this.originalEvent)}:function(){if(this.originalEvent)return this.originalEvent[t]},set:function(e){Object.defineProperty(this,t,{enumerable:!0,configurable:!0,writable:!0,value:e})}})},fix:function(e){return e[ce.expando]?e:new ce.Event(e)},special:{load:{noBubble:!0},click:{setup:function(e){var t=this||e;return we.test(t.type)&&t.click&&fe(t,"input")&&He(t,"click",!0),!1},trigger:function(e){var t=this||e;return we.test(t.type)&&t.click&&fe(t,"input")&&He(t,"click"),!0},_default:function(e){var t=e.target;return we.test(t.type)&&t.click&&fe(t,"input")&&_.get(t,"click")||fe(t,"a")}},beforeunload:{postDispatch:function(e){void 0!==e.result&&e.originalEvent&&(e.originalEvent.returnValue=e.result)}}}},ce.removeEvent=function(e,t,n){e.removeEventListener&&e.removeEventListener(t,n)},ce.Event=function(e,t){if(!(this instanceof ce.Event))return new ce.Event(e,t);e&&e.type?(this.originalEvent=e,this.type=e.type,this.isDefaultPrevented=e.defaultPrevented||void 0===e.defaultPrevented&&!1===e.returnValue?Ne:qe,this.target=e.target&&3===e.target.nodeType?e.target.parentNode:e.target,this.currentTarget=e.currentTarget,this.relatedTarget=e.relatedTarget):this.type=e,t&&ce.extend(this,t),this.timeStamp=e&&e.timeStamp||Date.now(),this[ce.expando]=!0},ce.Event.prototype={constructor:ce.Event,isDefaultPrevented:qe,isPropagationStopped:qe,isImmediatePropagationStopped:qe,isSimulated:!1,preventDefault:function(){var e=this.originalEvent;this.isDefaultPrevented=Ne,e&&!this.isSimulated&&e.preventDefault()},stopPropagation:function(){var e=this.originalEvent;this.isPropagationStopped=Ne,e&&!this.isSimulated&&e.stopPropagation()},stopImmediatePropagation:function(){var e=this.originalEvent;this.isImmediatePropagationStopped=Ne,e&&!this.isSimulated&&e.stopImmediatePropagation(),this.stopPropagation()}},ce.each({altKey:!0,bubbles:!0,cancelable:!0,changedTouches:!0,ctrlKey:!0,detail:!0,eventPhase:!0,metaKey:!0,pageX:!0,pageY:!0,shiftKey:!0,view:!0,"char":!0,code:!0,charCode:!0,key:!0,keyCode:!0,button:!0,buttons:!0,clientX:!0,clientY:!0,offsetX:!0,offsetY:!0,pointerId:!0,pointerType:!0,screenX:!0,screenY:!0,targetTouches:!0,toElement:!0,touches:!0,which:!0},ce.event.addProp),ce.each({focus:"focusin",blur:"focusout"},function(r,i){function o(e){if(C.documentMode){var t=_.get(this,"handle"),n=ce.event.fix(e);n.type="focusin"===e.type?"focus":"blur",n.isSimulated=!0,t(e),n.target===n.currentTarget&&t(n)}else ce.event.simulate(i,e.target,ce.event.fix(e))}ce.event.special[r]={setup:function(){var e;if(He(this,r,!0),!C.documentMode)return!1;(e=_.get(this,i))||this.addEventListener(i,o),_.set(this,i,(e||0)+1)},trigger:function(){return He(this,r),!0},teardown:function(){var e;if(!C.documentMode)return!1;(e=_.get(this,i)-1)?_.set(this,i,e):(this.removeEventListener(i,o),_.remove(this,i))},_default:function(e){return _.get(e.target,r)},delegateType:i},ce.event.special[i]={setup:function(){var e=this.ownerDocument||this.document||this,t=C.documentMode?this:e,n=_.get(t,i);n||(C.documentMode?this.addEventListener(i,o):e.addEventListener(r,o,!0)),_.set(t,i,(n||0)+1)},teardown:function(){var e=this.ownerDocument||this.document||this,t=C.documentMode?this:e,n=_.get(t,i)-1;n?_.set(t,i,n):(C.documentMode?this.removeEventListener(i,o):e.removeEventListener(r,o,!0),_.remove(t,i))}}}),ce.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(e,i){ce.event.special[e]={delegateType:i,bindType:i,handle:function(e){var t,n=e.relatedTarget,r=e.handleObj;return n&&(n===this||ce.contains(this,n))||(e.type=r.origType,t=r.handler.apply(this,arguments),e.type=i),t}}}),ce.fn.extend({on:function(e,t,n,r){return Le(this,e,t,n,r)},one:function(e,t,n,r){return Le(this,e,t,n,r,1)},off:function(e,t,n){var r,i;if(e&&e.preventDefault&&e.handleObj)return r=e.handleObj,ce(e.delegateTarget).off(r.namespace?r.origType+"."+r.namespace:r.origType,r.selector,r.handler),this;if("object"==typeof e){for(i in e)this.off(i,t,e[i]);return this}return!1!==t&&"function"!=typeof t||(n=t,t=void 0),!1===n&&(n=qe),this.each(function(){ce.event.remove(this,e,n,t)})}});var Oe=/<script|<style|<link/i,Pe=/checked\s*(?:[^=]|=\s*.checked.)/i,Me=/^\s*<!\[CDATA\[|\]\]>\s*$/g;function Re(e,t){return fe(e,"table")&&fe(11!==t.nodeType?t:t.firstChild,"tr")&&ce(e).children("tbody")[0]||e}function Ie(e){return e.type=(null!==e.getAttribute("type"))+"/"+e.type,e}function We(e){return"true/"===(e.type||"").slice(0,5)?e.type=e.type.slice(5):e.removeAttribute("type"),e}function Fe(e,t){var n,r,i,o,a,s;if(1===t.nodeType){if(_.hasData(e)&&(s=_.get(e).events))for(i in _.remove(t,"handle events"),s)for(n=0,r=s[i].length;n<r;n++)ce.event.add(t,i,s[i][n]);z.hasData(e)&&(o=z.access(e),a=ce.extend({},o),z.set(t,a))}}function $e(n,r,i,o){r=g(r);var e,t,a,s,u,l,c=0,f=n.length,p=f-1,d=r[0],h=v(d);if(h||1<f&&"string"==typeof d&&!le.checkClone&&Pe.test(d))return n.each(function(e){var t=n.eq(e);h&&(r[0]=d.call(this,e,t.html())),$e(t,r,i,o)});if(f&&(t=(e=Ae(r,n[0].ownerDocument,!1,n,o)).firstChild,1===e.childNodes.length&&(e=t),t||o)){for(s=(a=ce.map(Se(e,"script"),Ie)).length;c<f;c++)u=e,c!==p&&(u=ce.clone(u,!0,!0),s&&ce.merge(a,Se(u,"script"))),i.call(n[c],u,c);if(s)for(l=a[a.length-1].ownerDocument,ce.map(a,We),c=0;c<s;c++)u=a[c],Ce.test(u.type||"")&&!_.access(u,"globalEval")&&ce.contains(l,u)&&(u.src&&"module"!==(u.type||"").toLowerCase()?ce._evalUrl&&!u.noModule&&ce._evalUrl(u.src,{nonce:u.nonce||u.getAttribute("nonce")},l):m(u.textContent.replace(Me,""),u,l))}return n}function Be(e,t,n){for(var r,i=t?ce.filter(t,e):e,o=0;null!=(r=i[o]);o++)n||1!==r.nodeType||ce.cleanData(Se(r)),r.parentNode&&(n&&K(r)&&Ee(Se(r,"script")),r.parentNode.removeChild(r));return e}ce.extend({htmlPrefilter:function(e){return e},clone:function(e,t,n){var r,i,o,a,s,u,l,c=e.cloneNode(!0),f=K(e);if(!(le.noCloneChecked||1!==e.nodeType&&11!==e.nodeType||ce.isXMLDoc(e)))for(a=Se(c),r=0,i=(o=Se(e)).length;r<i;r++)s=o[r],u=a[r],void 0,"input"===(l=u.nodeName.toLowerCase())&&we.test(s.type)?u.checked=s.checked:"input"!==l&&"textarea"!==l||(u.defaultValue=s.defaultValue);if(t)if(n)for(o=o||Se(e),a=a||Se(c),r=0,i=o.length;r<i;r++)Fe(o[r],a[r]);else Fe(e,c);return 0<(a=Se(c,"script")).length&&Ee(a,!f&&Se(e,"script")),c},cleanData:function(e){for(var t,n,r,i=ce.event.special,o=0;void 0!==(n=e[o]);o++)if($(n)){if(t=n[_.expando]){if(t.events)for(r in t.events)i[r]?ce.event.remove(n,r):ce.removeEvent(n,r,t.handle);n[_.expando]=void 0}n[z.expando]&&(n[z.expando]=void 0)}}}),ce.fn.extend({detach:function(e){return Be(this,e,!0)},remove:function(e){return Be(this,e)},text:function(e){return M(this,function(e){return void 0===e?ce.text(this):this.empty().each(function(){1!==this.nodeType&&11!==this.nodeType&&9!==this.nodeType||(this.textContent=e)})},null,e,arguments.length)},append:function(){return $e(this,arguments,function(e){1!==this.nodeType&&11!==this.nodeType&&9!==this.nodeType||Re(this,e).appendChild(e)})},prepend:function(){return $e(this,arguments,function(e){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var t=Re(this,e);t.insertBefore(e,t.firstChild)}})},before:function(){return $e(this,arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this)})},after:function(){return $e(this,arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this.nextSibling)})},empty:function(){for(var e,t=0;null!=(e=this[t]);t++)1===e.nodeType&&(ce.cleanData(Se(e,!1)),e.textContent="");return this},clone:function(e,t){return e=null!=e&&e,t=null==t?e:t,this.map(function(){return ce.clone(this,e,t)})},html:function(e){return M(this,function(e){var t=this[0]||{},n=0,r=this.length;if(void 0===e&&1===t.nodeType)return t.innerHTML;if("string"==typeof e&&!Oe.test(e)&&!ke[(Te.exec(e)||["",""])[1].toLowerCase()]){e=ce.htmlPrefilter(e);try{for(;n<r;n++)1===(t=this[n]||{}).nodeType&&(ce.cleanData(Se(t,!1)),t.innerHTML=e);t=0}catch(e){}}t&&this.empty().append(e)},null,e,arguments.length)},replaceWith:function(){var n=[];return $e(this,arguments,function(e){var t=this.parentNode;ce.inArray(this,n)<0&&(ce.cleanData(Se(this)),t&&t.replaceChild(e,this))},n)}}),ce.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(e,a){ce.fn[e]=function(e){for(var t,n=[],r=ce(e),i=r.length-1,o=0;o<=i;o++)t=o===i?this:this.clone(!0),ce(r[o])[a](t),s.apply(n,t.get());return this.pushStack(n)}});var _e=new RegExp("^("+G+")(?!px)[a-z%]+$","i"),ze=/^--/,Xe=function(e){var t=e.ownerDocument.defaultView;return t&&t.opener||(t=ie),t.getComputedStyle(e)},Ue=function(e,t,n){var r,i,o={};for(i in t)o[i]=e.style[i],e.style[i]=t[i];for(i in r=n.call(e),t)e.style[i]=o[i];return r},Ve=new RegExp(Q.join("|"),"i");function Ge(e,t,n){var r,i,o,a,s=ze.test(t),u=e.style;return(n=n||Xe(e))&&(a=n.getPropertyValue(t)||n[t],s&&a&&(a=a.replace(ve,"$1")||void 0),""!==a||K(e)||(a=ce.style(e,t)),!le.pixelBoxStyles()&&_e.test(a)&&Ve.test(t)&&(r=u.width,i=u.minWidth,o=u.maxWidth,u.minWidth=u.maxWidth=u.width=a,a=n.width,u.width=r,u.minWidth=i,u.maxWidth=o)),void 0!==a?a+"":a}function Ye(e,t){return{get:function(){if(!e())return(this.get=t).apply(this,arguments);delete this.get}}}!function(){function e(){if(l){u.style.cssText="position:absolute;left:-11111px;width:60px;margin-top:1px;padding:0;border:0",l.style.cssText="position:relative;display:block;box-sizing:border-box;overflow:scroll;margin:auto;border:1px;padding:1px;width:60%;top:1%",J.appendChild(u).appendChild(l);var e=ie.getComputedStyle(l);n="1%"!==e.top,s=12===t(e.marginLeft),l.style.right="60%",o=36===t(e.right),r=36===t(e.width),l.style.position="absolute",i=12===t(l.offsetWidth/3),J.removeChild(u),l=null}}function t(e){return Math.round(parseFloat(e))}var n,r,i,o,a,s,u=C.createElement("div"),l=C.createElement("div");l.style&&(l.style.backgroundClip="content-box",l.cloneNode(!0).style.backgroundClip="",le.clearCloneStyle="content-box"===l.style.backgroundClip,ce.extend(le,{boxSizingReliable:function(){return e(),r},pixelBoxStyles:function(){return e(),o},pixelPosition:function(){return e(),n},reliableMarginLeft:function(){return e(),s},scrollboxSize:function(){return e(),i},reliableTrDimensions:function(){var e,t,n,r;return null==a&&(e=C.createElement("table"),t=C.createElement("tr"),n=C.createElement("div"),e.style.cssText="position:absolute;left:-11111px;border-collapse:separate",t.style.cssText="box-sizing:content-box;border:1px solid",t.style.height="1px",n.style.height="9px",n.style.display="block",J.appendChild(e).appendChild(t).appendChild(n),r=ie.getComputedStyle(t),a=parseInt(r.height,10)+parseInt(r.borderTopWidth,10)+parseInt(r.borderBottomWidth,10)===t.offsetHeight,J.removeChild(e)),a}}))}();var Qe=["Webkit","Moz","ms"],Je=C.createElement("div").style,Ke={};function Ze(e){var t=ce.cssProps[e]||Ke[e];return t||(e in Je?e:Ke[e]=function(e){var t=e[0].toUpperCase()+e.slice(1),n=Qe.length;while(n--)if((e=Qe[n]+t)in Je)return e}(e)||e)}var et=/^(none|table(?!-c[ea]).+)/,tt={position:"absolute",visibility:"hidden",display:"block"},nt={letterSpacing:"0",fontWeight:"400"};function rt(e,t,n){var r=Y.exec(t);return r?Math.max(0,r[2]-(n||0))+(r[3]||"px"):t}function it(e,t,n,r,i,o){var a="width"===t?1:0,s=0,u=0,l=0;if(n===(r?"border":"content"))return 0;for(;a<4;a+=2)"margin"===n&&(l+=ce.css(e,n+Q[a],!0,i)),r?("content"===n&&(u-=ce.css(e,"padding"+Q[a],!0,i)),"margin"!==n&&(u-=ce.css(e,"border"+Q[a]+"Width",!0,i))):(u+=ce.css(e,"padding"+Q[a],!0,i),"padding"!==n?u+=ce.css(e,"border"+Q[a]+"Width",!0,i):s+=ce.css(e,"border"+Q[a]+"Width",!0,i));return!r&&0<=o&&(u+=Math.max(0,Math.ceil(e["offset"+t[0].toUpperCase()+t.slice(1)]-o-u-s-.5))||0),u+l}function ot(e,t,n){var r=Xe(e),i=(!le.boxSizingReliable()||n)&&"border-box"===ce.css(e,"boxSizing",!1,r),o=i,a=Ge(e,t,r),s="offset"+t[0].toUpperCase()+t.slice(1);if(_e.test(a)){if(!n)return a;a="auto"}return(!le.boxSizingReliable()&&i||!le.reliableTrDimensions()&&fe(e,"tr")||"auto"===a||!parseFloat(a)&&"inline"===ce.css(e,"display",!1,r))&&e.getClientRects().length&&(i="border-box"===ce.css(e,"boxSizing",!1,r),(o=s in e)&&(a=e[s])),(a=parseFloat(a)||0)+it(e,t,n||(i?"border":"content"),o,r,a)+"px"}function at(e,t,n,r,i){return new at.prototype.init(e,t,n,r,i)}ce.extend({cssHooks:{opacity:{get:function(e,t){if(t){var n=Ge(e,"opacity");return""===n?"1":n}}}},cssNumber:{animationIterationCount:!0,aspectRatio:!0,borderImageSlice:!0,columnCount:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,gridArea:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnStart:!0,gridRow:!0,gridRowEnd:!0,gridRowStart:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,scale:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeMiterlimit:!0,strokeOpacity:!0},cssProps:{},style:function(e,t,n,r){if(e&&3!==e.nodeType&&8!==e.nodeType&&e.style){var i,o,a,s=F(t),u=ze.test(t),l=e.style;if(u||(t=Ze(s)),a=ce.cssHooks[t]||ce.cssHooks[s],void 0===n)return a&&"get"in a&&void 0!==(i=a.get(e,!1,r))?i:l[t];"string"===(o=typeof n)&&(i=Y.exec(n))&&i[1]&&(n=te(e,t,i),o="number"),null!=n&&n==n&&("number"!==o||u||(n+=i&&i[3]||(ce.cssNumber[s]?"":"px")),le.clearCloneStyle||""!==n||0!==t.indexOf("background")||(l[t]="inherit"),a&&"set"in a&&void 0===(n=a.set(e,n,r))||(u?l.setProperty(t,n):l[t]=n))}},css:function(e,t,n,r){var i,o,a,s=F(t);return ze.test(t)||(t=Ze(s)),(a=ce.cssHooks[t]||ce.cssHooks[s])&&"get"in a&&(i=a.get(e,!0,n)),void 0===i&&(i=Ge(e,t,r)),"normal"===i&&t in nt&&(i=nt[t]),""===n||n?(o=parseFloat(i),!0===n||isFinite(o)?o||0:i):i}}),ce.each(["height","width"],function(e,u){ce.cssHooks[u]={get:function(e,t,n){if(t)return!et.test(ce.css(e,"display"))||e.getClientRects().length&&e.getBoundingClientRect().width?ot(e,u,n):Ue(e,tt,function(){return ot(e,u,n)})},set:function(e,t,n){var r,i=Xe(e),o=!le.scrollboxSize()&&"absolute"===i.position,a=(o||n)&&"border-box"===ce.css(e,"boxSizing",!1,i),s=n?it(e,u,n,a,i):0;return a&&o&&(s-=Math.ceil(e["offset"+u[0].toUpperCase()+u.slice(1)]-parseFloat(i[u])-it(e,u,"border",!1,i)-.5)),s&&(r=Y.exec(t))&&"px"!==(r[3]||"px")&&(e.style[u]=t,t=ce.css(e,u)),rt(0,t,s)}}}),ce.cssHooks.marginLeft=Ye(le.reliableMarginLeft,function(e,t){if(t)return(parseFloat(Ge(e,"marginLeft"))||e.getBoundingClientRect().left-Ue(e,{marginLeft:0},function(){return e.getBoundingClientRect().left}))+"px"}),ce.each({margin:"",padding:"",border:"Width"},function(i,o){ce.cssHooks[i+o]={expand:function(e){for(var t=0,n={},r="string"==typeof e?e.split(" "):[e];t<4;t++)n[i+Q[t]+o]=r[t]||r[t-2]||r[0];return n}},"margin"!==i&&(ce.cssHooks[i+o].set=rt)}),ce.fn.extend({css:function(e,t){return M(this,function(e,t,n){var r,i,o={},a=0;if(Array.isArray(t)){for(r=Xe(e),i=t.length;a<i;a++)o[t[a]]=ce.css(e,t[a],!1,r);return o}return void 0!==n?ce.style(e,t,n):ce.css(e,t)},e,t,1<arguments.length)}}),((ce.Tween=at).prototype={constructor:at,init:function(e,t,n,r,i,o){this.elem=e,this.prop=n,this.easing=i||ce.easing._default,this.options=t,this.start=this.now=this.cur(),this.end=r,this.unit=o||(ce.cssNumber[n]?"":"px")},cur:function(){var e=at.propHooks[this.prop];return e&&e.get?e.get(this):at.propHooks._default.get(this)},run:function(e){var t,n=at.propHooks[this.prop];return this.options.duration?this.pos=t=ce.easing[this.easing](e,this.options.duration*e,0,1,this.options.duration):this.pos=t=e,this.now=(this.end-this.start)*t+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),n&&n.set?n.set(this):at.propHooks._default.set(this),this}}).init.prototype=at.prototype,(at.propHooks={_default:{get:function(e){var t;return 1!==e.elem.nodeType||null!=e.elem[e.prop]&&null==e.elem.style[e.prop]?e.elem[e.prop]:(t=ce.css(e.elem,e.prop,""))&&"auto"!==t?t:0},set:function(e){ce.fx.step[e.prop]?ce.fx.step[e.prop](e):1!==e.elem.nodeType||!ce.cssHooks[e.prop]&&null==e.elem.style[Ze(e.prop)]?e.elem[e.prop]=e.now:ce.style(e.elem,e.prop,e.now+e.unit)}}}).scrollTop=at.propHooks.scrollLeft={set:function(e){e.elem.nodeType&&e.elem.parentNode&&(e.elem[e.prop]=e.now)}},ce.easing={linear:function(e){return e},swing:function(e){return.5-Math.cos(e*Math.PI)/2},_default:"swing"},ce.fx=at.prototype.init,ce.fx.step={};var st,ut,lt,ct,ft=/^(?:toggle|show|hide)$/,pt=/queueHooks$/;function dt(){ut&&(!1===C.hidden&&ie.requestAnimationFrame?ie.requestAnimationFrame(dt):ie.setTimeout(dt,ce.fx.interval),ce.fx.tick())}function ht(){return ie.setTimeout(function(){st=void 0}),st=Date.now()}function gt(e,t){var n,r=0,i={height:e};for(t=t?1:0;r<4;r+=2-t)i["margin"+(n=Q[r])]=i["padding"+n]=e;return t&&(i.opacity=i.width=e),i}function vt(e,t,n){for(var r,i=(yt.tweeners[t]||[]).concat(yt.tweeners["*"]),o=0,a=i.length;o<a;o++)if(r=i[o].call(n,t,e))return r}function yt(o,e,t){var n,a,r=0,i=yt.prefilters.length,s=ce.Deferred().always(function(){delete u.elem}),u=function(){if(a)return!1;for(var e=st||ht(),t=Math.max(0,l.startTime+l.duration-e),n=1-(t/l.duration||0),r=0,i=l.tweens.length;r<i;r++)l.tweens[r].run(n);return s.notifyWith(o,[l,n,t]),n<1&&i?t:(i||s.notifyWith(o,[l,1,0]),s.resolveWith(o,[l]),!1)},l=s.promise({elem:o,props:ce.extend({},e),opts:ce.extend(!0,{specialEasing:{},easing:ce.easing._default},t),originalProperties:e,originalOptions:t,startTime:st||ht(),duration:t.duration,tweens:[],createTween:function(e,t){var n=ce.Tween(o,l.opts,e,t,l.opts.specialEasing[e]||l.opts.easing);return l.tweens.push(n),n},stop:function(e){var t=0,n=e?l.tweens.length:0;if(a)return this;for(a=!0;t<n;t++)l.tweens[t].run(1);return e?(s.notifyWith(o,[l,1,0]),s.resolveWith(o,[l,e])):s.rejectWith(o,[l,e]),this}}),c=l.props;for(!function(e,t){var n,r,i,o,a;for(n in e)if(i=t[r=F(n)],o=e[n],Array.isArray(o)&&(i=o[1],o=e[n]=o[0]),n!==r&&(e[r]=o,delete e[n]),(a=ce.cssHooks[r])&&"expand"in a)for(n in o=a.expand(o),delete e[r],o)n in e||(e[n]=o[n],t[n]=i);else t[r]=i}(c,l.opts.specialEasing);r<i;r++)if(n=yt.prefilters[r].call(l,o,c,l.opts))return v(n.stop)&&(ce._queueHooks(l.elem,l.opts.queue).stop=n.stop.bind(n)),n;return ce.map(c,vt,l),v(l.opts.start)&&l.opts.start.call(o,l),l.progress(l.opts.progress).done(l.opts.done,l.opts.complete).fail(l.opts.fail).always(l.opts.always),ce.fx.timer(ce.extend(u,{elem:o,anim:l,queue:l.opts.queue})),l}ce.Animation=ce.extend(yt,{tweeners:{"*":[function(e,t){var n=this.createTween(e,t);return te(n.elem,e,Y.exec(t),n),n}]},tweener:function(e,t){v(e)?(t=e,e=["*"]):e=e.match(D);for(var n,r=0,i=e.length;r<i;r++)n=e[r],yt.tweeners[n]=yt.tweeners[n]||[],yt.tweeners[n].unshift(t)},prefilters:[function(e,t,n){var r,i,o,a,s,u,l,c,f="width"in t||"height"in t,p=this,d={},h=e.style,g=e.nodeType&&ee(e),v=_.get(e,"fxshow");for(r in n.queue||(null==(a=ce._queueHooks(e,"fx")).unqueued&&(a.unqueued=0,s=a.empty.fire,a.empty.fire=function(){a.unqueued||s()}),a.unqueued++,p.always(function(){p.always(function(){a.unqueued--,ce.queue(e,"fx").length||a.empty.fire()})})),t)if(i=t[r],ft.test(i)){if(delete t[r],o=o||"toggle"===i,i===(g?"hide":"show")){if("show"!==i||!v||void 0===v[r])continue;g=!0}d[r]=v&&v[r]||ce.style(e,r)}if((u=!ce.isEmptyObject(t))||!ce.isEmptyObject(d))for(r in f&&1===e.nodeType&&(n.overflow=[h.overflow,h.overflowX,h.overflowY],null==(l=v&&v.display)&&(l=_.get(e,"display")),"none"===(c=ce.css(e,"display"))&&(l?c=l:(re([e],!0),l=e.style.display||l,c=ce.css(e,"display"),re([e]))),("inline"===c||"inline-block"===c&&null!=l)&&"none"===ce.css(e,"float")&&(u||(p.done(function(){h.display=l}),null==l&&(c=h.display,l="none"===c?"":c)),h.display="inline-block")),n.overflow&&(h.overflow="hidden",p.always(function(){h.overflow=n.overflow[0],h.overflowX=n.overflow[1],h.overflowY=n.overflow[2]})),u=!1,d)u||(v?"hidden"in v&&(g=v.hidden):v=_.access(e,"fxshow",{display:l}),o&&(v.hidden=!g),g&&re([e],!0),p.done(function(){for(r in g||re([e]),_.remove(e,"fxshow"),d)ce.style(e,r,d[r])})),u=vt(g?v[r]:0,r,p),r in v||(v[r]=u.start,g&&(u.end=u.start,u.start=0))}],prefilter:function(e,t){t?yt.prefilters.unshift(e):yt.prefilters.push(e)}}),ce.speed=function(e,t,n){var r=e&&"object"==typeof e?ce.extend({},e):{complete:n||!n&&t||v(e)&&e,duration:e,easing:n&&t||t&&!v(t)&&t};return ce.fx.off?r.duration=0:"number"!=typeof r.duration&&(r.duration in ce.fx.speeds?r.duration=ce.fx.speeds[r.duration]:r.duration=ce.fx.speeds._default),null!=r.queue&&!0!==r.queue||(r.queue="fx"),r.old=r.complete,r.complete=function(){v(r.old)&&r.old.call(this),r.queue&&ce.dequeue(this,r.queue)},r},ce.fn.extend({fadeTo:function(e,t,n,r){return this.filter(ee).css("opacity",0).show().end().animate({opacity:t},e,n,r)},animate:function(t,e,n,r){var i=ce.isEmptyObject(t),o=ce.speed(e,n,r),a=function(){var e=yt(this,ce.extend({},t),o);(i||_.get(this,"finish"))&&e.stop(!0)};return a.finish=a,i||!1===o.queue?this.each(a):this.queue(o.queue,a)},stop:function(i,e,o){var a=function(e){var t=e.stop;delete e.stop,t(o)};return"string"!=typeof i&&(o=e,e=i,i=void 0),e&&this.queue(i||"fx",[]),this.each(function(){var e=!0,t=null!=i&&i+"queueHooks",n=ce.timers,r=_.get(this);if(t)r[t]&&r[t].stop&&a(r[t]);else for(t in r)r[t]&&r[t].stop&&pt.test(t)&&a(r[t]);for(t=n.length;t--;)n[t].elem!==this||null!=i&&n[t].queue!==i||(n[t].anim.stop(o),e=!1,n.splice(t,1));!e&&o||ce.dequeue(this,i)})},finish:function(a){return!1!==a&&(a=a||"fx"),this.each(function(){var e,t=_.get(this),n=t[a+"queue"],r=t[a+"queueHooks"],i=ce.timers,o=n?n.length:0;for(t.finish=!0,ce.queue(this,a,[]),r&&r.stop&&r.stop.call(this,!0),e=i.length;e--;)i[e].elem===this&&i[e].queue===a&&(i[e].anim.stop(!0),i.splice(e,1));for(e=0;e<o;e++)n[e]&&n[e].finish&&n[e].finish.call(this);delete t.finish})}}),ce.each(["toggle","show","hide"],function(e,r){var i=ce.fn[r];ce.fn[r]=function(e,t,n){return null==e||"boolean"==typeof e?i.apply(this,arguments):this.animate(gt(r,!0),e,t,n)}}),ce.each({slideDown:gt("show"),slideUp:gt("hide"),slideToggle:gt("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(e,r){ce.fn[e]=function(e,t,n){return this.animate(r,e,t,n)}}),ce.timers=[],ce.fx.tick=function(){var e,t=0,n=ce.timers;for(st=Date.now();t<n.length;t++)(e=n[t])()||n[t]!==e||n.splice(t--,1);n.length||ce.fx.stop(),st=void 0},ce.fx.timer=function(e){ce.timers.push(e),ce.fx.start()},ce.fx.interval=13,ce.fx.start=function(){ut||(ut=!0,dt())},ce.fx.stop=function(){ut=null},ce.fx.speeds={slow:600,fast:200,_default:400},ce.fn.delay=function(r,e){return r=ce.fx&&ce.fx.speeds[r]||r,e=e||"fx",this.queue(e,function(e,t){var n=ie.setTimeout(e,r);t.stop=function(){ie.clearTimeout(n)}})},lt=C.createElement("input"),ct=C.createElement("select").appendChild(C.createElement("option")),lt.type="checkbox",le.checkOn=""!==lt.value,le.optSelected=ct.selected,(lt=C.createElement("input")).value="t",lt.type="radio",le.radioValue="t"===lt.value;var mt,xt=ce.expr.attrHandle;ce.fn.extend({attr:function(e,t){return M(this,ce.attr,e,t,1<arguments.length)},removeAttr:function(e){return this.each(function(){ce.removeAttr(this,e)})}}),ce.extend({attr:function(e,t,n){var r,i,o=e.nodeType;if(3!==o&&8!==o&&2!==o)return"undefined"==typeof e.getAttribute?ce.prop(e,t,n):(1===o&&ce.isXMLDoc(e)||(i=ce.attrHooks[t.toLowerCase()]||(ce.expr.match.bool.test(t)?mt:void 0)),void 0!==n?null===n?void ce.removeAttr(e,t):i&&"set"in i&&void 0!==(r=i.set(e,n,t))?r:(e.setAttribute(t,n+""),n):i&&"get"in i&&null!==(r=i.get(e,t))?r:null==(r=ce.find.attr(e,t))?void 0:r)},attrHooks:{type:{set:function(e,t){if(!le.radioValue&&"radio"===t&&fe(e,"input")){var n=e.value;return e.setAttribute("type",t),n&&(e.value=n),t}}}},removeAttr:function(e,t){var n,r=0,i=t&&t.match(D);if(i&&1===e.nodeType)while(n=i[r++])e.removeAttribute(n)}}),mt={set:function(e,t,n){return!1===t?ce.removeAttr(e,n):e.setAttribute(n,n),n}},ce.each(ce.expr.match.bool.source.match(/\w+/g),function(e,t){var a=xt[t]||ce.find.attr;xt[t]=function(e,t,n){var r,i,o=t.toLowerCase();return n||(i=xt[o],xt[o]=r,r=null!=a(e,t,n)?o:null,xt[o]=i),r}});var bt=/^(?:input|select|textarea|button)$/i,wt=/^(?:a|area)$/i;function Tt(e){return(e.match(D)||[]).join(" ")}function Ct(e){return e.getAttribute&&e.getAttribute("class")||""}function kt(e){return Array.isArray(e)?e:"string"==typeof e&&e.match(D)||[]}ce.fn.extend({prop:function(e,t){return M(this,ce.prop,e,t,1<arguments.length)},removeProp:function(e){return this.each(function(){delete this[ce.propFix[e]||e]})}}),ce.extend({prop:function(e,t,n){var r,i,o=e.nodeType;if(3!==o&&8!==o&&2!==o)return 1===o&&ce.isXMLDoc(e)||(t=ce.propFix[t]||t,i=ce.propHooks[t]),void 0!==n?i&&"set"in i&&void 0!==(r=i.set(e,n,t))?r:e[t]=n:i&&"get"in i&&null!==(r=i.get(e,t))?r:e[t]},propHooks:{tabIndex:{get:function(e){var t=ce.find.attr(e,"tabindex");return t?parseInt(t,10):bt.test(e.nodeName)||wt.test(e.nodeName)&&e.href?0:-1}}},propFix:{"for":"htmlFor","class":"className"}}),le.optSelected||(ce.propHooks.selected={get:function(e){var t=e.parentNode;return t&&t.parentNode&&t.parentNode.selectedIndex,null},set:function(e){var t=e.parentNode;t&&(t.selectedIndex,t.parentNode&&t.parentNode.selectedIndex)}}),ce.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){ce.propFix[this.toLowerCase()]=this}),ce.fn.extend({addClass:function(t){var e,n,r,i,o,a;return v(t)?this.each(function(e){ce(this).addClass(t.call(this,e,Ct(this)))}):(e=kt(t)).length?this.each(function(){if(r=Ct(this),n=1===this.nodeType&&" "+Tt(r)+" "){for(o=0;o<e.length;o++)i=e[o],n.indexOf(" "+i+" ")<0&&(n+=i+" ");a=Tt(n),r!==a&&this.setAttribute("class",a)}}):this},removeClass:function(t){var e,n,r,i,o,a;return v(t)?this.each(function(e){ce(this).removeClass(t.call(this,e,Ct(this)))}):arguments.length?(e=kt(t)).length?this.each(function(){if(r=Ct(this),n=1===this.nodeType&&" "+Tt(r)+" "){for(o=0;o<e.length;o++){i=e[o];while(-1<n.indexOf(" "+i+" "))n=n.replace(" "+i+" "," ")}a=Tt(n),r!==a&&this.setAttribute("class",a)}}):this:this.attr("class","")},toggleClass:function(t,n){var e,r,i,o,a=typeof t,s="string"===a||Array.isArray(t);return v(t)?this.each(function(e){ce(this).toggleClass(t.call(this,e,Ct(this),n),n)}):"boolean"==typeof n&&s?n?this.addClass(t):this.removeClass(t):(e=kt(t),this.each(function(){if(s)for(o=ce(this),i=0;i<e.length;i++)r=e[i],o.hasClass(r)?o.removeClass(r):o.addClass(r);else void 0!==t&&"boolean"!==a||((r=Ct(this))&&_.set(this,"__className__",r),this.setAttribute&&this.setAttribute("class",r||!1===t?"":_.get(this,"__className__")||""))}))},hasClass:function(e){var t,n,r=0;t=" "+e+" ";while(n=this[r++])if(1===n.nodeType&&-1<(" "+Tt(Ct(n))+" ").indexOf(t))return!0;return!1}});var St=/\r/g;ce.fn.extend({val:function(n){var r,e,i,t=this[0];return arguments.length?(i=v(n),this.each(function(e){var t;1===this.nodeType&&(null==(t=i?n.call(this,e,ce(this).val()):n)?t="":"number"==typeof t?t+="":Array.isArray(t)&&(t=ce.map(t,function(e){return null==e?"":e+""})),(r=ce.valHooks[this.type]||ce.valHooks[this.nodeName.toLowerCase()])&&"set"in r&&void 0!==r.set(this,t,"value")||(this.value=t))})):t?(r=ce.valHooks[t.type]||ce.valHooks[t.nodeName.toLowerCase()])&&"get"in r&&void 0!==(e=r.get(t,"value"))?e:"string"==typeof(e=t.value)?e.replace(St,""):null==e?"":e:void 0}}),ce.extend({valHooks:{option:{get:function(e){var t=ce.find.attr(e,"value");return null!=t?t:Tt(ce.text(e))}},select:{get:function(e){var t,n,r,i=e.options,o=e.selectedIndex,a="select-one"===e.type,s=a?null:[],u=a?o+1:i.length;for(r=o<0?u:a?o:0;r<u;r++)if(((n=i[r]).selected||r===o)&&!n.disabled&&(!n.parentNode.disabled||!fe(n.parentNode,"optgroup"))){if(t=ce(n).val(),a)return t;s.push(t)}return s},set:function(e,t){var n,r,i=e.options,o=ce.makeArray(t),a=i.length;while(a--)((r=i[a]).selected=-1<ce.inArray(ce.valHooks.option.get(r),o))&&(n=!0);return n||(e.selectedIndex=-1),o}}}}),ce.each(["radio","checkbox"],function(){ce.valHooks[this]={set:function(e,t){if(Array.isArray(t))return e.checked=-1<ce.inArray(ce(e).val(),t)}},le.checkOn||(ce.valHooks[this].get=function(e){return null===e.getAttribute("value")?"on":e.value})});var Et=ie.location,jt={guid:Date.now()},At=/\?/;ce.parseXML=function(e){var t,n;if(!e||"string"!=typeof e)return null;try{t=(new ie.DOMParser).parseFromString(e,"text/xml")}catch(e){}return n=t&&t.getElementsByTagName("parsererror")[0],t&&!n||ce.error("Invalid XML: "+(n?ce.map(n.childNodes,function(e){return e.textContent}).join("\n"):e)),t};var Dt=/^(?:focusinfocus|focusoutblur)$/,Nt=function(e){e.stopPropagation()};ce.extend(ce.event,{trigger:function(e,t,n,r){var i,o,a,s,u,l,c,f,p=[n||C],d=ue.call(e,"type")?e.type:e,h=ue.call(e,"namespace")?e.namespace.split("."):[];if(o=f=a=n=n||C,3!==n.nodeType&&8!==n.nodeType&&!Dt.test(d+ce.event.triggered)&&(-1<d.indexOf(".")&&(d=(h=d.split(".")).shift(),h.sort()),u=d.indexOf(":")<0&&"on"+d,(e=e[ce.expando]?e:new ce.Event(d,"object"==typeof e&&e)).isTrigger=r?2:3,e.namespace=h.join("."),e.rnamespace=e.namespace?new RegExp("(^|\\.)"+h.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,e.result=void 0,e.target||(e.target=n),t=null==t?[e]:ce.makeArray(t,[e]),c=ce.event.special[d]||{},r||!c.trigger||!1!==c.trigger.apply(n,t))){if(!r&&!c.noBubble&&!y(n)){for(s=c.delegateType||d,Dt.test(s+d)||(o=o.parentNode);o;o=o.parentNode)p.push(o),a=o;a===(n.ownerDocument||C)&&p.push(a.defaultView||a.parentWindow||ie)}i=0;while((o=p[i++])&&!e.isPropagationStopped())f=o,e.type=1<i?s:c.bindType||d,(l=(_.get(o,"events")||Object.create(null))[e.type]&&_.get(o,"handle"))&&l.apply(o,t),(l=u&&o[u])&&l.apply&&$(o)&&(e.result=l.apply(o,t),!1===e.result&&e.preventDefault());return e.type=d,r||e.isDefaultPrevented()||c._default&&!1!==c._default.apply(p.pop(),t)||!$(n)||u&&v(n[d])&&!y(n)&&((a=n[u])&&(n[u]=null),ce.event.triggered=d,e.isPropagationStopped()&&f.addEventListener(d,Nt),n[d](),e.isPropagationStopped()&&f.removeEventListener(d,Nt),ce.event.triggered=void 0,a&&(n[u]=a)),e.result}},simulate:function(e,t,n){var r=ce.extend(new ce.Event,n,{type:e,isSimulated:!0});ce.event.trigger(r,null,t)}}),ce.fn.extend({trigger:function(e,t){return this.each(function(){ce.event.trigger(e,t,this)})},triggerHandler:function(e,t){var n=this[0];if(n)return ce.event.trigger(e,t,n,!0)}});var qt=/\[\]$/,Lt=/\r?\n/g,Ht=/^(?:submit|button|image|reset|file)$/i,Ot=/^(?:input|select|textarea|keygen)/i;function Pt(n,e,r,i){var t;if(Array.isArray(e))ce.each(e,function(e,t){r||qt.test(n)?i(n,t):Pt(n+"["+("object"==typeof t&&null!=t?e:"")+"]",t,r,i)});else if(r||"object"!==x(e))i(n,e);else for(t in e)Pt(n+"["+t+"]",e[t],r,i)}ce.param=function(e,t){var n,r=[],i=function(e,t){var n=v(t)?t():t;r[r.length]=encodeURIComponent(e)+"="+encodeURIComponent(null==n?"":n)};if(null==e)return"";if(Array.isArray(e)||e.jquery&&!ce.isPlainObject(e))ce.each(e,function(){i(this.name,this.value)});else for(n in e)Pt(n,e[n],t,i);return r.join("&")},ce.fn.extend({serialize:function(){return ce.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var e=ce.prop(this,"elements");return e?ce.makeArray(e):this}).filter(function(){var e=this.type;return this.name&&!ce(this).is(":disabled")&&Ot.test(this.nodeName)&&!Ht.test(e)&&(this.checked||!we.test(e))}).map(function(e,t){var n=ce(this).val();return null==n?null:Array.isArray(n)?ce.map(n,function(e){return{name:t.name,value:e.replace(Lt,"\r\n")}}):{name:t.name,value:n.replace(Lt,"\r\n")}}).get()}});var Mt=/%20/g,Rt=/#.*$/,It=/([?&])_=[^&]*/,Wt=/^(.*?):[ \t]*([^\r\n]*)$/gm,Ft=/^(?:GET|HEAD)$/,$t=/^\/\//,Bt={},_t={},zt="*/".concat("*"),Xt=C.createElement("a");function Ut(o){return function(e,t){"string"!=typeof e&&(t=e,e="*");var n,r=0,i=e.toLowerCase().match(D)||[];if(v(t))while(n=i[r++])"+"===n[0]?(n=n.slice(1)||"*",(o[n]=o[n]||[]).unshift(t)):(o[n]=o[n]||[]).push(t)}}function Vt(t,i,o,a){var s={},u=t===_t;function l(e){var r;return s[e]=!0,ce.each(t[e]||[],function(e,t){var n=t(i,o,a);return"string"!=typeof n||u||s[n]?u?!(r=n):void 0:(i.dataTypes.unshift(n),l(n),!1)}),r}return l(i.dataTypes[0])||!s["*"]&&l("*")}function Gt(e,t){var n,r,i=ce.ajaxSettings.flatOptions||{};for(n in t)void 0!==t[n]&&((i[n]?e:r||(r={}))[n]=t[n]);return r&&ce.extend(!0,e,r),e}Xt.href=Et.href,ce.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:Et.href,type:"GET",isLocal:/^(?:about|app|app-storage|.+-extension|file|res|widget):$/.test(Et.protocol),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":zt,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/\bxml\b/,html:/\bhtml/,json:/\bjson\b/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":JSON.parse,"text xml":ce.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(e,t){return t?Gt(Gt(e,ce.ajaxSettings),t):Gt(ce.ajaxSettings,e)},ajaxPrefilter:Ut(Bt),ajaxTransport:Ut(_t),ajax:function(e,t){"object"==typeof e&&(t=e,e=void 0),t=t||{};var c,f,p,n,d,r,h,g,i,o,v=ce.ajaxSetup({},t),y=v.context||v,m=v.context&&(y.nodeType||y.jquery)?ce(y):ce.event,x=ce.Deferred(),b=ce.Callbacks("once memory"),w=v.statusCode||{},a={},s={},u="canceled",T={readyState:0,getResponseHeader:function(e){var t;if(h){if(!n){n={};while(t=Wt.exec(p))n[t[1].toLowerCase()+" "]=(n[t[1].toLowerCase()+" "]||[]).concat(t[2])}t=n[e.toLowerCase()+" "]}return null==t?null:t.join(", ")},getAllResponseHeaders:function(){return h?p:null},setRequestHeader:function(e,t){return null==h&&(e=s[e.toLowerCase()]=s[e.toLowerCase()]||e,a[e]=t),this},overrideMimeType:function(e){return null==h&&(v.mimeType=e),this},statusCode:function(e){var t;if(e)if(h)T.always(e[T.status]);else for(t in e)w[t]=[w[t],e[t]];return this},abort:function(e){var t=e||u;return c&&c.abort(t),l(0,t),this}};if(x.promise(T),v.url=((e||v.url||Et.href)+"").replace($t,Et.protocol+"//"),v.type=t.method||t.type||v.method||v.type,v.dataTypes=(v.dataType||"*").toLowerCase().match(D)||[""],null==v.crossDomain){r=C.createElement("a");try{r.href=v.url,r.href=r.href,v.crossDomain=Xt.protocol+"//"+Xt.host!=r.protocol+"//"+r.host}catch(e){v.crossDomain=!0}}if(v.data&&v.processData&&"string"!=typeof v.data&&(v.data=ce.param(v.data,v.traditional)),Vt(Bt,v,t,T),h)return T;for(i in(g=ce.event&&v.global)&&0==ce.active++&&ce.event.trigger("ajaxStart"),v.type=v.type.toUpperCase(),v.hasContent=!Ft.test(v.type),f=v.url.replace(Rt,""),v.hasContent?v.data&&v.processData&&0===(v.contentType||"").indexOf("application/x-www-form-urlencoded")&&(v.data=v.data.replace(Mt,"+")):(o=v.url.slice(f.length),v.data&&(v.processData||"string"==typeof v.data)&&(f+=(At.test(f)?"&":"?")+v.data,delete v.data),!1===v.cache&&(f=f.replace(It,"$1"),o=(At.test(f)?"&":"?")+"_="+jt.guid+++o),v.url=f+o),v.ifModified&&(ce.lastModified[f]&&T.setRequestHeader("If-Modified-Since",ce.lastModified[f]),ce.etag[f]&&T.setRequestHeader("If-None-Match",ce.etag[f])),(v.data&&v.hasContent&&!1!==v.contentType||t.contentType)&&T.setRequestHeader("Content-Type",v.contentType),T.setRequestHeader("Accept",v.dataTypes[0]&&v.accepts[v.dataTypes[0]]?v.accepts[v.dataTypes[0]]+("*"!==v.dataTypes[0]?", "+zt+"; q=0.01":""):v.accepts["*"]),v.headers)T.setRequestHeader(i,v.headers[i]);if(v.beforeSend&&(!1===v.beforeSend.call(y,T,v)||h))return T.abort();if(u="abort",b.add(v.complete),T.done(v.success),T.fail(v.error),c=Vt(_t,v,t,T)){if(T.readyState=1,g&&m.trigger("ajaxSend",[T,v]),h)return T;v.async&&0<v.timeout&&(d=ie.setTimeout(function(){T.abort("timeout")},v.timeout));try{h=!1,c.send(a,l)}catch(e){if(h)throw e;l(-1,e)}}else l(-1,"No Transport");function l(e,t,n,r){var i,o,a,s,u,l=t;h||(h=!0,d&&ie.clearTimeout(d),c=void 0,p=r||"",T.readyState=0<e?4:0,i=200<=e&&e<300||304===e,n&&(s=function(e,t,n){var r,i,o,a,s=e.contents,u=e.dataTypes;while("*"===u[0])u.shift(),void 0===r&&(r=e.mimeType||t.getResponseHeader("Content-Type"));if(r)for(i in s)if(s[i]&&s[i].test(r)){u.unshift(i);break}if(u[0]in n)o=u[0];else{for(i in n){if(!u[0]||e.converters[i+" "+u[0]]){o=i;break}a||(a=i)}o=o||a}if(o)return o!==u[0]&&u.unshift(o),n[o]}(v,T,n)),!i&&-1<ce.inArray("script",v.dataTypes)&&ce.inArray("json",v.dataTypes)<0&&(v.converters["text script"]=function(){}),s=function(e,t,n,r){var i,o,a,s,u,l={},c=e.dataTypes.slice();if(c[1])for(a in e.converters)l[a.toLowerCase()]=e.converters[a];o=c.shift();while(o)if(e.responseFields[o]&&(n[e.responseFields[o]]=t),!u&&r&&e.dataFilter&&(t=e.dataFilter(t,e.dataType)),u=o,o=c.shift())if("*"===o)o=u;else if("*"!==u&&u!==o){if(!(a=l[u+" "+o]||l["* "+o]))for(i in l)if((s=i.split(" "))[1]===o&&(a=l[u+" "+s[0]]||l["* "+s[0]])){!0===a?a=l[i]:!0!==l[i]&&(o=s[0],c.unshift(s[1]));break}if(!0!==a)if(a&&e["throws"])t=a(t);else try{t=a(t)}catch(e){return{state:"parsererror",error:a?e:"No conversion from "+u+" to "+o}}}return{state:"success",data:t}}(v,s,T,i),i?(v.ifModified&&((u=T.getResponseHeader("Last-Modified"))&&(ce.lastModified[f]=u),(u=T.getResponseHeader("etag"))&&(ce.etag[f]=u)),204===e||"HEAD"===v.type?l="nocontent":304===e?l="notmodified":(l=s.state,o=s.data,i=!(a=s.error))):(a=l,!e&&l||(l="error",e<0&&(e=0))),T.status=e,T.statusText=(t||l)+"",i?x.resolveWith(y,[o,l,T]):x.rejectWith(y,[T,l,a]),T.statusCode(w),w=void 0,g&&m.trigger(i?"ajaxSuccess":"ajaxError",[T,v,i?o:a]),b.fireWith(y,[T,l]),g&&(m.trigger("ajaxComplete",[T,v]),--ce.active||ce.event.trigger("ajaxStop")))}return T},getJSON:function(e,t,n){return ce.get(e,t,n,"json")},getScript:function(e,t){return ce.get(e,void 0,t,"script")}}),ce.each(["get","post"],function(e,i){ce[i]=function(e,t,n,r){return v(t)&&(r=r||n,n=t,t=void 0),ce.ajax(ce.extend({url:e,type:i,dataType:r,data:t,success:n},ce.isPlainObject(e)&&e))}}),ce.ajaxPrefilter(function(e){var t;for(t in e.headers)"content-type"===t.toLowerCase()&&(e.contentType=e.headers[t]||"")}),ce._evalUrl=function(e,t,n){return ce.ajax({url:e,type:"GET",dataType:"script",cache:!0,async:!1,global:!1,converters:{"text script":function(){}},dataFilter:function(e){ce.globalEval(e,t,n)}})},ce.fn.extend({wrapAll:function(e){var t;return this[0]&&(v(e)&&(e=e.call(this[0])),t=ce(e,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&t.insertBefore(this[0]),t.map(function(){var e=this;while(e.firstElementChild)e=e.firstElementChild;return e}).append(this)),this},wrapInner:function(n){return v(n)?this.each(function(e){ce(this).wrapInner(n.call(this,e))}):this.each(function(){var e=ce(this),t=e.contents();t.length?t.wrapAll(n):e.append(n)})},wrap:function(t){var n=v(t);return this.each(function(e){ce(this).wrapAll(n?t.call(this,e):t)})},unwrap:function(e){return this.parent(e).not("body").each(function(){ce(this).replaceWith(this.childNodes)}),this}}),ce.expr.pseudos.hidden=function(e){return!ce.expr.pseudos.visible(e)},ce.expr.pseudos.visible=function(e){return!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)},ce.ajaxSettings.xhr=function(){try{return new ie.XMLHttpRequest}catch(e){}};var Yt={0:200,1223:204},Qt=ce.ajaxSettings.xhr();le.cors=!!Qt&&"withCredentials"in Qt,le.ajax=Qt=!!Qt,ce.ajaxTransport(function(i){var o,a;if(le.cors||Qt&&!i.crossDomain)return{send:function(e,t){var n,r=i.xhr();if(r.open(i.type,i.url,i.async,i.username,i.password),i.xhrFields)for(n in i.xhrFields)r[n]=i.xhrFields[n];for(n in i.mimeType&&r.overrideMimeType&&r.overrideMimeType(i.mimeType),i.crossDomain||e["X-Requested-With"]||(e["X-Requested-With"]="XMLHttpRequest"),e)r.setRequestHeader(n,e[n]);o=function(e){return function(){o&&(o=a=r.onload=r.onerror=r.onabort=r.ontimeout=r.onreadystatechange=null,"abort"===e?r.abort():"error"===e?"number"!=typeof r.status?t(0,"error"):t(r.status,r.statusText):t(Yt[r.status]||r.status,r.statusText,"text"!==(r.responseType||"text")||"string"!=typeof r.responseText?{binary:r.response}:{text:r.responseText},r.getAllResponseHeaders()))}},r.onload=o(),a=r.onerror=r.ontimeout=o("error"),void 0!==r.onabort?r.onabort=a:r.onreadystatechange=function(){4===r.readyState&&ie.setTimeout(function(){o&&a()})},o=o("abort");try{r.send(i.hasContent&&i.data||null)}catch(e){if(o)throw e}},abort:function(){o&&o()}}}),ce.ajaxPrefilter(function(e){e.crossDomain&&(e.contents.script=!1)}),ce.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/\b(?:java|ecma)script\b/},converters:{"text script":function(e){return ce.globalEval(e),e}}}),ce.ajaxPrefilter("script",function(e){void 0===e.cache&&(e.cache=!1),e.crossDomain&&(e.type="GET")}),ce.ajaxTransport("script",function(n){var r,i;if(n.crossDomain||n.scriptAttrs)return{send:function(e,t){r=ce("<script>").attr(n.scriptAttrs||{}).prop({charset:n.scriptCharset,src:n.url}).on("load error",i=function(e){r.remove(),i=null,e&&t("error"===e.type?404:200,e.type)}),C.head.appendChild(r[0])},abort:function(){i&&i()}}});var Jt,Kt=[],Zt=/(=)\?(?=&|$)|\?\?/;ce.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var e=Kt.pop()||ce.expando+"_"+jt.guid++;return this[e]=!0,e}}),ce.ajaxPrefilter("json jsonp",function(e,t,n){var r,i,o,a=!1!==e.jsonp&&(Zt.test(e.url)?"url":"string"==typeof e.data&&0===(e.contentType||"").indexOf("application/x-www-form-urlencoded")&&Zt.test(e.data)&&"data");if(a||"jsonp"===e.dataTypes[0])return r=e.jsonpCallback=v(e.jsonpCallback)?e.jsonpCallback():e.jsonpCallback,a?e[a]=e[a].replace(Zt,"$1"+r):!1!==e.jsonp&&(e.url+=(At.test(e.url)?"&":"?")+e.jsonp+"="+r),e.converters["script json"]=function(){return o||ce.error(r+" was not called"),o[0]},e.dataTypes[0]="json",i=ie[r],ie[r]=function(){o=arguments},n.always(function(){void 0===i?ce(ie).removeProp(r):ie[r]=i,e[r]&&(e.jsonpCallback=t.jsonpCallback,Kt.push(r)),o&&v(i)&&i(o[0]),o=i=void 0}),"script"}),le.createHTMLDocument=((Jt=C.implementation.createHTMLDocument("").body).innerHTML="<form></form><form></form>",2===Jt.childNodes.length),ce.parseHTML=function(e,t,n){return"string"!=typeof e?[]:("boolean"==typeof t&&(n=t,t=!1),t||(le.createHTMLDocument?((r=(t=C.implementation.createHTMLDocument("")).createElement("base")).href=C.location.href,t.head.appendChild(r)):t=C),o=!n&&[],(i=w.exec(e))?[t.createElement(i[1])]:(i=Ae([e],t,o),o&&o.length&&ce(o).remove(),ce.merge([],i.childNodes)));var r,i,o},ce.fn.load=function(e,t,n){var r,i,o,a=this,s=e.indexOf(" ");return-1<s&&(r=Tt(e.slice(s)),e=e.slice(0,s)),v(t)?(n=t,t=void 0):t&&"object"==typeof t&&(i="POST"),0<a.length&&ce.ajax({url:e,type:i||"GET",dataType:"html",data:t}).done(function(e){o=arguments,a.html(r?ce("<div>").append(ce.parseHTML(e)).find(r):e)}).always(n&&function(e,t){a.each(function(){n.apply(this,o||[e.responseText,t,e])})}),this},ce.expr.pseudos.animated=function(t){return ce.grep(ce.timers,function(e){return t===e.elem}).length},ce.offset={setOffset:function(e,t,n){var r,i,o,a,s,u,l=ce.css(e,"position"),c=ce(e),f={};"static"===l&&(e.style.position="relative"),s=c.offset(),o=ce.css(e,"top"),u=ce.css(e,"left"),("absolute"===l||"fixed"===l)&&-1<(o+u).indexOf("auto")?(a=(r=c.position()).top,i=r.left):(a=parseFloat(o)||0,i=parseFloat(u)||0),v(t)&&(t=t.call(e,n,ce.extend({},s))),null!=t.top&&(f.top=t.top-s.top+a),null!=t.left&&(f.left=t.left-s.left+i),"using"in t?t.using.call(e,f):c.css(f)}},ce.fn.extend({offset:function(t){if(arguments.length)return void 0===t?this:this.each(function(e){ce.offset.setOffset(this,t,e)});var e,n,r=this[0];return r?r.getClientRects().length?(e=r.getBoundingClientRect(),n=r.ownerDocument.defaultView,{top:e.top+n.pageYOffset,left:e.left+n.pageXOffset}):{top:0,left:0}:void 0},position:function(){if(this[0]){var e,t,n,r=this[0],i={top:0,left:0};if("fixed"===ce.css(r,"position"))t=r.getBoundingClientRect();else{t=this.offset(),n=r.ownerDocument,e=r.offsetParent||n.documentElement;while(e&&(e===n.body||e===n.documentElement)&&"static"===ce.css(e,"position"))e=e.parentNode;e&&e!==r&&1===e.nodeType&&((i=ce(e).offset()).top+=ce.css(e,"borderTopWidth",!0),i.left+=ce.css(e,"borderLeftWidth",!0))}return{top:t.top-i.top-ce.css(r,"marginTop",!0),left:t.left-i.left-ce.css(r,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var e=this.offsetParent;while(e&&"static"===ce.css(e,"position"))e=e.offsetParent;return e||J})}}),ce.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(t,i){var o="pageYOffset"===i;ce.fn[t]=function(e){return M(this,function(e,t,n){var r;if(y(e)?r=e:9===e.nodeType&&(r=e.defaultView),void 0===n)return r?r[i]:e[t];r?r.scrollTo(o?r.pageXOffset:n,o?n:r.pageYOffset):e[t]=n},t,e,arguments.length)}}),ce.each(["top","left"],function(e,n){ce.cssHooks[n]=Ye(le.pixelPosition,function(e,t){if(t)return t=Ge(e,n),_e.test(t)?ce(e).position()[n]+"px":t})}),ce.each({Height:"height",Width:"width"},function(a,s){ce.each({padding:"inner"+a,content:s,"":"outer"+a},function(r,o){ce.fn[o]=function(e,t){var n=arguments.length&&(r||"boolean"!=typeof e),i=r||(!0===e||!0===t?"margin":"border");return M(this,function(e,t,n){var r;return y(e)?0===o.indexOf("outer")?e["inner"+a]:e.document.documentElement["client"+a]:9===e.nodeType?(r=e.documentElement,Math.max(e.body["scroll"+a],r["scroll"+a],e.body["offset"+a],r["offset"+a],r["client"+a])):void 0===n?ce.css(e,t,i):ce.style(e,t,n,i)},s,n?e:void 0,n)}})}),ce.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(e,t){ce.fn[t]=function(e){return this.on(t,e)}}),ce.fn.extend({bind:function(e,t,n){return this.on(e,null,t,n)},unbind:function(e,t){return this.off(e,null,t)},delegate:function(e,t,n,r){return this.on(t,e,n,r)},undelegate:function(e,t,n){return 1===arguments.length?this.off(e,"**"):this.off(t,e||"**",n)},hover:function(e,t){return this.on("mouseenter",e).on("mouseleave",t||e)}}),ce.each("blur focus focusin focusout resize scroll click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup contextmenu".split(" "),function(e,n){ce.fn[n]=function(e,t){return 0<arguments.length?this.on(n,null,e,t):this.trigger(n)}});var en=/^[\s\uFEFF\xA0]+|([^\s\uFEFF\xA0])[\s\uFEFF\xA0]+$/g;ce.proxy=function(e,t){var n,r,i;if("string"==typeof t&&(n=e[t],t=e,e=n),v(e))return r=ae.call(arguments,2),(i=function(){return e.apply(t||this,r.concat(ae.call(arguments)))}).guid=e.guid=e.guid||ce.guid++,i},ce.holdReady=function(e){e?ce.readyWait++:ce.ready(!0)},ce.isArray=Array.isArray,ce.parseJSON=JSON.parse,ce.nodeName=fe,ce.isFunction=v,ce.isWindow=y,ce.camelCase=F,ce.type=x,ce.now=Date.now,ce.isNumeric=function(e){var t=ce.type(e);return("number"===t||"string"===t)&&!isNaN(e-parseFloat(e))},ce.trim=function(e){return null==e?"":(e+"").replace(en,"$1")},"function"==typeof define&&define.amd&&define("jquery",[],function(){return ce});var tn=ie.jQuery,nn=ie.$;return ce.noConflict=function(e){return ie.$===ce&&(ie.$=nn),e&&ie.jQuery===ce&&(ie.jQuery=tn),ce},"undefined"==typeof e&&(ie.jQuery=ie.$=ce),ce});


/*
 * SteamPyTools 功能清单
 * 1. CDKey 市场新增价格预设与自定义价格区间筛选，筛选条件可持久化。
 * 2. 新增好评筛选：可按“特好以上 / 好评如潮”过滤游戏。
 * 3. 游戏卡片显示 Steam 风格好评等级（好评如潮 → 特别差评）与评价数量。
 * 4. 愿望单游戏名称高亮；已拥有游戏自动从购买列表中隐藏。
 * 5. 游戏卡片支持鼠标中键直接打开对应 Steam 商店页面。
 * 6. 菜单命令“同步Steam数据”：同步 Steam 已拥有、愿望单与订阅数据。
 * 7. 卖家 CDKey 页弹窗显示历史最低价，并自动把 CDKey 定价下调 0.1。
 * 8. 卖家在售列表显示当前在售排名、最低价提示，并新增“数量”排序按钮。
 * 9. 适配 CN / RU / US / TL / ARS 等多地区 keyHot / getOne 接口。
 * 10. 卖家列表接口本地缓存、并发去重，筛选与评分数据使用内存索引提升性能。
 */

/*global elmGetter,ajaxHooker,ajax,jQuery,GM_cookie*/
} catch (e) {
    console.error('[SteamPyTools] 依赖加载失败: jquery.js', e);
}


(function () {
    'use strict';

    // 固定引用脚本自带的 jQuery，避免站点后续覆盖全局 $ / jQuery
    const $sp = window.jQuery;
    const DEBUG = true;
    const VERSION = '2.7';

    const GM_KEY_STEAM_GAMES = 'steamGameList';
    const GM_KEY_FILTER_STATE = 'steamPriceFilterState';
    const SALE_CACHE_TTL = 12 * 60 * 60 * 1000;
    const SALE_CACHE_MAX = 200;
    const SORT_EVENT_NS = '.steamPySort';
    const GM_KEY_STEAM_RATING = 'steamReviewCache';
    const RATING_CACHE_TTL = 24 * 60 * 60 * 1000;
    const RATING_CONCURRENCY = 4;

    // 旧版 keyHot/getOne + 新版 prkGame/keyHot（新版国区 CDKey 市场）
    const KEYHOT_PATH_RE = /\/xboot\/(?:steamApp|steamGame|prkGame|(?:ru|us|tl|ars)SteamGame)\/keyHot(?:[/?]|$)/;
    const GETONE_PATH_RE = /\/xboot\/(?:steamApp|steamGame|prkGame|(?:ru|us|tl|ars)SteamGame)\/getOne(?:[/?]|$)/;

    // 用 console.log 而不是 console.debug：Chrome/夸克控制台默认会隐藏 debug 级别，导致诊断日志看不到
    function d(...args) {
        if (DEBUG) console.log('[SteamPyTools]', ...args);
    }

    const scriptHandler = (typeof GM_info !== 'undefined' && GM_info && GM_info.scriptHandler) || 'unknown';
    const scriptVersion = (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version) || VERSION;
    console.info('[SteamPyTools] ===== 脚本启动 =====');
    console.info('[SteamPyTools] 版本:', scriptVersion, '| 文件内版本:', VERSION);
    console.info('[SteamPyTools] 环境:', {
        handler: scriptHandler,
        href: location.href,
        readyState: document.readyState,
        ua: navigator.userAgent
    });
    console.info('[SteamPyTools] 依赖:', {
        jQuery: typeof jQuery,
        elmGetter: typeof elmGetter,
        ajaxHooker: typeof ajaxHooker,
        ajax: typeof ajax,
        GM_cookie: typeof GM_cookie,
        GM_xmlhttpRequest: typeof GM_xmlhttpRequest,
        GM: typeof GM
    });
    console.info('[SteamPyTools] 菜单命令注册: 同步Steam数据');
    if (typeof window.__spShowBadge === 'function') {
        window.__spShowBadge('SteamPy 主逻辑已执行 v2.3', '#388e3c');
    }

    function isScriptCat() {
        const handler = (typeof GM_info !== 'undefined' && GM_info && GM_info.scriptHandler) || '';
        return /scriptcat|script\s*cat|油猴猫/i.test(String(handler));
    }

    function notify(text) {
        GM_notification({
            title: 'SteamPyTools',
            text: text,
            timeout: 3000
        });
    }

    function readJSON(key, fallback) {
        const raw = GM_getValue(key, null);
        if (raw === null || raw === undefined || raw === '') return fallback;
        if (typeof raw !== 'string') return raw;
        try {
            return JSON.parse(raw);
        } catch (e) {
            d('读取 GM 值失败：', key, e);
            return fallback;
        }
    }

    function writeJSON(key, value) {
        GM_setValue(key, JSON.stringify(value));
    }

    function normalizeIds(value) {
        if (!Array.isArray(value)) return [];
        return [...new Set(value.map(Number).filter(n => Number.isFinite(n)))];
    }

    function toNumber(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function waitForElement(selector, root, timeout = 10000) {
        d('waitForElement 开始:', selector, 'root=', root ? 'custom' : 'document');
        let timer;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                d('waitForElement 超时:', selector);
                reject(new Error(`等待元素超时: ${selector}`));
            }, timeout);
        });
        let waitPromise;
        if (window.elmGetter && typeof elmGetter.get === 'function') {
            waitPromise = root !== undefined ? elmGetter.get(selector, root) : elmGetter.get(selector);
        } else {
            waitPromise = new Promise(resolve => {
                const searchRoot = root || document;
                const find = () => {
                    const found = searchRoot.querySelectorAll(selector);
                    if (found.length) {
                        observer.disconnect();
                        resolve(typeof $sp === 'function' ? $sp(found) : found);
                    }
                };
                const observer = new MutationObserver(find);
                observer.observe(searchRoot.nodeType === 9 ? searchRoot.documentElement : searchRoot, {
                    childList: true, subtree: true
                });
                find();
            });
        }
        return Promise.race([waitPromise, timeoutPromise]).then(result => {
            d('waitForElement 成功:', selector, '命中数=', result && result.length);
            return result;
        }).finally(() => clearTimeout(timer));
    }

    // 给 Vue 实例加 updated hook，可移除，且同名 hook 不重复添加
    function addUpdatedHook(el, callback, name) {
        const vm = el && el.__vue__;
        if (!vm) return () => {};

        const options = vm.$options;
        const flag = `__spHook_${name || 'default'}`;
        if (options[flag]) return () => {};

        const wrapped = function (...args) {
            callback.apply(this, args);
        };
        options[flag] = wrapped;

        if (!options.updated) {
            options.updated = [];
        } else if (!Array.isArray(options.updated)) {
            options.updated = [options.updated];
        }
        options.updated.push(wrapped);

        return () => {
            if (Array.isArray(options.updated)) {
                const index = options.updated.indexOf(wrapped);
                if (index >= 0) options.updated.splice(index, 1);
            }
            delete options[flag];
        };
    }

    function defaultSteamState() {
        return { own: [], wish: [], sub: [] };
    }

    const GameManager = {
        saveState(state) {
            writeJSON(GM_KEY_STEAM_GAMES, state);
        },
        loadState() {
            const saved = readJSON(GM_KEY_STEAM_GAMES, null);
            if (!saved || typeof saved !== 'object') return defaultSteamState();
            return {
                own: normalizeIds(saved.own),
                wish: normalizeIds(saved.wish),
                sub: normalizeIds(saved.sub)
            };
        }
    };

    let steamGameList = GameManager.loadState();
    let ownedSteamAppIds = new Set(steamGameList.own);
    let wishSteamAppIds = new Set(steamGameList.wish);

    // Steam 登录 Cookie 可能带分区（topLevelSite），要按分区读；脚本猫与油猴的 API 形态也不同
    const STEAM_COOKIE_TARGETS = [
        { url: 'https://store.steampowered.com/', partitionKey: { topLevelSite: 'https://store.steampowered.com' } },
        { url: 'https://steamcommunity.com/', partitionKey: { topLevelSite: 'https://steamcommunity.com' } }
    ];

    function asCookieArray(value) {
        if (Array.isArray(value)) return value;
        if (value && Array.isArray(value.cookies)) return value.cookies;
        return [];
    }

    async function listCookies(details) {
        d('listCookies 调用:', details.url, 'partitionKey=', details.partitionKey || '无');
        try {
            // 脚本猫推荐 Promise 形式：GM.cookie.list
            if (window.GM && GM.cookie && typeof GM.cookie.list === 'function') {
                const cookies = asCookieArray(await GM.cookie.list(details));
                d('GM.cookie.list 返回:', details.url, cookies.length);
                return cookies;
            }
            // 油猴 GM_cookie.list 支持 Promise / 回调；脚本猫也兼容回调形式
            if (typeof GM_cookie === 'function' && typeof GM_cookie.list === 'function') {
                return await new Promise(resolve => {
                    let settled = false;
                    const finish = value => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        const arr = asCookieArray(value);
                        d('GM_cookie.list 返回:', details.url, arr.length);
                        resolve(arr);
                    };
                    const timer = setTimeout(() => finish([]), 3000);
                    try {
                        const result = GM_cookie.list(details, (cookies, error) => {
                            if (error) d('GM_cookie.list 错误：', error);
                            finish(cookies);
                        });
                        if (result && typeof result.then === 'function') {
                            result.then(finish).catch(error => {
                                d('GM_cookie.list Promise 错误：', error);
                                finish([]);
                            });
                        } else if (result !== undefined) {
                            finish(result);
                        }
                    } catch (error) {
                        d('GM_cookie.list 调用失败：', error);
                        finish([]);
                    }
                });
            }
            // 老式油猴兼容：GM_cookie('list', details, callback)
            if (typeof GM_cookie === 'function') {
                return await new Promise(resolve => {
                    GM_cookie('list', details, (cookies, error) => {
                        if (error) d('GM_cookie list 错误：', error);
                        resolve(asCookieArray(cookies));
                    });
                });
            }
        } catch (error) {
            d('读取 Cookie 失败：', details.url, error);
        }
        d('listCookies 返回空:', details.url);
        return [];
    }

    function cookieHeaderFrom(cookies) {
        if (!Array.isArray(cookies)) return '';
        const picked = new Map();
        cookies.forEach(cookie => {
            if (!cookie || !cookie.name || cookie.value === undefined || cookie.value === null) return;
            const domain = String(cookie.domain || '').toLowerCase();
            const score = domain.includes('steampowered.com') ? 2 : (domain.includes('steamcommunity.com') ? 1 : 0);
            const prev = picked.get(cookie.name);
            if (!prev || score > prev.score) {
                picked.set(cookie.name, { score, value: cookie.value });
            }
        });
        return Array.from(picked, ([name, item]) => `${name}=${item.value}`).join('; ');
    }

    async function getSteamCookieHeader() {
        const all = [];
        for (const target of STEAM_COOKIE_TARGETS) {
            d('Cookie 目标:', target.url);
            // 先读分区 Cookie（Chrome 第三方 Cookie 分区场景），再读普通 Cookie
            let cookies = asCookieArray(await listCookies({ url: target.url, partitionKey: target.partitionKey }));
            d('分区 Cookie 命中:', target.url, cookies.length);
            if (!cookies.length) cookies = asCookieArray(await listCookies({ url: target.url }));
            d('普通 Cookie 命中:', target.url, cookies.length);
            if (!cookies.length && typeof GM_cookie === 'function') {
                // TM 5.2+：空 partitionKey 表示读取所有分区，后面按 name 去重
                cookies = asCookieArray(await listCookies({ url: target.url, partitionKey: {} }));
                d('全分区 Cookie 命中:', target.url, cookies.length);
            }
            if (cookies.length) all.push(...cookies);
        }
        d('Cookie 合并后总数:', all.length);
        const header = cookieHeaderFrom(all);
        d('Steam Cookie 读取结果：', header
            ? header.split('; ').map(item => item.split('=')[0]).join(', ')
            : '空');
        return header;
    }

    async function syncSteamOwnGameData() {
        try {
            d('开始同步Steam数据...');
            const cookieHeader = await getSteamCookieHeader();
            d('Steam Cookie 数量：', cookieHeader ? cookieHeader.split('; ').length : 0);

            const response = await new Promise((resolve, reject) => {
                d('发起 Steam userdata 请求, anonymous=', isScriptCat(), '带Cookie=', Boolean(cookieHeader));
                const details = {
                    method: 'GET',
                    url: 'https://store.steampowered.com/dynamicstore/userdata/',
                    timeout: 15000,
                    // 脚本猫 anonymous=true 时只发送下面显式指定的 Cookie；
                    // Tampermonkey 则用 anonymous=false + cookie 合并同名 Cookie
                    anonymous: isScriptCat(),
                    cookiePartition: { topLevelSite: 'https://store.steampowered.com' },
                    nocache: true,
                    headers: {
                        'Accept': 'application/json, text/javascript, */*; q=0.01',
                        'Referer': 'https://store.steampowered.com/'
                    },
                    onload: resolve,
                    onerror: error => reject(error || new Error('网络错误')),
                    ontimeout: () => reject(new Error('请求超时'))
                };
                // 脚本猫用 cookie 选项合并 Cookie；Tampermonkey 不支持则忽略
                if (cookieHeader) details.cookie = cookieHeader;
                GM_xmlhttpRequest(details);
            });

            const finalUrl = response.finalUrl || '';
            d('Steam userdata 响应：', {
                status: response.status,
                finalUrl: finalUrl,
                responseTextLength: (response.responseText || '').length
            });

            if (/login|openid/i.test(finalUrl)) {
                notify('Steam 网页登录已失效，请重新登录 store.steampowered.com');
                return false;
            }

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`Steam API HTTP ${response.status}`);
            }

            let data = response.response;
            if (!data || typeof data !== 'object') {
                data = JSON.parse(response.responseText);
            }
            if (!data || typeof data !== 'object') {
                throw new Error('Steam API 返回数据为空');
            }

            const state = {
                own: normalizeIds(data.rgOwnedApps),
                wish: normalizeIds(data.rgWishlist),
                sub: normalizeIds(data.rgOwnedPackages)
            };
            d('Steam 数据解析:', {
                own: state.own.length,
                wish: state.wish.length,
                sub: state.sub.length
            });

            if (state.own.length + state.wish.length + state.sub.length === 0) {
                notify(cookieHeader
                    ? 'Steam 返回空数据，网页登录可能已失效'
                    : '未读到 Steam Cookie：请登录 steam 网页，并允许脚本访问 store.steampowered.com / steamcommunity.com');
                return false;
            }

            GameManager.saveState(state);
            // 关键：同步后立即刷新内存引用，避免“已拥有筛选”继续用旧数据
            steamGameList = state;
            ownedSteamAppIds = new Set(state.own);
            wishSteamAppIds = new Set(state.wish);
            applyFilterGameList();
            // Vue3 页面没有 __vue__ 列表可改，直接重扫 DOM 给卡片加框
            scanGameBlocks();

            d('Steam 数据同步完成: own=', state.own.length,
                'wish=', state.wish.length, 'sub=', state.sub.length,
                'own示例=', state.own.slice(0, 5), 'wish示例=', state.wish.slice(0, 5));
            notify('同步Steam数据成功');
            return true;
        } catch (error) {
            console.error('[SteamPyTools] 同步Steam数据失败：', error);
            notify('同步Steam数据失败，请检查控制台');
            return false;
        }
    }

    GM_registerMenuCommand('同步Steam数据', () => { syncSteamOwnGameData(); });
    GM_registerMenuCommand('刷新Steam评价缓存', () => {
        ReviewStore.cache = {};
        writeJSON(GM_KEY_STEAM_RATING, {});
        d('Steam 评价缓存已清空，重新扫描卡片');
        scanGameBlocks();
        notify('Steam 评价缓存已清空，正在重新获取');
    });

    function defaultFilterState() {
        return {
            minPrice: 0,
            maxPrice: 9999,
            minRating: 0,
            isActive: false,
            ratingFilterActive: false
        };
    }

    const StateManager = {
        saveState(state) {
            writeJSON(GM_KEY_FILTER_STATE, state);
        },
        loadState() {
            const defaults = defaultFilterState();
            const saved = readJSON(GM_KEY_FILTER_STATE, null);
            if (!saved || typeof saved !== 'object') return defaults;
            return {
                minPrice: toNumber(saved.minPrice, defaults.minPrice),
                maxPrice: toNumber(saved.maxPrice, defaults.maxPrice),
                minRating: toNumber(saved.minRating, defaults.minRating),
                isActive: Boolean(saved.isActive),
                ratingFilterActive: Boolean(saved.ratingFilterActive)
            };
        }
    };

    let filterState = StateManager.loadState();

    function getAccessToken() {
        return window.localStorage.getItem('accessToken') || '';
    }

    const listSaleUrl = 'xboot/steamKeySale/listSale';
    const steampyUrl = 'https://steampy.com/';

    function requestApi(url, method, data) {
        const token = getAccessToken();
        d('requestApi 调用:', method, url, 'token长度=', token.length);
        if (!token) {
            return Promise.reject(new Error('未获取到 accessToken，请先登录 SteamPy'));
        }
        return ajax(url, {
            method: method,
            data: data,
            responseType: 'json',
            headers: {
                accessToken: token,
                APP_TOKEN: ''
            },
            _nocatch: true
        });
    }

    const cacheKey = `${listSaleUrl}_listSaleCache`;
    const inflightSaleRequests = new Map();

    function readSaleCache() {
        const cached = readJSON(cacheKey, {});
        return cached && typeof cached === 'object' && !Array.isArray(cached) ? cached : {};
    }

    function pruneSaleCache(cache) {
        const now = Date.now();
        Object.keys(cache).forEach(key => {
            if (!cache[key] || cache[key].expireTime <= now) delete cache[key];
        });
        const keys = Object.keys(cache);
        if (keys.length > SALE_CACHE_MAX) {
            keys.sort((a, b) => cache[a].expireTime - cache[b].expireTime)
                .slice(0, keys.length - SALE_CACHE_MAX)
                .forEach(key => delete cache[key]);
        }
        return cache;
    }

    function getSaleList(gameId) {
        const id = Number(gameId);
        if (!Number.isFinite(id)) return Promise.reject(new Error('invalid gameId'));

        const cache = readSaleCache();
        const hit = cache[id];
        if (hit && hit.expireTime > Date.now()) {
            d('getSaleList 命中缓存:', id, '剩余秒=', Math.round((hit.expireTime - Date.now()) / 1000));
            return Promise.resolve(hit.data);
        }

        if (inflightSaleRequests.has(id)) {
            d('getSaleList 复用进行中请求:', id);
            return inflightSaleRequests.get(id);
        }
        d('getSaleList 发起请求:', id);

        const request = requestApi(`${steampyUrl}${listSaleUrl}`, 'GET', {
            gameId: id,
            pageNumber: 1,
            pageSize: 20,
            sort: 'keyPrice',
            order: 'asc',
            startDate: '',
            endDate: ''
        }).then(data => {
            // 只缓存成功响应，避免把错误结果缓存 12 小时
            if (data && data.code === 200) {
                const nextCache = readSaleCache();
                nextCache[id] = { data: data, expireTime: Date.now() + SALE_CACHE_TTL };
                GM_setValue(cacheKey, pruneSaleCache(nextCache));
            }
            return data;
        }).finally(() => {
            inflightSaleRequests.delete(id);
        });

        inflightSaleRequests.set(id, request);
        return request;
    }

    function getSteamAppId(gameBlock) {
        if (!gameBlock) return null;
        const iconImg = gameBlock.querySelector('.cdkGameIcon') || gameBlock.querySelector('.gameIcon');
        const imgUrl = iconImg
            ? (iconImg.dataset.src || iconImg.getAttribute('src') || '').replace(/[`']/g, '').trim()
            : '';
        const nameEl = gameBlock.querySelector('.gameName');
        const gameName = nameEl ? (nameEl.textContent || '').trim() : '';
        // Vue 切页会复用同一个 DOM 节点，必须校验指纹，否则上一页的 AppID/角标会留在新卡片上
        const fingerprint = imgUrl + '|' + gameName;
        if (gameBlock.dataset.spAppId && gameBlock.dataset.spFingerprint === fingerprint) {
            return Number(gameBlock.dataset.spAppId);
        }

        let appId = null;
        const appsMatch = imgUrl.match(/steam\/apps\/(\d+)/);
        if (appsMatch) appId = Number(appsMatch[1]);
        // bundles ID 不是 Steam App ID，不能用它拼 /app/ 链接，故不再返回

        // 本地保存页或图片未加载时，尝试从 Steam 链接提取
        if (!appId) {
            const gameLink = gameBlock.querySelector('a[href*="steam"]');
            if (gameLink) {
                const linkApps = gameLink.href.match(/steam\/apps\/(\d+)/);
                const linkApp = gameLink.href.match(/\/app\/(\d+)/);
                const match = linkApps || linkApp;
                if (match) appId = Number(match[1]);
            }
        }

        // 图片与链接都取不到时，用卡片游戏名从 keyHot 数据反查
        if (!appId && gameName) {
            const game = TempDataStore.findByGameName(gameName);
            const found = Number(game && game.appId);
            if (Number.isFinite(found) && found > 0) appId = found;
        }

        if (Number.isFinite(appId) && appId > 0) {
            gameBlock.dataset.spAppId = String(appId);
            gameBlock.dataset.spFingerprint = fingerprint;
            return appId;
        }

        // 节点被复用成另一个游戏但暂时取不到 AppID：清掉旧值，避免继续沿用上一页数据
        if (gameBlock.dataset.spAppId) {
            delete gameBlock.dataset.spAppId;
            delete gameBlock.dataset.spFingerprint;
        }
        d('[getSteamAppId] 无法提取 Steam App ID');
        return null;
    }

    // ===== Steam 商店评价数据源（appreviews API 会跳转到商店首页，改解析商店页评价摘要） =====
    const ReviewStore = {
        cache: readJSON(GM_KEY_STEAM_RATING, {}),
        queue: [],
        active: 0,
        waiting: new Map(),

        save() {
            const now = Date.now();
            Object.keys(this.cache).forEach(k => {
                if (now - (this.cache[k].time || 0) > RATING_CACHE_TTL) delete this.cache[k];
            });
            writeJSON(GM_KEY_STEAM_RATING, this.cache);
        },

        get(appId) {
            const item = this.cache[Number(appId)];
            if (!item) return null;
            if (Date.now() - (item.time || 0) > RATING_CACHE_TTL) return null;
            return item;
        },

        set(appId, data) {
            this.cache[Number(appId)] = Object.assign({ time: Date.now() }, data);
            this.save();
        },

        // 好评率 -> 等级文本 + class
        level(data) {
            const total = Number(data.totalReviews) || 0;
            const positive = Number(data.totalPositive) || 0;
            if (!total || total < 0) return null;
            // 商店页 tooltip 给出精确百分比，优先使用；老缓存回退到 positive/total
            const ratio = Number(data.ratio) > 0 ? Number(data.ratio) : (positive / total);
            let text, cls;
            if (total >= 500 && ratio >= 0.95) { text = '好评如潮'; cls = 'overwhelmingly-positive'; }
            else if (ratio >= 0.80) { text = '特别好评'; cls = 'very-positive'; }
            else if (ratio >= 0.70) { text = '多半好评'; cls = 'positive'; }
            else if (ratio >= 0.40) { text = '褒贬不一'; cls = 'mixed'; }
            else if (ratio >= 0.20) { text = '多半差评'; cls = 'negative'; }
            else { text = '特别差评'; cls = 'very-negative'; }
            // Steam 官方摘要文本更准确（例如评测数较少时仍显示"特别好评"）
            if (data.scoreDesc) text = String(data.scoreDesc).trim();
            return { text: text, cls: cls, ratio: ratio, total: total };
        },

        // 拉取单个 AppID 的评分，返回 Promise<data|null>
        fetch(appId) {
            appId = Number(appId);
            const cached = this.get(appId);
            if (cached) return Promise.resolve(cached.noReviews ? null : cached);
            if (this.waiting.has(appId)) return this.waiting.get(appId);

            const promise = new Promise(resolve => {
                this.queue.push({ appId, resolve });
                this.pump();
            });
            this.waiting.set(appId, promise);
            return promise;
        },

        pump() {
            while (this.active < RATING_CONCURRENCY && this.queue.length) {
                const task = this.queue.shift();
                this.active++;
                this.requestSteam(task.appId)
                    .then(data => {
                        // 无评价也缓存，避免 DOM 定时扫描反复请求同一游戏
                        if (!data) d('Steam 无评价: appId=', task.appId);
                        this.set(task.appId, data || { noReviews: true });
                        task.resolve(data || null);
                    })
                    .catch(error => {
                        d('Steam 评价请求失败:', task.appId, error && error.message);
                        task.resolve(null);
                    })
                    .finally(() => {
                        this.active--;
                        this.waiting.delete(task.appId);
                        this.pump();
                    });
            }
        },

        requestSteam(appId) {
            // appreviews?json=1 在当前环境会 302 回商店首页并返回 HTML，改用商店页评价摘要
            const url = `https://store.steampowered.com/app/${appId}/?l=schinese`;
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    timeout: 15000,
                    anonymous: true,
                    headers: { 'Accept': 'text/html' },
                    onload: res => {
                        try {
                            if (res.status < 200 || res.status >= 300) {
                                reject(new Error('HTTP ' + res.status));
                                return;
                            }
                            const html = res.responseText || '';
                            // 中文商店页：data-tooltip-html="此游戏的 27 篇用户评测中有 70% 为好评。"
                            const tip = html.match(/data-tooltip-html=["'][^"']*?(\d+)\s*篇用户评测中有\s*(\d+)%\s*为好评/i);
                            // 英文兜底：Of the 27 user reviews for this game, 70% are positive
                            const tipEn = html.match(/Of the (\d+) user reviews[^,]{0,80},\s*(\d+)%\s*are positive/i);
                            const metaCount = html.match(/<meta\s+itemprop=["']reviewCount["']\s+content=["'](\d+)["']/i);
                            const metaRating = html.match(/<meta\s+itemprop=["']ratingValue["']\s+content=["']([\d.]+)["']/i);
                            const desc = html.match(/class=["']game_review_summary[^"']*["'][^>]*>\s*([^<]+?)\s*<\/span>/i);
                            let total = tip ? Number(tip[1]) : (tipEn ? Number(tipEn[1]) : (metaCount ? Number(metaCount[1]) : 0));
                            let ratio = tip ? Number(tip[2]) / 100 : (tipEn ? Number(tipEn[2]) / 100 : (metaRating ? Number(metaRating[1]) / 10 : 0));
                            if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(ratio) || ratio <= 0) {
                                resolve(null);
                                return;
                            }
                            resolve({
                                totalReviews: total,
                                totalPositive: Math.round(total * ratio),
                                ratio: ratio,
                                scoreDesc: desc ? desc[1].trim() : ''
                            });
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: err => reject(err || new Error('网络错误')),
                    ontimeout: () => reject(new Error('超时'))
                });
            });
        }
    };

    // 游戏数据存储：setGameData 时建索引，避免每次线性 find
    const TempDataStore = {
        steamGameData: null,
        ratingMap: new Map(),

        setGameData(data) {
            const content = data && data.result && data.result.content;
            if (!Array.isArray(content)) {
                d('keyHot 未找到 result.content 数组, result 结构=',
                    data && data.result ? Object.keys(data.result) : String(data));
                return;
            }
            if (!content.length) {
                // prkGame/keyHot 有时返回空列表（页面同时还在请求 steamGame/keyHot），不要清空已有索引
                d('keyHot 空结果，保留已有索引(现有=', this.ratingMap.size, ')');
                return;
            }
            this.steamGameData = data;
            const map = new Map();
            const byId = new Map();
            content.forEach(game => {
                // 同时按 appId 和长 id 建索引，兼容卡片不同取值方式
                const appId = Number(game && game.appId);
                const longId = game && game.id;
                if (Number.isFinite(appId) && appId > 0) map.set(appId, game);
                if (longId !== undefined && longId !== null) byId.set(String(longId), game);
            });
            if (DEBUG) {
                const sample = content[0] || {};
                d('keyHot 首条: appId=', sample.appId, 'id=', sample.id,
                    'rating=', sample.rating, 'steamApp=', sample.steamApp,
                    'gameUrl=', sample.gameUrl);
                d('keyHot rating 非零条数=', content.filter(g => Number(g && g.rating) > 0).length,
                    '/ 总数=', content.length);
                d('keyHot rating 分布(前10):',
                    content.slice(0, 10).map(g => ({ appId: g.appId, rating: g.rating })));
                d('keyHot 索引(appId):', map.size, '/ byId:', byId.size, '/ 数据:', content.length);
            }
            this.ratingMap = map;
            this.idMap = byId;
        },

        getGameInfo(appId) {
            return this.ratingMap.get(Number(appId)) || null;
        },

        // 新版卡片可能没有 steam/apps 图片 URL，用游戏名从 keyHot 数据反查 AppID
        findByGameName(name) {
            const content = this.steamGameData && this.steamGameData.result && this.steamGameData.result.content;
            if (!Array.isArray(content) || !name) return null;
            const target = String(name).trim().toLowerCase();
            if (!target) return null;
            return content.find(game => {
                if (!game) return false;
                const n1 = game.gameName ? String(game.gameName).trim().toLowerCase() : '';
                const n2 = game.gameNameCn ? String(game.gameNameCn).trim().toLowerCase() : '';
                return n1 === target || n2 === target;
            }) || null;
        },

        getRatingByAppId(appId) {
            const game = this.getGameInfo(appId);
            return game ? toNumber(game.rating, 0) : 0;
        },

        getRatingCountByAppId(appId) {
            const game = this.getGameInfo(appId);
            return game ? toNumber(game.ratingCount, 0) : 0;
        }
    };

    // 接口拦截
    ajaxHooker.hook(request => {
        // 所有 XHR 都打点：切分页若请求了接口，这里一定看得到
        d('XHR:', request.method, request.url);
        if (KEYHOT_PATH_RE.test(request.url)) {
            d('ajaxHooker 捕获 keyHot:', request.url);
            request.response = res => {
                try {
                    const originalData = JSON.parse(res.responseText);
                    TempDataStore.setGameData(originalData);
                    res.responseText = JSON.stringify(originalData);
                    const content = originalData && originalData.result && originalData.result.content;
                    d('keyHot 评分数据已写入, 条数=', Array.isArray(content) ? content.length : '未知');
                    d('keyHot 结构: 顶层keys=', Object.keys(originalData || {}),
                        'result.keys=', Object.keys((originalData && originalData.result) || {}));
                    if (Array.isArray(content) && content.length) {
                        d('keyHot 首条游戏字段=', Object.keys(content[0] || {}));
                    }
                } catch (e) {
                    console.error('[SteamPyTools] keyHot 接口数据处理失败：', e);
                }
            };
        } else if (GETONE_PATH_RE.test(request.url)) {
            d('ajaxHooker 捕获 getOne:', request.url);
            request.response = res => {
                try {
                    const originalData = JSON.parse(res.responseText);
                    if (originalData.code === 200 && originalData.success === true) {
                        const data = originalData.result || {};
                        const showArea = $sp('.market-content > .market-detail > div:nth-child(3)');
                        if (showArea.length && !showArea.find('.sp-history-sales').length) {
                            showArea.append(
                                '<div class="sp-history-sales ht100 mt-50" style="flex-wrap: wrap;">' +
                                '<span class="f20-rem mt-20-rem ml-20-rem">历史销售数量 ' +
                                (data.keyTx || 0) + '</span></div>'
                            );
                        }
                    } else {
                        d('getOne 接口数据处理失败：', originalData);
                    }
                } catch (e) {
                    console.error('[SteamPyTools] getOne 接口数据处理失败：', e);
                }
            };
        }
        return request;
    });

    // 把评分等级渲染到卡片上；level 形如 {text, cls, ratio, total}，null 表示无评分
    function renderRatingBadge(gameBlock, level) {
        const gameHead = gameBlock.querySelector('.gameHead') ||
            gameBlock.querySelector('.game-header') ||
            gameBlock.querySelector('.game-info') ||
            gameBlock;
        if (!gameHead) return;

        let ratingEl = gameHead.querySelector('.gameRating');
        if (level) {
            const fullText = level.total > 0 ? `${level.text} (${level.total})` : level.text;
            if (ratingEl) {
                if (ratingEl.textContent !== fullText) ratingEl.textContent = fullText;
                if (!ratingEl.classList.contains(level.cls)) {
                    ratingEl.classList.remove(
                        'overwhelmingly-positive', 'very-positive', 'positive',
                        'mixed', 'negative', 'very-negative'
                    );
                    ratingEl.classList.add(level.cls);
                }
            } else {
                ratingEl = document.createElement('div');
                ratingEl.className = `gameRating ${level.cls}`;
                ratingEl.textContent = fullText;
                gameHead.appendChild(ratingEl);
            }
        } else if (ratingEl) {
            ratingEl.remove();
        }
    }

    function ratingLevelFromRatio(ratio, count) {
        const percent = Math.round((Number(ratio) || 0) * 100);
        let text, cls;
        if (percent >= 90) { text = '好评如潮'; cls = 'overwhelmingly-positive'; }
        else if (percent >= 80) { text = '特别好评'; cls = 'very-positive'; }
        else if (percent >= 70) { text = '多半好评'; cls = 'positive'; }
        else if (percent >= 40) { text = '褒贬不一'; cls = 'mixed'; }
        else if (percent >= 20) { text = '多半差评'; cls = 'negative'; }
        else { text = '特别差评'; cls = 'very-negative'; }
        return { text: text, cls: cls, ratio: ratio, total: count || 0 };
    }

    function updateGameRating(gameBlock) {
        if (!gameBlock) return;

        const appId = getSteamAppId(gameBlock);
        if (!appId) {
            renderRatingBadge(gameBlock, null);
            gameBlock.classList.remove('sp-owned', 'sp-wishlisted');
            return;
        }
        const fingerprint = gameBlock.dataset.spFingerprint;

        const isOwned = ownedSteamAppIds.has(appId);
        const isWishlisted = wishSteamAppIds.has(appId);
        gameBlock.classList.toggle('sp-owned', isOwned);
        gameBlock.classList.toggle('sp-wishlisted', isWishlisted);
        if (isOwned || isWishlisted) {
            d('卡片标记: appId=', appId, isOwned ? '已拥有 ' : '', isWishlisted ? '愿望单' : '');
        }
        const nameEl = gameBlock.querySelector('.gameName');
        if (nameEl) nameEl.classList.toggle('bg-blue', isWishlisted);

        // 优先1：站点接口自带的评分字段（老版可能存在）
        const siteRating = TempDataStore.getRatingByAppId(appId);
        if (siteRating > 0) {
            renderRatingBadge(gameBlock, ratingLevelFromRatio(siteRating, TempDataStore.getRatingCountByAppId(appId)));
            return;
        }

        // 优先2：Steam 评价缓存（本地持久化）
        const cached = ReviewStore.get(appId);
        if (cached) {
            if (cached.noReviews) {
                renderRatingBadge(gameBlock, null);
                return;
            }
            const level = ReviewStore.level(cached);
            if (level) {
                renderRatingBadge(gameBlock, level);
                return;
            }
        }

        // 都没有：异步从 Steam 商店拉评价后再渲染（缓存 + 去重 + 并发限制）
        renderRatingBadge(gameBlock, null);
        ReviewStore.fetch(appId).then(data => {
            if (!data) return;
            const level = ReviewStore.level(data);
            if (!level) return;
            // 卡片可能被站点重建，用 data-sp-app-id + 指纹重新定位，防止异步回填到已换游戏的旧节点
            document.querySelectorAll('.gameblock').forEach(block => {
                if (Number(block.dataset.spAppId) === Number(appId) &&
                    (!fingerprint || block.dataset.spFingerprint === fingerprint)) {
                    renderRatingBadge(block, level);
                }
            });
            d('Steam 评价已渲染: appId=', appId, level.text, '总评价=', level.total);
        });
    }

    function injectStyles() {
        const existing = document.getElementById('steamPyToolsStyle');
        if (existing) return;

        const style = document.createElement('style');
        style.id = 'steamPyToolsStyle';
        style.textContent = `
        .gameHead .gameRating {
            padding: 0 8px !important;
            height: .3rem !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            color: #fff !important;
            text-align: center !important;
            line-height: .3rem !important;
            border-radius: .09rem 0 0 0 !important;
            font-size: .12rem !important;
            font-weight: bold !important;
            z-index: 10 !important;
            white-space: nowrap !important;
        }
        .gameRating.overwhelmingly-positive { background: #4CAF50 !important; }
        .gameRating.very-positive { background: #8BC34A !important; }
        .gameRating.positive { background: #CDDC39 !important; color: #333 !important; }
        .gameRating.mixed { background: #FFC107 !important; color: #333 !important; }
        .gameRating.negative { background: #FF9800 !important; }
        .gameRating.very-negative { background: #F44336 !important; }
        .gameblock.sp-owned { outline: 3px solid #ff9800 !important; outline-offset: -3px !important; }
        .gameblock.sp-wishlisted { outline: 3px solid #2196f3 !important; outline-offset: -3px !important; }
        .gameblock.sp-owned.sp-wishlisted { outline: 3px dashed #9c27b0 !important; outline-offset: -3px !important; }
        .gameName.bg-blue { color: #1976d2 !important; font-weight: 700 !important; }
        .sp-filter-group {
            display: inline-flex;
            align-items: center;
            font-family: Arial, sans-serif;
            font-size: .13rem;
            gap: .08rem;
            padding: .08rem;
            border-radius: .04rem;
            height: .25rem;
            box-sizing: border-box;
        }
        .sp-filter-btn {
            display: inline-flex;
            align-items: center;
            padding: .04rem .1rem;
            border-radius: .04rem;
            cursor: pointer;
            font-size: .13rem;
            border: 1px solid #ddd;
            color: #666;
            background: transparent;
            transition: all .2s;
            box-sizing: border-box;
            height: .25rem;
            line-height: .17rem;
        }
        .sp-filter-btn.is-active {
            border: 1px solid #409EFF !important;
            color: #fff !important;
            background: #409EFF !important;
        }
        .sp-filter-input {
            width: .7rem;
            height: .28rem;
            padding: 0 .08rem;
            border: 1px solid #ccc;
            border-radius: .04rem;
            box-sizing: border-box;
            font-size: .13rem;
            line-height: .12rem;
        }
        .sp-filter-button {
            margin-left: .04rem;
            padding: .04rem .12rem;
            cursor: pointer;
            background: #409EFF !important;
            color: #fff !important;
            border: 1px solid #409EFF !important;
            border-radius: .04rem;
            font-size: .13rem;
            height: .28rem;
            line-height: .2rem;
            box-sizing: border-box;
        }
        `;
        document.head.appendChild(style);
    }

    function createFilterUI() {
        const ui = document.createElement('div');
        ui.id = 'priceFilterContainer';
        ui.className = 'ml-5-rem flex-row align-items-center sp-filter-group';

        const title = document.createElement('span');
        title.className = 'tag-titleOne ml-3-rem';
        title.textContent = '价格筛选';
        title.style.fontWeight = 'bold';
        ui.appendChild(title);

        const presetContainer = document.createElement('div');
        presetContainer.className = 'flex-row jc-space-flex-start align-items-center pr5-rem';
        presetContainer.style.gap = '.08rem';

        const presets = [{ text: '0-20元', min: 0, max: 20 }];
        presets.forEach(p => {
            const btn = document.createElement('div');
            btn.className = 'tagBtn sp-filter-btn';
            btn.dataset.min = p.min;
            btn.dataset.max = p.max;
            btn.textContent = p.text;
            btn.onclick = () => {
                filterState.minPrice = p.min;
                filterState.maxPrice = p.max;
                filterState.isActive = true;
                StateManager.saveState(filterState);
                syncInputValues();
                applyFilterGameList();
                updatePresetHighlights();
            };
            presetContainer.appendChild(btn);
        });
        ui.appendChild(presetContainer);

        const inputContainer = document.createElement('div');
        inputContainer.className = 'flex-row align-items-center';
        inputContainer.style.gap = '.08rem';

        const minInp = document.createElement('input');
        minInp.id = 'priceFilterMin';
        minInp.type = 'number';
        minInp.placeholder = '最低价';
        minInp.min = 0;
        minInp.className = 'sp-filter-input';
        minInp.addEventListener('input', e => {
            filterState.minPrice = toNumber(e.target.value, 0);
            filterState.isActive = true;
            StateManager.saveState(filterState);
        });

        const separator = document.createTextNode('-');

        const maxInp = document.createElement('input');
        maxInp.id = 'priceFilterMax';
        maxInp.type = 'number';
        maxInp.placeholder = '最高价';
        maxInp.min = 0;
        maxInp.className = 'sp-filter-input';
        maxInp.addEventListener('input', e => {
            filterState.maxPrice = toNumber(e.target.value, 9999);
            filterState.isActive = true;
            StateManager.saveState(filterState);
        });

        const filterBtn = document.createElement('button');
        filterBtn.className = 'ivu-btn ivu-btn-default ivu-btn-sm sp-filter-button';
        filterBtn.textContent = '筛选';
        filterBtn.onclick = () => {
            applyFilterGameList();
            updatePresetHighlights(false);
        };

        inputContainer.append(minInp, separator, maxInp, filterBtn);
        ui.appendChild(inputContainer);

        const ratingFilterContainer = document.createElement('div');
        ratingFilterContainer.className = 'ml-5-rem flex-row align-items-center sp-filter-group';

        const ratingTitle = document.createElement('span');
        ratingTitle.className = 'tag-titleOne ml-3-rem';
        ratingTitle.textContent = '好评筛选';
        ratingTitle.style.fontWeight = 'bold';
        ratingFilterContainer.appendChild(ratingTitle);

        const ratingPresets = [
            { text: '全部', min: 0 },
            { text: '特好以上', min: 0.8 },
            { text: '好评如潮', min: 0.9 }
        ];

        ratingPresets.forEach(p => {
            const btn = document.createElement('div');
            btn.className = 'tagBtn sp-filter-btn';
            btn.dataset.min = p.min;
            btn.textContent = p.text;
            btn.onclick = () => {
                filterState.minRating = p.min;
                filterState.ratingFilterActive = p.min > 0;
                StateManager.saveState(filterState);
                applyFilterGameList();
                updateRatingPresetHighlights();
            };
            ratingFilterContainer.appendChild(btn);
        });

        ui.appendChild(ratingFilterContainer);
        updatePresetHighlights();
        updateRatingPresetHighlights();
        return ui;
    }

    function insertFilterUI() {
        if (document.getElementById('priceFilterContainer')) return;
        const targetContainer = document.querySelector('.tag.flex-row.align-items-center');
        if (!targetContainer) return;
        targetContainer.appendChild(createFilterUI());
        syncInputValues();
        if (filterState.isActive || filterState.ratingFilterActive) applyFilterGameList();
    }

    function updatePresetHighlights(shouldHighlight = true) {
        // 只更新带 data-max 的价格按钮，不再误伤好评按钮
        document.querySelectorAll('#priceFilterContainer .sp-filter-btn[data-max]').forEach(btn => {
            const btnMin = toNumber(btn.dataset.min, NaN);
            const btnMax = toNumber(btn.dataset.max, NaN);
            const isMatch = filterState.isActive &&
                filterState.minPrice === btnMin &&
                filterState.maxPrice === btnMax;
            btn.classList.toggle('is-active', Boolean(shouldHighlight && isMatch));
        });
    }

    function updateRatingPresetHighlights() {
        // 只更新没有 data-max 的好评按钮
        document.querySelectorAll('#priceFilterContainer .sp-filter-btn[data-min]:not([data-max])').forEach(btn => {
            const btnMin = toNumber(btn.dataset.min, NaN);
            const isMatch = filterState.ratingFilterActive && filterState.minRating === btnMin;
            btn.classList.toggle('is-active', isMatch);
        });
    }

    function syncInputValues() {
        const minInp = document.getElementById('priceFilterMin');
        const maxInp = document.getElementById('priceFilterMax');
        if (minInp) minInp.value = filterState.minPrice;
        if (maxInp) maxInp.value = filterState.maxPrice;
    }

    function processGameOpen(gameBlock) {
        if (gameBlock.dataset.spProcessed === 'true' &&
            gameBlock.dataset.spProcessedFingerprint === (gameBlock.dataset.spFingerprint || '')) return;

        const appId = getSteamAppId(gameBlock);
        if (!appId) return;

        // 切页时 Vue 会复用节点，先移除旧监听，避免中键仍打开上一页的游戏
        if (gameBlock.__spMousedown) gameBlock.removeEventListener('mousedown', gameBlock.__spMousedown);
        if (gameBlock.__spAuxclick) gameBlock.removeEventListener('auxclick', gameBlock.__spAuxclick);

        const onMousedown = e => {
            if (e.button !== 1 || e.ctrlKey || e.shiftKey) return;
            const currentId = getSteamAppId(gameBlock);
            if (!currentId) return;
            e.preventDefault();
            window.open(`https://store.steampowered.com/app/${currentId}/`, '_blank');
        };
        const onAuxclick = e => {
            if (e.button === 1) e.preventDefault();
        };
        gameBlock.__spMousedown = onMousedown;
        gameBlock.__spAuxclick = onAuxclick;
        gameBlock.addEventListener('mousedown', onMousedown);
        gameBlock.addEventListener('auxclick', onAuxclick);
        gameBlock.dataset.spProcessed = 'true';
        gameBlock.dataset.spProcessedFingerprint = gameBlock.dataset.spFingerprint || '';
    }

    function $dom(selector) {
        return $sp(selector).get(0);
    }

    // 记录每个 Vue 实例的原始列表，筛选永远从原始列表派生，避免不可逆过滤
    let listStates = new WeakMap();

    function applyFilterGameList() {
        const vm = $dom('.game_layout .game_layout');
        if (!vm || !vm.__vue__) return;

        const vue = vm.__vue__;
        const current = Array.isArray(vue.gameList) ? vue.gameList : [];
        let state = listStates.get(vue);

        // lastApplied 与当前引用不一致，说明站点换了新列表（翻页/搜索），重建快照
        if (!state || (state.lastApplied && current !== state.lastApplied)) {
            state = { source: current.slice(), lastApplied: current };
            listStates.set(vue, state);
        }

        const filtered = state.source.filter(game => {
            const price = toNumber(game && game.keyPrice, 0);
            const priceShouldShow = !filterState.isActive ||
                (price >= filterState.minPrice && price <= filterState.maxPrice);

            const appId = Number(game && game.appId);
            const rating = TempDataStore.getRatingByAppId(appId);
            const ratingShouldShow = !filterState.ratingFilterActive ||
                rating >= filterState.minRating;

            if (ownedSteamAppIds.has(appId)) return false;

            return priceShouldShow && ratingShouldShow;
        });

        const changed = filtered.length !== current.length ||
            filtered.some((game, index) => game !== current[index]);

        if (changed) {
            vue.gameList = filtered;
            state.lastApplied = filtered;
        }
    }

    let removeContentHook = null;
    let cardObserver = null;
    let cardScanTimer = null;
    let lastCardScanSignature = '';

    // 扫描所有游戏卡片，渲染评分角标与愿望单高亮（不依赖 Vue 实例，兼容 Vue2/Vue3）
    function scanGameBlocks(root) {
        const scope = root && root.querySelectorAll ? root : document;
        const blocks = scope.querySelectorAll('.gameblock');
        blocks.forEach(block => {
            updateGameRating(block);
            processGameOpen(block);
        });
        if (DEBUG) {
            const withBadge = scope.querySelectorAll('.gameblock .gameRating').length;
            const signature = scope === document ? 'doc:' + blocks.length + '/' + withBadge : 'root:' + blocks.length + '/' + withBadge;
            if (signature !== lastCardScanSignature) {
                lastCardScanSignature = signature;
                d('卡片扫描: 总数=', blocks.length, '有角标=', withBadge, '范围=', scope === document ? 'document' : 'root');
            }
        }
    }

    function startCardObserver() {
        if (cardObserver) return;
        let scheduled = false;
        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            clearTimeout(cardScanTimer);
            cardScanTimer = setTimeout(() => {
                scheduled = false;
                scanGameBlocks();
            }, 300);
        };
        cardObserver = new MutationObserver(schedule);
        cardObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
        // 定时兜底：站点可能整块替换 DOM 而不触发我们关心的变化
        cardScanTimer = setInterval(scanGameBlocks, 3000);
        d('已启动卡片 DOM 监听（兼容 Vue3 新版）');
    }

    function stopCardObserver() {
        if (cardObserver) {
            cardObserver.disconnect();
            cardObserver = null;
        }
        if (cardScanTimer) {
            clearInterval(cardScanTimer);
            clearTimeout(cardScanTimer);
            cardScanTimer = null;
        }
    }

    async function startContentMonitor() {
        if (removeContentHook) return;
        try {
            await waitForElement('div.ivu-tabs-content div.flex-row.jc-space-flex-start.flex-wrap.w-auto');
        } catch (e) {
            d('旧版列表容器未找到，尝试新版容器');
            await waitForElement('.game_layout, .gameblock');
        }
        if (removeContentHook) return;

        const pane = $sp('.ivu-tabs-tabpane').get(0);
        const vm = pane && pane.__vue__;
        if (vm) {
            // 旧版 Vue2：通过 updated hook 做筛选 + 角标
            removeContentHook = addUpdatedHook(pane, function () {
                applyFilterGameList();
                scanGameBlocks(this.$el);
            }, 'content');
            d('使用 Vue2 updated hook 模式');
        } else {
            // 新版 Vue3：没有 __vue__，改用 DOM 监听
            console.info('[SteamPyTools] 未找到 Vue2 实例，使用 DOM 监听模式（Vue3 新版）');
        }

        startCardObserver();
        setTimeout(scanGameBlocks, 600);
    }

    let stopSellWatcher = null;

    async function startSellListListener() {
        d('startSellListListener');
        if (stopSellWatcher) return;
        try {
            const el = await waitForElement(
                '#main > div.main > div.single-page-con > div.single-page > div:has(.cdkTrade-layout)'
            );
            const vm = el[0] && el[0].__vue__;
            if (!vm) {
                console.warn('[SteamPyTools] 未找到卖家列表 Vue 实例');
                return;
            }

            stopSellWatcher = vm.$watch('sellList', function (newVal) {
                const sellList = Array.isArray(newVal) ? newVal : (Array.isArray(vm.sellList) ? vm.sellList : []);
                if (!sellList.length) return;

                this.$nextTick(() => {
                    const items = Array.from(document.querySelectorAll('.orderOne.bg-white .list-item'));
                    items.forEach((item, index) => {
                        const data = sellList[index];
                        if (!data) return;

                        const minPriceElement = item.querySelector('div:nth-child(7)');
                        if (!minPriceElement) return;

                        const selfPrice = toNumber(data.keyPrice, 0);
                        minPriceElement.innerText = `${selfPrice}`;
                        minPriceElement.classList.remove('color-red');

                        if (toNumber(data.stock, 0) === 0) return;

                        getSaleList(data.gameId).then(sellerData => {
                            if (!sellerData || sellerData.code !== 200) return;

                            const content = sellerData.result && sellerData.result.content;
                            const sellerList = Array.isArray(content) ? content : [];
                            if (!sellerList.length) return;

                            const minPrice = toNumber(sellerList[0].keyPrice, 0);
                            if (minPrice >= selfPrice) return;

                            let order = 1;
                            for (const seller of sellerList) {
                                if (String(seller.saleId) === String(data.sellerId)) break;
                                if (toNumber(seller.keyPrice, 0) < selfPrice) {
                                    order += toNumber(seller.stock, 0);
                                }
                            }

                            if (order !== 1) {
                                minPriceElement.classList.add('color-red');
                                minPriceElement.innerText = `${selfPrice} 最低价${minPrice}`;
                            }
                        }).catch(error => {
                            d('获取卖家列表失败：', error);
                        });
                    });
                });
            }, { immediate: true });
        } catch (error) {
            console.error('[SteamPyTools] 卖家列表监听启动失败：', error);
        }
    }

    let restoreGoToChoose = null;

    async function startModalListener() {
        try {
            const el = await waitForElement('#main > div.main > div.single-page-con > div > div');
            const vm = el[0] && el[0].__vue__;
            if (!vm || vm.__spGoToChoosePatched || typeof vm.goToChoose !== 'function') return;

            const originalGoToChoose = vm.goToChoose;
            const patched = function (...args) {
                const result = originalGoToChoose.apply(this, args);
                this.$nextTick(() => {
                    const e = args[0];
                    const index = typeof e === 'number' ? e : Number(e && e.currentTarget && e.currentTarget.dataset.index);
                    const list = this.modalGamList || this.buyList || this.cdkGameList;
                    const gameData = Array.isArray(list) && Number.isFinite(index) ? list[index] : null;
                    const $modal = $sp('.ivu-modal').filter(':visible').last();
                    if ($modal.length && gameData) addHisPriceToModal($modal, gameData, this);
                });
                return result;
            };

            vm.goToChoose = patched;
            vm.__spGoToChoosePatched = true;
            restoreGoToChoose = () => {
                if (!vm.__spGoToChoosePatched) return;
                vm.goToChoose = originalGoToChoose;
                delete vm.__spGoToChoosePatched;
                restoreGoToChoose = null;
            };
            d('seller 弹窗监听器已启动');
        } catch (error) {
            console.error('[SteamPyTools] 弹窗监听启动失败：', error);
        }
    }

    function addHisPriceToModal(modal, gameData, vm) {
        if (!modal || !gameData) return;

        const $currentMinPriceLabel = modal.find('.mt-15.f15.fw500 .color-red.f12-rem');
        if (!$currentMinPriceLabel.length) {
            d('弹窗内未找到当前最低价格标签');
            return;
        }

        if (modal.find('.his-price-tag').length) return;

        const steamGame = gameData.steamGame || {};
        const gameName = steamGame.gameName || gameData.gameName || '';
        const hisPrice = toNumber(gameData.hisPrice, NaN);

        if (!Number.isFinite(hisPrice)) {
            d(`【${gameName}】无历史价格数据`);
            return;
        }

        const hisPriceSpan = document.createElement('span');
        hisPriceSpan.className = 'his-price-tag color-blue f12-rem ml-10';
        hisPriceSpan.textContent = ` 历史最低价格: ￥${hisPrice.toFixed(2)}`;
        $currentMinPriceLabel.after(hisPriceSpan);

        const keyPrice = toNumber(gameData.keyPrice, NaN);
        if (Number.isFinite(keyPrice) && vm) {
            const cdkPriceInt = Math.round(keyPrice * 10) - 1;
            vm.cdkPrice = Math.max(0, cdkPriceInt) / 10;
        }
    }

    async function addQuantitySort() {
        try {
            if (document.getElementById('quantitySortBtn')) return;
            const $parent = await waitForElement('.flex-row > .c-point.flex-row.align-items-center');
            if (!$parent.length || $parent.find('#quantitySortBtn').length) return;

            const $targetBtns = $parent.find('.ml-5-rem.c-point.tagBtn');
            if (!$targetBtns.length) return;

            const vueDataAttrs = {};
            $sp.each($targetBtns.first()[0].attributes, (i, attr) => {
                if (attr.name.indexOf('data-v-') === 0) vueDataAttrs[attr.name] = attr.value;
            });

            const $quantityBtn = $sp('<div>')
                .attr('id', 'quantitySortBtn')
                .addClass('ml-5-rem c-point tagBtn')
                .attr(vueDataAttrs)
                .append(
                    $sp('<span>')
                        .addClass('tag-title')
                        .text('数量')
                        .attr(vueDataAttrs)
                );

            const form = await waitForElement('#main > div.main > div.single-page-con > div > div');
            const formVue = form[0] && form[0].__vue__;
            if (!formVue) return;

            const handleSortClick = function () {
                $targetBtns.removeClass('active');
                $quantityBtn.addClass('active');
                if (formVue.sellForm) {
                    formVue.sellForm.sort = 'stock';
                    formVue.sellForm.pageNumber = 1;
                }
                if (typeof formVue.getSellData === 'function') formVue.getSellData();
            };

            // 只接管自己的按钮；原按钮保留站点自身排序逻辑，只清掉我方高亮
            $quantityBtn.on('click' + SORT_EVENT_NS, handleSortClick);
            $targetBtns.off(SORT_EVENT_NS).on('click' + SORT_EVENT_NS, () => {
                $quantityBtn.removeClass('active');
            });

            $targetBtns.last().after($quantityBtn);
            d('成功添加"数量"排序按钮');
        } catch (error) {
            console.error('[SteamPyTools] 添加"数量"排序按钮失败：', error);
        }
    }

    const TARGET_PATHS = ['/cdKey/cdKey', '/pro/cdKey/cdKeyCn'];
    const SELLER_CDKEY_PATH = '/pyUserInfo/sellerCDKey';
    let isInitialized = false;
    let isSellerInitialized = false;

    function isTargetPath() {
        const path = window.location.pathname;
        return TARGET_PATHS.some(p => path.startsWith(p));
    }

    function isSellerCDKeyPath() {
        return window.location.pathname.startsWith(SELLER_CDKEY_PATH);
    }

    function cleanUp() {
        if (!isInitialized) return;
        isInitialized = false;

        if (removeContentHook) {
            removeContentHook();
            removeContentHook = null;
        }
        stopCardObserver();
        const ui = document.getElementById('priceFilterContainer');
        if (ui) ui.remove();
        listStates = new WeakMap();
        d('cleanUp');
    }

    function sellerCleanUp() {
        if (!isSellerInitialized) return;
        isSellerInitialized = false;

        if (stopSellWatcher) {
            stopSellWatcher();
            stopSellWatcher = null;
        }
        if (restoreGoToChoose) restoreGoToChoose();
        $sp('#quantitySortBtn').off(SORT_EVENT_NS).remove();
        $sp('.ml-5-rem.c-point.tagBtn').off(SORT_EVENT_NS);
        d('sellerCleanUp');
    }

    function handlePathChange() {
        d('handlePathChange:', currentPath(), {
            isInitialized: isInitialized,
            isSellerInitialized: isSellerInitialized
        });
        if (typeof window.__spShowBadge === 'function') {
            window.__spShowBadge(
                'SteamPy v' + VERSION + ' | ' + (isTargetPath() ? '市场页' : isSellerCDKeyPath() ? '卖家页' : '其他页') +
                ' | 筛选面板=' + (isInitialized ? '已就绪' : (isTargetPath() ? '等待中' : '不适用')),
                isInitialized || isSellerInitialized ? '#388e3c' : '#f57c00'
            );
        }
        if (isTargetPath() && !isInitialized) {
            d('run script in cdKey path');
            buyInit().catch(error => console.error('[SteamPyTools] buyInit 失败：', error));
        } else if (!isTargetPath() && isInitialized) {
            cleanUp();
        }

        if (isSellerCDKeyPath() && !isSellerInitialized) {
            d('run script in sellerCDKey path');
            sellerInit().catch(error => console.error('[SteamPyTools] sellerInit 失败：', error));
        } else if (!isSellerCDKeyPath() && isSellerInitialized) {
            sellerCleanUp();
        }
    }

    async function buyInit() {
        if (isInitialized) return;
        d('buyInit 开始');
        isInitialized = true;
        try {
            injectStyles();
            await waitForElement('.tag.flex-row.align-items-center');
            insertFilterUI();
            await startContentMonitor();
            d('buyInit 完成');
        } catch (error) {
            isInitialized = false;
            d('buyInit 失败:', error && error.message);
            throw error;
        }
    }

    async function sellerInit() {
        if (isSellerInitialized) return;
        d('sellerInit 开始');
        isSellerInitialized = true;
        try {
            await waitForElement('div.main > div.single-page-con > div > div', $dom('#main'));
            d('sellerInit 完成');
            await startModalListener();
            await addQuantitySort();
            await startSellListListener();
        } catch (error) {
            isSellerInitialized = false;
            throw error;
        }
    }

    function currentPath() {
        return location.pathname + location.search + location.hash;
    }

    // 路径没变但初始化失败时也要重试，避免站点重复 replaceState 后脚本失效
    let lastPath = currentPath();
    function syncRouteAndHandle() {
        const nextPath = currentPath();
        const pathChanged = nextPath !== lastPath;
        if (pathChanged) d('路径变化:', lastPath, '->', nextPath);
        lastPath = nextPath;
        if (pathChanged || !isInitialized || !isSellerInitialized) {
            handlePathChange();
        }
    }

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
        originalPushState.apply(this, args);
        syncRouteAndHandle();
    };

    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        syncRouteAndHandle();
    };

    window.addEventListener('popstate', syncRouteAndHandle);
    window.addEventListener('hashchange', syncRouteAndHandle);
    if (!window.onurlchange) window.onurlchange = syncRouteAndHandle;
    document.addEventListener('DOMContentLoaded', syncRouteAndHandle);
    window.addEventListener('load', syncRouteAndHandle);
    // 站点可能覆盖 history 方法或在 DOM 渲染完成后才确定路径，定时兜底重试
    setInterval(syncRouteAndHandle, 2000);

    elmGetter.selector($sp);

    handlePathChange();
})();
