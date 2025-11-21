/**
 * pdfcreater - Background Service Worker
 * Handles messaging and file downloads
 */

// Load configuration from config.json
let config = null;
let cachedUrlList = null;
let persistentWindowId = null;
let windowSizeEnforcer = null; // Store the size enforcement function
let windowSizeCheckInterval = null; // Store the interval for size checking

async function loadConfig() {
  if (config) return config;

  try {
    const configUrl = chrome.runtime.getURL("config.json");
    const response = await fetch(configUrl);
    config = await response.json();
    console.log("[Background] Config loaded:", config);
    return config;
  } catch (error) {
    console.error("[Background] Error loading config, using defaults:", error);
    // Fallback to default config
    config = {
      sectorsApi: {
        baseUrl: "https://mmt-new.mfilterit.net/dev/api/sectors",
        type: "domestic_oneway",
        headers: {
          "x-api-key": "NITESHABCD",
        },
      },
      api_names: {
        searchStreamAPI: "/search-stream-dt",
        searchStreamAPIFull: "flights-cb.makemytrip.com/api/search-stream-dt",
        apiPath: "/api/",
      },
      insertApi: {
        url: "https://mmt-new.mfilterit.net/dev/api/insert_resp",
        collectionName: "one_way_domestic_dump",
        requestHeaders: {
          "x-api-key": "NITESHABCD",
          "Content-Type": "application/json",
        },
        payloadHeaders: {
          "x-api-key": "NITESH123",
          source: "extension",
        },
      },
      domain: "https://www.makemytrip.com",
      apiDomain: "flights-cb.makemytrip.com",
      cdnDomain: "mmtcdn.net",
    };
    return config;
  }
}

async function getUrlsToProcess(options = {}) {
  const { forceRefresh = false } = options;

  if (
    !forceRefresh &&
    Array.isArray(cachedUrlList) &&
    cachedUrlList.length > 0
  ) {
    return cachedUrlList;
  }

  const cfg = await loadConfig();
  const urls = await fetchSectorsApiUrls(cfg.sectorsApi);

  cachedUrlList = urls;
  return urls;
}

