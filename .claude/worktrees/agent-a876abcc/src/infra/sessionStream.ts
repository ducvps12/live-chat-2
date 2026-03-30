import { CDPSession, Page } from 'puppeteer';
import { env } from '../config/env';

/**
 * Start CDP screencast for a session.
 * Streams JPEG frames via callback.
 */
export function startScreencast(
    cdpSession: CDPSession,
    onFrame: (data: Buffer, metadata: { sessionId: number; timestamp: number }) => void
): void {
    cdpSession.on('Page.screencastFrame', async (event: any) => {
        try {
            const frameBuffer = Buffer.from(event.data, 'base64');
            onFrame(frameBuffer, {
                sessionId: event.sessionId,
                timestamp: event.metadata?.timestamp || Date.now(),
            });
            // ACK the frame so CDP sends next one
            await cdpSession.send('Page.screencastFrameAck', {
                sessionId: event.sessionId,
            });
        } catch (err) {
            // Silent — frame dropped
        }
    });

    cdpSession.send('Page.startScreencast', {
        format: 'jpeg',
        quality: env.SCREENCAST_QUALITY,
        maxWidth: 1280,
        maxHeight: 800,
        everyNthFrame: Math.max(1, Math.round(60 / env.SCREENCAST_FPS)),
    }).catch((err: any) => {
        console.error('[SessionStream] Failed to start screencast:', err.message);
    });
}

/**
 * Stop screencast for a session.
 */
export async function stopScreencast(cdpSession: CDPSession): Promise<void> {
    try {
        await cdpSession.send('Page.stopScreencast');
    } catch { /* already stopped */ }
}

// ────────── Input Dispatch ──────────

/**
 * Dispatch mouse event to browser via CDP.
 */
export async function dispatchMouse(
    cdpSession: CDPSession,
    type: 'mousePressed' | 'mouseReleased' | 'mouseMoved',
    x: number,
    y: number,
    button: 'left' | 'right' | 'middle' = 'left',
    clickCount: number = 1
): Promise<void> {
    await cdpSession.send('Input.dispatchMouseEvent', {
        type,
        x: Math.round(x),
        y: Math.round(y),
        button,
        clickCount,
    });
}

/**
 * Dispatch keyboard event to browser via CDP.
 */
export async function dispatchKeyboard(
    cdpSession: CDPSession,
    type: 'keyDown' | 'keyUp' | 'char',
    key: string,
    code: string = '',
    text: string = ''
): Promise<void> {
    const params: any = { type };

    if (type === 'char') {
        params.text = text || key;
    } else {
        params.key = key;
        if (code) params.code = code;
        if (text) params.text = text;
        // Handle modifiers
        if (key === 'Shift') params.modifiers = 8;
        if (key === 'Control') params.modifiers = 2;
        if (key === 'Alt') params.modifiers = 1;
        if (key === 'Meta') params.modifiers = 4;
    }

    await cdpSession.send('Input.dispatchKeyEvent', params);
}

/**
 * Dispatch scroll event via CDP.
 */
export async function dispatchScroll(
    cdpSession: CDPSession,
    x: number,
    y: number,
    deltaX: number,
    deltaY: number
): Promise<void> {
    await cdpSession.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: Math.round(x),
        y: Math.round(y),
        deltaX,
        deltaY,
    });
}

// ────────── Login State Detection ──────────

export type LoginState = 'qr_visible' | 'logged_in' | 'loading' | 'error' | 'unknown';

/**
 * Detect current login state of Zalo Web page.
 * Checks DOM for QR code vs chat list vs error states.
 */
export async function detectLoginState(page: Page): Promise<LoginState> {
    try {
        return await page.evaluate(() => {
            // Zalo Web QR login screen indicators
            const qrCanvas = document.querySelector('canvas');
            const qrImg = document.querySelector('img[src*="qr"]') || document.querySelector('[class*="qr"]');
            const loginContainer = document.querySelector('[class*="login"]') || document.querySelector('[class*="Login"]');

            // Chat list indicators (means logged in)
            const chatList = document.querySelector('[class*="conv-list"]') ||
                document.querySelector('[class*="conversation"]') ||
                document.querySelector('[class*="chat-list"]') ||
                document.querySelector('[id*="chatList"]');
            const chatInput = document.querySelector('[class*="chat-input"]') ||
                document.querySelector('[contenteditable="true"]');

            // Error indicators
            const errorEl = document.querySelector('[class*="error"]') ||
                document.querySelector('[class*="Error"]');

            if (chatList || chatInput) return 'logged_in';
            if (qrCanvas || qrImg || loginContainer) return 'qr_visible';
            if (errorEl) return 'error';

            // Check if still loading
            if (document.readyState !== 'complete') return 'loading';

            return 'unknown';
        }) as LoginState;
    } catch {
        return 'unknown';
    }
}

/**
 * Take a one-time screenshot (for debugging/thumbnail).
 */
export async function takeScreenshot(page: Page): Promise<Buffer> {
    return (await page.screenshot({ type: 'jpeg', quality: 70 })) as Buffer;
}

// ────────── Zalo Internal API (via webpack modules) ──────────

export interface ScrapedConversation {
    id: string;
    contactName: string;
    lastMessage: string;
    lastMessageAt: string;
    unreadCount: number;
    avatarUrl?: string;
}

export interface ScrapedMessage {
    id: string;
    content: string;
    senderType: 'me' | 'other';
    senderName: string;
    createdAt: string;
    type: 'text' | 'image' | 'file' | 'sticker';
}

