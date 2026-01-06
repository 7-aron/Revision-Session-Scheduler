// routes for navigation
const routes = { 
    homePage: "/home", 
    helpPage: "/help", 
    summaryPage: "/summary-review", 
    dashboardPage: "/timetable-dashboard" 
};

const today = new Date();
const maxDate = new Date();
maxDate.setFullYear(today.getFullYear() + 5);

const DATE_LIMITS = {
    min: today.toISOString().split('T')[0],
    max: maxDate.toISOString().split('T')[0]
};

// click handlers for navigation
document.getElementById('home-title').onclick = () => location.href = routes.homePage;
document.getElementById('help-link').onclick = () => location.href = routes.helpPage;
document.getElementById('footer-title').onclick = () => location.href = routes.homePage;

// generate timetable button
document.getElementById('generate-btn').onclick = async () => {
    try {
        const res = await fetch("/generate_timetable", { method: "POST" });
        if (!res.ok) throw new Error("Failed to generate timetable");
        const schedule = await res.json();

        // go to dashboard
        window.location.href = routes.dashboardPage;
    } catch (error) {
        console.error("Error generating timetable:", error);
        alert("Failed to generate timetable. Please try again.");
    }
};

// keep track of what's being edited
let currentEdit = null;
let savedData = null;

// make text safe for html
function cleanText(txt) {
    return (txt || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// convert object to form data
function toFormData(obj) {
    const fd = new FormData();
    Object.entries(obj).forEach(([k, v]) => fd.append(k, v));
    return fd;
}

// show/hide error messages
function showErr(errBox, msg, show = true) {
    errBox.style.display = show ? "block" : "none";
    errBox.textContent = msg;
}

// edit subject row
function editSubject(row) {
    if (currentEdit) return;
    currentEdit = row;
    row.classList.add("editing");

    savedData = {};
    ["name", "exam", "conf", "notes"].forEach(field => {
        const cell = row.querySelector(`.cell-${field}`);
        if (cell) savedData[field] = cell.textContent.trim();
    });

    row.querySelector(".cell-name").innerHTML = 
        `<input class="inline-input name-input" value="${cleanText(savedData.name)}" maxlength="35">`;
    
    row.querySelector(".cell-exam").innerHTML = 
        `<input class="inline-input exam-input" type="date" value="${savedData.exam}" min="${DATE_LIMITS.min}" max="${DATE_LIMITS.max}">`;
    
    row.querySelector(".cell-conf").innerHTML = `
        <select class="inline-input conf-input">
            <option value="">Select</option>
            <option value="Low" ${savedData.conf === "Low" ? "selected" : ""}>Low</option>
            <option value="Medium" ${savedData.conf === "Medium" ? "selected" : ""}>Medium</option>
            <option value="High" ${savedData.conf === "High" ? "selected" : ""}>High</option>
        </select>`;
    
    row.querySelector(".cell-notes").innerHTML = 
        `<input class="inline-input notes-input" value="${cleanText(savedData.notes)}" maxlength="40">`;

    const editCell = row.querySelector(".edit-cell");
    editCell.innerHTML = `
        <div class="edit-actions-wrapper">
            <button class="btn save-btn">Save</button>
            <button class="btn cancel-btn">Cancel</button>
        </div>
        <div class="inline-error" style="display:none;color:#c0392b;"></div>
    `;

    row.querySelector(".save-btn").onclick = () => saveSubject(row);
    row.querySelector(".cancel-btn").onclick = () => cancelSubject(row);
}

function cancelSubject(row) {
    Object.keys(savedData).forEach(field => {
        const cell = row.querySelector(`.cell-${field}`);
        if (cell) cell.textContent = savedData[field];
    });
    
    row.classList.remove("editing");
    row.querySelector(".edit-cell").innerHTML = `<button class="btn edit-btn">Edit</button>`;
    attachSubjectEdit(row);
    
    currentEdit = null;
    savedData = null;
}

async function saveSubject(row) {
    const errBox = row.querySelector(".inline-error");
    const id = row.dataset.id;
    
    const data = {
        id: id,
        name: row.querySelector(".name-input")?.value.trim() || "",
        exam_date: row.querySelector(".exam-input")?.value.trim() || "",
        confidence: row.querySelector(".conf-input")?.value || "",
        notes: row.querySelector(".notes-input")?.value.trim() || ""
    };

    if (!data.name) return showErr(errBox, "Enter subject name");
    if (!data.exam_date) return showErr(errBox, "Enter exam date");
    if (!data.confidence) return showErr(errBox, "Select confidence level");

    try {
        const res = await fetch("/update_subject", { 
            method: "POST", 
            body: toFormData(data) 
        });
        const result = await res.json();
        
        if (!res.ok || !result || result.status !== "success") {
            return showErr(errBox, result?.message || "Failed to save");
        }

        row.querySelector(".cell-name").textContent = data.name;
        row.querySelector(".cell-exam").textContent = data.exam_date;
        row.querySelector(".cell-conf").textContent = data.confidence;
        row.querySelector(".cell-notes").textContent = data.notes;

        row.classList.remove("editing");
        row.querySelector(".edit-cell").innerHTML = `<button class="btn edit-btn">Edit</button>`;
        attachSubjectEdit(row);
        
        currentEdit = null;
        savedData = null;
    } catch (error) {
        console.error(error);
        showErr(errBox, "Error saving changes");
    }
}

function attachSubjectEdit(row) {
    const btn = row.querySelector(".edit-btn");
    if (!btn) return;
    btn.onclick = () => editSubject(row);
}

function editAvailability(row) {
    if (currentEdit) return;
    currentEdit = row;
    row.classList.add("editing");

    savedData = {};
    ["start", "end", "day"].forEach(field => {
        const cell = row.querySelector(`.cell-${field}`);
        if (cell) savedData[field] = cell.textContent.trim();
    });

    row.querySelector(".cell-start").innerHTML = 
        `<input class="inline-input start-input" type="time" value="${savedData.start}">`;
    
    row.querySelector(".cell-end").innerHTML = 
        `<input class="inline-input end-input" type="time" value="${savedData.end}">`;

    const dayCell = row.querySelector(".cell-day");
    dayCell.innerHTML = "";
    const selectedDays = savedData.day.split(",").map(d => d.trim());
    dayCell.appendChild(makeDaySelector(selectedDays));

    const editCell = row.querySelector(".edit-cell");
    editCell.innerHTML = `
        <div class="edit-actions-wrapper">
            <button class="btn save-btn">Save</button>
            <button class="btn cancel-btn">Cancel</button>
        </div>
        <div class="inline-error" style="display:none;color:#c0392b;"></div>
    `;

    row.querySelector(".save-btn").onclick = () => saveAvailability(row);
    row.querySelector(".cancel-btn").onclick = () => cancelAvailability(row);
}

function cancelAvailability(row) {
    Object.keys(savedData).forEach(field => {
        const cell = row.querySelector(`.cell-${field}`);
        if (cell) cell.textContent = savedData[field];
    });
    
    row.classList.remove("editing");
    row.querySelector(".edit-cell").innerHTML = `<button class="btn edit-btn">Edit</button>`;
    attachAvailabilityEdit(row);
    
    currentEdit = null;
    savedData = null;
}

async function saveAvailability(row) {
    const errBox = row.querySelector(".inline-error");
    const id = row.dataset.id;

    const start = row.querySelector(".start-input")?.value;
    const end = row.querySelector(".end-input")?.value;
    const daySelector = row.querySelector(".cell-day .multi-select");
    const selectedDays = Array.from(daySelector.querySelectorAll("input:checked"))
        .map(cb => cb.value);

    if (!start || !end) return showErr(errBox, "Start/End required");
    if (end <= start) return showErr(errBox, "End Time must be after Start Time");
    if (selectedDays.length === 0) return showErr(errBox, "Select at least one day");

    // CHECK: Get all existing availability slots (excluding current row being edited)
    const allRows = document.querySelectorAll("#availability-table tbody tr");
    const existingDaySlots = {}; // Map of day -> {start, end}
    
    allRows.forEach(otherRow => {
        // Skip the row we're currently editing
        if (otherRow.dataset.id === id) return;
        
        const dayCell = otherRow.querySelector(".cell-day");
        const startCell = otherRow.querySelector(".cell-start");
        const endCell = otherRow.querySelector(".cell-end");
        
        if (dayCell && startCell && endCell) {
            const days = dayCell.textContent.split(",").map(d => d.trim());
            const startTime = startCell.textContent.trim();
            const endTime = endCell.textContent.trim();
            
            days.forEach(day => {
                existingDaySlots[day] = { start: startTime, end: endTime };
            });
        }
    });

    // Check if any selected day already exists in another availability slot
    for (const day of selectedDays) {
        if (existingDaySlots[day]) {
            const { start, end } = existingDaySlots[day];
            return showErr(errBox, `Availability for ${day} already exists (${start} – ${end}). Only one availability slot per day is allowed.`);
        }
    }

    const data = { 
        id: id, 
        start_time: start, 
        end_time: end, 
        day: selectedDays.join(", ") 
    };

    try {
        const res = await fetch("/update_availability", { 
            method: "POST", 
            body: toFormData(data) 
        });
        const result = await res.json();
        
        if (!result || result.status !== "success") 
            return showErr(errBox, result?.message || "Failed to save");

        row.querySelector(".cell-start").textContent = data.start_time;
        row.querySelector(".cell-end").textContent = data.end_time;
        row.querySelector(".cell-day").textContent = data.day;

        row.classList.remove("editing");
        row.querySelector(".edit-cell").innerHTML = `<button class="btn edit-btn">Edit</button>`;
        attachAvailabilityEdit(row);
        
        currentEdit = null;
        savedData = null;
    } catch (error) {
        console.error(error);
        showErr(errBox, "Error saving");
    }
}

function attachAvailabilityEdit(row) {
    const btn = row.querySelector(".edit-btn");
    if (!btn) return;
    btn.onclick = () => editAvailability(row);
}

// day selector dropdown
function makeDaySelector(selected = []) {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const container = document.createElement("div");
    container.classList.add("multi-select");

    const display = document.createElement("div");
    display.classList.add("multi-select-display");
    display.textContent = selected.length ? selected.join(", ") : "Select days...";
    if (selected.length) display.classList.add("selected");
    container.appendChild(display);

    const options = document.createElement("div");
    options.classList.add("multi-select-options");
    
    days.forEach(day => {
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" value="${day}" ${selected.includes(day) ? "checked" : ""}/> ${day}`;
        options.appendChild(label);
    });
    container.appendChild(options);

    display.onclick = (e) => {
        e.stopPropagation();
        container.classList.toggle("active");
    };

    options.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", () => {
            const checked = Array.from(options.querySelectorAll("input:checked"))
                .map(input => input.value);
            display.textContent = checked.length ? checked.join(", ") : "Select days...";
            display.classList.toggle("selected", checked.length > 0);
        });
    });

    document.addEventListener("click", (e) => {
        if (!container.contains(e.target)) {
            container.classList.remove("active");
        }
    });

    return container;
}

