from flask import Flask, render_template, request, jsonify
import sqlite3
from datetime import datetime
from main_algo import generate_timetable

app = Flask(__name__)

DB_PATH = "database.db"
MAX_DATE = '2030-12-31'

# ------------------- DATABASE HELPERS -------------------

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db_connection() as conn:
        cur = conn.cursor()

        # Create tables if they don't exist
        cur.execute('''
            CREATE TABLE IF NOT EXISTS subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                exam_date TEXT NOT NULL,
                confidence TEXT NOT NULL,
                notes TEXT
            )
        ''')

        cur.execute('''
            CREATE TABLE IF NOT EXISTS availability (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                day TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL
            )
        ''')

        cur.execute('''
            CREATE TABLE IF NOT EXISTS commitments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                day TEXT NOT NULL,
                name TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                repeat_pattern TEXT NOT NULL
            )
        ''')

        cur.execute("""
            CREATE TABLE IF NOT EXISTS revision_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                FOREIGN KEY(subject_id) REFERENCES subjects(id)
            )
        """)

        # Normalize availability: split multi-day entries into individual rows
        availability_rows = cur.execute("SELECT * FROM availability").fetchall()
        for row in availability_rows:
            if ',' in row['day']:
                days = [d.strip() for d in row['day'].split(',')]
                cur.execute("DELETE FROM availability WHERE id = ?", (row['id'],))
                for day in days:
                    # Prevent duplicates
                    exists = cur.execute("SELECT id FROM availability WHERE day=? AND start_time=? AND end_time=?", 
                                         (day, row['start_time'], row['end_time'])).fetchone()
                    if not exists:
                        cur.execute("INSERT INTO availability (day, start_time, end_time) VALUES (?, ?, ?)",
                                    (day, row['start_time'], row['end_time']))
        conn.commit()

# Initialize DB and normalize
init_db()

# ------------------- ROUTES -------------------

@app.route('/')
@app.route('/home')
def home():
    return render_template("home.html")

@app.route('/subject-input')
def subject_input():
    edit_id = request.args.get("edit_id")
    subject = None
    if edit_id:
        with get_db_connection() as conn:
            subject = conn.execute("SELECT * FROM subjects WHERE id = ?", (edit_id,)).fetchone()
    return render_template("subject-input.html", subject=subject)

# ------------------- SUBJECT ROUTES -------------------

@app.route("/add_subject", methods=["POST"])
def add_subject():
    subject_id = request.form.get("id")
    name = request.form.get("name", "").strip()
    exam_date = request.form.get("exam_date", "").strip()
    confidence = request.form.get("confidence", "").strip()
    notes = request.form.get("notes", "").strip()

    if not name or not exam_date or not confidence:
        return jsonify({"status": "error", "message": "Missing required fields"}), 400

    # Normalize name
    name_norm = name.lower()

    # Validate date
    try:
        datetime.strptime(exam_date, '%Y-%m-%d')
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid date format"}), 400

    with get_db_connection() as conn:
        cur = conn.cursor()

        # Check for duplicate subject (ignore current id if updating)
        if subject_id:
            cur.execute("SELECT id FROM subjects WHERE LOWER(name)=? AND id != ?", (name_norm, subject_id))
        else:
            cur.execute("SELECT id FROM subjects WHERE LOWER(name)=?", (name_norm,))
        if cur.fetchone():
            return jsonify({
                "status": "error",
                "message": f"Subject '{name}' already exists. Please edit the existing subject."
            }), 400

        if subject_id:
            cur.execute("""
                UPDATE subjects
                SET name=?, exam_date=?, confidence=?, notes=?
                WHERE id=?
            """, (name, exam_date, confidence, notes, subject_id))
        else:
            cur.execute("""
                INSERT INTO subjects (name, exam_date, confidence, notes)
                VALUES (?, ?, ?, ?)
            """, (name, exam_date, confidence, notes))
        conn.commit()

    return jsonify({"status": "success"}), 200

