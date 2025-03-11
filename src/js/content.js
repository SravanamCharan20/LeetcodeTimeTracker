// Track user activity
console.log('LeetCode Activity Tracker: Content script loaded');
let lastActivityTime = Date.now();
let problemStartTime = null;
let currentProblemId = null;
let currentProblemTitle = null;
let isSubmissionMonitoringActive = false;
let submissionCheckInterval = null;
let lastSubmissionTime = null;
let lastSuccessfulSubmissionId = null;
let submissionObserver = null;
const ACTIVITY_CHECK_INTERVAL = 1000; // Check every second
const DUPLICATE_SUBMISSION_THRESHOLD = 5000; // 5 seconds

// Activity monitoring
document.addEventListener('mousemove', updateActivity);
document.addEventListener('keypress', updateActivity);
document.addEventListener('click', updateActivity);
document.addEventListener('scroll', updateActivity);
console.log('LeetCode Activity Tracker: Activity listeners initialized');

function updateActivity() {
  const now = Date.now();
  
  // Only send activity update if it's been more than 1 second since the last one
  if (now - lastActivityTime > ACTIVITY_CHECK_INTERVAL) {
    lastActivityTime = now;
    
    // Send activity message to background script
    chrome.runtime.sendMessage({
      type: 'activity',
      problemId: currentProblemId,
      problemTitle: currentProblemTitle
    });
    
    console.log('Activity detected and sent to background');
  }
}

// Initialize problem tracking when the page loads
window.addEventListener('load', () => {
  console.log('Page loaded, initializing problem tracking');
  setTimeout(initializeProblemTracking, 1000); // Wait for page to fully load
});

// Set up URL change monitoring to detect navigation between problems
setupUrlChangeMonitoring();

function initializeProblemTracking() {
  const currentPath = window.location.pathname;
  console.log('Initializing problem tracking for path:', currentPath);
  
  // Extract problem ID from either problem page or submission page
  const problemMatch = currentPath.match(/\/problems\/([^/]+)/);
  if (problemMatch) {
    const problemId = problemMatch[1];
    console.log('Detected problem ID:', problemId);
    
    if (problemId) {
      currentProblemId = problemId;
      
      // Extract problem title
      currentProblemTitle = extractProblemTitle();
      console.log('Detected problem title:', currentProblemTitle);
      
      // Only set start time if we're on the problem page (not submission page)
      if (!currentPath.includes('/submissions/') && !problemStartTime) {
        problemStartTime = Date.now();
        console.log('Setting problem start time:', new Date(problemStartTime).toLocaleTimeString());
        
        // Notify background script that a problem has been opened
        chrome.runtime.sendMessage({
          type: 'problemOpened',
          data: {
            problem_id: problemId,
            problem_name: currentProblemTitle,
            start_time: problemStartTime
          }
        });
      }
      
      // Set up submission monitoring
      if (!isSubmissionMonitoringActive) {
        setupSubmissionMonitoring();
      }
    }
  } else {
    console.log('Not on a problem or submission page');
  }
}

function extractProblemTitle() {
  // Try multiple selectors to find the problem title
  const titleSelectors = [
    'div[data-cy="question-title"]',
    '.css-v3d350', // Common LeetCode title class
    '.question-title',
    'h4.title-container__27vp',
    '.content__title',
    '.question-content h1',
    '.question-detail h1'
  ];
  
  for (const selector of titleSelectors) {
    const titleElement = document.querySelector(selector);
    if (titleElement && titleElement.textContent.trim()) {
      return titleElement.textContent.trim();
    }
  }
  
  // Fallback: try to extract from URL
  const problemId = getProblemIdFromUrl();
  if (problemId) {
    // Convert kebab-case to title case
    return problemId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  return 'Unknown Problem';
}

function getProblemIdFromUrl() {
  const match = window.location.pathname.match(/\/problems\/([^/]+)/);
  return match ? match[1] : null;
}

function setupUrlChangeMonitoring() {
  console.log('Setting up URL change monitoring');
  let lastUrl = window.location.href;
  
  // Check for URL changes every second
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      console.log('URL changed from', lastUrl, 'to', currentUrl);
      lastUrl = currentUrl;
      
      // Reset problem tracking for the new page
      problemStartTime = null;
      currentProblemId = null;
      currentProblemTitle = null;
      lastSubmissionTime = null;
      isSubmissionMonitoringActive = false;
      
      // Clean up observer
      if (submissionObserver) {
        submissionObserver.disconnect();
        submissionObserver = null;
      }
      
      // Initialize tracking for the new page
      setTimeout(initializeProblemTracking, 1000);
    }
  }, 1000);
}

function setupSubmissionMonitoring() {
  console.log('Setting up submission monitoring');
  isSubmissionMonitoringActive = true;

  // Clear any existing interval and observer
  if (submissionCheckInterval) {
    clearInterval(submissionCheckInterval);
    submissionCheckInterval = null;
  }
  
  // Set up the observer
  observeSubmissionResults();
}