async function fetchSectorsApiUrls(sectorsApiConfig) {
  if (!sectorsApiConfig) {
    throw new Error("sectorsApi configuration is missing in config.json");
  }

  const baseUrl = sectorsApiConfig.url || sectorsApiConfig.baseUrl;
  if (!baseUrl) {
    throw new Error("sectorsApi configuration requires baseUrl or url");
  }

  let requestUrl;
  try {
    const urlObj = new URL(baseUrl);

    if (sectorsApiConfig.type) {
      urlObj.searchParams.set("type", sectorsApiConfig.type);
    }

    const extraParams = {
      ...(sectorsApiConfig.query || {}),
      ...(sectorsApiConfig.params || {}),
    };
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        urlObj.searchParams.set(key, value);
      }
    });

    requestUrl = urlObj.toString();
  } catch (error) {
    throw new Error(`Invalid sectorsApi URL: ${error.message}`);
  }

  const headers = { ...(sectorsApiConfig.headers || {}) };
  if (sectorsApiConfig.apiKey && !headers["x-api-key"]) {
    headers["x-api-key"] = sectorsApiConfig.apiKey;
  }

  console.log("[Background] Fetching sectors from API:", requestUrl);
  const response = await fetch(requestUrl, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Sectors API failed with status ${response.status}`);
  }

  const payload = await response.json();
  const chunkGroups = Array.isArray(payload.chunks) ? payload.chunks : [];
  const urls = [];

  for (const group of chunkGroups) {
    if (Array.isArray(group)) {
      for (const item of group) {
        if (item && item.url) {
          urls.push(item.url);
        }
      }
    } else if (group && group.url) {
      urls.push(group.url);
    }
  }

  if (!urls.length) {
    throw new Error("Sectors API returned no URLs to process");
  }

  console.log(`[Background] Retrieved ${urls.length} URLs from sectors API`);
  return urls;
}

async function storeResponseInCollection({
  requestUrl,
  responseData,
  extraHeaders = {},
}) {
  const cfg = await loadConfig();
  const insertCfg = cfg.insertApi;

  if (!insertCfg || !insertCfg.url) {
    console.warn(
      "[Background] Insert API configuration missing. Skipping DB storage.",
    );
    return {
      success: false,
      skipped: true,
      reason: "insertApi not configured",
    };
  }

  if (!requestUrl) {
    throw new Error("requestUrl is required to store response data");
  }

  const httpHeaders = {
    "Content-Type": "application/json",
    ...(insertCfg.requestHeaders || {}),
  };

  if (!httpHeaders["Content-Type"] && !httpHeaders["content-type"]) {
    httpHeaders["Content-Type"] = "application/json";
  }

  // Get captured headers from chrome.webRequest
  let capturedRequestHeaders = {};
  let capturedHeadersData = null;

  // Try exact URL match first
  capturedHeadersData = capturedHeaders.get(requestUrl);

  // If not found, try to find by URL pattern (for timestamp variations)
  if (!capturedHeadersData) {
    for (const [key, value] of capturedHeaders.entries()) {
      if (key.startsWith("http") && key.includes(requestUrl.split("?")[0])) {
        capturedHeadersData = value;
        break;
      }
    }
  }

  // If still not found, get the most recent headers for search-stream-dt
  if (!capturedHeadersData) {
    const apiCheck = config
      ? requestUrl.includes(config.api_names?.searchStreamAPI) ||
        requestUrl.includes(config.api_names?.searchStreamAPIFull)
      : requestUrl.includes("search-stream-dt");

    if (apiCheck) {
      let mostRecent = null;
      let mostRecentTime = 0;
      for (const [key, value] of capturedHeaders.entries()) {
        const keyApiCheck = config
          ? key.includes(config.api_names?.searchStreamAPI) ||
            key.includes(config.api_names?.searchStreamAPIFull)
          : key.includes("search-stream-dt");
        if (keyApiCheck && value.timestamp) {
          const time = new Date(value.timestamp).getTime();
          if (time > mostRecentTime) {
            mostRecentTime = time;
            mostRecent = value;
          }
        }
      }
      capturedHeadersData = mostRecent;
    }
  }

  // Extract clean headers from captured data
  if (capturedHeadersData && capturedHeadersData.headers) {
    const allHeaders = capturedHeadersData.headers;
    const seenHeaders = new Set();

    // Filter out lowercase duplicates and system keys, keep original case
    Object.keys(allHeaders).forEach((key) => {
      // Skip keys that look like "requestId:123" or are system keys
      if (!key.includes(":") && !key.startsWith("_")) {
        const lowerKey = key.toLowerCase();

        // If this is a lowercase duplicate and we haven't seen it, check for original case
        if (lowerKey === key && !seenHeaders.has(lowerKey)) {
          // Check if original case version exists
          const originalKey = Object.keys(allHeaders).find(
            (k) => k.toLowerCase() === lowerKey && k !== key,
          );

          if (originalKey) {
            // Use original case version
            capturedRequestHeaders[originalKey] = allHeaders[originalKey];
            seenHeaders.add(lowerKey);
          } else {
            // No original case, use lowercase
            capturedRequestHeaders[key] = allHeaders[key];
            seenHeaders.add(lowerKey);
          }
        } else if (lowerKey !== key && !seenHeaders.has(lowerKey)) {
          // This is original case, use it
          capturedRequestHeaders[key] = allHeaders[key];
          seenHeaders.add(lowerKey);
        }
      }
    });

    console.log(
      "[Background] ✅ Using captured headers from chrome.webRequest:",
      Object.keys(capturedRequestHeaders).length,
      "headers",
    );
  } else {
    console.warn(
      "[Background] ⚠️ No captured headers found for URL:",
      requestUrl,
    );
  }

  // Merge config headers with captured headers (captured headers take precedence)
  const payloadHeaders = {
    ...(insertCfg.payloadHeaders || {}),
    ...capturedRequestHeaders, // Captured headers override config headers
    ...(extraHeaders || {}),
  };

  // Get collection name from config (required)
  const collectionName = insertCfg.collectionName || insertCfg.collection;
  if (!collectionName) {
    throw new Error("collectionName or collection must be specified in insertApi config");
  }

  const payload = {
    collection_name: collectionName,
    request_url: requestUrl,
    headers: payloadHeaders,
    response: responseData || {},
  };

  console.log(
    "[Background] 📤 Sending response to insert API for URL:",
    requestUrl,
  );

  const PAUSE_ON_200_OK = 5 * 60 * 1000; // 5 minutes in milliseconds
  const MAX_RETRIES = 3; // Maximum retry attempts
  
  let retryCount = 0;
  let lastResponse = null;
  let lastStatus = null;

  while (retryCount <= MAX_RETRIES) {
    const response = await fetch(insertCfg.url, {
      method: insertCfg.method || "POST",
      headers: httpHeaders,
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let parsedBody = null;
    try {
      parsedBody = text ? JSON.parse(text) : null;
    } catch (error) {
      parsedBody = text;
    }

    lastResponse = parsedBody;
    lastStatus = response.status;

    // Check if API response body contains "200 OK" in various patterns (check response body, not HTTP status code)
    const responseString = typeof parsedBody === "string" 
      ? parsedBody 
      : JSON.stringify(parsedBody || text || "");
    // Check if response body contains "200 OK" in various patterns (case-insensitive, with/without spaces)
    // Patterns: "200 OK", "200ok", "200 Ok", "200OK", etc.
    const responseLower = responseString.toLowerCase();
    const contains200OK = /\b200\s*ok\b/i.test(responseString) || 
                          responseLower.includes("200ok") ||
                          responseLower.includes("200 ok");

    // Check if API returns 200 OK in response body
    if (contains200OK) {
      if (retryCount < MAX_RETRIES) {
        console.log(
          `[Background] ⚠️ Insert API returned 200 OK. Pausing for 5 minutes before retry (attempt ${retryCount + 1}/${MAX_RETRIES})...`,
        );
        
        // Send alert to popup UI
        chrome.runtime.sendMessage({
          action: "urlProcessingProgress",
          message: `⚠️ API returned 200 OK. Pausing for 5 minutes before retry (attempt ${retryCount + 1}/${MAX_RETRIES})...`,
          alert: true,
          alertType: "warning",
        }).catch(() => {});

        // Wait 5 minutes
        await new Promise((resolve) => setTimeout(resolve, PAUSE_ON_200_OK));
        
        retryCount++;
        console.log(
          `[Background] 🔄 Retrying insert API after 5-minute pause (attempt ${retryCount}/${MAX_RETRIES})...`,
        );
        
        // Send alert to popup UI
        chrome.runtime.sendMessage({
          action: "urlProcessingProgress",
          message: `🔄 Retrying insert API after 5-minute pause (attempt ${retryCount}/${MAX_RETRIES})...`,
          alert: true,
          alertType: "info",
        }).catch(() => {});
        
        continue; // Retry the request
      } else {
        // Max retries reached, but got 200 OK - treat as success but log warning
        console.warn(
          `[Background] ⚠️ Insert API returned 200 OK after ${MAX_RETRIES} retries. Treating as success but data may need verification.`,
        );
        
        // Send alert to popup UI
        chrome.runtime.sendMessage({
          action: "urlProcessingProgress",
          message: `⚠️ API returned 200 OK after ${MAX_RETRIES} retries. Data may need verification.`,
          alert: true,
          alertType: "warning",
        }).catch(() => {});
        
        return { success: true, data: parsedBody, retried: true, retryCount: retryCount };
      }
    } else if (!response.ok) {
      // Non-200 or error status
      const errorMessage =
        typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody);
      throw new Error(`Insert API failed (${response.status}): ${errorMessage}`);
    } else {
      // Success (non-200 but ok, or other success status)
      console.log("[Background] ✅ Response stored in collection successfully");
      if (retryCount > 0) {
        return { success: true, data: parsedBody, retried: true, retryCount: retryCount };
      }
      return { success: true, data: parsedBody };
    }
  }

  // Should not reach here, but handle edge case
  console.warn("[Background] ⚠️ Max retries reached for insert API");
  return { success: false, error: "Max retries reached", data: lastResponse };
}

// Load config on startup
loadConfig();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Download JSON code commented out - data is inserted into collection via API instead
  // if (request.action === 'downloadJSON') {
  //   downloadJSON(request.data, request.filename, request.saveAs).then(() => {
  //     sendResponse({ success: true });
  //   }).catch((error) => {
  //     console.error('Download error:', error);
  //     sendResponse({ success: false, error: error.message });
  //   });
  //   return true; // Keep channel open for async response
  // } else if (request.action === 'saveJSON') {
  //   // Auto-save without dialog
  //   downloadJSON(request.data, request.filename, false).then((downloadId) => {
  //     sendResponse({ success: true, downloadId: downloadId });
  //   }).catch((error) => {
  //     console.error('Save error:', error);
  //     sendResponse({ success: false, error: error.message });
  //   });
  //   return true; // Keep channel open for async response
  // } else if (request.action === 'checkDownload') {
  if (request.action === "checkDownload") {
    // Check download status
    chrome.downloads.search({ id: request.downloadId }, (results) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else if (results && results.length > 0) {
        const download = results[0];
        sendResponse({
          success: true,
          state: download.state,
          error: download.error,
        });
      } else {
        sendResponse({ success: false, error: "Download not found" });
      }
    });
    return true; // Keep channel open for async response
  } else if (request.action === "progressUpdate") {
    // Forward progress update to popup if it's open
    // This is handled by popup.js directly via chrome.runtime.onMessage
    sendResponse({ success: true });
    return true;
  } else if (request.action === "openPersistentPopupWindow") {
    (async () => {
      try {
        const queryParams = ["standalone=1"];
        if (request.autoStart) {
          queryParams.push("autoStart=1");
        }
        const popupUrl = chrome.runtime.getURL(
          `popup.html?${queryParams.join("&")}`,
        );

        const maxWidth = request.width || 520;
        const maxHeight = request.height || 720;

        const createdWindow = await chrome.windows.create({
          url: popupUrl,
          type: "popup",
          focused: true,
          width: maxWidth,
          height: maxHeight,
          state: "normal", // Prevent maximization, allow minimize
        });

        persistentWindowId = createdWindow?.id || null;

        // Set up listener to prevent window from being resized larger than max size
        if (persistentWindowId) {
          // Clean up any existing listeners first
          if (windowSizeEnforcer) {
            chrome.windows.onBoundsChanged.removeListener(windowSizeEnforcer);
            windowSizeEnforcer = null;
          }
          if (windowSizeCheckInterval) {
            clearInterval(windowSizeCheckInterval);
            windowSizeCheckInterval = null;
          }

          const enforceMaxSize = async (windowId) => {
            if (windowId === persistentWindowId) {
              try {
                const window = await chrome.windows.get(windowId);
                if (window && window.state !== "minimized") {
                  let needsUpdate = false;
                  const updateData = {};

                  if (window.width > maxWidth) {
                    updateData.width = maxWidth;
                    needsUpdate = true;
                  }

                  if (window.height > maxHeight) {
                    updateData.height = maxHeight;
                    needsUpdate = true;
                  }

                  if (needsUpdate) {
                    console.log(
                      "[Background] Window resized beyond max, resetting to:",
                      updateData,
                    );
                    await chrome.windows.update(windowId, updateData);
                  }
                }
              } catch (error) {
                // Window might be closed, ignore error
              }
            }
          };

          // Store the function reference
          windowSizeEnforcer = enforceMaxSize;

          // Listen for window bounds changes
          chrome.windows.onBoundsChanged.addListener(enforceMaxSize);

          // Also check periodically (as a backup)
          windowSizeCheckInterval = setInterval(async () => {
            try {
              const window = await chrome.windows.get(persistentWindowId);
              if (!window) {
                // Window closed, remove listener and interval
                if (windowSizeEnforcer) {
                  chrome.windows.onBoundsChanged.removeListener(
                    windowSizeEnforcer,
                  );
                  windowSizeEnforcer = null;
                }
                if (windowSizeCheckInterval) {
                  clearInterval(windowSizeCheckInterval);
                  windowSizeCheckInterval = null;
                }
              } else {
                await enforceMaxSize(persistentWindowId);
              }
            } catch (error) {
              // Window closed, remove listener and interval
              if (windowSizeEnforcer) {
                chrome.windows.onBoundsChanged.removeListener(
                  windowSizeEnforcer,
                );
                windowSizeEnforcer = null;
              }
              if (windowSizeCheckInterval) {
                clearInterval(windowSizeCheckInterval);
                windowSizeCheckInterval = null;
              }
            }
          }, 500); // Check every 500ms
        }

        sendResponse({ success: true, windowId: persistentWindowId });
      } catch (error) {
        console.error(
          "[Background] ❌ Could not open persistent popup window:",
          error,
        );
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  } else if (request.action === "storeApiResponseInDb") {
    (async () => {
      try {
        const result = await storeResponseInCollection({
          requestUrl: request.requestUrl,
          responseData: request.responseData,
          metadata: request.metadata,
          extraHeaders: request.extraHeaders,
        });
        sendResponse(result);
      } catch (error) {
        console.error("[Background] ❌ Failed to store response in DB:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  return true;
});

// Download JSON code commented out - data is inserted into collection via API instead
// /**
//  * Download JSON data as a file
//  * Uses data URL instead of blob URL (works in service workers)
//  * @param {Object} data - The data to save
//  * @param {string} filename - The filename (default: 'flight-data.json')
//  * @param {boolean} saveAs - Show save dialog (default: true)
//  */
// async function downloadJSON(data, filename = 'flight-data.json', saveAs = true) {
//   try {
//     // Convert JSON to string
//     const jsonString = JSON.stringify(data, null, 2);
//
//     // Create data URL (base64 encoded)
//     // Service workers don't support URL.createObjectURL, so we use data URLs
//     const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
//
//     // Download using chrome.downloads API
//     return new Promise((resolve, reject) => {
//       chrome.downloads.download({
//         url: dataUrl,
//         filename: filename,
//         saveAs: saveAs // Show dialog if true, auto-save if false
//       }, (downloadId) => {
//         if (chrome.runtime.lastError) {
//           reject(new Error(chrome.runtime.lastError.message));
//         } else {
//           console.log('Download started:', downloadId);
//           resolve(downloadId);
//         }
//       });
//     });
//   } catch (error) {
//     console.error('Error creating download:', error);
//     throw error;
//   }
// }

/**
 * Handle opening new tabs
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openTab") {
    chrome.tabs.create({ url: request.url }, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else {
        sendResponse({ success: true, tabId: tab.id });
      }
    });
    return true; // Keep channel open for async response
    // Download JSON code commented out - data is inserted into collection via API instead
    // } else if (request.action === 'downloadEventStreamData') {
    //   // Download event stream data - handle async
    //   (async () => {
    //     try {
    //       console.log('[Background] ===== Download Event Stream Data Request =====');
    //       const { events, rawData, url, timestamp, extractedData } = request;
    //
    //       console.log('[Background] URL:', url);
    //       console.log('[Background] Events count:', events?.length || 0);
    //       console.log('[Background] Raw data length:', rawData?.length || 0);
    //       console.log('[Background] Has extractedData:', !!extractedData);
    //
    //       if (!url) {
    //         console.error('[Background] ❌ ERROR: No URL provided');
    //         sendResponse({ success: false, error: 'No URL provided' });
    //         return;
    //       }
    //
    //       // Load config first
    //       const cfg = await loadConfig();
    //
    //       // Extract route info from URL if available
    //       let routeInfo = {};
    //       try {
    //         const urlObj = new URL(url);
    //         const itParam = urlObj.searchParams.get('it'); // e.g., "BLR-PAT-20251114"
    //         if (itParam) {
    //           const parts = itParam.split('-');
    //           if (parts.length >= 3) {
    //             routeInfo = {
    //               source: parts[0],
    //               destination: parts[1],
    //               date: parts[2]
    //             };
    //           }
    //         }
    //         console.log('[Background] Route info extracted:', routeInfo);
    //       } catch (e) {
    //         console.warn('[Background] Could not parse URL for route info:', e);
    //       }
    //
    //       // Create filename with route info if available
    //       const routeSuffix = routeInfo.source && routeInfo.destination
    //         ? `${routeInfo.source}-${routeInfo.destination}-${routeInfo.date || 'unknown'}`
    //         : 'unknown-route';
    //       const safeTimestamp = timestamp ? timestamp.replace(/[:.]/g, '-') : new Date().toISOString().replace(/[:.]/g, '-');
    //       const apiName = cfg.api_names.searchStreamAPI.replace('/', '');
    //       const filename = `${apiName}-${routeSuffix}-${safeTimestamp}.json`;
    //
    //       console.log('[Background] Filename:', filename);
    //
    //       // Prepare data structure
    //       const dataToDownload = extractedData || {
    //         metadata: {
    //           url: url,
    //           timestamp: timestamp || new Date().toISOString(),
    //           eventCount: events?.length || 0,
    //           source: cfg.api_names.searchStreamAPI || 'search-stream-dt API',
    //           routeInfo: routeInfo
    //         },
    //         events: events || [],
    //         rawStream: rawData || ''
    //       };
    //
    //       console.log('[Background] Data to download size:', JSON.stringify(dataToDownload).length, 'bytes');
    //       console.log('[Background] Calling downloadJSON...');
    //
    //       // Download the data
    //       const downloadId = await downloadJSON(dataToDownload, filename, false);
    //       console.log('[Background] ✅✅✅ Event stream data downloaded successfully!');
    //       console.log('[Background] Filename:', filename);
    //       console.log('[Background] Download ID:', downloadId);
    //       sendResponse({ success: true, downloadId: downloadId, filename: filename });
    //     } catch (error) {
    //       console.error('[Background] ❌ ERROR downloading event stream data:', error);
    //       console.error('[Background] Error stack:', error.stack);
    //       sendResponse({ success: false, error: error.message });
    //     }
    //   })();
    //
    //   return true; // Keep channel open for async response
  } else if (request.action === "generateURLAndOpen") {
    // Generate URL and open in new tab, then monitor for /search-stream-dt
    const { source, dest, date, tripType } = request;

    // Use the main function
    generateURLAndExtractEventStream(source, dest, date, tripType || "oneway")
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep channel open for async response
  } else if (request.action === "generateURLAndExtractEventStream") {
    // Direct call to the main function
    const { source, dest, date, tripType } = request;

    generateURLAndExtractEventStream(source, dest, date, tripType || "oneway")
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep channel open for async response
  } else if (request.action === "openUrlsFromConfig") {
    // Open all URLs from config.json array
    openUrlsFromConfig()
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep channel open for async response
  } else if (request.action === "processUrlsSequentially") {
    // Check if already processing to prevent concurrent execution
    if (isProcessingUrls) {
      console.log("[Background] ⚠️ URL processing already running. Ignoring duplicate request.");
      sendResponse({
        success: false,
        error: "URL processing is already running. Please wait for it to complete.",
      });
      return true;
    }

    // Process URLs one by one with delay and auto-download
    processUrlsSequentially()
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep channel open for async response
  }
  return true;
});

/**
 * Open all URLs from config.json in browser tabs
 * @returns {Promise<Object>} - Promise resolving to { success, openedUrls, tabIds }
 */
async function openUrlsFromConfig() {
  try {
    const urls = await getUrlsToProcess();
    const totalUrls = urls.length;

    console.log("[Background] Opening", totalUrls, "URLs from API...");

    const openedUrls = [];
    const tabIds = [];
    const delayBetweenTabs = 2000; // 2 seconds between tabs

    for (let i = 0; i < totalUrls; i++) {
      const url = urls[i];

      // Wait before opening next tab (except for first one)
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenTabs));
      }

      try {
        const tab = await new Promise((resolve, reject) => {
          chrome.tabs.create({ url: url, active: false }, (tab) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(tab);
            }
          });
        });

        openedUrls.push(url);
        tabIds.push(tab.id);
        console.log(
          `[Background] Opened tab ${i + 1}/${totalUrls}:`,
          tab.id,
          url,
        );

        // Wait for page to start loading, then inject content script
        await new Promise((resolve) => {
          let resolved = false;
          const listener = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === "loading") {
              if (!resolved) {
                resolved = true;
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            }
          };
          chrome.tabs.onUpdated.addListener(listener);

          // Timeout after 5 seconds
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          }, 5000);
        });

        // Inject content script to monitor network
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"],
          });
          console.log(`[Background] Content script injected for tab ${tab.id}`);
        } catch (error) {
          console.warn(
            `[Background] Content script injection warning for tab ${tab.id}:`,
            error.message,
          );
        }
      } catch (error) {
        console.error(`[Background] Error opening URL ${i + 1}:`, error);
        // Continue with next URL
      }
    }

    return {
      success: true,
      openedUrls: openedUrls,
      tabIds: tabIds,
      totalUrls: totalUrls,
      message: `Opened ${openedUrls.length} out of ${totalUrls} URLs. Content scripts are monitoring for /search-stream-dt API. Data will be automatically downloaded when detected.`,
    };
  } catch (error) {
    console.error("[Background] Error in openUrlsFromConfig:", error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
}

/**
 * Clear site data for makemytrip.com domain
 * Navigates to https://www.makemytrip.com/ first, then clears site data
 * This is equivalent to clicking "Clear site data" in DevTools Application tab
 * @returns {Promise<boolean>} - Promise resolving to true if successful
 */
async function clearSiteData() {
  let tab = null;
  try {
    console.log(
      "[Background] 🧹 Navigating to https://www.makemytrip.com/ to clear site data...",
    );
    const cfg = await loadConfig();
    const clearUrl = "https://www.makemytrip.com/";
    tab = await new Promise((resolve, reject) => {
      chrome.tabs.create({ url: clearUrl, active: false }, (createdTab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(createdTab);
        }
      });
    });

    console.log("[Background] Tab opened for clearing site data:", tab.id);

    await new Promise((resolve) => {
      let resolved = false;
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === "complete") {
          if (!resolved) {
            resolved = true;
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        }
      };
      chrome.tabs.onUpdated.addListener(listener);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }, 3000); // Reduced from 5000ms
    });

    await new Promise((resolve) => setTimeout(resolve, 500)); // Reduced from 1000ms

    console.log("[Background] 🧹 Clearing site data for makemytrip.com...");

    const baseDomain = cfg.domain
      .replace("https://", "")
      .replace("http://", "");
    const domainWithoutWww = baseDomain.replace("www.", "");
    const origins = [
      `https://www.${domainWithoutWww}`,
      `https://${domainWithoutWww}`,
      `https://flights-cb.${domainWithoutWww}`,
    ];

    if (cfg.cdnDomain) {
      origins.push(`https://${cfg.cdnDomain}`);
    }

    console.log("[Background] Clearing data for origins:", origins);

    await new Promise((resolve, reject) => {
      chrome.browsingData.remove(
        {
          origins: origins,
        },
        {
          cache: true,
          cookies: true,
          localStorage: true,
          indexedDB: true,
          serviceWorkers: true,
          cacheStorage: true,
          fileSystems: true,
          pluginData: true,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[Background] ❌ Error clearing site data:",
              chrome.runtime.lastError.message,
            );
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            console.log("[Background] ✅ Site data cleared successfully");
            resolve();
          }
        },
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 500)); // Reduced from 1000ms

    return true;
  } catch (error) {
    console.error("[Background] ❌ Error in clearSiteData:", error);
    return false;
  } finally {
    if (tab && tab.id) {
      try {
        chrome.tabs.remove(tab.id);
        console.log("[Background] ✅ Tab closed after clearing site data");
      } catch (error) {
        console.warn("[Background] Could not close tab:", error);
      }
    }
  }
}