@app.route("/update_subject", methods=["POST"])
def update_subject():
    subject_id = request.form.get("id")
    name = request.form.get("name", "").strip()
    exam_date = request.form.get("exam_date", "").strip()
    confidence = request.form.get("confidence", "").strip()
    notes = request.form.get("notes", "").strip()

    if not subject_id or not name or not exam_date or not confidence:
        return jsonify({"status": "error", "message": "Missing required fields"}), 400

    # Normalize name
    name_norm = name.lower()

    try:
        d = datetime.strptime(exam_date, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid exam date"}), 400

    if d < datetime.utcnow().date():
        return jsonify({"status": "error", "message": "Exam date must be today or later"}), 400
    if exam_date > MAX_DATE:
        return jsonify({"status": "error", "message": f"Exam date cannot be after {MAX_DATE}"}), 400

    with get_db_connection() as conn:
        cur = conn.cursor()
        
        # Check if subject exists
        cur.execute("SELECT id FROM subjects WHERE id = ?", (subject_id,))
        if not cur.fetchone():
            return jsonify({"status": "error", "message": "Subject not found"}), 404
        
        # Check for duplicate subject name (excluding current subject)
        cur.execute("SELECT id FROM subjects WHERE LOWER(name)=? AND id != ?", (name_norm, subject_id))
        if cur.fetchone():
            return jsonify({
                "status": "error",
                "message": f"Subject '{name}' already exists. Please edit the existing subject."
            }), 400

        cur.execute("""
            UPDATE subjects
            SET name=?, exam_date=?, confidence=?, notes=?
            WHERE id=?
        """, (name, exam_date, confidence, notes, subject_id))
        conn.commit()

    return jsonify({"status": "success"}), 200

# ------------------- AVAILABILITY ROUTES -------------------

def time_to_minutes(time_str):
    h, m = map(int, time_str.split(":"))
    return h*60 + m

@app.route("/add_availability", methods=["POST"])
def add_availability():
    start_time = request.form.get("start_time", "").strip()
    end_time = request.form.get("end_time", "").strip()
    days = request.form.get("day", "").strip()  # comma-separated string

    if not start_time or not end_time or not days:
        return jsonify({"status": "error", "message": "Missing required fields"}), 400

    try:
        datetime.strptime(start_time, "%H:%M")
        datetime.strptime(end_time, "%H:%M")
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid time format"}), 400

    if end_time <= start_time:
        return jsonify({"status": "error", "message": "End time must be after start time"}), 400

    day_list = [d.strip() for d in days.split(",")]

    with get_db_connection() as conn:
        cur = conn.cursor()
        
        # Check if any of the days already have availability
        for day in day_list:
            existing = cur.execute("SELECT * FROM availability WHERE day = ?", (day,)).fetchone()
            if existing:
                return jsonify({
                    "status": "error",
                    "message": f"Availability for {day} already exists ({existing['start_time']} - {existing['end_time']}). Only one availability slot per day is allowed."
                }), 400
        
        # Insert availability for each day
        for day in day_list:
            cur.execute("INSERT INTO availability (day, start_time, end_time) VALUES (?, ?, ?)",
                        (day, start_time, end_time))
        conn.commit()
    return jsonify({"status": "success"}), 200

@app.route("/update_availability", methods=["POST"])
def update_availability():
    slot_id = request.form.get("id")
    start_time = request.form.get("start_time", "").strip()
    end_time = request.form.get("end_time", "").strip()
    day = request.form.get("day", "").strip()

    if not slot_id or not start_time or not end_time or not day:
        return jsonify({"status": "error", "message": "Missing required fields"}), 400

    try:
        datetime.strptime(start_time, "%H:%M")
        datetime.strptime(end_time, "%H:%M")
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid time format"}), 400

    if end_time <= start_time:
        return jsonify({"status": "error", "message": "End time must be after start time"}), 400

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM availability WHERE id = ?", (slot_id,))
        if not cur.fetchone():
            return jsonify({"status": "error", "message": "Availability slot not found"}), 404

        new_start = time_to_minutes(start_time)
        new_end = time_to_minutes(end_time)
        existing = cur.execute("SELECT * FROM availability WHERE day = ? AND id != ?", (day, slot_id)).fetchall()
        for a in existing:
            a_start = time_to_minutes(a["start_time"])
            a_end = time_to_minutes(a["end_time"])
            if not (new_end <= a_start or new_start >= a_end):
                return jsonify({
                    "status": "error",
                    "message": f"Updated slot overlaps with existing slot {a['start_time']} - {a['end_time']} on {day}."
                }), 400

        cur.execute("""
            UPDATE availability
            SET start_time=?, end_time=?, day=?
            WHERE id=?
        """, (start_time, end_time, day, slot_id))
        conn.commit()
    return jsonify({"status": "success"}), 200

# ------------------- COMMITMENTS ROUTES -------------------

@app.route("/add_commitment", methods=["POST"])
def add_commitment():
    name = request.form.get("name", "").strip()
    day = request.form.get("day", "").strip()
    start_time = request.form.get("start_time", "").strip()
    end_time = request.form.get("end_time", "").strip()
    repeat_pattern = request.form.get("repeat_pattern", "").strip()

    if not all([name, day, start_time, end_time, repeat_pattern]):
        return jsonify({"status": "error", "message": "Missing required fields"}), 400

    if end_time <= start_time:
        return jsonify({"status": "error", "message": "End time must be after start time"}), 400

    today = datetime.utcnow().date()
    max_date = datetime.strptime(MAX_DATE, '%Y-%m-%d').date()
    try:
        day_dt = datetime.strptime(day, '%Y-%m-%d').date()
        if day_dt < today: day_dt = today
        if day_dt > max_date: day_dt = max_date
        day = day_dt.strftime('%Y-%m-%d')
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid date"}), 400

    new_start = time_to_minutes(start_time)
    new_end = time_to_minutes(end_time)

    with get_db_connection() as conn:
        cur = conn.cursor()
        existing = cur.execute("SELECT * FROM commitments WHERE day = ?", (day,)).fetchall()
        for c in existing:
            c_start = time_to_minutes(c["start_time"])
            c_end = time_to_minutes(c["end_time"])
            if not (new_end <= c_start or new_start >= c_end):
                return jsonify({
                    "status": "error",
                    "message": f"Commitment '{name}' overlaps with existing commitment '{c['name']}' from {c['start_time']} to {c['end_time']}."
                }), 400

        cur.execute("""
            INSERT INTO commitments (name, day, start_time, end_time, repeat_pattern)
            VALUES (?, ?, ?, ?, ?)
        """, (name, day, start_time, end_time, repeat_pattern))
        conn.commit()
    return jsonify({"status": "success"}), 200

@app.route("/update_commitment", methods=["POST"])
def update_commitment():
    commitment_id = request.form.get("id")
    name = request.form.get("name", "").strip()
    day = request.form.get("day", "").strip()
    start_time = request.form.get("start_time", "").strip()
    end_time = request.form.get("end_time", "").strip()
    repeat_pattern = request.form.get("repeat_pattern", "").strip()

    if not all([commitment_id, name, day, start_time, end_time, repeat_pattern]):
        return jsonify({"status": "error", "message": "Missing required fields"}), 400

    if end_time <= start_time:
        return jsonify({"status": "error", "message": "End time must be after start time"}), 400

    new_start = time_to_minutes(start_time)
    new_end = time_to_minutes(end_time)

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM commitments WHERE id = ?", (commitment_id,))
        if not cur.fetchone():
            return jsonify({"status": "error", "message": "Commitment not found"}), 404

        # Check overlaps with other commitments
        existing = cur.execute("SELECT * FROM commitments WHERE day = ? AND id != ?", (day, commitment_id)).fetchall()
        for c in existing:
            c_start = time_to_minutes(c["start_time"])
            c_end = time_to_minutes(c["end_time"])
            if not (new_end <= c_start or new_start >= c_end):
                return jsonify({
                    "status": "error",
                    "message": f"Updated commitment '{name}' overlaps with existing commitment '{c['name']}' from {c['start_time']} to {c['end_time']}."
                }), 400

        cur.execute("""
            UPDATE commitments
            SET name=?, day=?, start_time=?, end_time=?, repeat_pattern=?
            WHERE id=?
        """, (name, day, start_time, end_time, repeat_pattern, commitment_id))
        conn.commit()
    return jsonify({"status": "success"}), 200

# ------------------- SUMMARY / DASHBOARD / HELP -------------------

@app.route("/summary-review")
def summary_review():
    with get_db_connection() as conn:
        subjects = conn.execute("SELECT * FROM subjects").fetchall()
        availability = conn.execute("SELECT * FROM availability").fetchall()
        commitments = conn.execute("SELECT * FROM commitments").fetchall()
    return render_template("summary-review.html", subjects=subjects, availability=availability, commitments=commitments)

@app.route("/timetable-dashboard")
def timetable_dashboard():
    return render_template("timetable-dashboard.html")

@app.route("/help")
def help_page():
    return render_template("help.html")

# ------------------- DELETE ROUTES -------------------

@app.route("/delete_subject", methods=["POST"])
def delete_subject():
    subject_id = request.form.get("id")
    if not subject_id:
        return jsonify({"status": "error", "message": "Missing subject id"}), 400

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM subjects WHERE id = ?", (subject_id,))
        if not cur.fetchone():
            return jsonify({"status": "error", "message": "Subject not found"}), 404
        cur.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
        conn.commit()
    return jsonify({"status": "success"}), 200

@app.route("/delete_availability", methods=["POST"])
def delete_availability():
    slot_id = request.form.get("id")
    if not slot_id:
        return jsonify({"status": "error", "message": "Missing slot id"}), 400

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM availability WHERE id = ?", (slot_id,))
        if not cur.fetchone():
            return jsonify({"status": "error", "message": "Availability slot not found"}), 404
        cur.execute("DELETE FROM availability WHERE id = ?", (slot_id,))
        conn.commit()
    return jsonify({"status": "success"}), 200

@app.route("/delete_commitment", methods=["POST"])
def delete_commitment():
    commitment_id = request.form.get("id")
    if not commitment_id:
        return jsonify({"status": "error", "message": "Missing commitment id"}), 400

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM commitments WHERE id = ?", (commitment_id,))
        if not cur.fetchone():
            return jsonify({"status": "error", "message": "Commitment not found"}), 404
        cur.execute("DELETE FROM commitments WHERE id = ?", (commitment_id,))
        conn.commit()
    return jsonify({"status": "success"}), 200

# ------------------- TIMETABLE GENERATION -------------------

@app.route("/generate_timetable", methods=["POST"])
def generate_timetable_route():
    """
    Generate timetable and store revision sessions in database
    Returns the timetable data as JSON for the frontend
    """
    try:
        # Generate the timetable
        timetable = generate_timetable()
        
        if not timetable:
            return jsonify({"status": "error", "message": "No timetable generated"}), 400
        
        # Clear existing revision sessions
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM revision_sessions")
            
            # Get subject IDs for mapping
            subjects = cur.execute("SELECT id, name FROM subjects").fetchall()
            subject_map = {subj['name']: subj['id'] for subj in subjects}
            
            # Insert new revision sessions into database
            for date_str, sessions in timetable.items():
                for session_name, start_time, end_time in sessions:
                    # Skip commitments (they're not revision sessions)
                    if session_name in subject_map:
                        subject_id = subject_map[session_name]
                        cur.execute("""
                            INSERT INTO revision_sessions (subject_id, date, start_time, end_time)
                            VALUES (?, ?, ?, ?)
                        """, (subject_id, date_str, start_time, end_time))
            
            conn.commit()
        
        # Convert timetable to frontend-friendly format
        formatted_timetable = {}
        for date_str, sessions in timetable.items():
            formatted_sessions = []
            for session_name, start_time, end_time in sessions:
                # Convert time strings to float (e.g., "09:30" -> 9.5)
                start_parts = start_time.split(":")
                start_float = int(start_parts[0]) + int(start_parts[1]) / 60
                
                end_parts = end_time.split(":")
                end_float = int(end_parts[0]) + int(end_parts[1]) / 60
                
                formatted_sessions.append({
                    "subject": session_name,
                    "start": start_float,
                    "end": end_float
                })
            formatted_timetable[date_str] = formatted_sessions
        
        return jsonify(formatted_timetable), 200
        
    except Exception as e:
        print(f"Error generating timetable: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/get_revision_sessions", methods=["GET"])
def get_revision_sessions():
    """
    Get all revision sessions from database with notes
    Optional query params: start_date, end_date for filtering
    """
    start_date = request.args.get("start_date")  # Format: YYYY-MM-DD
    end_date = request.args.get("end_date")      # Format: YYYY-MM-DD
    
    try:
        with get_db_connection() as conn:
            if start_date and end_date:
                # Fetch sessions within date range with notes
                sessions = conn.execute("""
                    SELECT rs.*, s.name as subject_name, s.notes as subject_notes
                    FROM revision_sessions rs
                    JOIN subjects s ON rs.subject_id = s.id
                    WHERE rs.date BETWEEN ? AND ?
                    ORDER BY rs.date, rs.start_time
                """, (start_date, end_date)).fetchall()
            else:
                # Fetch all sessions with notes
                sessions = conn.execute("""
                    SELECT rs.*, s.name as subject_name, s.notes as subject_notes
                    FROM revision_sessions rs
                    JOIN subjects s ON rs.subject_id = s.id
                    ORDER BY rs.date, rs.start_time
                """).fetchall()
        
        # Format for frontend
        result = {}
        for session in sessions:
            date_str = session['date']
            if date_str not in result:
                result[date_str] = []
            
            # Convert times to float
            start_parts = session['start_time'].split(":")
            start_float = int(start_parts[0]) + int(start_parts[1]) / 60
            
            end_parts = session['end_time'].split(":")
            end_float = int(end_parts[0]) + int(end_parts[1]) / 60
            
            result[date_str].append({
                "subject": session['subject_name'],
                "start": start_float,
                "end": end_float,
                "notes": session['subject_notes'] or ""
            })
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"Error fetching sessions: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/check-timetable')
def check_timetable():
    #Check if a timetable with any revision sessions exists 
    with get_db_connection() as conn:
        result = conn.execute("""
            SELECT COUNT(*) as count 
            FROM revision_sessions rs
            JOIN subjects s ON rs.subject_id = s.id
        """).fetchone()
        session_count = result['count'] if result else 0
        
    return jsonify({
        'exists': session_count > 0,
        'has_sessions': session_count > 0,
        'count': session_count
    })

# ------------------- MAIN -------------------

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5002)