/**
 * Take a debug screenshot and return as base64 (for diagnosing issues).
 */
export async function debugScrapeZalo(page: Page): Promise<{ screenshot: string; domInfo: string }> {
    try {
        const screenshot = await page.screenshot({ type: 'jpeg', quality: 60, encoding: 'base64' });
        const domInfo = await page.evaluate(() => {
            const url = window.location.href;
            const title = document.title;
            const bodyText = document.body?.innerText?.substring(0, 1000) || '';
            const vpWidth = window.innerWidth;
            const vpHeight = window.innerHeight;

            // Check if webpackJsonp is available
            const hasWebpack = !!(window as any).webpackJsonp;
            const webpackLen = hasWebpack ? (window as any).webpackJsonp.length : 0;

            return `URL: ${url}\nTitle: ${title}\nViewport: ${vpWidth}x${vpHeight}\nwebpackJsonp: ${hasWebpack ? 'YES' : 'NO'} (len=${webpackLen})\nBody text (first 500): ${bodyText.substring(0, 500)}`;
        });
        return { screenshot: screenshot as string, domInfo };
    } catch (err: any) {
        return { screenshot: '', domInfo: `Error: ${err.message}` };
    }
}

/**
 * Helper: Access a webpack module by ID inside page.evaluate().
 * Because module IDs can change between Zalo versions, we use dynamic discovery.
 * 
 * This function is injected into page.evaluate() as a string snippet.
 */
const WEBPACK_HELPER = `
    // ── Dynamic webpack module discovery ──
    function getWebpackModule(knownIds, fnNames) {
        var wp = window.webpackJsonp;
        if (!wp) return null;
        
        // Try known IDs first (fastest)
        for (var i = 0; i < knownIds.length; i++) {
            try {
                var mod = wp.push([[Math.random()], {}, [[knownIds[i]]]]);
                if (mod && mod.default) {
                    var hasAllFns = true;
                    for (var j = 0; j < fnNames.length; j++) {
                        if (typeof mod.default[fnNames[j]] !== 'function') {
                            hasAllFns = false;
                            break;
                        }
                    }
                    if (hasAllFns) return mod.default;
                }
            } catch(e) { /* module not found, skip */ }
        }
        
        // Dynamic discovery: scan webpack modules for matching function names
        // This is slower but resilient to module ID changes
        // Webpack stores modules in its internal registry
        try {
            var registry = null;
            // Access webpack's internal module registry
            wp.push([[Math.random()], { 
                '__discover__': function(module, exports, require) {
                    registry = require;
                }
            }, [['__discover__']]]);
            
            if (registry && registry.c) {
                var moduleIds = Object.keys(registry.c);
                for (var k = 0; k < moduleIds.length; k++) {
                    try {
                        var m = registry.c[moduleIds[k]];
                        if (m && m.exports && m.exports.default) {
                            var exp = m.exports.default;
                            var allMatch = true;
                            for (var f = 0; f < fnNames.length; f++) {
                                if (typeof exp[fnNames[f]] !== 'function') {
                                    allMatch = false;
                                    break;
                                }
                            }
                            if (allMatch) return exp;
                        }
                    } catch(e) {}
                }
            }
        } catch(e) {}
        
        return null;
    }
`;

/**
 * Get conversation list from Zalo Web via internal webpack API.
 * Uses getFriends() + getGroupsListSync() from Zalo's internal modules.
 * Falls back to DOM scraping if webpack is not available.
 */
