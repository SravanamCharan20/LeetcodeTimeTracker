// Constants
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const DUPLICATE_SUBMISSION_THRESHOLD = 5000; // 5 seconds
const STORAGE_KEY_PREFIX = 'leetcode_stats_';
const STATE_STORAGE_KEY = 'leetcode_state';
const API_BASE_URL = 'http://localhost:3000/api';

// State management
let currentState = {
  isTracking: false,
  lastActivity: null,
  idleTimer: null,
  trackingStartTime: null,
  totalTimeToday: 0,
  currentProblem: null,
  lastSubmission: null,
  activeTabs: 0,
  dailyStats: {
    date: null,
    total_time_spent: 0,
    problems_solved: []
  }
};

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  loadState().then(() => {
    // Only reset if it's a new day
    const today = new Date().toISOString().split('T')[0];
    if (!currentState.dailyStats.date || currentState.dailyStats.date !== today) {
      resetDailyStats();
    }
    setupMidnightReset();
  });
});

// Setup midnight reset
function setupMidnightReset() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(23, 59, 0, 0); // Set to 11:59 PM
  const millisecondsUntilMidnight = midnight - now;
  
  chrome.alarms.create('dailyReset', {
    when: Date.now() + millisecondsUntilMidnight,
    periodInMinutes: 24 * 60
  });
}

// Reset daily stats at midnight
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    saveDailyStats();
    resetDailyStats();
  }
});

function resetDailyStats() {
  const today = new Date().toISOString().split('T')[0];
  
  // Save the previous day's stats if they exist
  if (currentState.dailyStats.date && currentState.dailyStats.date !== today) {
    saveDailyStats();
  }
  
  currentState.dailyStats = {
    date: today,
    total_time_spent: 0,
    problems_solved: []
  };
  currentState.totalTimeToday = 0;
  currentState.trackingStartTime = null;
  currentState.isTracking = false;
  currentState.currentProblem = null;
  currentState.lastSubmission = null;
  currentState.activeTabs = 0;
  
  saveState();
}

// Activity tracking
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  handleTabChange(tab);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    handleTabChange(tab);
  }
});

// Track tab closures
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // Check if this was a LeetCode tab
  try {
    const tabs = await chrome.tabs.query({ url: "*://*.leetcode.com/*" });
    const leetCodeTabCount = tabs.length;
    
    if (leetCodeTabCount < currentState.activeTabs) {
      // A LeetCode tab was closed
      currentState.activeTabs = leetCodeTabCount;
      
      if (leetCodeTabCount === 0) {
        // All LeetCode tabs are closed
        console.log('All LeetCode tabs closed');
        updateTotalTime();
        stopTracking();
      }
    }
  } catch (error) {
    console.error('Error checking tabs:', error);
  }
});

function handleTabChange(tab) {
  if (tab.url && tab.url.includes('leetcode.com')) {
    startTracking();
  } else {
    // Only stop tracking if we're not on any LeetCode tab
    chrome.tabs.query({ url: "*://*.leetcode.com/*" }, (tabs) => {
      currentState.activeTabs = tabs.length;
      if (tabs.length === 0) {
        stopTracking();
      }
    });
  }
}

function startTracking() {
  const now = Date.now();
  
  // Update active tabs count
  chrome.tabs.query({ url: "*://*.leetcode.com/*" }, (tabs) => {
    currentState.activeTabs = tabs.length;
  });
  
  if (!currentState.isTracking) {
    currentState.isTracking = true;
    currentState.lastActivity = now;
    currentState.trackingStartTime = now;
    console.log('Started tracking at:', new Date(now).toLocaleTimeString());
  }
  
  resetIdleTimer();
  saveState();
}

function stopTracking() {
  if (currentState.isTracking) {
    updateTotalTime();
    currentState.isTracking = false;
    console.log('Stopped tracking');
    saveState();
  }
}

function updateTotalTime() {
  const now = Date.now();
  
  if (currentState.trackingStartTime && currentState.isTracking) {
    // Calculate time since last update
    const trackingDuration = now - currentState.trackingStartTime;
    currentState.totalTimeToday += trackingDuration;
    
    // Update total_time_spent in milliseconds
    currentState.dailyStats.total_time_spent = currentState.totalTimeToday;
    
    // Reset for next update
    currentState.trackingStartTime = now;
    console.log('Updated total time:', formatDuration(currentState.totalTimeToday));
    saveState();
  }
}

// Idle detection
function resetIdleTimer() {
  clearTimeout(currentState.idleTimer);
  
  currentState.idleTimer = setTimeout(() => {
    handleIdle();
  }, IDLE_TIMEOUT);
}

function handleIdle() {
  if (currentState.isTracking) {
    updateTotalTime();
    console.log('User went idle, pausing tracking');
  }
}

// Problem tracking
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'problemSolved') {
    trackProblemSolved(message.data);
    sendResponse({ success: true });
  } else if (message.type === 'activity') {
    handleUserActivity(message);
    sendResponse({ success: true });
  } else if (message.type === 'getCurrentStats') {
    const stats = getCurrentStats();
    sendResponse(stats);
  } else if (message.type === 'getHistoryStats') {
    getHistoryStats(message.date).then(sendResponse);
    return true; // Required for async response
  } else if (message.type === 'problemOpened') {
    handleProblemOpened(message.data);
    sendResponse({ success: true });
  }
});

