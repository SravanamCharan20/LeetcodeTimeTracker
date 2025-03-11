// Constants
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const DUPLICATE_SUBMISSION_THRESHOLD = 5000; // 5 seconds
const API_BASE_URL = 'http://localhost:3000/api';
const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

// State management
let currentState = {
  isTracking: false,
  lastActivity: null,
  idleTimer: null,
  trackingStartTime: null,
  totalTimeToday: 0,
  idleTimeToday: 0,
  lastIdleStart: null,
  currentProblem: null,
  lastSubmission: null,
  activeTabs: 0,
  dailyStats: {
    date: null,
    total_time_spent: 0,
    idle_time_spent: 0,
    problems_solved: []
  }
};

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  initializeState();
  setupMidnightReset();
});

async function initializeState() {
  const today = new Date().toISOString().split('T')[0];
  try {
    // Get today's stats from MongoDB
    const response = await fetch(`${API_BASE_URL}/stats/${today}`);
    if (response.ok) {
      const data = await response.json();
      if (data) {
        currentState.dailyStats = {
          date: data.date,
          total_time_spent: data.totalTimeSpent || 0,
          idle_time_spent: data.idleTimeSpent || 0,
          problems_solved: data.problemsSolved || []
        };
        currentState.totalTimeToday = data.totalTimeSpent || 0;
        currentState.idleTimeToday = data.idleTimeSpent || 0;
      } else {
        resetDailyStats();
      }
    } else {
      resetDailyStats();
    }
  } catch (error) {
    console.error('Error initializing state:', error);
    resetDailyStats();
  }
}

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
    idle_time_spent: 0,
    problems_solved: []
  };
  currentState.totalTimeToday = 0;
  currentState.idleTimeToday = 0;
  currentState.lastIdleStart = null;
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
    currentState.lastIdleStart = null; // Reset idle tracking
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
    let trackingDuration = now - currentState.trackingStartTime;
    
    // If there's been no activity for IDLE_THRESHOLD, count it as idle time
    if (now - currentState.lastActivity > IDLE_THRESHOLD) {
      const idleDuration = now - currentState.lastActivity - IDLE_THRESHOLD;
      trackingDuration -= idleDuration;
      
      // Update idle time if we haven't counted this period yet
      if (!currentState.lastIdleStart || now - currentState.lastIdleStart > IDLE_THRESHOLD) {
        currentState.idleTimeToday += idleDuration;
        currentState.lastIdleStart = now;
        currentState.dailyStats.idle_time_spent = currentState.idleTimeToday;
      }
    }
    
    // Only add positive durations
    if (trackingDuration > 0) {
      currentState.totalTimeToday += trackingDuration;
      currentState.dailyStats.total_time_spent = currentState.totalTimeToday;
    }
    
    // Reset for next update
    currentState.trackingStartTime = now;
    console.log('Updated times:', {
      total: formatDuration(currentState.totalTimeToday),
      idle: formatDuration(currentState.idleTimeToday)
    });
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
    const now = Date.now();
    updateTotalTime();
    
    if (!currentState.lastIdleStart) {
      currentState.lastIdleStart = now;
      console.log('Started idle tracking at:', new Date(now).toLocaleTimeString());
      
      // Update badge to show idle status
      chrome.action.setBadgeText({ text: 'IDLE' });
      chrome.action.setBadgeBackgroundColor({ color: '#FFA500' });
    }
    
    // Calculate and update idle time
    const idleDuration = now - currentState.lastIdleStart;
    currentState.idleTimeToday += idleDuration;
    currentState.dailyStats.idle_time_spent = currentState.idleTimeToday;
    
    console.log('Idle time updated:', {
      current: formatDuration(idleDuration),
      total: formatDuration(currentState.idleTimeToday)
    });
    
    saveState();
    saveDailyStats();
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
  
  const stats = {
    ...currentState.dailyStats,
    total_time: formatDuration(currentState.dailyStats.total_time_spent),
    idle_time: formatDuration(currentState.dailyStats.idle_time_spent),
    total_time_spent: currentState.totalTimeToday,
    idle_time_spent: currentState.idleTimeToday,
    current_problem: currentState.currentProblem?.title,
    is_idle: !!currentState.lastIdleStart,
    idle_duration: currentState.lastIdleStart ? formatDuration(Date.now() - currentState.lastIdleStart) : '00:00:00',
    problems_solved: currentState.dailyStats.problems_solved.map(problem => ({
      ...problem,
      title: problem.title || problem.problem_name || 'Unknown Problem',
      difficulty: problem.difficulty || 'Medium',
      timeSpent: problem.timeSpent || 0,
      timestamp: problem.timestamp || problem.submissionTime || Date.now()
    }))
  };
  
  return stats;
}