export async function scrapeZaloConversations(page: Page): Promise<ScrapedConversation[]> {
    try {
        // Wait for page to be stable
        await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 2000));

        const result = await page.evaluate(new Function(`
            return (async function() {
                var debug = [];
                var conversations = [];
                
                debug.push('URL: ' + window.location.href);
                
                // Check if webpack is available
                if (!window.webpackJsonp) {
                    debug.push('webpackJsonp NOT available — page may not be fully loaded or not logged in');
                    return { conversations: [], debug: debug };
                }
                
                debug.push('webpackJsonp available, length=' + window.webpackJsonp.length);
                
                ${WEBPACK_HELPER}
                
                // ═══ STRATEGY 1: Get friends via internal API ═══
                var userModule = getWebpackModule(
                    ['XS0u', 'Xs0u', 'xs0u'],  // Known IDs for user module
                    ['getFriends']               // Must have getFriends
                );
                
                if (userModule) {
                    debug.push('Found user module with getFriends()');
                    try {
                        var friendsResult = await userModule.getFriends();
                        debug.push('getFriends() returned: ' + typeof friendsResult);
                        
                        if (friendsResult) {
                            var friendsList = [];
                            
                            // Handle different return formats
                            if (Array.isArray(friendsResult)) {
                                friendsList = friendsResult;
                            } else if (friendsResult.data) {
                                friendsList = Array.isArray(friendsResult.data) ? friendsResult.data : [];
                            } else if (friendsResult.friends) {
                                friendsList = friendsResult.friends;
                            }
                            
                            debug.push('Friends count: ' + friendsList.length);
                            
                            for (var i = 0; i < friendsList.length; i++) {
                                var f = friendsList[i];
                                conversations.push({
                                    id: f.userId || f.uid || f.id || ('zalo_friend_' + i),
                                    contactName: f.displayName || f.zaloName || f.name || f.dName || ('Friend ' + i),
                                    lastMessage: f.lastMsg || f.lastMessage || '',
                                    lastMessageAt: f.lastMsgTs ? new Date(f.lastMsgTs).toISOString() : new Date().toISOString(),
                                    unreadCount: f.unreadCount || f.unread || 0,
                                    avatarUrl: f.avatar || f.avatarUrl || f.thumbAvatar || '',
                                });
                            }
                        }
                    } catch(e) {
                        debug.push('getFriends() error: ' + e.message);
                    }
                } else {
                    debug.push('User module NOT found (tried XS0u variants)');
                }
                
                // ═══ STRATEGY 2: Get groups via internal API ═══
                var groupModule = getWebpackModule(
                    ['Gm1y', 'gm1y', 'GM1Y'],   // Known IDs for group module
                    ['getGroupsListSync']          // Must have getGroupsListSync
                );
                
                if (groupModule) {
                    debug.push('Found group module with getGroupsListSync()');
                    try {
                        var groupsResult = groupModule.getGroupsListSync();
                        debug.push('getGroupsListSync() returned: ' + typeof groupsResult);
                        
                        if (groupsResult) {
                            var groupsList = [];
                            if (Array.isArray(groupsResult)) {
                                groupsList = groupsResult;
                            } else if (groupsResult.data) {
                                groupsList = Array.isArray(groupsResult.data) ? groupsResult.data : [];
                            }
                            
                            debug.push('Groups count: ' + groupsList.length);
                            
                            for (var g = 0; g < groupsList.length; g++) {
                                var grp = groupsList[g];
                                conversations.push({
                                    id: grp.groupId || grp.gid || grp.id || ('zalo_group_' + g),
                                    contactName: '👥 ' + (grp.name || grp.groupName || grp.dName || ('Group ' + g)),
                                    lastMessage: grp.lastMsg || grp.lastMessage || '',
                                    lastMessageAt: grp.lastMsgTs ? new Date(grp.lastMsgTs).toISOString() : new Date().toISOString(),
                                    unreadCount: grp.unreadCount || grp.unread || 0,
                                    avatarUrl: grp.avatar || grp.avatarUrl || grp.thumbAvatar || '',
                                });
                            }
                        }
                    } catch(e) {
                        debug.push('getGroupsListSync() error: ' + e.message);
                    }
                } else {
                    debug.push('Group module NOT found (tried Gm1y variants)');
                }
                
                // ═══ STRATEGY 3: Try to access React component state ═══
                if (conversations.length === 0) {
                    debug.push('No conversations from webpack API, trying React state...');
                    try {
                        // React stores internal state in __reactFiber$ or __reactInternalInstance$
                        var rootEl = document.getElementById('root') || document.getElementById('app') || document.body.firstElementChild;
                        if (rootEl) {
                            var reactKey = Object.keys(rootEl).find(function(k) { 
                                return k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'); 
                            });
                            if (reactKey) {
                                debug.push('React fiber found on root element');
                                // Walk the React tree to find conversation store
                                var fiber = rootEl[reactKey];
                                var visited = 0;
                                var queue = [fiber];
                                while (queue.length > 0 && visited < 500) {
                                    var node = queue.shift();
                                    visited++;
                                    if (!node) continue;
                                    
                                    // Check memoizedState for conversation-like data
                                    if (node.memoizedState && node.memoizedState.memoizedState) {
                                        var state = node.memoizedState.memoizedState;
                                        if (state && typeof state === 'object') {
                                            // Look for arrays that look like conversation lists
                                            var stateValues = Object.values(state);
                                            for (var sv = 0; sv < stateValues.length; sv++) {
                                                if (Array.isArray(stateValues[sv]) && stateValues[sv].length > 0) {
                                                    var arr = stateValues[sv];
                                                    var first = arr[0];
                                                    if (first && (first.displayName || first.name || first.zaloName)) {
                                                        debug.push('Found conversation-like array in React state (' + arr.length + ' items)');
                                                        for (var ri = 0; ri < arr.length; ri++) {
                                                            var item = arr[ri];
                                                            conversations.push({
                                                                id: item.id || item.userId || ('react_conv_' + ri),
                                                                contactName: item.displayName || item.name || item.zaloName || ('User ' + ri),
                                                                lastMessage: item.lastMsg || item.lastMessage || '',
                                                                lastMessageAt: new Date().toISOString(),
                                                                unreadCount: item.unreadCount || 0,
                                                                avatarUrl: item.avatar || item.avatarUrl || '',
                                                            });
                                                        }
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    
                                    if (conversations.length > 0) break;
                                    if (node.child) queue.push(node.child);
                                    if (node.sibling) queue.push(node.sibling);
                                }
                                debug.push('React tree walk: visited ' + visited + ' nodes');
                            } else {
                                debug.push('No React fiber found on root');
                            }
                        }
                    } catch(e) {
                        debug.push('React state access error: ' + e.message);
                    }
                }
                
                // ═══ STRATEGY 4: DOM fallback (last resort) ═══
                if (conversations.length === 0) {
                    debug.push('All API strategies failed, falling back to DOM scan...');
                    var vpWidth = window.innerWidth;
                    var vpHeight = window.innerHeight;
                    
                    // Find visible list items in the left pane
                    var allEls = document.querySelectorAll('*');
                    var candidates = [];
                    
                    for (var ci = 0; ci < allEls.length; ci++) {
                        var container = allEls[ci];
                        var rect = container.getBoundingClientRect();
                        if (rect.left > vpWidth * 0.6) continue;
                        if (rect.right > vpWidth * 0.75) continue;
                        if (rect.width < 50 || rect.height < 80) continue;
                        
                        var children = Array.from(container.children);
                        var withText = children.filter(function(c) {
                            var cr = c.getBoundingClientRect();
                            return cr.height > 30 && cr.height < 150 && cr.width > 80
                                && (c.textContent || '').trim().length > 2;
                        });
                        
                        if (withText.length >= 2) {
                            var hasImgs = container.querySelectorAll('img').length > 0;
                            candidates.push({ items: withText, score: withText.length * 10 + (hasImgs ? 25 : 0) });
                        }
                    }
                    
                    candidates.sort(function(a, b) { return b.score - a.score; });
                    
                    if (candidates.length > 0) {
                        var bestItems = candidates[0].items;
                        debug.push('DOM fallback: found ' + bestItems.length + ' items');
                        
                        for (var di = 0; di < bestItems.length; di++) {
                            var item = bestItems[di];
                            var texts = [];
                            var walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT, null);
                            var wNode;
                            while (wNode = walker.nextNode()) {
                                var txt = (wNode.textContent || '').trim();
                                if (txt.length > 1 && txt.length < 200) texts.push(txt);
                            }
                            
                            var img = item.querySelector('img');
                            conversations.push({
                                id: 'zalo_dom_' + di,
                                contactName: texts[0] || ('Hội thoại ' + (di + 1)),
                                lastMessage: texts.length > 1 ? texts.slice(1).join(' ') : '',
                                lastMessageAt: new Date().toISOString(),
                                unreadCount: 0,
                                avatarUrl: img ? img.src : '',
                            });
                        }
                    } else {
                        debug.push('DOM fallback also failed');
                    }
                }
                
                return { conversations: conversations, debug: debug };
            })();
        `) as () => Promise<any>);

        console.log('[ZaloAPI] Debug:', result.debug.join(' | '));
        console.log(`[ZaloAPI] Found ${result.conversations.length} conversations`);
        if (result.conversations.length > 0) {
            console.log('[ZaloAPI] First:', JSON.stringify(result.conversations[0]).substring(0, 200));
        }
        return result.conversations;
    } catch (err: any) {
        console.error('[ZaloAPI] Failed to get conversations:', err);
        return [];
    }
}

