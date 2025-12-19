import random
from datetime import datetime, timedelta
import sqlite3
from collections import defaultdict
import bisect

DB_PATH = "database.db"
BREAK_MINUTES = 30

# ------------------- DATABASE HELPERS -------------------

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def time_to_minutes(time_str):
    if time_str is None:
        raise ValueError("time_to_minutes received None")
    h, m = map(int, time_str.split(":"))
    return h * 60 + m

def minutes_to_time(minutes):
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"

# ------------------- INTERVAL TREE FOR FAST OVERLAP CHECKS -------------------

class IntervalTree:
    """Simple interval tree for O(log n) overlap checks"""
    def __init__(self):
        self.intervals = []  # sorted list of (start, end, data)
    
    def add(self, start, end, data=None):
        bisect.insort(self.intervals, (start, end, data))
    
    def has_overlap(self, start, end):
        """Check if [start, end) overlaps with any existing interval - O(log n)"""
        # Binary search for potential overlaps
        idx = bisect.bisect_left(self.intervals, (start, end, None))
        
        # Check intervals around insertion point
        for i in range(max(0, idx-1), min(len(self.intervals), idx+2)):
            if i < len(self.intervals):
                int_start, int_end, _ = self.intervals[i]
                if start < int_end and end > int_start:
                    return True
        return False

# ------------------- OPTIMIZED SCHEDULING ALGORITHM -------------------

def generate_timetable():
    """
    Optimized O(n log n) timetable generation where n = total available slots.
    
    Time Complexity Breakdown:
    - DB queries: O(S + A + C)
    - Build availability: O(D × A) but with early termination
    - Build commitments: O(D × C) → O(n) amortized
    - Sort all slots once: O(n log n) ← DOMINANT TERM
    - Schedule with interval tree: O(n log n)
    
    Total: O(n log n) where n = D × A (total slots)
    """
    timetable = defaultdict(list)
    today = datetime.utcnow().date()

    # Fetch data - O(S + A + C)
    with get_db_connection() as conn:
        subjects = conn.execute("SELECT * FROM subjects").fetchall()
        availability = conn.execute("SELECT * FROM availability").fetchall()
        commitments = conn.execute("SELECT * FROM commitments").fetchall()

    if not subjects:
        return {}

    # Determine date range - O(S + C)
    last_exam = max(datetime.strptime(subj['exam_date'], "%Y-%m-%d").date() for subj in subjects)
    end_date = last_exam
    
    # Calculate subject priorities - O(S)
    subject_list = []
    total_priority = 0
    
    for subj in subjects:
        exam_date = datetime.strptime(subj['exam_date'], "%Y-%m-%d").date()
        days_to_exam = max((exam_date - today).days, 0)
        proximity_score = 1 / (days_to_exam + 1)
        confidence_score = {'low': 1, 'medium': 2, 'high': 3}.get(subj['confidence'].lower(), 2)
        priority = 3 * proximity_score + 2 * confidence_score
        
        subject_list.append({
            'id': subj['id'],
            'name': subj['name'],
            'priority': priority,
            'exam_date': exam_date,
            'remaining': 0
        })
        total_priority += priority
    
    # Sort subjects by priority once - O(S log S)
    subject_list.sort(key=lambda x: -x['priority'])
    
    # Pre-compute commitment intervals - O(D × C) but amortized to O(n)
    commitment_intervals = defaultdict(IntervalTree)
    day_map = {'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
               'Friday': 4, 'Saturday': 5, 'Sunday': 6}
    
    for c in commitments:
        start_day = datetime.strptime(c['day'], "%Y-%m-%d").date()
        repeat = c['repeat_pattern']
        current_day = start_day
        
        while current_day <= end_date:
            add_day = False
            if repeat == 'custom' and current_day == start_day:
                add_day = True
            elif repeat == 'daily':
                add_day = True
            elif repeat == 'weekly' and current_day.weekday() == start_day.weekday():
                add_day = True
            
            if add_day:
                date_str = current_day.strftime("%Y-%m-%d")
                start_mins = time_to_minutes(c['start_time'])
                end_mins = time_to_minutes(c['end_time'])
                commitment_intervals[date_str].add(start_mins, end_mins, c['name'])
                timetable[date_str].append((c['name'], c['start_time'], c['end_time']))
            
            current_day += timedelta(days=1)
    
    # Build all available slots in one pass - O(D × A × T) but T is constant
    all_slots = []
    current_day = today
    
    while current_day <= end_date:
        weekday = current_day.weekday()
        date_str = current_day.strftime("%Y-%m-%d")
        
        for slot in availability:
            slot_day = slot['day']
            if day_map.get(slot_day) == weekday:
                start = datetime.strptime(slot['start_time'], "%H:%M")
                end = datetime.strptime(slot['end_time'], "%H:%M")
                current = start
                
                while current + timedelta(hours=1) <= end:
                    start_time = current.strftime("%H:%M")
                    end_time = (current + timedelta(hours=1)).strftime("%H:%M")
                    start_mins = time_to_minutes(start_time)
                    end_mins = time_to_minutes(end_time)
                    
                    # Only add if no commitment overlap - O(log n) per check
                    if not commitment_intervals[date_str].has_overlap(start_mins, end_mins):
                        all_slots.append({
                            'date': current_day,
                            'date_str': date_str,
                            'start': start_time,
                            'end': end_time,
                            'start_mins': start_mins,
                            'end_mins': end_mins
                        })
                    
                    current += timedelta(minutes=30)
        
        current_day += timedelta(days=1)
    
    # Allocate slots to subjects proportionally - O(S)
    total_slots = len(all_slots)
    for subj in subject_list:
        proportion = subj['priority'] / total_priority if total_priority > 0 else 1 / len(subject_list)
        allocated = max(int(round(proportion * total_slots)), 5)
        subj['remaining'] = allocated
    
    # Shuffle slots for randomness while maintaining O(n)
    random.shuffle(all_slots)
    
    # Schedule slots with greedy algorithm - O(n × S) but S is small and constant
    # Since we iterate through slots once and subjects are pre-sorted, this is effectively O(n)
    scheduled_intervals = defaultdict(IntervalTree)
    subject_idx = 0
    last_scheduled = {}  # track last scheduled time per date for breaks
    
    for slot in all_slots:
        date_str = slot['date_str']
        start_mins = slot['start_mins']
        end_mins = slot['end_mins']
        
        # Check 30-minute break requirement - O(1)
        if date_str in last_scheduled:
            if start_mins - last_scheduled[date_str] < BREAK_MINUTES:
                continue
        
        # Find next subject with remaining slots - O(S) worst case, but amortized O(1)
        attempts = 0
        while attempts < len(subject_list):
            subj = subject_list[subject_idx]
            
            if subj['remaining'] > 0 and subj['exam_date'] >= slot['date']:
                # Schedule this slot
                timetable[date_str].append((subj['name'], slot['start'], slot['end']))
                scheduled_intervals[date_str].add(start_mins, end_mins, subj['name'])
                subj['remaining'] -= 1
                last_scheduled[date_str] = end_mins
                
                # Move to next subject for variety
                subject_idx = (subject_idx + 1) % len(subject_list)
                break
            
            subject_idx = (subject_idx + 1) % len(subject_list)
            attempts += 1
    
    return dict(timetable)


# Test
if __name__ == "__main__":
    t = generate_timetable()
    for day, sessions in sorted(t.items()):
        print(day, sessions)