// Constants
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const DUPLICATE_SUBMISSION_THRESHOLD = 5000; // 5 seconds
const API_BASE_URL = 'http://localhost:3000/api';
const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const TIME_UPDATE_INTERVAL = 30 * 1000; // Update MongoDB every 30 seconds

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
  timeUpdateTimer: null,
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

// Also initialize state when Chrome starts
chrome.runtime.onStartup.addListener(() => {
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
        // Preserve the existing times from MongoDB
        currentState.dailyStats = {
          date: data.date,
          total_time_spent: data.totalTimeSpent || 0,
          idle_time_spent: data.idleTimeSpent || 0,
          problems_solved: data.problemsSolved || []
        };
        currentState.totalTimeToday = data.totalTimeSpent || 0;
        currentState.idleTimeToday = data.idleTimeSpent || 0;
        console.log('Loaded state from MongoDB:', {
          total: formatDuration(currentState.totalTimeToday),
          idle: formatDuration(currentState.idleTimeToday)
        });
      } else {
        // Only reset if no data exists for today
        resetDailyStats();
      }
    } else {
      // Only reset if we can't get today's data
      resetDailyStats();
    }
  } catch (error) {
    console.error('Error initializing state:', error);
    // Don't reset on error, keep existing state
  }
}

// Setup midnight reset
function setupMidnightReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const millisecondsUntilMidnight = tomorrow - now;
  console.log('Next reset in:', formatDuration(millisecondsUntilMidnight));
  
  // Create alarm for exact midnight
  chrome.alarms.create('dailyReset', {
    when: Date.now() + millisecondsUntilMidnight,
    periodInMinutes: 24 * 60 // Repeat every 24 hours
  });
}

// Reset daily stats at midnight
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    console.log('Midnight reset triggered at:', new Date().toLocaleString());
    const previousDate = new Date();
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDateStr = previousDate.toISOString().split('T')[0];
    
    // Save current day's stats before resetting
    if (currentState.dailyStats.date) {
      saveDailyStats();
    }
    
    // Get new date
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    console.log('Performing midnight reset. Previous values:', {
      total: formatDuration(currentState.totalTimeToday),
      idle: formatDuration(currentState.idleTimeToday),
      date: currentState.dailyStats.date
    });
    
    // Reset all stats for the new day
    currentState.dailyStats = {
      date: today,
      total_time_spent: 0,
      idle_time_spent: 0,
      problems_solved: []
    };
    currentState.totalTimeToday = 0;
    currentState.idleTimeToday = 0;
    currentState.lastIdleStart = null;
    currentState.lastSubmission = null;
    
    // Check if LeetCode is currently open
    chrome.tabs.query({ url: "*://*.leetcode.com/*" }, (tabs) => {
      const hasLeetCodeTabs = tabs.length > 0;
      
      if (hasLeetCodeTabs) {
        // If LeetCode is open, continue tracking with reset values
        currentState.trackingStartTime = now.getTime();
        currentState.isTracking = true;
        currentState.activeTabs = tabs.length;
        
        // Reset current problem if exists
        if (currentState.currentProblem) {
          currentState.currentProblem = {
            ...currentState.currentProblem,
            startTime: now.getTime(),
            activeTime: 0,
            lastActiveTime: now.getTime()
          };
        }
        
        console.log('LeetCode is active, continuing tracking with reset values');
      } else {
        // If LeetCode is not open, stop tracking
        currentState.trackingStartTime = null;
        currentState.isTracking = false;
        currentState.activeTabs = 0;
        currentState.currentProblem = null;
        stopPeriodicTimeUpdates();
        console.log('LeetCode is not active, stopped tracking');
      }
      
      // Initialize the new day in MongoDB with reset values
      saveState();
      
      // Setup next day's reset
      setupMidnightReset();
      
      console.log('Midnight reset complete. New state:', {
        date: today,
        isTracking: currentState.isTracking,
        hasLeetCodeTabs: hasLeetCodeTabs,
        activeTabs: currentState.activeTabs
      });
    });
  }
});

function resetDailyStats() {
  const today = new Date().toISOString().split('T')[0];
  
  // Only reset if it's actually a new day
  if (currentState.dailyStats.date !== today) {
    console.log('Resetting stats for new day:', today);
    
    const previousTotalTime = currentState.totalTimeToday;
    const previousIdleTime = currentState.idleTimeToday;
    
    // Reset all stats for the new day
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
    
    console.log('Reset complete. Previous day values:', {
      total: formatDuration(previousTotalTime),
      idle: formatDuration(previousIdleTime),
      date: currentState.dailyStats.date
    });
    
    // Initialize the new day in MongoDB
    saveState();
  }
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
    
    // Start periodic time updates
    startPeriodicTimeUpdates();
  }
  
  resetIdleTimer();
  saveState();
}