// edit commitment row
function editCommitment(row) {
    if (currentEdit) return;
    currentEdit = row;
    row.classList.add("editing");

    savedData = {};
    ["name", "date", "start", "end", "repeat"].forEach(field => {
        const cell = row.querySelector(`.cell-${field}`);
        if (cell) savedData[field] = cell.textContent.trim();
    });

    row.querySelector(".cell-name").innerHTML = 
        `<input class="inline-input name-input" value="${cleanText(savedData.name)}">`;
    
    row.querySelector(".cell-date").innerHTML = 
        `<input class="inline-input date-input" type="date" value="${savedData.date}" min="${DATE_LIMITS.min}" max="${DATE_LIMITS.max}">`;
    
    row.querySelector(".cell-start").innerHTML = 
        `<input class="inline-input start-input" type="time" value="${savedData.start}">`;
    
    row.querySelector(".cell-end").innerHTML = 
        `<input class="inline-input end-input" type="time" value="${savedData.end}">`;

    const repeatOptions = ["Weekly", "Daily", "One-Time"];
    let select = `<select class="inline-input repeat-input">`;
    repeatOptions.forEach(opt => {
        select += `<option value="${opt}" ${savedData.repeat === opt ? "selected" : ""}>${opt}</option>`;
    });
    select += `</select>`;
    row.querySelector(".cell-repeat").innerHTML = select;

    const editCell = row.querySelector(".edit-cell");
    if (!editCell) {
        const newCell = document.createElement("td");
        newCell.classList.add("edit-cell");
        row.appendChild(newCell);
    }
    
    row.querySelector(".edit-cell").innerHTML = `
        <div class="edit-actions-wrapper">
            <button class="btn save-btn">Save</button>
            <button class="btn cancel-btn">Cancel</button>
        </div>
        <div class="inline-error" style="display:none;color:#c0392b;"></div>
    `;

    row.querySelector(".save-btn").onclick = () => saveCommitment(row);
    row.querySelector(".cancel-btn").onclick = () => cancelCommitment(row);
}