/**
 * Click a conversation in the sidebar by contact name.
 * Searches for sidebar items containing the exact name text and clicks them.
 * Returns true if clicked successfully.
 */
async function clickConversationByName(page: Page, contactName: string): Promise<boolean> {
    console.log(`[ZaloNav] Clicking conversation: "${contactName}"...`);

    try {
        // === Strategy 1: Use Zalo's search functionality ===
        // Step 1: Find and click the search input
        // Zalo Web search bar selectors (try multiple)
        const searchSelectors = [
            'input[placeholder*="Tìm"]',
            'input[placeholder*="tìm"]', 
            'input[placeholder*="Search"]',
            'input[placeholder*="search"]',
            'input[type="text"]',
            'input[type="search"]',
        ];

        let searchInput = null;
        for (const sel of searchSelectors) {
            try {
                const inputs = await page.$$(sel);
                for (const input of inputs) {
                    const box = await input.boundingBox();
                    // Search bar should be near top of page and reasonably wide
                    if (box && box.y < 200 && box.width > 100) {
                        searchInput = input;
                        console.log(`[ZaloNav] Found search input via "${sel}" at y=${Math.round(box.y)}, w=${Math.round(box.width)}`);
                        break;
                    }
                }
                if (searchInput) break;
            } catch { /* try next */ }
        }

        if (searchInput) {
            // Step 2: Click and type contact name
            await searchInput.click({ clickCount: 3 }); // Select all existing text
            await new Promise(r => setTimeout(r, 200));
            await searchInput.press('Backspace'); // Clear
            await new Promise(r => setTimeout(r, 200));
            await searchInput.type(contactName, { delay: 30 });
            console.log(`[ZaloNav] Typed "${contactName}" into search bar, waiting for results...`);
            await new Promise(r => setTimeout(r, 2000)); // Wait for search results to load

            // Step 3: Find and click the matching search result
            const clicked = await page.evaluate((name: string) => {
                const vpWidth = window.innerWidth;
                const allEls = document.querySelectorAll('*');
                let bestMatch: HTMLElement | null = null;
                let bestScore = 0;
                const debug: string[] = [];
                let candidateCount = 0;

                for (let i = 0; i < allEls.length; i++) {
                    const el = allEls[i] as HTMLElement;
                    const rect = el.getBoundingClientRect();

                    // Must be in left half and below search bar
                    if (rect.left > vpWidth * 0.5) continue;
                    if (rect.top < 50) continue;
                    if (rect.height < 30 || rect.height > 120 || rect.width < 80) continue;

                    const text = el.textContent?.trim() || '';
                    if (!text.includes(name)) continue;

                    candidateCount++;
                    let score = 1000 - text.length;
                    if (el.querySelector('img')) score += 200;
                    if (rect.height > 40 && rect.height < 100) score += 100;
                    if (text.length < name.length * 5) score += 150;

                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = el;
                    }
                }

                debug.push(`candidates=${candidateCount}`);

                if (!bestMatch) {
                    return { clicked: false, debug };
                }

                bestMatch.scrollIntoView({ block: 'center' });
                const rect = bestMatch.getBoundingClientRect();
                debug.push(`match at [${Math.round(rect.left)},${Math.round(rect.top)}] ${Math.round(rect.width)}x${Math.round(rect.height)}`);
                bestMatch.click();
                return { clicked: true, debug, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            }, contactName);

            console.log(`[ZaloNav] Search result: ${JSON.stringify(clicked.debug)}`);

            if (clicked.clicked) {
                // Also do real mouse click
                if (clicked.x && clicked.y) {
                    await page.mouse.click(clicked.x, clicked.y);
                }
                console.log(`[ZaloNav] ✓ Clicked "${contactName}" from search results`);
                await new Promise(r => setTimeout(r, 1000));

                // Clear search (press Escape to go back to conversation list)
                await page.keyboard.press('Escape');
                await new Promise(r => setTimeout(r, 500));
                return true;
            }

            console.log(`[ZaloNav] Search results didn't contain "${contactName}", clearing search...`);
            // Clear search
            await page.keyboard.press('Escape');
            await new Promise(r => setTimeout(r, 500));
        } else {
            console.log(`[ZaloNav] No search input found, trying keyboard shortcut...`);
            
            // Try Ctrl+F or just clicking in the sidebar header area
            // Some Zalo versions open search on Ctrl+F  
            await page.keyboard.down('Control');
            await page.keyboard.press('KeyF');
            await page.keyboard.up('Control');
            await new Promise(r => setTimeout(r, 500));
            
            // Check if a search input appeared
            for (const sel of searchSelectors) {
                const input = await page.$(sel);
                if (input) {
                    const box = await input.boundingBox();
                    if (box) {
                        await input.type(contactName, { delay: 30 });
                        await new Promise(r => setTimeout(r, 1500));
                        await page.keyboard.press('Enter');
                        await new Promise(r => setTimeout(r, 1000));
                        await page.keyboard.press('Escape');
                        console.log(`[ZaloNav] Used Ctrl+F search for "${contactName}"`);
                        return true;
                    }
                }
            }
        }

        // === Strategy 2: Direct sidebar click (for visible items) ===
        console.log(`[ZaloNav] Trying direct sidebar click for "${contactName}"...`);
        const directClick = await page.evaluate((name: string) => {
            const vpWidth = window.innerWidth;
            const allEls = document.querySelectorAll('*');
            let bestMatch: HTMLElement | null = null;
            let bestScore = 0;

            for (let i = 0; i < allEls.length; i++) {
                const el = allEls[i] as HTMLElement;
                const rect = el.getBoundingClientRect();
                if (rect.left > vpWidth * 0.5) continue;
                if (rect.height < 30 || rect.height > 150 || rect.width < 80) continue;

                const text = el.textContent?.trim() || '';
                if (!text.includes(name)) continue;

                let score = 1000 - text.length;
                if (el.querySelector('img')) score += 200;
                if (rect.height > 40 && rect.height < 100) score += 100;
                if (text.length < name.length * 5) score += 150;

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = el;
                }
            }

            if (!bestMatch) return { clicked: false };
            bestMatch.scrollIntoView({ block: 'center' });
            bestMatch.click();
            const rect = bestMatch.getBoundingClientRect();
            return { clicked: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }, contactName);

        if (directClick.clicked) {
            console.log(`[ZaloNav] ✓ Found "${contactName}" via direct sidebar click`);
            if (directClick.x && directClick.y) {
                await new Promise(r => setTimeout(r, 300));
                await page.mouse.click(directClick.x, directClick.y);
            }
            await new Promise(r => setTimeout(r, 1500));
            return true;
        }

        console.warn(`[ZaloNav] ✗ Could not find conversation "${contactName}" via any strategy`);
        return false;
    } catch (err: any) {
        console.error(`[ZaloNav] Error:`, err.message);
        return false;
    }
}

