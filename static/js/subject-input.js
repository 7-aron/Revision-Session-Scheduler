// ==================== CONSTANTS ====================
const ROUTES = {
    home: "/home",
    help: "/help",
    summary: "/summary-review"
};

const today = new Date();
const maxDate = new Date();
maxDate.setFullYear(today.getFullYear() + 5);

const DATE_LIMITS = {
    min: today.toISOString().split('T')[0],
    max: maxDate.toISOString().split('T')[0]
};

// ==================== NAVIGATION ====================
document.getElementById('home-title').onclick = () => location.href = ROUTES.home;
document.getElementById('help-link').onclick = () => location.href = ROUTES.help;
document.getElementById('footer-title').onclick = () => location.href = ROUTES.home;
document.getElementById('save-continue').onclick = () => location.href = ROUTES.summary;

// ==================== UTILITIES ====================
const toFormData = (obj) => {
    const fd = new FormData();
    Object.entries(obj).forEach(([k, v]) => fd.append(k, v));
    return fd;
};

const clearFields = (...ids) => ids.forEach(id => document.getElementById(id).value = '');

const validateTimes = (start, end) => {
    if (start >= end) {
        alert("Start Time must be before End Time.");
        return false;
    }
    return true;
};

// ==================== MULTI-SELECT DROPDOWN ====================
const dayDropdown = document.getElementById('daysDropdown');
const display = dayDropdown.querySelector('.multi-select-display');
const options = dayDropdown.querySelector('.multi-select-options');

dayDropdown.onclick = () => dayDropdown.classList.toggle('active');

options.onclick = (e) => {
    e.stopPropagation();
    const selected = Array.from(dayDropdown.querySelectorAll('input:checked')).map(cb => cb.value);
    display.textContent = selected.length ? selected.join(', ') : 'Select days...';
    display.classList.toggle('selected', selected.length > 0);
};

document.onclick = (e) => {
    if (!dayDropdown.contains(e.target)) dayDropdown.classList.remove('active');
};

// ==================== DATE VALIDATION ====================
['exam-date', 'commitment-date'].forEach(id => {
    const input = document.getElementById(id);
    input.setAttribute('min', DATE_LIMITS.min);
    input.setAttribute('max', DATE_LIMITS.max);
});

// ==================== FORM SUBMISSION HANDLER ====================
async function submitForm(endpoint, data, clearFn) {
    try {
        const res = await fetch(endpoint, { method: 'POST', body: toFormData(data) });
        
        if (!res.ok) {
            const err = await res.json();
            alert(err.message);
            return;
        }

        alert(`${endpoint.split('_')[1]} added successfully!`.replace(/^./, c => c.toUpperCase()));
        clearFn();
    } catch (err) {
        console.error(`${endpoint} Error:`, err);
        alert('Error connecting to server.');
    }
}

// ==================== ADD SUBJECT ====================
document.getElementById('add-subject-btn').onclick = async () => {
    const name = document.getElementById('subject-name').value.trim();
    const confidence = document.getElementById('confidence-level').value;
    const exam_date = document.getElementById('exam-date').value.trim();
    const notes = document.getElementById('subject-notes').value.trim();

    if (!name || !confidence || !exam_date) {
        alert("Please fill in all required fields!");
        return;
    }

    await submitForm('/add_subject', { name, confidence, exam_date, notes }, () => {
        clearFields('subject-name', 'exam-date', 'confidence-level', 'subject-notes');
        document.getElementById('subject-name').focus();
    });
};

// ==================== ADD AVAILABILITY ====================
document.getElementById('add-availability-btn').onclick = async () => {
    const start_time = document.getElementById('start-time').value;
    const end_time = document.getElementById('end-time').value;
    const days = Array.from(document.querySelectorAll('#daysDropdown input:checked')).map(cb => cb.value);

    if (!days.length) {
        alert("Please select at least one day!");
        return;
    }

    if (!start_time || !end_time) {
        alert("Please fill in all required fields!");
        return;
    }

    if (!validateTimes(start_time, end_time)) return;

    await submitForm('/add_availability', { start_time, end_time, day: days.join(', ') }, () => {
        clearFields('start-time', 'end-time');
        document.querySelectorAll('#daysDropdown input').forEach(cb => cb.checked = false);
        display.textContent = 'Select days...';
        display.classList.remove('selected');
    });
};

// ==================== ADD COMMITMENT ====================
document.getElementById('add-commitment-btn').onclick = async () => {
    const name = document.getElementById('commitment-name').value.trim();
    const day = document.getElementById('commitment-date').value;
    const start_time = document.getElementById('commitment-start').value;
    const end_time = document.getElementById('commitment-end').value;
    const repeat_pattern = document.getElementById('repeat-pattern').value;

    if (!name || !day || !repeat_pattern || !start_time || !end_time) {
        alert("Please fill in all required fields!");
        return;
    }

    if (!validateTimes(start_time, end_time)) return;

    await submitForm('/add_commitment', { name, day, start_time, end_time, repeat_pattern }, () => {
        clearFields('commitment-name', 'commitment-date', 'commitment-start', 'commitment-end', 'repeat-pattern');
    });
};