function observeSubmissionResults() {
  console.log('Setting up submission observer');
  
  if (submissionObserver) {
    submissionObserver.disconnect();
  }

  // Watch both the submission area and the results area
  const watchElements = [
    document.querySelector('[class*="submissions"]'),
    document.querySelector('[class*="result"]'),
    document.querySelector('[class*="console"]'),
    document.querySelector('[class*="output"]'),
    document.querySelector('[data-cy="submissions-content"]'),
    document.querySelector('[data-e2e-locator="submission-result"]')
  ].filter(Boolean);

  if (watchElements.length === 0) {
    console.log('No specific elements found, watching body');
    watchElements.push(document.body);
  } else {
    console.log('Found elements to watch:', watchElements);
  }

  submissionObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'characterData' || mutation.type === 'subtree') {
        console.log('Detected DOM mutation:', mutation.type);
        // Use multiple timeouts to ensure we catch the submission
        setTimeout(() => checkSubmissionResult('500ms'), 500);
        setTimeout(() => checkSubmissionResult('1000ms'), 1000);
        setTimeout(() => checkSubmissionResult('2000ms'), 2000);
      }
    }
  });

  watchElements.forEach(element => {
    submissionObserver.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  });
}

function checkSubmissionResult(timing = 'immediate') {
  // First check if we're on a submission page
  const submissionMatch = window.location.pathname.match(/\/problems\/([^/]+)\/submissions\/(\d+)/);
  if (submissionMatch) {
    const problemId = submissionMatch[1];
    const submissionId = submissionMatch[2];
    
    console.log(`Checking submission result (${timing}) for:`, { problemId, submissionId });

    // Updated selectors for better acceptance detection
    const acceptedSelectors = [
      // Most specific selectors first
      '[data-e2e-locator="submission-result"] [class*="success" i]',
      '[data-e2e-locator="submission-result"] [class*="accepted" i]',
      '[data-e2e-locator="submission-result-accepted"]',
      // General success indicators
      '[class*="result-container"] [class*="success" i]',
      '[class*="result-container"] [class*="accepted" i]',
      // Status text elements
      '[data-e2e-locator="submission-result"] span',
      '[data-e2e-locator="submission-result"] div',
      // Submission details
      '[data-cy="submissions-content"] [class*="success" i]',
      '[data-cy="submissions-content"] [class*="accepted" i]',
      // Fallback selectors
      '[class*="success-icon"]',
      '[class*="success__"]',
      '[class*="accepted__"]'
    ];

    let isAccepted = false;
    let resultElement = null;

    // Function to check if text indicates acceptance
    const isAcceptedText = (text) => {
      text = text.toLowerCase().trim();
      return text.includes('accepted') || 
             text.includes('通过') || 
             text.includes('success') ||
             text.includes('correct answer') ||
             text === 'ac' || // Common abbreviation for Accepted
             /^accepted\s*\(\d+\s*ms\)/.test(text); // Matches "Accepted (X ms)"
    };

    // First try direct success indicators
    for (const selector of acceptedSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element && !element.closest('.hidden') && !element.hidden) {
          const text = element.textContent;
          console.log('Checking element:', { selector, text, timing, visible: element.offsetParent !== null });
          
          if (isAcceptedText(text)) {
            console.log('Found accepted indicator:', { selector, text, timing });
            isAccepted = true;
            resultElement = element;
            break;
          }
        }
      }
      if (isAccepted) break;
    }

    // If not found, try checking the entire submission content
    if (!isAccepted) {
      const containers = [
        document.querySelector('[data-cy="submissions-content"]'),
        document.querySelector('[data-e2e-locator="submission-result"]'),
        document.querySelector('[class*="result-container"]'),
        document.querySelector('[class*="submissions-container"]')
      ].filter(Boolean);

      for (const container of containers) {
        const text = container.textContent;
        console.log('Checking container:', { text, timing });
        if (isAcceptedText(text)) {
          console.log('Found accepted in container:', { text, timing });
          isAccepted = true;
          resultElement = container;
          break;
        }
      }
    }

    // Check for success status in runtime/memory elements
    if (!isAccepted) {
      const runtimeElement = document.querySelector('[class*="runtime"]');
      const memoryElement = document.querySelector('[class*="memory"]');
      if (runtimeElement && memoryElement) {
        console.log('Found runtime/memory stats - likely accepted');
        isAccepted = true;
      }
    }

    if (isAccepted) {
      const currentTime = Date.now();
      
      // Only process if this is a new submission
      if (submissionId !== lastSuccessfulSubmissionId) {
        console.log('Processing new accepted submission:', submissionId);
        lastSuccessfulSubmissionId = submissionId;
        lastSubmissionTime = currentTime;

        // Extract problem data
        const problemData = extractProblemData();
        problemData.submissionId = submissionId;
        
        // Calculate time spent
        const timeSpent = problemStartTime ? currentTime - problemStartTime : 0;
        problemData.timeSpent = timeSpent;
        problemData.submissionTime = currentTime;
        
        console.log('Sending solved problem data:', problemData);
        
        // Send to background script
        chrome.runtime.sendMessage({
          type: 'problemSolved',
          data: problemData
        }, response => {
          console.log('Problem solved message response:', response);
          
          // Reset tracking
          problemStartTime = null;
          isSubmissionMonitoringActive = false;
          
          // Clean up observer
          if (submissionObserver) {
            submissionObserver.disconnect();
            submissionObserver = null;
          }
        });
      } else {
        console.log('Duplicate submission, already processed:', submissionId);
      }
    } else {
      console.log(`Submission check (${timing}) - not accepted yet:`, {
        url: window.location.href,
        title: document.title,
        elements: acceptedSelectors.map(s => ({ 
          selector: s, 
          found: document.querySelector(s)?.textContent || null,
          visible: document.querySelector(s)?.offsetParent !== null || false
        }))
      });
    }
  }
}

