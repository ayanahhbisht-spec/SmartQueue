"""
SmartQueue - Python Flask Backend & Queue Management Server
RESTful API with SQLite Persistence, Smart Triage & Missed-Turn Engine
"""

import os
import sqlite3
import random
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'queue.db')

app = Flask(__name__, static_folder=BASE_DIR)
CORS(app)


# ============================================================================
# Database Setup & Initialization
# ============================================================================

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Appointments & Queue Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            patient_name TEXT NOT NULL,
            phone TEXT,
            department TEXT NOT NULL,
            is_priority BOOLEAN DEFAULT 0,
            status TEXT NOT NULL,
            position INTEGER NOT NULL,
            estimated_wait INTEGER NOT NULL,
            is_user BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            scheduled_time TEXT
        )
    ''')

    # Counters Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS counters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            counter_name TEXT NOT NULL,
            department TEXT NOT NULL,
            current_token TEXT,
            status TEXT NOT NULL,
            is_priority_counter BOOLEAN DEFAULT 0
        )
    ''')

    # Event / Audit Log Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS queue_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # System State (e.g. Now Serving)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS system_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')

    conn.commit()
    seed_default_data(conn)
    conn.close()


def seed_default_data(conn):
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) as count FROM appointments')
    count = cursor.fetchone()['count']

    if count == 0:
        # Default State: A-18 Now Serving, A-24 User
        cursor.execute("INSERT OR REPLACE INTO system_state (key, value) VALUES ('now_serving_num', '18')")
        cursor.execute("INSERT OR REPLACE INTO system_state (key, value) VALUES ('user_token', 'A-24')")

        default_patients = [
            ('A-18', 'James Wilson', '+1 555-0101', 'General Medicine', 0, 'In Consultation', 1, 0, 0),
            ('A-19', 'Elena Rostova', '+1 555-0102', 'General Medicine', 0, 'Next Calling', 2, 1, 0),
            ('A-20', 'Marcus Chen', '+1 555-0103', 'Dental Clinic', 0, 'Waiting', 3, 2, 0),
            ('A-21', 'Aaliyah Patel', '+1 555-0104', 'Radiology & Imaging', 0, 'Waiting', 4, 3, 0),
            ('A-22', 'David Kim', '+1 555-0105', 'Pediatrics Care', 0, 'Waiting', 5, 4, 0),
            ('A-23', 'Lucia Morales', '+1 555-0106', 'General Consultation', 0, 'Waiting', 6, 4, 0),
            ('A-24', 'Sarah Jenkins', '+1 555-234-8901', 'General Consultation', 0, 'Confirmed', 7, 5, 1),
            ('A-25', 'Oliver Brown', '+1 555-0107', 'General Consultation', 0, 'Waiting', 8, 8, 0),
            ('A-26', 'Amira Hassan', '+1 555-0108', 'Laboratory Tests', 0, 'Waiting', 9, 11, 0),
        ]

        cursor.executemany('''
            INSERT INTO appointments 
            (token, patient_name, phone, department, is_priority, status, position, estimated_wait, is_user)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', default_patients)

        # Initialize Consultation Counters
        cursor.execute('DELETE FROM counters')
        counters_data = [
            ('Counter 1', 'General Medicine', 'A-18', 'In Consultation', 0),
            ('Counter 2', 'Pediatrics & Family', 'B-09', 'In Consultation', 0),
            ('Counter 3 (Urgent)', 'Rapid Triage', 'P-03', 'Next Calling', 1)
        ]
        cursor.executemany('''
            INSERT INTO counters (counter_name, department, current_token, status, is_priority_counter)
            VALUES (?, ?, ?, ?, ?)
        ''', counters_data)

        conn.commit()


# ============================================================================
# Static Files & Frontend Routing
# ============================================================================

@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(BASE_DIR, path)):
        return send_from_directory(BASE_DIR, path)
    return send_from_directory(BASE_DIR, 'index.html')


# ============================================================================
# REST API Endpoints
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'service': 'SmartQueue Python Server',
        'version': '1.0.0',
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/queue/status', methods=['GET'])
def get_queue_status():
    """
    Returns current queue state, now serving token, user token stats, and waiting list.
    """
    conn = get_db()
    cursor = conn.cursor()

    # Get system state
    cursor.execute("SELECT value FROM system_state WHERE key = 'now_serving_num'")
    row = cursor.fetchone()
    now_serving_num = int(row['value']) if row else 18

    cursor.execute("SELECT value FROM system_state WHERE key = 'user_token'")
    row = cursor.fetchone()
    user_token = row['value'] if row else 'A-24'

    # Get user appointment
    cursor.execute("SELECT * FROM appointments WHERE token = ?", (user_token,))
    user_apt = cursor.fetchone()

    # Get active queue
    cursor.execute("SELECT * FROM appointments WHERE status != 'Cancelled' ORDER BY position ASC")
    appointments = cursor.fetchall()

    queue_list = []
    people_ahead = 0
    estimated_wait = 5
    is_priority = False
    user_status = 'Confirmed'
    user_service = 'General Consultation'

    if user_apt:
        user_status = user_apt['status']
        user_service = user_apt['department']
        is_priority = bool(user_apt['is_priority'])

    user_found = False
    for apt in appointments:
        apt_dict = {
            'token': apt['token'],
            'name': apt['patient_name'],
            'service': apt['department'],
            'status': apt['status'],
            'wait': apt['estimated_wait'],
            'isUser': bool(apt['is_user']) or (apt['token'] == user_token)
        }
        queue_list.append(apt_dict)

        if apt['token'] == user_token:
            user_found = True
            estimated_wait = apt['estimated_wait']
        elif not user_found and apt['status'] in ['Waiting', 'Confirmed', 'Next Calling']:
            people_ahead += 1

    if is_priority:
        people_ahead = 1
        estimated_wait = 2

    # Get Counters
    cursor.execute("SELECT * FROM counters ORDER BY id ASC")
    counters_rows = cursor.fetchall()
    counters = [dict(c) for c in counters_rows]

    conn.close()

    return jsonify({
        'now_serving_num': now_serving_num,
        'now_serving_token': f"A-{now_serving_num}",
        'user_token': user_token,
        'user_name': user_apt['patient_name'] if user_apt else 'Sarah Jenkins',
        'user_service': user_service,
        'user_status': user_status,
        'is_priority': is_priority,
        'people_ahead': people_ahead,
        'estimated_wait_minutes': estimated_wait,
        'queue_list': queue_list,
        'counters': counters
    })


@app.route('/api/appointments/book', methods=['POST'])
def book_appointment():
    """
    Registers a new patient into the queue, allocates token, and calculates wait.
    """
    data = request.get_json() or {}
    patient_name = data.get('patient_name', 'Patient').strip()
    phone = data.get('phone', '+1 555-0000').strip()
    department = data.get('department', 'General Consultation').strip()
    is_urgent = bool(data.get('is_priority', False))

    conn = get_db()
    cursor = conn.cursor()

    # Generate token
    prefix = 'P' if 'Pediatric' in department else 'C' if 'Cardio' in department else 'D' if 'Dental' in department else 'A'
    token_num = random.randint(25, 45)
    token = f"{prefix}-{token_num}"

    # Calculate position & wait
    cursor.execute("SELECT COUNT(*) as count FROM appointments WHERE status != 'Cancelled'")
    total_in_queue = cursor.fetchone()['count']

    position = 2 if is_urgent else total_in_queue + 1
    wait_time = 2 if is_urgent else (total_in_queue * 2) + 4
    status = 'Priority Expedited' if is_urgent else 'Confirmed'

    # If urgent, shift positions
    if is_urgent:
        cursor.execute("UPDATE appointments SET position = position + 1 WHERE position >= 2")

    # Insert appointment
    cursor.execute('''
        INSERT INTO appointments 
        (token, patient_name, phone, department, is_priority, status, position, estimated_wait, is_user)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    ''', (token, patient_name, phone, department, int(is_urgent), status, position, wait_time))

    # Update active user token
    cursor.execute("INSERT OR REPLACE INTO system_state (key, value) VALUES ('user_token', ?)", (token,))

    # Log event
    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'BOOK_APPOINTMENT', ?)
    ''', (token, f"Booked for {department}, Priority={is_urgent}"))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'token': token,
        'patient_name': patient_name,
        'department': department,
        'is_priority': is_urgent,
        'status': status,
        'position': position,
        'estimated_wait': wait_time,
        'message': f"Appointment booked! Your token is {token}."
    })


