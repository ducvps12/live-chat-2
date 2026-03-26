/**
 * NemarkChat Widget Loader v1.0
 * ─────────────────────────────
 * Nhúng lên website tenant bằng snippet:
 *
 *   <script>
 *     (function(w,d,s,o){
 *       w.NemarkChat=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
 *       var js=d.createElement(s);js.async=1;
 *       js.src='https://YOUR_DOMAIN/widget/loader.js';
 *       js.setAttribute('data-widget-id','WIDGET_ID');
 *       d.head.appendChild(js);
 *     })(window,document,'script','nchat');
 *   </script>
 *
 * Luồng:
 * 1. Đọc data-widget-id từ script tag
 * 2. Gọi API public lấy widget config (màu, lời chào, vị trí, ngôn ngữ, pre-chat form)
 * 3. Kiểm tra domain allowlist / blocklist
 * 4. Nếu hợp lệ → inject CSS + render bubble + chat window
 */
(function () {
    'use strict';

    // Prevent double loading
    if (window.__nchat_loaded) return;
    window.__nchat_loaded = true;

    // ── Visitor ID helpers (cookie + localStorage dual storage) ──
    var VISITOR_KEY = 'nchat_visitor_id';
    var COOKIE_DAYS = 365;

    function generateId() {
        // crypto.randomUUID if available, otherwise fallback
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function setCookie(name, value, days) {
        var d = new Date();
        d.setTime(d.getTime() + days * 86400000);
        document.cookie = name + '=' + encodeURIComponent(value)
            + ';expires=' + d.toUTCString()
            + ';path=/;SameSite=Lax';
    }

    function getCookie(name) {
        var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : null;
    }

    function getVisitorId() {
        // 1. Try localStorage
        var id = null;
        try { id = localStorage.getItem(VISITOR_KEY); } catch (e) { /* private mode */ }
        if (id) { syncStorage(id); return id; }

        // 2. Try cookie
        id = getCookie(VISITOR_KEY);
        if (id) { syncStorage(id); return id; }

        // 3. Generate new
        id = generateId();
        syncStorage(id);
        return id;
    }

    function syncStorage(id) {
        // Write to both storages for redundancy
        try { localStorage.setItem(VISITOR_KEY, id); } catch (e) { /* quota/private */ }
        setCookie(VISITOR_KEY, id, COOKIE_DAYS);
    }

    // Get or create persistent visitorId
    var visitorId = getVisitorId();

    // ── Visitor session helpers (persist pre-chat info across reloads) ──
    var SESSION_KEY = 'nchat_visitor_session';

    function saveVisitorSession(info) {
        try {
            var data = JSON.stringify({ visitorId: visitorId, info: info, ts: Date.now() });
            localStorage.setItem(SESSION_KEY, data);
        } catch (e) { /* private mode / quota */ }
    }

    function getVisitorSession() {
        try {
            var raw = localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            var session = JSON.parse(raw);
            // Only restore if same visitorId (safety check)
            if (session.visitorId !== visitorId) return null;
            // Expire after 30 days of inactivity
            if (Date.now() - session.ts > 30 * 86400000) {
                localStorage.removeItem(SESSION_KEY);
                return null;
            }
            return session;
        } catch (e) { return null; }
    }

    // ── 1. Tìm script tag để lấy widget ID ──
    var scripts = document.querySelectorAll('script[data-widget-id]');
    var currentScript = scripts[scripts.length - 1];
    if (!currentScript) { console.warn('[NemarkChat] Missing data-widget-id'); return; }

    var widgetId = currentScript.getAttribute('data-widget-id');
    if (!widgetId) { console.warn('[NemarkChat] Empty widget-id'); return; }

    // ── 2. Xác định API base URL ──
    // Priority: data-api-base attribute > script src origin > window.location.origin
    var scriptSrc = currentScript.getAttribute('src') || '';
    var explicitBase = currentScript.getAttribute('data-api-base') || '';
    var apiBase = '';

    if (explicitBase) {
        // Explicit override (e.g., from test modal or custom deployments)
        apiBase = explicitBase.replace(/\/+$/, ''); // trim trailing slashes
    } else {
        try {
            apiBase = new URL(scriptSrc).origin;
        } catch (e) {
            apiBase = window.location.origin;
        }
    }

    var CONFIG_URL = apiBase + '/api/workspaces/public/widgets/' + widgetId + '/config';

    // ── 3. Fetch config with retry ──
    var MAX_RETRIES = 2;
    var RETRY_DELAY = 2000;
    var _rendered = false; // guard: only one of renderWidget / renderFallback
    var _configFetching = false; // guard: prevent duplicate fetch

    function fetchConfig(attempt) {
        if (_configFetching) return;
        _configFetching = true;
        fetch(CONFIG_URL)
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (res) {
                if (!res.success || !res.data) {
                    console.warn('[NemarkChat] Widget not found or inactive');
                    renderFallback('inactive');
                    return;
                }

                var config = res.data.config || {};
                var rules = res.data.domainRules || {};

                // ── 4. Domain check ──
                var hostname = window.location.hostname;
                if (rules.domains && rules.domains.length > 0) {
                    var matched = rules.domains.some(function (d) {
                        if (d.indexOf('*.') === 0) {
                            var suffix = d.slice(2);
                            return hostname === suffix || hostname.endsWith('.' + suffix);
                        }
                        return hostname === d;
                    });

                    if (rules.mode === 'allowlist' && !matched) {
                        console.warn('[NemarkChat] Domain not in allowlist:', hostname);
                        return;
                    }
                    if (rules.mode === 'blocklist' && matched) {
                        console.warn('[NemarkChat] Domain blocklisted:', hostname);
                        return;
                    }
                }
                // allowlist empty → allow all

                // ── 5. Render ──
                var bh = res.data.businessHours || {};
                var widgetName = res.data.name || '';
                renderWidget(config, widgetId, apiBase, visitorId, bh, widgetName);
            })
            .catch(function (err) {
                _configFetching = false;
                console.error('[NemarkChat] Load failed (attempt ' + (attempt + 1) + '):', err.message);
                if (attempt < MAX_RETRIES) {
                    setTimeout(function () { fetchConfig(attempt + 1); }, RETRY_DELAY);
                } else {
                    renderFallback('error');
                }
            });
    }
    fetchConfig(0);

    // ────────────────────────────────────────
    // FALLBACK UI
    // ────────────────────────────────────────
    function renderFallback(reason) {
        if (_rendered) return;
        _rendered = true;

        // Cleanup any widget elements that may have partially rendered
        ['nchat-bubble', 'nchat-window'].forEach(function (id) {
            var el = document.getElementById(id); if (el) el.remove();
        });
        var css = document.createElement('style');
        css.textContent = [
            '#nchat-fallback-bubble{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;background:#9ca3af;border:none;cursor:default;z-index:2147483646;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);opacity:0.6;transition:opacity .2s}',
            '#nchat-fallback-bubble:hover{opacity:0.8}',
            '#nchat-fallback-bubble svg{width:28px;height:28px;fill:#fff}',
            '#nchat-fallback-tip{position:fixed;bottom:92px;right:16px;background:#374151;color:#fff;padding:8px 14px;border-radius:10px;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;z-index:2147483646;opacity:0;pointer-events:none;transition:opacity .2s;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.15)}',
            '#nchat-fallback-tip::after{content:"";position:absolute;bottom:-6px;right:24px;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #374151}',
            '#nchat-fallback-bubble:hover + #nchat-fallback-tip,#nchat-fallback-tip:hover{opacity:1}'
        ].join('\n');
        document.head.appendChild(css);

        var bubble = document.createElement('button');
        bubble.id = 'nchat-fallback-bubble';
        bubble.setAttribute('aria-label', 'Chat unavailable');
        bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>';
        document.body.appendChild(bubble);

        var tipText = reason === 'inactive'
            ? 'Widget không hoạt động'
            : 'Chat tạm thời không khả dụng';
        var tip = document.createElement('div');
        tip.id = 'nchat-fallback-tip';
        tip.textContent = tipText;
        document.body.appendChild(tip);

        // Expose minimal API so tenant code doesn't crash
        var globalObjName = typeof window.NemarkChat === 'string' ? window.NemarkChat : 'NemarkChat';
        var apiObj = window[globalObjName] || {};
        apiObj.open = function () { };
        apiObj.close = function () { };
        apiObj.toggle = function () { };
        apiObj.widgetId = widgetId;
        apiObj.visitorId = visitorId;
        apiObj.isOnline = false;
        apiObj.error = reason;
        window[globalObjName] = apiObj;
    }

    // ────────────────────────────────────────
    // RENDER
    // ────────────────────────────────────────
    function renderWidget(cfg, id, base, vid, bh, widgetName) {
        if (_rendered) return;

        // ── URL Targeting: check domain + path rules before rendering ──
        var urlRules = cfg.urlRules || {};
        var domainRules = urlRules.domains || [];
        var pathRules = urlRules.paths || [];

        function matchesUrlRules() {
            var currentHost = window.location.hostname;
            var currentPath = window.location.pathname;

            // Domain rules
            if (domainRules.length > 0) {
                var domainInclude = domainRules.filter(function(r) { return r.type === 'include'; });
                var domainExclude = domainRules.filter(function(r) { return r.type === 'exclude'; });

                // If there are include rules, current host must match at least one
                if (domainInclude.length > 0) {
                    var matched = false;
                    for (var i = 0; i < domainInclude.length; i++) {
                        if (currentHost.indexOf(domainInclude[i].value) !== -1) { matched = true; break; }
                    }
                    if (!matched) return false;
                }
                // Exclude rules: if current host matches any, block
                for (var j = 0; j < domainExclude.length; j++) {
                    if (currentHost.indexOf(domainExclude[j].value) !== -1) return false;
                }
            }

            // Path rules
            if (pathRules.length > 0) {
                var pathInclude = pathRules.filter(function(r) { return r.type === 'include'; });
                var pathExclude = pathRules.filter(function(r) { return r.type === 'exclude'; });

                if (pathInclude.length > 0) {
                    var pathMatched = false;
                    for (var k = 0; k < pathInclude.length; k++) {
                        if (currentPath.indexOf(pathInclude[k].value) !== -1 || pathInclude[k].value === '*') { pathMatched = true; break; }
                    }
                    if (!pathMatched) return false;
                }
                for (var l = 0; l < pathExclude.length; l++) {
                    if (currentPath.indexOf(pathExclude[l].value) !== -1) return false;
                }
            }

            return true;
        }

        // If URL rules exist and page doesn't match, don't render
        if ((domainRules.length > 0 || pathRules.length > 0) && !matchesUrlRules()) {
            console.log('[NemarkChat] URL rules: page does not match, widget hidden.');
            return;
        }

        _rendered = true;

        // Cleanup fallback if it was shown during retries
        ['nchat-fallback-bubble', 'nchat-fallback-tip'].forEach(function (fid) {
            var el = document.getElementById(fid); if (el) el.remove();
        });

        var color = cfg.primaryColor || '#6366f1';
        var pos = cfg.position || 'bottom-right';

        // ── Business hours helper ──
        function isOnline() {
            // If business hours not enabled → always online
            if (!bh || !bh.enabled) return true;

            var tz = bh.timezone || 'Asia/Ho_Chi_Minh';
            var schedule = bh.schedule || [];
            var holidays = bh.holidays || [];
            if (!schedule.length) return true; // no schedule = always online

            // Get current date/time in workspace timezone
            var now;
            try {
                var fmt = new Intl.DateTimeFormat('en-CA', {
                    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
                var parts = fmt.formatToParts(new Date());
                var get = function (t) { for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return parts[i].value; return ''; };
                now = {
                    dateStr: get('year') + '-' + get('month') + '-' + get('day'),
                    day: new Date(get('year') + '-' + get('month') + '-' + get('day')).getDay(),
                    timeMin: parseInt(get('hour')) * 60 + parseInt(get('minute'))
                };
            } catch (e) {
                // Fallback: use local time
                var d = new Date();
                now = {
                    dateStr: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
                    day: d.getDay(),
                    timeMin: d.getHours() * 60 + d.getMinutes()
                };
            }

            // Check holidays
            for (var h = 0; h < holidays.length; h++) {
                if (holidays[h].date === now.dateStr) return false;
            }

            // Find schedule for today (day 0=Sun ... 6=Sat)
            var todaySchedule = null;
            for (var s = 0; s < schedule.length; s++) {
                if (schedule[s].day === now.day) { todaySchedule = schedule[s]; break; }
            }
            if (!todaySchedule) return false; // no schedule for today = offline

            // Parse HH:mm to minutes
            var startParts = todaySchedule.start.split(':');
            var endParts = todaySchedule.end.split(':');
            var startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1] || 0);
            var endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1] || 0);

            return now.timeMin >= startMin && now.timeMin < endMin;
        }

        var online = isOnline();
        var isRight = pos === 'bottom-right' || pos === 'side-right';
        var isSide = pos === 'side-right' || pos === 'side-left';
        var isLeft = pos === 'bottom-left' || pos === 'side-left';
        var greeting = cfg.greeting || 'Xin chào! Chúng tôi có thể giúp gì?';
        var placeholder = cfg.placeholder || 'Nhập tin nhắn...';
        var pcf = cfg.preChatForm || {};
        var preChatEnabled = pcf.enabled || false;
        var lang = cfg.language || 'vi';

        // Advanced styling
        var bgVal = cfg.gradient || color;
        var launcherStyle = cfg.launcherStyle || 'bubble';
        var launcherText = cfg.launcherText || '';
        var launcherIcon = cfg.launcherIcon || '';
        var tooltipText = cfg.tooltipText || '';

        // ── Inject CSS ──
        var css = document.createElement('style');
        css.id = 'nchat-styles';

        // Launcher Button rules based on style
        var bubbleCss = '';
        var bubblePos = '';
        if (isSide) {
            bubblePos = 'top:50%;transform:translateY(-50%);' + (pos === 'side-right' ? 'right:0;' : 'left:0;');
            if (launcherStyle === 'tab') {
                bubbleCss = 'width:auto;height:48px;padding:0 16px;border-radius:' + (pos === 'side-right' ? '8px 0 0 8px' : '0 8px 8px 0') + ';display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px;';
            } else if (launcherStyle === 'image') {
                bubbleCss = 'width:64px;height:64px;background:transparent;box-shadow:none;border-radius:0;padding:0;';
            } else {
                bubbleCss = 'width:60px;height:60px;border-radius:' + (pos === 'side-right' ? '30px 0 0 30px' : '0 30px 30px 0') + ';display:flex;align-items:center;justify-content:center;';
            }
        } else {
            bubblePos = 'bottom:24px;' + (isRight ? 'right:24px;' : 'left:24px;');
            if (launcherStyle === 'pill') {
                bubbleCss = 'width:auto;height:52px;border-radius:26px;padding:0 24px;display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;';
            } else if (launcherStyle === 'image') {
                bubbleCss = 'width:64px;height:64px;background:transparent;box-shadow:none;border-radius:0;padding:0;';
            } else { // default bubble
                bubbleCss = 'width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;';
            }
        }

        // Window Pos
        var winPos = '';
        if (isSide) {
            winPos = (pos === 'side-right' ? 'right:80px;' : 'left:80px;') + 'top:50%;transform:translateY(calc(-50% + 16px)) scale(0.95);';
        } else {
            winPos = (isRight ? 'right:24px;' : 'left:24px;') + 'bottom:96px;transform:translateY(16px) scale(0.95);';
        }

        css.textContent = [
            // ── Reset for widget namespace ──
            '#nchat-bubble,#nchat-bubble *,#nchat-window,#nchat-window *,#nchat-tooltip,#nchat-tooltip *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}',

            // ── Bubble Launcher ──
            '#nchat-bubble{position:fixed;' + bubblePos + bubbleCss + 'background:' + bgVal + ';color:#fff;cursor:pointer;z-index:2147483647;box-shadow:' + (launcherStyle === 'image' ? 'none' : '0 4px 20px rgba(0,0,0,0.2)') + ';transition:all .35s cubic-bezier(.4,0,.2,1);border:none;outline:none}',
            '#nchat-bubble:hover{transform:' + (isSide ? 'translateY(-50%)' : 'translateY(0)') + ' scale(1.08);box-shadow:' + (launcherStyle === 'image' ? 'none' : '0 6px 28px rgba(0,0,0,0.25)') + '}',
            '#nchat-bubble svg{width:26px;height:26px;fill:currentColor;transition:transform .3s ease}',
            '#nchat-bubble img.nchat-custom-img{width:100%;height:100%;object-fit:cover;border-radius:50%;box-shadow:0 4px 16px rgba(0,0,0,0.15)}',
            '#nchat-bubble.nchat-opened-bubble{width:56px !important;height:56px !important;padding:0 !important;border-radius:' + (isSide ? (pos === 'side-right' ? '28px 0 0 28px' : '0 28px 28px 0') : '50%') + ' !important;background:' + color + ' !important}',
            '#nchat-bubble .nchat-badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(239,68,68,.4);border:2px solid #fff;padding:0 4px}',

            // ── Tooltip (Subiz card-style) ──
            '#nchat-tooltip{position:fixed;z-index:2147483647;background:#fff;color:#333;padding:12px 16px;border-radius:12px;font-size:13px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.12);opacity:0;pointer-events:none;transition:opacity .25s ease,transform .25s ease;transform:translateY(4px);max-width:240px;line-height:1.4}',
            '#nchat-tooltip.nchat-tip-visible{opacity:1;pointer-events:auto;transform:translateY(0)}',
            '#nchat-tooltip::after{content:"";position:absolute;bottom:-6px;' + (isRight ? 'right:24px;' : 'left:24px;') + 'border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #fff}',
            '.nchat-tip-hdr{display:flex;align-items:center;gap:8px;margin-bottom:4px}',
            '.nchat-tip-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;flex-shrink:0}',
            '.nchat-tip-name{font-weight:600;font-size:13px;color:#1a1a2e}',
            '.nchat-tip-sub{font-size:12px;color:#64748b;font-weight:400}',

            // ── Chat Window ──
            '#nchat-window{position:fixed;' + winPos + 'width:370px;max-width:calc(100vw - 24px);height:520px;max-height:min(520px,calc(100vh - 120px));border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.15),0 2px 8px rgba(0,0,0,0.06);z-index:2147483647;background:#fff;opacity:0;pointer-events:none;transition:all .3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column}',
            '#nchat-window.nchat-open{transform:' + (isSide ? 'translateY(-50%)' : 'translateY(0)') + ' scale(1);opacity:1;pointer-events:auto}',

            // ── Header (Subiz-inspired gradient with avatar) ──
            '#nchat-hdr{background:' + bgVal + ';padding:18px 16px 16px;color:#fff;position:relative;flex-shrink:0}',
            '#nchat-hdr-inner{display:flex;align-items:center;gap:12px}',
            '#nchat-hdr-avatar{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;border:2px solid rgba(255,255,255,.3)}',
            '#nchat-hdr-avatar img{width:100%;height:100%;object-fit:cover}',
            '#nchat-hdr-avatar svg{width:22px;height:22px;fill:rgba(255,255,255,.8)}',
            '#nchat-hdr-text{flex:1;min-width:0}',
            '#nchat-hdr h4{margin:0;font-size:15px;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '#nchat-hdr p{margin:2px 0 0;font-size:12px;opacity:.85;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '#nchat-hdr-close{position:absolute;top:16px;right:14px;background:rgba(255,255,255,.12);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;transition:background .2s;line-height:1}',
            '#nchat-hdr-close:hover{background:rgba(255,255,255,.25)}',
            '#nchat-hdr-close svg{width:16px;height:16px;fill:currentColor}',

            // Online indicator in header
            '.nchat-online{display:inline-flex;align-items:center;gap:5px;font-size:11px;margin-top:4px;opacity:.9}',
            '.nchat-online-dot{width:7px;height:7px;border-radius:50%;background:#4ade80;display:inline-block;animation:nchat-pulse 2s infinite}',
            '@keyframes nchat-pulse{0%,100%{opacity:1}50%{opacity:.4}}',
            '.nchat-offline-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;display:inline-block}',

            // Back button
            '#nchat-hdr-left{display:flex;align-items:center;gap:8px}',
            '#nchat-hdr-back{background:transparent;border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;display:none;align-items:center;justify-content:center;margin-left:-4px;transition:background 0.2s;flex-shrink:0}',
            '#nchat-hdr-back:hover{background:rgba(255,255,255,.2)}',
            '#nchat-hdr-back svg{width:20px;height:20px;fill:currentColor}',
            '#nchat-window.show-chat.has-list #nchat-hdr-back{display:flex}',

            // ── List View ──
            '#nchat-list-view{flex:1;overflow-y:auto;background:#f8f9fb;display:none;flex-direction:column;position:relative}',
            '.nchat-list-items{flex:1;overflow-y:auto;padding:12px}',
            '.nchat-list-item{background:#fff;border-radius:12px;padding:12px;margin-bottom:8px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.04);border:1px solid #f0f0f0;transition:all 0.2s;display:flex;align-items:center;gap:12px}',
            '.nchat-list-item:hover{border-color:' + color + ';box-shadow:0 2px 8px rgba(0,0,0,0.08);transform:translateY(-1px)}',
            '.nchat-list-avatar{width:40px;height:40px;border-radius:50%;background:' + bgVal + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0}',
            '.nchat-list-info{flex:1;min-width:0}',
            '.nchat-list-name{font-size:14px;font-weight:600;color:#1a1a2e;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.nchat-list-msg{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.nchat-list-time{font-size:11px;color:#94a3b8;flex-shrink:0}',
            '.nchat-list-footer{padding:12px;background:#fff;border-top:1px solid #f0f0f5}',
            '#nchat-new-conv{width:100%;padding:11px;background:' + bgVal + ';color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;transition:all 0.2s}',
            '#nchat-new-conv:hover{opacity:0.9;transform:translateY(-1px)}',
            '#nchat-new-conv svg{width:16px;height:16px;fill:currentColor}',

            // View switching
            '#nchat-chat-view{flex:1;display:none;flex-direction:column;overflow:hidden}',
            '#nchat-window.show-list #nchat-list-view{display:flex}',
            '#nchat-window.show-chat #nchat-chat-view{display:flex}',

            // ── Chat Body ──
            '#nchat-body{flex:1;overflow-y:auto;padding:16px;background:#f8f9fb;min-height:0}',

            // ── Empty State (Subiz-style SVG illustration) ──
            '.nchat-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;text-align:center;min-height:220px}',
            '.nchat-empty-state svg{width:120px;height:120px;margin-bottom:16px;opacity:.85}',
            '.nchat-empty-text{font-size:14px;color:#64748b;line-height:1.5;font-weight:500}',

            // ── Pre-chat form (redesigned) ──
            '#nchat-pcf{max-width:100%;padding:4px 0}',
            '#nchat-pcf .nchat-pcf-title{font-size:14px;font-weight:600;color:#1a1a2e;margin-bottom:16px}',
            '#nchat-pcf label{display:block;font-size:12px;font-weight:500;color:#475569;margin-bottom:4px}',
            '#nchat-pcf label .nchat-req{color:#ef4444;margin-left:2px}',
            '#nchat-pcf input{width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;margin-bottom:12px;box-sizing:border-box;outline:none;transition:border-color .2s,box-shadow .2s;background:#fff}',
            '#nchat-pcf input:focus{border-color:' + color + ';box-shadow:0 0 0 3px ' + color + '20}',
            '#nchat-pcf button{width:100%;padding:12px;border:none;border-radius:12px;background:' + bgVal + ';color:#fff;font-weight:600;cursor:pointer;font-size:14px;transition:all .2s;margin-top:4px}',
            '#nchat-pcf button:hover{opacity:.92;transform:translateY(-1px);box-shadow:0 4px 12px ' + color + '30}',
            '#nchat-pcf textarea{width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;margin-bottom:12px;box-sizing:border-box;outline:none;transition:border-color .2s,box-shadow .2s;font-family:inherit;resize:vertical;min-height:60px;max-height:120px;background:#fff}',
            '#nchat-pcf textarea:focus{border-color:' + color + ';box-shadow:0 0 0 3px ' + color + '20}',
            '#nchat-pcf select{width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;margin-bottom:12px;box-sizing:border-box;outline:none;transition:border-color .2s;background:#fff;cursor:pointer;appearance:auto}',
            '#nchat-pcf select:focus{border-color:' + color + '}',
            '.nchat-pcf-err{font-size:11px;color:#ef4444;margin:-8px 0 8px;line-height:1.3}',
            '#nchat-pcf input.nchat-invalid,#nchat-pcf textarea.nchat-invalid,#nchat-pcf select.nchat-invalid{border-color:#ef4444}',

            // ── Message Bubbles (improved) ──
            '.nchat-msg{margin-bottom:8px;display:flex;animation:nchat-fadeIn .25s ease}',
            '@keyframes nchat-fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
            '.nchat-msg-bot{justify-content:flex-start}',
            '.nchat-msg-user{justify-content:flex-end}',
            '.nchat-msg-bubble{max-width:78%;padding:10px 14px;border-radius:16px;font-size:13px;line-height:1.55;word-wrap:break-word;overflow-wrap:break-word}',
            '.nchat-msg-bot .nchat-msg-bubble{background:#fff;border:1px solid #e8ecf0;border-bottom-left-radius:4px;color:#1e293b;box-shadow:0 1px 2px rgba(0,0,0,0.04)}',
            '.nchat-msg-user .nchat-msg-bubble{background:' + bgVal + ';color:#fff;border-bottom-right-radius:4px}',

            // Message states
            '.nchat-msg-sending{opacity:.55}',
            '.nchat-msg-sending .nchat-msg-bubble{position:relative}',
            '.nchat-msg-sending .nchat-msg-bubble::after{content:"";position:absolute;bottom:4px;right:8px;width:10px;height:10px;border:2px solid rgba(255,255,255,.5);border-top-color:transparent;border-radius:50%;animation:nchat-spin .7s linear infinite}',
            '@keyframes nchat-spin{to{transform:rotate(360deg)}}',
            '.nchat-msg-error .nchat-msg-bubble{border:1.5px solid #ef4444 !important}',
            '.nchat-retry-btn{display:inline-block;margin-top:4px;padding:3px 12px;font-size:11px;color:#ef4444;background:none;border:1px solid #ef4444;border-radius:12px;cursor:pointer;transition:all .2s}',
            '.nchat-retry-btn:hover{background:#ef4444;color:#fff}',
            '.nchat-msg-status{display:block;font-size:10px;color:#94a3b8;margin-top:2px;text-align:right;line-height:1}',
            '.nchat-msg-status-sent::after{content:"✓"}',
            '.nchat-msg-status-delivered::after{content:"✓✓"}',
            '.nchat-msg-status-read::after{content:"✓✓";color:#34b7f1}',

            // ── Footer Input (Subiz-style clean bar) ──
            '#nchat-ftr{padding:10px 12px;border-top:1px solid #f0f0f5;display:flex;gap:6px;align-items:center;background:#fff;flex-shrink:0}',
            '#nchat-ftr input{flex:1;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:24px;font-size:13px;outline:none;transition:border-color .2s,box-shadow .2s;background:#f8f9fb;min-width:0}',
            '#nchat-ftr input:focus{border-color:' + color + ';background:#fff;box-shadow:0 0 0 3px ' + color + '15}',
            '#nchat-ftr input::placeholder{color:#94a3b8}',
            // Emoji button (decorative)
            '#nchat-emoji-btn{width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .2s;flex-shrink:0;padding:0}',
            '#nchat-emoji-btn:hover{color:' + color + '}',
            '#nchat-emoji-btn svg{width:20px;height:20px;fill:currentColor}',
            // Attachment / upload
            '#nchat-upload-btn{width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .2s;flex-shrink:0;padding:0}',
            '#nchat-upload-btn:hover{color:' + color + '}',
            '#nchat-upload-btn svg{width:20px;height:20px;fill:currentColor}',
            // Send button
            '#nchat-send{width:36px;height:36px;border-radius:50%;border:none;background:' + bgVal + ';color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;padding:0}',
            '#nchat-send:hover{opacity:.85;transform:scale(1.05)}',
            '#nchat-send svg{width:18px;height:18px;fill:currentColor}',

            // ── Branding (Subiz-style centered) ──
            '.nchat-brand{text-align:center;padding:8px;font-size:11px;color:#94a3b8;background:#fff;border-top:1px solid #f0f0f5;flex-shrink:0}',
            '.nchat-brand a{color:#64748b;text-decoration:none;font-weight:500;transition:color .2s}',
            '.nchat-brand a:hover{color:' + color + '}',
            '.nchat-brand svg{width:14px;height:14px;vertical-align:middle;margin-right:3px;fill:#94a3b8}',

            // ── Offline state ──
            '.nchat-offline-msg{padding:24px 16px;text-align:center;color:#64748b;font-size:13px;line-height:1.6}',
            '#nchat-offline-form{padding:16px}',
            '#nchat-offline-form label{display:block;font-size:12px;color:#475569;margin-bottom:4px;font-weight:500}',
            '#nchat-offline-form input,#nchat-offline-form textarea{width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;margin-bottom:12px;box-sizing:border-box;outline:none;transition:border-color .2s;font-family:inherit;background:#fff}',
            '#nchat-offline-form input:focus,#nchat-offline-form textarea:focus{border-color:' + color + '}',
            '#nchat-offline-form textarea{resize:vertical;min-height:60px}',
            '#nchat-offline-form button{width:100%;padding:12px;border:none;border-radius:12px;background:' + bgVal + ';color:#fff;font-weight:600;cursor:pointer;font-size:14px;transition:all .2s;margin-top:4px}',
            '#nchat-offline-form button:hover{opacity:.92;transform:translateY(-1px)}',

            // ── Image messages ──
            '.nchat-msg-img{max-width:100%;border-radius:10px;cursor:pointer;margin-top:4px;transition:opacity .2s}',
            '.nchat-msg-img:hover{opacity:.88}',
            '.nchat-img-preview{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.88);z-index:2147483647;display:flex;align-items:center;justify-content:center;cursor:zoom-out;animation:nchat-fadeIn .2s ease}',
            '.nchat-img-preview img{max-width:90%;max-height:90%;border-radius:8px}',

            // ── Typing indicator ──
            '.nchat-typing .nchat-msg-bubble{font-style:normal !important;opacity:1 !important;display:flex;align-items:center;gap:8px;padding:10px 16px}',
            '.nchat-dots{display:flex;gap:3px;align-items:center}',
            '.nchat-dots span{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:nchat-bounce 1.4s infinite ease-in-out both}',
            '.nchat-dots span:nth-child(1){animation-delay:0s}',
            '.nchat-dots span:nth-child(2){animation-delay:.16s}',
            '.nchat-dots span:nth-child(3){animation-delay:.32s}',
            '@keyframes nchat-bounce{0%,80%,100%{transform:scale(0.6);opacity:.4}40%{transform:scale(1);opacity:1}}',

            // ── Greeting Popup Card (Subiz-style floating notification) ──
            '#nchat-greeting{position:fixed;z-index:2147483646;' + (isRight ? 'right:24px;' : 'left:24px;') + 'bottom:96px;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);max-width:300px;opacity:0;transform:translateY(12px) scale(0.95);transition:all .35s cubic-bezier(.4,0,.2,1);pointer-events:none;overflow:hidden}',
            '#nchat-greeting.nchat-greeting-show{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}',
            '#nchat-greeting-inner{padding:14px 16px;display:flex;align-items:flex-start;gap:10px}',
            '#nchat-greeting-avatar{width:36px;height:36px;border-radius:50%;background:' + bgVal + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}',
            '#nchat-greeting-avatar img{width:100%;height:100%;object-fit:cover}',
            '#nchat-greeting-avatar svg{width:18px;height:18px;fill:#fff}',
            '#nchat-greeting-text{flex:1;min-width:0}',
            '.nchat-greeting-name{font-size:13px;font-weight:600;color:#1a1a2e;margin-bottom:2px}',
            '.nchat-greeting-msg{font-size:12px;color:#475569;line-height:1.4}',
            '#nchat-greeting-cta{display:block;padding:8px 16px;color:' + color + ';font-weight:600;font-size:13px;text-decoration:none;border-top:1px solid #f0f0f5;cursor:pointer;transition:background .2s;text-align:center}',
            '#nchat-greeting-cta:hover{background:#f8f9fb}',
            '#nchat-greeting-close{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;background:transparent;border:none;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s;padding:0;font-size:14px}',
            '#nchat-greeting-close:hover{background:#f1f5f9;color:#64748b}',
            '#nchat-greeting-close svg{width:14px;height:14px;fill:currentColor}',

            // ── CSAT Rating (stars after conversation close) ──
            '.nchat-csat{text-align:center;padding:16px}',
            '.nchat-csat-title{font-size:13px;color:#475569;margin-bottom:10px;font-weight:500}',
            '.nchat-csat-stars{display:flex;justify-content:center;gap:6px}',
            '.nchat-csat-star{width:32px;height:32px;cursor:pointer;fill:#d1d5db;transition:all .2s;border:none;background:none;padding:0}',
            '.nchat-csat-star:hover,.nchat-csat-star.nchat-star-active{fill:#f59e0b;transform:scale(1.15)}',
            '.nchat-csat-thanks{font-size:12px;color:#22c55e;margin-top:8px;font-weight:500;display:none}',

            // ── Mobile ──
            '@media(max-width:440px){#nchat-window{width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0;' + (isRight ? 'right:0' : 'left:0') + ';bottom:0;top:0}#nchat-window.nchat-open{transform:none}#nchat-bubble{' + (isSide ? '' : (isRight ? 'right:16px;' : 'left:16px;') + 'bottom:16px;width:52px;height:52px;') + '}}',
            '@media(min-width:441px) and (max-width:600px){#nchat-window{width:calc(100vw - 16px);' + (isRight ? 'right:8px' : 'left:8px') + ';bottom:80px;max-height:calc(100vh - 100px)}}'
        ].join('\n');
        document.head.appendChild(css);

        // ── Bubble ──
        var bubble = document.createElement('button');
        bubble.id = 'nchat-bubble';

        var iconHtml = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>';
        if (launcherIcon) {
            if (launcherIcon.indexOf('<svg') === 0) {
                iconHtml = launcherIcon;
            } else if (launcherStyle === 'image') {
                iconHtml = '<img src="' + launcherIcon + '" alt="Chat Icon" class="nchat-custom-img" />';
            } else if (launcherIcon.indexOf('.svg') !== -1) {
                iconHtml = '<div style="width:28px;height:28px;background-color:currentColor;-webkit-mask-image:url(' + launcherIcon + ');mask-image:url(' + launcherIcon + ');-webkit-mask-size:contain;mask-size:contain;-webkit-mask-position:center;mask-position:center;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;"></div>';
            } else {
                iconHtml = '<img src="' + launcherIcon + '" style="width:24px;height:24px;border-radius:2px;" alt="Chat Icon" />';
            }
        }

        if (launcherStyle === 'tab' || launcherStyle === 'pill') {
            bubble.innerHTML = iconHtml + (launcherText ? '<span>' + launcherText + '</span>' : '');
        } else {
            bubble.innerHTML = iconHtml;
        }
        bubble.setAttribute('aria-label', 'Open chat');
        document.body.appendChild(bubble);

        // ── Tooltip (Subiz-style card popup on hover) ──
        var tipEl = null;
        var tipTextRaw = tooltipText || (widgetName || '');
        if (tipTextRaw) {
            tipEl = document.createElement('div');
            tipEl.id = 'nchat-tooltip';
            var tipContent = '<div class="nchat-tip-hdr">'
                + '<span class="nchat-tip-dot' + (online ? '' : ' nchat-offline-dot') + '"></span>'
                + '<span class="nchat-tip-name">' + (widgetName || (lang === 'vi' ? 'Hỗ trợ' : 'Support')) + '</span>'
                + '</div>';
            if (tooltipText) {
                tipContent += '<div class="nchat-tip-sub">' + tooltipText + '</div>';
            } else {
                tipContent += '<div class="nchat-tip-sub">' + (online ? (lang === 'vi' ? 'Hỗ trợ 24/7' : 'Support 24/7') : (lang === 'vi' ? 'Để lại lời nhắn' : 'Leave a message')) + '</div>';
            }
            tipEl.innerHTML = tipContent;
            document.body.appendChild(tipEl);

            function positionTooltip() {
                var rect = bubble.getBoundingClientRect();
                tipEl.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
                if (isRight) {
                    tipEl.style.right = (window.innerWidth - rect.right) + 'px';
                    tipEl.style.left = 'auto';
                } else {
                    tipEl.style.left = rect.left + 'px';
                    tipEl.style.right = 'auto';
                }
            }

            bubble.addEventListener('mouseenter', function () {
                if (!win.classList.contains('nchat-open')) {
                    positionTooltip();
                    tipEl.classList.add('nchat-tip-visible');
                }
            });
            bubble.addEventListener('mouseleave', function () {
                tipEl.classList.remove('nchat-tip-visible');
            });
        }

        // ── Chat Window ──
        var win = document.createElement('div');
        win.id = 'nchat-window';

        // Header (Subiz-inspired with avatar)
        var statusDot = online
            ? '<div class="nchat-online"><span class="nchat-online-dot"></span>' + (lang === 'vi' ? 'Trực tuyến' : 'Online') + '</div>'
            : '<div class="nchat-online"><span class="nchat-offline-dot"></span>' + (lang === 'vi' ? 'Ngoại tuyến' : 'Offline') + '</div>';
        
        var backIcon = '<svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>';
        var avatarHtml = cfg.headerAvatar
            ? '<img src="' + cfg.headerAvatar + '" alt="" />'
            : '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>';
        var closeIcon = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>';
        var headerSubtext = greeting || (online
            ? (lang === 'vi' ? 'Chúng tôi sẵn sàng hỗ trợ bạn' : 'We\'re here to help you')
            : (lang === 'vi' ? 'Để lại lời nhắn, chúng tôi sẽ phản hồi sớm' : 'Leave a message, we\'ll get back to you'));
        var hdr = '<div id="nchat-hdr">'
            + '<div id="nchat-hdr-inner">'
            + '<button id="nchat-hdr-back" aria-label="Back">' + backIcon + '</button>'
            + '<div id="nchat-hdr-avatar">' + avatarHtml + '</div>'
            + '<div id="nchat-hdr-text">'
            + '<h4>' + (widgetName || (lang === 'vi' ? 'Hỗ trợ trực tuyến' : 'Live Support')) + '</h4>'
            + '<p>' + headerSubtext + '</p>'
            + statusDot
            + '</div>'
            + '</div>'
            + '<button id="nchat-hdr-close" aria-label="Close">' + closeIcon + '</button>'
            + '</div>';

        // ── LIST VIEW ──
        var newConvIcon = '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
        var listViewHtml = '<div id="nchat-list-view">'
            + '<div class="nchat-list-items"></div>'
            + '<div class="nchat-list-footer"><button id="nchat-new-conv">' + (lang === 'vi' ? 'Tạo hội thoại mới!' : 'New conversation') + ' ' + newConvIcon + '</button></div>'
            + '</div>';

        // ── CHAT VIEW ──
        // Body — check for existing session to skip pre-chat form
        var existingSession = getVisitorSession();
        var body = '<div id="nchat-chat-view"><div id="nchat-body">';

        if (!online) {
            // ── OFFLINE MODE: show offline message + leave-message form ──
            var offMsg = cfg.offlineMessage || (lang === 'vi'
                ? 'Hiện tại không có nhân viên trực tuyến. Vui lòng để lại lời nhắn.'
                : 'No agents are currently online. Please leave a message.');
            body += '<div class="nchat-offline-msg">' + offMsg + '</div>';
            body += '<form id="nchat-offline-form">';
            body += '<label>' + (lang === 'vi' ? 'Tên' : 'Name') + ' <span class="nchat-req">*</span></label>';
            body += '<input type="text" name="name" placeholder="' + (lang === 'vi' ? 'Họ và tên...' : 'Your name...') + '" required />';
            body += '<label>Email <span class="nchat-req">*</span></label>';
            body += '<input type="email" name="email" placeholder="email@example.com" required />';
            body += '<label>' + (lang === 'vi' ? 'Lời nhắn' : 'Message') + ' <span class="nchat-req">*</span></label>';
            body += '<textarea name="message" rows="3" placeholder="' + (lang === 'vi' ? 'Nội dung bạn cần hỗ trợ...' : 'How can we help you...') + '" required></textarea>';
            body += '<button type="submit">' + (lang === 'vi' ? 'Gửi lời nhắn' : 'Send message') + '</button>';
            body += '</form>';
        } else if (pcf.enabled && !existingSession) {
            // First visit: show pre-chat form
            body += '<form id="nchat-pcf">';
            body += '<div class="nchat-pcf-title">' + (pcf.title || (lang === 'vi' ? 'Vui lòng nhập thông tin để bắt đầu' : 'Please fill in your info')) + '</div>';
            var fields = pcf.fields || [];
            for (var i = 0; i < fields.length; i++) {
                var f = fields[i];
                if (!f.enabled) continue;
                var ph = f.placeholder || f.label + '...';
                body += '<label>' + f.label + (f.required ? '<span class="nchat-req">*</span>' : '') + '</label>';

                if (f.type === 'textarea') {
                    body += '<textarea name="' + f.key + '" placeholder="' + ph + '"' + (f.required ? ' required' : '') + ' rows="3"></textarea>';
                } else if (f.type === 'select' && f.options && f.options.length) {
                    body += '<select name="' + f.key + '"' + (f.required ? ' required' : '') + '>';
                    body += '<option value="">' + (lang === 'vi' ? 'Chọn ' : 'Select ') + f.label.toLowerCase() + '</option>';
                    for (var j = 0; j < f.options.length; j++) {
                        body += '<option value="' + f.options[j] + '">' + f.options[j] + '</option>';
                    }
                    body += '</select>';
                } else {
                    body += '<input type="' + (f.type || 'text') + '" name="' + f.key + '" placeholder="' + ph + '"' + (f.required ? ' required' : '') + ' />';
                }
            }
            body += '<button type="submit">' + (lang === 'vi' ? 'Bắt đầu chat' : 'Start chat') + '</button>';
            body += '</form>';
        } else if (existingSession) {
            // Returning visitor: restore session, skip form
            var vName = existingSession.info.name || (lang === 'vi' ? 'bạn' : 'you');
            window.__nchat_visitor = existingSession.info;
            window.__nchat_visitor_id = vid;
            body += '<div class="nchat-msg nchat-msg-bot"><div class="nchat-msg-bubble">'
                + (lang === 'vi'
                    ? 'Chào mừng <strong>' + vName + '</strong> quay lại! Bạn cần hỗ trợ gì?'
                    : 'Welcome back <strong>' + vName + '</strong>! How can we help?')
                + '</div></div>';
        } else {
            // No pre-chat form: show Subiz-style empty state illustration
            var emptyStateText = lang === 'vi' ? 'Gửi một tin nhắn để bắt đầu hội thoại!' : 'Send a message to start conversation!';
            body += '<div class="nchat-empty-state">'
                + '<svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">'
                + '<circle cx="115" cy="65" r="50" fill="none" stroke="' + color + '" stroke-width="3"/>'
                + '<circle cx="130" cy="55" r="5" fill="' + color + '"/>'
                + '<circle cx="115" cy="55" r="5" fill="' + color + '"/>'
                + '<path d="M105 72 Q115 82 125 72" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round"/>'
                + '<circle cx="75" cy="110" r="35" fill="none" stroke="' + color + '" stroke-width="3"/>'
                + '<circle cx="65" cy="110" r="3.5" fill="' + color + '"/>'
                + '<circle cx="75" cy="110" r="3.5" fill="' + color + '"/>'
                + '<circle cx="85" cy="110" r="3.5" fill="' + color + '"/>'
                + '</svg>'
                + '<div class="nchat-empty-text">' + emptyStateText + '</div>'
                + '</div>';
        }
        body += '</div>';

        // Footer with emoji, upload, input, send (Subiz-style)
        var emojiIcon = '<svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>';
        var attachIcon = '<svg viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>';
        var sendIcon = '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
        var ftr = '<div id="nchat-ftr">'
            + '<button id="nchat-emoji-btn" aria-label="Emoji">' + emojiIcon + '</button>'
            + '<label id="nchat-upload-btn" aria-label="Upload">' + attachIcon + '<input type="file" id="nchat-file-input" accept="image/*,.pdf,.doc,.docx" style="display:none" /></label>'
            + '<input type="text" id="nchat-input" placeholder="' + placeholder + '" />'
            + '<button id="nchat-send" aria-label="Send">' + sendIcon + '</button>'
            + '</div></div>'; // end nchat-chat-view

        // Branding (Subiz-style with icon)
        var brandIcon = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
        var brand = cfg.showBranding !== false
            ? '<div class="nchat-brand">' + brandIcon + ' <a href="https://nemarkdigital.com" target="_blank" rel="noopener">NemarkChat</a></div>'
            : '';

        win.innerHTML = hdr + listViewHtml + body + ftr + brand;
        document.body.appendChild(win);

        // ── Open / Close flow ──
        var STATE_KEY = 'nchat_ui_state';
        var hasOpenedOnce = false;

        // Restore previous open/close state from sessionStorage (survives reload, cleared on tab close)
        var savedState = null;
        try { savedState = sessionStorage.getItem(STATE_KEY); } catch (e) { }
        var isOpen = savedState === 'open';

        // ── Widget Notification Helpers ──
        var originalTitle = document.title;
        var unreadCount = 0;
        var __audioCtx = null;
        
        function playWidgetSound() {
            try {
                if (!__audioCtx) __audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (__audioCtx.state === 'suspended') __audioCtx.resume();
                
                var playTone = function(freq, startTime, duration) {
                    var osc = __audioCtx.createOscillator();
                    var gain = __audioCtx.createGain();
                    osc.connect(gain);
                    gain.connect(__audioCtx.destination);
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0, startTime);
                    gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                    osc.start(startTime);
                    osc.stop(startTime + duration);
                };
                playTone(600, __audioCtx.currentTime, 0.15);
                playTone(800, __audioCtx.currentTime + 0.1, 0.25);
            } catch(e) {}
        }

        function notifyNewMessage() {
            if (!isOpen || document.hidden) {
                unreadCount++;
                document.title = '(' + unreadCount + ') ' + (lang === 'vi' ? 'Bạn có tin nhắn mới!' : 'New message!');
                playWidgetSound();
                
                if (!isOpen) {
                    var b = document.getElementById('nchat-bubble');
                    if (b && !b.querySelector('.nchat-badge')) {
                        b.innerHTML += '<div class="nchat-badge" style="position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;font-size:11px;font-weight:bold;width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.2)">1</div>';
                    } else if (b) {
                        var badge = b.querySelector('.nchat-badge');
                        if (badge) badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                    }
                }
            }
        }

        function clearUnreadNotifications() {
            if (unreadCount > 0) {
                unreadCount = 0;
                document.title = originalTitle;
                var badge = document.querySelector('#nchat-bubble .nchat-badge');
                if (badge) badge.remove();
            }
        }

        window.addEventListener('focus', function() {
            if (isOpen) clearUnreadNotifications();
        });

        function emitEvent(name, detail) {
            try {
                window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
            } catch (e) { /* IE fallback: ignore */ }
        }

        // Save original launcher HTML to restore when closing
        var _originalBubbleHtml = bubble.innerHTML;

        function toggleChat(open) {
            var newState = typeof open === 'boolean' ? open : !isOpen;
            if (newState === isOpen) return; // no-op
            isOpen = newState;

            // Persist UI state across reload (sessionStorage = same tab only)
            try { sessionStorage.setItem(STATE_KEY, isOpen ? 'open' : 'closed'); } catch (e) { }

            // Update UI
            win.classList.toggle('nchat-open', isOpen);
            if (isOpen) {
                bubble.classList.add('nchat-opened-bubble');
                bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
            } else {
                bubble.classList.remove('nchat-opened-bubble');
                bubble.innerHTML = _originalBubbleHtml;
            }

            // Hide tooltip when chat is open
            if (tipEl) {
                if (isOpen) tipEl.classList.remove('nchat-tip-visible');
            }

            if (isOpen) {
                clearUnreadNotifications();
                // ── OPEN ──
                emitEvent('nchat:opened', { widgetId: id, visitorId: vid, firstOpen: !hasOpenedOnce });


                // Re-join conversation room
                if (_socket && _socket.connected && _conversationId) {
                    _socket.emit('join:conversation', { conversationId: _conversationId });
                }

                // Auto-evaluate view: if has conversations, show list. Else show chat.
                fetch(base + '/api/conversations/public/visitor/' + vid + '/widget/' + id)
                    .then(r => r.json())
                    .then(res => {
                        if (res.success && res.data && res.data.length > 0) {
                            switchView('list');
                        } else {
                            switchView('chat');
                        }
                    }).catch(() => switchView('chat'));

                if (!hasOpenedOnce) {
                    hasOpenedOnce = true;
                    // First open: trigger greeting animation (scroll body to top)
                    var bodyEl = win.querySelector('#nchat-body');
                    if (bodyEl) bodyEl.scrollTop = 0;
                }

                // Auto-focus input (or first form field)
                setTimeout(function () {
                    var pcfInput = win.querySelector('#nchat-pcf input');
                    var chatInput = win.querySelector('#nchat-input');
                    if (pcfInput) pcfInput.focus();
                    else if (chatInput) chatInput.focus();
                }, 300); // wait for CSS transition

            } else {
                // ── CLOSE ──
                // Leave conversation room to stop receiving events
                if (_socket && _socket.connected && _conversationId) {
                    _socket.emit('leave:conversation', { conversationId: _conversationId });
                }
                emitEvent('nchat:closed', { widgetId: id, visitorId: vid });
            }
        }

        // ── View Switching ──
        function switchView(view) {
            if (view === 'list') {
                win.classList.remove('show-chat');
                win.classList.add('show-list');
                // load list when entering list view
                loadConversationList();
            } else {
                win.classList.remove('show-list');
                win.classList.add('show-chat');
                // if we have items, add has-list to show back button
                if (win.querySelector('.nchat-list-items').children.length > 0) {
                    win.classList.add('has-list');
                } else {
                    win.classList.remove('has-list');
                }
            }
        }

        win.querySelector('#nchat-hdr-back').addEventListener('click', function() {
            switchView('list');
        });

        win.querySelector('#nchat-new-conv').addEventListener('click', function() {
            startNewConversation();
        });

        function startNewConversation() {
            var bodyEl = win.querySelector('#nchat-body');
            bodyEl.innerHTML = '<div class="nchat-msg nchat-msg-bot"><div class="nchat-msg-bubble">' + greeting + '</div></div>';
            _conversationId = null;
            _hasMoreMsgs = false;
            _msgPage = 1;
            switchView('chat');
            // Create a new empty conversation instantly
            if (window.__nchat_visitor || !pcf.enabled) {
                initConversation(window.__nchat_visitor || {}, null, true);
            }
        }

        function loadConversationList() {
            fetch(base + '/api/conversations/public/visitor/' + vid + '/widget/' + id)
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (res.success && res.data && res.data.length > 0) {
                        var listHtml = '';
                        var convs = res.data;
                        for (var i = 0; i < convs.length; i++) {
                            var c = convs[i];
                            var dateStr = new Date(c.updatedAt).toLocaleDateString();
                            var snippet = c.lastMessageSnippet || (lang === 'vi' ? 'Chưa có tin nhắn' : 'No messages yet');
                            var initial = 'N';
                            listHtml += '<div class="nchat-list-item" data-id="' + c._id + '">'
                                + '<div class="nchat-list-avatar">' + initial + '</div>'
                                + '<div class="nchat-list-info">'
                                + '<div class="nchat-list-name">' + (lang === 'vi' ? 'Hỗ trợ CSKH' : 'Support') + '</div>'
                                + '<div class="nchat-list-msg">' + snippet + '</div>'
                                + '</div><div class="nchat-list-time">' + dateStr + '</div></div>';
                        }
                        var listContainer = win.querySelector('.nchat-list-items');
                        listContainer.innerHTML = listHtml;
                        win.classList.add('has-list');
                        
                        // Bind clicks
                        var items = listContainer.querySelectorAll('.nchat-list-item');
                        for (var j = 0; j < items.length; j++) {
                            items[j].addEventListener('click', function(e) {
                                var convId = e.currentTarget.getAttribute('data-id');
                                openConversation(convId);
                            });
                        }
                    } else {
                        win.querySelector('.nchat-list-items').innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:13px">' + (lang === 'vi' ? 'Chưa có cuộc hội thoại nào' : 'No conversations yet') + '</div>';
                        win.classList.remove('has-list');
                    }
                })
                .catch(function(err) {});
        }

        function openConversation(convId) {
            _conversationId = convId;
            try { localStorage.setItem(CONV_KEY, _conversationId); } catch(e){}
            if (_socket && _socket.connected) {
                _socket.emit('join:conversation', { conversationId: _conversationId });
            }
            // Clear body and fetch history
            var bodyEl = win.querySelector('#nchat-body');
            bodyEl.innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:13px">...</div>';
            switchView('chat');
            
            _msgPage = 1;
            fetch(base + '/api/conversations/public/' + _conversationId + '/messages?page=1&limit=30')
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    bodyEl.innerHTML = '';
                    if (res.success && res.data) {
                        var msgs = res.data.items || [];
                        var totalMsgs = res.data.total || 0;
                        _hasMoreMsgs = (_msgPage * 30) < totalMsgs;
                        if (msgs.length > 0) renderMessages(msgs);
                        if (_hasMoreMsgs) renderLoadOlderButton();
                    } else {
                        bodyEl.innerHTML = '<div class="nchat-msg nchat-msg-bot"><div class="nchat-msg-bubble">' + greeting + '</div></div>';
                    }
                }).catch(function(){});
        }

        // Apply restored state (render correct icon & class without animation)
        if (isOpen) {
            win.classList.add('nchat-open');
            bubble.classList.add('nchat-opened-bubble');
            bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
            hasOpenedOnce = true;
            switchView('chat'); // default to chat, or load list to decide later
            loadConversationList();
        } else {
            switchView('chat'); // default hidden state
        }

        bubble.addEventListener('click', function () { toggleChat(); });
        win.querySelector('#nchat-hdr-close').addEventListener('click', function () { toggleChat(false); });

        // ESC key closes widget
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen) toggleChat(false);
        });

        // ── Greeting Popup Card (Subiz-style floating notification) ──
        var greetingCfg = cfg.greetingPopup || {};
        var greetingDismissed = false;
        var greetingEl = null;
        var GREETING_DISMISS_KEY = 'nchat_greeting_dismissed_' + id;

        try { greetingDismissed = sessionStorage.getItem(GREETING_DISMISS_KEY) === '1'; } catch (e) { }

        if (greetingCfg.enabled !== false && !greetingDismissed && !isOpen) {
            greetingEl = document.createElement('div');
            greetingEl.id = 'nchat-greeting';
            var greetAvatar = cfg.headerAvatar
                ? '<img src="' + cfg.headerAvatar + '" alt="" />'
                : '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
            var closeIcon = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
            var greetMsg = greetingCfg.message || greeting;
            var greetCta = greetingCfg.ctaText || (lang === 'vi' ? 'Gửi tin nhắn' : 'Send a message');
            greetingEl.innerHTML = '<button id="nchat-greeting-close" aria-label="Close">' + closeIcon + '</button>'
                + '<div id="nchat-greeting-inner">'
                + '<div id="nchat-greeting-avatar">' + greetAvatar + '</div>'
                + '<div id="nchat-greeting-text">'
                + '<div class="nchat-greeting-name">' + (widgetName || (lang === 'vi' ? 'Hỗ trợ' : 'Support')) + '</div>'
                + '<div class="nchat-greeting-msg">' + greetMsg + '</div>'
                + '</div>'
                + '</div>'
                + '<a id="nchat-greeting-cta">' + greetCta + '</a>';
            document.body.appendChild(greetingEl);

            // Show after delay
            var greetDelay = (greetingCfg.delay || 3) * 1000;
            setTimeout(function () {
                if (!isOpen && greetingEl && !greetingDismissed) {
                    greetingEl.classList.add('nchat-greeting-show');
                }
            }, greetDelay);

            // Click CTA → open widget
            greetingEl.querySelector('#nchat-greeting-cta').addEventListener('click', function () {
                greetingEl.classList.remove('nchat-greeting-show');
                toggleChat(true);
            });

            // Close button
            greetingEl.querySelector('#nchat-greeting-close').addEventListener('click', function (e) {
                e.stopPropagation();
                greetingEl.classList.remove('nchat-greeting-show');
                greetingDismissed = true;
                try { sessionStorage.setItem(GREETING_DISMISS_KEY, '1'); } catch (e2) { }
            });
        }

        // Hide greeting when widget opens
        var _origToggle = toggleChat;
        toggleChat = function (open) {
            _origToggle(open);
            if (greetingEl && isOpen) {
                greetingEl.classList.remove('nchat-greeting-show');
            }
        };
        // Re-bind bubble click with wrapped toggle
        bubble.removeEventListener('click', bubble.__nchatClick);
        bubble.__nchatClick = function () { toggleChat(); };
        bubble.addEventListener('click', bubble.__nchatClick);

        // ── Auto-open Timer ──
        var autoOpenCfg = cfg.autoOpen || {};
        var AUTO_OPEN_KEY = 'nchat_auto_opened_' + id;
        var alreadyAutoOpened = false;
        try { alreadyAutoOpened = sessionStorage.getItem(AUTO_OPEN_KEY) === '1'; } catch (e) { }

        if (autoOpenCfg.mode && autoOpenCfg.mode !== 'none' && !alreadyAutoOpened && !isOpen) {
            var autoDelay = 0;
            if (autoOpenCfg.mode === 'immediate') autoDelay = 500;
            else if (autoOpenCfg.mode === '20s') autoDelay = 20000;
            else if (autoOpenCfg.mode === '5min') autoDelay = 300000;
            else if (autoOpenCfg.mode === 'custom') autoDelay = (autoOpenCfg.customSeconds || 0) * 1000;

            if (autoDelay >= 0) {
                setTimeout(function () {
                    if (!isOpen) {
                        toggleChat(true);
                        try { sessionStorage.setItem(AUTO_OPEN_KEY, '1'); } catch (e) { }
                    }
                }, autoDelay);
            }
        }

        // ── Pre-chat form validation + submit ──
        var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        var PHONE_RE = /^[+]?[\d\s\-().]{7,20}$/;
        var MIN_LEN = 2;
        var MAX_LEN = 200;

        function clearFieldError(el) {
            el.classList.remove('nchat-invalid');
            var next = el.nextElementSibling;
            if (next && next.classList.contains('nchat-pcf-err')) next.remove();
        }

        function setFieldError(el, msg) {
            el.classList.add('nchat-invalid');
            // Remove existing error for this field first
            var next = el.nextElementSibling;
            if (next && next.classList.contains('nchat-pcf-err')) next.remove();
            var errDiv = document.createElement('div');
            errDiv.className = 'nchat-pcf-err';
            errDiv.textContent = msg;
            el.parentNode.insertBefore(errDiv, el.nextSibling);
        }

        function validateFields(formEl, fieldsCfg) {
            var valid = true;
            var fields = fieldsCfg || [];
            for (var i = 0; i < fields.length; i++) {
                var f = fields[i];
                if (!f.enabled) continue;
                var el = formEl.querySelector('[name="' + f.key + '"]');
                if (!el) continue;
                var val = (el.value || '').trim();

                clearFieldError(el);

                // Required check
                if (f.required && !val) {
                    setFieldError(el, (lang === 'vi' ? 'Vui lòng nhập ' : 'Please enter ') + f.label.toLowerCase());
                    valid = false;
                    continue;
                }

                if (!val) continue; // optional and empty → ok

                // Min length
                if (val.length < MIN_LEN) {
                    setFieldError(el, (lang === 'vi' ? 'Tối thiểu ' + MIN_LEN + ' ký tự' : 'Minimum ' + MIN_LEN + ' characters'));
                    valid = false;
                    continue;
                }

                // Max length
                if (val.length > MAX_LEN) {
                    setFieldError(el, (lang === 'vi' ? 'Tối đa ' + MAX_LEN + ' ký tự' : 'Maximum ' + MAX_LEN + ' characters'));
                    valid = false;
                    continue;
                }

                // Email format
                if (f.type === 'email' && !EMAIL_RE.test(val)) {
                    setFieldError(el, (lang === 'vi' ? 'Email không hợp lệ' : 'Invalid email address'));
                    valid = false;
                    continue;
                }

                // Phone format
                if (f.type === 'tel' && !PHONE_RE.test(val)) {
                    setFieldError(el, (lang === 'vi' ? 'Số điện thoại không hợp lệ' : 'Invalid phone number'));
                    valid = false;
                    continue;
                }

                // Select must have a non-empty value
                if (f.type === 'select' && !val) {
                    setFieldError(el, (lang === 'vi' ? 'Vui lòng chọn ' : 'Please select ') + f.label.toLowerCase());
                    valid = false;
                    continue;
                }
            }
            return valid;
        }

        var pcfEl = win.querySelector('#nchat-pcf');
        var CONV_KEY = 'nchat_conv_' + id;
        var _conversationId = null;
        var _lastMessageTs = null; // track for reconnect sync
        var _msgPage = 1;
        var _hasMoreMsgs = false;
        var _loadingOlder = false;
        var _pendingMessages = []; // { tid, retryFn }

        // Try to restore conversationId from localStorage
        try { _conversationId = localStorage.getItem(CONV_KEY); } catch (e) { }

        // ── Message rendering helper (with dedup + ordering) ──
        function appendMessage(msg, skipScroll) {
            var bodyEl = win.querySelector('#nchat-body');
            if (!bodyEl) return;

            // ── Skip system messages (internal staff notifications) ──
            if (msg.sender && msg.sender.type === 'system') return;

            // ── Dedup: skip if message already rendered ──
            if (msg._id && bodyEl.querySelector('[data-msg-id="' + msg._id + '"]')) return;

            var isVisitor = msg.sender && msg.sender.type === 'visitor';
            var div = document.createElement('div');
            div.className = 'nchat-msg ' + (isVisitor ? 'nchat-msg-user' : 'nchat-msg-bot');
            if (msg._id) div.setAttribute('data-msg-id', msg._id);
            var ts = msg.createdAt || new Date().toISOString();
            div.setAttribute('data-msg-ts', ts);
            _lastMessageTs = ts;

            if (msg.isRecalled) {
                div.innerHTML = '<div class="nchat-msg-bubble" style="font-style:italic;opacity:0.7">' + (lang === 'vi' ? 'Tin nhắn đã thu hồi' : 'Message recalled') + '</div>';
            } else {
                var replyHtml = '';
                if (msg.replyTo) {
                    var rCol = isVisitor ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)';
                    var rBdr = isVisitor ? 'rgba(255,255,255,0.5)' : '#ccc';
                    var rSnd = msg.replyTo.senderName || '';
                    var rTxt = msg.replyTo.content || '';
                    if (rTxt.length > 50) rTxt = rTxt.substring(0, 50) + '...';
                    replyHtml = '<div style="background:' + rCol + '; border-left:3px solid ' + rBdr + '; padding:4px 8px; margin-bottom:6px; font-size:12px; border-radius:4px; opacity:0.9">' +
                                '<div style="font-weight:bold;margin-bottom:2px">' + rSnd + '</div><div>' + rTxt + '</div></div>';
                }

                var bubbleHtml = '';
                if (msg.type === 'image' && msg.attachments && msg.attachments.length) {
                    for (var a = 0; a < msg.attachments.length; a++) {
                        var imgSrc = msg.attachments[a].data || '';
                        bubbleHtml += '<img src="' + imgSrc + '" class="nchat-msg-img" alt="' + (msg.attachments[a].filename || 'image') + '" />';
                    }
                    if (msg.content) bubbleHtml += '<div style="margin-top:4px">' + msg.content + '</div>';
                } else {
                    bubbleHtml = msg.content || '';
                }

                if (msg.isEdited) {
                    bubbleHtml += ' <span style="font-size:10px;opacity:0.6;margin-left:4px">(' + (lang === 'vi' ? 'đã chỉnh sửa' : 'edited') + ')</span>';
                }

                // Build status tick for visitor messages (own messages)
                var statusHtml = '';
                if (isVisitor && msg.status) {
                    statusHtml = '<span class="nchat-msg-status nchat-msg-status-' + msg.status + '"></span>';
                }

                div.innerHTML = '<div class="nchat-msg-bubble">' + replyHtml + bubbleHtml + '</div>' + statusHtml;
            }

            // ── Ordering: insert at correct chronological position ──
            var inserted = false;
            var existing = bodyEl.querySelectorAll('.nchat-msg[data-msg-ts]');
            for (var i = existing.length - 1; i >= 0; i--) {
                var existingTs = existing[i].getAttribute('data-msg-ts');
                if (existingTs && existingTs <= ts) {
                    // Insert after this element
                    if (existing[i].nextSibling) {
                        bodyEl.insertBefore(div, existing[i].nextSibling);
                    } else {
                        bodyEl.appendChild(div);
                    }
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                // Oldest message or empty — prepend or append
                if (existing.length > 0) {
                    bodyEl.insertBefore(div, existing[0]);
                } else {
                    bodyEl.appendChild(div);
                }
            }

            if (!skipScroll) {
                bodyEl.scrollTop = bodyEl.scrollHeight;
            }

            // Click image to preview
            if (!msg.isRecalled) {
                var imgs = div.querySelectorAll('.nchat-msg-img');
                for (var im = 0; im < imgs.length; im++) {
                    imgs[im].addEventListener('click', function (ev) {
                        var overlay = document.createElement('div');
                        overlay.className = 'nchat-img-preview';
                        overlay.innerHTML = '<img src="' + ev.target.src + '" />';
                        overlay.addEventListener('click', function () { overlay.remove(); });
                        document.body.appendChild(overlay);
                    });
                }
            }
        }
        
        function updateMessageElement(el, msg) {
            var isVisitor = msg.sender && msg.sender.type === 'visitor';
            if (msg.isRecalled) {
                el.innerHTML = '<div class="nchat-msg-bubble" style="font-style:italic;opacity:0.7">' + (lang === 'vi' ? 'Tin nhắn đã thu hồi' : 'Message recalled') + '</div>';
            } else {
                var replyHtml = '';
                if (msg.replyTo) {
                    var rCol = isVisitor ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)';
                    var rBdr = isVisitor ? 'rgba(255,255,255,0.5)' : '#ccc';
                    var rSnd = msg.replyTo.senderName || '';
                    var rTxt = msg.replyTo.content || '';
                    if (rTxt.length > 50) rTxt = rTxt.substring(0, 50) + '...';
                    replyHtml = '<div style="background:' + rCol + '; border-left:3px solid ' + rBdr + '; padding:4px 8px; margin-bottom:6px; font-size:12px; border-radius:4px; opacity:0.9">' +
                                '<div style="font-weight:bold;margin-bottom:2px">' + rSnd + '</div><div>' + rTxt + '</div></div>';
                }

                var bubbleHtml = '';
                if (msg.type === 'image' && msg.attachments && msg.attachments.length) {
                    for (var a = 0; a < msg.attachments.length; a++) {
                        var imgSrc = msg.attachments[a].data || '';
                        bubbleHtml += '<img src="' + imgSrc + '" class="nchat-msg-img" alt="' + (msg.attachments[a].filename || 'image') + '" />';
                    }
                    if (msg.content) bubbleHtml += '<div style="margin-top:4px">' + msg.content + '</div>';
                } else {
                    bubbleHtml = msg.content || '';
                }

                if (msg.isEdited) {
                    bubbleHtml += ' <span style="font-size:10px;opacity:0.6;margin-left:4px">(' + (lang === 'vi' ? 'đã chỉnh sửa' : 'edited') + ')</span>';
                }

                var statusHtml = '';
                if (isVisitor && msg.status) {
                    statusHtml = '<span class="nchat-msg-status nchat-msg-status-' + msg.status + '"></span>';
                }
                el.innerHTML = '<div class="nchat-msg-bubble">' + replyHtml + bubbleHtml + '</div>' + statusHtml;

                // Re-bind image clicks
                var imgs = el.querySelectorAll('.nchat-msg-img');
                for (var im = 0; im < imgs.length; im++) {
                    imgs[im].addEventListener('click', function (ev) {
                        var overlay = document.createElement('div');
                        overlay.className = 'nchat-img-preview';
                        overlay.innerHTML = '<img src="' + ev.target.src + '" />';
                        overlay.addEventListener('click', function () { overlay.remove(); });
                        document.body.appendChild(overlay);
                    });
                }
            }
        }

        function renderMessages(messages) {
            var bodyEl = win.querySelector('#nchat-body');
            if (!bodyEl) return;
            bodyEl.innerHTML = '';
            for (var m = 0; m < messages.length; m++) {
                appendMessage(messages[m], true);
            }
            bodyEl.scrollTop = bodyEl.scrollHeight;
        }

        function renderLoadOlderButton() {
            var bodyEl = win.querySelector('#nchat-body');
            if (!bodyEl) return;

            var btnId = 'nchat-load-older-btn';
            var existingBtn = bodyEl.querySelector('#' + btnId);

            if (!_hasMoreMsgs) {
                if (existingBtn) existingBtn.remove();
                return;
            }

            if (!existingBtn) {
                var btnWrap = document.createElement('div');
                btnWrap.id = btnId;
                btnWrap.style.textAlign = 'center';
                btnWrap.style.margin = '10px 0';

                var btn = document.createElement('button');
                btn.textContent = lang === 'vi' ? 'Tải tin nhắn cũ hơn' : 'Load older messages';
                btn.style.padding = '6px 12px';
                btn.style.fontSize = '12px';
                btn.style.borderRadius = '16px';
                btn.style.border = '1px solid #ddd';
                btn.style.background = '#f9f9f9';
                btn.style.color = '#555';
                btn.style.cursor = 'pointer';

                btn.onclick = function () {
                    if (_loadingOlder) return;
                    btn.textContent = '...';
                    _loadingOlder = true;
                    var nextPage = _msgPage + 1;
                    fetch(base + '/api/conversations/public/' + _conversationId + '/messages?page=' + nextPage + '&limit=30')
                        .then(function (r) { return r.json(); })
                        .then(function (res) {
                            _loadingOlder = false;
                            btn.textContent = lang === 'vi' ? 'Tải tin nhắn cũ hơn' : 'Load older messages';
                            if (res.success && res.data) {
                                var olderItems = res.data.items || [];
                                var total = res.data.total || 0;
                                _msgPage = nextPage;
                                _hasMoreMsgs = (_msgPage * 30) < total;

                                var oldScrollHeight = bodyEl.scrollHeight;

                                for (var m = 0; m < olderItems.length; m++) {
                                    appendMessage(olderItems[m], true);
                                }

                                if (!_hasMoreMsgs) {
                                    btnWrap.remove();
                                } else {
                                    bodyEl.insertBefore(btnWrap, bodyEl.firstChild);
                                }

                                setTimeout(function () {
                                    bodyEl.scrollTop = bodyEl.scrollHeight - oldScrollHeight;
                                }, 10);
                            }
                        })
                        .catch(function () {
                            _loadingOlder = false;
                            btn.textContent = lang === 'vi' ? 'Tải tin nhắn cũ hơn' : 'Load older messages';
                        });
                };
                btnWrap.appendChild(btn);
                bodyEl.insertBefore(btnWrap, bodyEl.firstChild);
            } else {
                bodyEl.insertBefore(existingBtn, bodyEl.firstChild);
            }
        }

        // ── Send message helpers (ACK + optimistic UI + error rollback) ──
        var _tempIdCounter = 0;
        function tempId() { return 'tmp_' + Date.now() + '_' + (++_tempIdCounter); }

        function markMessageAck(tmpId, serverMsg) {
            var el = win.querySelector('[data-msg-id="' + tmpId + '"]');
            if (!el) return;
            el.setAttribute('data-msg-id', serverMsg._id);
            el.setAttribute('data-msg-ts', serverMsg.createdAt);
            el.classList.remove('nchat-msg-sending');
            _lastMessageTs = serverMsg.createdAt;

            // Add sent tick ✓
            var statusEl = el.querySelector('.nchat-msg-status');
            if (!statusEl) {
                statusEl = document.createElement('span');
                statusEl.className = 'nchat-msg-status nchat-msg-status-sent';
                el.appendChild(statusEl);
            } else {
                statusEl.className = 'nchat-msg-status nchat-msg-status-sent';
            }

            // Remove from pending if exists
            _pendingMessages = _pendingMessages.filter(function (p) { return p.tid !== tmpId; });
        }

        function markMessageError(tmpId, retryFn) {
            var el = win.querySelector('[data-msg-id="' + tmpId + '"]');
            if (!el) return;
            el.classList.remove('nchat-msg-sending');
            el.classList.add('nchat-msg-error');

            // Add to pending queue if not already there
            var exists = false;
            for (var i = 0; i < _pendingMessages.length; i++) {
                if (_pendingMessages[i].tid === tmpId) { exists = true; break; }
            }
            if (!exists) {
                _pendingMessages.push({ tid: tmpId, retry: retryFn });
            }

            // Add retry button
            var retryBtn = document.createElement('button');
            retryBtn.className = 'nchat-retry-btn';
            retryBtn.textContent = 'Gửi lại';
            retryBtn.onclick = function () {
                _pendingMessages = _pendingMessages.filter(function (p) { return p.tid !== tmpId; });
                el.classList.remove('nchat-msg-error');
                el.classList.add('nchat-msg-sending');
                retryBtn.remove();
                retryFn();
            };
            el.appendChild(retryBtn);
        }

        function sendTextMessage(text) {
            if (!text || !_conversationId) {
                console.warn('[NemarkChat] sendTextMessage blocked — text:', !!text, 'convId:', _conversationId);
                return;
            }

            var tid = tempId();
            // Generate idempotency key (survives retries)
            var cmid = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : 'cmid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

            // Optimistic UI (with temp ID + sending state)
            appendMessage({ _id: tid, sender: { type: 'visitor' }, content: text, type: 'text', createdAt: new Date().toISOString() });
            var el = win.querySelector('[data-msg-id="' + tid + '"]');
            if (el) el.classList.add('nchat-msg-sending');

            var payload = { content: text, visitorId: vid, type: 'text', clientMessageId: cmid };
            function doSend() {
                fetch(base + '/api/conversations/public/' + _conversationId + '/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
                    .then(function (r) { return r.json(); })
                    .then(function (res) {
                        if (res.success && res.data) {
                            markMessageAck(tid, res.data);
                        } else {
                            console.error('[NemarkChat] Send failed:', res);
                            markMessageError(tid, doSend);
                        }
                    })
                    .catch(function (err) {
                        console.error('[NemarkChat] Send error:', err);
                        markMessageError(tid, doSend);
                    });
            }
            doSend();
        }

        // ── Upload file → base64 inline ──
        function uploadFile(file) {
            if (!file || !_conversationId) return;

            var reader = new FileReader();
            reader.onload = function (ev) {
                var b64 = ev.target.result;
                var attachment = { data: b64, filename: file.name, mimeType: file.type, size: file.size };
                var msgType = file.type.indexOf('image/') === 0 ? 'image' : 'file';

                var tid = tempId();
                // Optimistic UI
                appendMessage({
                    _id: tid,
                    sender: { type: 'visitor' },
                    content: '',
                    type: msgType,
                    attachments: [attachment],
                    createdAt: new Date().toISOString()
                });
                var el = win.querySelector('[data-msg-id="' + tid + '"]');
                if (el) el.classList.add('nchat-msg-sending');

                var payload = { content: '', visitorId: vid, type: msgType, attachments: [attachment] };
                function doSend() {
                    fetch(base + '/api/conversations/public/' + _conversationId + '/messages', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })
                        .then(function (r) { return r.json(); })
                        .then(function (res) {
                            if (res.success && res.data) {
                                markMessageAck(tid, res.data);
                            } else {
                                markMessageError(tid, doSend);
                            }
                        })
                        .catch(function () { markMessageError(tid, doSend); });
                }
                doSend();
            };
            reader.readAsDataURL(file);
        }

        // ── Collect session metadata ──
        function collectMetadata() {
            var meta = {
                pageUrl: window.location.href,
                referrer: document.referrer || '',
                domain: window.location.hostname
            };
            // Extract UTM params from URL
            try {
                var params = new URLSearchParams(window.location.search);
                ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
                    var v = params.get(k);
                    if (v) meta[k] = v;
                });
            } catch (e) { /* URLSearchParams not supported */ }
            return meta;
        }

        // ── Init conversation (findOrCreate) ──
        function initConversation(visitorInfo, callback, forceNew) {
            var meta = collectMetadata();
            fetch(base + '/api/conversations/public/find-or-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    widgetId: id,
                    visitorId: vid,
                    visitorInfo: visitorInfo || {},
                    metadata: meta,
                    forceNew: forceNew === true
                })
            })
                .then(function (r) { return r.json(); })
                .then(function (res) {
                    if (res.success && res.data) {
                        _conversationId = res.data.conversation._id;
                        _visitorToken = res.data.visitorToken || '';
                        try {
                            localStorage.setItem(CONV_KEY, _conversationId);
                            if (_visitorToken) localStorage.setItem(TOKEN_KEY, _visitorToken);
                        } catch (e) { }

                        // Connect socket if not yet connected, then join conversation room
                        connectSocket();
                        // Join room — socket may already be connected (from a restored token)
                        // or may connect shortly (async). Handle both cases.
                        function joinConvRoom() {
                            if (_socket && _socket.connected) {
                                _socket.emit('join:conversation', { conversationId: _conversationId });
                            }
                        }
                        joinConvRoom();
                        // Also retry after a short delay in case socket is still connecting
                        setTimeout(joinConvRoom, 1000);

                        // Enrich visitor with UTM/page attributes
                        if (meta.utm_source || meta.utm_medium || meta.utm_campaign) {
                            fetch(base + '/api/conversations/public/visitor/enrich', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    visitorId: vid,
                                    widgetId: id,
                                    attributes: meta
                                })
                            }).catch(function () { });
                        }

                        // Render existing messages if resuming
                        var msgs = res.data.messages || [];
                        var totalMsgs = res.data.totalMessages || 0;
                        _hasMoreMsgs = (_msgPage * 30) < totalMsgs;
                        if (msgs.length > 0 || !forceNew) {
                            var bodyEl = win.querySelector('#nchat-body');
                            bodyEl.innerHTML = ''; // reset just in case
                            if (msgs.length > 0) renderMessages(msgs);
                            else if (!forceNew) bodyEl.innerHTML = '<div class="nchat-msg nchat-msg-bot"><div class="nchat-msg-bubble">' + greeting + '</div></div>';
                        }
                        if (_hasMoreMsgs) {
                            renderLoadOlderButton();
                        }
                        if (callback) callback(res.data);
                    }
                })
                .catch(function (err) { console.error('[NemarkChat] Conversation init failed:', err); });
        }

        // ── Resume existing conversation on load ──
        if (existingSession || !preChatEnabled) {
            initConversation(existingSession ? existingSession.info : {});
        }

        // ── SPA page tracking ──
        (function () {
            var _lastUrl = window.location.href;
            var _trackTimer = null;

            function onRouteChange() {
                var newUrl = window.location.href;
                if (newUrl === _lastUrl || !_conversationId) return;
                _lastUrl = newUrl;

                // Debounce 500ms — avoid spamming during rapid nav
                if (_trackTimer) clearTimeout(_trackTimer);
                _trackTimer = setTimeout(function () {
                    fetch(base + '/api/conversations/public/' + _conversationId + '/tracking', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ visitorId: vid, pageUrl: newUrl })
                    }).catch(function () { });
                }, 500);
            }

            // Intercept pushState / replaceState
            var origPush = history.pushState;
            var origReplace = history.replaceState;
            history.pushState = function () {
                origPush.apply(this, arguments);
                onRouteChange();
            };
            history.replaceState = function () {
                origReplace.apply(this, arguments);
                onRouteChange();
            };

            // Back/forward button
            window.addEventListener('popstate', onRouteChange);
        })();

        // ── Auto-retry offline messages ──
        window.addEventListener('online', function () {
            if (_pendingMessages.length > 0) {
                console.log('[NemarkChat] Network restored. Retrying', _pendingMessages.length, 'messages...');
                // Copy array because retry function will remove elements
                var queue = _pendingMessages.slice();
                _pendingMessages = [];
                for (var i = 0; i < queue.length; i++) {
                    var p = queue[i];
                    var el = win.querySelector('[data-msg-id="' + p.tid + '"]');
                    if (el) {
                        el.classList.remove('nchat-msg-error');
                        el.classList.add('nchat-msg-sending');
                        var btn = el.querySelector('.nchat-retry-btn');
                        if (btn) btn.remove();
                    }
                    p.retry();
                }
            }
        });

        if (pcfEl) {
            // Clear errors on input/change
            pcfEl.addEventListener('input', function (ev) {
                if (ev.target && ev.target.classList) clearFieldError(ev.target);
            });
            pcfEl.addEventListener('change', function (ev) {
                if (ev.target && ev.target.classList) clearFieldError(ev.target);
            });

            pcfEl.addEventListener('submit', function (e) {
                e.preventDefault();

                // Validate against widget config fields
                var fieldsCfg = pcf.fields || [];
                if (!validateFields(pcfEl, fieldsCfg)) {
                    var firstErr = pcfEl.querySelector('.nchat-invalid');
                    if (firstErr) firstErr.focus();
                    return;
                }

                var fd = new FormData(pcfEl);
                var info = {};
                fd.forEach(function (val, key) { info[key] = val; });

                // Store visitor info + persist
                info.visitorId = vid;
                window.__nchat_visitor = info;
                window.__nchat_widget_id = id;
                window.__nchat_api_base = base;
                window.__nchat_visitor_id = vid;
                saveVisitorSession(info);

                // Create conversation via API
                initConversation(info, function (data) {
                    // Replace form with welcome message
                    var bodyEl = win.querySelector('#nchat-body');
                    if (data.messages && data.messages.length > 0) {
                        renderMessages(data.messages);
                    } else {
                        bodyEl.innerHTML = '<div class="nchat-msg nchat-msg-bot">'
                            + '<div class="nchat-msg-bubble">'
                            + (lang === 'vi'
                                ? 'Cảm ơn <strong>' + (info.name || 'bạn') + '</strong>! Một nhân viên sẽ hỗ trợ bạn ngay.'
                                : 'Thanks <strong>' + (info.name || 'you') + '</strong>! An agent will be with you shortly.')
                            + '</div></div>';
                    }

                    var input = win.querySelector('#nchat-input');
                    if (input) input.focus();
                });
            });
        }

        // ── Enter to send + Send button ──
        var chatInput = win.querySelector('#nchat-input');
        var sendBtn = win.querySelector('#nchat-send');

        if (chatInput) {
            chatInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    var text = chatInput.value.trim();
                    if (text) {
                        sendTextMessage(text);
                        chatInput.value = '';
                    }
                }
            });

            // Paste image from clipboard
            chatInput.addEventListener('paste', function (e) {
                var items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (var i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image/') === 0) {
                        e.preventDefault();
                        var blob = items[i].getAsFile();
                        if (blob) uploadFile(blob);
                        return;
                    }
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', function () {
                if (!chatInput) return;
                var text = chatInput.value.trim();
                if (text) {
                    sendTextMessage(text);
                    chatInput.value = '';
                    chatInput.focus();
                }
            });
        }

        // ── File upload button ──
        var fileInput = win.querySelector('#nchat-file-input');
        if (fileInput) {
            fileInput.addEventListener('change', function () {
                if (fileInput.files && fileInput.files[0]) {
                    uploadFile(fileInput.files[0]);
                    fileInput.value = ''; // reset for re-upload
                }
            });
        }

        // ── Offline form submit ──
        var offlineFormEl = win.querySelector('#nchat-offline-form');
        if (offlineFormEl) {
            offlineFormEl.addEventListener('submit', function (e) {
                e.preventDefault();
                var fd = new FormData(offlineFormEl);
                var data = {};
                fd.forEach(function (val, key) { data[key] = val; });
                data.widgetId = id;
                data.visitorId = vid;
                data.timestamp = new Date().toISOString();

                window.__nchat_offline_messages = window.__nchat_offline_messages || [];
                window.__nchat_offline_messages.push(data);

                window.dispatchEvent(new CustomEvent('nchat:offline_message', { detail: data }));

                try {
                    fetch(base + '/api/workspaces/public/widgets/' + id + '/offline-messages', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    }).catch(function () { });
                } catch (ex) { }

                var bodyEl = win.querySelector('#nchat-body');
                bodyEl.innerHTML = '<div class="nchat-offline-msg" style="padding:32px 16px">'
                    + '<div style="font-size:32px;margin-bottom:12px">✉️</div>'
                    + '<div style="font-weight:600;margin-bottom:6px;color:#333">'
                    + (lang === 'vi' ? 'Đã gửi lời nhắn!' : 'Message sent!')
                    + '</div><div>'
                    + (lang === 'vi'
                        ? 'Cảm ơn <strong>' + (data.name || 'bạn') + '</strong>! Chúng tôi sẽ phản hồi qua email sớm nhất.'
                        : 'Thanks <strong>' + (data.name || 'you') + '</strong>! We\'ll reply to your email shortly.')
                    + '</div></div>';
            });
        }

        // Hide footer input when offline
        if (!online) {
            var ftrEl = win.querySelector('#nchat-ftr');
            if (ftrEl) ftrEl.style.display = 'none';
        }

        // ── Socket.IO Realtime Connection ──
        var _socket = null;
        var TOKEN_KEY = 'nchat_visitor_token';
        var _visitorToken = '';
        try { _visitorToken = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { }

        function loadSocketClient(cb) {
            if (window.io) return cb();
            var s = document.createElement('script');
            s.src = base + '/socket.io/socket.io.js'; // served by socket.io server
            s.onload = cb;
            s.onerror = function () { console.warn('[NemarkChat] Socket.IO client load failed — realtime disabled'); };
            document.head.appendChild(s);
        }

        function connectSocket() {
            if (_socket || !online || !_visitorToken) return;
            loadSocketClient(function () {
                _socket = io(base + '/visitor', {
                    auth: { token: _visitorToken },
                    query: { conversationId: _conversationId || '', widgetId: id },
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionDelay: 2000,        // start at 2s
                    reconnectionDelayMax: 30000,     // cap at 30s
                    reconnectionAttempts: Infinity,   // never give up
                    randomizationFactor: 0.5,        // jitter ±50% to avoid thundering herd
                });

                _socket.on('connect', function () {
                    console.log('[NemarkChat] Socket connected:', _socket.id);
                    if (_conversationId) {
                        _socket.emit('join:conversation', { conversationId: _conversationId });

                        // Sync missed messages if reconnecting
                        if (_lastMessageTs) {
                            fetch(base + '/api/conversations/public/' + _conversationId + '/sync?since=' + encodeURIComponent(_lastMessageTs))
                                .then(function (r) { return r.json(); })
                                .then(function (res) {
                                    if (res.success && res.data && res.data.length > 0) {
                                        for (var i = 0; i < res.data.length; i++) {
                                            appendMessage(res.data[i]); // dedup + ordering handled inside
                                        }
                                    }
                                })
                                .catch(function () { });
                        }
                    }
                });

                // Incoming message from agent
                _socket.on('message:new', function (msg) {
                    console.log('[NemarkChat] Received message:new payload:', msg);
                    if (msg.sender && msg.sender.type !== 'visitor') {
                        appendMessage(msg); // dedup + ordering + timestamp tracking handled inside
                        notifyNewMessage();
                    }
                });

                _socket.on('message:edited', function (msg) {
                    console.log('[NemarkChat] Received message:edited:', msg);
                    if (!msg || !msg._id) return;
                    var el = win.querySelector('[data-msg-id="' + msg._id + '"]');
                    if (el) updateMessageElement(el, msg);
                });

                _socket.on('message:recalled', function (data) {
                    console.log('[NemarkChat] Received message:recalled:', data);
                    if (!data || !data.messageId) return;
                    var el = win.querySelector('[data-msg-id="' + data.messageId + '"]');
                    if (el) {
                        updateMessageElement(el, { isRecalled: true, sender: { type: 'agent' } });
                    }
                });

                // Typing indicators
                _socket.on('typing:start', function (data) {
                    if (data.sender && data.sender.type === 'agent') {
                        showTypingIndicator(data.sender.name || 'Agent');
                    }
                });

                _socket.on('typing:stop', function () {
                    hideTypingIndicator();
                });

                // ── Conversation closed by agent ──
                _socket.on('conversation:closed', function () {
                    var ftrEl = win.querySelector('#nchat-ftr');
                    if (ftrEl) {
                        ftrEl.innerHTML = '<div style="padding:12px 16px;text-align:center;color:#888;font-size:13px;background:#f3f4f6;border-top:1px solid #eee">'
                            + '🔒 ' + (lang === 'vi' ? 'Cuộc hội thoại đã đóng' : 'Conversation closed') + '</div>';
                    }

                    // ── CSAT Rating ──
                    if (cfg.requestRating) {
                        var bodyEl = win.querySelector('#nchat-body');
                        if (bodyEl) {
                            var csatDiv = document.createElement('div');
                            csatDiv.className = 'nchat-csat';
                            var csatTitle = lang === 'vi' ? 'Bạn đánh giá cuộc hội thoại này thế nào?' : 'How would you rate this conversation?';
                            var starSvg = '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
                            csatDiv.innerHTML = '<div class="nchat-csat-title">' + csatTitle + '</div>'
                                + '<div class="nchat-csat-stars">'
                                + '<button class="nchat-csat-star" data-rating="1">' + starSvg + '</button>'
                                + '<button class="nchat-csat-star" data-rating="2">' + starSvg + '</button>'
                                + '<button class="nchat-csat-star" data-rating="3">' + starSvg + '</button>'
                                + '<button class="nchat-csat-star" data-rating="4">' + starSvg + '</button>'
                                + '<button class="nchat-csat-star" data-rating="5">' + starSvg + '</button>'
                                + '</div>'
                                + '<div class="nchat-csat-thanks">' + (lang === 'vi' ? 'Cảm ơn bạn đã đánh giá! ⭐' : 'Thank you for your feedback! ⭐') + '</div>';
                            bodyEl.appendChild(csatDiv);
                            bodyEl.scrollTop = bodyEl.scrollHeight;

                            // Star click handlers
                            var stars = csatDiv.querySelectorAll('.nchat-csat-star');
                            for (var si = 0; si < stars.length; si++) {
                                stars[si].addEventListener('click', function () {
                                    var rating = parseInt(this.getAttribute('data-rating'));
                                    // Highlight stars up to selected
                                    for (var sj = 0; sj < stars.length; sj++) {
                                        if (sj < rating) stars[sj].classList.add('nchat-star-active');
                                        else stars[sj].classList.remove('nchat-star-active');
                                        stars[sj].style.pointerEvents = 'none'; // disable re-click
                                    }
                                    // Show thanks
                                    var thanks = csatDiv.querySelector('.nchat-csat-thanks');
                                    if (thanks) thanks.style.display = 'block';
                                    // Emit rating
                                    if (_socket && _socket.connected && _conversationId) {
                                        _socket.emit('conversation:rate', { conversationId: _conversationId, rating: rating });
                                    }
                                });
                            }
                        }
                    }
                });

                // ── Conversation reopened by agent ──
                _socket.on('conversation:reopened', function () {
                    var ftrEl = win.querySelector('#nchat-ftr');
                    if (ftrEl) {
                        ftrEl.innerHTML = '<button id="nchat-emoji-btn" aria-label="Emoji">' + emojiIcon + '</button>'
                            + '<label id="nchat-upload-btn" aria-label="Upload">' + attachIcon + '<input type="file" id="nchat-file-input" accept="image/*,.pdf,.doc,.docx" style="display:none" /></label>'
                            + '<input type="text" id="nchat-input" placeholder="' + placeholder + '" />'
                            + '<button id="nchat-send" aria-label="Send">' + sendIcon + '</button>';
                        // Re-attach send handlers
                        var inp2 = ftrEl.querySelector('#nchat-input');
                        var btn2 = ftrEl.querySelector('#nchat-send');
                        if (btn2) btn2.addEventListener('click', function () {
                            if (inp2 && inp2.value.trim()) { sendTextMessage(inp2.value.trim()); inp2.value = ''; }
                        });
                        if (inp2) inp2.addEventListener('keydown', function (e) {
                            if (e.key === 'Enter' && !e.shiftKey && inp2.value.trim()) {
                                e.preventDefault(); sendTextMessage(inp2.value.trim()); inp2.value = '';
                            }
                        });
                    }
                });

                _socket.on('disconnect', function (reason) {
                    console.log('[NemarkChat] Socket disconnected:', reason);
                });
            });
        }

        // Typing indicator UI helpers
        function showTypingIndicator(name) {
            var bodyEl = win.querySelector('#nchat-body');
            if (!bodyEl) return;
            var existing = bodyEl.querySelector('.nchat-typing');
            if (existing) existing.remove();
            var div = document.createElement('div');
            div.className = 'nchat-msg nchat-msg-bot nchat-typing';
            div.innerHTML = '<div class="nchat-msg-bubble">'
                + '<div class="nchat-dots"><span></span><span></span><span></span></div>'
                + '</div>';
            bodyEl.appendChild(div);
            bodyEl.scrollTop = bodyEl.scrollHeight;
        }

        function hideTypingIndicator() {
            var bodyEl = win.querySelector('#nchat-body');
            if (!bodyEl) return;
            var el = bodyEl.querySelector('.nchat-typing');
            if (el) el.remove();
        }

        // Connect socket if we already have a token (resume)
        if (_visitorToken) connectSocket();

        // ── Expose API ──
        var globalObjName = typeof window.NemarkChat === 'string' ? window.NemarkChat : 'NemarkChat';
        var apiObj = window[globalObjName] || {};
        apiObj.open = function () { toggleChat(true); };
        apiObj.close = function () { toggleChat(false); };
        apiObj.toggle = function () { toggleChat(); };
        apiObj.widgetId = id;
        apiObj.visitorId = vid;
        apiObj.isOnline = online;
        apiObj.sendMessage = sendTextMessage;
        apiObj.uploadFile = uploadFile;
        apiObj.socket = function () { return _socket; };
        window[globalObjName] = apiObj;
    }
})();