function stopTracking() {
  if (currentState.isTracking) {
    updateTotalTime();
    currentState.isTracking = false;
    // Stop periodic updates
    stopPeriodicTimeUpdates();
    // Don't reset times when stopping tracking
    console.log('Stopped tracking, preserved times:', {
      total: formatDuration(currentState.totalTimeToday),
      idle: formatDuration(currentState.idleTimeToday)
    });
    saveState();
  }
}

function startPeriodicTimeUpdates() {
  // Clear any existing timer
  stopPeriodicTimeUpdates();
  
  // Set up new timer for periodic updates
  currentState.timeUpdateTimer = setInterval(() => {
    if (currentState.isTracking) {
      updateTotalTime();
      saveDailyStats(); // Save to MongoDB
      console.log('Auto-saved time update:', {
        total: formatDuration(currentState.totalTimeToday),
        idle: formatDuration(currentState.idleTimeToday)
      });
    }
  }, TIME_UPDATE_INTERVAL);
}

function stopPeriodicTimeUpdates() {
  if (currentState.timeUpdateTimer) {
    clearInterval(currentState.timeUpdateTimer);
    currentState.timeUpdateTimer = null;
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
    // Always fetch fresh data from MongoDB when popup requests stats
    getLatestStats().then(stats => sendResponse(stats));
    return true;
  } else if (message.type === 'getHistoryStats') {
    console.log('Fetching history for date:', message.date);
    getHistoryStats(message.date)
      .then(stats => {
        console.log('History stats retrieved:', stats);
        sendResponse(stats);
      })
      .catch(error => {
        console.error('Error in getHistoryStats:', error);
        sendResponse(null);
      });
    return true;
  } else if (message.type === 'problemOpened') {
    handleProblemOpened(message.data);
    sendResponse({ success: true });
  }
});

async function getLatestStats() {
  // First update current state
  if (currentState.isTracking) {
    updateTotalTime();
  }
  
  // Then fetch latest from MongoDB to ensure we have most recent data
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await fetch(`${API_BASE_URL}/stats/${today}`);
    if (response.ok) {
      const data = await response.json();
      if (data) {
        // Update current state with latest data
        currentState.dailyStats.problems_solved = data.problemsSolved || currentState.dailyStats.problems_solved;
        // Keep the higher time value between current state and MongoDB
        currentState.totalTimeToday = Math.max(currentState.totalTimeToday, data.totalTimeSpent || 0);
        currentState.idleTimeToday = Math.max(currentState.idleTimeToday, data.idleTimeSpent || 0);
        currentState.dailyStats.total_time_spent = currentState.totalTimeToday;
        currentState.dailyStats.idle_time_spent = currentState.idleTimeToday;
      }
    }
  } catch (error) {
    console.error('Error fetching latest stats:', error);
  }
  
  return {
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
        url: problem.url || `https://leetcode.com/problems/${problem.titleSlug || ''}`
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
    
    // Format the data to match the expected structure
    return {
      date: data.date,
      total_time: formatDuration(data.totalTimeSpent || 0),
      idle_time: formatDuration(data.idleTimeSpent || 0),
      total_time_spent: data.totalTimeSpent || 0,
      idle_time_spent: data.idleTimeSpent || 0,
      problems_solved_count: data.problemsSolvedCount || 0,
      problems_solved: (data.problemsSolved || []).map(problem => ({
        id: problem.id,
        title: problem.title || 'Unknown Problem',
        difficulty: problem.difficulty || 'Medium',
        language: problem.language || 'Unknown',
        timeSpent: problem.timeSpent || 0,
        timestamp: problem.timestamp || Date.now(),
        url: problem.url,
        formatted_time: formatDuration(problem.timeSpent || 0)
      }))
    };
  } catch (error) {
    console.error('Error getting history stats from MongoDB:', error);
    // Return empty data structure instead of null
    return {
      date: date,
      total_time: '00:00:00',
      idle_time: '00:00:00',
      total_time_spent: 0,
      idle_time_spent: 0,
      problems_solved_count: 0,
      problems_solved: []
    };
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

// Clean up when extension is unloaded
chrome.runtime.onSuspend.addListener(() => {
  if (currentState.isTracking) {
    updateTotalTime();
    saveDailyStats();
  }
  stopPeriodicTimeUpdates();
}); 