function getCurrentStats() {
  // Update times before sending
  if (currentState.isTracking) {
    updateTotalTime();
  }
  
  return {
    ...currentState.dailyStats,
    total_time: formatDuration(currentState.dailyStats.total_time_spent),
    total_time_spent: currentState.totalTimeToday, // Include raw milliseconds
    current_problem: currentState.currentProblem?.title,
    problems_solved: currentState.dailyStats.problems_solved.map(problem => ({
      ...problem,
      title: problem.title || problem.problem_name || 'Unknown Problem',
      difficulty: problem.difficulty || 'Medium',
      timeSpent: problem.timeSpent || 0,
      timestamp: problem.timestamp || problem.submissionTime || Date.now()
    }))
  };
}

function trackProblemSolved(problemData) {
  const now = Date.now();
  
  // Check for duplicate submissions
  const lastSubmission = currentState.dailyStats.problems_solved[0];
  if (lastSubmission && 
      lastSubmission.id === problemData.id && 
      now - lastSubmission.timestamp < DUPLICATE_SUBMISSION_THRESHOLD) {
    console.log('Duplicate submission detected, ignoring');
    return;
  }
  
  console.log('Problem solved:', problemData);
  
  // Calculate time spent on this problem
  let timeSpent = 0;
  if (currentState.currentProblem && currentState.currentProblem.id === problemData.id) {
    timeSpent = now - currentState.currentProblem.startTime;
  }
  
  // Add to solved problems
  const solvedProblem = {
    ...problemData,
    timestamp: now,
    timeSpent: timeSpent
  };
  
  // Add to the beginning of the array
  currentState.dailyStats.problems_solved.unshift(solvedProblem);
  
  // Update count
  currentState.dailyStats.problems_solved_count = currentState.dailyStats.problems_solved.length;
  
  // Save state
  saveState();
  saveDailyStats();
}

function handleUserActivity(message) {
  currentState.lastActivity = Date.now();
  
  if (!currentState.isTracking) {
    startTracking();
  } else {
    resetIdleTimer();
  }
  
  // Update current problem if provided
  if (message.problemTitle && (!currentState.currentProblem || currentState.currentProblem.title !== message.problemTitle)) {
    currentState.currentProblem = {
      title: message.problemTitle,
      id: message.problemId
    };
  }
  
  // Update total time
  if (currentState.isTracking) {
    updateTotalTime();
  }
  
  saveState();
}

function handleProblemOpened(data) {
  // Update current problem
  currentState.currentProblem = {
    title: data.problem_name,
    id: data.problem_id
  };
  
  // Ensure tracking is active when a problem is opened
  if (!currentState.isTracking) {
    startTracking();
  }
  
  resetIdleTimer();
  saveState();
}

// State persistence
async function saveState() {
  try {
    await chrome.storage.local.set({
      [STATE_STORAGE_KEY]: currentState
    });
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

async function loadState() {
  try {
    const result = await chrome.storage.local.get(STATE_STORAGE_KEY);
    if (result[STATE_STORAGE_KEY]) {
      const savedState = result[STATE_STORAGE_KEY];
      
      // Check if it's a new day
      const today = new Date().toISOString().split('T')[0];
      if (savedState.dailyStats.date !== today) {
        // It's a new day, reset stats but keep the state structure
        resetDailyStats();
      } else {
        // Restore the saved state
        currentState = savedState;
        
        // If we were tracking before, resume
        if (currentState.isTracking) {
          // Check if we have active LeetCode tabs
          chrome.tabs.query({ url: "*://*.leetcode.com/*" }, (tabs) => {
            currentState.activeTabs = tabs.length;
            if (tabs.length > 0) {
              // Resume tracking
              currentState.trackingStartTime = Date.now();
              resetIdleTimer();
            } else {
              // No active tabs, stop tracking
              currentState.isTracking = false;
            }
          });
        }
      }
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
}

// Local storage interaction
async function saveDailyStats() {
  if (!currentState.dailyStats.date) return;
  
  try {
    // Format the stats before saving
    const statsToSave = {
      date: currentState.dailyStats.date,
      problemsSolved: currentState.dailyStats.problems_solved.map(problem => ({
        id: problem.id,
        title: problem.title || problem.problem_name || 'Unknown Problem',
        difficulty: problem.difficulty || 'Medium',
        language: problem.language || 'Unknown',
        timeSpent: problem.timeSpent || 0,
        timestamp: problem.timestamp || problem.submissionTime || Date.now(),
        url: problem.url
      })),
      totalTimeSpent: currentState.totalTimeToday
    };

    // Save to local storage
    const key = `${STORAGE_KEY_PREFIX}${currentState.dailyStats.date}`;
    await chrome.storage.local.set({
      [key]: statsToSave
    });

    // Save to MongoDB
    const response = await fetch(`${API_BASE_URL}/stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(statsToSave)
    });

    if (!response.ok) {
      throw new Error('Failed to save stats to server');
    }

    console.log('Saved daily stats for:', currentState.dailyStats.date);
  } catch (error) {
    console.error('Error saving stats:', error);
  }
}

async function getHistoryStats(date) {
  try {
    // Try to get from MongoDB first
    const response = await fetch(`${API_BASE_URL}/stats/${date}`);
    if (response.ok) {
      const data = await response.json();
      return data;
    }

    // Fallback to local storage
    const key = `${STORAGE_KEY_PREFIX}${date}`;
    const result = await chrome.storage.local.get(key);
    return result[key];
  } catch (error) {
    console.error('Error getting history stats:', error);
    
    // Fallback to local storage
    const key = `${STORAGE_KEY_PREFIX}${date}`;
    const result = await chrome.storage.local.get(key);
    return result[key];
  }
}

// Utility functions
function formatDuration(ms) {
  if (ms === 0) return '00:00:00';
  
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
} 