// ==================== NAVIGATION ROUTES ====================
const navigationRoutes = {
    homePage: "/home",
    helpPage: "/help",
    summaryPage: "/summary-review"
};

// Navigation button handlers
document.getElementById('home-title').onclick = () => location.href = navigationRoutes.homePage;
document.getElementById('help-link').onclick = () => location.href = navigationRoutes.helpPage;
document.getElementById('footer-title').onclick = () => location.href = navigationRoutes.homePage;
document.getElementById('save-continue').onclick = () => location.href = navigationRoutes.summaryPage;

// ==================== MULTI-SELECT DAY DROPDOWN ====================
const daySelectionDropdown = document.getElementById('daysDropdown');
const dropdownDisplay = daySelectionDropdown.querySelector('.multi-select-display');
const dropdownOptions = daySelectionDropdown.querySelector('.multi-select-options');

// Toggle dropdown visibility on click
daySelectionDropdown.addEventListener('click', event => {
    daySelectionDropdown.classList.toggle('active');
});

// Update selected days when options are clicked
dropdownOptions.addEventListener('click', event => {
    event.stopPropagation();
    updateSelectedDaysDisplay();
});

function updateSelectedDaysDisplay() {
    const selectedDaysList = Array.from(daySelectionDropdown.querySelectorAll('input:checked'))
        .map(checkbox => checkbox.value);
    
    dropdownDisplay.textContent = selectedDaysList.length 
        ? selectedDaysList.join(', ') 
        : 'Select days...';
    
    dropdownDisplay.classList.toggle('selected', selectedDaysList.length > 0);
}

document.addEventListener('click', e => {
    if (!dropdown.contains(e.target)) dropdown.classList.remove('active');
});

// ================= Date Min/Max =================
const examDateInput = document.getElementById('exam-date');
const commitmentDateInput = document.getElementById('commitment-date');

const today = new Date().toISOString().split('T')[0];
const maxDate = '2030-12-31';

[examDateInput, commitmentDateInput].forEach(input => {
    input.setAttribute('min', today);
    input.setAttribute('max', maxDate);

    input.addEventListener('blur', () => {
        if (input.value < today) input.value = today;
        if (input.value > maxDate) input.value = maxDate;
    });
});

// ================= Track user interaction for time inputs =================
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const commitmentStartInput = document.getElementById('commitment-start');
const commitmentEndInput = document.getElementById('commitment-end');

// Track if user has actually interacted with the time inputs
let startTimeModified = false;
let endTimeModified = false;
let commitmentStartModified = false;
let commitmentEndModified = false;

startTimeInput.addEventListener('input', () => startTimeModified = true);
startTimeInput.addEventListener('change', () => startTimeModified = true);
endTimeInput.addEventListener('input', () => endTimeModified = true);
endTimeInput.addEventListener('change', () => endTimeModified = true);
commitmentStartInput.addEventListener('input', () => commitmentStartModified = true);
commitmentStartInput.addEventListener('change', () => commitmentStartModified = true);
commitmentEndInput.addEventListener('input', () => commitmentEndModified = true);
commitmentEndInput.addEventListener('change', () => commitmentEndModified = true);

// ================= Add Subject =================
document.getElementById('add-subject-btn').addEventListener('click', async () => {
    const name = document.getElementById('subject-name').value.trim();
    const confidence = document.getElementById('confidence-level').value;
    const examDate = document.getElementById('exam-date').value.trim();
    const notes = document.getElementById('subject-notes').value.trim();

    if (!name || !confidence || !examDate) {
        alert("Please fill in all required fields!");
        return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('confidence', confidence);
    formData.append('exam_date', examDate);
    formData.append('notes', notes);

    try {
        const response = await fetch('/add_subject', { method: 'POST', body: formData });

        if (!response.ok) {
            const data = await response.json();
            alert(data.message);
            return;
        }

        alert("Subject added successfully!");

        document.getElementById('subject-name').value = '';
        document.getElementById('exam-date').value = '';
        document.getElementById('confidence-level').value = '';
        document.getElementById('subject-notes').value = '';
        document.getElementById('subject-name').focus();

    } catch (err) {
        console.error(err);
        alert('Error connecting to server.');
    }
});

// ================= Add Availability =================
document.getElementById('add-availability-btn').addEventListener('click', async () => {
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;

    const selectedDays = Array.from(document.querySelectorAll('#daysDropdown input[type="checkbox"]:checked'))
                              .map(cb => cb.value);

    if (selectedDays.length === 0) {
        alert("Please select at least one day!");
        return;
    }

    // Check if user has actually set the times
    if (!startTimeModified || !endTimeModified) {
        alert("Please set both start and end times!");
        return;
    }

    if (!startTime || !endTime) {
        alert("Please fill in all required fields!");
        return;
    }

    if (startTime >= endTime) {
        alert("Start Time must be before End Time.");
        return;
    }

    const formData = new FormData();
    formData.append('start_time', startTime);
    formData.append('end_time', endTime);
    formData.append('day', selectedDays.join(', '));

    try {
        const response = await fetch('/add_availability', { method: 'POST', body: formData });

        if (!response.ok) {
            const data = await response.json();
            alert(data.message);
            return;
        }

        alert('Availability added successfully!');

        document.getElementById('start-time').value = '';
        document.getElementById('end-time').value = '';
        startTimeModified = false;
        endTimeModified = false;

        document.querySelectorAll('#daysDropdown input[type="checkbox"]').forEach(cb => cb.checked = false);
        display.textContent = 'Select days...';
        display.classList.remove('selected');

    } catch (err) {
        console.error(err);
        alert('Error connecting to server.');
    }
});

// ================= Add Commitment =================
document.getElementById('add-commitment-btn').addEventListener('click', async () => {
    const name = document.getElementById('commitment-name').value.trim();
    let day = document.getElementById('commitment-date').value;
    const startTime = document.getElementById('commitment-start').value;
    const endTime = document.getElementById('commitment-end').value;
    const repeatPattern = document.getElementById('repeat-pattern').value;

    if (!name || !day || !repeatPattern) {
        alert("Please fill in all required fields!");
        return;
    }

    // Check if user has actually set the times
    if (!commitmentStartModified || !commitmentEndModified) {
        alert("Please set both start and end times!");
        return;
    }

    if (!startTime || !endTime) {
        alert("Please fill in all required fields!");
        return;
    }

    if (startTime >= endTime) {
        alert("Start Time must be before End Time.");
        return;
    }

    if (day < today) day = today;
    if (day > maxDate) day = maxDate;

    const formData = new FormData();
    formData.append('name', name);
    formData.append('day', day);
    formData.append('start_time', startTime);
    formData.append('end_time', endTime);
    formData.append('repeat_pattern', repeatPattern);

    try {
        const response = await fetch('/add_commitment', { method: 'POST', body: formData });

        if (!response.ok) {
            const data = await response.json();
            alert(data.message);
            return;
        }

        alert('Commitment added successfully!');

        document.getElementById('commitment-name').value = '';
        document.getElementById('commitment-date').value = '';
        document.getElementById('commitment-start').value = '';
        document.getElementById('commitment-end').value = '';
        document.getElementById('repeat-pattern').value = '';
        commitmentStartModified = false;
        commitmentEndModified = false;

    } catch (err) {
        console.error(err);
        alert('Error connecting to server.');
    }
});