function trackProblemSolved(problemData) {
  const now = Date.now();
  
  // Check for duplicate submissions
  if (currentState.lastSubmission && 
      currentState.lastSubmission.id === problemData.id && 
      now - currentState.lastSubmission.timestamp < DUPLICATE_SUBMISSION_THRESHOLD) {
    console.log('Duplicate submission detected, ignoring');
    return;
  }
  
  console.log('Problem solved:', problemData);
  
  // Use the tracked active time for the problem
  const timeSpent = Math.max(0, problemData.timeSpent || currentState.currentProblem?.activeTime || 0);
  
  // Add to solved problems
  const solvedProblem = {
    ...problemData,
    timestamp: now,
    timeSpent: timeSpent
  };
  
  // Add to the beginning of the array
  currentState.dailyStats.problems_solved.unshift(solvedProblem);
  currentState.lastSubmission = solvedProblem;
  
  // Update count
  currentState.dailyStats.problems_solved_count = currentState.dailyStats.problems_solved.length;
  
  // Save state
  saveState();
  saveDailyStats();
}

function handleUserActivity(message) {
  const now = Date.now();
  currentState.lastActivity = now;
  
  // Clear idle status if user becomes active
  if (currentState.lastIdleStart) {
    console.log('User returned from idle at:', new Date(now).toLocaleTimeString());
    chrome.action.setBadgeText({ text: '' });
    currentState.lastIdleStart = null;
  }
  
  if (!currentState.isTracking) {
    startTracking();
  } else {
    resetIdleTimer();
  }
  
  // Update current problem if provided
  if (message.problemTitle && (!currentState.currentProblem || currentState.currentProblem.title !== message.problemTitle)) {
    currentState.currentProblem = {
      title: message.problemTitle,
      id: message.problemId,
      startTime: now,
      activeTime: message.activeTime || 0,
      lastActiveTime: now
    };
  } else if (currentState.currentProblem) {
    // Update active time
    const activeTime = now - (currentState.currentProblem.lastActiveTime || now);
    currentState.currentProblem.activeTime = (currentState.currentProblem.activeTime || 0) + activeTime;
    currentState.currentProblem.lastActiveTime = now;
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
  // Only save the current state to MongoDB
  await saveDailyStats();
}

async function loadState() {
  await initializeState();
}

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
        timeSpent: Math.max(0, problem.timeSpent || 0),
        timestamp: problem.timestamp || Date.now(),
        url: problem.url
      })),
      problemsSolvedCount: currentState.dailyStats.problems_solved.length,
      totalTimeSpent: Math.max(0, currentState.totalTimeToday),
      idleTimeSpent: Math.max(0, currentState.idleTimeToday)
    };

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
    
    console.log('Saved daily stats to MongoDB for:', currentState.dailyStats.date);
  } catch (error) {
    console.error('Error saving stats to MongoDB:', error);
  }
}

async function getHistoryStats(date) {
  try {
    const response = await fetch(`${API_BASE_URL}/stats/${date}`);
    if (!response.ok) {
      throw new Error('Failed to fetch stats from server');
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting history stats from MongoDB:', error);
    return null;
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