/**
 * Close and reopen Chrome windows (excluding extension popup)
 * This effectively "restarts" Chrome from the extension's perspective
 * @returns {Promise<boolean>} - Promise resolving to true if successful
 */
async function closeAndReopenChrome() {
  try {
    console.log(
      "[Background] 🚪 Closing Chrome windows (excluding extension popup)...",
    );

    // Get all windows
    const windows = await chrome.windows.getAll();
    console.log(
      `[Background] Found ${windows.length} window(s), excluding extension popup (ID: ${persistentWindowId})`,
    );

    // Close all windows except the extension popup
    let closedCount = 0;
    for (const window of windows) {
      // Skip the extension popup window
      if (window.id === persistentWindowId) {
        console.log(
          `[Background] ⏭️ Skipping extension popup window ${window.id}`,
        );
        continue;
      }

      try {
        await chrome.windows.remove(window.id);
        console.log(`[Background] ✅ Closed window ${window.id}`);
        closedCount++;
      } catch (error) {
        console.warn(
          `[Background] Could not close window ${window.id}:`,
          error,
        );
      }
    }

    console.log(
      `[Background] ✅ Closed ${closedCount} Chrome window(s) (extension popup preserved)`,
    );

    // Wait a bit before reopening
    console.log("[Background] ⏳ Waiting 3 seconds before reopening Chrome...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Create a new window
    console.log("[Background] 🚪 Opening new Chrome window...");
    const newWindow = await chrome.windows.create({
      focused: true,
      type: "normal",
    });

    console.log(`[Background] ✅ New Chrome window opened: ${newWindow.id}`);

    // Wait a bit for the window to fully initialize
    console.log(
      "[Background] ⏳ Waiting 2 seconds for window to initialize...",
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("[Background] ✅ Chrome restarted successfully");
    return true;
  } catch (error) {
    console.error("[Background] ❌ Error in closeAndReopenChrome:", error);
    return false;
  }
}

/**
 * Retry failed URLs with the same processing logic
 * @param {Array} failedUrls - Array of failed URL objects
 * @param {number} urlsBeforeClear - Number of URLs before clearing site data
 * @param {number} delayBetweenUrls - Delay between URLs in milliseconds
 * @returns {Promise<Array>} - Promise resolving to array of retry results
 */
async function retryFailedUrls(failedUrls, urlsBeforeClear, delayBetweenUrls) {
  const retryResults = [];
  const PAUSE_ON_200_OK = 5 * 60 * 1000; // 5 minutes in milliseconds
  const MAX_RETRIES = 3; // Maximum retry attempts per URL

  for (let idx = 0; idx < failedUrls.length; idx++) {
    const failedUrl = failedUrls[idx];
    const url = failedUrl.url;

    console.log(
      `[Background] 🔄 Retrying failed URL ${idx + 1}/${failedUrls.length}:`,
      url,
    );

    chrome.runtime
      .sendMessage({
        action: "urlProcessingProgress",
        message: `🔄 Retrying failed URL ${idx + 1}/${failedUrls.length}...`,
        alert: true,
        alertType: "info",
      })
      .catch(() => {});

    // Wait before processing next URL (except for first one)
    if (idx > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenUrls));
    }

    let retrySuccess = false;
    let retryAttempt = 0;

    while (retryAttempt < MAX_RETRIES && !retrySuccess) {
      try {
        // Open tab
        const tab = await new Promise((resolve, reject) => {
          chrome.tabs.create({ url: url, active: false }, (tab) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(tab);
            }
          });
        });

        console.log(`[Background] Tab opened for retry:`, tab.id);

        // Wait for page to load
        await new Promise((resolve) => {
          let resolved = false;
          const listener = (tabId, changeInfo, tabInfo) => {
            if (tabId === tab.id && changeInfo.status === "complete") {
              if (!resolved) {
                resolved = true;
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            }
          };
          chrome.tabs.onUpdated.addListener(listener);

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          }, 3000);
        });

        // Inject content script
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"],
          });
        } catch (error) {
          console.warn(
            `[Background] Content script injection warning on retry:`,
            error.message,
          );
        }

        // Wait a bit for page to initialize
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Send message to content script to search and download API response
        const downloadResponse = await new Promise((resolve) => {
          chrome.tabs.sendMessage(
            tab.id,
            {
              action: "searchAndDownloadStreamAPI",
            },
            (response) => {
              if (chrome.runtime.lastError) {
                resolve({
                  success: false,
                  error: chrome.runtime.lastError.message,
                });
              } else {
                resolve(response || { success: false });
              }
            },
          );
        });

        // Close the tab
        try {
          chrome.tabs.remove(tab.id);
        } catch (error) {
          console.warn(`[Background] Could not close retry tab ${tab.id}:`, error);
        }

        if (downloadResponse && downloadResponse.success) {
          console.log(
            `[Background] ✅ Retry successful for URL ${idx + 1}/${failedUrls.length}`,
          );
          retryResults.push({
            url: url,
            success: true,
            retried: true,
            retryAttempt: retryAttempt + 1,
          });
          retrySuccess = true;
        } else {
          retryAttempt++;
          if (retryAttempt < MAX_RETRIES) {
            console.log(
              `[Background] ⚠️ Retry attempt ${retryAttempt}/${MAX_RETRIES} failed. Checking API status...`,
            );

            // Check if we need to wait for 200 OK response
            // The insert API retry logic is already handled in storeResponseInCollection
            // But we'll add a pause here if needed
            console.log(
              `[Background] ⏳ Waiting 5 minutes before next retry attempt...`,
            );

            chrome.runtime
              .sendMessage({
                action: "urlProcessingProgress",
                message: `⏳ Waiting 5 minutes before retry attempt ${retryAttempt + 1}/${MAX_RETRIES}...`,
                alert: true,
                alertType: "warning",
              })
              .catch(() => {});

            await new Promise((resolve) => setTimeout(resolve, PAUSE_ON_200_OK));
          }
        }
      } catch (error) {
        console.error(
          `[Background] Error in retry attempt ${retryAttempt + 1} for URL ${idx + 1}:`,
          error,
        );
        retryAttempt++;
        if (retryAttempt < MAX_RETRIES) {
          console.log(
            `[Background] ⏳ Waiting 5 minutes before next retry attempt...`,
          );

          chrome.runtime
            .sendMessage({
              action: "urlProcessingProgress",
              message: `⏳ Waiting 5 minutes before retry attempt ${retryAttempt + 1}/${MAX_RETRIES}...`,
              alert: true,
              alertType: "warning",
            })
            .catch(() => {});

          await new Promise((resolve) => setTimeout(resolve, PAUSE_ON_200_OK));
        }
      }
    }

    if (!retrySuccess) {
      console.warn(
        `[Background] ❌ All retry attempts failed for URL ${idx + 1}/${failedUrls.length}`,
      );
      retryResults.push({
        url: url,
        success: false,
        retried: true,
        retryAttempt: MAX_RETRIES,
        error: "All retry attempts failed",
      });
    }
  }

  return retryResults;
}

