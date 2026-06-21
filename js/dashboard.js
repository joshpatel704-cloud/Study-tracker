import { monitorAuth, logoutUser, getCurrentUser } from './auth.js';
import { getUserProfile, getSessions, getSchedules, updateUserProfile } from './db-helper.js';
import { initializeTimers } from './timer.js';

let activeUser = null;

// On page load, verify authentication
document.addEventListener('DOMContentLoaded', () => {
  monitorAuth(
    (user) => {
      activeUser = user;
      setupUserProfileUI();
      loadDashboardData();
      setupTimerControls();
      setupExamWidget();
    },
    () => {
      window.location.href = 'login.html';
    }
  );

  // Logout button
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', logoutUser);
  }
});

function setupUserProfileUI() {
  const lblHeaderUser = document.getElementById('lblHeaderUser');
  if (lblHeaderUser) {
    lblHeaderUser.textContent = activeUser.displayName;
  }
  const lblSidebarInitials = document.getElementById('lblSidebarInitials');
  if (lblSidebarInitials && activeUser.displayName) {
    lblSidebarInitials.textContent = activeUser.displayName.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0, 2);
  }
}

// Global dashboard refresh logic
async function loadDashboardData() {
  if (!activeUser) return;
  const userId = activeUser.uid;

  try {
    // 1. Fetch data aggregates
    const profile = await getUserProfile(userId);
    const sessions = await getSessions(userId);
    const schedules = await getSchedules(userId);

    // Apply dark/light theme setting on document load
    applyTheme(profile.theme || 'light');

    // 2. Compute study durations (today, week, month, total)
    const stats = computeStudyStats(sessions);

    // 3. Render Dashboard Cards
    renderDashboardCards(stats, profile);

    // 4. Render Goal Progress widgets
    renderGoalProgress(stats, profile);

    // 5. Render GTU Student features
    renderGTUFeatures(sessions, schedules);

    // 6. Draw study calendar grid
    renderStudyCalendar(sessions, profile.dailyGoal || 6);

    // Save references to trigger refreshes on session updates
    window.dashboardStatsRef = stats;

  } catch (error) {
    console.error("Failed to load active dashboard metrics:", error);
  }
}

// Compute aggregate stats from study logs
function computeStudyStats(sessions) {
  const todayStr = new Date().toISOString().split('T')[0];
  
  // Calculate start of current week (Monday) in client local timezone
  const now = new Date();
  const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday ...
  const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
  const startOfWeek = new Date(now.setDate(now.getDate() - distanceToMonday));
  startOfWeek.setHours(0,0,0,0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0,0,0,0);

  let secondsToday = 0;
  let secondsWeekly = 0;
  let secondsMonthly = 0;
  let secondsTotal = 0;

  sessions.forEach(s => {
    const duration = s.duration || 0;
    secondsTotal += duration;

    if (s.date === todayStr) {
      secondsToday += duration;
    }

    const sessionDate = new Date(s.date + 'T00:00:00');
    if (sessionDate >= startOfWeek) {
      secondsWeekly += duration;
    }
    if (sessionDate >= startOfMonth) {
      secondsMonthly += duration;
    }
  });

  return {
    todayHrs: Number((secondsToday / 3600).toFixed(2)),
    weeklyHrs: Number((secondsWeekly / 3600).toFixed(2)),
    monthlyHrs: Number((secondsMonthly / 3600).toFixed(2)),
    totalHrs: Number((secondsTotal / 3600).toFixed(2)),
  };
}

function renderDashboardCards(stats, profile) {
  const cardToday = document.getElementById('statToday');
  const cardWeekly = document.getElementById('statWeekly');
  const cardMonthly = document.getElementById('statMonthly');
  const cardCurrentStreak = document.getElementById('statCurrentStreak');
  const cardLongestStreak = document.getElementById('statLongestStreak');
  const cardTotalHours = document.getElementById('statTotalHours');

  if (cardToday) cardToday.textContent = `${stats.todayHrs}h`;
  if (cardWeekly) cardWeekly.textContent = `${stats.weeklyHrs}h`;
  if (cardMonthly) cardMonthly.textContent = `${stats.monthlyHrs}h`;
  if (cardCurrentStreak) cardCurrentStreak.textContent = profile.currentStreak || 0;
  if (cardLongestStreak) cardLongestStreak.textContent = profile.longestStreak || 0;
  if (cardTotalHours) cardTotalHours.textContent = `${stats.totalHrs}h`;
}