/**
 * Get message history from Zalo Web.
 * Clicks conversation by contactName then scrapes messages from chat pane.
 * 
 * @param page - Puppeteer page  
 * @param contactName - exact contact name to click in sidebar (empty = scrape current chat)
 */
export async function scrapeZaloMessages(page: Page, contactName: string): Promise<ScrapedMessage[]> {
    try {
        // If contactName provided, click that conversation first
        if (contactName && contactName.length > 0) {
            const clicked = await clickConversationByName(page, contactName);
            if (!clicked) {
                console.warn(`[ZaloAPI] Could not open conversation "${contactName}"`);
                return [];
            }
        }

        // Scrape messages from the currently open chat pane
        const result = await page.evaluate(() => {
            const debug: string[] = [];
            const messages: any[] = [];
            const vpWidth = window.innerWidth;
            const vpHeight = window.innerHeight;

            // Find the message area (right side, scrollable, with message bubbles)
            let msgContainer: Element | null = null;
            let bestScore = -1;

            const allEls = document.querySelectorAll('*');
            for (let i = 0; i < allEls.length; i++) {
                const el = allEls[i];
                const rect = el.getBoundingClientRect();
                // Must be in right half (chat area)
                if (rect.left < vpWidth * 0.15) continue;
                if (rect.height < 100 || rect.width < vpWidth * 0.2) continue;

                const style = getComputedStyle(el);
                const isScrollable = ['auto', 'scroll', 'overlay'].includes(style.overflowY)
                    || el.scrollHeight > el.clientHeight + 10;
                if (!isScrollable) continue;

                // Count descendant elements that look like message bubbles
                let bubbleCount = 0;
                const desc = el.querySelectorAll('*');
                for (let d = 0; d < Math.min(desc.length, 500); d++) {
                    const dr = desc[d].getBoundingClientRect();
                    if (dr.height < 20 || dr.height > 500 || dr.width < 40) continue;
                    const ds = getComputedStyle(desc[d]);
                    const hasBg = ds.backgroundColor && ds.backgroundColor !== 'rgba(0, 0, 0, 0)' && ds.backgroundColor !== 'transparent';
                    const hasRadius = ds.borderRadius && ds.borderRadius !== '0px';
                    if (hasBg && hasRadius) bubbleCount++;
                }

                let score = bubbleCount * 5;
                score += rect.left > vpWidth * 0.3 ? 30 : 0;
                score += rect.height > 300 ? 20 : 0;
                score -= rect.width > vpWidth * 0.9 ? 100 : 0;

                if (score > bestScore) { bestScore = score; msgContainer = el; }
            }

            if (!msgContainer) {
                debug.push('No message container found');
                return { messages: [], debug };
            }

            const containerRect = msgContainer.getBoundingClientRect();
            debug.push(`Container: ${Math.round(containerRect.width)}x${Math.round(containerRect.height)}, score=${bestScore}`);

            // Find message bubbles
            const bubbles: Array<{ text: string; top: number; isMine: boolean; len: number }> = [];
            const desc2 = msgContainer.querySelectorAll('*');

            for (let b = 0; b < desc2.length; b++) {
                const bEl = desc2[b];
                const bRect = bEl.getBoundingClientRect();
                if (bRect.height < 15 || bRect.height > 500 || bRect.width < 30) continue;
                if (bRect.top < containerRect.top || bRect.bottom > containerRect.bottom) continue;

                const bStyle = getComputedStyle(bEl);
                const bHasBg = bStyle.backgroundColor && bStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && bStyle.backgroundColor !== 'transparent';
                const bHasRadius = parseFloat(bStyle.borderRadius) > 3;
                if (!bHasBg || !bHasRadius) continue;

                // Get text
                let text = '';
                const walker = document.createTreeWalker(bEl, NodeFilter.SHOW_TEXT, null);
                let wn: Node | null;
                while (wn = walker.nextNode()) {
                    const t = (wn.textContent || '').trim();
                    if (t.length > 0) text += t + ' ';
                }
                text = text.trim();

                if (text.length < 1 || text.length > 5000) continue;
                if (/^\d{1,2}:\d{2}$/.test(text)) continue;
                if (text === '...' || text === '✓' || text === '✓✓') continue;

                const relLeft = (bRect.left - containerRect.left) / containerRect.width;
                const relRight = (containerRect.right - bRect.right) / containerRect.width;
                const isMine = relRight < 0.1 || relLeft > 0.35;

                bubbles.push({ text, top: bRect.top, isMine, len: text.length });
            }

            // Deduplicate (remove substrings)
            const unique = bubbles.filter((b, i) => {
                for (let j = 0; j < bubbles.length; j++) {
                    if (i === j) continue;
                    if (bubbles[j].text.includes(b.text) && bubbles[j].len > b.len) return false;
                }
                return true;
            });

            unique.sort((a, b) => a.top - b.top);
            debug.push(`Bubbles: ${bubbles.length} raw, ${unique.length} unique`);

            for (let u = 0; u < unique.length; u++) {
                messages.push({
                    id: 'zalo_msg_' + Date.now() + '_' + u,
                    content: unique[u].text,
                    senderType: unique[u].isMine ? 'me' : 'other',
                    senderName: unique[u].isMine ? 'Bạn' : 'Khách',
                    createdAt: new Date(Date.now() - (unique.length - u) * 60000).toISOString(),
                    type: 'text',
                });
            }

            return { messages, debug };
        });

        console.log(`[ZaloAPI] Messages debug:`, result.debug.join(' | '));
        console.log(`[ZaloAPI] Got ${result.messages.length} messages`);
        return result.messages;
    } catch (err) {
        console.error('[ZaloAPI] Failed to get messages:', err);
        return [];
    }
}