/**
 * Process URLs sequentially: open one, wait for API response, download, then move to next
 * @returns {Promise<Object>} - Promise resolving to { success, processedUrls, totalUrls }
 */
async function processUrlsSequentially() {
  // Check if already processing to prevent concurrent execution
  if (isProcessingUrls) {
    console.log("[Background] ⚠️ URL processing already running. Ignoring duplicate call.");
    return {
      success: false,
      error: "URL processing is already running. Please wait for it to complete.",
    };
  }

  // Set flag to prevent concurrent execution
  isProcessingUrls = true;
  console.log("[Background] 🔒 URL processing started. Lock acquired.");

  try {
    const cfg = await loadConfig();
    const urlsBeforeClear = cfg.urlsBeforeClear || 2;
    const delayBetweenUrls = 2000; // 2 seconds between URLs (reduced from 5)
    const delayBetweenBatches = 1000; // 1 second between batches (reduced from 2)

    const allProcessedUrls = [];
    const failedUrls = []; // Track failed URLs for retry
    let totalProcessed = 0;

    // Loop: fetch batch, process, repeat until API returns no URLs
    while (true) {
      // Clear cache and fetch fresh URLs from API
      cachedUrlList = null;
      const urls = await getUrlsToProcess({ forceRefresh: true });

      if (!urls || urls.length === 0) {
        console.log("[Background] No more URLs from API. Processing complete.");
        break;
      }

      const totalUrls = urls.length;
      console.log(
        `[Background] Processing batch: ${totalUrls} URLs (Total processed so far: ${totalProcessed})`,
      );

      const processedUrls = [];

      // Send initial progress
      chrome.runtime
        .sendMessage({
          action: "urlProcessingProgress",
          completed: totalProcessed,
          total: totalProcessed + totalUrls,
          message: `Processing batch: ${totalUrls} URLs...`,
        })
        .catch(() => {});

      for (let i = 0; i < totalUrls; i++) {
        const url = urls[i];

        // Wait before processing next URL (except for first one)
        if (i > 0) {
          console.log(
            `[Background] Waiting ${delayBetweenUrls / 1000} seconds before processing next URL...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayBetweenUrls));
        }

        try {
          // Send progress update
          chrome.runtime
            .sendMessage({
              action: "urlProcessingProgress",
              completed: totalProcessed + i,
              total: totalProcessed + totalUrls,
              currentUrl: url,
              message: `Processing URL ${i + 1}/${totalUrls} (Total: ${totalProcessed + i + 1})...`,
            })
            .catch(() => {});

          console.log(
            `[Background] Processing URL ${i + 1}/${totalUrls} (Total: ${totalProcessed + i + 1}):`,
            url,
          );

          // Open tab
          const tab = await new Promise((resolve, reject) => {
            chrome.tabs.create({ url: url, active: false }, (tab) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(tab);
              }
            });
          });

          console.log(`[Background] Tab opened:`, tab.id);

          // Wait for page to load
          await new Promise((resolve) => {
            let resolved = false;
            const listener = (tabId, changeInfo, tabInfo) => {
              if (tabId === tab.id && changeInfo.status === "complete") {
                if (!resolved) {
                  resolved = true;
                  chrome.tabs.onUpdated.removeListener(listener);
                  resolve();
                }
              }
            };
            chrome.tabs.onUpdated.addListener(listener);

            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            }, 3000); // 3 second timeout for page load (reduced from 5)
          });

          // Inject content script
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ["content.js"],
            });
            console.log(
              `[Background] Content script injected for tab ${tab.id}`,
            );
          } catch (error) {
            console.warn(
              `[Background] Content script injection warning:`,
              error.message,
            );
          }

          // Wait a bit for page to initialize
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Reduced from 2000ms

          // Send message to content script to search and download API response
          try {
            const downloadResponse = await new Promise((resolve) => {
              chrome.tabs.sendMessage(
                tab.id,
                {
                  action: "searchAndDownloadStreamAPI",
                },
                (response) => {
                  if (chrome.runtime.lastError) {
                    resolve({
                      success: false,
                      error: chrome.runtime.lastError.message,
                    });
                  } else {
                    resolve(response || { success: false });
                  }
                },
              );
            });

            if (downloadResponse && downloadResponse.success) {
              console.log(
                `[Background] ✅ API response downloaded for URL ${i + 1}`,
              );
              processedUrls.push({ url: url, success: true, tabId: tab.id });
            } else {
              console.warn(
                `[Background] ⚠️ API response not found for URL ${i + 1}`,
              );
              const failedUrl = {
                url: url,
                success: false,
                tabId: tab.id,
                error: downloadResponse?.message,
              };
              processedUrls.push(failedUrl);
              failedUrls.push(failedUrl); // Track for retry
            }
          } catch (error) {
            console.error(
              `[Background] Error downloading API for URL ${i + 1}:`,
              error,
            );
            const failedUrl = {
              url: url,
              success: false,
              tabId: tab.id,
              error: error.message,
            };
            processedUrls.push(failedUrl);
            failedUrls.push(failedUrl); // Track for retry
          }

          // Wait a bit more to ensure insertion completes
          await new Promise((resolve) => setTimeout(resolve, 500)); // Reduced from 1000ms

          // Close the tab
          try {
            chrome.tabs.remove(tab.id);
            console.log(`[Background] Tab ${tab.id} closed`);
          } catch (error) {
            console.warn(`[Background] Could not close tab ${tab.id}:`, error);
          }

          const currentIndex = totalProcessed + i + 1;
          // Send progress update
          chrome.runtime
            .sendMessage({
              action: "urlProcessingProgress",
              completed: totalProcessed + i + 1,
              total: totalProcessed + totalUrls,
              message: `Completed ${i + 1}/${totalUrls} URLs (Total: ${currentIndex})`,
            })
            .catch(() => {});

          // Close and reopen Chrome after every 10 URLs, starting from 11th URL
          if (currentIndex >= 11 && currentIndex % 10 === 1) {
            console.log(
              `[Background] 🚪 Closing and reopening Chrome after processing ${currentIndex} URLs (every 10 URLs starting from 11th)...`,
            );
            chrome.runtime
              .sendMessage({
                action: "urlProcessingProgress",
                completed: totalProcessed + i + 1,
                total: totalProcessed + totalUrls,
                message: `Closing and reopening Chrome after ${currentIndex} URLs...`,
              })
              .catch(() => {});

            const restartSuccess = await closeAndReopenChrome();
            if (restartSuccess) {
              console.log(
                `[Background] ✅ Chrome restarted successfully. Continuing with next URLs...`,
              );
              chrome.runtime
                .sendMessage({
                  action: "urlProcessingProgress",
                  completed: totalProcessed + i + 1,
                  total: totalProcessed + totalUrls,
                  message: `Chrome restarted. Continuing with next URLs...`,
                })
                .catch(() => {});
            } else {
              console.warn(
                `[Background] ⚠️ Failed to restart Chrome, but continuing...`,
              );
            }

            // Wait a bit after restarting before processing next URL
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          // Clear site data after every N URLs (configurable via urlsBeforeClear)
          // This ensures site data is 0 after processing N URLs, then again after N more, etc.
          if (currentIndex % urlsBeforeClear === 0) {
            console.log(
              `[Background] 🧹 Clearing site data after processing ${currentIndex} URLs (every ${urlsBeforeClear} URLs)...`,
            );
            chrome.runtime
              .sendMessage({
                action: "urlProcessingProgress",
                completed: totalProcessed + i + 1,
                total: totalProcessed + totalUrls,
                message: `Navigating to https://www.makemytrip.com/ and clearing site data after ${currentIndex} URLs...`,
              })
              .catch(() => {});

            const clearSuccess = await clearSiteData();
            if (clearSuccess) {
              console.log(
                `[Background] ✅ Site data cleared. Site data is now 0.`,
              );
              chrome.runtime
                .sendMessage({
                  action: "urlProcessingProgress",
                  completed: totalProcessed + i + 1,
                  total: totalProcessed + totalUrls,
                  message: `Site data cleared. Continuing with next URLs...`,
                })
                .catch(() => {});
            } else {
              console.warn(
                `[Background] ⚠️ Failed to clear site data, but continuing...`,
              );
            }

            // Wait a bit after clearing before processing next URL
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Reduced from 2000ms
          }
        } catch (error) {
          console.error(`[Background] Error processing URL ${i + 1}:`, error);
          const failedUrl = {
            url: url,
            success: false,
            error: error.message,
          };
          processedUrls.push(failedUrl);
          failedUrls.push(failedUrl); // Track for retry

          // Send progress update even on error
          chrome.runtime
            .sendMessage({
              action: "urlProcessingProgress",
              completed: totalProcessed + i + 1,
              total: totalProcessed + totalUrls,
              message: `Error processing URL ${i + 1}/${totalUrls} (Total: ${totalProcessed + i + 1})`,
            })
            .catch(() => {});
        }
      }

      // Batch complete - add to all processed URLs
      allProcessedUrls.push(...processedUrls);
      totalProcessed += totalUrls;

      console.log(
        `[Background] Batch complete: ${processedUrls.filter((p) => p.success).length}/${totalUrls} succeeded. Fetching next batch...`,
      );

      // Wait before fetching next batch
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    } // End of while loop

    const successCount = allProcessedUrls.filter((p) => p.success).length;

    // Retry failed URLs if any
    if (failedUrls.length > 0) {
      console.log(
        `[Background] 🔄 Found ${failedUrls.length} failed URLs. Starting retry process...`,
      );
      
      chrome.runtime
        .sendMessage({
          action: "urlProcessingProgress",
          message: `🔄 Retrying ${failedUrls.length} failed URLs...`,
          alert: true,
          alertType: "info",
        })
        .catch(() => {});

      const retryResults = await retryFailedUrls(failedUrls, urlsBeforeClear, delayBetweenUrls);
      
      // Update success count with retry results
      const retrySuccessCount = retryResults.filter((r) => r.success).length;
      const finalSuccessCount = successCount + retrySuccessCount;
      
      // Update allProcessedUrls with retry results (replace failed entries with retry results)
      retryResults.forEach((retryResult) => {
        const index = allProcessedUrls.findIndex(
          (p) => p.url === retryResult.url && !p.success,
        );
        if (index !== -1) {
          allProcessedUrls[index] = retryResult;
        } else {
          allProcessedUrls.push(retryResult);
        }
      });

      console.log(
        `[Background] ✅ Retry complete: ${retrySuccessCount}/${failedUrls.length} URLs succeeded on retry. Total success: ${finalSuccessCount}/${totalProcessed}`,
      );
      
      chrome.runtime
        .sendMessage({
          action: "urlProcessingProgress",
          message: `✅ Retry complete: ${retrySuccessCount}/${failedUrls.length} URLs succeeded. Total: ${finalSuccessCount}/${totalProcessed}`,
          alert: true,
          alertType: retrySuccessCount === failedUrls.length ? "success" : "warning",
        })
        .catch(() => {});
      
      // Close all Chrome windows after processing all URLs
      console.log(
        "[Background] 🚪 Closing all Chrome windows after processing all URLs...",
      );
      try {
        const windows = await chrome.windows.getAll();
        for (const window of windows) {
          try {
            await chrome.windows.remove(window.id);
            console.log(`[Background] ✅ Closed window ${window.id}`);
          } catch (error) {
            console.warn(
              `[Background] Could not close window ${window.id}:`,
              error,
            );
          }
        }
        console.log("[Background] ✅ All Chrome windows closed");
      } catch (error) {
        console.warn("[Background] ⚠️ Error closing Chrome windows:", error);
      }

      return {
        success: true,
        processedUrls: allProcessedUrls,
        totalUrls: totalProcessed,
        successCount: finalSuccessCount,
        message: `Processed ${totalProcessed} URLs. ${finalSuccessCount} inserted successfully (${retrySuccessCount} from retries).`,
      };
    }

    // Close all Chrome windows after processing all URLs
    console.log(
      "[Background] 🚪 Closing all Chrome windows after processing all URLs...",
    );
    try {
      const windows = await chrome.windows.getAll();
      for (const window of windows) {
        try {
          await chrome.windows.remove(window.id);
          console.log(`[Background] ✅ Closed window ${window.id}`);
        } catch (error) {
          console.warn(
            `[Background] Could not close window ${window.id}:`,
            error,
          );
        }
      }
      console.log("[Background] ✅ All Chrome windows closed");
    } catch (error) {
      console.warn("[Background] ⚠️ Error closing Chrome windows:", error);
    }

    return {
      success: true,
      processedUrls: allProcessedUrls,
      totalUrls: totalProcessed,
      successCount: successCount,
      message: `Processed ${totalProcessed} URLs. ${successCount} inserted successfully.`,
    };
  } catch (error) {
    console.error("[Background] Error in processUrlsSequentially:", error);

    // Close all Chrome windows even on error
    console.log("[Background] 🚪 Closing all Chrome windows after error...");
    try {
      const windows = await chrome.windows.getAll();
      for (const window of windows) {
        try {
          await chrome.windows.remove(window.id);
          console.log(`[Background] ✅ Closed window ${window.id}`);
        } catch (error) {
          console.warn(
            `[Background] Could not close window ${window.id}:`,
            error,
          );
        }
      }
      console.log("[Background] ✅ All Chrome windows closed");
    } catch (closeError) {
      console.warn("[Background] ⚠️ Error closing Chrome windows:", closeError);
    }

    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  } finally {
    // Always reset the flag to allow future executions
    isProcessingUrls = false;
    console.log("[Background] 🔓 URL processing completed. Lock released.");
  }
}