@app.route('/api/queue/priority', methods=['POST'])
def request_priority():
    """
    Emergency Triage: Moves user token to position 2 (calling next) without cancelling anyone.
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT value FROM system_state WHERE key = 'user_token'")
    row = cursor.fetchone()
    user_token = row['value'] if row else 'A-24'

    # Move other positions >= 2 down by 1
    cursor.execute("UPDATE appointments SET position = position + 1 WHERE position >= 2 AND token != ?", (user_token,))

    # Set user token as priority at position 2
    cursor.execute('''
        UPDATE appointments 
        SET is_priority = 1, status = 'Priority Expedited', position = 2, estimated_wait = 2
        WHERE token = ?
    ''', (user_token,))

    # Update Counter 3 (Urgent Counter)
    cursor.execute("UPDATE counters SET current_token = ? WHERE is_priority_counter = 1", (user_token,))

    # Log audit event
    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'PRIORITY_ACCESS_REQUESTED', 'Emergency triage activated. Moved to position 2.')
    ''', (user_token,))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'token': user_token,
        'status': 'Priority Expedited',
        'position': 2,
        'estimated_wait_minutes': 2,
        'message': f"Priority triage verified. Token {user_token} moved to Position 2."
    })


@app.route('/api/queue/reschedule', methods=['POST'])
def reschedule_slot():
    """
    Handles missed turns or dynamic reschedule: 30m, 2h, tomorrow, or cancel.
    """
    data = request.get_json() or {}
    option = data.get('option', '30m')  # '30m', '2h', 'tomorrow', 'cancel'

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT value FROM system_state WHERE key = 'user_token'")
    row = cursor.fetchone()
    old_token = row['value'] if row else 'A-24'

    cursor.execute("SELECT value FROM system_state WHERE key = 'now_serving_num'")
    now_row = cursor.fetchone()
    now_serving = int(now_row['value']) if now_row else 18

    new_token = old_token
    new_status = 'Rescheduled'
    new_wait = 30

    if option == '30m':
        new_token = f"A-{now_serving + 6}"
        new_status = 'Rescheduled (30m)'
        new_wait = 30
    elif option == '2h':
        new_token = f"B-08"
        new_status = 'Rescheduled (2h)'
        new_wait = 120
    elif option == 'tomorrow':
        new_token = f"T-04"
        new_status = 'Rescheduled (Tomorrow 09:15 AM)'
        new_wait = 960
    elif option == 'cancel':
        cursor.execute("UPDATE appointments SET status = 'Cancelled' WHERE token = ?", (old_token,))
        cursor.execute('''
            INSERT INTO queue_events (token, action, details)
            VALUES (?, 'CANCEL_APPOINTMENT', 'Patient cancelled slot with zero penalty.')
        ''', (old_token,))
        conn.commit()
        conn.close()
        return jsonify({
            'success': True,
            'status': 'Cancelled',
            'message': 'Appointment cancelled. Slot released with no fee.'
        })

    # Update appointment record
    cursor.execute('''
        UPDATE appointments 
        SET token = ?, status = ?, estimated_wait = ?, is_priority = 0
        WHERE token = ?
    ''', (new_token, new_status, new_wait, old_token))

    cursor.execute("INSERT OR REPLACE INTO system_state (key, value) VALUES ('user_token', ?)", (new_token,))

    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'RESCHEDULE_APPOINTMENT', ?)
    ''', (new_token, f"Rescheduled using option {option}. New token: {new_token}"))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'old_token': old_token,
        'new_token': new_token,
        'status': new_status,
        'estimated_wait_minutes': new_wait,
        'message': f"Rescheduled successfully. Your new token is {new_token}."
    })


@app.route('/api/queue/next', methods=['POST'])
def advance_queue():
    """
    Simulates doctor calling next patient at Counter 1.
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT value FROM system_state WHERE key = 'now_serving_num'")
    row = cursor.fetchone()
    now_serving = int(row['value']) if row else 18
    next_serving = now_serving + 1

    cursor.execute("INSERT OR REPLACE INTO system_state (key, value) VALUES ('now_serving_num', ?)", (str(next_serving),))
    cursor.execute("UPDATE counters SET current_token = ? WHERE counter_name = 'Counter 1'", (f"A-{next_serving}",))

    cursor.execute("SELECT value FROM system_state WHERE key = 'user_token'")
    user_row = cursor.fetchone()
    user_token = user_row['value'] if user_row else 'A-24'

    is_user_turn = (f"A-{next_serving}" == user_token)
    if is_user_turn:
        cursor.execute("UPDATE appointments SET status = 'Calling Now' WHERE token = ?", (user_token,))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'now_serving_num': next_serving,
        'now_serving_token': f"A-{next_serving}",
        'is_user_turn': is_user_turn
    })


@app.route('/api/queue/reset', methods=['POST'])
def reset_queue():
    """
    Restores the simulator queue to initial demonstration state.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM appointments')
    cursor.execute('DELETE FROM system_state')
    cursor.execute('DELETE FROM counters')
    cursor.execute('DELETE FROM queue_events')
    seed_default_data(conn)
    conn.close()

    return jsonify({
        'success': True,
        'message': 'Queue simulator restored to initial state.'
    })


@app.route('/api/counters', methods=['GET'])
def get_counters():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM counters ORDER BY id ASC")
    counters = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return jsonify({'counters': counters})


# ============================================================================
# Main Entrypoint
# ============================================================================

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    print(f"============================================================")
    print(f"  SmartQueue Python Server running at http://127.0.0.1:{port}")
    print(f"  Serving frontend & REST API")
    print(f"============================================================")
    app.run(host='0.0.0.0', port=port, debug=True)