/**
 * Send a message via Zalo Web.
 * If contactName is provided, clicks that conversation first to ensure chat pane is open.
 * Then finds the input field and types + sends.
 */
export async function sendZaloMessage(page: Page, text: string, contactName?: string): Promise<boolean> {
    try {
        console.log(`[ZaloSend] Sending to "${contactName || 'current'}": "${text.substring(0, 50)}"`);

        // If contactName provided, ensure that conversation is open
        if (contactName && contactName.length > 0) {
            const clicked = await clickConversationByName(page, contactName);
            if (!clicked) {
                console.error(`[ZaloSend] Could not open conversation "${contactName}"`);
                return false;
            }
        }

        // Find the input field
        const inputPos = await page.evaluate(() => {
            const vpWidth = window.innerWidth;
            const vpHeight = window.innerHeight;

            // Strategy 1: Known Zalo input selectors
            const knownSelectors = [
                '#richInput',
                '[id^="richInput"]',
                '#chatInput',
                '[data-id="div_RichInput"]',
                '[class*="richInput"]',
                '[class*="chat-input"]',
                '[class*="chatInput"]',
            ];

            for (const selector of knownSelectors) {
                const el = document.querySelector(selector) as HTMLElement;
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                if (rect.width < 30 || rect.height < 5) continue;
                // Must be in the right pane area
                if (rect.left < vpWidth * 0.15) continue;
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, method: 'known-selector' };
            }

            // Strategy 2: Find contenteditable in chat area (right side, bottom half)
            const editables = document.querySelectorAll('[contenteditable="true"], [contenteditable]');
            let bestEl: HTMLElement | null = null;
            let bestScore = 0;

            for (const el of editables) {
                const rect = (el as HTMLElement).getBoundingClientRect();
                if (rect.width < 30 || rect.height < 5) continue;
                // Must be in right side
                if (rect.left < vpWidth * 0.15) continue;

                let score = 0;
                score += rect.width; // Wider is better (chat input is usually wide)
                score += rect.top > vpHeight * 0.5 ? 500 : 0; // Bottom half preferred
                score += rect.left > vpWidth * 0.25 ? 100 : 0; // Right side preferred
                score -= rect.height > 200 ? 300 : 0; // Too tall is probably the message area, not input

                if (score > bestScore) { bestScore = score; bestEl = el as HTMLElement; }
            }

            if (bestEl) {
                const rect = bestEl.getBoundingClientRect();
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, method: 'contenteditable' };
            }

            // Strategy 3: Find any input/textarea in right pane bottom
            const inputs = document.querySelectorAll('input[type="text"], textarea');
            for (const el of inputs) {
                const rect = (el as HTMLElement).getBoundingClientRect();
                if (rect.left < vpWidth * 0.15 || rect.width < 50) continue;
                if (rect.top < vpHeight * 0.4) continue;
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, method: 'input-element' };
            }

            return null;
        });

        if (!inputPos) {
            console.error('[ZaloSend] Could not find input field — chat pane may not be open');
            return false;
        }

        console.log(`[ZaloSend] Found input via ${inputPos.method} at (${Math.round(inputPos.x)}, ${Math.round(inputPos.y)})`);

        // Click to focus
        await page.mouse.click(inputPos.x, inputPos.y);
        await new Promise(r => setTimeout(r, 200));

        // Paste text via execCommand (works with React's event system)
        await page.evaluate((txt: string) => {
            const el = document.activeElement as HTMLElement;
            if (el && (el.contentEditable === 'true' || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
                // Clear existing content first
                if (el.contentEditable === 'true') {
                    el.innerHTML = '';
                }
                document.execCommand('insertText', false, txt);
            }
        }, text);

        await new Promise(r => setTimeout(r, 150));

        // Verify text was inserted
        const textInserted = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement;
            return (el?.textContent?.length || 0) > 0 || (el as HTMLInputElement)?.value?.length > 0;
        });

        if (!textInserted) {
            console.log('[ZaloSend] execCommand failed, trying keyboard.type fallback...');
            await page.mouse.click(inputPos.x, inputPos.y);
            await new Promise(r => setTimeout(r, 100));
            await page.keyboard.type(text, { delay: 5 });
            await new Promise(r => setTimeout(r, 100));
        }

        // Press Enter to send
        await page.keyboard.press('Enter');

        console.log(`[ZaloSend] ✓ Sent: "${text.substring(0, 50)}"`);
        return true;
    } catch (err) {
        console.error('[ZaloSend] Failed:', err);
        return false;
    }
}