/**
 * Main function to generate URL, open tab, intercept /search-stream-dt API, and download data
 * @param {string} source - Source airport code (e.g., 'BLR')
 * @param {string} dest - Destination airport code (e.g., 'DEL')
 * @param {Date|string} date - Travel date (Date object or ISO string)
 * @param {string} tripType - 'oneway' or 'round' (default: 'oneway')
 * @returns {Promise<Object>} - Promise resolving to { success, tabId, url, filename }
 */
async function generateURLAndExtractEventStream(
  source,
  dest,
  date,
  tripType = "oneway",
) {
  try {
    // Validate inputs
    if (!source || !dest) {
      throw new Error("Source and destination are required");
    }

    // Convert date to Date object if string
    let dateObj;
    if (typeof date === "string") {
      dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        throw new Error(`Invalid date string: ${date}`);
      }
    } else if (date instanceof Date) {
      dateObj = date;
    } else {
      // Default to tomorrow if no date provided
      dateObj = new Date();
      dateObj.setDate(dateObj.getDate() + 1);
    }

    // Format date as DD/MM/YYYY
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    const dateStr = `${day}/${month}/${year}`;

    console.log("[Background] Input parameters:", {
      source,
      dest,
      date: dateStr,
      tripType,
    });

    // Load config if not already loaded
    const cfg = await loadConfig();

    const baseDomain = (cfg.domain || "https://www.makemytrip.com").replace(
      /\/$/,
      "",
    );
    const flightBase = `${baseDomain}/flight`;
    const itinerary = `${source}-${dest}-${dateStr}`;
    const tripCode = tripType === "oneway" ? "O" : "R";

    const url = `${flightBase}/search?itinerary=${itinerary}&tripType=${tripCode}&paxType=A-1_C-0_I-0&intl=false&cabinClass=E&lang=eng`;

    console.log("[Background] Generated URL:", url);

    // Open tab
    const tab = await new Promise((resolve, reject) => {
      chrome.tabs.create({ url: url, active: true }, (tab) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[Background] Error creating tab:",
            chrome.runtime.lastError,
          );
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log("[Background] Tab created successfully:", tab.id);
          resolve(tab);
        }
      });
    });

    console.log("[Background] Opened tab:", tab.id);

    // Use already loaded config for domain check
    const domainCheck = cfg.domain
      .replace("https://", "")
      .replace("http://", "");

    // Wait for page to load (with better error handling)
    await new Promise((resolve, reject) => {
      let resolved = false;
      const listener = (tabId, changeInfo, tabInfo) => {
        if (tabId === tab.id) {
          console.log(
            "[Background] Tab update:",
            changeInfo.status,
            changeInfo.url,
          );

          if (
            changeInfo.status === "complete" &&
            tabInfo.url &&
            tabInfo.url.includes(domainCheck)
          ) {
            if (!resolved) {
              resolved = true;
              chrome.tabs.onUpdated.removeListener(listener);
              console.log("[Background] Page loaded completely");
              resolve();
            }
          }

          // Check for errors
          if (
            changeInfo.status === "loading" &&
            changeInfo.url &&
            changeInfo.url.startsWith("chrome-error://")
          ) {
            if (!resolved) {
              resolved = true;
              chrome.tabs.onUpdated.removeListener(listener);
              reject(new Error("Failed to load page: " + changeInfo.url));
            }
          }
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          console.warn("[Background] Page load timeout, continuing anyway");
          resolve(); // Continue even if timeout
        }
      }, 10000); // 10 second timeout (reduced from 30)
    });

    // Inject content script to monitor network
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      console.log("[Background] Content script injected successfully");
    } catch (error) {
      console.warn(
        "[Background] Content script injection warning:",
        error.message,
      );
      // Don't fail if script is already injected
    }

    return {
      success: true,
      tabId: tab.id,
      url: url,
      message:
        "Tab opened. Content script is monitoring for /search-stream-dt API. Data will be automatically downloaded when detected.",
    };
  } catch (error) {
    console.error(
      "[Background] Error in generateURLAndExtractEventStream:",
      error,
    );
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
}

