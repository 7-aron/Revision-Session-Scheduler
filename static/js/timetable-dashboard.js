// -------------------- CONFIG --------------------
const routes = { home: "/home", help: "/help", dashboard: "/timetable-dashboard" };
const fullTimes = Array.from({length:24}, (_,i)=> i.toString().padStart(2,'0') + ':00');
const defaultTimes = Array.from({length:14}, (_,i)=> (8+i).toString().padStart(2,'0') + ':00');
const weekDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const mobileBreakpoint = 600;
const rowHeight = 60; // px per hour

// -------------------- STATE --------------------
let expanded = false;
let currentWeekStart = getMonday(new Date());
let currentDayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1; // Monday=0, Sunday=6

// -------------------- DOM ELEMENTS --------------------
const body = document.getElementById('timetable-body');
const seeEarlier = document.getElementById('see-earlier');
const seeLater = document.getElementById('see-later');
const dailyNav = document.getElementById('daily-nav');
const mobileCurrentDay = document.getElementById('mobile-current-day');

// -------------------- HELPERS --------------------
function getMonday(date){
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(date);
    monday.setDate(date.getDate() + diff);
    return monday;
}

function formatWeekRange(startDate){
    const monday = getMonday(startDate);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const opt = { day:'numeric', month:'short'};
    return `${monday.toLocaleDateString('en-GB',opt)} – ${sunday.toLocaleDateString('en-GB',opt)}`;
}

function formatMobileDay(dayIndex){
    const monday = getMonday(currentWeekStart);
    const selectedDate = new Date(monday);
    selectedDate.setDate(monday.getDate() + dayIndex);
    return `${weekDays[dayIndex]} ${selectedDate.getDate()}`;
}

// -------------------- RENDER TIMETABLE --------------------
function renderTimetable(times){
    body.innerHTML = '';
    times.forEach(time=>{
        const row = document.createElement('tr');
        row.innerHTML = `<td class="time">${time}</td>` + '<td></td>'.repeat(7);
        body.appendChild(row);
    });
}

// -------------------- TOGGLE TIMETABLE --------------------
function toggleExpansion(){
    expanded = !expanded;
    if(expanded){
        renderTimetable(fullTimes);
        seeEarlier.textContent = 'Collapse';
        seeLater.textContent = 'Collapse';
    } else {
        renderTimetable(defaultTimes);
        seeEarlier.textContent = 'See Earlier';
        seeLater.textContent = 'See Later';
    }

    // Reapply mobile view after re-rendering
    if(window.innerWidth <= mobileBreakpoint){
        showOnlySelectedDay();
    }
}
seeEarlier.addEventListener('click', toggleExpansion);
seeLater.addEventListener('click', toggleExpansion);

// -------------------- MOBILE VIEW --------------------
function showAllColumns(){
    document.querySelectorAll('#timetable thead th, #timetable-body td').forEach(el=>{
        el.style.display='';
        el.classList.remove('visible-day');
    });
}

function showOnlySelectedDay(){
    const headerCells = document.querySelectorAll('#timetable thead th');
    const rows = document.querySelectorAll('#timetable-body tr');

    if(rows.length === 0) return;

    headerCells.forEach((th,i)=>{
        if(i===0 || i===currentDayIndex+1){
            th.style.display='';
            th.classList.add('visible-day');
        } else {
            th.style.display='none';
            th.classList.remove('visible-day');
        }
    });

    rows.forEach(row=>{
        row.querySelectorAll('td').forEach((td,i)=>{
            if(i===0 || i===currentDayIndex+1){
                td.style.display='';
                td.classList.add('visible-day');
            } else {
                td.style.display='none';
                td.classList.remove('visible-day');
            }
        });
    });

    mobileCurrentDay.textContent = formatMobileDay(currentDayIndex);
}

function setMobileDailyView(enable){
    if(enable){
        dailyNav.style.display='flex';
        showOnlySelectedDay();
    } else {
        dailyNav.style.display='none';
        showAllColumns();
    }
}

