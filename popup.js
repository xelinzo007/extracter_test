/**
 * pdfcreater - Popup Script
 * Handles UI interactions and communication with content script
 */

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search || '');
  const isStandalone = urlParams.get('standalone') === '1';
  const shouldAutoStart = urlParams.get('autoStart') === '1';
  
  const processUrlsBtn = document.getElementById('processUrlsBtn');
  const status = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const info = document.getElementById('info');
  const results = document.getElementById('results');
  const jsonOutput = document.getElementById('jsonOutput');
  const flightCount = document.getElementById('flightCount');
  const progress = document.getElementById('progress');
  const progressText = document.getElementById('progressText');
  const progressCounter = document.getElementById('progressCounter');
  const progressFill = document.getElementById('progressFill');
  const progressDetails = document.getElementById('progressDetails');
  const progressTimer = document.getElementById('progressTimer');
  const progressDurationSummary = document.getElementById('progressDurationSummary');

  let totalCombinations = 0;
  let completedCombinations = 0;
  let processingStartTime = null;
  let timerInterval = null;
  
  // Single button handler - Process URLs from Config
  if (processUrlsBtn) {
    processUrlsBtn.addEventListener('click', async () => {
      if (!isStandalone) {
        updateStatus('Opening persistent dashboard window...', 'loading');
        const opened = await openPersistentWindow(true);
        if (opened) {
          setTimeout(() => window.close(), 100);
        } else {
          updateStatus('Unable to open persistent window. Please allow popups and try again.', 'error');
        }
        return;
      }
      await startProcessing();
    });
  }

  if (shouldAutoStart && isStandalone) {
    setTimeout(() => {
      startProcessing();
    }, 300);
  }

  // Alert elements
  const alert = document.getElementById('alert');
  const alertText = document.getElementById('alertText');
  const alertClose = document.getElementById('alertClose');

  // Alert close handler
  if (alertClose) {
    alertClose.addEventListener('click', () => {
      if (alert) {
        alert.style.display = 'none';
      }
    });
  }

  // Function to show alert
  function showAlert(message, type = 'info') {
    if (!alert || !alertText) return;
    
    alertText.textContent = message;
    alert.className = 'alert';
    alert.classList.add(`alert-${type}`);
    alert.style.display = 'block';
    
    // Auto-hide after 10 seconds for info/warning, 15 seconds for success/error
    const hideDelay = (type === 'info' || type === 'warning') ? 10000 : 15000;
    setTimeout(() => {
      if (alert) {
        alert.style.display = 'none';
      }
    }, hideDelay);
  }

  // Listen for progress updates from background script and content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'urlProcessingProgress') {
      completedCombinations = request.completed || 0;
      totalCombinations = request.total || totalCombinations;
      const currentUrl = request.currentUrl || '';
      const message = request.message || '';
      
      // Show alert if requested
      if (request.alert && request.message) {
        const alertType = request.alertType || 'info';
        showAlert(request.message, alertType);
      }
      
      updateProgress(completedCombinations, totalCombinations, message);
      
      if (completedCombinations >= totalCombinations) {
        updateStatus(`✅ Completed processing ${totalCombinations} URLs. All files downloaded.`, 'success');
        if (processUrlsBtn) {
          processUrlsBtn.disabled = false;
        }
      }
      sendResponse({ success: true });
    } else if (request.action === 'progressUpdate') {
      updateProgress(
        request.completed || 0,
        request.total || 0,
        request.route ? `Route: ${request.route}, Date: +${request.dateOffset} days` : ''
      );
      sendResponse({ success: true });
    }
    return true;
  });

  async function startProcessing() {
    try {
      updateStatus('Starting to process URLs from config.json...', 'loading');
      if (processUrlsBtn) {
        processUrlsBtn.disabled = true;
      }
      showProgress();
      hideDurationSummary();
      startElapsedTimer();

      chrome.runtime.sendMessage({
        action: 'processUrlsSequentially'
      }, (response) => {
        if (chrome.runtime.lastError) {
          updateStatus('Error: ' + chrome.runtime.lastError.message, 'error');
          if (processUrlsBtn) {
            processUrlsBtn.disabled = false;
          }
          return;
        }

        if (response && response.success) {
          totalCombinations = response.totalUrls || 0;
          completedCombinations = 0;
          updateProgress(0, totalCombinations, 'Starting...');
          updateStatus(`Processing ${totalCombinations} URLs. Files will be downloaded automatically.`, 'loading');
        } else {
          const errorMsg = response?.error || 'Failed to start processing URLs';
          updateStatus(`Error: ${errorMsg}`, 'error');
          console.error('Error:', response);
          stopElapsedTimer();
          hideDurationSummary();
          if (processUrlsBtn) {
            processUrlsBtn.disabled = false;
          }
        }
      });

    } catch (error) {
      console.error('Error:', error);
      updateStatus('Error: ' + error.message, 'error');
      stopElapsedTimer();
      hideDurationSummary();
      if (processUrlsBtn) {
        processUrlsBtn.disabled = false;
      }
    }
  }

  function updateStatus(message, type = '') {
    statusText.textContent = message;
    status.className = 'status';
    if (type) {
      status.classList.add(type);
    }
  }

  /**
   * Display extracted results
   */
  function displayResults(data) {
    if (!data) {
      console.error('displayResults: No data provided');
      return;
    }
    
    info.style.display = 'none';
    results.style.display = 'flex';
    
    const jsonString = JSON.stringify(data, null, 2);
    jsonOutput.textContent = jsonString;
    
    // Update flight count with proper null checking
    const flightsCount = (data.flights && Array.isArray(data.flights)) 
      ? data.flights.length 
      : 0;
    flightCount.textContent = `${flightsCount} flights`;
    
    // Update execution time
    const execTime = document.getElementById('executionTime');
    if (data.metadata?.execution_time_formatted) {
      execTime.textContent = `⏱ ${data.metadata.execution_time_formatted}`;
      execTime.style.display = 'inline-block';
    } else {
      execTime.style.display = 'none';
    }
    
    // Scroll to top
    results.scrollTop = 0;
  }

  /**
   * Show progress bar
   */
  function showProgress() {
    progress.style.display = 'block';
  }

  /**
   * Hide progress bar
   */
  function hideProgress() {
    progress.style.display = 'none';
  }

  /**
   * Update progress counter
   */
  function updateProgress(completed, total, details = '') {
    completedCombinations = completed;
    totalCombinations = total;
    
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    progressCounter.textContent = `${completed}/${total}`;
    progressFill.style.width = `${percentage}%`;
    
    if (details) {
      progressDetails.textContent = details;
    }
    
    if (completed >= total && total > 0) {
      progressText.textContent = 'Completed!';
      progressDetails.textContent = `All ${total} combinations processed successfully`;
      updateStatus(`All ${total} route-date combinations completed!`, 'success');
      stopElapsedTimer();
    } else {
      progressText.textContent = 'Processing...';
    }
  }

  function openPersistentWindow(autoStart = false) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'openPersistentPopupWindow',
        autoStart
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('openPersistentWindow error:', chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        resolve(response?.success);
      });
    });
  }

  function startElapsedTimer() {
    if (!progressTimer) return;
    processingStartTime = Date.now();
    updateTimerDisplay(0);
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - processingStartTime;
      updateTimerDisplay(elapsed);
    }, 1000);
  }

  function stopElapsedTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (processingStartTime !== null) {
      const elapsed = Date.now() - processingStartTime;
      updateTimerDisplay(elapsed);
      showDurationSummary(elapsed);
    }
    processingStartTime = null;
  }

  function updateTimerDisplay(ms) {
    if (!progressTimer) return;
    progressTimer.textContent = `⏱ ${formatDuration(ms)}`;
  }

  function hideDurationSummary() {
    if (!progressDurationSummary) return;
    progressDurationSummary.style.display = 'none';
    progressDurationSummary.textContent = '';
  }

  function showDurationSummary(ms) {
    if (!progressDurationSummary) return;
    progressDurationSummary.textContent = `Total time: ${formatDurationLong(ms)}`;
    progressDurationSummary.style.display = 'block';
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatDurationLong(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0 || hours > 0) {
      parts.push(`${minutes}m`);
    }
    parts.push(`${seconds}s`);

    return parts.join(' ');
  }
});

