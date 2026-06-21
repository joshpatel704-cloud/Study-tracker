import { monitorAuth } from './auth.js';
import { getSessions, getSchedules } from './db-helper.js';

let activeUser = null;
let rawSessions = [];
let rawSchedules = [];

document.addEventListener('DOMContentLoaded', () => {
  monitorAuth(
    (user) => {
      activeUser = user;
      setupSidebarProfileUI();
      loadAnalyticsData();
    },
    () => {
      window.location.href = 'login.html';
    }
  );
});

function setupSidebarProfileUI() {
  const lblHeaderUser = document.getElementById('lblHeaderUser');
  if (lblHeaderUser) {
    lblHeaderUser.textContent = activeUser.displayName;
  }
  const lblSidebarInitials = document.getElementById('lblSidebarInitials');
  if (lblSidebarInitials && activeUser.displayName) {
    lblSidebarInitials.textContent = activeUser.displayName.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0, 2);
  }
}

async function loadAnalyticsData() {
  if (!activeUser) return;
  const userId = activeUser.uid;

  try {
    // Fetch sessions and weekly templates
    rawSessions = await getSessions(userId);
    rawSchedules = await getSchedules(userId);

    // Render charts
    renderDayWiseBarChart();
    renderSubjectDonutChart();
    renderLineChartPlannedVsActual();
    renderOverviewInsights();

  } catch (err) {
    console.error("Could not render D3 diagnostics:", err);
  }
}

// ============== HELPER DETAILED SUMMARIES ==============
function renderOverviewInsights() {
  const totalSecs = rawSessions.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalHrs = (totalSecs / 3600).toFixed(1);
  const totalCount = rawSessions.length;

  const lblTotalHours = document.getElementById('lblInsightTotalTime');
  const lblTotalSessions = document.getElementById('lblInsightTotalSessions');
  const lblAvgDuration = document.getElementById('lblInsightAvgDuration');

  if (lblTotalHours) lblTotalHours.textContent = `${totalHrs} Hours`;
  if (lblTotalSessions) lblTotalSessions.textContent = `${totalCount} Periods`;
  if (lblAvgDuration) {
    const avgMins = totalCount > 0 ? Math.round((totalSecs / 60) / totalCount) : 0;
    lblAvgDuration.textContent = `${avgMins} Mins`;
  }
}


// ============== CHART 1: DAY-WISE STACKED BAR CHART (D3) ==============
function renderDayWiseBarChart() {
  const container = document.getElementById('d3BarChartContainer');
  if (!container) return;
  container.innerHTML = '';

  // Get last 7 days dates array
  const data = [];
  const today = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(today.getDate() - i);
    const dateStr = day.toISOString().split('T')[0];
    const labelDate = day.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });

    // Sum matching seconds
    const daySecs = rawSessions
      .filter(s => s.date === dateStr)
      .reduce((sum, s) => sum + (s.duration || 0), 0);

    data.push({
      dateStr,
      label: labelDate,
      hours: Number((daySecs / 3600).toFixed(2))
    });
  }

  // Width and height
  const width = container.clientWidth || 500;
  const height = 280;
  const margin = { top: 20, right: 20, bottom: 40, left: 40 };

  const svg = d3.select('#d3BarChartContainer')
    .append('svg')
    .attr('width', '100%')
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMinYMin meet');

  // Axes scales
  const x = d3.scaleBand()
    .domain(data.map(d => d.label))
    .range([margin.left, width - margin.right])
    .padding(0.3);

  const maxVal = d3.max(data, d => d.hours) || 2;
  const y = d3.scaleLinear()
    .domain([0, Math.max(4, maxVal + 1)])
    .nice()
    .range([height - margin.bottom, margin.top]);

  // X Axis
  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .attr('class', 'text-slate-400 font-mono text-[10px]')
    .call(g => g.select('.domain').remove());

  // Y Axis
  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5))
    .attr('class', 'text-slate-400 font-mono text-[10px]')
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('.tick line').clone()
        .attr('x2', width - margin.left - margin.right)
        .attr('stroke-opacity', 0.1));

  // Bars with linear color gradients
  svg.selectAll('.bar')
    .data(data)
    .enter()
    .append('rect')
    .attr('class', 'bar fill-blue-600/80 hover:fill-blue-500 rounded-md transition cursor-pointer')
    .attr('x', d => x(d.label))
    .attr('y', d => y(d.hours))
    .attr('width', x.bandwidth())
    .attr('height', d => height - margin.bottom - y(d.hours))
    .attr('rx', 4);

  // Labels on top
  svg.selectAll('.bar-label')
    .data(data)
    .enter()
    .append('text')
    .attr('class', 'text-[10px] font-mono font-medium fill-slate-500 text-center')
    .attr('x', d => x(d.label) + x.bandwidth() / 2)
    .attr('y', d => y(d.hours) - 6)
    .attr('text-anchor', 'middle')
    .text(d => d.hours > 0 ? `${d.hours}h` : '');
}


