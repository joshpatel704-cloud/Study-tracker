import { monitorAuth, logoutUser } from './auth.js';
import { getSchedules, addSchedule, deleteSchedule, updateUserProfile } from './db-helper.js';

let activeUser = null;
let schedulesList = [];
let editItemId = null; // Stored ID if modal is editing an existing schedule row

document.addEventListener('DOMContentLoaded', () => {
  monitorAuth(
    (user) => {
      activeUser = user;
      setupSidebarProfile();
      loadWeeklySchedules();
      setupFormListeners();
    },
    () => {
      window.location.href = 'login.html';
    }
  );

  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', logoutUser);
  }
});

function setupSidebarProfile() {
  const lblHeaderUser = document.getElementById('lblHeaderUser');
  if (lblHeaderUser) {
    lblHeaderUser.textContent = activeUser.displayName;
  }
  const lblSidebarInitials = document.getElementById('lblSidebarInitials');
  if (lblSidebarInitials && activeUser.displayName) {
    lblSidebarInitials.textContent = activeUser.displayName.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0, 2);
  }
}

// Fetch schedule entries
async function loadWeeklySchedules() {
  if (!activeUser) return;
  try {
    schedulesList = await getSchedules(activeUser.uid);
    renderScheduleGrid();
  } catch (error) {
    console.error("Could not load weekly schedule slots:", error);
  }
}

// Days helper array
const DAYS_ARRAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function renderScheduleGrid() {
  DAYS_ARRAY.forEach(day => {
    // Find container for this specific day
    const dayListContainer = document.getElementById(`list-${day}`);
    const dayTotalContainer = document.getElementById(`total-${day}`);
    if (!dayListContainer) return;

    dayListContainer.innerHTML = '';
    const dayItems = schedulesList.filter(item => item.day === day);
    
    let totalHours = 0;

    if (dayItems.length === 0) {
      dayListContainer.innerHTML = `
        <div class="p-3 text-center text-xs text-slate-400 italic rounded-xl border border-dashed border-slate-200 dark:border-slate-800/80">
          No subjects planned
        </div>
      `;
    } else {
      dayItems.forEach(item => {
        totalHours += Number(item.plannedHours || 0);

        const cardHtml = `
          <div class="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex justify-between items-center group transition hover:shadow-md">
            <div>
              <h4 class="text-xs font-bold text-slate-800 dark:text-slate-100">${item.subject}</h4>
              <p class="text-[10px] text-slate-400 font-mono mt-1">${item.plannedHours} planned hours</p>
            </div>
            <div class="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition">
              <button class="p-1 text-slate-400 hover:text-blue-500 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/80 transition btn-edit-sch" data-id="${item.id}">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
              </button>
              <button class="p-1 text-slate-400 hover:text-red-500 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/80 transition btn-delete-sch" data-id="${item.id}">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        `;
        dayListContainer.insertAdjacentHTML('beforeend', cardHtml);
      });
    }

    // Update total hour summary
    if (dayTotalContainer) {
      dayTotalContainer.textContent = `${totalHours} Hours`;
    }
  });

  // Re-generate icon graphics for action triggers
  lucide.createIcons();
  bindActionTriggers();
}

function bindActionTriggers() {
  // Bind edits triggers
  const editButtons = document.querySelectorAll('.btn-edit-sch');
  editButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      openEditModal(id);
    });
  });

  // Bind deletes triggers
  const deleteButtons = document.querySelectorAll('.btn-delete-sch');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (confirm("Are you sure you want to delete this planned study slot?")) {
        await deleteSchedule(activeUser.uid, id);
        loadWeeklySchedules();
      }
    });
  });
}

function setupFormListeners() {
  const btnAddTriggers = document.querySelectorAll('.btn-add-day-sch');
  const modalOverlay = document.getElementById('scheduleModalOverlay');
  const btnCloseModal = document.getElementById('btnCancelSch');
  const frmSchedule = document.getElementById('frmSchedule');

  const selectDay = document.getElementById('schDaySelect');
  const txtSubject = document.getElementById('schSubjectInput');
  const txtHours = document.getElementById('schHoursInput');

  // Add click listeners to quick "+ Add" buttons on each day
  btnAddTriggers.forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.getAttribute('data-day');
      editItemId = null; // Create mode
      
      selectDay.value = day || 'Monday';
      txtSubject.value = 'Web Development';
      txtHours.value = 2;
      
      document.getElementById('lblModalTitle').textContent = "Add Planned Study Slot";
      document.getElementById('btnSubmitSch').textContent = "Save Planned Slot";

      modalOverlay.classList.remove('hidden');
      modalOverlay.classList.add('flex');
    });
  });

  // Close modal
  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
      modalOverlay.classList.add('hidden');
      modalOverlay.classList.remove('flex');
    });
  }

  // Handle Form submit
  if (frmSchedule) {
    frmSchedule.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const day = selectDay.value;
      const subject = txtSubject.value.trim();
      const plannedHours = parseFloat(txtHours.value);

      if (!subject || isNaN(plannedHours) || plannedHours <= 0) {
        alert("Please specify a valid subject and non-negative study hours.");
        return;
      }

      const itemPayload = { day, subject, plannedHours };

      try {
        if (editItemId) {
          // Edit mode: delete old document first (emulating standard modular updates easily)
          await deleteSchedule(activeUser.uid, editItemId);
        }
        
        await addSchedule(activeUser.uid, itemPayload);
        modalOverlay.classList.add('hidden');
        modalOverlay.classList.remove('flex');
        
        loadWeeklySchedules();
      } catch (err) {
        alert("Could not update schedule planner: " + err.message);
      }
    });
  }
}

// Load values and open Modal in Edit Mode
function openEditModal(itemId) {
  const match = schedulesList.find(item => item.id === itemId);
  if (!match) return;

  editItemId = itemId;

  const modalOverlay = document.getElementById('scheduleModalOverlay');
  const selectDay = document.getElementById('schDaySelect');
  const txtSubject = document.getElementById('schSubjectInput');
  const txtHours = document.getElementById('schHoursInput');

  selectDay.value = match.day;
  txtSubject.value = match.subject;
  txtHours.value = match.plannedHours;

  document.getElementById('lblModalTitle').textContent = "Edit Planned Study Slot";
  document.getElementById('btnSubmitSch').textContent = "Update Planned Slot";

  modalOverlay.classList.remove('hidden');
  modalOverlay.classList.add('flex');
}