// Daily navigation
document.getElementById('daily-left').addEventListener('click', ()=>{
    currentDayIndex = (currentDayIndex - 1 + 7) % 7;
    showOnlySelectedDay();
});
document.getElementById('daily-right').addEventListener('click', ()=>{
    currentDayIndex = (currentDayIndex + 1) % 7;
    showOnlySelectedDay();
});

// -------------------- WEEK NAVIGATION --------------------
function updateWeekRangeDisplay(){
    document.getElementById('week-range').textContent = formatWeekRange(currentWeekStart);
}

document.getElementById('week-left').addEventListener('click', ()=>{
    currentWeekStart.setDate(currentWeekStart.getDate()-7);
    updateWeekRangeDisplay();
});
document.getElementById('week-right').addEventListener('click', ()=>{
    currentWeekStart.setDate(currentWeekStart.getDate()+7);
    updateWeekRangeDisplay();
});

// -------------------- COLOR ASSIGNMENT --------------------
const SUBJECT_COLORS = ['#d0fffe', '#fffddb', '#e4ffde', '#ffd3fd'];
const subjectColorMap = {};

function assignSubjectColors(sessions) {
    const subjects = new Set();
    Object.values(sessions).forEach(sessionList => {
        sessionList.forEach(session => {
            subjects.add(session.subject);
        });
    });
    
    // Sort subjects alphabetically for consistency
    const sortedSubjects = Array.from(subjects).sort();
    
    sortedSubjects.forEach((subject) => {
        if (!subjectColorMap[subject]) {
            // Use the current size of the map as the index, not the loop index
            const colorIndex = Object.keys(subjectColorMap).length;
            subjectColorMap[subject] = SUBJECT_COLORS[colorIndex % SUBJECT_COLORS.length];
            console.log(`Assigned ${subject} -> ${SUBJECT_COLORS[colorIndex % SUBJECT_COLORS.length]} (index: ${colorIndex})`);
        }
    });
    
    console.log("Final color map:", subjectColorMap);
}

function createColorLegend() {
    const existingLegend = document.getElementById('subject-legend');
    if (existingLegend) {
        existingLegend.remove();
    }
    
    const legend = document.createElement('div');
    legend.id = 'subject-legend';
    legend.style.display = 'flex';
    legend.style.flexWrap = 'wrap';
    legend.style.gap = '1rem';
    legend.style.justifyContent = 'center';
    legend.style.marginTop = '1.5rem';
    legend.style.padding = '1rem';
    legend.style.background = '#fff';
    legend.style.borderRadius = '8px';
    legend.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)';
    
    Object.entries(subjectColorMap).forEach(([subject, color]) => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '0.5rem';
        
        const colorBox = document.createElement('div');
        colorBox.style.width = '20px';
        colorBox.style.height = '20px';
        colorBox.style.backgroundColor = color;
        colorBox.style.border = '1px solid #888';
        colorBox.style.borderRadius = '4px';
        
        const label = document.createElement('span');
        label.textContent = subject;
        label.style.fontSize = '0.9rem';
        label.style.fontWeight = '500';
        
        item.appendChild(colorBox);
        item.appendChild(label);
        legend.appendChild(item);
    });
    
    const timetableSection = document.querySelector('.timetable-section');
    timetableSection.parentNode.insertBefore(legend, timetableSection.nextSibling);
}

// -------------------- SESSION MAPPING --------------------
function getCurrentWeekDates() {
    const monday = getMonday(currentWeekStart);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    return {
        start: monday.toISOString().split('T')[0],
        end: sunday.toISOString().split('T')[0]
    };
}

async function fetchWeekSessions() {
    const { start, end } = getCurrentWeekDates();
    
    try {
        const response = await fetch(`/get_revision_sessions?start_date=${start}&end_date=${end}`);
        if (!response.ok) {
            console.error("Failed to fetch sessions");
            return {};
        }
        
        const sessions = await response.json();
        console.log("Fetched sessions:", sessions);
        return sessions;
        
    } catch (err) {
        console.error("Error fetching sessions:", err);
        return {};
    }
}

