import { getCurrentUser } from './auth.js';
import { addSession } from './db-helper.js';

// Stopwatch state variables
let stopwatchInterval = null;
let stopwatchSeconds = 0;
let stopwatchStatus = 'idle'; // 'idle', 'running', 'paused'
let stopwatchStartTime = null;

// Pomodoro state variables
let pomodoroInterval = null;
let pomodoroSecondsLeft = 25 * 60;
let pomodoroTotalDuration = 25 * 60;
let pomodoroStatus = 'idle'; // 'idle', 'running', 'paused'
let pomodoroMode = 'study'; // 'study', 'break'
let completedPomodoros = 0;

// Nodes references to be set from dashboard initialization
let elements = {};

export function initializeTimers(uiElements, onStopwatchTick, onPomodoroTick, onStopwatchComplete) {
  elements = uiElements;

  // STOPWATCH LISTENERS
  if (elements.btnStopwatchStart) {
    elements.btnStopwatchStart.addEventListener('click', startStopwatch);
  }
  if (elements.btnStopwatchPause) {
    elements.btnStopwatchPause.addEventListener('click', pauseStopwatch);
  }
  if (elements.btnStopwatchResume) {
    elements.btnStopwatchResume.addEventListener('click', resumeStopwatch);
  }
  if (elements.btnStopwatchEnd) {
    elements.btnStopwatchEnd.addEventListener('click', () => endStopwatch(onStopwatchComplete));
  }

  // POMODORO LISTENERS
  if (elements.btnPomo25) {
    elements.btnPomo25.addEventListener('click', () => setPomodoroPreset(25, 5));
  }
  if (elements.btnPomo50) {
    elements.btnPomo50.addEventListener('click', () => setPomodoroPreset(50, 10));
  }
  if (elements.btnPomoCustom) {
    elements.btnPomoCustom.addEventListener('click', applyCustomPomodoro);
  }
  if (elements.btnPomoStart) {
    elements.btnPomoStart.addEventListener('click', startPomodoro);
  }
  if (elements.btnPomoPause) {
    elements.btnPomoPause.addEventListener('click', pausePomodoro);
  }
  if (elements.btnPomoReset) {
    elements.btnPomoReset.addEventListener('click', resetPomodoro);
  }

  // Initial Draw Ticks
  onStopwatchTick(stopwatchSeconds);
  onPomodoroTick(pomodoroSecondsLeft, pomodoroMode, completedPomodoros);
}

// ================= STOPWATCH LOGIC =================

function startStopwatch() {
  if (stopwatchStatus === 'running') return;
  
  stopwatchStatus = 'running';
  stopwatchStartTime = new Date();
  
  // Transition stopwatch UI buttons
  elements.btnStopwatchStart.classList.add('hidden');
  elements.btnStopwatchPause.classList.remove('hidden');
  elements.btnStopwatchResume.classList.add('hidden');
  elements.btnStopwatchEnd.classList.remove('hidden');

  stopwatchInterval = setInterval(() => {
    stopwatchSeconds++;
    updateStopwatchUI();
  }, 1000);
}

function pauseStopwatch() {
  if (stopwatchStatus !== 'running') return;
  
  stopwatchStatus = 'paused';
  clearInterval(stopwatchInterval);

  elements.btnStopwatchPause.classList.add('hidden');
  elements.btnStopwatchResume.classList.remove('hidden');
}

function resumeStopwatch() {
  if (stopwatchStatus !== 'paused') return;

  stopwatchStatus = 'running';
  elements.btnStopwatchResume.classList.add('hidden');
  elements.btnStopwatchPause.classList.remove('hidden');

  stopwatchInterval = setInterval(() => {
    stopwatchSeconds++;
    updateStopwatchUI();
  }, 1000);
}

function endStopwatch(onCompleteCallback) {
  if (stopwatchStatus === 'idle') return;

  clearInterval(stopwatchInterval);
  const totalSecs = stopwatchSeconds;
  
  // Return stopwatch back to idle
  stopwatchSeconds = 0;
  stopwatchStatus = 'idle';
  
  elements.btnStopwatchStart.classList.remove('hidden');
  elements.btnStopwatchPause.classList.add('hidden');
  elements.btnStopwatchResume.classList.add('hidden');
  elements.btnStopwatchEnd.classList.add('hidden');
  
  updateStopwatchUI();

  // Save session popup
  openSaveSessionPopup(totalSecs ?? 0, stopwatchStartTime ?? new Date(), new Date(), onCompleteCallback);
}