// ────────── Realtime Message Listener (WebSocket Intercept) ──────────

export interface ZaloRealtimeMessage {
    msgId: string;
    content: string;
    senderId: string;
    senderName: string;
    conversationId: string;
    isGroup: boolean;
    timestamp: number;
    msgType: string;  // 'text', 'image', 'sticker', 'file', etc.
}

// Track active listeners per session for cleanup
const activeListeners = new Map<string, CDPSession>();

/**
 * Start listening for real-time Zalo messages via CDP WebSocket interception.
 * 
 * How it works:
 * 1. Creates a CDP session on the page
 * 2. Enables Network domain to intercept WebSocket frames
 * 3. When a WS frame arrives, attempts to decrypt it using Zalo's internal decodeAES
 * 4. Parses the decrypted data and calls onMessage for message-type events
 * 
 * Latency: ~200-500ms (Zalo server → WS → CDP intercept → decrypt → callback)
 */
export async function startZaloMessageListener(
    page: Page,
    sessionId: string,
    onMessage: (msg: ZaloRealtimeMessage) => void
): Promise<boolean> {
    try {
        // Stop existing listener if any
        await stopZaloMessageListener(sessionId);

        console.log(`[ZaloRT] Starting realtime listener for session ${sessionId}...`);
        
        const cdp = await page.createCDPSession();
        await cdp.send('Network.enable');
        activeListeners.set(sessionId, cdp);

        let frameCount = 0;
        let msgCount = 0;

        cdp.on('Network.webSocketFrameReceived', async (event: any) => {
            frameCount++;
            const payload = event.response?.payloadData;
            if (!payload || typeof payload !== 'string') return;

            // Skip very short frames (heartbeat/ping) and very long ones (file transfers)
            if (payload.length < 20 || payload.length > 50000) return;

            try {
                // Try to decrypt the payload using Zalo's internal AES decoder
                const decoded = await page.evaluate((encrypted: string) => {
                    try {
                        // Access Zalo's crypto module
                        const wp = (window as any).webpackJsonp;
                        if (!wp) return null;

                        // Try known module IDs for the crypto module
                        const knownIds = ['z0WU', 'Z0WU', 'z0wu'];
                        let cryptoMod = null;

                        for (const id of knownIds) {
                            try {
                                const mod = wp.push([[Math.random()], {}, [[id]]]);
                                if (mod?.default?.decodeAES) {
                                    cryptoMod = mod.default;
                                    break;
                                }
                            } catch { /* skip */ }
                        }

                        // Dynamic discovery if known IDs fail
                        if (!cryptoMod) {
                            try {
                                let registry: any = null;
                                wp.push([[Math.random()], {
                                    '__crypto_discover__': function(_m: any, _e: any, require: any) {
                                        registry = require;
                                    }
                                }, [['__crypto_discover__']]]);

                                if (registry?.c) {
                                    for (const key of Object.keys(registry.c)) {
                                        try {
                                            const m = registry.c[key];
                                            if (m?.exports?.default?.decodeAES) {
                                                cryptoMod = m.exports.default;
                                                break;
                                            }
                                        } catch { /* skip */ }
                                    }
                                }
                            } catch { /* skip */ }
                        }

                        if (!cryptoMod) return null;
                        return cryptoMod.decodeAES(encrypted);
                    } catch {
                        return null;
                    }
                }, payload).catch(() => null);

                if (!decoded || typeof decoded !== 'string') return;

                // Try to parse as JSON
                let data: any;
                try {
                    data = JSON.parse(decoded);
                } catch {
                    return; // Not JSON — skip
                }

                // ── Detect message events ──
                // Zalo uses various command types for messages
                const msgData = extractMessageFromFrame(data);
                if (msgData) {
                    msgCount++;
                    console.log(`[ZaloRT] New message #${msgCount} from ${msgData.senderName || msgData.senderId}: "${msgData.content.substring(0, 50)}"`);
                    onMessage(msgData);
                }
            } catch {
                // Frame decode failed — not a message, skip
            }
        });

        // Log periodic stats
        const statsInterval = setInterval(() => {
            if (!activeListeners.has(sessionId)) {
                clearInterval(statsInterval);
                return;
            }
            if (frameCount > 0) {
                console.log(`[ZaloRT] Session ${sessionId}: ${frameCount} WS frames, ${msgCount} messages`);
                frameCount = 0;
            }
        }, 30000);

        console.log(`[ZaloRT] ✓ Realtime listener active for session ${sessionId}`);
        return true;
    } catch (err: any) {
        console.error(`[ZaloRT] Failed to start listener for ${sessionId}:`, err.message);
        return false;
    }
}