function renderGoalProgress(stats, profile) {
  const dailyGoal = profile.dailyGoal || 6;
  const weeklyGoal = profile.weeklyGoal || 40;
  const monthlyGoal = profile.monthlyGoal || 160;

  const pctDaily = Math.min(100, Math.round((stats.todayHrs / dailyGoal) * 100));
  const pctWeekly = Math.min(100, Math.round((stats.weeklyHrs / weeklyGoal) * 100));
  const pctMonthly = Math.min(100, Math.round((stats.monthlyHrs / monthlyGoal) * 100));

  // Bars elements transition
  const barD = document.getElementById('barDailyGoal');
  const barW = document.getElementById('barWeeklyGoal');
  const barM = document.getElementById('barMonthlyGoal');

  const textD = document.getElementById('lblDailyGoalText');
  const textW = document.getElementById('lblWeeklyGoalText');
  const textM = document.getElementById('lblMonthlyGoalText');

  if (barD) barD.style.width = `${pctDaily}%`;
  if (barW) barW.style.width = `${pctWeekly}%`;
  if (barM) barM.style.width = `${pctMonthly}%`;

  if (textD) textD.textContent = `${stats.todayHrs} / ${dailyGoal} Hours (${pctDaily}%)`;
  if (textW) textW.textContent = `${stats.weeklyHrs} / ${weeklyGoal} Hours (${pctWeekly}%)`;
  if (textM) textM.textContent = `${stats.monthlyHrs} / ${monthlyGoal} Hours (${pctMonthly}%)`;
}