// Make function available globally for testing
if (typeof globalThis !== "undefined") {
  globalThis.generateURLAndExtractEventStream =
    generateURLAndExtractEventStream;
}

/**
 * Store captured request headers dynamically using chrome.webRequest
 * This captures ALL network requests, not just fetch/XMLHttpRequest
 */
const capturedHeaders = new Map(); // In-memory storage for headers: URL -> headers object

/**
 * Listen to webRequest.onBeforeSendHeaders to capture headers dynamically
 * This captures headers from ALL network requests to makemytrip.com domains
 */
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    try {
      const url = details.url;

      // Use cached config (loaded at startup)
      if (!config) {
        // Config not loaded yet, use default check
        if (
          url.includes("makemytrip.com") ||
          url.includes("mmtcdn.net") ||
          url.includes("flights-cb.makemytrip.com")
        ) {
          // Continue with default behavior
        } else {
          return { requestHeaders: details.requestHeaders };
        }
      } else {
        const domainMatch =
          url.includes(
            config.domain.replace("https://", "").replace("http://", ""),
          ) ||
          url.includes(config.cdnDomain) ||
          url.includes(config.apiDomain);

        if (!domainMatch) {
          return { requestHeaders: details.requestHeaders };
        }
      }

      // Process headers if domain matches
      {
        // Convert headers array to object for easier access
        const headersObj = {};
        let cookieHeader = null;
        const cookiesObj = {}; // Parse individual cookies

        if (details.requestHeaders) {
          details.requestHeaders.forEach((header) => {
            // Store with original case for key, but also allow case-insensitive lookup
            headersObj[header.name] = header.value;
            // Also store lowercase version for easy lookup
            headersObj[header.name.toLowerCase()] = header.value;

            // Extract cookie header
            if (header.name.toLowerCase() === "cookie") {
              cookieHeader = header.value;

              // Parse cookies into individual key-value pairs
              if (cookieHeader) {
                const cookiePairs = cookieHeader.split(";");
                cookiePairs.forEach((pair) => {
                  const trimmed = pair.trim();
                  if (trimmed) {
                    const [name, ...valueParts] = trimmed.split("=");
                    if (name) {
                      const cookieName = name.trim();
                      const cookieValue = valueParts.join("=").trim(); // Rejoin in case value contains '='
                      cookiesObj[cookieName] = cookieValue;
                    }
                  }
                });
              }
            }
          });
        }

        // Store headers with URL as key
        const capturedData = {
          headers: headersObj,
          cookies: cookieHeader || "", // Full cookie string
          cookiesParsed: cookiesObj, // Parsed cookies object
          timestamp: new Date().toISOString(),
          method: details.method,
          requestId: details.requestId,
          tabId: details.tabId,
        };

        capturedHeaders.set(url, capturedData);

        // Also store by requestId for quick lookup
        capturedHeaders.set(`requestId:${details.requestId}`, {
          url: url,
          ...capturedData,
        });

        // Comprehensive logging for all requests
        console.log("[Background] ========================================");
        console.log("[Background] 🌐 webRequest Headers Captured");
        console.log("[Background] ========================================");
        console.log("[Background] URL:", url);
        console.log("[Background] Method:", details.method);
        console.log("[Background] Request ID:", details.requestId);
        console.log("[Background] Tab ID:", details.tabId);
        console.log("[Background] Timestamp:", capturedData.timestamp);
        console.log(
          "[Background] Total Headers:",
          Object.keys(headersObj).filter(
            (k) => !k.includes(":") && k === k.toLowerCase(),
          ).length,
        );

        // Log all headers
        console.log("[Background] 📋 ALL HEADERS:");
        const headerKeys = Object.keys(headersObj).filter(
          (k) => !k.includes(":") && k === k.toLowerCase(),
        );
        headerKeys.forEach((key) => {
          const originalKey =
            Object.keys(headersObj).find(
              (k) => k.toLowerCase() === key && k !== key,
            ) || key;
          const value = headersObj[originalKey] || headersObj[key];
          const displayValue =
            value && value.length > 100
              ? value.substring(0, 100) + "..."
              : value;
          console.log(`[Background]   ${originalKey}: ${displayValue}`);
        });

        // Log cookies
        console.log("[Background] 🍪 COOKIES:");
        if (cookieHeader) {
          console.log(
            "[Background]   Cookie Header (full):",
            cookieHeader.length > 200
              ? cookieHeader.substring(0, 200) + "..."
              : cookieHeader,
          );
          console.log(
            "[Background]   Total Cookies:",
            Object.keys(cookiesObj).length,
          );
          console.log("[Background]   Individual Cookies:");
          Object.keys(cookiesObj).forEach((cookieName) => {
            const cookieValue = cookiesObj[cookieName];
            const displayValue =
              cookieValue && cookieValue.length > 50
                ? cookieValue.substring(0, 50) + "..."
                : cookieValue;
            console.log(`[Background]     ${cookieName} = ${displayValue}`);
          });

          // Log important cookies
          const importantCookies = [
            "dvid",
            "mcid",
            "sessionid",
            "auth",
            "token",
            "userid",
            "uuid",
          ];
          console.log("[Background]   Important Cookies:");
          importantCookies.forEach((cookieName) => {
            const found = Object.keys(cookiesObj).find(
              (k) => k.toLowerCase() === cookieName.toLowerCase(),
            );
            if (found) {
              console.log(`[Background]     ✅ ${found}: ${cookiesObj[found]}`);
            } else {
              console.log(`[Background]     ❌ ${cookieName}: NOT FOUND`);
            }
          });
        } else {
          console.log("[Background]   ⚠️ No Cookie header found");
        }

        // Enhanced logging for important API requests
        const apiCheck = config
          ? url.includes(config.api_names.searchStreamAPI) ||
            url.includes(config.api_names.searchStreamAPIFull)
          : url.includes("/search-stream-dt") ||
            url.includes("search-stream-dt");
        if (apiCheck) {
          console.log(
            "[Background] ⭐ IMPORTANT: /search-stream-dt API Request Detected",
          );
          console.log("[Background] Critical Headers:");
          const criticalHeaders = [
            "mcid",
            "device-id",
            "cookie",
            "user-agent",
            "origin",
            "referer",
            "accept",
            "authorization",
          ];
          criticalHeaders.forEach((headerName) => {
            const found = Object.keys(headersObj).find(
              (k) => k.toLowerCase() === headerName.toLowerCase(),
            );
            if (found) {
              const value = headersObj[found];
              const displayValue =
                value && value.length > 80
                  ? value.substring(0, 80) + "..."
                  : value;
              console.log(`[Background]   ✅ ${found}: ${displayValue}`);
            } else {
              console.log(`[Background]   ❌ ${headerName}: NOT FOUND`);
            }
          });
        }

        console.log("[Background] ========================================");
      }
    } catch (error) {
      console.error("[Background] ❌ Error capturing headers:", error);
      console.error("[Background] Error stack:", error.stack);
    }

    // Return unmodified headers (we're just reading, not modifying)
    return { requestHeaders: details.requestHeaders };
  },
  {
    urls: [
      "https://*.makemytrip.com/*",
      "https://*.mmtcdn.net/*",
      "https://flights-cb.makemytrip.com/*",
    ],
  },
  ["requestHeaders"], // Need to request access to requestHeaders
);