function cancelCommitment(row) {
    Object.keys(savedData).forEach(field => {
        const cell = row.querySelector(`.cell-${field}`);
        if (cell) cell.textContent = savedData[field];
    });
    
    row.classList.remove("editing");
    row.querySelector(".edit-cell").innerHTML = `<button class="btn edit-btn">Edit</button>`;
    attachCommitmentEdit(row);
    
    currentEdit = null;
    savedData = null;
}

async function saveCommitment(row) {
    const errBox = row.querySelector(".inline-error");
    const id = row.dataset.id;

    const name = row.querySelector(".name-input")?.value.trim();
    const date = row.querySelector(".date-input")?.value;
    const start = row.querySelector(".start-input")?.value;
    const end = row.querySelector(".end-input")?.value;
    const repeat = row.querySelector(".repeat-input")?.value.trim();

    if (!name || !date || !start || !end || !repeat) 
        return showErr(errBox, "Fill all required fields");

    if (end <= start) 
        return showErr(errBox, "End time must be after Start");

    const data = { 
        id: id, 
        name: name, 
        day: date, 
        start_time: start, 
        end_time: end, 
        repeat_pattern: repeat 
    };

    try {
        const res = await fetch("/update_commitment", { 
            method: "POST", 
            body: toFormData(data) 
        });
        const result = await res.json();
        
        if (!result || result.status !== "success") 
            return showErr(errBox, result?.message || "Failed to save");

        row.querySelector(".cell-name").textContent = name;
        row.querySelector(".cell-date").textContent = date;
        row.querySelector(".cell-start").textContent = start;
        row.querySelector(".cell-end").textContent = end;
        row.querySelector(".cell-repeat").textContent = repeat;

        row.classList.remove("editing");
        row.querySelector(".edit-cell").innerHTML = `<button class="btn edit-btn">Edit</button>`;
        attachCommitmentEdit(row);
        
        currentEdit = null;
        savedData = null;
    } catch (error) {
        console.error(error);
        showErr(errBox, "Error saving changes");
    }
}

