import random
from datetime import datetime, timedelta
import sqlite3


DB_PATH = "database.db"


# ============================================================================
# DATABASE & UTILITIES
# ============================================================================

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def time_to_minutes(time_str):
    h, m = map(int, time_str.split(":"))
    return h * 60 + m


def minutes_to_time(minutes):
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"


# ============================================================================
# STAGE 1: PRIORITY CALCULATION
# ============================================================================

def calculate_priorities(subjects, today):
    """
    Calculate weighted priority: priority = (3 × proximity_score) + (2 × confidence_score)
    """
    subject_list = []
    
    for s in subjects:
        exam_date = datetime.strptime(s['exam_date'], "%Y-%m-%d").date()
        days_to_exam = max((exam_date - today).days, 0)
        
        proximity_score = 1.0 / (days_to_exam + 1)
        confidence_map = {'low': 3, 'medium': 2, 'high': 1}
        confidence_score = confidence_map.get(s['confidence'].lower(), 2)
        
        priority = (3 * proximity_score) + (2 * confidence_score)
        
        subject_list.append({
            'id': s['id'],
            'name': s['name'],
            'priority': priority,
            'exam_date': exam_date,
            'sessions_needed': 0
        })
    
    subject_list.sort(key=lambda x: x['priority'], reverse=True)
    return subject_list


# ============================================================================
# STAGE 2: PROCESSING AVAILABILITY & COMMITMENT
# ============================================================================

def get_commitments_for_date(commitments, date):
    """Get commitments occurring on a specific date"""
    day_commitments = []
    
    for c in commitments:
        if not c['day'] or not c['start_time'] or not c['end_time']:
            continue
        
        commitment_date = datetime.strptime(c['day'], "%Y-%m-%d").date()
        repeat = c['repeat_pattern']
        
        should_include = False
        if repeat in ['One-Time', 'Custom']:
            should_include = (date == commitment_date)
        elif repeat == 'Daily':
            should_include = (date >= commitment_date)
        elif repeat == 'Weekly':
            should_include = (date >= commitment_date and 
                            date.weekday() == commitment_date.weekday())
        
        if should_include:
            day_commitments.append({
                'name': c['name'],
                'start_mins': time_to_minutes(c['start_time']),
                'end_mins': time_to_minutes(c['end_time'])
            })
    
    return day_commitments


def has_overlap(commitments, start, end):
    """Simple O(n) overlap check - checks if time slot conflicts with any commitment"""
    for c in commitments:
        if start < c['end_mins'] and end > c['start_mins']:
            return True
    return False


def generate_slots(availability, commitments, start_date, end_date):
    """
    Generate 1-hour slots using simple overlap detection.
    Converts availability to discrete 1-hour blocks, filtering commitments.
    """
    day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    all_slots = []
    
    current_date = start_date
    while current_date <= end_date:
        day_name = day_names[current_date.weekday()]
        
        # Get commitments for this day
        day_commitments = get_commitments_for_date(commitments, current_date)
        
        # Generate slots from availability
        for avail in availability:
            if avail['day'] != day_name:
                continue
            
            start_mins = time_to_minutes(avail['start_time'])
            end_mins = time_to_minutes(avail['end_time'])
            
            current_time = start_mins
            while current_time + 60 <= end_mins:
                slot_end = current_time + 60
                
                # Simple overlap check
                if not has_overlap(day_commitments, current_time, slot_end):
                    all_slots.append({
                        'date': current_date,
                        'start_mins': current_time,
                        'end_mins': slot_end
                    })
                
                current_time += 60
        
        current_date += timedelta(days=1)
    
    return all_slots


# ============================================================================
# STAGE 3: PROPORTIONAL SESSION ALLOCATION
# ============================================================================

def allocate_sessions(subjects, total_slots):
    """
    Distribute sessions proportionally by priority.
    Each subject gets: (subject_priority / total_priority) × total_slots
    Minimum: 1 session per subject
    """
    total_priority = sum(s['priority'] for s in subjects)
    
    if total_priority == 0:
        per_subject = total_slots // len(subjects)
        for s in subjects:
            s['sessions_needed'] = per_subject
    else:
        allocated = 0
        for i, s in enumerate(subjects):
            if i == len(subjects) - 1:
                # Last subject gets remainder
                s['sessions_needed'] = total_slots - allocated
            else:
                sessions = int((s['priority'] / total_priority) * total_slots)
                s['sessions_needed'] = max(1, sessions)
                allocated += s['sessions_needed']


# ============================================================================
# STAGE 4, 5 & 6: GREEDY PLACEMENT + BREAK ENFORCEMENT + RANDOMIZATION
# ============================================================================