/**
 * Fetch cookies dynamically using chrome.cookies API
 * @param {string} url - URL to get cookies for
 * @returns {Promise<Object>} - Promise resolving to { cookies: string, cookiesParsed: object }
 */
async function getCookiesForUrl(url) {
  try {
    if (!url) {
      console.warn("[Background] No URL provided for cookie fetching");
      return { cookies: "", cookiesParsed: {} };
    }

    // Parse URL to get domain
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (e) {
      console.warn("[Background] Invalid URL for cookie fetching:", url);
      return { cookies: "", cookiesParsed: {} };
    }

    const domain = urlObj.hostname;
    const cookiesParsed = {};
    const cookiePairs = [];

    console.log("[Background] 🍪 Fetching cookies using chrome.cookies API");
    console.log("[Background]   URL:", url);
    console.log("[Background]   Domain:", domain);

    // Get all cookies for the domain
    const cookies = await new Promise((resolve, reject) => {
      chrome.cookies.getAll({ domain: domain }, (cookies) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(cookies || []);
        }
      });
    });

    console.log("[Background]   Found", cookies.length, "cookies for domain");

    // Also try to get cookies for parent domains (e.g., .makemytrip.com)
    // Extract base domain (e.g., makemytrip.com from www.makemytrip.com)
    const domainParts = domain.split(".");
    let parentDomain = null;
    if (domainParts.length > 2) {
      // Get parent domain (e.g., .makemytrip.com)
      parentDomain = "." + domainParts.slice(-2).join(".");
    } else if (domainParts.length === 2) {
      // Already a base domain, try with dot prefix
      parentDomain = "." + domain;
    }

    let allCookies = cookies;

    // Try to get cookies from parent domain if it's different
    if (parentDomain && parentDomain !== domain && !domain.startsWith(".")) {
      try {
        const parentCookies = await new Promise((resolve, reject) => {
          chrome.cookies.getAll({ domain: parentDomain }, (cookies) => {
            if (chrome.runtime.lastError) {
              resolve([]); // Don't fail if parent domain fails
            } else {
              resolve(cookies || []);
            }
          });
        });

        console.log(
          "[Background]   Found",
          parentCookies.length,
          "cookies for parent domain:",
          parentDomain,
        );

        // Merge cookies, avoiding duplicates (child domain cookies take precedence)
        const cookieMap = new Map();
        // Add parent domain cookies first
        parentCookies.forEach((cookie) => cookieMap.set(cookie.name, cookie));
        // Add/override with child domain cookies
        cookies.forEach((cookie) => cookieMap.set(cookie.name, cookie));

        // Convert to array
        allCookies = Array.from(cookieMap.values());
      } catch (error) {
        console.warn(
          "[Background] Could not fetch parent domain cookies:",
          error,
        );
        // Continue with just the domain cookies
      }
    }

    // Build cookie string and parsed object from all cookies
    allCookies.forEach((cookie) => {
      const cookieString = `${cookie.name}=${cookie.value}`;
      cookiePairs.push(cookieString);
      cookiesParsed[cookie.name] = cookie.value;

      // Log cookie details
      console.log(
        `[Background]     Cookie: ${cookie.name} = ${cookie.value.length > 50 ? cookie.value.substring(0, 50) + "..." : cookie.value}`,
      );
      console.log(
        `[Background]       Domain: ${cookie.domain}, Path: ${cookie.path}, Secure: ${cookie.secure}, HttpOnly: ${cookie.httpOnly}`,
      );
    });

    const cookieString = cookiePairs.join("; ");

    console.log(
      "[Background]   Total cookies:",
      Object.keys(cookiesParsed).length,
    );
    console.log("[Background]   Cookie string length:", cookieString.length);

    // Log important cookies
    const importantCookies = [
      "dvid",
      "mcid",
      "sessionid",
      "auth",
      "token",
      "userid",
      "uuid",
    ];
    console.log("[Background]   Important cookies check:");
    importantCookies.forEach((cookieName) => {
      const found = Object.keys(cookiesParsed).find(
        (k) => k.toLowerCase() === cookieName.toLowerCase(),
      );
      if (found) {
        console.log(`[Background]     ✅ ${found}: ${cookiesParsed[found]}`);
      } else {
        console.log(`[Background]     ❌ ${cookieName}: NOT FOUND`);
      }
    });

    return {
      cookies: cookieString,
      cookiesParsed: cookiesParsed,
    };
  } catch (error) {
    console.error("[Background] ❌ Error fetching cookies:", error);
    return { cookies: "", cookiesParsed: {} };
  }
}