function placeSessionBlockFromData(date, session) {
    const dayOfWeek = new Date(date).getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const container = document.getElementById('session-blocks-container');
    const timetableStart = expanded ? 0 : 8;
    
    const dayCellHeader = document.querySelector(`#timetable thead th:nth-child(${dayIndex + 2})`);
    if (!dayCellHeader) return;
    
    const firstRow = document.querySelector('#timetable-body tr:first-child');
    if (!firstRow) return;
    const actualRowHeight = firstRow.offsetHeight;
    
    const startFloat = session.start;
    const endFloat = session.end;
    
    const timetableEnd = expanded ? 24 : 22;
    if (startFloat < timetableStart || startFloat >= timetableEnd) {
        return;
    }
    
    const firstDataCell = document.querySelector('#timetable-body tr:first-child td:nth-child(2)');
    if (!firstDataCell) return;
    
    const wrapper = document.getElementById('table-wrapper');
    const wrapperRect = wrapper.getBoundingClientRect();
    const firstDataCellRect = firstDataCell.getBoundingClientRect();
    
    const offsetTop = firstDataCellRect.top - wrapperRect.top;
    
    const hoursSinceStart = startFloat - timetableStart;
    const topPosition = offsetTop + (hoursSinceStart * actualRowHeight);
    
    const duration = endFloat - startFloat;
    const blockHeight = duration * actualRowHeight;
    
    const dayCellRect = dayCellHeader.getBoundingClientRect();
    const leftPosition = dayCellRect.left - wrapperRect.left;
    const cellWidth = dayCellRect.width;
    
    const block = document.createElement("div");
    block.classList.add("session-block");
    block.style.position = "absolute";
    block.style.top = topPosition + "px";
    block.style.height = blockHeight + "px";
    block.style.left = leftPosition + "px";
    block.style.width = cellWidth + "px";
    block.style.backgroundColor = subjectColorMap[session.subject] || "#d0eaff";
    block.style.color = "#000";
    block.style.border = "1px solid #888";
    block.style.borderRadius = "4px";
    block.style.fontSize = "0.75rem";
    block.style.display = "flex";
    block.style.flexDirection = "column";
    block.style.alignItems = "center";
    block.style.justifyContent = "center";
    block.style.pointerEvents = "auto";
    block.style.padding = "4px";
    block.style.overflow = "hidden";
    block.style.boxSizing = "border-box";
    
    const startHour = Math.floor(startFloat);
    const startMin = Math.round((startFloat % 1) * 60);
    const endHour = Math.floor(endFloat);
    const endMin = Math.round((endFloat % 1) * 60);
    
    const startTimeStr = `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;
    const endTimeStr = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
    
    const subjectDiv = document.createElement("div");
    subjectDiv.style.fontWeight = "600";
    subjectDiv.style.fontSize = "0.75rem";
    subjectDiv.textContent = session.subject;
    
    const timeDiv = document.createElement("div");
    timeDiv.style.fontSize = "0.65rem";
    timeDiv.style.opacity = "0.8";
    timeDiv.textContent = `${startTimeStr} - ${endTimeStr}`;
    
    block.appendChild(subjectDiv);
    block.appendChild(timeDiv);
    
    container.appendChild(block);
}

async function renderWeekSessions() {
    const container = document.getElementById("session-blocks-container");
    container.innerHTML = '';
    
    const sessions = await fetchWeekSessions();
    
    // Only assign colors if not already assigned (keeps colors consistent)
    assignSubjectColors(sessions);
    createColorLegend();
    
    Object.entries(sessions).forEach(([date, sessionList]) => {
        sessionList.forEach(session => {
            placeSessionBlockFromData(date, session);
        });
    });
}

// -------------------- CURRENT TIME LINE --------------------
function updateCurrentTimeLine() {
    const existingLine = document.getElementById('current-time-line');
    if (existingLine) {
        existingLine.remove();
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeFloat = currentHour + currentMinute / 60;

    const timetableStart = expanded ? 0 : 8;
    const timetableEnd = expanded ? 24 : 22;

    if (currentTimeFloat < timetableStart || currentTimeFloat >= timetableEnd) {
        return;
    }

    const firstTimeCell = document.querySelector('#timetable-body tr:first-child td.time');
    if (!firstTimeCell) return;
    
    const firstRow = document.querySelector('#timetable-body tr:first-child');
    const actualRowHeight = firstRow ? firstRow.offsetHeight : rowHeight;
    
    const wrapper = document.getElementById('table-wrapper');
    const wrapperRect = wrapper.getBoundingClientRect();
    const firstCellRect = firstTimeCell.getBoundingClientRect();
    const offsetTop = firstCellRect.top - wrapperRect.top;

    const hoursSinceStart = currentTimeFloat - timetableStart;
    const topPosition = offsetTop + (hoursSinceStart * actualRowHeight);

    const line = document.createElement('div');
    line.id = 'current-time-line';
    line.style.position = 'absolute';
    line.style.top = topPosition + 'px';
    line.style.left = '0';
    line.style.width = '100%';
    line.style.height = '3px';
    line.style.backgroundColor = '#ff0000';
    line.style.zIndex = '20';
    line.style.pointerEvents = 'none';
    line.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.8), 0 0 20px rgba(255, 0, 0, 0.5)';
    
    const circle = document.createElement('div');
    circle.style.position = 'absolute';
    circle.style.left = '-2px';
    circle.style.top = '-4px';
    circle.style.width = '10px';
    circle.style.height = '10px';
    circle.style.backgroundColor = '#ff0000';
    circle.style.borderRadius = '50%';
    circle.style.boxShadow = '0 0 8px rgba(255, 0, 0, 0.9), 0 0 15px rgba(255, 0, 0, 0.6)';
    line.appendChild(circle);

    wrapper.appendChild(line);
}

setTimeout(() => {
    updateCurrentTimeLine();
}, 200);

setInterval(updateCurrentTimeLine, 60000);

seeEarlier.addEventListener('click', () => {
    setTimeout(updateCurrentTimeLine, 150);
});

seeLater.addEventListener('click', () => {
    setTimeout(updateCurrentTimeLine, 150);
});

// -------------------- REGENERATE TIMETABLE --------------------
document.getElementById('regenerate-btn').addEventListener('click', async ()=>{
    try{
        const resp = await fetch("/generate_timetable", { method:"POST" });
        const data = await resp.json();
        sessionStorage.setItem("timetable", JSON.stringify(data));
        location.reload();
    }catch(err){ console.error(err); alert("Failed to generate timetable"); }
});

// -------------------- WEEK NAVIGATION WITH SESSIONS --------------------
document.getElementById('week-left').addEventListener('click', async () => {
    await renderWeekSessions();
    updateCurrentTimeLine();
});

document.getElementById('week-right').addEventListener('click', async () => {
    await renderWeekSessions();
    updateCurrentTimeLine();
});

// -------------------- EXPAND/COLLAPSE WITH SESSIONS --------------------
seeEarlier.addEventListener('click', async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await renderWeekSessions();
    updateCurrentTimeLine();
});

seeLater.addEventListener('click', async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await renderWeekSessions();
    updateCurrentTimeLine();
});

// -------------------- RESIZE HANDLER --------------------
window.addEventListener('resize', async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    await renderWeekSessions();
    updateCurrentTimeLine();
});

// -------------------- INITIALIZATION --------------------
renderTimetable(defaultTimes);
updateWeekRangeDisplay();

const today = new Date();
currentDayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;

function initView(){
    if(window.innerWidth <= mobileBreakpoint){
        setMobileDailyView(true);
    } else {
        setMobileDailyView(false);
    }
}

initView();
window.addEventListener('resize', initView);

// Initial render of sessions
setTimeout(async () => {
    await renderWeekSessions();
}, 300);

// -------------------- HEADER / FOOTER LINKS --------------------
document.getElementById('home-title').onclick = () => location.href = routes.home;
document.getElementById('help-link').onclick = () => location.href = routes.help;
document.getElementById('footer-title').onclick = () => location.href = routes.home;