// ============== CHART 2: SUBJECTS COLOURED DONUT CHART (D3) ==============
function renderSubjectDonutChart() {
  const container = document.getElementById('d3DonutChartContainer');
  if (!container) return;
  container.innerHTML = '';

  const subjects = ['ADA', 'DSA', 'Mathematics', 'Web Development', 'DM', 'Other'];
  const aggregateMap = {};
  subjects.forEach(sub => aggregateMap[sub] = 0);

  rawSessions.forEach(s => {
    const sub = subjects.includes(s.subject) ? s.subject : 'Other';
    aggregateMap[sub] += (s.duration || 0);
  });

  const rawData = subjects.map(sub => ({
    name: sub,
    value: Number((aggregateMap[sub] / 3600).toFixed(1))
  })).filter(o => o.value > 0);

  if (rawData.length === 0) {
    container.innerHTML = `
      <div class="py-16 text-center text-xs text-slate-400 italic">
        Insufficient study loops logged to map donut categories
      </div>
    `;
    return;
  }

  const width = container.clientWidth || 320;
  const height = 260;
  const radius = Math.min(width, height) / 2.5;

  const svg = d3.select('#d3DonutChartContainer')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .append('g')
    .attr('transform', `translate(${width / 2}, ${height / 2})`);

  // Color mapping range
  const color = d3.scaleOrdinal()
    .domain(subjects)
    .range(['#2563eb', '#9333ea', '#db2777', '#0d9488', '#ea580c', '#64748b']);

  // Compute positions
  const pie = d3.pie()
    .value(d => d.value)
    .sort(null);

  const data_ready = pie(rawData);

  // Outer and inner borders
  const arc = d3.arc()
    .innerRadius(radius * 0.55)
    .outerRadius(radius * 0.85);

  svg.selectAll('allSlices')
    .data(data_ready)
    .enter()
    .append('path')
    .attr('d', arc)
    .attr('fill', d => color(d.data.name))
    .attr('stroke', 'transparent')
    .style('stroke-width', '2px')
    .style('opacity', 0.85)
    .attr('class', 'hover:opacity-100 transition cursor-pointer')
    .attr('title', d => `${d.data.name}: ${d.data.value}h`);

  // Add legends beside or in container
  const legendBox = document.createElement('div');
  legendBox.className = "flex flex-wrap justify-center gap-3 pt-3 text-[10px] font-semibold";
  rawData.forEach(item => {
    legendBox.innerHTML += `
      <span class="flex items-center gap-1">
        <span class="w-2.5 h-2.5 rounded-sm" style="background-color: ${color(item.name)}"></span>
        <span class="text-slate-500">${item.name} (${item.value}h)</span>
      </span>
    `;
  });
  container.parentNode.appendChild(legendBox);
}


