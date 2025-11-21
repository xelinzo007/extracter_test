/**
 * Content Script - Intercepts network requests and handles event stream extraction
 */

// Prevent script from running multiple times
if (window.__contentScriptLoaded) {
  console.log("[Content Script] Script already loaded, skipping re-injection");
} else {
  window.__contentScriptLoaded = true;

  // Load configuration from config.json
  let config = null;

  async function loadConfig() {
    if (config) return config;

    try {
      const configUrl = chrome.runtime.getURL("config.json");
      const response = await fetch(configUrl);
      config = await response.json();
      console.log("[Content Script] Config loaded:", config);
      return config;
    } catch (error) {
      console.error(
        "[Content Script] Error loading config, using defaults:",
        error,
      );
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
        domain: "https://www.makemytrip.com",
        apiDomain: "flights-cb.makemytrip.com",
        cdnDomain: "mmtcdn.net",
      };
      return config;
    }
  }

  // Load config on startup
  loadConfig();

  /**
   * Get a random user agent string
   * @returns {string} - Random user agent string
   */
  function getRandomUserAgent() {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36 OPR/96.0.0.0",
      "Mozilla/5.0 (Linux; U; Android 9; en-US; Redmi Note 7 Build/PKQ1.180904.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/72.0.3626.122 UCBrowser/13.4.0.1306 Mobile Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
      "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Android 13; Mobile; rv:118.0) Gecko/118.0 Firefox/118.0",
      "Mozilla/5.0 (Linux; Android 13; SM-G996B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Brave Chrome/119.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Vivaldi/6.2.3105.54 Chrome/118.0.5993.90 Safari/537.36",
      "Mozilla/5.0 (Linux; Android 12; CPH2207) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36 OPR/76.2.4027.73374",
    ];

    const randomIndex = Math.floor(Math.random() * userAgents.length);
    const selectedUA = userAgents[randomIndex];
    console.log("[Content Script] 🎲 Selected random user agent:", selectedUA);
    return selectedUA;
  }

  /**
   * Generate MakeMyTrip flight search URL
   * @param {string} source - Source airport code (e.g., 'BLR')
   * @param {string} dest - Destination airport code (e.g., 'DEL')
   * @param {Date} date - Travel date
   * @param {string} tripType - 'oneway' or 'round'
   * @returns {string} - Generated URL
   */
  async function generateMakeMyTripURL(
    source,
    dest,
    date,
    tripType = "oneway",
  ) {
    // Format date as DD/MM/YYYY
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateStr = `${day}/${month}/${year}`;

    const cfg = await loadConfig();
    const baseDomain = (cfg.domain || "https://www.makemytrip.com").replace(
      /\/$/,
      "",
    );
    const baseURL = `${baseDomain}/flight`;

    if (tripType === "oneway") {
      return `${baseURL}/search?itinerary=${source}-${dest}-${dateStr}&tripType=O&paxType=A-1_C-0_I-0&intl=false&cabinClass=E&lang=eng`;
    } else {
      // For round trip, you'd need return date too
      return `${baseURL}/search?itinerary=${source}-${dest}-${dateStr}&tripType=R&paxType=A-1_C-0_I-0&intl=false&cabinClass=E&lang=eng`;
    }
  }

  /**
   * Decompress gzip data (H4sI prefix indicates gzip compression)
   * @param {string} compressedData - Base64 encoded gzip data
   * @returns {string} - Decompressed string
   */
  function decompressGzip(compressedData) {
    try {
      // Remove H4sI prefix if present and decode base64
      let base64Data = compressedData;
      if (compressedData.startsWith("H4sI")) {
        base64Data = compressedData;
      }

      // Convert base64 to binary string
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Use pako or native decompression if available
      // For now, we'll use a simple approach - try to decompress
      // Note: Browser doesn't have native gzip decompression, so we'll store the raw data
      // and let the background script handle it, or use a library

      // Return the bytes for now - we'll handle decompression in background if needed
      return compressedData;
    } catch (error) {
      console.error("[Content Script] Error decompressing:", error);
      return compressedData;
    }
  }

  /**
   * Parse Server-Sent Events (SSE) stream
   * @param {string} streamText - Raw stream text
   * @returns {Array} - Parsed event data
   */
  function parseEventStream(streamText) {
    const events = [];
    const lines = streamText.split("\n");
    let currentEvent = { type: "", data: "", id: "" };

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent.type = line.substring(6).trim();
      } else if (line.startsWith("data:")) {
        const data = line.substring(5).trim();
        if (currentEvent.data) {
          currentEvent.data += "\n" + data;
        } else {
          currentEvent.data = data;
        }
      } else if (line.startsWith("id:")) {
        currentEvent.id = line.substring(3).trim();
      } else if (line === "") {
        // Empty line indicates end of event
        if (currentEvent.data) {
          // Check if data is compressed (gzip)
          let processedData = currentEvent.data;
          if (
            currentEvent.data.startsWith("H4sI") ||
            currentEvent.data.startsWith('{"Access-Control')
          ) {
            // Store compressed data as-is, will be processed later
            processedData = currentEvent.data;
          }

          try {
            // Try to parse JSON data
            currentEvent.parsedData = JSON.parse(processedData);
          } catch (e) {
            // If not JSON, keep as string (might be compressed)
            currentEvent.parsedData = processedData;
          }
          events.push({ ...currentEvent });
          currentEvent = { type: "", data: "", id: "" };
        }
      }
    }

    // Handle last event if stream ends without empty line
    if (currentEvent.data) {
      let processedData = currentEvent.data;
      if (
        currentEvent.data.startsWith("H4sI") ||
        currentEvent.data.startsWith('{"Access-Control')
      ) {
        processedData = currentEvent.data;
      }

      try {
        currentEvent.parsedData = JSON.parse(processedData);
      } catch (e) {
        currentEvent.parsedData = processedData;
      }
      events.push(currentEvent);
    }

    return events;
  }

  // Store all network requests
  const networkRequests = [];

  // Track downloaded URLs to prevent duplicate downloads
  const downloadedUrls = new Set();

  /**
   * Store network request details
   */
  function storeNetworkRequest(details) {
    networkRequests.push({
      ...details,
      timestamp: new Date().toISOString(),
    });
    console.log(
      "[Content Script] 📦 Stored network request:",
      details.url,
      details.method || "GET",
    );
  }

  /**
   * Download Chunk End data as JSON file
   * @param {Object} chunkEndData - The chunk End data object (can have different structures)
   * @param {string} urlString - The URL where the data came from
   */
  function downloadChunkEndAsJSON(chunkEndData, urlString) {
    if (!chunkEndData) {
      console.warn("[Content Script] No chunkEndData to download");
      return;
    }

    // Prevent duplicate downloads - check if this URL was already downloaded
    if (downloadedUrls.has(urlString)) {
      console.log(
        "[Content Script] ⚠️ Skipping duplicate download for URL:",
        urlString,
      );
      return;
    }

    // Mark this URL as downloaded
    downloadedUrls.add(urlString);

    try {
      // Extract route info from URL if available
      let routeInfo = {};
      try {
        const urlObj = new URL(urlString);
        const itParam = urlObj.searchParams.get("it"); // e.g., "BLR-PAT-20251114"
        if (itParam) {
          const parts = itParam.split("-");
          if (parts.length >= 3) {
            routeInfo = {
              source: parts[0],
              destination: parts[1],
              date: parts[2],
            };
          }
        }
      } catch (e) {
        // URL parsing failed, continue without route info
      }

      // Create filename with route info if available
      const routeSuffix =
        routeInfo.source && routeInfo.destination
          ? `${routeInfo.source}-${routeInfo.destination}-${routeInfo.date || "unknown"}`
          : "unknown-route";
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `chunk-end-${routeSuffix}-${timestamp}.json`;

      // Normalize chunkEndData structure - handle both formats
      let normalizedData;
      if (chunkEndData.event) {
        // Format from processEventStreamData: { event, rawData, parsedData, index }
        normalizedData = {
          event: chunkEndData.event,
          rawData: chunkEndData.rawData,
          parsedData: chunkEndData.parsedData,
          index: chunkEndData.index,
        };
      } else if (chunkEndData.data !== undefined) {
        // Format from EventSource: { id, type, data, index }
        // Try to parse data as JSON
        let parsedData = null;
        try {
          parsedData = JSON.parse(chunkEndData.data);
        } catch (e) {
          parsedData = chunkEndData.data;
        }

        normalizedData = {
          event: {
            id: chunkEndData.id,
            type: chunkEndData.type,
            data: chunkEndData.data,
          },
          rawData: chunkEndData.data,
          parsedData: parsedData,
          index: chunkEndData.index,
        };
      } else {
        // Unknown format, use as-is
        normalizedData = chunkEndData;
      }

      // Prepare data structure for download - only Chunk End data
      const dataToDownload = {
        metadata: {
          url: urlString,
          timestamp: new Date().toISOString(),
          source: "Chunk End",
          routeInfo: routeInfo,
          eventIndex: normalizedData.index,
        },
        chunkEnd: normalizedData,
      };

      // Download JSON code commented out - data is inserted into collection via API instead
      // console.log('[Content Script] 📥 Downloading Chunk End as JSON...');
      // console.log('[Content Script] Filename:', filename);
      //
      // // Download using background script
      // chrome.runtime.sendMessage({
      //   action: 'downloadJSON',
      //   data: dataToDownload,
      //   filename: filename,
      //   saveAs: false // Auto-save without dialog
      // }, (response) => {
      //   if (response && response.success) {
      //     console.log('[Content Script] ✅✅✅ Chunk End downloaded successfully!');
      //     console.log('[Content Script] Filename:', filename);
      //   } else {
      //     console.error('[Content Script] ❌ Failed to download Chunk End data:', response?.error || 'Unknown error');
      //   }
      // });

      // Store in database collection via API
      chrome.runtime.sendMessage(
        {
          action: "storeApiResponseInDb",
          requestUrl: urlString,
          responseData: dataToDownload,
          metadata: dataToDownload.metadata,
        },
        (response) => {
          if (response && response.success) {
            console.log(
              "[Content Script] 🗄️ Chunk End response stored in DB successfully",
            );
          } else if (response?.skipped) {
            console.log(
              "[Content Script] ℹ️ Insert API skipped:",
              response.reason,
            );
          } else if (response && response.error) {
            console.warn(
              "[Content Script] ⚠️ Failed to store response in DB:",
              response.error,
            );
          }
        },
      );
    } catch (error) {
      console.error(
        "[Content Script] ❌ Error downloading Chunk End data:",
        error,
      );
    }
  }

  /**
   * Process and log event stream data (specifically looking for chunk 2 and chunk End)
   * Downloads Chunk End as JSON when found
   */
  function processEventStreamData(urlString, streamData, additionalInfo = {}) {
    console.log("[Content Script] ===== Processing event stream data =====");
    console.log("[Content Script] URL:", urlString);
    console.log("[Content Script] Data length:", streamData.length);
    console.log(
      "[Content Script] First 200 chars of data:",
      streamData.substring(0, 200),
    );

    if (!streamData || streamData.length === 0) {
      console.error("[Content Script] ❌ ERROR: Empty stream data!");
      return;
    }

    // Parse event stream
    const events = parseEventStream(streamData);

    console.log("[Content Script] Parsed event stream events:", events.length);

    // Extract all data from events (including compressed data)
    const extractedData = {
      url: urlString,
      timestamp: new Date().toISOString(),
      events: events,
      eventCount: events.length,
      rawStream: streamData,
      ...additionalInfo,
    };

    // Log event details
    events.forEach((event, index) => {
      console.log(`[Content Script] Event ${index + 1}:`, {
        id: event.id,
        type: event.type,
        dataLength: event.data?.length || 0,
        isCompressed: event.data?.startsWith("H4sI") || false,
        dataPreview: event.data?.substring(0, 100) || "N/A",
      });
    });

    // Store in network requests
    storeNetworkRequest({
      url: urlString,
      type: "EventStream",
      method: additionalInfo.method || "GET",
      status: additionalInfo.status || 200,
      responseSize: streamData.length,
      events: events,
      eventCount: events.length,
    });

    // Look for chunk 2 and chunk End specifically
    let chunk2Found = false;
    let chunkEndFound = false;
    let chunk2Data = null;
    let chunkEndData = null;

    // Check each event for chunk 2 and chunk End
    events.forEach((event, index) => {
      const eventId = event.id || "";
      const eventType = event.type || "";
      const eventData = event.data || "";

      // Check for chunk 2 - look for id: 2, event: 2, or index 1 (second event, 0-indexed)
      if (
        eventId === "2" ||
        eventId.includes("2") ||
        eventType === "2" ||
        index === 1
      ) {
        console.log("[Content Script] ✅✅✅ CHUNK 2 FOUND ✅✅✅");
        console.log("[Content Script] Chunk 2 Event Index:", index + 1);
        console.log("[Content Script] Chunk 2 Event ID:", eventId);
        console.log("[Content Script] Chunk 2 Event Type:", eventType);
        console.log("[Content Script] Chunk 2 Full Data:", eventData);
        if (event.parsedData) {
          console.log(
            "[Content Script] Chunk 2 Parsed Data:",
            event.parsedData,
          );
        }
        chunk2Found = true;
        chunk2Data = {
          event: event,
          rawData: eventData,
          parsedData: event.parsedData,
          index: index + 1,
        };

        // Chunk 2 download disabled - only downloading Chunk End
        // downloadChunk2AsJSON(chunk2Data, urlString);
      }

      // Check for chunk End - look for id: end, event: end, or last event
      if (
        eventId.toLowerCase().includes("end") ||
        eventType.toLowerCase().includes("end") ||
        eventData.toLowerCase().includes("chunkend") ||
        index === events.length - 1
      ) {
        console.log("[Content Script] ✅✅✅ CHUNK END FOUND ✅✅✅");
        console.log("[Content Script] Chunk End Event Index:", index + 1);
        console.log("[Content Script] Chunk End Event ID:", eventId);
        console.log("[Content Script] Chunk End Event Type:", eventType);
        console.log("[Content Script] Chunk End Full Data:", eventData);
        if (event.parsedData) {
          console.log(
            "[Content Script] Chunk End Parsed Data:",
            event.parsedData,
          );
        }
        chunkEndFound = true;
        chunkEndData = {
          event: event,
          rawData: eventData,
          parsedData: event.parsedData,
          index: index + 1,
        };

        // Download Chunk End as JSON
        downloadChunkEndAsJSON(chunkEndData, urlString);
      }
    });

    // Summary
    console.log("[Content Script] ===== Event Stream Summary =====");
    console.log("[Content Script] Total Events:", events.length);
    console.log(
      "[Content Script] Chunk 2 Found:",
      chunk2Found ? "YES ✅" : "NO ❌",
    );
    console.log(
      "[Content Script] Chunk End Found:",
      chunkEndFound ? "YES ✅" : "NO ❌",
    );

    // Log chunk 2 and chunk End data separately for easy access
    if (chunk2Data) {
      console.log("[Content Script] ===== CHUNK 2 DATA OBJECT =====");
      console.log("[Content Script] Chunk 2:", chunk2Data);
    }

    if (chunkEndData) {
      console.log("[Content Script] ===== CHUNK END DATA OBJECT =====");
      console.log("[Content Script] Chunk End:", chunkEndData);
    }

    // Log complete event stream object
    const allEventsData = {
      url: urlString,
      timestamp: new Date().toISOString(),
      totalEvents: events.length,
      chunk2Found: chunk2Found,
      chunkEndFound: chunkEndFound,
      chunk2: chunk2Data,
      chunkEnd: chunkEndData,
      events: events.map((e, idx) => ({
        index: idx + 1,
        type: e.type || "message",
        id: e.id || "",
        data: e.data || "",
        parsedData: e.parsedData || null,
        isChunk2: idx === 1 || e.id === "2" || e.id?.includes("2"),
        isChunkEnd:
          idx === events.length - 1 || e.id?.toLowerCase().includes("end"),
      })),
      rawStream: streamData,
    };

    console.log("[Content Script] ===== Complete Event Stream Object =====");
    console.log("[Content Script] All Events Data:", allEventsData);

    // Update stored network request with chunk data
    const storedRequest = networkRequests.find((req) => req.url === urlString);
    if (storedRequest) {
      storedRequest.chunk2 = chunk2Data;
      storedRequest.chunkEnd = chunkEndData;
      storedRequest.chunk2Found = chunk2Found;
      storedRequest.chunkEndFound = chunkEndFound;
    }
  }

  /**
   * Intercept fetch requests to capture /search-stream-dt API
   * This must run early to catch all fetch requests
   */
  (function () {
    // Check if fetch is already overridden (avoid double override)
    if (window.__fetchIntercepted) {
      console.log("[Content Script] Fetch already intercepted");
      return;
    }

    // Store original fetch
    const originalFetch = window.fetch;
    window.__fetchIntercepted = true;

    // Override fetch
    window.fetch = async function (...args) {
      const url = args[0];
      const urlString =
        typeof url === "string"
          ? url
          : url instanceof Request
            ? url.url
            : url.toString();
      const options = args[1] || {};
      const method = options.method || "GET";

      // Store all fetch requests - capture headers properly
      let requestHeaders = {};
      if (options.headers) {
        try {
          if (options.headers instanceof Headers) {
            options.headers.forEach((value, key) => {
              requestHeaders[key] = value;
            });
          } else if (typeof options.headers === "object") {
            requestHeaders = { ...options.headers };
          }
        } catch (e) {
          console.warn(
            "[Content Script] Could not process request headers:",
            e,
          );
        }
      }

      const requestInfo = {
        url: urlString,
        method: method,
        headers: requestHeaders, // Keep for backward compatibility
        requestHeaders: requestHeaders, // Store separately for easy access
        body: options.body || null,
        timestamp: new Date().toISOString(),
      };

      // Log ALL fetch requests
      console.log("[Content Script] 🔍 Fetch request:", method, urlString);

      // Load config to check API names
      loadConfig()
        .then((cfg) => {
          const isSearchStreamAPI =
            urlString.includes(cfg.api_names.searchStreamAPI) ||
            urlString.includes(cfg.api_names.searchStreamAPIFull);
          const isAPI =
            urlString.includes(cfg.api_names.apiPath) ||
            urlString.includes(
              cfg.domain.replace("https://", "").replace("http://", "") +
                cfg.api_names.apiPath,
            );

          // Store for use in async context
          window.__isSearchStreamAPI = isSearchStreamAPI;
          window.__isAPI = isAPI;
        })
        .catch(() => {
          // Fallback if config fails
          window.__isSearchStreamAPI =
            urlString.includes("/search-stream-dt") ||
            urlString.includes("search-stream-dt");
          window.__isAPI =
            urlString.includes("/api/") ||
            urlString.includes("makemytrip.com/api");
        });

      // Use cached values or fallback
      const isSearchStreamAPI =
        window.__isSearchStreamAPI !== undefined
          ? window.__isSearchStreamAPI
          : urlString.includes("/search-stream-dt") ||
            urlString.includes("search-stream-dt");
      const isAPI =
        window.__isAPI !== undefined
          ? window.__isAPI
          : urlString.includes("/api/") ||
            urlString.includes("makemytrip.com/api");

      if (isSearchStreamAPI) {
        console.log(
          "[Content Script] ✅✅✅ INTERCEPTED /search-stream-dt API REQUEST:",
          urlString,
        );

        // Add random user agent for flight API calls
        const randomUA = getRandomUserAgent();

        // Modify options to include random user agent
        const modifiedOptions = { ...options };
        if (!modifiedOptions.headers) {
          modifiedOptions.headers = {};
        }

        // Handle Headers object
        if (modifiedOptions.headers instanceof Headers) {
          modifiedOptions.headers.set("User-Agent", randomUA);
          // Also update requestHeaders for logging
          requestHeaders["User-Agent"] = randomUA;
          requestHeaders["user-agent"] = randomUA;
        } else if (typeof modifiedOptions.headers === "object") {
          modifiedOptions.headers["User-Agent"] = randomUA;
          modifiedOptions.headers["user-agent"] = randomUA;
          // Also update requestHeaders for logging
          requestHeaders["User-Agent"] = randomUA;
          requestHeaders["user-agent"] = randomUA;
        }

        // Update args with modified options
        args[1] = modifiedOptions;

        console.log(
          "[Content Script] 🎲 Applied random user agent to fetch request",
        );
      }

      // Call original fetch - if it fails, let it fail naturally
      let response;
      try {
        response = await originalFetch.apply(this, args);
      } catch (fetchError) {
        // If the original fetch fails (network error, CORS, etc.), log and re-throw
        // This is expected for some requests (CORS, network issues, etc.)
        if (isSearchStreamAPI) {
          console.error(
            "[Content Script] ⚠️ /search-stream-dt fetch failed:",
            fetchError.message,
          );
        }
        storeNetworkRequest({
          ...requestInfo,
          error: fetchError.message,
          status: 0,
        });
        throw fetchError; // Re-throw so caller knows fetch failed
      }

      // Only process if response exists and is successful
      if (!response) {
        console.warn("[Content Script] No response object");
        return response;
      }

      if (!response.ok && isSearchStreamAPI) {
        console.warn(
          "[Content Script] /search-stream-dt response not OK:",
          response.status,
          response.statusText,
        );
        // Still try to read the body even if status is not OK (might have error data)
      }

      // Store request with response info
      const responseInfo = {
        ...requestInfo,
        status: response.status,
        statusText: response.statusText,
        requestHeaders: options.headers || {}, // Store original request headers
        responseHeaders: {}, // Store response headers
        responseType: response.type,
        ok: response.ok,
      };

      // Extract response headers safely
      if (response.headers) {
        try {
          response.headers.forEach((value, key) => {
            responseInfo.responseHeaders[key] = value;
          });
        } catch (e) {
          console.warn("[Content Script] Could not read response headers:", e);
        }
      }

      // Also store request headers in a more accessible format (use the already processed requestHeaders)
      // The requestHeaders were already processed in requestInfo, so use those
      responseInfo.requestHeaders = requestInfo.requestHeaders || {};

      if (isSearchStreamAPI) {
        console.log(
          "[Content Script] Request headers captured:",
          Object.keys(responseInfo.requestHeaders),
        );
        console.log(
          "[Content Script] Response headers captured:",
          Object.keys(responseInfo.responseHeaders),
        );
        // Log important headers
        if (responseInfo.requestHeaders.mcid) {
          console.log(
            "[Content Script] ✅ mcid header captured:",
            responseInfo.requestHeaders.mcid,
          );
        } else {
          console.warn(
            "[Content Script] ⚠️ mcid header NOT found in request headers",
          );
        }
      }

      if (isSearchStreamAPI) {
        console.log(
          "[Content Script] ✅✅✅ INTERCEPTED /search-stream-dt API RESPONSE:",
          urlString,
        );
        console.log(
          "[Content Script] Method:",
          method,
          "Status:",
          response.status,
          "OK:",
          response.ok,
        );
        console.log("[Content Script] Response has body:", !!response.body);
        console.log("[Content Script] Response type:", response.type);
        console.log(
          "[Content Script] Response headers:",
          Object.keys(responseInfo.headers),
        );
      }

      // Only process /search-stream-dt API - read stream asynchronously
      if (isSearchStreamAPI) {
        if (!response.body) {
          console.warn(
            "[Content Script] ⚠️ /search-stream-dt response has no body",
          );
          return response;
        }

        console.log(
          "[Content Script] Processing /search-stream-dt response body...",
        );

        // Check if response body is a ReadableStream
        if (!response.body || typeof response.body.getReader !== "function") {
          console.warn(
            "[Content Script] Response body is not a ReadableStream, type:",
            typeof response.body,
          );
          // Try to get as text as fallback
          (async () => {
            try {
              const text = await response.text();
              if (text) {
                console.log(
                  "[Content Script] Got response as text, length:",
                  text.length,
                );
                responseInfo.responseData = text;
                responseInfo.responseSize = text.length;
                responseInfo.type = "EventStream";
                storeNetworkRequest(responseInfo);
                processEventStreamData(urlString, text, {
                  method: method,
                  status: response.status,
                  headers: responseInfo.headers,
                });
              }
            } catch (e) {
              console.error(
                "[Content Script] Could not get response as text:",
                e,
              );
            }
          })();
          return response;
        }

        // Clone response ONLY if we can (some responses can't be cloned)
        let clonedResponse;
        try {
          clonedResponse = response.clone();
          console.log("[Content Script] Response cloned successfully");
        } catch (cloneError) {
          console.warn(
            "[Content Script] Could not clone response:",
            cloneError.message,
          );
          // If clone fails, try to read original (but this will consume it)
          // Only do this if it's the search-stream-dt API
          console.warn(
            "[Content Script] Cannot read without consuming original response",
          );
          return response;
        }

        // Read the stream asynchronously without blocking the original response
        (async () => {
          try {
            console.log("[Content Script] Starting to read stream...");
            const reader = clonedResponse.body.getReader();
            const decoder = new TextDecoder();
            let responseData = "";
            let result;
            let chunkCount = 0;

            // Read all chunks from the stream
            while (!(result = await reader.read()).done) {
              chunkCount++;
              const chunk = result.value;
              const decodedChunk = decoder.decode(chunk, { stream: true });
              responseData += decodedChunk;

              // Log chunks as they arrive (limit logging to avoid spam)
              if (chunkCount <= 5 || chunkCount % 10 === 0) {
                console.log(
                  "[Content Script] 📡 Received chunk",
                  chunkCount,
                  ":",
                  decodedChunk.substring(0, 100),
                );
              }
            }

            console.log(
              "[Content Script] ✅ Event stream finished. Total chunks:",
              chunkCount,
              "Total length:",
              responseData.length,
            );

            // Store the response data in networkRequests for later retrieval
            responseInfo.responseData = responseData;
            responseInfo.responseSize = responseData.length;
            responseInfo.type = "EventStream";
            // Store headers separately for easy access
            responseInfo.headers = responseInfo.responseHeaders; // Keep for backward compatibility
            storeNetworkRequest(responseInfo);
            console.log(
              "[Content Script] ✅ Response data stored in networkRequests",
            );

            if (responseData && responseData.length > 0) {
              // Process and log the event stream data
              console.log(
                "[Content Script] Processing event stream data for logging...",
              );
              processEventStreamData(urlString, responseData, {
                method: method,
                status: response.status,
                headers: responseInfo.responseHeaders,
                requestHeaders: responseInfo.requestHeaders,
              });
            } else {
              console.warn(
                "[Content Script] Empty response data after reading stream",
              );
            }
          } catch (streamError) {
            console.error(
              "[Content Script] ❌ Error reading stream:",
              streamError,
            );
            console.error(
              "[Content Script] Stream error details:",
              streamError.message,
              streamError.stack,
            );
          }
        })();
      } else if (isAPI && response.body) {
        // For other APIs, try to read but don't block
        let clonedResponse;
        try {
          clonedResponse = response.clone();
        } catch (e) {
          // Can't clone, skip reading
          return response;
        }

        (async () => {
          try {
            if (
              !clonedResponse.body ||
              typeof clonedResponse.body.getReader !== "function"
            ) {
              return;
            }

            const reader = clonedResponse.body.getReader();
            const decoder = new TextDecoder();
            let responseData = "";
            let result;

            while (!(result = await reader.read()).done) {
              const chunk = result.value;
              responseData += decoder.decode(chunk, { stream: true });
            }

            responseInfo.responseSize = responseData.length;
            responseInfo.responseData = responseData;
            storeNetworkRequest(responseInfo);
            console.log(
              "[Content Script] 📦 Stored API response:",
              urlString,
              response.status,
            );
          } catch (e) {
            console.warn("[Content Script] Could not read API response:", e);
          }
        })();
      } else {
        // Store non-API requests too (optional - can be filtered)
        // Check domain from config
        loadConfig()
          .then((cfg) => {
            const domainCheck = cfg.domain
              .replace("https://", "")
              .replace("http://", "");
            if (urlString.includes(domainCheck)) {
              storeNetworkRequest(responseInfo);
            }
          })
          .catch(() => {
            // Fallback
            if (urlString.includes("makemytrip.com")) {
              storeNetworkRequest(responseInfo);
            }
          });
      }

      // Return original response immediately
      return response;
    };

    // Also intercept XMLHttpRequest in case the API uses that
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    // Store method and URL in open
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._method = method;
      this._url = url;
      console.log("[Content Script] 🔍 XMLHttpRequest.open:", method, url);
      return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      const url = this._url;
      // Load config for API checks
      loadConfig()
        .then((cfg) => {
          window.__xhrIsAPI =
            url &&
            (url.includes(cfg.api_names.apiPath) ||
              url.includes(
                cfg.domain.replace("https://", "").replace("http://", "") +
                  cfg.api_names.apiPath,
              ));
          window.__xhrIsSearchStreamAPI =
            url &&
            (url.includes(cfg.api_names.searchStreamAPI) ||
              url.includes(cfg.api_names.searchStreamAPIFull));
        })
        .catch(() => {
          window.__xhrIsAPI =
            url &&
            (url.includes("/api/") || url.includes("makemytrip.com/api"));
          window.__xhrIsSearchStreamAPI =
            url &&
            (url.includes("search-stream-dt") ||
              url.includes("flights-cb.makemytrip.com"));
        });

      const isAPI =
        window.__xhrIsAPI !== undefined
          ? window.__xhrIsAPI
          : url &&
            (url.includes("/api/") || url.includes("makemytrip.com/api"));
      const isSearchStreamAPI =
        window.__xhrIsSearchStreamAPI !== undefined
          ? window.__xhrIsSearchStreamAPI
          : url &&
            (url.includes("search-stream-dt") ||
              url.includes("flights-cb.makemytrip.com"));

      if (isSearchStreamAPI) {
        console.log(
          "[Content Script] ✅✅✅ INTERCEPTED XMLHttpRequest to /search-stream-dt:",
          url,
        );

        // Add random user agent for flight API calls
        const randomUA = getRandomUserAgent();
        this.setRequestHeader("User-Agent", randomUA);
        console.log(
          "[Content Script] 🎲 Applied random user agent to XMLHttpRequest",
        );
      }

      // Store request info
      const requestInfo = {
        url: url,
        method: this._method || "GET",
        timestamp: new Date().toISOString(),
      };

      // Override onreadystatechange to capture the response
      const originalOnReadyStateChange = this.onreadystatechange;
      this.onreadystatechange = function () {
        if (this.readyState === 4) {
          const responseInfo = {
            ...requestInfo,
            status: this.status,
            statusText: this.statusText,
            responseSize: this.responseText?.length || 0,
            responseData: this.responseText || null,
            responseType: this.responseType,
          };

          // Extract response headers if available
          if (this.getAllResponseHeaders) {
            const headers = {};
            this.getAllResponseHeaders()
              .split("\r\n")
              .forEach((line) => {
                const parts = line.split(": ");
                if (parts.length === 2) {
                  headers[parts[0]] = parts[1];
                }
              });
            responseInfo.headers = headers;
          }

          if (isSearchStreamAPI && this.responseText) {
            console.log(
              "[Content Script] XMLHttpRequest completed, response length:",
              this.responseText.length,
            );
            processEventStreamData(url, this.responseText, {
              method: this._method || "GET",
              status: this.status,
              headers: responseInfo.headers || {},
            });
          } else if (isAPI) {
            storeNetworkRequest(responseInfo);
            console.log(
              "[Content Script] 📦 Stored XHR API response:",
              url,
              this.status,
            );
          }
        }

        // Call original handler if it exists
        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.apply(this, arguments);
        }
      };

      // Also check addEventListener
      const originalAddEventListener = this.addEventListener;
      this.addEventListener = function (type, listener, ...rest) {
        if (type === "load" || type === "loadend") {
          const wrappedListener = function (event) {
            if (this.readyState === 4 && this.responseText) {
              if (isSearchStreamAPI) {
                console.log(
                  "[Content Script] XMLHttpRequest event listener triggered",
                );
                processEventStreamData(url, this.responseText, {
                  method: this._method || "GET",
                  status: this.status,
                });
              } else if (isAPI) {
                storeNetworkRequest({
                  url: url,
                  method: this._method || "GET",
                  status: this.status,
                  responseData: this.responseText,
                  responseSize: this.responseText.length,
                });
              }
            }
            return listener.apply(this, arguments);
          };
          return originalAddEventListener.apply(this, [
            type,
            wrappedListener,
            ...rest,
          ]);
        }
        return originalAddEventListener.apply(this, [type, listener, ...rest]);
      };

      return originalXHRSend.apply(this, args);
    };

    // Also intercept EventSource API (used for Server-Sent Events)
    if (window.EventSource) {
      const OriginalEventSource = window.EventSource;
      window.EventSource = function (url, eventSourceInitDict) {
        console.log("[Content Script] EventSource created for:", url);

        // Check if this is the search-stream-dt API (use cached config or fallback)
        const isSearchStreamAPI =
          (config &&
            (url.includes(config.api_names.searchStreamAPI) ||
              url.includes(config.api_names.searchStreamAPIFull))) ||
          url.includes("/search-stream-dt") ||
          url.includes("flights-cb.makemytrip.com/api/search-stream-dt");

        if (isSearchStreamAPI) {
          console.log(
            "[Content Script] ✅ Intercepted EventSource to /search-stream-dt:",
            url,
          );

          const eventSource = new OriginalEventSource(url, eventSourceInitDict);
          let allData = "";

          // Collect all event data
          eventSource.onmessage = function (event) {
            console.log("[Content Script] EventSource message received");
            if (event.data) {
              allData += "data: " + event.data + "\n\n";
            }
          };

          eventSource.addEventListener("message", function (event) {
            if (event.data) {
              allData += "data: " + event.data + "\n\n";
            }
          });

          // When connection closes, process the data
          eventSource.addEventListener("error", function (event) {
            if (eventSource.readyState === EventSource.CLOSED) {
              console.log(
                "[Content Script] EventSource closed, processing data",
              );
              if (allData) {
                processEventStreamData(url, allData);
              }
            }
          });

          // Also process on close
          const originalClose = eventSource.close.bind(eventSource);
          eventSource.close = function () {
            console.log("[Content Script] EventSource manually closed");
            if (allData) {
              processEventStreamData(url, allData);
            }
            return originalClose();
          };

          return eventSource;
        }

        return new OriginalEventSource(url, eventSourceInitDict);
      };

      // Copy static properties
      Object.setPrototypeOf(window.EventSource, OriginalEventSource);
      Object.setPrototypeOf(
        window.EventSource.prototype,
        OriginalEventSource.prototype,
      );
    }

    console.log(
      "[Content Script] Fetch, XMLHttpRequest, and EventSource interceptors installed",
    );

    // Performance API monitoring - just for detection, not for fetching
    // We already capture data via fetch interceptor, so we don't need to fetch again
    if (window.performance && window.performance.getEntriesByType) {
      const checkNetworkRequests = () => {
        const entries = performance.getEntriesByType("resource");
        entries.forEach((entry) => {
          loadConfig()
            .then((cfg) => {
              const isSearchStreamAPI =
                entry.name.includes(cfg.api_names.searchStreamAPI) ||
                entry.name.includes(cfg.api_names.searchStreamAPIFull);
              if (isSearchStreamAPI) {
                console.log(
                  "[Content Script] 🔍 Performance API detected request:",
                  entry.name,
                  "Status:",
                  entry.responseStatus,
                );
                // Don't try to fetch - data should already be captured by fetch interceptor
                // Just log for reference
              }
            })
            .catch(() => {
              if (
                entry.name.includes("search-stream-dt") ||
                entry.name.includes("flights-cb.makemytrip.com")
              ) {
                console.log(
                  "[Content Script] 🔍 Performance API detected request:",
                  entry.name,
                  "Status:",
                  entry.responseStatus,
                );
              }
            });
        });
      };

      // Check immediately
      setTimeout(checkNetworkRequests, 1000);

      // Also monitor for new requests (just for logging)
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          loadConfig()
            .then((cfg) => {
              const isSearchStreamAPI =
                entry.name &&
                (entry.name.includes(cfg.api_names.searchStreamAPI) ||
                  entry.name.includes(cfg.api_names.searchStreamAPIFull));
              if (isSearchStreamAPI) {
                console.log(
                  "[Content Script] 🔍 Performance Observer detected:",
                  entry.name,
                );
                // Data should already be captured by fetch interceptor
              }
            })
            .catch(() => {
              if (
                entry.name &&
                (entry.name.includes("search-stream-dt") ||
                  entry.name.includes("flights-cb.makemytrip.com"))
              ) {
                console.log(
                  "[Content Script] 🔍 Performance Observer detected:",
                  entry.name,
                );
              }
            });
        });
      });

      try {
        observer.observe({ entryTypes: ["resource"] });
        console.log(
          "[Content Script] Performance Observer installed (detection only)",
        );
      } catch (e) {
        console.warn("[Content Script] Performance Observer not supported:", e);
      }
    }
  })();

  /**
   * Listen for messages from popup/background
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "generateAndOpenURL") {
      const { source, dest, date, tripType } = request;

      try {
        generateMakeMyTripURL(source, dest, new Date(date), tripType)
          .then((url) => {
            // Open in new tab
            chrome.runtime.sendMessage(
              {
                action: "openTab",
                url: url,
              },
              (response) => {
                if (response && response.success) {
                  sendResponse({
                    success: true,
                    url: url,
                    tabId: response.tabId,
                  });
                } else {
                  sendResponse({ success: false, error: "Failed to open tab" });
                }
              },
            );
          })
          .catch((error) => {
            sendResponse({ success: false, error: error.message });
          });

        return true; // Keep channel open for async response
      } catch (error) {
        sendResponse({ success: false, error: error.message });
        return true;
      }
    } else if (request.action === "extractEventStream") {
      // This is for the existing functionality - keeping it for compatibility
      sendResponse({ success: true, message: "Event stream extraction ready" });
      return true;
    } else if (request.action === "checkForAPI") {
      // Manual trigger to check for API calls
      console.log("[Content Script] Manual check for API triggered");

      // Load config and check Performance API
      loadConfig()
        .then((cfg) => {
          if (window.performance && window.performance.getEntriesByType) {
            const entries = performance.getEntriesByType("resource");
            const apiEntries = entries.filter(
              (e) =>
                e.name &&
                (e.name.includes(cfg.api_names.searchStreamAPI) ||
                  e.name.includes(cfg.api_names.searchStreamAPIFull)),
            );

            if (apiEntries.length > 0) {
              console.log(
                "[Content Script] Found",
                apiEntries.length,
                "API entries in Performance API",
              );
              apiEntries.forEach((entry) => {
                console.log(
                  "[Content Script] API Entry:",
                  entry.name,
                  "Status:",
                  entry.responseStatus,
                );
              });
              sendResponse({
                success: true,
                found: true,
                entries: apiEntries.length,
              });
            } else {
              console.log(
                "[Content Script] No API entries found in Performance API",
              );
              sendResponse({ success: true, found: false });
            }
          } else {
            sendResponse({
              success: false,
              error: "Performance API not available",
            });
          }
        })
        .catch(() => {
          // Fallback
          if (window.performance && window.performance.getEntriesByType) {
            const entries = performance.getEntriesByType("resource");
            const apiEntries = entries.filter(
              (e) =>
                e.name &&
                (e.name.includes("search-stream-dt") ||
                  e.name.includes("flights-cb.makemytrip.com")),
            );
            if (apiEntries.length > 0) {
              sendResponse({
                success: true,
                found: true,
                entries: apiEntries.length,
              });
            } else {
              sendResponse({ success: true, found: false });
            }
          } else {
            sendResponse({
              success: false,
              error: "Performance API not available",
            });
          }
        });
      return true;
    } else if (request.action === "getAllNetworkData") {
      // Return all captured network data
      console.log(
        "[Content Script] Returning all network data, count:",
        networkRequests.length,
      );
      sendResponse({
        success: true,
        networkRequests: networkRequests,
        count: networkRequests.length,
        timestamp: new Date().toISOString(),
      });
      return true;
      // Download JSON code commented out - data is inserted into collection via API instead
      // } else if (request.action === 'downloadAllNetworkData') {
      //   // Download all network data
      //   console.log('[Content Script] Downloading all network data, count:', networkRequests.length);
      //
      //   const allData = {
      //     metadata: {
      //       timestamp: new Date().toISOString(),
      //       totalRequests: networkRequests.length,
      //       source: 'Network Tab Monitor'
      //     },
      //     requests: networkRequests
      //   };
      //
      //   chrome.runtime.sendMessage({
      //     action: 'downloadJSON',
      //     data: allData,
      //     filename: `network-data-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      //     saveAs: false
      //   }, (response) => {
      //     if (response && response.success) {
      //       console.log('[Content Script] ✅ All network data downloaded');
      //       sendResponse({ success: true, filename: response.filename });
      //     } else {
      //       sendResponse({ success: false, error: 'Download failed' });
      //     }
      //   });
      //   return true;
    } else if (request.action === "clearNetworkData") {
      // Clear stored network data
      networkRequests.length = 0;
      console.log("[Content Script] Network data cleared");
      sendResponse({ success: true });
      return true;
    } else if (request.action === "searchAndDownloadStreamAPI") {
      // Specifically search for /search-stream-dt API and download
      console.log("[Content Script] Searching for /search-stream-dt API...");
      console.log(
        "[Content Script] Total network requests stored:",
        networkRequests.length,
      );

      // Wait a bit for async stream reading to complete, then check
      (async () => {
        // Load config first
        const cfg = await loadConfig();

        // Wait up to 1 second for stream data to be available
        let attempts = 0;
        const maxAttempts = 10; // 10 attempts * 100ms = 1 second

        while (attempts < maxAttempts) {
          // Check stored network requests
          const streamAPIs = networkRequests.filter(
            (req) =>
              req.url &&
              (req.url.includes(cfg.api_names.searchStreamAPI) ||
                req.url.includes(cfg.api_names.searchStreamAPIFull)),
          );

          // Check if any have response data
          const streamAPIsWithData = streamAPIs.filter(
            (req) => req.responseData || req.rawStream || req.events,
          );

          if (streamAPIsWithData.length > 0 || attempts >= maxAttempts - 1) {
            console.log(
              "[Content Script] Found",
              streamAPIs.length,
              "/search-stream-dt API calls after",
              attempts * 100,
              "ms",
            );
            console.log(
              "[Content Script] API calls with data:",
              streamAPIsWithData.length,
            );

            let downloadCount = 0;
            let skippedCount = 0;

            // Download each one that has data
            streamAPIs.forEach((apiCall, index) => {
              console.log(
                `[Content Script] Processing API call ${index + 1}:`,
                {
                  url: apiCall.url,
                  hasResponseData: !!apiCall.responseData,
                  hasRawStream: !!apiCall.rawStream,
                  hasEvents: !!apiCall.events,
                  responseSize:
                    apiCall.responseData?.length ||
                    apiCall.rawStream?.length ||
                    0,
                },
              );

              if (apiCall.responseData || apiCall.rawStream || apiCall.events) {
                const data =
                  apiCall.responseData ||
                  apiCall.rawStream ||
                  JSON.stringify(apiCall.events || []);

                if (data && data.length > 0) {
                  console.log(
                    `[Content Script] Downloading API call ${index + 1}, data length:`,
                    data.length,
                  );

                  // Process with a small delay to avoid overwhelming
                  setTimeout(() => {
                    processEventStreamData(apiCall.url, data, {
                      method: apiCall.method || "GET",
                      status: apiCall.status || 200,
                      headers: apiCall.headers || {},
                    });
                  }, index * 100);

                  downloadCount++;
                } else {
                  console.warn(
                    `[Content Script] Skipping API call ${index + 1} - empty data`,
                  );
                  skippedCount++;
                }
              } else {
                console.warn(
                  `[Content Script] Skipping API call ${index + 1} - no data available`,
                );
                skippedCount++;
              }
            });

            if (downloadCount > 0) {
              sendResponse({
                success: true,
                found: true,
                count: streamAPIs.length,
                downloadCount: downloadCount,
                skippedCount: skippedCount,
                message: `Found ${streamAPIs.length} /search-stream-dt API call(s). Downloading ${downloadCount}...`,
              });
            } else {
              // No data yet, continue to fallback logic below
              break;
            }
            return;
          }

          // Wait 100ms before next attempt
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
        }

        // Fallback: Check Performance API if no data found
        if (window.performance && window.performance.getEntriesByType) {
          const entries = performance.getEntriesByType("resource");
          const streamEntries = entries.filter(
            (e) =>
              e.name &&
              (e.name.includes(cfg.api_names.searchStreamAPI) ||
                e.name.includes(cfg.api_names.searchStreamAPIFull)),
          );

          if (streamEntries.length > 0) {
            console.log(
              "[Content Script] Found",
              streamEntries.length,
              "entries in Performance API",
            );
            console.log(
              "[Content Script] Note: Data should already be captured by fetch interceptor. Checking stored requests...",
            );

            // Check if we already have the data stored
            const storedAPIs = networkRequests.filter(
              (req) =>
                req.url &&
                (req.url.includes(cfg.api_names.searchStreamAPI) ||
                  req.url.includes(cfg.api_names.searchStreamAPIFull)),
            );

            if (storedAPIs.length > 0) {
              console.log(
                "[Content Script] Found",
                storedAPIs.length,
                "stored API calls with data",
              );
              // Process stored data
              storedAPIs.forEach((apiCall, index) => {
                if (
                  apiCall.responseData ||
                  apiCall.rawStream ||
                  apiCall.events
                ) {
                  const data =
                    apiCall.responseData ||
                    apiCall.rawStream ||
                    JSON.stringify(apiCall.events || []);
                  if (data && data.length > 0) {
                    setTimeout(() => {
                      processEventStreamData(apiCall.url, data, {
                        method: apiCall.method || "GET",
                        status: apiCall.status || 200,
                        headers: apiCall.headers || {},
                      });
                    }, index * 100);
                  }
                }
              });

              sendResponse({
                success: true,
                found: true,
                count: storedAPIs.length,
                message: `Found ${storedAPIs.length} /search-stream-dt API call(s) with stored data, downloading...`,
              });
            } else {
              // Try to fetch the data directly as a fallback
              console.log(
                "[Content Script] No stored data found, attempting to fetch directly from Performance API entries...",
              );

              // Find stored request to get headers
              const storedRequest = networkRequests.find(
                (req) =>
                  req.url &&
                  (req.url.includes(cfg.api_names.searchStreamAPI) ||
                    req.url.includes(cfg.api_names.searchStreamAPIFull)),
              );

              // Use async IIFE to handle await
              (async () => {
                try {
                  // Try EventSource API first (better for SSE streams)
                  const eventSourcePromises = streamEntries.map(
                    async (entry, index) => {
                      return new Promise((resolve, reject) => {
                        try {
                          // Get REAL-TIME current date and time at the moment of fetch
                          const currentTimestamp = Date.now();
                          const currentDateTime = new Date().toISOString();
                          let fetchUrl = entry.name;

                          // Update URL with real-time timestamp
                          const urlObj = new URL(fetchUrl);
                          urlObj.searchParams.set(
                            "apiCallTimestamp",
                            currentTimestamp.toString(),
                          );
                          urlObj.searchParams.set(
                            "fetchDateTime",
                            currentDateTime,
                          );
                          fetchUrl = urlObj.toString();

                          console.log(
                            `[Content Script] Attempting EventSource connection ${index + 1} with REAL-TIME timestamp:`,
                            fetchUrl,
                          );

                          // Use EventSource API to connect to the event stream
                          const eventSource = new EventSource(fetchUrl);
                          let allData = "";
                          let chunk2Data = null;
                          let chunkEndData = null;
                          let eventCount = 0;

                          eventSource.onopen = function (event) {
                            console.log(
                              `[Content Script] ✅ EventSource connection ${index + 1} opened`,
                            );
                          };

                          eventSource.onmessage = function (event) {
                            eventCount++;
                            const eventData = event.data || "";
                            const eventId = event.lastEventId || "";
                            const eventType = event.type || "message";

                            console.log(
                              `[Content Script] EventSource message ${eventCount} received:`,
                              {
                                id: eventId,
                                type: eventType,
                                dataLength: eventData.length,
                              },
                            );

                            // Format as SSE format
                            if (eventId) allData += `id: ${eventId}\n`;
                            if (eventType && eventType !== "message")
                              allData += `event: ${eventType}\n`;
                            allData += `data: ${eventData}\n\n`;

                            // Check for chunk 2
                            if (
                              eventId === "2" ||
                              eventId.includes("2") ||
                              eventType === "2" ||
                              eventCount === 2
                            ) {
                              console.log(
                                "[Content Script] ✅✅✅ CHUNK 2 FOUND via EventSource ✅✅✅",
                              );
                              chunk2Data = {
                                id: eventId,
                                type: eventType,
                                data: eventData,
                                index: eventCount,
                              };
                            }

                            // Check for chunk End
                            if (
                              eventId.toLowerCase().includes("end") ||
                              eventType.toLowerCase().includes("end")
                            ) {
                              console.log(
                                "[Content Script] ✅✅✅ CHUNK END FOUND via EventSource ✅✅✅",
                              );
                              chunkEndData = {
                                id: eventId,
                                type: eventType,
                                data: eventData,
                                index: eventCount,
                              };

                              // Don't download here - let processEventStreamData handle it to avoid duplicates
                            }
                          };

                          eventSource.addEventListener(
                            "message",
                            function (event) {
                              // Additional message handler
                              if (event.data) {
                                console.log(
                                  "[Content Script] EventSource addEventListener message:",
                                  event.data.substring(0, 100),
                                );
                              }
                            },
                          );

                          eventSource.onerror = function (event) {
                            console.warn(
                              `[Content Script] EventSource connection ${index + 1} error event:`,
                              {
                                type: event.type,
                                readyState: eventSource.readyState,
                                url: eventSource.url,
                                hasData: allData.length > 0,
                                eventCount: eventCount,
                              },
                            );

                            // Check readyState - CONNECTING=0, OPEN=1, CLOSED=2
                            if (eventSource.readyState === EventSource.CLOSED) {
                              console.log(
                                `[Content Script] EventSource connection ${index + 1} closed (readyState: CLOSED)`,
                              );

                              // If no data received, EventSource likely failed due to missing headers
                              // (EventSource doesn't support custom headers like cookies, mcid, etc.)
                              if (!allData || allData.length === 0) {
                                console.warn(
                                  `[Content Script] EventSource failed with no data - likely due to missing headers (EventSource doesn't support custom headers)`,
                                );
                                console.warn(
                                  `[Content Script] Falling back to fetch with proper headers...`,
                                );
                                // Reject to trigger fetch fallback
                                eventSource.close();
                                reject(
                                  new Error(
                                    "EventSource failed - no data received, likely missing headers",
                                  ),
                                );
                                return;
                              }

                              // Process data even if there was an error, as long as we have data
                              // Log the complete response
                              console.log(
                                `[Content Script] ===== EventSource Response ${index + 1} =====`,
                              );
                              console.log(
                                `[Content Script] Total events received:`,
                                eventCount,
                              );
                              console.log(
                                `[Content Script] Total data length:`,
                                allData.length,
                              );
                              console.log(
                                `[Content Script] Chunk 2 found:`,
                                chunk2Data ? "YES ✅" : "NO ❌",
                              );
                              console.log(
                                `[Content Script] Chunk End found:`,
                                chunkEndData ? "YES ✅" : "NO ❌",
                              );
                              console.log(
                                `[Content Script] Complete response data:`,
                                allData,
                              );

                              if (chunk2Data) {
                                console.log(
                                  `[Content Script] ===== Chunk 2 Data =====`,
                                );
                                console.log(
                                  `[Content Script] Chunk 2:`,
                                  chunk2Data,
                                );
                              }

                              if (chunkEndData) {
                                console.log(
                                  `[Content Script] ===== Chunk End Data =====`,
                                );
                                console.log(
                                  `[Content Script] Chunk End:`,
                                  chunkEndData,
                                );
                              }

                              processEventStreamData(fetchUrl, allData, {
                                method: "GET",
                                status: 200,
                                chunk2: chunk2Data,
                                chunkEnd: chunkEndData,
                                eventCount: eventCount,
                                source: "EventSource",
                              });

                              resolve({
                                success: true,
                                data: allData,
                                eventCount: eventCount,
                                chunk2: chunk2Data,
                                chunkEnd: chunkEndData,
                              });
                            } else if (
                              eventSource.readyState === EventSource.CONNECTING
                            ) {
                              console.log(
                                `[Content Script] EventSource connection ${index + 1} is still connecting, waiting...`,
                              );
                              // Don't reject yet, wait for connection to establish or close
                            } else if (
                              eventSource.readyState === EventSource.OPEN
                            ) {
                              console.log(
                                `[Content Script] EventSource connection ${index + 1} is open, error might be temporary`,
                              );
                              // Connection is open, error might be temporary, continue waiting
                            }
                          };

                          // Also listen for close event explicitly
                          eventSource.addEventListener("close", function () {
                            console.log(
                              `[Content Script] EventSource connection ${index + 1} close event received`,
                            );
                            if (allData && allData.length > 0) {
                              console.log(
                                `[Content Script] Processing data from close event`,
                              );
                              processEventStreamData(fetchUrl, allData, {
                                method: "GET",
                                status: 200,
                                chunk2: chunk2Data,
                                chunkEnd: chunkEndData,
                                eventCount: eventCount,
                                source: "EventSource",
                              });
                              resolve({
                                success: true,
                                data: allData,
                                eventCount: eventCount,
                                chunk2: chunk2Data,
                                chunkEnd: chunkEndData,
                              });
                            }
                          });

                          // Set timeout to close connection after reasonable time
                          setTimeout(() => {
                            if (eventSource.readyState !== EventSource.CLOSED) {
                              console.log(
                                `[Content Script] Closing EventSource connection ${index + 1} after timeout`,
                              );
                              eventSource.close();

                              // Wait a bit for any final data
                              setTimeout(() => {
                                // Log the complete response
                                console.log(
                                  `[Content Script] ===== EventSource Response ${index + 1} (Timeout) =====`,
                                );
                                console.log(
                                  `[Content Script] Total events received:`,
                                  eventCount,
                                );
                                console.log(
                                  `[Content Script] Total data length:`,
                                  allData.length,
                                );
                                console.log(
                                  `[Content Script] Chunk 2 found:`,
                                  chunk2Data ? "YES ✅" : "NO ❌",
                                );
                                console.log(
                                  `[Content Script] Chunk End found:`,
                                  chunkEndData ? "YES ✅" : "NO ❌",
                                );
                                console.log(
                                  `[Content Script] Complete response data:`,
                                  allData,
                                );

                                if (chunk2Data) {
                                  console.log(
                                    `[Content Script] ===== Chunk 2 Data =====`,
                                  );
                                  console.log(
                                    `[Content Script] Chunk 2:`,
                                    chunk2Data,
                                  );
                                }

                                if (chunkEndData) {
                                  console.log(
                                    `[Content Script] ===== Chunk End Data =====`,
                                  );
                                  console.log(
                                    `[Content Script] Chunk End:`,
                                    chunkEndData,
                                  );
                                }

                                if (allData && allData.length > 0) {
                                  processEventStreamData(fetchUrl, allData, {
                                    method: "GET",
                                    status: 200,
                                    chunk2: chunk2Data,
                                    chunkEnd: chunkEndData,
                                    eventCount: eventCount,
                                    source: "EventSource",
                                  });
                                  resolve({
                                    success: true,
                                    data: allData,
                                    eventCount: eventCount,
                                    chunk2: chunk2Data,
                                    chunkEnd: chunkEndData,
                                  });
                                } else {
                                  resolve({
                                    success: false,
                                    data: "",
                                    eventCount: 0,
                                    error: "Timeout with no data",
                                  });
                                }
                              }, 200); // Wait 200ms for any final data
                            }
                          }, 5000); // 5 second timeout (reduced from 30 seconds)
                        } catch (eventSourceError) {
                          console.error(
                            `[Content Script] EventSource error for entry ${index + 1}:`,
                            eventSourceError,
                          );
                          reject(eventSourceError);
                        }
                      });
                    },
                  );

                  // Try EventSource first, but it may fail due to missing headers (EventSource doesn't support custom headers)
                  // So we'll quickly check and fall back to fetch if needed
                  try {
                    // Give EventSource a short time to connect (1 second)
                    const eventSourceTimeout = setTimeout(() => {
                      console.log(
                        "[Content Script] EventSource timeout - falling back to fetch with headers",
                      );
                    }, 1000);

                    const eventSourceResults =
                      await Promise.allSettled(eventSourcePromises);
                    clearTimeout(eventSourceTimeout);

                    const successfulEventSources = eventSourceResults.filter(
                      (r) =>
                        r.status === "fulfilled" &&
                        r.value &&
                        r.value.success &&
                        r.value.data &&
                        r.value.data.length > 0,
                    );

                    if (successfulEventSources.length > 0) {
                      console.log(
                        `[Content Script] ✅ EventSource successfully connected to ${successfulEventSources.length} stream(s)`,
                      );

                      // Log all successful responses
                      successfulEventSources.forEach((result, idx) => {
                        if (result.status === "fulfilled" && result.value) {
                          console.log(
                            `[Content Script] ===== EventSource Response Summary ${idx + 1} =====`,
                          );
                          console.log(
                            `[Content Script] Success:`,
                            result.value.success,
                          );
                          console.log(
                            `[Content Script] Event Count:`,
                            result.value.eventCount,
                          );
                          console.log(
                            `[Content Script] Data Length:`,
                            result.value.data?.length || 0,
                          );
                          console.log(
                            `[Content Script] Has Chunk 2:`,
                            result.value.chunk2 ? "YES ✅" : "NO ❌",
                          );
                          console.log(
                            `[Content Script] Has Chunk End:`,
                            result.value.chunkEnd ? "YES ✅" : "NO ❌",
                          );
                          if (result.value.data) {
                            console.log(
                              `[Content Script] Response Data:`,
                              result.value.data,
                            );
                          }
                          if (result.value.chunk2) {
                            console.log(
                              `[Content Script] Chunk 2:`,
                              result.value.chunk2,
                            );
                          }
                          if (result.value.chunkEnd) {
                            console.log(
                              `[Content Script] Chunk End:`,
                              result.value.chunkEnd,
                            );
                          }
                        }
                      });

                      sendResponse({
                        success: true,
                        found: true,
                        count: successfulEventSources.length,
                        message: `Connected to ${successfulEventSources.length} /search-stream-dt API stream(s) via EventSource...`,
                      });
                      return;
                    } else {
                      console.warn(
                        "[Content Script] EventSource failed or received no data - EventSource doesn't support custom headers (cookies, mcid, etc.)",
                      );
                      console.warn(
                        "[Content Script] Falling back to fetch with proper headers...",
                      );
                    }
                  } catch (e) {
                    console.warn(
                      "[Content Script] EventSource failed, falling back to fetch:",
                      e,
                    );
                  }

                  // Fallback to fetch if EventSource fails
                  const fetchPromises = streamEntries.map(
                    async (entry, index) => {
                      try {
                        // Get REAL-TIME current date and time at the moment of fetch
                        // This ensures the timestamp is always fresh, not from stored data
                        const currentTimestamp = Date.now(); // Real-time timestamp in milliseconds
                        const currentDateTime = new Date().toISOString(); // Real-time date/time in ISO format
                        let fetchUrl = entry.name;

                        // Parse URL and update timestamp parameters with REAL-TIME current date/time
                        const urlObj = new URL(fetchUrl);

                        // ALWAYS update apiCallTimestamp with REAL-TIME current timestamp (milliseconds)
                        // This overwrites any existing timestamp to ensure it's always current
                        urlObj.searchParams.set(
                          "apiCallTimestamp",
                          currentTimestamp.toString(),
                        );

                        // Also add fetchDateTime for reference (real-time)
                        urlObj.searchParams.set(
                          "fetchDateTime",
                          currentDateTime,
                        );

                        fetchUrl = urlObj.toString();

                        console.log(
                          `[Content Script] Attempting to fetch entry ${index + 1} with REAL-TIME timestamp`,
                        );
                        console.log(
                          `[Content Script] Real-time timestamp (apiCallTimestamp): ${currentTimestamp}`,
                        );
                        console.log(
                          `[Content Script] Real-time date/time (fetchDateTime): ${currentDateTime}`,
                        );
                        console.log(
                          `[Content Script] Full URL with real-time timestamp:`,
                          fetchUrl,
                        );

                        // Build headers - START with headers from chrome.webRequest (most reliable)
                        const fetchHeaders = {};

                        // First, try to get headers and cookies from chrome.webRequest (captured dynamically)
                        let webRequestHeadersResponse = null;
                        try {
                          webRequestHeadersResponse = await new Promise(
                            (resolve) => {
                              chrome.runtime.sendMessage(
                                {
                                  action: "getCapturedHeaders",
                                  url: storedRequest?.url || fetchUrl,
                                },
                                (response) => {
                                  if (chrome.runtime.lastError) {
                                    console.warn(
                                      "[Content Script] Error getting webRequest headers:",
                                      chrome.runtime.lastError.message,
                                    );
                                    resolve(null);
                                  } else {
                                    resolve(response);
                                  }
                                },
                              );
                            },
                          );

                          if (
                            webRequestHeadersResponse &&
                            webRequestHeadersResponse.success &&
                            webRequestHeadersResponse.headers
                          ) {
                            const allHeaders =
                              webRequestHeadersResponse.headers;
                            const webRequestCookies =
                              webRequestHeadersResponse.cookies || "";
                            const webRequestCookiesParsed =
                              webRequestHeadersResponse.cookiesParsed || {};

                            console.log(
                              "[Content Script] ========================================",
                            );
                            console.log(
                              "[Content Script] ✅ Using headers from chrome.webRequest",
                            );
                            console.log(
                              "[Content Script] ========================================",
                            );
                            console.log(
                              "[Content Script] Total header keys:",
                              Object.keys(allHeaders).length,
                            );

                            // Copy headers - prefer original case, skip lowercase duplicates and system keys
                            const seenHeaders = new Set(); // Track lowercase header names we've already added
                            Object.keys(allHeaders).forEach((key) => {
                              // Skip keys that look like "requestId:123" or are system keys
                              if (!key.includes(":") && !key.startsWith("_")) {
                                const lowerKey = key.toLowerCase();

                                // If this is a lowercase duplicate and we haven't seen it, check for original case
                                if (
                                  lowerKey === key &&
                                  !seenHeaders.has(lowerKey)
                                ) {
                                  // Check if original case version exists
                                  const originalKey = Object.keys(
                                    allHeaders,
                                  ).find(
                                    (k) =>
                                      k.toLowerCase() === lowerKey && k !== key,
                                  );

                                  if (originalKey) {
                                    // Use original case version
                                    fetchHeaders[originalKey] =
                                      allHeaders[originalKey];
                                    seenHeaders.add(lowerKey);
                                  } else {
                                    // No original case, use lowercase
                                    fetchHeaders[key] = allHeaders[key];
                                    seenHeaders.add(lowerKey);
                                  }
                                } else if (
                                  lowerKey !== key &&
                                  !seenHeaders.has(lowerKey)
                                ) {
                                  // This is original case, use it
                                  fetchHeaders[key] = allHeaders[key];
                                  seenHeaders.add(lowerKey);
                                }
                              }
                            });

                            console.log(
                              "[Content Script] Headers copied:",
                              Object.keys(fetchHeaders).length,
                              "unique headers",
                            );
                            console.log(
                              "[Content Script] Header names:",
                              Object.keys(fetchHeaders).join(", "),
                            );

                            // Log cookies from webRequest
                            console.log(
                              "[Content Script] 🍪 COOKIES from webRequest:",
                            );
                            if (webRequestCookies) {
                              console.log(
                                "[Content Script]   Cookie string length:",
                                webRequestCookies.length,
                              );
                              console.log(
                                "[Content Script]   Cookie string preview:",
                                webRequestCookies.length > 200
                                  ? webRequestCookies.substring(0, 200) + "..."
                                  : webRequestCookies,
                              );
                              console.log(
                                "[Content Script]   Total parsed cookies:",
                                Object.keys(webRequestCookiesParsed).length,
                              );
                              console.log(
                                "[Content Script]   Individual cookies:",
                              );
                              Object.keys(webRequestCookiesParsed).forEach(
                                (cookieName) => {
                                  const cookieValue =
                                    webRequestCookiesParsed[cookieName];
                                  const displayValue =
                                    cookieValue && cookieValue.length > 50
                                      ? cookieValue.substring(0, 50) + "..."
                                      : cookieValue;
                                  console.log(
                                    `[Content Script]     ${cookieName} = ${displayValue}`,
                                  );
                                },
                              );

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
                              console.log(
                                "[Content Script]   Important cookies check:",
                              );
                              importantCookies.forEach((cookieName) => {
                                const found = Object.keys(
                                  webRequestCookiesParsed,
                                ).find(
                                  (k) =>
                                    k.toLowerCase() ===
                                    cookieName.toLowerCase(),
                                );
                                if (found) {
                                  console.log(
                                    `[Content Script]     ✅ ${found}: ${webRequestCookiesParsed[found]}`,
                                  );
                                } else {
                                  console.log(
                                    `[Content Script]     ❌ ${cookieName}: NOT FOUND`,
                                  );
                                }
                              });
                            } else {
                              console.log(
                                "[Content Script]   ⚠️ No cookies found in webRequest",
                              );
                            }
                            console.log(
                              "[Content Script] ========================================",
                            );
                          } else {
                            console.warn(
                              "[Content Script] ⚠️ Could not get headers from chrome.webRequest, falling back to stored headers",
                            );
                          }
                        } catch (error) {
                          console.warn(
                            "[Content Script] Error fetching webRequest headers:",
                            error,
                          );
                        }

                        // Fallback: add stored request headers if webRequest headers weren't available
                        if (
                          Object.keys(fetchHeaders).length === 0 &&
                          storedRequest &&
                          storedRequest.requestHeaders
                        ) {
                          console.log(
                            "[Content Script] Using stored request headers as fallback:",
                            Object.keys(storedRequest.requestHeaders).length,
                            "headers",
                          );
                          // Copy ALL headers preserving case and values exactly as they were
                          Object.keys(storedRequest.requestHeaders).forEach(
                            (key) => {
                              fetchHeaders[key] =
                                storedRequest.requestHeaders[key];
                            },
                          );

                          // Log all headers that were copied
                          console.log(
                            "[Content Script] All headers copied:",
                            Object.keys(fetchHeaders).join(", "),
                          );

                          // Log specific important headers for verification
                          const importantHeaders = [
                            "mcid",
                            "cookie",
                            "mmt-auth",
                            "device-id",
                            "user-agent",
                            "accept",
                            "origin",
                            "referer",
                            "accept-encoding",
                            "accept-language",
                            "app-ver",
                            "auuid",
                            "cache-control",
                            "cmp-id",
                            "currency",
                            "domain",
                            "entity-name",
                            "flow",
                            "language",
                            "os",
                            "pfm",
                            "priority",
                            "profile-type",
                            "region",
                            "sec-ch-ua",
                            "sec-ch-ua-mobile",
                            "sec-ch-ua-platform",
                            "sec-fetch-dest",
                            "sec-fetch-mode",
                            "sec-fetch-site",
                            "source",
                            "src",
                            "user-country",
                            "user-currency",
                            "x-user-cc",
                            "x-user-ip",
                            "x-user-rc",
                          ];
                          importantHeaders.forEach((header) => {
                            const headerKey = Object.keys(fetchHeaders).find(
                              (k) => k.toLowerCase() === header.toLowerCase(),
                            );
                            if (headerKey && fetchHeaders[headerKey]) {
                              const value = fetchHeaders[headerKey];
                              const displayValue =
                                value.length > 50
                                  ? value.substring(0, 50) + "..."
                                  : value;
                              console.log(
                                `[Content Script] ✅ ${headerKey} header found:`,
                                displayValue,
                              );
                            } else {
                              console.warn(
                                `[Content Script] ⚠️ ${header} header NOT found in stored headers`,
                              );
                            }
                          });

                          // Check if device-id is missing and try to get it from URL or generate one
                          const deviceIdKey = Object.keys(fetchHeaders).find(
                            (k) => k.toLowerCase() === "device-id",
                          );
                          if (!deviceIdKey || !fetchHeaders[deviceIdKey]) {
                            console.warn(
                              "[Content Script] ⚠️ device-id header is missing!",
                            );

                            // Try to extract device-id from stored request URL or headers
                            if (storedRequest && storedRequest.url) {
                              try {
                                const urlObj = new URL(storedRequest.url);
                                const deviceIdFromUrl =
                                  urlObj.searchParams.get("device-id") ||
                                  urlObj.searchParams.get("dvid");
                                if (deviceIdFromUrl) {
                                  fetchHeaders["device-id"] = deviceIdFromUrl;
                                  console.log(
                                    "[Content Script] ✅ Found device-id from URL:",
                                    deviceIdFromUrl,
                                  );
                                }
                              } catch (e) {
                                console.warn(
                                  "[Content Script] Could not parse URL for device-id:",
                                  e,
                                );
                              }
                            }

                            // If still not found, try to get from cookie (dvid cookie)
                            if (!fetchHeaders["device-id"]) {
                              const cookieKey = Object.keys(fetchHeaders).find(
                                (k) => k.toLowerCase() === "cookie",
                              );
                              if (cookieKey && fetchHeaders[cookieKey]) {
                                const cookies = fetchHeaders[cookieKey];
                                const dvidMatch = cookies.match(/dvid=([^;]+)/);
                                if (dvidMatch && dvidMatch[1]) {
                                  fetchHeaders["device-id"] = dvidMatch[1];
                                  console.log(
                                    "[Content Script] ✅ Found device-id from cookie (dvid):",
                                    dvidMatch[1],
                                  );
                                }
                              }
                            }

                            // If still not found, log warning
                            if (!fetchHeaders["device-id"]) {
                              console.error(
                                "[Content Script] ❌ device-id header is still missing after all attempts!",
                              );
                            }
                          }

                          // Check if pfm (platform) header is missing and try to get it
                          const pfmKey = Object.keys(fetchHeaders).find(
                            (k) => k.toLowerCase() === "pfm",
                          );
                          if (!pfmKey || !fetchHeaders[pfmKey]) {
                            console.warn(
                              "[Content Script] ⚠️ pfm header is missing!",
                            );

                            // Try to extract pfm from stored request URL
                            if (storedRequest && storedRequest.url) {
                              try {
                                const urlObj = new URL(storedRequest.url);
                                const pfmFromUrl =
                                  urlObj.searchParams.get("pfm");
                                if (pfmFromUrl) {
                                  fetchHeaders["pfm"] = pfmFromUrl;
                                  console.log(
                                    "[Content Script] ✅ Found pfm from URL:",
                                    pfmFromUrl,
                                  );
                                }
                              } catch (e) {
                                console.warn(
                                  "[Content Script] Could not parse URL for pfm:",
                                  e,
                                );
                              }
                            }

                            // If still not found, default to DESKTOP (common value)
                            if (!fetchHeaders["pfm"]) {
                              fetchHeaders["pfm"] = "DESKTOP";
                              console.log(
                                "[Content Script] ✅ Set pfm header to default: DESKTOP",
                              );
                            }
                          }

                          // Check if mcid header is missing and try to get it
                          const mcidKey = Object.keys(fetchHeaders).find(
                            (k) => k.toLowerCase() === "mcid",
                          );
                          if (!mcidKey || !fetchHeaders[mcidKey]) {
                            console.warn(
                              "[Content Script] ⚠️ mcid header is missing!",
                            );

                            // Try to extract mcid from stored request URL
                            if (storedRequest && storedRequest.url) {
                              try {
                                const urlObj = new URL(storedRequest.url);
                                const mcidFromUrl =
                                  urlObj.searchParams.get("mcid");
                                if (mcidFromUrl) {
                                  fetchHeaders["mcid"] = mcidFromUrl;
                                  console.log(
                                    "[Content Script] ✅ Found mcid from URL:",
                                    mcidFromUrl,
                                  );
                                }
                              } catch (e) {
                                console.warn(
                                  "[Content Script] Could not parse URL for mcid:",
                                  e,
                                );
                              }
                            }

                            // If still not found, try to get from device-id (they're often the same)
                            if (
                              !fetchHeaders["mcid"] &&
                              fetchHeaders["device-id"]
                            ) {
                              fetchHeaders["mcid"] = fetchHeaders["device-id"];
                              console.log(
                                "[Content Script] ✅ Set mcid header from device-id:",
                                fetchHeaders["device-id"],
                              );
                            }

                            // If still not found, try to get from cookie (dvid cookie - same as device-id)
                            if (!fetchHeaders["mcid"]) {
                              const cookieKey = Object.keys(fetchHeaders).find(
                                (k) => k.toLowerCase() === "cookie",
                              );
                              if (cookieKey && fetchHeaders[cookieKey]) {
                                const cookies = fetchHeaders[cookieKey];
                                const dvidMatch = cookies.match(/dvid=([^;]+)/);
                                if (dvidMatch && dvidMatch[1]) {
                                  fetchHeaders["mcid"] = dvidMatch[1];
                                  console.log(
                                    "[Content Script] ✅ Found mcid from cookie (dvid):",
                                    dvidMatch[1],
                                  );
                                }
                              }
                            }

                            // If still not found, use the provided default value
                            if (!fetchHeaders["mcid"]) {
                              fetchHeaders["mcid"] =
                                "ad509696-e9c1-4d4b-81f4-15b356fbf7c0";
                              console.log(
                                "[Content Script] ✅ Set mcid header to default value: ad509696-e9c1-4d4b-81f4-15b356fbf7c0",
                              );
                            }
                          } else {
                            console.log(
                              "[Content Script] ✅ mcid header already present:",
                              fetchHeaders[mcidKey],
                            );
                          }
                        } else {
                          console.warn(
                            "[Content Script] ⚠️ No stored request headers found!",
                          );

                          // Even if no stored headers, ensure mcid is set
                          if (!fetchHeaders["mcid"]) {
                            fetchHeaders["mcid"] =
                              "ad509696-e9c1-4d4b-81f4-15b356fbf7c0";
                            console.log(
                              "[Content Script] ✅ Set mcid header to default value: ad509696-e9c1-4d4b-81f4-15b356fbf7c0",
                            );
                          }
                        }

                        // Hardcode all required headers (merge with stored headers, hardcoded take precedence for missing ones)
                        const hardcodedHeaders = {
                          accept: "text/event-stream",
                          "accept-encoding": "gzip, deflate, br, zstd",
                          "accept-language": "en-US,en;q=0.9",
                          "access-control-allow-credentials": "true",
                          "app-ver": "1.0.0",
                          auuid: "",
                          "cache-control": "no-cache",
                          "cmp-id": "",
                          currency: "INR",
                          "device-id": "ad509696-e9c1-4d4b-81f4-15b356fbf7c0",
                          domain: "in",
                          "entity-name": "india",
                          flow: "",
                          language: "eng",
                          mcid: "ad509696-e9c1-4d4b-81f4-15b356fbf7c0",
                          "mmt-auth": "",
                          origin: cfg.domain,
                          os: "Windows",
                          pfm: "DESKTOP",
                          priority: "u=1, i",
                          "profile-type": "PERSONAL",
                          referer: cfg.domain + "/",
                          region: "in",
                          "sec-ch-ua":
                            '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
                          "sec-ch-ua-mobile": "?0",
                          "sec-ch-ua-platform": '"Windows"',
                          "sec-fetch-dest": "empty",
                          "sec-fetch-mode": "cors",
                          "sec-fetch-site": "same-site",
                          source: "null",
                          src: "mmt",
                          "user-agent": getRandomUserAgent(),
                          "user-country": "IN",
                          "user-currency": "INR",
                          "x-user-cc": "IN",
                          "x-user-ip": "122.15.176.45",
                          "x-user-rc": "CHENNAI",
                        };

                        // Merge hardcoded headers - only add if not already present (preserve stored headers first)
                        Object.keys(hardcodedHeaders).forEach((key) => {
                          // Check case-insensitive
                          const existingKey = Object.keys(fetchHeaders).find(
                            (k) => k.toLowerCase() === key.toLowerCase(),
                          );
                          if (!existingKey) {
                            fetchHeaders[key] = hardcodedHeaders[key];
                            console.log(
                              `[Content Script] Added hardcoded header: ${key} = ${hardcodedHeaders[key]}`,
                            );
                          }
                        });

                        // Ensure mcid is always set to the hardcoded value (override if needed)
                        const mcidKey = Object.keys(fetchHeaders).find(
                          (k) => k.toLowerCase() === "mcid",
                        );
                        if (
                          !mcidKey ||
                          !fetchHeaders[mcidKey] ||
                          fetchHeaders[mcidKey] !==
                            "ad509696-e9c1-4d4b-81f4-15b356fbf7c0"
                        ) {
                          fetchHeaders["mcid"] =
                            "ad509696-e9c1-4d4b-81f4-15b356fbf7c0";
                          console.log(
                            "[Content Script] ✅ Ensured mcid header is set to: ad509696-e9c1-4d4b-81f4-15b356fbf7c0",
                          );
                        }

                        // Ensure device-id is always set to the hardcoded value
                        const deviceIdKey = Object.keys(fetchHeaders).find(
                          (k) => k.toLowerCase() === "device-id",
                        );
                        if (
                          !deviceIdKey ||
                          !fetchHeaders[deviceIdKey] ||
                          fetchHeaders[deviceIdKey] !==
                            "ad509696-e9c1-4d4b-81f4-15b356fbf7c0"
                        ) {
                          fetchHeaders["device-id"] =
                            "ad509696-e9c1-4d4b-81f4-15b356fbf7c0";
                          console.log(
                            "[Content Script] ✅ Ensured device-id header is set to: ad509696-e9c1-4d4b-81f4-15b356fbf7c0",
                          );
                        }

                        // Ensure all cookies are included in headers - prioritize chrome.cookies API
                        const cookieKey = Object.keys(fetchHeaders).find(
                          (k) => k.toLowerCase() === "cookie",
                        );
                        let allCookies = "";
                        let cookiesParsed = {};

                        // Priority 1: Use cookies from chrome.cookies API (most reliable, directly from browser cookie store)
                        try {
                          const cookiesResponse = await new Promise(
                            (resolve) => {
                              chrome.runtime.sendMessage(
                                {
                                  action: "getCookies",
                                  url: storedRequest?.url || fetchUrl,
                                },
                                (response) => {
                                  if (chrome.runtime.lastError) {
                                    console.warn(
                                      "[Content Script] Error getting cookies from chrome.cookies API:",
                                      chrome.runtime.lastError.message,
                                    );
                                    resolve(null);
                                  } else {
                                    resolve(response);
                                  }
                                },
                              );
                            },
                          );

                          if (
                            cookiesResponse &&
                            cookiesResponse.success &&
                            cookiesResponse.cookies
                          ) {
                            allCookies = cookiesResponse.cookies;
                            cookiesParsed = cookiesResponse.cookiesParsed || {};
                            console.log(
                              "[Content Script] ✅ Using cookies from chrome.cookies API (dynamically fetched)",
                            );
                            console.log(
                              "[Content Script]   Cookie string length:",
                              allCookies.length,
                            );
                            console.log(
                              "[Content Script]   Total cookies:",
                              Object.keys(cookiesParsed).length,
                            );
                            console.log(
                              "[Content Script]   Individual cookies:",
                              Object.keys(cookiesParsed).join(", "),
                            );
                          }
                        } catch (error) {
                          console.warn(
                            "[Content Script] Error fetching cookies from chrome.cookies API:",
                            error,
                          );
                        }

                        // Priority 2: Use cookies from webRequest (reuse the response we already got)
                        if (
                          !allCookies &&
                          webRequestHeadersResponse &&
                          webRequestHeadersResponse.success &&
                          webRequestHeadersResponse.cookies
                        ) {
                          allCookies = webRequestHeadersResponse.cookies;
                          cookiesParsed =
                            webRequestHeadersResponse.cookiesParsed || {};
                          console.log(
                            "[Content Script] ✅ Using cookies from chrome.webRequest (dynamically captured)",
                          );
                          console.log(
                            "[Content Script]   Cookie string length:",
                            allCookies.length,
                          );
                          console.log(
                            "[Content Script]   Total cookies:",
                            allCookies.split(";").filter((c) => c.trim())
                              .length,
                          );
                        }

                        // Priority 3: Get cookies from headers (if chrome.cookies and webRequest didn't provide them)
                        if (
                          !allCookies &&
                          cookieKey &&
                          fetchHeaders[cookieKey]
                        ) {
                          allCookies = fetchHeaders[cookieKey];
                          console.log(
                            "[Content Script] Using cookies from headers",
                          );
                        }

                        // Priority 4: Get cookies from document.cookie and merge with existing
                        if (document.cookie) {
                          if (allCookies) {
                            // Merge cookies - combine chrome.cookies/webRequest/header cookies with document cookies
                            // Remove duplicates by parsing and combining
                            const existingCookies = allCookies
                              .split(";")
                              .map((c) => c.trim())
                              .filter((c) => c);
                            const docCookies = document.cookie
                              .split(";")
                              .map((c) => c.trim())
                              .filter((c) => c);
                            const cookieMap = new Map();

                            // Add existing cookies first (from chrome.cookies/webRequest/headers)
                            existingCookies.forEach((cookie) => {
                              const [name] = cookie.split("=");
                              if (name) cookieMap.set(name.trim(), cookie);
                            });

                            // Add/override with document cookies (newer cookies may override)
                            docCookies.forEach((cookie) => {
                              const [name] = cookie.split("=");
                              if (name) cookieMap.set(name.trim(), cookie);
                            });

                            allCookies = Array.from(cookieMap.values()).join(
                              "; ",
                            );
                            console.log(
                              "[Content Script] ✅ Merged cookies from chrome.cookies/webRequest/headers and document.cookie",
                            );
                            console.log(
                              "[Content Script]   Final cookie count:",
                              cookieMap.size,
                            );
                          } else {
                            allCookies = document.cookie;
                            console.log(
                              "[Content Script] Using cookies from document.cookie (fallback)",
                            );
                          }
                        }

                        // Set the Cookie header with all cookies
                        if (allCookies) {
                          fetchHeaders["Cookie"] = allCookies;
                          const cookieCount = allCookies
                            .split(";")
                            .filter((c) => c.trim()).length;
                          console.log(
                            "[Content Script] ✅ Cookie header set with",
                            cookieCount,
                            "cookies",
                          );
                          console.log(
                            "[Content Script] Cookie preview:",
                            allCookies.length > 200
                              ? allCookies.substring(0, 200) + "..."
                              : allCookies,
                          );

                          // Log important cookies from final cookie string
                          const importantCookies = [
                            "dvid",
                            "mcid",
                            "sessionid",
                            "auth",
                            "token",
                            "userid",
                            "uuid",
                          ];
                          console.log(
                            "[Content Script] Final important cookies check:",
                          );
                          importantCookies.forEach((cookieName) => {
                            const regex = new RegExp(
                              `${cookieName}=([^;]+)`,
                              "i",
                            );
                            const match = allCookies.match(regex);
                            if (match && match[1]) {
                              console.log(
                                `[Content Script]   ✅ ${cookieName}: ${match[1]}`,
                              );
                            } else {
                              console.log(
                                `[Content Script]   ❌ ${cookieName}: NOT FOUND`,
                              );
                            }
                          });
                        } else {
                          console.warn(
                            "[Content Script] ⚠️ No cookies found in webRequest, headers, or document.cookie",
                          );
                        }

                        console.log(
                          "[Content Script] Final fetch headers count:",
                          Object.keys(fetchHeaders).length,
                        );
                        console.log(
                          "[Content Script] Header keys:",
                          Object.keys(fetchHeaders).join(", "),
                        );
                        console.log(
                          "[Content Script] Headers with mcid:",
                          fetchHeaders.mcid ||
                            Object.keys(fetchHeaders).find(
                              (k) => k.toLowerCase() === "mcid",
                            )
                            ? "YES"
                            : "NO",
                        );
                        console.log(
                          "[Content Script] Headers with Cookie:",
                          cookieKey ||
                            Object.keys(fetchHeaders).find(
                              (k) => k.toLowerCase() === "cookie",
                            )
                            ? "YES"
                            : "NO",
                        );

                        // Try to fetch the URL directly with original headers and timestamp
                        const response = await fetch(fetchUrl, {
                          method: storedRequest?.method || "GET",
                          headers: fetchHeaders,
                          credentials: "include", // Include cookies
                          mode: "cors",
                        });

                        if (response.ok && response.body) {
                          console.log(
                            `[Content Script] Successfully fetched entry ${index + 1}`,
                          );

                          // Read the stream
                          const reader = response.body.getReader();
                          const decoder = new TextDecoder();
                          let responseData = "";
                          let result;

                          while (!(result = await reader.read()).done) {
                            const chunk = result.value;
                            responseData += decoder.decode(chunk, {
                              stream: true,
                            });
                          }

                          if (responseData && responseData.length > 0) {
                            console.log(
                              `[Content Script] Fetched ${responseData.length} bytes for entry ${index + 1}`,
                            );

                            // Store it
                            const requestInfo = {
                              url: fetchUrl, // Use the URL with timestamp
                              originalUrl: entry.name, // Keep original URL for reference
                              method: "GET",
                              status: response.status,
                              responseData: responseData,
                              responseSize: responseData.length,
                              type: "EventStream",
                              timestamp: new Date().toISOString(),
                              fetchTimestamp: currentTimestamp,
                              fetchDateTime: currentDateTime,
                            };
                            storeNetworkRequest(requestInfo);

                            // Process and download
                            setTimeout(() => {
                              processEventStreamData(fetchUrl, responseData, {
                                method: storedRequest?.method || "GET",
                                status: response.status,
                                headers: storedRequest?.responseHeaders || {},
                                requestHeaders:
                                  storedRequest?.requestHeaders || {},
                                fetchTimestamp: currentTimestamp,
                                fetchDateTime: currentDateTime,
                              });
                            }, index * 200);

                            return true;
                          }
                        } else {
                          console.warn(
                            `[Content Script] Failed to fetch entry ${index + 1}:`,
                            response.status,
                            response.statusText,
                          );
                        }
                      } catch (fetchError) {
                        console.error(
                          `[Content Script] Error fetching entry ${index + 1}:`,
                          fetchError.message,
                        );
                      }
                      return false;
                    },
                  );

                  // Wait for all fetch attempts
                  const results = await Promise.all(fetchPromises);
                  const successCount = results.filter((r) => r === true).length;

                  if (successCount > 0) {
                    sendResponse({
                      success: true,
                      found: true,
                      count: successCount,
                      message: `Fetched ${successCount} /search-stream-dt API response(s) directly and downloading...`,
                    });
                  } else {
                    sendResponse({
                      success: false,
                      found: false,
                      message:
                        "API detected in Performance API but no data stored and direct fetch failed. The fetch interceptor may have missed it. Try refreshing the page and clicking the button again.",
                    });
                  }
                } catch (error) {
                  console.error(
                    "[Content Script] Error in fallback fetch:",
                    error,
                  );
                  sendResponse({
                    success: false,
                    found: false,
                    message: "Error attempting to fetch data: " + error.message,
                  });
                }
              })();
            }
          } else {
            sendResponse({
              success: false,
              found: false,
              message:
                "No /search-stream-dt API calls found. Make sure you have navigated to a flight search page.",
            });
          }
        } else {
          sendResponse({
            success: false,
            found: false,
            message: "Performance API not available",
          });
        }
      })();

      return true; // Keep channel open for async response
    }

    return true;
  });

  console.log("[Content Script] Event stream interceptor loaded");
} // End of __contentScriptLoaded check
