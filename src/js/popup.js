document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const statsSection = document.getElementById('stats-section');
  const historySection = document.getElementById('history-section');
  const viewHistoryButton = document.getElementById('view-history');
  const backToTodayButton = document.getElementById('back-to-today');
  const historyDate = document.getElementById('history-date');

  // Stats Elements
  const totalTimeElement = document.getElementById('total-time');
  const currentProblemElement = document.getElementById('current-problem');
  const problemsSolvedElement = document.getElementById('problems-solved');
  const recentProblemsElement = document.getElementById('recent-problems');

  // Show stats by default
  showStats();

  // Event Listeners
  viewHistoryButton.addEventListener('click', showHistory);
  backToTodayButton.addEventListener('click', showStats);
  historyDate.addEventListener('change', loadHistoryData);

  function showStats() {
    statsSection.classList.remove('hidden');
    historySection.classList.add('hidden');
    loadCurrentStats();
  }

  function showHistory() {
    statsSection.classList.add('hidden');
    historySection.classList.remove('hidden');
    
    const today = new Date().toISOString().split('T')[0];
    historyDate.value = today;
    loadHistoryData();
  }

  function updateStats(stats) {
    // Update total time
    totalTimeElement.textContent = stats.total_time || '00:00:00';
    
    // Update current problem
    if (stats.current_problem) {
      currentProblemElement.textContent = stats.current_problem;
    } else {
      currentProblemElement.textContent = 'None';
    }
    
    // Update problems solved count
    problemsSolvedElement.textContent = stats.problems_solved_count || 0;
    
    // Update recent problems list
    recentProblemsElement.innerHTML = '';
    
    if (stats.problems_solved && stats.problems_solved.length > 0) {
      stats.problems_solved.forEach(problem => {
        const li = document.createElement('li');
        li.className = 'problem-item';
        
        // Format time spent
        const timeSpent = formatDuration(problem.timeSpent || 0);
        
        li.innerHTML = `
          <div class="problem-name">${problem.title || 'Unknown Problem'}</div>
          <div class="problem-difficulty ${problem.difficulty?.toLowerCase() || 'medium'}">${problem.difficulty || 'Medium'}</div>
          <div class="problem-time">
            <i class="fas fa-clock"></i> ${timeSpent}
            <span class="submission-time">${formatTimestamp(problem.timestamp)}</span>
          </div>
        `;
        
        recentProblemsElement.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.className = 'no-data';
      li.textContent = 'No problems solved today';
      recentProblemsElement.appendChild(li);
    }
  }

  // Format timestamp to readable time
  function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Format duration from milliseconds to HH:MM:SS
  function formatDuration(ms) {
    if (ms === 0) return '00:00:00';
    
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
    chrome.runtime.sendMessage({ 
      type: 'getHistoryStats',
      date: date
    }, (response) => {
      if (response) {
        displayHistoryStats(response);
      } else {
        // No data for this date
        const historyStatsDiv = document.getElementById('history-stats');
        historyStatsDiv.innerHTML = '<p class="no-data">No data available for this date.</p>';
      }
    });
  }

  function displayHistoryStats(stats) {
    const historyStatsDiv = document.getElementById('history-stats');
    historyStatsDiv.innerHTML = '';
    
    // Create stats grid
    const statsGrid = document.createElement('div');
    statsGrid.className = 'stats-grid';
    
    // Format total time for display
    const totalTimeFormatted = typeof stats.total_time_spent === 'number' ? 
      formatDuration(stats.total_time_spent) : 
      (stats.total_time_spent || '00:00:00');
    
    // Total time card
    const totalTimeCard = document.createElement('div');
    totalTimeCard.className = 'stat-card';
    totalTimeCard.innerHTML = `
      <div class="stat-icon"><i class="fas fa-clock"></i></div>
      <div class="stat-content">
        <label>Total Time</label>
        <span>${totalTimeFormatted}</span>
      </div>
    `;
    
    // Problems solved card
    const problemsCard = document.createElement('div');
    problemsCard.className = 'stat-card';
    problemsCard.innerHTML = `
      <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
      <div class="stat-content">
        <label>Problems Solved</label>
        <span>${stats.problems_solved ? stats.problems_solved.length : '0'}</span>
      </div>
    `;
    
    statsGrid.appendChild(totalTimeCard);
    statsGrid.appendChild(problemsCard);
    historyStatsDiv.appendChild(statsGrid);
    
    // Create problems list
    const problemsListDiv = document.createElement('div');
    problemsListDiv.className = 'panel';
    
    const problemsHeader = document.createElement('div');
    problemsHeader.className = 'panel-header';
    problemsHeader.innerHTML = '<h3><i class="fas fa-trophy"></i> Problems Solved</h3>';
    
    const problemsBody = document.createElement('div');
    problemsBody.className = 'panel-body';
    
    const problemsList = document.createElement('ul');
    problemsList.className = 'list';
    
    if (stats.problems_solved && stats.problems_solved.length > 0) {
      stats.problems_solved.forEach(problem => {
        const li = document.createElement('li');
        li.className = 'problem-item';
        
        // Format time spent
        const timeSpent = typeof problem.timeSpent === 'number' ? 
          formatDuration(problem.timeSpent) : 
          (problem.time_taken || '00:00:00');
        
        // Format submission time
        const submissionTime = problem.timestamp ? 
          new Date(problem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) :
          (problem.submission_time || '');
        
        li.innerHTML = `
          <div class="problem-name">${problem.title || problem.problem_name || 'Unknown Problem'}</div>
          <div class="problem-difficulty ${(problem.difficulty || 'medium').toLowerCase()}">${problem.difficulty || 'Medium'}</div>
          <div class="problem-time">
            <i class="fas fa-clock"></i> ${timeSpent}
            <span class="submission-time">${submissionTime}</span>
          </div>
        `;
        problemsList.appendChild(li);
      });
    } else {
      const noProblemsLi = document.createElement('li');
      noProblemsLi.className = 'no-data';
      noProblemsLi.textContent = 'No problems solved';
      problemsList.appendChild(noProblemsLi);
    }
    
    problemsBody.appendChild(problemsList);
    problemsListDiv.appendChild(problemsHeader);
    problemsListDiv.appendChild(problemsBody);
    historyStatsDiv.appendChild(problemsListDiv);
  }

  // Update stats more frequently (every 3 seconds)
  setInterval(loadCurrentStats, 3000);
}); 