def schedule_sessions(subjects, all_slots):
    """
    Priority-biased round-robin scheduling with 30-minute break enforcement.
    Cycles through subjects in priority order, enforcing gaps between sessions.
    """
    # Group slots by day, sort within each day, then shuffle subject order
    slots_by_day = {}
    for slot in all_slots:
        date_str = slot['date'].strftime("%Y-%m-%d")
        if date_str not in slots_by_day:
            slots_by_day[date_str] = []
        slots_by_day[date_str].append(slot)
    
    # Sort slots within each day by time (for break enforcement)
    for day_slots in slots_by_day.values():
        day_slots.sort(key=lambda x: x['start_mins'])
    
    # Recombine in date order
    sorted_slots = []
    for date_str in sorted(slots_by_day.keys()):
        sorted_slots.extend(slots_by_day[date_str])
    
    subjects_to_schedule = [s for s in subjects if s['sessions_needed'] > 0]
    
    # RANDOMIZATION: Shuffle subject order (not slot order)
    random.shuffle(subjects_to_schedule)
    
    if len(subjects_to_schedule) == 0:
        return {}
    
    all_slots = sorted_slots  # Use the sorted slots
    
    timetable = {}
    last_session_end = {}  # Track end time of last session per day
    subject_index = 0
    
    for slot in all_slots:
        if len(subjects_to_schedule) == 0:
            break
        
        date_str = slot['date'].strftime("%Y-%m-%d")
        if date_str not in timetable:
            timetable[date_str] = []
            last_session_end[date_str] = 0
        
        # Try to schedule subjects (round-robin)
        attempts = 0
        scheduled = False
        
        while attempts < len(subjects_to_schedule) and not scheduled:
            subject = subjects_to_schedule[subject_index]
            
            # Check 1: Sessions remaining?
            if subject['sessions_needed'] <= 0:
                subject_index = (subject_index + 1) % len(subjects_to_schedule)
                attempts += 1
                continue
            
            # Check 2: Before exam date?
            if slot['date'] > subject['exam_date']:
                subject_index = (subject_index + 1) % len(subjects_to_schedule)
                attempts += 1
                continue
            
            # Check 3: 30-minute break satisfied?
            break_satisfied = (slot['start_mins'] >= last_session_end[date_str] + 30)
            
            if break_satisfied:
                # Schedule session
                timetable[date_str].append({
                    'subject': subject['name'],
                    'start': minutes_to_time(slot['start_mins']),
                    'end': minutes_to_time(slot['end_mins'])
                })
                
                last_session_end[date_str] = slot['end_mins']
                subject['sessions_needed'] -= 1
                
                # Remove subject if done
                if subject['sessions_needed'] <= 0:
                    subjects_to_schedule.pop(subject_index)
                    if len(subjects_to_schedule) > 0:
                        subject_index = subject_index % len(subjects_to_schedule)
                else:
                    subject_index = (subject_index + 1) % len(subjects_to_schedule)
                
                scheduled = True
            else:
                # Try next subject
                subject_index = (subject_index + 1) % len(subjects_to_schedule)
                attempts += 1
    
    return timetable


# ============================================================================
# MAIN TIMETABLE GENERATION
# ============================================================================

def generate_timetable():
    """
    Multi-stage priority-based scheduling algorithm:
    1. Priority calculation (weighted formula)
    2. Slot generation with simple overlap detection
    3. Proportional session allocation
    4. Greedy placement with round-robin
    5. Break enforcement (30-minute gaps)
    6. Controlled randomness (shuffle subject order)
    """
    today = datetime.now().date()
    
    # Get data
    with get_db_connection() as conn:
        subjects = conn.execute("SELECT * FROM subjects").fetchall()
        availability = conn.execute("SELECT * FROM availability").fetchall()
        commitments = conn.execute("SELECT * FROM commitments").fetchall()
    
    if not subjects:
        return {}
    
    # Find last exam
    last_exam = max(datetime.strptime(s['exam_date'], "%Y-%m-%d").date() 
                   for s in subjects)
    
    # Stage 1: Calculate priorities
    subject_list = calculate_priorities(subjects, today)
    
    # Stage 2: Generate slots with simple overlap check
    all_slots = generate_slots(availability, commitments, today, last_exam)
    
    # Stage 3: Allocate sessions proportionally
    allocate_sessions(subject_list, len(all_slots))
    
    # Stage 4 & 5 & 6: Schedule with round-robin + breaks + randomization
    timetable = schedule_sessions(subject_list, all_slots)
    
    # Add commitments for display
    current_date = today
    while current_date <= last_exam:
        date_str = current_date.strftime("%Y-%m-%d")
        day_commitments = get_commitments_for_date(commitments, current_date)
        
        if day_commitments:
            if date_str not in timetable:
                timetable[date_str] = []
            
            for c in day_commitments:
                timetable[date_str].append({
                    'subject': f"[COMMITMENT] {c['name']}",
                    'start': minutes_to_time(c['start_mins']),
                    'end': minutes_to_time(c['end_mins'])
                })
        
        current_date += timedelta(days=1)
    
    # Sort by time and convert to tuples
    final_timetable = {}
    for date_str, sessions in timetable.items():
        sessions.sort(key=lambda x: time_to_minutes(x['start']))
        final_timetable[date_str] = [
            (s['subject'], s['start'], s['end']) for s in sessions
        ]
    
    return final_timetable


# ============================================================================
# TEST
# ============================================================================

if __name__ == "__main__":
    timetable = generate_timetable()
    
    print("="*70)
    print("TIMETABLE")
    print("="*70)
    
    revision_count = 0
    commitment_count = 0
    
    for day in sorted(timetable.keys()):
        print(f"\n{day}:")
        for subject, start, end in timetable[day]:
            print(f"  {start} - {end}: {subject}")
            if "[COMMITMENT]" in subject:
                commitment_count += 1
            else:
                revision_count += 1
    
    print(f"\n{'='*70}")
    print(f"Revision sessions: {revision_count}")
    print(f"Commitments: {commitment_count}")
    print("="*70)