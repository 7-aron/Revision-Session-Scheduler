// ==================== CONSTANTS ====================
const ROUTES = { home: "/home", help: "/help", dashboard: "/timetable-dashboard" };
const HOURS = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`);
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const COLORS = ['#d0fffe', '#fffddb', '#e4ffde', '#ffd3fd'];
const MOBILE_BP = 600;

// ==================== STATE ====================
const state = {
    weekStart: getMondayOfWeek(new Date()),
    mobileDay: new Date().getDay() === 0 ? 6 : new Date().getDay() - 1,
    subjectColors: {},
    sessionsData: {}
};

// ==================== DOM REFERENCES ====================
const els = {
    tbody: document.getElementById('timetable-body'),
    dailyNav: document.getElementById('daily-nav'),
    dayDisplay: document.getElementById('mobile-current-day'),
    blocksContainer: document.getElementById('session-blocks-container'),
    weekRange: document.getElementById('week-range')
};

// ==================== DATE UTILITIES ====================
function getMondayOfWeek(date) {
    const day = date.getDay();
    const monday = new Date(date);
    monday.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
    return monday;
}

function formatWeekRange(start) {
    const monday = getMondayOfWeek(start);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const opts = { day: 'numeric', month: 'short' };
    return `${monday.toLocaleDateString('en-GB', opts)} – ${sunday.toLocaleDateString('en-GB', opts)}`;
}

function formatDayHeader(idx) {
    const date = new Date(state.weekStart);
    date.setDate(getMondayOfWeek(state.weekStart).getDate() + idx);
    return `${DAYS[idx]} ${date.getDate()}`;
}

function getWeekRange() {
    const monday = getMondayOfWeek(state.weekStart);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
        startDate: monday.toISOString().split('T')[0],
        endDate: sunday.toISOString().split('T')[0]
    };
}

function formatTime(decimal) {
    const h = Math.floor(decimal);
    const m = Math.round((decimal % 1) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// ==================== RENDERING ====================
function renderGrid() {
    els.tbody.innerHTML = HOURS.map(time => 
        `<tr><td class="time">${time}</td>${'<td></td>'.repeat(7)}</tr>`
    ).join('');
}

function updateWeekLabel() {
    els.weekRange.textContent = formatWeekRange(state.weekStart);
}

// ==================== MOBILE VIEW ====================
function toggleDayView(singleDay) {
    const headers = document.querySelectorAll('#timetable thead th');
    const rows = document.querySelectorAll('#timetable-body tr');

    if (!rows.length) return;

    headers.forEach((h, i) => {
        const show = !singleDay || i === 0 || i === state.mobileDay + 1;
        h.style.display = show ? '' : 'none';
        h.classList.toggle('visible-day', show && singleDay);
    });

    rows.forEach(row => {
        row.querySelectorAll('td').forEach((cell, i) => {
            const show = !singleDay || i === 0 || i === state.mobileDay + 1;
            cell.style.display = show ? '' : 'none';
            cell.classList.toggle('visible-day', show && singleDay);
        });
    });

    if (singleDay) els.dayDisplay.textContent = formatDayHeader(state.mobileDay);
}

function updateViewport() {
    const isMobile = window.innerWidth <= MOBILE_BP;
    els.dailyNav.style.display = isMobile ? 'flex' : 'none';
    toggleDayView(isMobile);
}

// ==================== NAVIGATION ====================
function setupNavigation() {
    document.getElementById('daily-left').onclick = async () => {
        state.mobileDay = (state.mobileDay - 1 + 7) % 7;
        toggleDayView(true);
        await renderSessions();
    };

    document.getElementById('daily-right').onclick = async () => {
        state.mobileDay = (state.mobileDay + 1) % 7;
        toggleDayView(true);
        await renderSessions();
    };

    document.getElementById('week-left').onclick = async () => {
        state.weekStart.setDate(state.weekStart.getDate() - 7);
        updateWeekLabel();
        await renderSessions();
    };

    document.getElementById('week-right').onclick = async () => {
        state.weekStart.setDate(state.weekStart.getDate() + 7);
        updateWeekLabel();
        await renderSessions();
    };

    document.getElementById('home-title').onclick = () => location.href = ROUTES.home;
    document.getElementById('help-link').onclick = () => location.href = ROUTES.help;
    document.getElementById('footer-title').onclick = () => location.href = ROUTES.home;
}

// ==================== COLORS & LEGEND ====================
function assignColors(data) {
    const subjects = [...new Set(
        Object.values(data).flatMap(sessions => sessions.map(s => s.subject))
    )].sort();
    
    subjects.forEach(subject => {
        if (!state.subjectColors[subject]) {
            const idx = Object.keys(state.subjectColors).length;
            state.subjectColors[subject] = COLORS[idx % COLORS.length];
        }
    });
}

function createLegend() {
    document.getElementById('subject-legend')?.remove();
    
    const legend = document.createElement('div');
    legend.id = 'subject-legend';
    Object.assign(legend.style, {
        display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center',
        marginTop: '1.5rem', padding: '1rem', background: '#fff',
        borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)'
    });
    
    Object.entries(state.subjectColors).forEach(([subject, color]) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:0.5rem';
        
        const box = document.createElement('div');
        box.style.cssText = `width:20px;height:20px;background:${color};border:1px solid #888;border-radius:4px`;
        
        const label = document.createElement('span');
        label.style.cssText = 'font-size:0.9rem;font-weight:500';
        label.textContent = subject;
        
        item.append(box, label);
        legend.appendChild(item);
    });
    
    const section = document.querySelector('.timetable-section');
    section.parentNode.insertBefore(legend, section.nextSibling);
}