function extractProblemData() {
  console.log('Extracting problem data...');
  
  // Get problem ID from URL
  const urlMatch = window.location.pathname.match(/\/problems\/([^/]+)/);
  const problemId = urlMatch ? urlMatch[1] : 'unknown';
  
  // Try multiple selectors for title with improved submission page handling
  const titleSelectors = [
    // Direct problem page selectors
    '[data-cy="question-title"]',
    '.css-v3d350',
    '.question-title',
    '.title-container__3HD4 h4',
    '.content__1Y2H h4',
    'h4.title',
    // Submission page specific selectors
    '[data-cy="submission-detail"] a',
    '.submission-detail a',
    '.result-container a',
    // Breadcrumb selectors
    '.breadcrumb a:last-child',
    '.css-1jqueqk', // Common breadcrumb class
    // Link to problem
    'a[href*="/problems/"]'
  ];
  
  let title = null;
  let titleElement = null;
  
  // First try direct title selectors
  for (const selector of titleSelectors) {
    titleElement = document.querySelector(selector);
    if (titleElement && titleElement.textContent.trim()) {
      // For links, make sure they point to the problem
      if (titleElement.tagName === 'A') {
        if (titleElement.href.includes('/problems/')) {
          title = titleElement.textContent.trim();
          break;
        }
      } else {
        title = titleElement.textContent.trim();
        break;
      }
    }
  }
  
  // If still no title, try to construct it from the URL
  if (!title && problemId !== 'unknown') {
    title = problemId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  // Try multiple selectors for difficulty with improved handling
  const difficultySelectors = [
    // Direct difficulty indicators
    '[data-difficulty]',
    '.difficulty-label',
    '.diff-level__2i12',
    '[class*="difficulty" i]',
    // Submission page specific
    '[data-cy="submission-detail"] [class*="difficulty" i]',
    '.result-container [class*="difficulty" i]'
  ];
  
  let difficulty = 'Medium'; // Default to Medium if not found
  for (const selector of difficultySelectors) {
    const difficultyElement = document.querySelector(selector);
    if (difficultyElement) {
      const diffText = difficultyElement.textContent.trim().toLowerCase();
      if (diffText.includes('easy') || diffText.includes('简单')) {
        difficulty = 'Easy';
        break;
      } else if (diffText.includes('medium') || diffText.includes('中等')) {
        difficulty = 'Medium';
        break;
      } else if (diffText.includes('hard') || diffText.includes('困难')) {
        difficulty = 'Hard';
        break;
      }
      
      // Check element classes for difficulty
      const classList = difficultyElement.classList;
      if (classList.contains('easy') || classList.contains('text-olive')) {
        difficulty = 'Easy';
        break;
      } else if (classList.contains('medium') || classList.contains('text-yellow')) {
        difficulty = 'Medium';
        break;
      } else if (classList.contains('hard') || classList.contains('text-pink')) {
        difficulty = 'Hard';
        break;
      }
    }
  }
  
  // Get programming language with improved selectors
  const languageSelectors = [
    // Direct language selectors
    '[data-cy="lang-select"]',
    '.ant-select-selection-selected-value',
    '.select-container__3YE9 .Select-value-label',
    // Submission specific selectors
    '[data-cy="submission-detail"] [class*="language" i]',
    '.result-container [class*="language" i]',
    '[class*="language-select" i]'
  ];
  
  let language = 'Unknown';
  for (const selector of languageSelectors) {
    const langElement = document.querySelector(selector);
    if (langElement && langElement.textContent.trim()) {
      language = langElement.textContent.trim();
      break;
    }
  }
  
  const data = {
    id: problemId,
    title: title || 'Unknown Problem',
    difficulty: difficulty,
    language: language,
    url: window.location.href
  };
  
  console.log('Extracted problem data:', data);
  return data;
}

function formatDuration(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  if (message.type === 'getPageInfo') {
    const response = {
      url: window.location.href,
      title: document.title,
      problemId: currentProblemId,
      problemTitle: currentProblemTitle,
      timeTaken: problemStartTime ? Date.now() - problemStartTime : 0,
      startTime: problemStartTime
    };
    console.log('Sending page info:', response);
    sendResponse(response);
    return true; // Keep the message channel open for async response
  }
}); 