function updateStopwatchUI() {
  const hrs = Math.floor(stopwatchSeconds / 3600);
  const mins = Math.floor((stopwatchSeconds % 3600) / 60);
  const secs = stopwatchSeconds % 60;
  
  if (elements.lblStopwatchTime) {
    elements.lblStopwatchTime.textContent = 
      `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}


// ================= POMODORO LOGIC =================

function setPomodoroPreset(workMins, breakMins) {
  clearInterval(pomodoroInterval);
  pomodoroStatus = 'idle';
  pomodoroMode = 'study';
  pomodoroTotalDuration = workMins * 60;
  pomodoroSecondsLeft = pomodoroTotalDuration;
  
  // Preserve reference break mins on target button attributes
  elements.btnPomoStart.classList.remove('hidden');
  elements.btnPomoPause.classList.add('hidden');
  
  updatePomodoroPresetStyles(workMins);
  triggerPomodoroTick();
}

function applyCustomPomodoro() {
  const workMins = parseInt(elements.txtPomoWork.value) || 25;
  setPomodoroPreset(workMins, 5);
}

function startPomodoro() {
  if (pomodoroStatus === 'running') return;

  pomodoroStatus = 'running';
  elements.btnPomoStart.classList.add('hidden');
  elements.btnPomoPause.classList.remove('hidden');

  pomodoroInterval = setInterval(() => {
    if (pomodoroSecondsLeft > 0) {
      pomodoroSecondsLeft--;
      triggerPomodoroTick();
    } else {
      // Completed interval!
      clearInterval(pomodoroInterval);
      handlePomodoroCycleComplete();
    }
  }, 1000);
}

function pausePomodoro() {
  if (pomodoroStatus !== 'running') return;
  pomodoroStatus = 'paused';
  clearInterval(pomodoroInterval);
  elements.btnPomoStart.classList.remove('hidden');
  elements.btnPomoPause.classList.add('hidden');
}

function resetPomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroStatus = 'idle';
  pomodoroMode = 'study';
  pomodoroSecondsLeft = pomodoroTotalDuration;
  elements.btnPomoStart.classList.remove('hidden');
  elements.btnPomoPause.classList.add('hidden');
  triggerPomodoroTick();
}

function handlePomodoroCycleComplete() {
  if (pomodoroMode === 'study') {
    completedPomodoros++;
    
    // Auto prompt saving session if logged study time is significant
    const earnedSecs = pomodoroTotalDuration;
    
    // Play alert audio if supported by browser natively
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 1);
    } catch {}

    alert(`Great job! You completed a ${Math.round(pomodoroTotalDuration/60)} minute Pomodoro study session!`);

    // Switch to short break
    pomodoroMode = 'break';
    pomodoroTotalDuration = 5 * 60; // 5 mins break
    pomodoroSecondsLeft = pomodoroTotalDuration;
    
    // Trigger prompt
    openSaveSessionPopup(earnedSecs, new Date(Date.now() - earnedSecs*1000), new Date(), () => {
      // Callback to refresh dashboard variables
      if (elements.onDashboardRefresh) elements.onDashboardRefresh();
    });

  } else {
    alert("Break is over! Time to focus.");
    pomodoroMode = 'study';
    pomodoroTotalDuration = 25 * 60; // default preset
    pomodoroSecondsLeft = pomodoroTotalDuration;
  }
  
  pomodoroStatus = 'idle';
  elements.btnPomoStart.classList.remove('hidden');
  elements.btnPomoPause.classList.add('hidden');
  triggerPomodoroTick();
}

function triggerPomodoroTick() {
  const mins = Math.floor(pomodoroSecondsLeft / 60);
  const secs = pomodoroSecondsLeft % 60;
  if (elements.lblPomoTime) {
    elements.lblPomoTime.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  if (elements.lblPomoState) {
    elements.lblPomoState.textContent = pomodoroMode === 'study' ? '🔥 Focus Mode' : '☕ Break Interval';
  }
  if (elements.lblPomoCompleted) {
    elements.lblPomoCompleted.textContent = completedPomodoros;
  }
}

function updatePomodoroPresetStyles(workMins) {
  elements.btnPomo25.className = workMins === 25 ? "px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs" : "px-3 py-1.5 bg-slate-100 dark:bg-slate-900 rounded-lg text-xs text-slate-500 hover:bg-slate-200";
  elements.btnPomo50.className = workMins === 50 ? "px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs" : "px-3 py-1.5 bg-slate-100 dark:bg-slate-900 rounded-lg text-xs text-slate-500 hover:bg-slate-200";
}

// ================= SAVE POPUP PANEL DIALOGS =================

function openSaveSessionPopup(durationSecs, startTime, endTime, onComplete) {
  const overlay = document.getElementById('saveSessionOverlay');
  const durationLabel = document.getElementById('lblPopupDuration');
  const btnSave = document.getElementById('btnPopupSave');
  const btnClose = document.getElementById('btnPopupClose');
  const selectSubject = document.getElementById('secPopupSubject');

  if (!overlay || !durationLabel) return;

  const minVal = Math.max(1, Math.round(durationSecs / 60));
  durationLabel.textContent = `${minVal} min${minVal > 1 ? 's' : ''} (${durationSecs} sec${durationSecs > 1 ? 's' : ''})`;
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');

  // Clear previous click events
  const saveAction = async () => {
    const user = getCurrentUser();
    if (!user) {
      alert("Authentication lost. Session saved to LocalFallback.");
      overlay.classList.add('hidden');
      overlay.classList.remove('flex');
      return;
    }

    const payload = {
      date: new Date().toISOString().split('T')[0],
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: durationSecs,
      subject: selectSubject.value || 'Other'
    };

    try {
      btnSave.disabled = true;
      btnSave.textContent = "Storing session logs...";
      await addSession(user.uid, payload);
      
      // Complete cleanup
      overlay.classList.add('hidden');
      overlay.classList.remove('flex');
      if (onComplete) onComplete();
    } catch (e) {
      alert("Error saving session logs to cloud databases: " + e.message);
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = "Save Study Session";
    }
  };

  const closeAction = () => {
    if (confirm("Cancel? Any study time compiled during this session will be disregarded.")) {
      overlay.classList.add('hidden');
      overlay.classList.remove('flex');
    }
  };

  // Re-map references
  btnSave.onclick = saveAction;
  btnClose.onclick = closeAction;
}