/**
 * Extract a message from a decoded Zalo WebSocket frame.
 * Handles multiple Zalo event formats.
 */
function extractMessageFromFrame(data: any): ZaloRealtimeMessage | null {
    // Format 1: Direct message object
    // { cmd: "msg", data: { msgId, content, uidFrom, idTo, ts, ... } }
    if (data.cmd === 'msg' || data.cmd === 'message' || data.cmd === 'chat') {
        const d = data.data || data;
        if (!d) return null;
        return {
            msgId: d.msgId || d.mid || d.clientId || `zrt_${Date.now()}`,
            content: d.content || d.msg || d.text || d.message || '',
            senderId: d.uidFrom || d.fromUid || d.senderId || d.uid || '',
            senderName: d.dName || d.displayName || d.fromName || d.senderName || '',
            conversationId: d.idTo || d.toUid || d.threadId || d.convId || '',
            isGroup: !!(d.isGroup || d.idTo?.startsWith('g') || d.topicType === 'group'),
            timestamp: d.ts || d.timestamp || d.sendDttm || Date.now(),
            msgType: d.msgType || d.type || 'text',
        };
    }

    // Format 2: Notification with message payload
    // { data: [{ action: "msg", ... }] }
    if (Array.isArray(data.data)) {
        for (const item of data.data) {
            if (item.action === 'msg' || item.action === 'message' || item.actionType === 'msg') {
                return {
                    msgId: item.msgId || item.mid || `zrt_${Date.now()}`,
                    content: item.content || item.msg || item.text || '',
                    senderId: item.uidFrom || item.fromUid || item.uid || '',
                    senderName: item.dName || item.displayName || item.fromName || '',
                    conversationId: item.idTo || item.threadId || '',
                    isGroup: !!(item.isGroup || item.idTo?.startsWith('g')),
                    timestamp: item.ts || item.timestamp || Date.now(),
                    msgType: item.msgType || item.type || 'text',
                };
            }
        }
    }

    // Format 3: Wrapped in error_code response
    // { error_code: 0, data: { msgs: [...] } }
    if (data.error_code === 0 && data.data?.msgs) {
        const msgs = data.data.msgs;
        if (Array.isArray(msgs) && msgs.length > 0) {
            const m = msgs[msgs.length - 1]; // Latest message
            return {
                msgId: m.msgId || m.mid || `zrt_${Date.now()}`,
                content: m.content || m.msg || m.text || '',
                senderId: m.uidFrom || m.fromUid || '',
                senderName: m.dName || m.displayName || '',
                conversationId: m.idTo || m.threadId || '',
                isGroup: !!(m.isGroup || m.idTo?.startsWith('g')),
                timestamp: m.ts || m.timestamp || Date.now(),
                msgType: m.msgType || m.type || 'text',
            };
        }
    }

    return null;
}

/**
 * Stop the realtime message listener for a session.
 */
export async function stopZaloMessageListener(sessionId: string): Promise<void> {
    const cdp = activeListeners.get(sessionId);
    if (cdp) {
        try {
            await cdp.detach();
        } catch { /* already detached */ }
        activeListeners.delete(sessionId);
        console.log(`[ZaloRT] Stopped listener for session ${sessionId}`);
    }
}