// ==================== DATA FETCHING ====================
async function fetchSessions() {
    const { startDate, endDate } = getWeekRange();
    
    try {
        const res = await fetch(`/get_revision_sessions?start_date=${startDate}&end_date=${endDate}`);
        if (!res.ok) throw new Error("Failed to fetch sessions");
        state.sessionsData = await res.json();
        return state.sessionsData;
    } catch (err) {
        console.error("Error fetching sessions:", err);
        return {};
    }
}

// ==================== SESSION RENDERING ====================
function renderSession(dateStr, session) {
    const date = new Date(dateStr);
    const dayIdx = date.getDay() === 0 ? 6 : date.getDay() - 1;
    
    const isMobile = window.innerWidth <= MOBILE_BP;
    if (isMobile && dayIdx !== state.mobileDay) return;
    
    const header = document.querySelector(`#timetable thead th:nth-child(${dayIdx + 2})`);
    if (!header || header.style.display === 'none') return;
    
    const firstRow = document.querySelector('#timetable-body tr:first-child');
    const firstTimeCell = firstRow?.querySelector('td.time');
    if (!firstRow || !firstTimeCell) return;
    
    const wrapper = document.getElementById('table-wrapper');
    const wrapperBox = wrapper.getBoundingClientRect();
    const timeCellBox = firstTimeCell.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    
    const rowHeight = firstRow.offsetHeight;
    const offset = timeCellBox.top - wrapperBox.top;
    const top = offset + (session.start * rowHeight);
    const height = (session.end - session.start) * rowHeight;
    const left = headerBox.left - wrapperBox.left;
    const width = headerBox.width;
    
    const block = document.createElement("div");
    block.className = "session-block";
    block.style.cssText = `
        position:absolute;top:${top}px;height:${height}px;left:${left}px;width:${width}px;
        background:${state.subjectColors[session.subject] || "#d0eaff"};color:#000;
        border:1px solid #888;border-radius:4px;font-size:0.75rem;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        padding:4px;overflow:hidden;cursor:default
    `;
    
    if (session.notes) block.title = session.notes;
    
    block.innerHTML = `
        <div style="font-weight:600">${session.subject}</div>
        <div style="font-size:0.65rem;opacity:0.8">
            ${formatTime(session.start)} - ${formatTime(session.end)}
        </div>
    `;
    
    els.blocksContainer.appendChild(block);
}

async function renderSessions() {
    els.blocksContainer.innerHTML = '';
    const data = await fetchSessions();
    assignColors(data);
    createLegend();
    Object.entries(data).forEach(([date, sessions]) => {
        sessions.forEach(s => renderSession(date, s));
    });
}

// ==================== EXPORT ====================
function exportAsCSV() {
    const { startDate, endDate } = getWeekRange();
    const monday = getMondayOfWeek(state.weekStart);
    
    let csv = 'Date,Day,Subject,Start Time,End Time\n';
    
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + dayIdx);
        const dateStr = date.toISOString().split('T')[0];
        const sessions = (state.sessionsData[dateStr] || []).sort((a, b) => a.start - b.start);
        
        sessions.forEach(session => {
            csv += `${dateStr},${DAYS[dayIdx]},${session.subject},${formatTime(session.start)},${formatTime(session.end)}\n`;
        });
    }
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetable-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ==================== EVENT HANDLERS ====================
document.getElementById('regenerate-btn').onclick = async () => {
    try {
        const res = await fetch("/generate_timetable", { method: "POST" });
        const data = await res.json();
        sessionStorage.setItem("timetable", JSON.stringify(data));
        location.reload();
    } catch (err) {
        console.error('Regeneration error:', err);
        alert("Failed to generate timetable");
    }
};

document.getElementById('export-btn').onclick = exportAsCSV;

window.onresize = async () => {
    await new Promise(r => setTimeout(r, 100));
    updateViewport();
    await renderSessions();
};


// ==================== INITIALIZATION ====================
renderGrid();
updateWeekLabel();
setupNavigation();
updateViewport();
setTimeout(() => renderSessions(), 300);