const routes = { home: "/home", help: "/help", summary: "/summary-review", dashboard: "/timetable-dashboard" };
document.getElementById('home-title').onclick = () => location.href = routes.home;
document.getElementById('help-link').onclick = () => location.href = routes.help;
document.getElementById('footer-title').onclick = () => location.href = routes.home;

document.getElementById('generate-btn').onclick = async () => {
    try {
        const resp = await fetch("/generate_timetable", { method: "POST" });
        if (!resp.ok) throw new Error("Failed to generate timetable");
        const schedule = await resp.json();

        // Store in sessionStorage for dashboard
        sessionStorage.setItem("timetable", JSON.stringify(schedule));

        // Redirect to timetable dashboard
        window.location.href = routes.dashboard;
    } catch (err) {
        console.error("Error generating timetable:", err);
        alert("Failed to generate timetable. Please try again.");
    }
};

let editingRow = null;
let originalRowData = null;

function escapeHtml(str) {
    return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function ObjectToFormData(obj){ const fd=new FormData(); Object.entries(obj).forEach(([k,v])=>fd.append(k,v)); return fd; }
function showError(box,msg,show=true){ box.style.display=show?"block":"none"; box.textContent=msg; }

// -------------------- SUBJECTS INLINE EDIT --------------------
function enableInlineEditSubject(tr){
    if(editingRow) return;
    editingRow = tr;
    tr.classList.add("editing");

    originalRowData = {};
    ["name","exam","conf","notes"].forEach(f=>{
        const cell = tr.querySelector(`.cell-${f}`);
        if(cell) originalRowData[f] = cell.textContent.trim();
    });

    tr.querySelector(".cell-name").innerHTML = `<input class="inline-input name-input" value="${escapeHtml(originalRowData.name)}">`;
    tr.querySelector(".cell-exam").innerHTML = `<input class="inline-input exam-input" type="date" value="${originalRowData.exam}">`;
    tr.querySelector(".cell-conf").innerHTML = `
        <select class="inline-input conf-input">
            <option value="">Select</option>
            <option value="Low" ${originalRowData.conf==="Low"?"selected":""}>Low</option>
            <option value="Medium" ${originalRowData.conf==="Medium"?"selected":""}>Medium</option>
            <option value="High" ${originalRowData.conf==="High"?"selected":""}>High</option>
        </select>`;
    tr.querySelector(".cell-notes").innerHTML = `<input class="inline-input notes-input" value="${escapeHtml(originalRowData.notes)}">`;

    const editCell = tr.querySelector(".edit-cell");
    editCell.innerHTML = `
        <div class="edit-actions-wrapper">
            <button class="btn save-btn">Save</button>
            <button class="btn cancel-btn">Cancel</button>
        </div>
        <div class="inline-error" style="display:none;color:#c0392b;"></div>
    `;

    tr.querySelector(".save-btn").onclick = ()=> saveInlineEditSubject(tr);
    tr.querySelector(".cancel-btn").onclick = ()=> cancelInlineEditSubject(tr);
}

function cancelInlineEditSubject(tr){
    Object.keys(originalRowData).forEach(f=>{
        const cell = tr.querySelector(`.cell-${f}`);
        if(cell) cell.textContent = originalRowData[f];
    });
    tr.classList.remove("editing");
    tr.querySelector(".edit-cell").innerHTML = `<button class="btn edit-btn">Edit</button>`;
    attachEditButtonSubject(tr);
    editingRow=null; originalRowData=null;
}

async function saveInlineEditSubject(tr){
    const errorBox = tr.querySelector(".inline-error");
    const subjectId = tr.dataset.id;
    const payload = {
        id: subjectId,
        name: tr.querySelector(".name-input")?.value.trim() || "",
        exam_date: tr.querySelector(".exam-input")?.value.trim() || "",
        confidence: tr.querySelector(".conf-input")?.value || "",
        notes: tr.querySelector(".notes-input")?.value.trim() || ""
    };

    if(!payload.name && !payload.exam_date && !payload.confidence) return showError(errorBox,"Enter required fields");
    if(!payload.name) return showError(errorBox,"Enter subject name");
    if(!payload.exam_date) return showError(errorBox,"Enter exam date");
    if(!payload.confidence) return showError(errorBox,"Select confidence level");
    
    showError(errorBox,"Saving...", false);

    try{
        const resp = await fetch("/update_subject",{ method:"POST", body:ObjectToFormData(payload) });
        const data = await resp.json();
        if(!data || data.status!=="success") return showError(errorBox,data?.message||"Failed save");

        tr.querySelector(".cell-name").textContent = payload.name;
        tr.querySelector(".cell-exam").textContent = payload.exam_date;
        tr.querySelector(".cell-conf").textContent = payload.confidence;
        tr.querySelector(".cell-notes").textContent = payload.notes;

        tr.classList.remove("editing");
        tr.querySelector(".edit-cell").innerHTML = `<button class="btn edit-btn">Edit</button>`;
        attachEditButtonSubject(tr);
        editingRow=null; originalRowData=null;
    }catch(err){ console.error(err); showError(errorBox,"Error saving changes"); }
}

function attachEditButtonSubject(tr){
    const btn = tr.querySelector(".edit-btn");
    if(!btn) return;
    btn.onclick = ()=> enableInlineEditSubject(tr);
}

// -------------------- AVAILABILITY INLINE EDIT --------------------
function enableInlineEditAvailability(tr){
    if(editingRow) return;
    editingRow = tr;
    tr.classList.add("editing");

    originalRowData = {};
    ["start","end","day"].forEach(f=>{
        const c = tr.querySelector(`.cell-${f}`);
        if(c) originalRowData[f] = c.textContent.trim();
    });

    tr.querySelector(".cell-start").innerHTML = `<input class="inline-input start-input" type="time" value="${originalRowData.start}">`;
    tr.querySelector(".cell-end").innerHTML = `<input class="inline-input end-input" type="time" value="${originalRowData.end}">`;

    const cell = tr.querySelector(".cell-day");
    cell.innerHTML = "";
    const selectedDays = originalRowData.day.split(",").map(d=>d.trim());
    cell.appendChild(createDayMultiSelect(selectedDays));

    const editCell = tr.querySelector(".edit-cell");
    editCell.innerHTML = `
        <div class="edit-actions-wrapper">
            <button class="btn save-btn">Save</button>
            <button class="btn cancel-btn">Cancel</button>
        </div>
        <div class="inline-error" style="display:none;color:#c0392b;"></div>
    `;

    tr.querySelector(".save-btn").onclick = ()=> saveInlineEditAvailability(tr);
    tr.querySelector(".cancel-btn").onclick = ()=> cancelInlineEditAvailability(tr);
}

function cancelInlineEditAvailability(tr){
    Object.keys(originalRowData).forEach(f=>{
        const cell = tr.querySelector(`.cell-${f}`);
        if(cell) cell.textContent = originalRowData[f];
    });
    tr.classList.remove("editing");
    tr.querySelector(".edit-cell").innerHTML = `<button class="btn edit-btn">Edit</button>`;
    attachEditButtonAvailability(tr);
    editingRow=null; originalRowData=null;
}

async function saveInlineEditAvailability(tr){
    const errorBox = tr.querySelector(".inline-error");
    const slotId = tr.dataset.id;

    const start_time = tr.querySelector(".start-input")?.value;
    const end_time = tr.querySelector(".end-input")?.value;
    const dayContainer = tr.querySelector(".cell-day .multi-select");
    const selectedDays = Array.from(dayContainer.querySelectorAll("input:checked")).map(cb=>cb.value);

    if(!start_time || !end_time) return showError(errorBox,"Start/End required");
    if(end_time <= start_time) return showError(errorBox,"End Time must be after Start Time");
    if(selectedDays.length===0) return showError(errorBox,"Select at least one day");

    const payload = { id: slotId, start_time, end_time, day: selectedDays.join(", ") };
    showError(errorBox,"Saving...", false);

    try{
        const resp = await fetch("/update_availability",{ method:"POST", body:ObjectToFormData(payload) });
        const data = await resp.json();
        if(!data || data.status!=="success") return showError(errorBox,data?.message||"Failed save");

        tr.querySelector(".cell-start").textContent = payload.start_time;
        tr.querySelector(".cell-end").textContent = payload.end_time;
        tr.querySelector(".cell-day").textContent = payload.day;

        tr.classList.remove("editing");
        tr.querySelector(".edit-cell").innerHTML = `<button class="btn edit-btn">Edit</button>`;
        attachEditButtonAvailability(tr);
        editingRow=null; originalRowData=null;
    }catch(err){ console.error(err); showError(errorBox,"Error saving"); }
}

function attachEditButtonAvailability(tr){
    const btn = tr.querySelector(".edit-btn");
    if(!btn) return;
    btn.onclick = ()=> enableInlineEditAvailability(tr);
}

// -------------------- Multi-Select Dropdown --------------------
function createDayMultiSelect(selectedDays=[]){
    const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const container = document.createElement("div");
    container.classList.add("multi-select");

    const display = document.createElement("div");
    display.classList.add("multi-select-display");
    display.textContent = selectedDays.length?selectedDays.join(", "):"Select days...";
    if(selectedDays.length) display.classList.add("selected");
    container.appendChild(display);

    const options = document.createElement("div");
    options.classList.add("multi-select-options");
    days.forEach(d=>{
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" value="${d}" ${selectedDays.includes(d)?"checked":""}/> ${d}`;
        options.appendChild(label);
    });
    container.appendChild(options);

    display.onclick = e=>{
        e.stopPropagation();
        container.classList.toggle("active");
    };
    options.querySelectorAll("input[type=checkbox]").forEach(cb=>{
        cb.addEventListener("change",()=>{
            const checked = Array.from(options.querySelectorAll("input:checked")).map(i=>i.value);
            display.textContent = checked.length?checked.join(", "):"Select days...";
            display.classList.toggle("selected", checked.length>0);
        });
    });

    document.addEventListener("click",e=>{
        if(!container.contains(e.target)) container.classList.remove("active");
    });

    return container;
}

// -------------------- ORIENTATION --------------------
function checkOrientation() {
  if(window.innerHeight > window.innerWidth){
      document.body.classList.add("portrait");
  } else {
      document.body.classList.remove("portrait");
  }
}

window.addEventListener("resize", checkOrientation);
window.addEventListener("load", checkOrientation);

// -------------------- COMMITMENTS INLINE EDIT -------------------
function enableInlineEditCommitment(tr) {
    if (editingRow) return;
    editingRow = tr;
    tr.classList.add("editing");

    originalRowData = {};
    ["name","date","start","end","repeat"].forEach(f=>{
        const c = tr.querySelector(`.cell-${f}`);
        if(c) originalRowData[f] = c.textContent.trim();
    });

    tr.querySelector(".cell-name").innerHTML = `<input class="inline-input name-input" value="${escapeHtml(originalRowData.name)}">`;
    tr.querySelector(".cell-date").innerHTML = `<input class="inline-input date-input" type="date" value="${originalRowData.date}">`;
    tr.querySelector(".cell-start").innerHTML = `<input class="inline-input start-input" type="time" value="${originalRowData.start}">`;
    tr.querySelector(".cell-end").innerHTML = `<input class="inline-input end-input" type="time" value="${originalRowData.end}">`;

    const repeatOptions = ["Weekly","Daily","Custom"];
    let selectHTML = `<select class="inline-input repeat-input">`;
    repeatOptions.forEach(opt=>{
        selectHTML += `<option value="${opt}" ${originalRowData.repeat===opt?"selected":""}>${opt}</option>`;
    });
    selectHTML += `</select>`;
    tr.querySelector(".cell-repeat").innerHTML = selectHTML;

    const editCell = tr.querySelector(".edit-cell");
    if(!editCell){
        const td = document.createElement("td");
        td.classList.add("edit-cell");
        tr.appendChild(td);
    }
    tr.querySelector(".edit-cell").innerHTML = `
        <div class="edit-actions-wrapper">
            <button class="btn save-btn">Save</button>
            <button class="btn cancel-btn">Cancel</button>
        </div>
        <div class="inline-error" style="display:none;color:#c0392b;"></div>
    `;

    tr.querySelector(".save-btn").onclick = () => saveInlineEditCommitment(tr);
    tr.querySelector(".cancel-btn").onclick = () => cancelInlineEditCommitment(tr);
}

function cancelInlineEditCommitment(tr){
    Object.keys(originalRowData).forEach(f=>{
        const cell = tr.querySelector(`.cell-${f}`);
        if(cell) cell.textContent = originalRowData[f];
    });
    tr.classList.remove("editing");
    tr.querySelector(".edit-cell").innerHTML = `<button class="btn edit-btn">Edit</button>`;
    attachEditButtonCommitment(tr);
    editingRow=null; originalRowData=null;
}

async function saveInlineEditCommitment(tr){
    const errorBox = tr.querySelector(".inline-error");
    const commitmentId = tr.dataset.id;

    const name = tr.querySelector(".name-input")?.value.trim();
    let date = tr.querySelector(".date-input")?.value;
    const start_time = tr.querySelector(".start-input")?.value;
    const end_time = tr.querySelector(".end-input")?.value;
    const repeat_pattern = tr.querySelector(".repeat-input")?.value.trim();

    if(!name || !date || !start_time || !end_time || !repeat_pattern) 
        return showError(errorBox,"Fill all required fields");
    
    const today = new Date().toISOString().split("T")[0];
    const maxDate = '2030-12-31';
    if(date < today) date = today;
    if(date > maxDate) date = maxDate;

    if(end_time <= start_time) return showError(errorBox,"End time must be after Start");

    const payload = { id: commitmentId, name, day: date, start_time, end_time, repeat_pattern };
    showError(errorBox,"Saving...", false);

    try{
        const resp = await fetch("/update_commitment", { method:"POST", body:ObjectToFormData(payload) });
        const data = await resp.json();
        if(!data || data.status!=="success") return showError(errorBox,data?.message||"Failed save");

        tr.querySelector(".cell-name").textContent = name;
        tr.querySelector(".cell-date").textContent = date;
        tr.querySelector(".cell-start").textContent = start_time;
        tr.querySelector(".cell-end").textContent = end_time;
        tr.querySelector(".cell-repeat").textContent = repeat_pattern;

        tr.classList.remove("editing");
        tr.querySelector(".edit-cell").innerHTML = `<button class="btn edit-btn">Edit</button>`;
        attachEditButtonCommitment(tr);
        editingRow=null; originalRowData=null;
    } catch(err){ console.error(err); showError(errorBox,"Error saving changes"); }
}

function attachEditButtonCommitment(tr){
    const btn = tr.querySelector(".edit-btn");
    if(!btn) return;
    btn.onclick = () => enableInlineEditCommitment(tr);
}

// -------------------- DELETE BUTTONS OUTSIDE --------------------
function attachDeleteButtonsOutside(tableId, type) {
    const tableWrapper = document.getElementById(tableId).parentElement;
    
    let container = tableWrapper.querySelector(".delete-buttons-container");
    if (!container) {
        container = document.createElement("div");
        container.classList.add("delete-buttons-container");
        container.style.position = "absolute";
        container.style.left = "0";
        container.style.top = "0";
        container.style.pointerEvents = "none";
        tableWrapper.appendChild(container);
    }
    container.innerHTML = "";

    const rows = document.getElementById(tableId).querySelectorAll("tbody tr");

    rows.forEach(tr => {
        const btn = document.createElement("button");
        btn.classList.add("delete-x");
        btn.textContent = "❌";

        btn.style.pointerEvents = "auto";

        btn.style.position = "absolute";
        btn.style.left = "-30px";
        btn.style.top = (tr.offsetTop + tr.offsetHeight / 2 - 12) + "px";

        btn.onclick = async () => {
            const id = tr.dataset.id;
            if(!confirm("Are you sure you want to delete this record?")) return;

            try {
                const endpointMap = {
                    subject: "/delete_subject",
                    availability: "/delete_availability",
                    commitment: "/delete_commitment"
                };
                const resp = await fetch(endpointMap[type], {
                    method: "POST",
                    body: ObjectToFormData({id})
                });
                const data = await resp.json();
                if(!data || data.status!=="success"){ alert(data?.message||"Failed"); return; }

                tr.remove();
                btn.remove();
                updateDeleteButtonsPosition(tableId);
            } catch(err){ console.error(err); alert("Error deleting record"); }
        };

        container.appendChild(btn);
    });

    window.addEventListener("resize", () => updateDeleteButtonsPosition(tableId));
}

function updateDeleteButtonsPosition(tableId){
    const tableWrapper = document.getElementById(tableId).parentElement;
    const container = tableWrapper.querySelector(".delete-buttons-container");
    if(!container) return;

    const rows = document.getElementById(tableId).querySelectorAll("tbody tr");
    const buttons = container.querySelectorAll("button.delete-x");

    rows.forEach((tr, i) => {
        if(buttons[i]){
            buttons[i].style.top = (tr.offsetTop + tr.offsetHeight / 2 - 12) + "px";
        }
    });
}

// -------------------- INIT --------------------
document.addEventListener("DOMContentLoaded", ()=>{
    attachDeleteButtonsOutside("subjects-table","subject");
    attachDeleteButtonsOutside("availability-table","availability");
    attachDeleteButtonsOutside("commitments-table","commitment");

    document.querySelectorAll("#commitments-table tbody tr").forEach(tr=>{
        if(!tr.querySelector(".edit-cell")){
            const td = document.createElement("td");
            td.classList.add("edit-cell");
            tr.appendChild(td);
        }
        attachEditButtonCommitment(tr);
    });

    document.querySelectorAll("#subjects-table tbody tr").forEach(tr=>attachEditButtonSubject(tr));
    document.querySelectorAll("#availability-table tbody tr").forEach(tr=>attachEditButtonAvailability(tr));
});