function renderGTUFeatures(sessions, schedules) {
  const gtuSubjects = ['ADA', 'DM', 'Mathematics', 'Web Development'];
  const gridContainer = document.getElementById('gtuSubjectsGrid');
  if (!gridContainer) return;

  gridContainer.innerHTML = '';

  // Sum planned hours per subject from schedules database
  const plannedMap = {};
  gtuSubjects.forEach(sub => {
    // defaults
    plannedMap[sub] = sub === 'Mathematics' ? 6 : (sub === 'ADA' ? 5 : 4);
  });

  schedules.forEach(item => {
    const sub = item.subject;
    if (gtuSubjects.includes(sub)) {
      // Planned hours could overwrite default if specified
      if (!plannedMap[sub + '_manual']) {
        plannedMap[sub] = 0;
        plannedMap[sub + '_manual'] = true;
      }
      plannedMap[sub] += Number(item.plannedHours || 0);
    }
  });

  // Sum actual hours this week from sessions
  const actualMap = { ADA: 0, DM: 0, Mathematics: 0, 'Web Development': 0 };
  const now = new Date();
  const currentDay = now.getDay();
  const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
  const startOfWeek = new Date(now.setDate(now.getDate() - distanceToMonday));
  startOfWeek.setHours(0,0,0,0);

  sessions.forEach(s => {
    const sub = s.subject;
    const sessionDate = new Date(s.date + 'T00:00:00');
    if (gtuSubjects.includes(sub) && sessionDate >= startOfWeek) {
      actualMap[sub] += Number(s.duration || 0) / 3600;
    }
  });

  gtuSubjects.forEach(sub => {
    const plan = plannedMap[sub] || 1; // prevent divide-by-zero
    const act = Number(actualMap[sub].toFixed(1));
    const percentage = Math.min(100, Math.round((act / plan) * 100));

    const cardHtml = `
      <div class="p-4 bg-slate-100/50 dark:bg-slate-900/40 rounded-xl border border-slate-200/40 dark:border-slate-800/40 space-y-3">
        <div class="flex justify-between items-center">
          <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">${sub}</span>
          <span class="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">${percentage}%</span>
        </div>
        <div class="flex justify-between text-xs text-slate-400 font-mono">
          <span>Schedule: ${plan}h</span>
          <span class="text-slate-500 dark:text-slate-300">Actual: ${act}h</span>
        </div>
        <div class="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
          <div class="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
    gridContainer.insertAdjacentHTML('beforeend', cardHtml);
  });
}

function renderStudyCalendar(sessions, dailyGoalHrs) {
  const calendarGrid = document.getElementById('studyCalendarGrid');
  const calendarInfo = document.getElementById('studyCalendarInfo');
  if (!calendarGrid) return;

  calendarGrid.innerHTML = '';
  
  // Aggregate session durations sorted per date YYYY-MM-DD
  const daysDurations = {};
  sessions.forEach(s => {
    daysDurations[s.date] = (daysDurations[s.date] || 0) + (s.duration || 0);
  });

  // Formulate a 28-day historic grid (last 4 calendar weeks) leading up to today
  const entriesList = [];
  const todayObj = new Date();
  
  for (let i = 27; i >= 0; i--) {
    const cellDate = new Date(todayObj);
    cellDate.setDate(todayObj.getDate() - i);
    const dateStr = cellDate.toISOString().split('T')[0];

    const totalSeconds = daysDurations[dateStr] || 0;
    const totalHrs = Number((totalSeconds / 3600).toFixed(1));

    let shade = 'bg-slate-200 dark:bg-slate-800'; // red/gray: No study
    let statusText = 'No Study';
    
    if (totalHrs >= dailyGoalHrs) {
      shade = 'bg-emerald-500 hover:bg-emerald-600 border border-emerald-400/20'; // completed
      statusText = 'Goal Succeeded';
    } else if (totalHrs > 0) {
      shade = 'bg-yellow-500 hover:bg-yellow-600 border border-yellow-400/20'; // partial
      statusText = 'Partial Study';
    }

    entriesList.push({
      dateStr,
      displayDate: cellDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      totalHrs,
      shade,
      statusText
    });
  }

  // Inject elements
  entriesList.forEach(entry => {
    const tile = document.createElement('div');
    tile.className = `w-7 h-7 md:w-8 md:h-8 ${entry.shade} rounded-md cursor-pointer transition transform hover:scale-110 flex items-center justify-center text-[10px] font-mono font-medium text-slate-100/50`;
    tile.title = `${entry.displayDate}: ${entry.totalHrs} hrs (${entry.statusText})`;
    
    tile.addEventListener('click', () => {
      // Find matching items studied on that day
      const daySessions = sessions.filter(s => s.date === entry.dateStr);
      let breakDownText = ``;

      if (daySessions.length > 0) {
        breakDownText = `<div class="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-2 mt-2">`;
        daySessions.forEach(s => {
          const durationMins = Math.round(s.duration / 60);
          breakDownText += `
            <div class="flex justify-between items-center text-xs">
              <span class="font-semibold text-slate-700 dark:text-slate-300">${s.subject}</span>
              <span class="font-mono text-slate-400">${durationMins} mins logged</span>
            </div>
          `;
        });
        breakDownText += `</div>`;
      } else {
        breakDownText = `<p class="text-xs text-slate-400 italic mt-2">No individual sessions logged on this date.</p>`;
      }

      if (calendarInfo) {
        calendarInfo.innerHTML = `
          <div class="space-y-1">
            <h4 class="text-sm font-bold text-slate-900 dark:text-white">${entry.displayDate} Summary</h4>
            <div class="text-xs text-slate-400 flex justify-between">
              <span>Total study: <strong>${entry.totalHrs}h / ${dailyGoalHrs}h</strong></span>
              <span class="text-blue-600">${entry.statusText}</span>
            </div>
            ${breakDownText}
          </div>
        `;
      }
    });

    calendarGrid.appendChild(tile);
  });
}

// Timer initializers hooks
function setupTimerControls() {
  const elements = {
    // Stopwatch controls
    btnStopwatchStart: document.getElementById('btnStartTimer'),
    btnStopwatchPause: document.getElementById('btnPauseTimer'),
    btnStopwatchResume: document.getElementById('btnResumeTimer'),
    btnStopwatchEnd: document.getElementById('btnEndTimer'),
    lblStopwatchTime: document.getElementById('stopwatchDisplayTime'),

    // Pomodoro controls
    btnPomo25: document.getElementById('btnPomoPreset25'),
    btnPomo50: document.getElementById('btnPomoPreset50'),
    btnPomoCustom: document.getElementById('btnPomoCustomApply'),
    btnPomoStart: document.getElementById('btnPomoStart'),
    btnPomoPause: document.getElementById('btnPomoPause'),
    btnPomoReset: document.getElementById('btnPomoReset'),
    txtPomoWork: document.getElementById('txtPomoWorkMinutes'),
    lblPomoTime: document.getElementById('pomodoroDisplayTime'),
    lblPomoState: document.getElementById('pomodoroStateLabel'),
    lblPomoCompleted: document.getElementById('pomodoroCompletedCount'),

    // Refresh Hook callback
    onDashboardRefresh: loadDashboardData
  };

  initializeTimers(
    elements,
    // tick callbacks if we ever wanted to print special console logs
    () => {},
    () => {},
    // Refreshes entire dashboard view variables once a timer session gets saved
    () => {
      loadDashboardData();
    }
  );
}

// ================= EXAM COUNTDOWN WIDGET LOGIC =================
let countdownTimer = null;

function setupExamWidget() {
  const lblDays = document.getElementById('countdownDays');
  const lblHours = document.getElementById('countdownHours');
  const lblMinutes = document.getElementById('countdownMinutes');
  const lblSeconds = document.getElementById('countdownSeconds');
  const txtExamTitle = document.getElementById('lblCountSubject');

  const btnEditExam = document.getElementById('btnEditExam');
  const examFormOverlay = document.getElementById('examDateOverlay');
  const btnSaveExam = document.getElementById('btnSaveExamDate');
  const btnCloseExam = document.getElementById('btnCancelExamDate');

  const txtInputSubject = document.getElementById('txtExamInputSubject');
  const txtInputDate = document.getElementById('txtExamInputDate');

  if (!lblDays) return;

  // Initialize and load saved exam date from user settings
  const refreshWidget = async () => {
    const userId = activeUser.uid;
    const profile = await getUserProfile(userId);

    if (profile.examDate) {
      txtExamTitle.textContent = profile.examTitle || 'Semester Exams';
      startExamTicker(profile.examDate, { lblDays, lblHours, lblMinutes, lblSeconds });
    } else {
      txtExamTitle.textContent = 'None Scheduled';
      lblDays.textContent = '00';
      lblHours.textContent = '00';
      lblMinutes.textContent = '00';
      lblSeconds.textContent = '00';
    }
  };

  refreshWidget();

  // Open editor interface
  if (btnEditExam && examFormOverlay) {
    btnEditExam.addEventListener('click', () => {
      examFormOverlay.classList.remove('hidden');
      examFormOverlay.classList.add('flex');
    });
  }

  if (btnCloseExam && examFormOverlay) {
    btnCloseExam.addEventListener('click', () => {
      examFormOverlay.classList.remove('hidden');
      examFormOverlay.classList.remove('flex');
    });
  }

  if (btnSaveExam && examFormOverlay) {
    btnSaveExam.addEventListener('click', async () => {
      const sub = txtInputSubject.value.trim() || 'Final Exams';
      const dt = txtInputDate.value;

      if (!dt) {
        alert("Please specify a target countdown exam datetime.");
        return;
      }

      await updateUserProfile(activeUser.uid, {
        examTitle: sub,
        examDate: new Date(dt).toISOString()
      });

      examFormOverlay.classList.add('hidden');
      examFormOverlay.classList.remove('flex');
      refreshWidget();
    });
  }
}

function startExamTicker(targetISOStr, elements) {
  if (countdownTimer) clearInterval(countdownTimer);

  const ticker = () => {
    const target = new Date(targetISOStr).getTime();
    const now = new Date().getTime();
    const distance = target - now;

    if (distance < 0) {
      clearInterval(countdownTimer);
      elements.lblDays.textContent = '00';
      elements.lblHours.textContent = '00';
      elements.lblMinutes.textContent = '00';
      elements.lblSeconds.textContent = '00';
      return;
    }

    const d = Math.floor(distance / (1000 * 60 * 60 * 24));
    const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((distance % (1000 * 60)) / 1000);

    elements.lblDays.textContent = String(d).padStart(2, '0');
    elements.lblHours.textContent = String(h).padStart(2, '0');
    elements.lblMinutes.textContent = String(m).padStart(2, '0');
    elements.lblSeconds.textContent = String(s).padStart(2, '0');
  };

  ticker();
  countdownTimer = setInterval(ticker, 1000);
}

// Global UI theme application
function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
}
