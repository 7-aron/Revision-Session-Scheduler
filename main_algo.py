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
    Calculate a simple base priority using proximity only.
    Confidence is handled separately during allocation for clarity and balance.
    """
    subject_list = []
    
    for s in subjects:
        exam_date = datetime.strptime(s['exam_date'], "%Y-%m-%d").date()
        days_to_exam = max((exam_date - today).days, 0)
        
        # Proximity: closer exams get larger values
        proximity_score = 1.0 / (days_to_exam + 1)
        confidence_label = (s['confidence'] or '').lower()
        
        # Use proximity only as the base; keep confidence separate for allocation
        priority = proximity_score
        
        subject_list.append({
            'id': s['id'],
            'name': s['name'],
            'priority': priority,
            'exam_date': exam_date,
            'confidence': confidence_label,
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

def allocate_sessions(subjects, total_slots, conf_allocation_multipliers=None):
    """
    Distribute sessions proportionally (largest remainder method).
    Tie-breakers favor nearer exams, then higher base priority.
    """
    # Stronger emphasis on confidence to widen gaps between levels
    if conf_allocation_multipliers is None:
        # Symmetric geometric ratio so gaps low↔medium and medium↔high are similar
        CONF_RATIO = 1.35
        conf_allocation_multipliers = {
            'low': CONF_RATIO,
            'medium': 1.0,
            'high': 1.0 / CONF_RATIO
        }
    if total_slots <= 0 or not subjects:
        for s in subjects:
            s['sessions_needed'] = 0
        return
    
    # Apply confidence multipliers to amplify differences in allocation
    def effective_priority(s):
        mult = conf_allocation_multipliers.get(s.get('confidence', 'medium'), 1.0)
        return max(0.0, s['priority']) * mult
    
    total_priority = sum(effective_priority(s) for s in subjects)
    
    if total_priority <= 0:
        # Fallback: allocate greedily to soonest exams
        subjects_sorted = sorted(subjects, key=lambda s: (s['exam_date'], -s['priority']))
        for s in subjects:
            s['sessions_needed'] = 0
        for i in range(total_slots):
            subjects_sorted[i % len(subjects_sorted)]['sessions_needed'] += 1
        return
    
    # Initial floor allocation and remainders
    shares = []
    allocated = 0
    for s in subjects:
        p = effective_priority(s)
        exact = (p / total_priority) * total_slots
        base = int(exact)
        remainder = exact - base
        shares.append((s, base, remainder))
        allocated += base
    
    # Assign the remaining slots based on largest remainders.
    # Simple tie-break: earlier exam first, then name for stability.
    remaining = total_slots - allocated
    shares.sort(
        key=lambda x: (
            -x[2],  # remainder desc
            x[0]['exam_date'],  # earlier exam first
            x[0]['name'].lower(),
        )
    )
    
    for s, base, _ in shares:
        s['sessions_needed'] = base
    
    # Distribute remaining sessions in the same preference order
    if remaining > 0:
        tie_break_sorted = sorted(
            shares,
            key=lambda x: (
                -x[2],
                x[0]['exam_date'],
                x[0]['name'].lower(),
            )
        )
        idx = 0
        while remaining > 0 and tie_break_sorted:
            subj = tie_break_sorted[idx % len(tie_break_sorted)][0]
            subj['sessions_needed'] += 1
            idx += 1
            remaining -= 1


# ============================================================================
# STAGE 4, 5 & 6: WEIGHTED PLACEMENT + NO-OVERLAP + RANDOMIZATION
# ============================================================================

def schedule_sessions(subjects, all_slots, randomize=True, break_minutes=30):
    """
    Simple scheduling:
    - One session per discrete slot (no overlap between revision sessions)
    - Only schedule up to subject['sessions_needed'] and not after exam date
    - Randomization via weighted random pick per slot (by remaining sessions)
    - Enforce breaks after each revision session by reserving a cooldown window.
      Breaks are added as explicit entries and never overlap commitments
      because slots are pre-filtered against commitments.
    """
    # Group slots by day and sort chronologically for a clean timetable
    slots_by_day = {}
    for slot in all_slots:
        date_str = slot['date'].strftime("%Y-%m-%d")
        if date_str not in slots_by_day:
            slots_by_day[date_str] = []
        slots_by_day[date_str].append(slot)
    
    # Sort slots within each day by time
    for day_slots in slots_by_day.values():
        day_slots.sort(key=lambda x: x['start_mins'])
    
    # Recombine in date order
    sorted_slots = []
    for date_str in sorted(slots_by_day.keys()):
        sorted_slots.extend(slots_by_day[date_str])
    
    subjects_to_schedule = [s for s in subjects if s['sessions_needed'] > 0]
    if not subjects_to_schedule:
        return {}
    
    # Helper: weighted choice by remaining sessions per slot
    def pick_subject(candidates):
        weights = []
        for s in candidates:
            weight = max(0, s['sessions_needed'])
            weights.append(weight)
        total_w = sum(weights)
        if total_w <= 0:
            # Fallback: deterministic - nearest exam
            return sorted(candidates, key=lambda s: s['exam_date'])[0]
        if not randomize:
            # Deterministic: pick the highest weight
            best_idx = max(range(len(candidates)), key=lambda i: weights[i])
            return candidates[best_idx]
        # Roulette wheel selection
        r = random.uniform(0, total_w)
        upto = 0.0
        for s, w in zip(candidates, weights):
            upto += w
            if upto >= r:
                return s
        return candidates[-1]
    
    all_slots = sorted_slots
    timetable = {}
    cooldown_until_by_day = {}
    for slot in all_slots:
        if not subjects_to_schedule:
            break
        
        date_str = slot['date'].strftime("%Y-%m-%d")
        if date_str not in timetable:
            timetable[date_str] = []
            cooldown_until_by_day[date_str] = 0
        
        # If we're still within cooldown, emit a break block and skip scheduling a session
        if break_minutes and slot['start_mins'] < cooldown_until_by_day[date_str]:
            break_end = min(slot['end_mins'], cooldown_until_by_day[date_str])
            timetable[date_str].append({
                'subject': '[BREAK]',
                'start': minutes_to_time(slot['start_mins']),
                'end': minutes_to_time(break_end)
            })
            # Do not schedule a revision in this slot
            continue
        
        # Candidates: have sessions left and slot not after exam date
        candidates = [s for s in subjects_to_schedule if s['sessions_needed'] > 0 and slot['date'] <= s['exam_date']]
        if not candidates:
            continue
        chosen = pick_subject(candidates)
        
        # Place the session (no overlap guaranteed since each slot is unique and singular)
        timetable[date_str].append({
            'subject': chosen['name'],
            'start': minutes_to_time(slot['start_mins']),
            'end': minutes_to_time(slot['end_mins'])
        })
        
        chosen['sessions_needed'] -= 1
        # Enforce cooldown for subsequent slots on the same day
        if break_minutes:
            cooldown_until_by_day[date_str] = slot['end_mins'] + break_minutes
        if chosen['sessions_needed'] <= 0:
            subjects_to_schedule = [s for s in subjects_to_schedule if s['sessions_needed'] > 0]
    
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
    subject_counts = {}
    
    for day in sorted(timetable.keys()):
        print(f"\n{day}:")
        for subject, start, end in timetable[day]:
            print(f"  {start} - {end}: {subject}")
            if "[COMMITMENT]" in subject:
                commitment_count += 1
            elif "[BREAK]" in subject:
                # do not count breaks as revision sessions
                continue
            else:
                revision_count += 1
                subject_counts[subject] = subject_counts.get(subject, 0) + 1
    
    print(f"\n{'='*70}")
    print(f"Revision sessions: {revision_count}")
    print(f"Commitments: {commitment_count}")
    print("="*70)
    
    if subject_counts:
        print("\nSessions per subject:")
        # Sort by descending count then name
        for subj, cnt in sorted(subject_counts.items(), key=lambda x: (-x[1], x[0].lower())):
            print(f"  {subj}: {cnt}")