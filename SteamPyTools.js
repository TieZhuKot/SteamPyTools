// ==UserScript==
// @name            SteamPyTools
// @name:zh-CN      SteamPyTools
// @name:en         SteamPyTools
// @version         1.3
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
// @require         https://scriptcat.org/lib/637/1.4.8/ajaxHooker.js#sha256=dTF50feumqJW36kBpbf6+LguSLAtLr7CEs3oPmyfbiM=
// @require         https://scriptcat.org/lib/513/2.1.0/ElementGetter.js#sha256=aQF7JFfhQ7Hi+weLrBlOsY24Z2ORjaxgZNoni7pAz5U=
// @require         https://scriptcat.org/lib/532/1.0.2/ajax.js#sha384-oDDglpYUiMPlZ/QOkx2727Nl9Pw5b5BEX7IZ/5sEgbiboYYMDfwqHbMAk7X7bo/k
// @require         https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js
// @connect         steampy.com
// @connect         store.steampowered.com
// @connect         steamcommunity.com
// @connect         login.steampowered.com
// @run-at          document-start
// @license         MIT
// @namespace       TieZhuKot
// ==/UserScript==

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

(function () {
    'use strict';

    // 固定引用脚本自带的 jQuery，避免站点后续覆盖全局 $ / jQuery
    const $sp = window.jQuery;
    const DEBUG = false;

    const GM_KEY_STEAM_GAMES = 'steamGameList';
    const GM_KEY_FILTER_STATE = 'steamPriceFilterState';
    const SALE_CACHE_TTL = 12 * 60 * 60 * 1000;
    const SALE_CACHE_MAX = 200;
    const SORT_EVENT_NS = '.steamPySort';

    const KEYHOT_PATH_RE = /\/xboot\/(?:steamApp|steamGame|(?:ru|us|tl|ars)SteamGame)\/keyHot(?:[/?]|$)/;
    const GETONE_PATH_RE = /\/xboot\/(?:steamApp|steamGame|(?:ru|us|tl|ars)SteamGame)\/getOne(?:[/?]|$)/;

    function d(...args) {
        if (DEBUG) console.debug('[SteamPy++]', ...args);
    }

    function isScriptCat() {
        const handler = (typeof GM_info !== 'undefined' && GM_info && GM_info.scriptHandler) || '';
        return /scriptcat|script\s*cat|油猴猫/i.test(String(handler));
    }

    function notify(text) {
        GM_notification({
            title: 'SteamPy Plus',
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
        let timer;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`等待元素超时: ${selector}`)), timeout);
        });
        const waitPromise = root !== undefined
            ? elmGetter.get(selector, root)
            : elmGetter.get(selector);

        return Promise.race([waitPromise, timeoutPromise]).finally(() => clearTimeout(timer));
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
        try {
            // 脚本猫推荐 Promise 形式：GM.cookie.list
            if (window.GM && GM.cookie && typeof GM.cookie.list === 'function') {
                return asCookieArray(await GM.cookie.list(details));
            }
            // 油猴 GM_cookie.list 支持 Promise / 回调；脚本猫也兼容回调形式
            if (typeof GM_cookie === 'function' && typeof GM_cookie.list === 'function') {
                return await new Promise(resolve => {
                    let settled = false;
                    const finish = value => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        resolve(asCookieArray(value));
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
            // 先读分区 Cookie（Chrome 第三方 Cookie 分区场景），再读普通 Cookie
            let cookies = asCookieArray(await listCookies({ url: target.url, partitionKey: target.partitionKey }));
            if (!cookies.length) cookies = asCookieArray(await listCookies({ url: target.url }));
            if (!cookies.length && typeof GM_cookie === 'function') {
                // TM 5.2+：空 partitionKey 表示读取所有分区，后面按 name 去重
                cookies = asCookieArray(await listCookies({ url: target.url, partitionKey: {} }));
            }
            if (cookies.length) all.push(...cookies);
        }
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
                finalUrl: finalUrl
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

            d('Steam 数据同步完成：', {
                own: state.own.length,
                wish: state.wish.length,
                sub: state.sub.length
            });
            notify('同步Steam数据成功');
            return true;
        } catch (error) {
            console.error('[SteamPy++] 同步Steam数据失败：', error);
            notify('同步Steam数据失败，请检查控制台');
            return false;
        }
    }

    GM_registerMenuCommand('同步Steam数据', () => { syncSteamOwnGameData(); });

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
            return Promise.resolve(hit.data);
        }

        if (inflightSaleRequests.has(id)) {
            return inflightSaleRequests.get(id);
        }

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
        if (gameBlock.dataset.spAppId) return Number(gameBlock.dataset.spAppId);

        let appId = null;
        const iconImg = gameBlock.querySelector('.cdkGameIcon') || gameBlock.querySelector('.gameIcon');
        if (iconImg) {
            const imgUrl = (iconImg.dataset.src || iconImg.getAttribute('src') || '')
                .replace(/[`']/g, '')
                .trim();

            const appsMatch = imgUrl.match(/steam\/apps\/(\d+)/);
            if (appsMatch) {
                appId = Number(appsMatch[1]);
            }
            // bundles ID 不是 Steam App ID，不能用它拼 /app/ 链接，故不再返回
        }

        // 本地保存页或图片未加载时，尝试从 Steam 链接提取
        if (!appId) {
            const gameLink = gameBlock.querySelector('a[href*="steam"]');
            if (gameLink) {
                const appsMatch = gameLink.href.match(/steam\/apps\/(\d+)/);
                const appMatch = gameLink.href.match(/\/app\/(\d+)/);
                const match = appsMatch || appMatch;
                if (match) appId = Number(match[1]);
            }
        }

        if (Number.isFinite(appId) && appId > 0) {
            gameBlock.dataset.spAppId = String(appId);
            return appId;
        }

        d('[getSteamAppId] 无法提取 Steam App ID');
        return null;
    }

    // 游戏数据存储：setGameData 时建索引，避免每次线性 find
    const TempDataStore = {
        steamGameData: null,
        ratingMap: new Map(),

        setGameData(data) {
            this.steamGameData = data;
            const map = new Map();
            const content = data && data.result && data.result.content;
            if (Array.isArray(content)) {
                content.forEach(game => {
                    const id = Number(game && game.appId);
                    if (Number.isFinite(id)) map.set(id, game);
                });
            }
            this.ratingMap = map;
        },

        getGameInfo(appId) {
            return this.ratingMap.get(Number(appId)) || null;
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
        if (KEYHOT_PATH_RE.test(request.url)) {
            request.response = res => {
                try {
                    const originalData = JSON.parse(res.responseText);
                    TempDataStore.setGameData(originalData);
                    res.responseText = JSON.stringify(originalData);
                } catch (e) {
                    console.error('[SteamPy++] keyHot 接口数据处理失败：', e);
                }
            };
        } else if (GETONE_PATH_RE.test(request.url)) {
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
                    console.error('[SteamPy++] getOne 接口数据处理失败：', e);
                }
            };
        }
        return request;
    });

    function updateGameRating(gameBlock) {
        if (!gameBlock) return;

        const appId = getSteamAppId(gameBlock);
        if (!appId) return;

        if (wishSteamAppIds.has(appId)) {
            const gameName = gameBlock.querySelector('.gameName');
            if (gameName) gameName.classList.add('bg-blue');
        }

        const gameHead = gameBlock.querySelector('.gameHead') ||
            gameBlock.querySelector('.game-header') ||
            gameBlock.querySelector('.game-info') ||
            gameBlock;

        const rating = TempDataStore.getRatingByAppId(appId);
        let ratingEl = gameHead.querySelector('.gameRating');

        if (rating > 0) {
            const ratingPercent = Math.round(rating * 100);
            let ratingText;
            let ratingClass;

            if (ratingPercent >= 90) {
                ratingText = '好评如潮';
                ratingClass = 'overwhelmingly-positive';
            } else if (ratingPercent >= 80) {
                ratingText = '特别好评';
                ratingClass = 'very-positive';
            } else if (ratingPercent >= 70) {
                ratingText = '多半好评';
                ratingClass = 'positive';
            } else if (ratingPercent >= 40) {
                ratingText = '褒贬不一';
                ratingClass = 'mixed';
            } else if (ratingPercent >= 20) {
                ratingText = '多半差评';
                ratingClass = 'negative';
            } else {
                ratingText = '特别差评';
                ratingClass = 'very-negative';
            }

            const ratingCount = TempDataStore.getRatingCountByAppId(appId);
            const fullRatingText = ratingCount > 0 ? `${ratingText} (${ratingCount})` : ratingText;

            if (ratingEl) {
                if (ratingEl.textContent !== fullRatingText) ratingEl.textContent = fullRatingText;
                if (!ratingEl.classList.contains(ratingClass)) {
                    ratingEl.classList.remove(
                        'overwhelmingly-positive', 'very-positive', 'positive',
                        'mixed', 'negative', 'very-negative'
                    );
                    ratingEl.classList.add(ratingClass);
                }
            } else {
                ratingEl = document.createElement('div');
                ratingEl.className = `gameRating ${ratingClass}`;
                ratingEl.textContent = fullRatingText;
                gameHead.appendChild(ratingEl);
            }
        } else if (ratingEl) {
            ratingEl.remove();
        }
    }

    function injectStyles() {
        const existing = document.getElementById('steamPyPlusStyle');
        if (existing) return;

        const style = document.createElement('style');
        style.id = 'steamPyPlusStyle';
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
        if (gameBlock.dataset.spProcessed === 'true') return;

        const appId = getSteamAppId(gameBlock);
        if (!appId) return;
        gameBlock.dataset.spProcessed = 'true';

        gameBlock.addEventListener('mousedown', e => {
            if (e.button !== 1 || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            window.open(`https://store.steampowered.com/app/${appId}/`, '_blank');
        });
        // 阻止中键默认打开原链接，避免重复开标签
        gameBlock.addEventListener('auxclick', e => {
            if (e.button === 1) e.preventDefault();
        });
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

    async function startContentMonitor() {
        if (removeContentHook) return;
        await waitForElement('div.ivu-tabs-content div.flex-row.jc-space-flex-start.flex-wrap.w-auto');
        if (removeContentHook) return;

        const pane = $sp('.ivu-tabs-tabpane').get(0);
        if (!pane || !pane.__vue__) {
            console.warn('[SteamPy++] 未找到游戏列表 Vue 实例，评分与筛选未启用');
            return;
        }

        removeContentHook = addUpdatedHook(pane, function () {
            applyFilterGameList();

            const gameBlocks = this.$el ? this.$el.querySelectorAll('.gameblock') : [];
            gameBlocks.forEach(gameBlock => {
                updateGameRating(gameBlock);
                processGameOpen(gameBlock);
            });
        }, 'content');

        setTimeout(() => {
            applyFilterGameList();
            document.querySelectorAll('.gameblock').forEach(gameBlock => updateGameRating(gameBlock));
        }, 600);
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
                console.warn('[SteamPy++] 未找到卖家列表 Vue 实例');
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
            console.error('[SteamPy++] 卖家列表监听启动失败：', error);
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
            console.error('[SteamPy++] 弹窗监听启动失败：', error);
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
            console.error('[SteamPy++] 添加"数量"排序按钮失败：', error);
        }
    }

    const TARGET_PATH = '/cdKey/cdKey';
    const SELLER_CDKEY_PATH = '/pyUserInfo/sellerCDKey';
    let isInitialized = false;
    let isSellerInitialized = false;

    function isTargetPath() {
        return window.location.pathname.startsWith(TARGET_PATH);
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
        if (isTargetPath() && !isInitialized) {
            d('run script in cdKey path');
            buyInit().catch(error => console.error('[SteamPy++] buyInit 失败：', error));
        } else if (!isTargetPath() && isInitialized) {
            cleanUp();
        }

        if (isSellerCDKeyPath() && !isSellerInitialized) {
            d('run script in sellerCDKey path');
            sellerInit().catch(error => console.error('[SteamPy++] sellerInit 失败：', error));
        } else if (!isSellerCDKeyPath() && isSellerInitialized) {
            sellerCleanUp();
        }
    }

    async function buyInit() {
        if (isInitialized) return;
        isInitialized = true;
        try {
            injectStyles();
            await waitForElement('.tag.flex-row.align-items-center');
            insertFilterUI();
            await startContentMonitor();
        } catch (error) {
            isInitialized = false;
            throw error;
        }
    }

    async function sellerInit() {
        if (isSellerInitialized) return;
        isSellerInitialized = true;
        try {
            await waitForElement('div.main > div.single-page-con > div > div', $dom('#main'));
            d('sellerInit');
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