function attachCommitmentEdit(row) {
    const btn = row.querySelector(".edit-btn");
    if (!btn) return;
    btn.onclick = () => editCommitment(row);
}

// delete functionality
function addDeleteBtns(tableId, type) {
    const wrapper = document.getElementById(tableId).parentElement;
    
    let container = wrapper.querySelector(".delete-buttons-container");
    if (!container) {
        container = document.createElement("div");
        container.classList.add("delete-buttons-container");
        container.style.position = "absolute";
        container.style.left = "0";
        container.style.top = "0";
        container.style.pointerEvents = "none";
        wrapper.appendChild(container);
    }
    container.innerHTML = "";

    const rows = document.getElementById(tableId).querySelectorAll("tbody tr");

    rows.forEach(row => {
        const btn = document.createElement("button");
        btn.classList.add("delete-x");
        btn.textContent = "❌";
        btn.style.pointerEvents = "auto";
        btn.style.position = "absolute";
        btn.style.left = "-30px";
        btn.style.top = (row.offsetTop + row.offsetHeight / 2 - 12) + "px";

        btn.onclick = async () => {
            const id = row.dataset.id;
            if (!confirm("Are you sure you want to delete this record?")) return;

            try {
                const endpoints = {
                    subject: "/delete_subject",
                    availability: "/delete_availability",
                    commitment: "/delete_commitment"
                };
                
                const res = await fetch(endpoints[type], {
                    method: "POST",
                    body: toFormData({ id: id })
                });
                const result = await res.json();
                
                if (!result || result.status !== "success") {
                    alert(result?.message || "Failed to delete");
                    return;
                }

                row.remove();
                btn.remove();
                updateDeleteBtns(tableId);
            } catch (error) {
                console.error(error);
                alert("Error deleting record");
            }
        };

        container.appendChild(btn);
    });

    window.addEventListener("resize", () => updateDeleteBtns(tableId));
}

function updateDeleteBtns(tableId) {
    const wrapper = document.getElementById(tableId).parentElement;
    const container = wrapper.querySelector(".delete-buttons-container");
    if (!container) return;

    const rows = document.getElementById(tableId).querySelectorAll("tbody tr");
    const btns = container.querySelectorAll("button.delete-x");

    rows.forEach((row, i) => {
        if (btns[i]) {
            btns[i].style.top = (row.offsetTop + row.offsetHeight / 2 - 12) + "px";
        }
    });
}

// initialize everything
document.addEventListener("DOMContentLoaded", () => {
    addDeleteBtns("subjects-table", "subject");
    addDeleteBtns("availability-table", "availability");
    addDeleteBtns("commitments-table", "commitment");

    document.querySelectorAll("#commitments-table tbody tr").forEach(row => {
        if (!row.querySelector(".edit-cell")) {
            const cell = document.createElement("td");
            cell.classList.add("edit-cell");
            row.appendChild(cell);
        }
        attachCommitmentEdit(row);
    });

    document.querySelectorAll("#subjects-table tbody tr").forEach(row => 
        attachSubjectEdit(row)
    );

    document.querySelectorAll("#availability-table tbody tr").forEach(row => 
        attachAvailabilityEdit(row)
    );
});