// ============== CHART 3: SCHEDULE PLANNED VS ACTUAL MULTI LINE GRAPH (D3) ==============
function renderLineChartPlannedVsActual() {
  const container = document.getElementById('d3LineChartContainer');
  if (!container) return;
  container.innerHTML = '';

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // Compute scheduled sum per day
  const plannedMap = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0 };
  rawSchedules.forEach(item => {
    if (DAYS.includes(item.day)) {
      plannedMap[item.day] += Number(item.plannedHours || 0);
    }
  });

  // Fallback to average gtu base schedules if users weekly schedule is complete empty!
  const scheduleCount = rawSchedules.length;
  DAYS.forEach(day => {
    if (scheduleCount === 0) {
      plannedMap[day] = day === 'Saturday' || day === 'Sunday' ? 2 : 5; // standard sample default template
    }
  });

  // Compute actual sum studied in the current week coordinates
  const now = new Date();
  const currentDay = now.getDay();
  const distToMon = currentDay === 0 ? 6 : currentDay - 1;
  const startOfWeek = new Date(now.setDate(now.getDate() - distToMon));
  startOfWeek.setHours(0,0,0,0);

  const actualMap = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0 };
  
  // Aggregate actual study hours by match of date's weekday
  rawSessions.forEach(s => {
    const seshDate = new Date(s.date + 'T00:00:00');
    if (seshDate >= startOfWeek) {
      const weekdayStr = seshDate.toLocaleDateString('en-US', { weekday: 'long' });
      if (DAYS.includes(weekdayStr)) {
        actualMap[weekdayStr] += (s.duration || 0) / 3600;
      }
    }
  });

  // Transform data list
  const data = DAYS.map(day => ({
    day,
    planned: Number(plannedMap[day].toFixed(1)),
    actual: Number(actualMap[day].toFixed(1))
  }));

  const width = container.clientWidth || 500;
  const height = 280;
  const margin = { top: 20, right: 30, bottom: 40, left: 40 };

  const svg = d3.select('#d3LineChartContainer')
    .append('svg')
    .attr('width', '100%')
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMinYMin meet');

  // Axes domains
  const x = d3.scalePoint()
    .domain(DAYS)
    .range([margin.left, width - margin.right]);

  const maxPlannedY = d3.max(data, d => d.planned) || 2;
  const maxActualY = d3.max(data, d => d.actual) || 2;
  const y = d3.scaleLinear()
    .domain([0, Math.max(6, maxPlannedY, maxActualY) + 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  // X Axis draw
  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .attr('class', 'text-slate-400 font-mono text-[10px]')
    .call(g => g.select('.domain').remove());

  // Y Axis draw
  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5))
    .attr('class', 'text-slate-400 font-mono text-[10px]')
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('.tick line').clone()
        .attr('x2', width - margin.left - margin.right)
        .attr('stroke-opacity', 0.1));

  // Planned Line Generator (dotted grey/violet)
  const linePlanned = d3.line()
    .x(d => x(d.day))
    .y(d => y(d.planned))
    .curve(d3.curveMonotoneX);

  // Actual Line Generator (solid blue)
  const lineActual = d3.line()
    .x(d => x(d.day))
    .y(d => y(d.actual))
    .curve(d3.curveMonotoneX);

  // Draw Planned path
  svg.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', '#a78bfa') // light violet
    .attr('stroke-width', 2.5)
    .attr('stroke-dasharray', '5,5')
    .attr('d', linePlanned);

  // Draw Actual path
  svg.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', '#3b82f6') // solid blue
    .attr('stroke-width', 3)
    .attr('d', lineActual);

  // Circular points labels for Actual points
  svg.selectAll('.dot-actual')
    .data(data)
    .enter()
    .append('circle')
    .attr('cx', d => x(d.day))
    .attr('cy', d => y(d.actual))
    .attr('r', 4)
    .attr('fill', '#3b82f6')
    .attr('class', 'transition hover:scale-150 cursor-pointer');
}
