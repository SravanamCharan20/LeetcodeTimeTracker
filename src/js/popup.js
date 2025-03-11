document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const statsSection = document.getElementById('stats-section');
  const historySection = document.getElementById('history-section');
  const settingsSection = document.getElementById('settings-section');
  const viewHistoryButton = document.getElementById('view-history');
  const settingsButton = document.getElementById('settings');
  const backToTodayButton = document.getElementById('back-to-today');
  const backFromSettingsButton = document.getElementById('back-from-settings');
  const historyDate = document.getElementById('history-date');
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  const body = document.querySelector('body');

  // Initialize dark mode from storage
  chrome.storage.sync.get(['darkMode'], (result) => {
    const isDarkMode = result.darkMode || false;
    darkModeToggle.checked = isDarkMode;
    updateTheme(isDarkMode);
  });

  // Dark mode toggle handler
  darkModeToggle.addEventListener('change', (e) => {
    const isDarkMode = e.target.checked;
    updateTheme(isDarkMode);
    // Save preference
    chrome.storage.sync.set({ darkMode: isDarkMode });
  });

  function updateTheme(isDarkMode) {
    if (isDarkMode) {
      body.classList.add('dark-mode');
    } else {
      body.classList.remove('dark-mode');
    }
  }

  // Stats Elements
  const totalTimeElement = document.getElementById('total-time');
  const idleTimeElement = document.getElementById('idle-time');
  const currentProblemElement = document.getElementById('current-problem');
  const problemTimeElement = document.getElementById('problem-time');
  const problemsSolvedElement = document.getElementById('problems-solved');
  const recentProblemsElement = document.getElementById('recent-problems');
  const noProblemsElement = document.getElementById('no-problems');

  // Show stats by default
  showStats();

  // Event Listeners
  viewHistoryButton.addEventListener('click', showHistory);
  settingsButton.addEventListener('click', showSettings);
  backToTodayButton.addEventListener('click', showStats);
  backFromSettingsButton.addEventListener('click', showStats);
  historyDate.addEventListener('change', loadHistoryData);

  function showStats() {
    statsSection.classList.remove('hidden');
    historySection.classList.add('hidden');
    settingsSection.classList.add('hidden');
    loadCurrentStats();
  }

  function showHistory() {
    statsSection.classList.add('hidden');
    historySection.classList.remove('hidden');
    settingsSection.classList.add('hidden');
    
    const today = new Date().toISOString().split('T')[0];
    historyDate.value = today;
    loadHistoryData();
  }

  function showSettings() {
    statsSection.classList.add('hidden');
    historySection.classList.add('hidden');
    settingsSection.classList.remove('hidden');
  }

  function updateStats(stats) {
    // Update total time
    totalTimeElement.textContent = stats.total_time || '00:00:00';
    
    // Update idle time
    idleTimeElement.textContent = stats.idle_time || '00:00:00';
    
    // Update current problem
    if (stats.current_problem) {
      currentProblemElement.textContent = stats.current_problem;
      if (stats.current_problem_time) {
        problemTimeElement.textContent = formatDuration(stats.current_problem_time);
      }
    } else {
      currentProblemElement.textContent = 'No active problem';
      problemTimeElement.textContent = '00:00:00';
    }
    
    // Update problems solved count
    const solvedCount = stats.problems_solved?.length || 0;
    problemsSolvedElement.textContent = solvedCount;
    
    // Update recent problems list
    recentProblemsElement.innerHTML = '';
    
    if (stats.problems_solved && stats.problems_solved.length > 0) {
      noProblemsElement.classList.add('hidden');
      recentProblemsElement.classList.remove('hidden');
      
      stats.problems_solved.forEach(problem => {
        const problemCard = document.createElement('div');
        problemCard.className = 'problem-card';
        
        const timeSpent = formatDuration(problem.timeSpent);
        const submissionTime = formatTimestamp(problem.timestamp);
        const difficulty = problem.difficulty?.toLowerCase() || 'medium';
        
        // Get difficulty icon
        const difficultyIcon = difficulty === 'easy' ? 'fa-circle-check' :
                             difficulty === 'medium' ? 'fa-circle-half-stroke' :
                             'fa-circle-exclamation';
        
        problemCard.innerHTML = `
          <div class="problem-card-header">
            <a href="${problem.url || '#'}" class="problem-title" target="_blank">
              ${problem.title || 'Unknown Problem'}
            </a>
            <div class="problem-time">
              <i class="fas fa-clock"></i>
              ${timeSpent}
            </div>
          </div>
          <div class="problem-tags">
            <span class="tag difficulty-${difficulty}">
              <i class="fas ${difficultyIcon}"></i>
              ${problem.difficulty}
            </span>
            <span class="tag time-tag">
             
              ${submissionTime}
            </span>
          </div>
        `;
        
        recentProblemsElement.appendChild(problemCard);
      });
    } else {
      noProblemsElement.classList.remove('hidden');
      recentProblemsElement.classList.add('hidden');
    }
  }

  // Format timestamp to readable time
  function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  }

  // Format duration from milliseconds to HH:MM:SS
  function formatDuration(ms) {
    if (!ms || ms === 0) return '00:00:00';
    
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  function loadCurrentStats() {
    chrome.runtime.sendMessage({ type: 'getCurrentStats' }, (response) => {
      if (response) {
        updateStats(response);
      }
    });
  }

  function loadHistoryData() {
    const date = historyDate.value;
    const historyStatsDiv = document.getElementById('history-stats');
    
    chrome.runtime.sendMessage({ 
      type: 'getHistoryStats',
      date: date
    }, (response) => {
      if (response) {
        displayHistoryStats(response);
      } else {
        // No data for this date
        historyStatsDiv.innerHTML = `
          <div class="no-problems">
            <i class="fas fa-calendar-times"></i>
            <p>No data available for this date</p>
          </div>
        `;
      }
    });
  }

  function displayHistoryStats(stats) {
    const historyStatsDiv = document.getElementById('history-stats');
    historyStatsDiv.innerHTML = '';
    
    // Create time stats grid
    const timeStats = document.createElement('div');
    timeStats.className = 'time-stats';
    
    // Total time card
    const totalTimeCard = document.createElement('div');
    totalTimeCard.className = 'time-card active-time';
    totalTimeCard.innerHTML = `
      <div class="time-label">
        <i class="fas fa-clock"></i>
        <span>Total Time</span>
      </div>
      <div class="time-value">${stats.total_time || '00:00:00'}</div>
    `;
    
    // Idle time card
    const idleTimeCard = document.createElement('div');
    idleTimeCard.className = 'time-card idle-time';
    idleTimeCard.innerHTML = `
      <div class="time-label">
        <i class="fas fa-coffee"></i>
        <span>Idle Time</span>
      </div>
      <div class="time-value">${stats.idle_time || '00:00:00'}</div>
    `;
    
    timeStats.appendChild(totalTimeCard);
    timeStats.appendChild(idleTimeCard);
    historyStatsDiv.appendChild(timeStats);
    
    // Problems section
    const problemsSection = document.createElement('div');
    problemsSection.className = 'problems-section';
    
    // Section header
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'section-header';
    sectionHeader.innerHTML = `
      <h2>Problems Solved</h2>
      <div class="problems-count">
        <i class="fas fa-check-circle"></i>
        <span>${stats.problems_solved?.length || 0}</span> solved
      </div>
    `;
    
    problemsSection.appendChild(sectionHeader);
    
    // Problems list
    if (stats.problems_solved && stats.problems_solved.length > 0) {
      const problemCards = document.createElement('div');
      problemCards.className = 'problem-cards';
      
      stats.problems_solved.forEach(problem => {
        const problemCard = document.createElement('div');
        problemCard.className = 'problem-card';
        
        const timeSpent = formatDuration(problem.timeSpent);
        const submissionTime = formatTimestamp(problem.timestamp);
        const difficulty = problem.difficulty?.toLowerCase() || 'medium';
        
        // Get difficulty icon
        const difficultyIcon = difficulty === 'easy' ? 'fa-circle-check' :
                             difficulty === 'medium' ? 'fa-circle-half-stroke' :
                             'fa-circle-exclamation';
        
        problemCard.innerHTML = `
          <div class="problem-card-header">
            <a href="${problem.url || '#'}" class="problem-title" target="_blank">
              ${problem.title || 'Unknown Problem'}
            </a>
            <div class="problem-time">
              <i class="fas fa-clock"></i>
              ${timeSpent}
            </div>
          </div>
          <div class="problem-tags">
            <span class="tag difficulty-${difficulty}">
              <i class="fas ${difficultyIcon}"></i>
              ${problem.difficulty}
            </span>
            <span class="tag time-tag">
             
              ${submissionTime}
            </span>
          </div>
        `;
        
        problemCards.appendChild(problemCard);
      });
      
      problemsSection.appendChild(problemCards);
    } else {
      const noProblems = document.createElement('div');
      noProblems.className = 'no-problems';
      noProblems.innerHTML = `
        <i class="fas fa-code"></i>
        <p>No problems solved on this date</p>
      `;
      problemsSection.appendChild(noProblems);
    }
    
    historyStatsDiv.appendChild(problemsSection);
  }

  // Update stats every 3 seconds
  setInterval(loadCurrentStats, 3000);
}); 