/**
 * Handle requests to get captured headers
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getCapturedHeaders") {
    const { url, requestId } = request;

    let headersData = null;

    // Try to find by URL first
    if (url) {
      // Try exact match
      headersData = capturedHeaders.get(url);

      // If not found, try to find by URL pattern (for timestamp variations)
      if (!headersData) {
        for (const [key, value] of capturedHeaders.entries()) {
          if (key.startsWith("http") && key.includes(url.split("?")[0])) {
            headersData = value;
            break;
          }
        }
      }
    }

    // Try by requestId if URL didn't work
    if (!headersData && requestId) {
      headersData = capturedHeaders.get(`requestId:${requestId}`);
    }

    // If still not found, get the most recent headers for search-stream-dt
    if (!headersData && url) {
      const apiCheck = config
        ? url.includes(config.api_names.searchStreamAPI) ||
          url.includes(config.api_names.searchStreamAPIFull)
        : url.includes("search-stream-dt");

      if (apiCheck) {
        let mostRecent = null;
        let mostRecentTime = 0;
        for (const [key, value] of capturedHeaders.entries()) {
          const keyApiCheck = config
            ? key.includes(config.api_names.searchStreamAPI) ||
              key.includes(config.api_names.searchStreamAPIFull)
            : key.includes("search-stream-dt");
          if (keyApiCheck && value.timestamp) {
            const time = new Date(value.timestamp).getTime();
            if (time > mostRecentTime) {
              mostRecentTime = time;
              mostRecent = value;
            }
          }
        }
        headersData = mostRecent;
      }
    }

    if (headersData) {
      sendResponse({
        success: true,
        headers: headersData.headers,
        cookies: headersData.cookies || "",
        cookiesParsed: headersData.cookiesParsed || {},
        data: headersData,
      });
    } else {
      sendResponse({
        success: false,
        error: "Headers not found for URL: " + url,
      });
    }

    return true; // Keep channel open for async response
  } else if (request.action === "getAllCapturedHeaders") {
    // Return all captured headers (for debugging)
    const allHeaders = {};
    for (const [key, value] of capturedHeaders.entries()) {
      if (key.startsWith("http")) {
        allHeaders[key] = value;
      }
    }
    sendResponse({ success: true, headers: allHeaders });
    return true;
  } else if (request.action === "getCookies") {
    // Fetch cookies dynamically using chrome.cookies API
    const { url } = request;

    (async () => {
      try {
        const cookieData = await getCookiesForUrl(url);
        sendResponse({
          success: true,
          cookies: cookieData.cookies,
          cookiesParsed: cookieData.cookiesParsed,
        });
      } catch (error) {
        console.error("[Background] Error in getCookies handler:", error);
        sendResponse({
          success: false,
          error: error.message,
          cookies: "",
          cookiesParsed: {},
        });
      }
    })();

    return true; // Keep channel open for async response
  }

  return false; // Not handled by this listener
});

// Log that background service worker is loaded
console.log("pdfcreater background service worker loaded");
console.log(
  "[Background] chrome.webRequest listener installed for header capture",
);

let isScheduledExecutionRunning = false;
let isProcessingUrls = false; // Global flag to prevent concurrent execution of processUrlsSequentially
const SCHEDULED_HOUR = 16;
const SCHEDULED_MINUTE = 1;

async function setupScheduledExecution() {
  const cfg = await loadConfig();
  const enableScheduling = cfg.enableScheduling !== false; // Default to true if not specified

  if (!enableScheduling) {
    console.log("[Background] ⏰ Scheduling is disabled in config.json");
    // Clear any existing alarm if scheduling is disabled
    try {
      await chrome.alarms.clear("autoRunExtension");
      console.log("[Background] Cleared existing scheduled alarm");
    } catch (error) {
      // Alarm might not exist, ignore error
    }
    return;
  }

  const now = new Date();
  const scheduledTime = new Date();
  scheduledTime.setHours(SCHEDULED_HOUR, SCHEDULED_MINUTE, 0, 0);

  if (now >= scheduledTime) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }

  const delayInMinutes = Math.round(
    (scheduledTime.getTime() - now.getTime()) / (1000 * 60),
  );

  chrome.alarms.create("autoRunExtension", {
    when: scheduledTime.getTime(),
    periodInMinutes: 24 * 60,
  });
  const timeString = `${String(SCHEDULED_HOUR).padStart(2, "0")}:${String(SCHEDULED_MINUTE).padStart(2, "0")}`;
  console.log(
    `[Background] ⏰ Scheduled automatic execution at ${timeString} daily`,
  );
  console.log("[Background] Next execution:", scheduledTime.toLocaleString());
  console.log(
    "[Background] Time until next execution:",
    delayInMinutes,
    "minutes",
  );
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "autoRunExtension") {
    const cfg = await loadConfig();
    const enableScheduling = cfg.enableScheduling !== false; // Default to true if not specified

    if (!enableScheduling) {
      console.log("[Background] ⏰ Scheduling is disabled in config.json. Ignoring alarm.");
      return;
    }

    if (isScheduledExecutionRunning) {
      console.log(
        "[Background] ⚠️ Scheduled execution already running. Skipping this trigger.",
      );
      return;
    }

    // Check if URL processing is already running (prevents concurrent execution)
    if (isProcessingUrls) {
      console.log(
        "[Background] ⚠️ URL processing already running. Skipping scheduled execution.",
      );
      return;
    }

    isScheduledExecutionRunning = true;
    const startTime = new Date();

    console.log("[Background] ========================================");
    console.log("[Background] ⏰ SCHEDULED EXTRACTION STARTED");
    console.log("[Background] ========================================");
    console.log("[Background] Start time:", startTime.toLocaleString());

    try {
      const windows = await chrome.windows.getAll();
      if (windows.length === 0) {
        await chrome.windows.create({ focused: true });
        console.log("[Background] 🌐 Chrome window opened automatically");
      } else {
        await chrome.windows.update(windows[0].id, { focused: true });
        console.log("[Background] 🌐 Chrome window focused");
      }
    } catch (error) {
      console.warn("[Background] Could not open/focus Chrome window:", error);
    }

    try {
      const result = await processUrlsSequentially();

      const endTime = new Date();
      const totalDuration = endTime.getTime() - startTime.getTime();

      if (result.success) {
        console.log("[Background] ========================================");
        console.log("[Background] ✅ ALL URLS PROCESSED - EXTRACTION ENDED");
        console.log("[Background] ========================================");
        console.log("[Background] End time:", endTime.toLocaleString());
        console.log(
          "[Background] Total duration:",
          Math.round(totalDuration / 1000),
          "seconds",
        );
        console.log(
          "[Background] URLs processed:",
          result.processedUrls?.length || 0,
        );
        console.log(
          "[Background] Successful extractions:",
          result.successCount || 0,
        );
        console.log("[Background] ========================================");
        const timeString = `${String(SCHEDULED_HOUR).padStart(2, "0")}:${String(SCHEDULED_MINUTE).padStart(2, "0")}`;
        console.log(
          `[Background] 🏁 Execution completed. Will run again tomorrow at ${timeString}.`,
        );
      } else {
        console.error("[Background] ❌ URL processing failed:", result.error);
        console.log(
          "[Background] Execution ended after",
          Math.round(totalDuration / 1000),
          "seconds",
        );
        const timeString = `${String(SCHEDULED_HOUR).padStart(2, "0")}:${String(SCHEDULED_MINUTE).padStart(2, "0")}`;
        console.log(`[Background] Will run again tomorrow at ${timeString}.`);
      }
    } catch (error) {
      console.error("[Background] ❌ Error in scheduled execution:", error);
      console.error("[Background] Error stack:", error.stack);
      const endTime = new Date();
      const totalDuration = endTime.getTime() - startTime.getTime();
      console.log(
        "[Background] Execution ended after",
        Math.round(totalDuration / 1000),
        "seconds due to error",
      );
      const timeString = `${String(SCHEDULED_HOUR).padStart(2, "0")}:${String(SCHEDULED_MINUTE).padStart(2, "0")}`;
      console.log(`[Background] Will run again tomorrow at ${timeString}.`);
    } finally {
      isScheduledExecutionRunning = false;
      const timeString = `${String(SCHEDULED_HOUR).padStart(2, "0")}:${String(SCHEDULED_MINUTE).padStart(2, "0")}`;
      console.log(
        `[Background] Ready for next scheduled run (tomorrow at ${timeString}).`,
      );

      try {
        console.log("[Background] 🚪 Closing Chrome windows...");
        const windows = await chrome.windows.getAll();
        for (const window of windows) {
          try {
            await chrome.windows.remove(window.id);
            console.log(`[Background] ✅ Closed window ${window.id}`);
          } catch (error) {
            console.warn(
              `[Background] Could not close window ${window.id}:`,
              error,
            );
          }
        }
        console.log("[Background] ✅ All Chrome windows closed");
      } catch (error) {
        console.warn("[Background] ⚠️ Error closing Chrome windows:", error);
      }
    }
  }
});

setupScheduledExecution();

if (chrome.windows && chrome.windows.onRemoved) {
  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === persistentWindowId) {
      persistentWindowId = null;

      // Clean up size enforcement listeners
      if (windowSizeEnforcer) {
        chrome.windows.onBoundsChanged.removeListener(windowSizeEnforcer);
        windowSizeEnforcer = null;
      }
      if (windowSizeCheckInterval) {
        clearInterval(windowSizeCheckInterval);
        windowSizeCheckInterval = null;
      }
    }
  });
}
