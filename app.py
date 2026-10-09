"""
SmartQueue - Python Flask Backend & Queue Management Server
RESTful API with SQLite Persistence, Single Fixed Admin Account, Smart Triage, Photo Uploads & Peak Time Analytics
"""

import os
import sqlite3
import random
import uuid
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'queue.db')
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Load environment variables from .env if present
def load_env_file():
    env_path = os.path.join(BASE_DIR, '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()

load_env_file()

ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'Ayanahhbisht@gamil.com').strip().lower()
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Ayana@100407').strip()
SECRET_KEY = os.environ.get('SECRET_KEY', 'smartqueue-secret-key-production-safe-2026')

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB

app = Flask(__name__, static_folder=BASE_DIR)
app.secret_key = SECRET_KEY
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
CORS(app, supports_credentials=True)


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

    # Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            phone TEXT,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

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
            user_id INTEGER,
            photo_path TEXT,
            emergency_type TEXT,
            emergency_desc TEXT,
            priority_level TEXT DEFAULT 'Normal',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            scheduled_time TEXT
        )
    ''')

    # Safely migrate existing tables if missing columns
    for col, col_type in [
        ('user_id', 'INTEGER'),
        ('photo_path', 'TEXT'),
        ('emergency_type', 'TEXT'),
        ('emergency_desc', 'TEXT'),
        ('priority_level', "TEXT DEFAULT 'Normal'"),
        ('emergency_verification_status', "TEXT DEFAULT 'Pending'"),
        ('emergency_verified_by', 'TEXT'),
        ('emergency_verified_at', 'TIMESTAMP'),
        ('emergency_verification_notes', 'TEXT'),
        ('skipped_at', 'TIMESTAMP'),
        ('skip_reason', 'TEXT'),
        ('proposed_slot_at', 'TEXT'),
        ('slot_acceptance_status', 'TEXT')
    ]:
        try:
            cursor.execute(f"ALTER TABLE appointments ADD COLUMN {col} {col_type}")
        except sqlite3.OperationalError:
            pass

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

    # Notifications Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    seed_default_data(conn)
    conn.close()


def seed_default_data(conn):
    cursor = conn.cursor()

    # Predefined Single Admin Setup (Email: Ayanahhbisht@gamil.com)
    admin_pass_hash = generate_password_hash(ADMIN_PASSWORD)

    cursor.execute('SELECT id, email, role FROM users WHERE email = ?', (ADMIN_EMAIL,))
    existing_admin = cursor.fetchone()

    if existing_admin:
        cursor.execute('''
            UPDATE users SET password_hash = ?, role = 'admin', first_name = 'Ayana', last_name = 'Bisht'
            WHERE id = ?
        ''', (admin_pass_hash, existing_admin['id']))
    else:
        cursor.execute('''
            INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
            VALUES (?, ?, ?, ?, ?, 'admin')
        ''', (ADMIN_EMAIL, admin_pass_hash, 'Ayana', 'Bisht', '+91 98765 43210'))

    # Demote any other admin accounts to regular 'user' role to guarantee ONLY 1 admin account exists
    cursor.execute("UPDATE users SET role = 'user' WHERE email != ? AND role = 'admin'", (ADMIN_EMAIL,))

    # Seed Default Doctor User if not existing
    cursor.execute("SELECT id FROM users WHERE email = 'doctor@example.com'")
    if not cursor.fetchone():
        doc_pass = generate_password_hash('doctor123')
        cursor.execute('''
            INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
            VALUES (?, ?, ?, ?, ?, 'doctor')
        ''', ('doctor@example.com', doc_pass, 'Marcus', 'Chen', '+1 555-999-0000'))

    # Seed Default Patient User if not existing
    cursor.execute("SELECT id FROM users WHERE email = 'sarah@example.com'")
    if not cursor.fetchone():
        user_pass = generate_password_hash('password123')
        cursor.execute('''
            INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
            VALUES (?, ?, ?, ?, ?, 'user')
        ''', ('sarah@example.com', user_pass, 'Sarah', 'Jenkins', '+1 555-234-8901'))

    conn.commit()

    cursor.execute('SELECT COUNT(*) as count FROM appointments')
    count = cursor.fetchone()['count']

    if count == 0:
        cursor.execute("INSERT OR REPLACE INTO system_state (key, value) VALUES ('now_serving_num', '18')")
        cursor.execute("INSERT OR REPLACE INTO system_state (key, value) VALUES ('user_token', 'A-24')")

        default_patients = [
            ('A-18', 'James Wilson', '+1 555-0101', 'General Medicine', 0, 'In Consultation', 1, 0, 0, None, None, None, 'Normal'),
            ('A-19', 'Elena Rostova', '+1 555-0102', 'General Medicine', 0, 'Next Calling', 2, 1, 0, None, None, None, 'Normal'),
            ('A-20', 'Marcus Chen', '+1 555-0103', 'Dental Clinic', 0, 'Waiting', 3, 2, 0, None, None, None, 'Normal'),
            ('A-21', 'Aaliyah Patel', '+1 555-0104', 'Radiology & Imaging', 0, 'Waiting', 4, 3, 0, None, None, None, 'Normal'),
            ('A-22', 'David Kim', '+1 555-0105', 'Pediatrics Care', 0, 'Waiting', 5, 4, 0, None, None, None, 'Normal'),
            ('A-23', 'Lucia Morales', '+1 555-0106', 'General Consultation', 0, 'Waiting', 6, 4, 0, None, None, None, 'Normal'),
            ('A-24', 'Sarah Jenkins', '+1 555-234-8901', 'General Consultation', 0, 'Confirmed', 7, 5, 1, None, None, None, 'Normal'),
            ('A-25', 'Oliver Brown', '+1 555-0107', 'General Consultation', 0, 'Waiting', 8, 8, 0, None, None, None, 'Normal'),
            ('A-26', 'Amira Hassan', '+1 555-0108', 'Laboratory Tests', 0, 'Waiting', 9, 11, 0, None, None, None, 'Normal'),
        ]

        cursor.executemany('''
            INSERT INTO appointments 
            (token, patient_name, phone, department, is_priority, status, position, estimated_wait, is_user, photo_path, emergency_type, emergency_desc, priority_level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
# Helpers & Security Middlewares
# ============================================================================

def recalculate_queue(conn, avg_consultation_mins=15):
    cursor = conn.cursor()
    
    # Select all active patients waiting (exclude Completed, Cancelled, Skipped, Called, Missed)
    # Sort by priority first (1=High, 0=Normal), then by ID (FIFO)
    cursor.execute('''
        SELECT id, token, user_id, is_priority, position, estimated_wait
        FROM appointments
        WHERE status NOT IN ('Cancelled', 'Completed', 'Skipped', 'Called', 'Missed')
        ORDER BY is_priority DESC, id ASC
    ''')
    
    active_appointments = cursor.fetchall()
    
    current_position = 1
    for row in active_appointments:
        app_id = row['id']
        old_pos = row['position']
        old_wait = row['estimated_wait']
        new_wait = current_position * avg_consultation_mins
        
        if old_pos != current_position or old_wait != new_wait:
            cursor.execute('''
                UPDATE appointments 
                SET position = ?, estimated_wait = ?
                WHERE id = ?
            ''', (current_position, new_wait, app_id))
            
            if old_pos != current_position:
                reason = f"Position adjusted to #{current_position}. Wait is approx {new_wait}m."
                
                cursor.execute('''
                    INSERT INTO queue_events (token, action, details)
                    VALUES (?, 'QUEUE_REORDER', ?)
                ''', (row['token'], reason))
                
                if row['user_id']:
                    cursor.execute('''
                        INSERT INTO notifications (user_id, title, message)
                        VALUES (?, 'Queue Update', ?)
                    ''', (row['user_id'], f"Queue adjusted due to emergencies/skips. {reason}"))
                    
        current_position += 1

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_current_user():
    user_id = session.get('user_id')
    if not user_id:
        return None
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, first_name, last_name, phone, role FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None


def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        role = session.get('user_role')
        if not role:
            # Fallback check header for state-only sessions
            auth_role = request.headers.get('X-User-Role')
            if auth_role == 'admin':
                role = 'admin'

        if role != 'admin':
            return jsonify({'success': False, 'error': 'Forbidden. Admin credentials required.'}), 403
        return f(*args, **kwargs)
    return decorated_function

def doctor_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        role = session.get('user_role')
        if not role:
            auth_role = request.headers.get('X-User-Role')
            if auth_role == 'doctor':
                role = 'doctor'

        if role != 'doctor':
            return jsonify({'success': False, 'error': 'Forbidden. Doctor credentials required.'}), 403
        return f(*args, **kwargs)
    return decorated_function


def calculate_peak_hours():
    """
    Computes peak hours based on appointments in the database.
    Returns string like "11:00 AM – 1:00 PM" and detail msg.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT created_at FROM appointments")
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return "11:00 AM – 1:00 PM", "Calculated based on standard clinic throughput."

    hours = []
    for r in rows:
        try:
            dt = datetime.strptime(r['created_at'], "%Y-%m-%d %H:%M:%S")
            hours.append(dt.hour)
        except Exception:
            pass

    if not hours:
        return "11:00 AM – 1:00 PM", "Standard peak operating hours."

    # Peak distribution
    hour_counts = {}
    for h in hours:
        hour_counts[h] = hour_counts.get(h, 0) + 1

    peak_h = max(hour_counts, key=hour_counts.get) if hour_counts else 11
    start_fmt = datetime.strptime(str(peak_h), "%H").strftime("%I %p").lstrip("0")
    end_fmt = datetime.strptime(str((peak_h + 2) % 24), "%H").strftime("%I %p").lstrip("0")
    return f"{start_fmt} – {end_fmt}", "Peak hours calculated from active queue records."


# ============================================================================
# Static Files & Uploads
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'service': 'SmartQueue Server with Emergency Triage & Admin Dashboard',
        'version': '2.0.0',
        'timestamp': datetime.now().isoformat()
    })


@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(BASE_DIR, path)):
        return send_from_directory(BASE_DIR, path)
    return send_from_directory(BASE_DIR, 'index.html')


# ============================================================================
# Authentication API
# ============================================================================

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.form if request.form else (request.get_json() or {})
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()
    first_name = data.get('first_name', '').strip()
    last_name = data.get('last_name', '').strip()
    phone = data.get('phone', '').strip()

    if not email or not password or not first_name:
        return jsonify({'success': False, 'error': 'First name, email, and password are required.'}), 400

    if email == ADMIN_EMAIL:
        return jsonify({'success': False, 'error': 'This email address is reserved for system administration.'}), 400

    # Public registrations are strictly regular 'user' accounts
    role = 'user'

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'error': 'An account with this email address already exists.'}), 400

    password_hash = generate_password_hash(password)
    cursor.execute('''
        INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (email, password_hash, first_name, last_name, phone, role))
    conn.commit()

    user_id = cursor.lastrowid
    conn.close()

    session['user_id'] = user_id
    session['user_role'] = role

    return jsonify({
        'success': True,
        'message': f'Account created successfully as {role.capitalize()}.',
        'user': {
            'id': user_id,
            'email': email,
            'first_name': first_name,
            'last_name': last_name,
            'role': role
        }
    }), 201


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()

    if not email or not password:
        return jsonify({'success': False, 'error': 'Email and password are required.'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
    user = cursor.fetchone()
    conn.close()

    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'success': False, 'error': 'Invalid email address or password. Please try again.'}), 401

    session['user_id'] = user['id']
    session['user_role'] = user['role']

    return jsonify({
        'success': True,
        'message': 'Login successful.',
        'user': {
            'id': user['id'],
            'email': user['email'],
            'first_name': user['first_name'],
            'last_name': user['last_name'],
            'phone': user['phone'],
            'role': user['role']
        }
    })


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out successfully.'})


@app.route('/api/auth/me', methods=['GET'])
def me():
    user = get_current_user()
    if not user:
        return jsonify({'authenticated': False}), 200
    return jsonify({'authenticated': True, 'user': user})


# ============================================================================
# Queue & User Endpoints
# ============================================================================

@app.route('/api/queue/status', methods=['GET'])
def get_queue_status():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT value FROM system_state WHERE key = 'now_serving_num'")
    row = cursor.fetchone()
    now_serving_num = int(row['value']) if row else 18

    user_id = session.get('user_id')
    user_token = None
    if user_id:
        cursor.execute("SELECT token FROM appointments WHERE user_id = ? AND status != 'Cancelled' ORDER BY id DESC LIMIT 1", (user_id,))
        user_row = cursor.fetchone()
        if user_row:
            user_token = user_row['token']

    user_apt = None
    if user_token:
        cursor.execute("SELECT * FROM appointments WHERE token = ?", (user_token,))
        user_apt = cursor.fetchone()

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
            'isUser': bool(apt['is_user']) or (apt['token'] == user_token),
            'photo_path': apt['photo_path'],
            'emergency_type': apt['emergency_type'],
            'emergency_desc': apt['emergency_desc'],
            'priority_level': apt['priority_level']
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

    cursor.execute("SELECT * FROM counters ORDER BY id ASC")
    counters_rows = cursor.fetchall()
    counters = [dict(c) for c in counters_rows]

    peak_time_str, peak_msg = calculate_peak_hours()
    conn.close()

    return jsonify({
        'now_serving_num': now_serving_num,
        'now_serving_token': f"A-{now_serving_num}",
        'user_token': user_token if user_token else 'No token',
        'user_name': user_apt['patient_name'] if user_apt else 'Guest',
        'user_service': user_service if user_apt else 'None',
        'user_status': user_status if user_apt else 'None',
        'is_priority': is_priority if user_apt else False,
        'people_ahead': people_ahead,
        'estimated_wait_minutes': estimated_wait,
        'queue_list': queue_list,
        'counters': counters,
        'peak_hours': peak_time_str,
        'peak_advisory': peak_msg
    })


@app.route('/api/queue/peak-time', methods=['GET'])
def get_peak_time():
    peak_str, advisory = calculate_peak_hours()
    return jsonify({
        'peak_hours': peak_str,
        'advisory': advisory,
        'notice': 'Waiting times may be longer during peak hours.'
    })


@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'notifications': []})
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 10", (user_id,))
    rows = cursor.fetchall()
    conn.close()

    return jsonify({'notifications': [dict(r) for r in rows]})


@app.route('/api/appointments/book', methods=['POST'])
def book_appointment():
    photo_filename = None
    if 'photo' in request.files:
        file = request.files['photo']
        if file and file.filename and allowed_file(file.filename):
            ext = file.filename.rsplit('.', 1)[1].lower()
            photo_filename = f"booking_{uuid.uuid4().hex[:10]}.{ext}"
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], photo_filename))

    data = request.form if request.form else (request.get_json() or {})
    patient_name = data.get('patient_name', 'Patient').strip()
    phone = data.get('phone', '+1 555-0000').strip()
    department = data.get('department', 'General Consultation').strip()
    is_urgent = str(data.get('is_priority', 'false')).lower() in ['true', '1', 'on']

    conn = get_db()
    cursor = conn.cursor()

    prefix = 'P' if 'Pediatric' in department else 'C' if 'Cardio' in department else 'D' if 'Dental' in department else 'A'
    token_num = random.randint(25, 45)
    token = f"{prefix}-{token_num}"

    cursor.execute("SELECT COUNT(*) as count FROM appointments WHERE status != 'Cancelled'")
    total_in_queue = cursor.fetchone()['count']

    position = total_in_queue + 1
    wait_time = (total_in_queue * 2) + 4
    status = 'Pending Approval' if is_urgent else 'Confirmed'
    priority_level = 'Pending Triage' if is_urgent else 'Normal'

    user_id = session.get('user_id')

    cursor.execute('''
        INSERT INTO appointments 
        (token, patient_name, phone, department, is_priority, status, position, estimated_wait, is_user, user_id, photo_path, priority_level)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?, 1, ?, ?, ?)
    ''', (token, patient_name, phone, department, status, position, wait_time, user_id, photo_filename, priority_level))

    cursor.execute("INSERT OR REPLACE INTO system_state (key, value) VALUES ('user_token', ?)", (token,))

    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'BOOK_APPOINTMENT', ?)
    ''', (token, f"Booked for {department}, PriorityRequested={is_urgent}"))

    conn.commit()
    conn.close()

    msg = f"Priority request submitted for token {token} and is awaiting admin approval." if is_urgent else f"Appointment booked! Your token is {token}."

    return jsonify({
        'success': True,
        'token': token,
        'patient_name': patient_name,
        'department': department,
        'is_priority': False,
        'status': status,
        'position': position,
        'estimated_wait': wait_time,
        'photo_path': photo_filename,
        'message': msg
    })


@app.route('/api/queue/priority', methods=['POST'])
def request_priority():
    photo_filename = None
    if 'photo' in request.files:
        file = request.files['photo']
        if file and file.filename and allowed_file(file.filename):
            ext = file.filename.rsplit('.', 1)[1].lower()
            photo_filename = f"emergency_{uuid.uuid4().hex[:10]}.{ext}"
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], photo_filename))

    data = request.form if request.form else (request.get_json() or {})
    emergency_type = data.get('emergency_type', 'Medical Emergency').strip()
    emergency_desc = data.get('emergency_desc', '').strip()

    conn = get_db()
    cursor = conn.cursor()

    user_id = session.get('user_id')
    if not user_id:
        conn.close()
        return jsonify({'success': False, 'error': 'Not authenticated'})

    cursor.execute("SELECT token FROM appointments WHERE user_id = ? AND status != 'Cancelled' ORDER BY id DESC LIMIT 1", (user_id,))
    row = cursor.fetchone()
    user_token = row['token'] if row else None
    
    if not user_token:
        conn.close()
        return jsonify({'success': False, 'error': 'No active appointment found'})

    # Set status to 'Pending Approval' without moving position or granting is_priority
    cursor.execute('''
        UPDATE appointments 
        SET is_priority = 0, status = 'Pending Approval',
            emergency_type = ?, emergency_desc = ?, photo_path = COALESCE(?, photo_path), priority_level = 'Pending Triage'
        WHERE token = ?
    ''', (emergency_type, emergency_desc, photo_filename, user_token))

    cursor.execute("SELECT position, estimated_wait FROM appointments WHERE token = ?", (user_token,))
    apt = cursor.fetchone()
    current_pos = apt['position'] if apt else 7
    current_wait = apt['estimated_wait'] if apt else 5

    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'PRIORITY_ACCESS_SUBMITTED', ?)
    ''', (user_token, f"Emergency: {emergency_type}. Awaiting Admin Approval."))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'token': user_token,
        'status': 'Pending Approval',
        'position': current_pos,
        'estimated_wait_minutes': current_wait,
        'photo_path': photo_filename,
        'message': 'Your priority request has been submitted and is awaiting admin approval.'
    })


@app.route('/api/queue/reschedule', methods=['POST'])
def reschedule_slot():
    data = request.get_json() or {}
    duration_str = data.get('duration', '15 minutes')

    conn = get_db()
    cursor = conn.cursor()

    user_id = session.get('user_id')
    if not user_id:
        conn.close()
        return jsonify({'success': False, 'error': 'Not authenticated'})

    cursor.execute("SELECT token FROM appointments WHERE user_id = ? AND status != 'Cancelled' ORDER BY id DESC LIMIT 1", (user_id,))
    row = cursor.fetchone()
    old_token = row['token'] if row else None

    if not old_token:
        conn.close()
        return jsonify({'success': False, 'error': 'No active appointment found'})

    cursor.execute("SELECT value FROM system_state WHERE key = 'now_serving_num'")
    now_row = cursor.fetchone()
    now_serving = int(now_row['value']) if now_row else 18

    import re
    total_minutes = 0
    hours = re.search(r'(\d+)\s*hour', duration_str)
    if hours: total_minutes += int(hours.group(1)) * 60
    mins = re.search(r'(\d+)\s*minute', duration_str)
    if mins: total_minutes += int(mins.group(1))
    
    if total_minutes == 0: total_minutes = 30

    new_token = f"R-{now_serving + (total_minutes // 15)}"
    new_status = f'Rescheduled ({duration_str})'
    new_wait = total_minutes

    cursor.execute('''
        UPDATE appointments 
        SET token = ?, status = ?, estimated_wait = ?, is_priority = 0
        WHERE token = ?
    ''', (new_token, new_status, new_wait, old_token))

    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'RESCHEDULE_APPOINTMENT', ?)
    ''', (new_token, f"Rescheduled by {duration_str}"))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'old_token': old_token,
        'new_token': new_token,
        'status': new_status,
        'estimated_wait_minutes': new_wait,
        'message': f"Rescheduled successfully. You will be called in {duration_str}."
    })


@app.route('/api/queue/next', methods=['POST'])
def advance_queue():
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


# ============================================================================
# Admin API Endpoints (Role-Protected)
# ============================================================================

@app.route('/api/admin/stats', methods=['GET'])
@admin_required
def get_admin_stats():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as count FROM appointments")
    total_patients = cursor.fetchone()['count']

    cursor.execute("SELECT AVG(estimated_wait) as avg_wait FROM appointments WHERE status != 'Cancelled'")
    avg_wait_row = cursor.fetchone()
    avg_wait = round(avg_wait_row['avg_wait'], 1) if avg_wait_row and avg_wait_row['avg_wait'] is not None else 8.5

    cursor.execute("SELECT COUNT(*) as count FROM appointments WHERE is_priority = 1 OR priority_level IN ('Critical', 'High', 'Urgent')")
    emergency_cases = cursor.fetchone()['count']

    cursor.execute("SELECT COUNT(*) as count FROM appointments WHERE status IN ('Cancelled', 'Missed', 'No-Show')")
    no_shows = cursor.fetchone()['count']

    peak_time_str, _ = calculate_peak_hours()
    conn.close()

    return jsonify({
        'total_patients': total_patients,
        'avg_wait_time': f"{avg_wait} mins",
        'emergency_cases': emergency_cases,
        'no_shows': no_shows,
        'peak_time': peak_time_str
    })


@app.route('/api/admin/requests', methods=['GET'])
@admin_required
def get_admin_requests():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM appointments ORDER BY is_priority DESC, position ASC")
    rows = cursor.fetchall()
    conn.close()

    requests_list = []
    for r in rows:
        requests_list.append({
            'id': r['id'],
            'token': r['token'],
            'patient_name': r['patient_name'],
            'phone': r['phone'],
            'department': r['department'],
            'is_priority': bool(r['is_priority']),
            'priority_level': r['priority_level'] or ('Critical' if r['is_priority'] else 'Normal'),
            'status': r['status'],
            'position': r['position'],
            'estimated_wait': r['estimated_wait'],
            'photo_path': r['photo_path'],
            'emergency_type': r['emergency_type'],
            'emergency_desc': r['emergency_desc'],
            'created_at': r['created_at']
        })

    return jsonify({'requests': requests_list})


@app.route('/api/admin/requests/<int:request_id>/approve', methods=['POST'])
@admin_required
def approve_priority_request(request_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT token, user_id FROM appointments WHERE id = ?", (request_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'error': 'Request not found'}), 404

    token = row['token']
    user_id = row['user_id']

    # Move other positions >= 2 down by 1
    cursor.execute("UPDATE appointments SET position = position + 1 WHERE position >= 2 AND token != ?", (token,))

    # Approve priority request: move to position 2 with Critical priority
    cursor.execute('''
        UPDATE appointments 
        SET is_priority = 1, status = 'Priority Expedited', position = 2, estimated_wait = 2, priority_level = 'Critical'
        WHERE id = ?
    ''', (request_id,))

    # Update Counter 3 (Urgent Counter)
    cursor.execute("UPDATE counters SET current_token = ? WHERE is_priority_counter = 1", (token,))

    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'ADMIN_APPROVED_PRIORITY', 'Administrator approved priority triage. Token moved to Position 2.')
    ''', (token,))

    if user_id:
        cursor.execute('''
            INSERT INTO notifications (user_id, title, message)
            VALUES (?, 'Priority Request Accepted', 'Your priority request has been accepted.')
        ''', (user_id,))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'request_id': request_id,
        'status': 'Priority Expedited',
        'message': f"Priority request for token {token} approved and moved to Position 2."
    })


@app.route('/api/admin/requests/<int:request_id>/reject', methods=['POST'])
@admin_required
def reject_priority_request(request_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT token, user_id FROM appointments WHERE id = ?", (request_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'error': 'Request not found'}), 404

    token = row['token']
    user_id = row['user_id']

    # Reject priority request: keep normal position, change status to Priority Rejected
    cursor.execute('''
        UPDATE appointments 
        SET is_priority = 0, status = 'Priority Rejected', priority_level = 'Normal'
        WHERE id = ?
    ''', (request_id,))

    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'ADMIN_REJECTED_PRIORITY', 'Administrator rejected priority request. User remains in normal queue.')
    ''', (token,))

    if user_id:
        cursor.execute('''
            INSERT INTO notifications (user_id, title, message)
            VALUES (?, 'Priority Request Rejected', 'Your priority request has been rejected.')
        ''', (user_id,))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'request_id': request_id,
        'status': 'Priority Rejected',
        'message': f"Priority request for token {token} rejected. User remains in normal queue."
    })


@app.route('/api/admin/requests/<int:request_id>/status', methods=['POST', 'PUT'])
@admin_required
def update_request_status(request_id):
    data = request.get_json() or {}
    new_status = data.get('status', 'Under Review').strip()

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT token FROM appointments WHERE id = ?", (request_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'error': 'Request not found'}), 404

    token = row['token']

    if new_status in ['Priority Expedited', 'Approved']:
        cursor.execute("UPDATE appointments SET position = position + 1 WHERE position >= 2 AND token != ?", (token,))
        cursor.execute('''
            UPDATE appointments 
            SET is_priority = 1, status = 'Priority Expedited', position = 2, estimated_wait = 2, priority_level = 'Critical'
            WHERE id = ?
        ''', (request_id,))
        cursor.execute("UPDATE counters SET current_token = ? WHERE is_priority_counter = 1", (token,))
    elif new_status in ['Priority Rejected', 'Rejected']:
        cursor.execute('''
            UPDATE appointments 
            SET is_priority = 0, status = 'Priority Rejected', priority_level = 'Normal'
            WHERE id = ?
        ''', (request_id,))
    else:
        cursor.execute("UPDATE appointments SET status = ? WHERE id = ?", (new_status, request_id))

    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'ADMIN_STATUS_UPDATE', ?)
    ''', (token, f"Admin updated status to '{new_status}'"))

    conn.commit()
    conn.close()

    return jsonify({'success': True, 'request_id': request_id, 'status': new_status})


@app.route('/api/admin/requests/<int:request_id>/priority', methods=['POST', 'PUT'])
@admin_required
def update_request_priority(request_id):
    data = request.get_json() or {}
    priority_level = data.get('priority_level', 'High').strip()

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT token FROM appointments WHERE id = ?", (request_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'error': 'Request not found'}), 404

    token = row['token']
    is_prio = 1 if priority_level in ['Critical', 'High', 'Urgent'] else 0
    new_position = 2 if is_prio else 5

    cursor.execute('''
        UPDATE appointments 
        SET priority_level = ?, is_priority = ?, position = ?
        WHERE id = ?
    ''', (priority_level, is_prio, new_position, request_id))

    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'ADMIN_PRIORITY_UPDATE', ?)
    ''', (token, f"Admin updated priority level to '{priority_level}'"))

    conn.commit()
    conn.close()

    return jsonify({'success': True, 'request_id': request_id, 'priority_level': priority_level})


# ============================================================================
# Doctor Dashboard Endpoints
# ============================================================================

@app.route('/api/doctor/current', methods=['GET'])
@doctor_required
def doctor_current():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM appointments 
        WHERE status IN ('In Consultation', 'Calling Now') 
        ORDER BY is_priority DESC, position ASC LIMIT 1
    ''')
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return jsonify({'success': True, 'patient': None})
    return jsonify({'success': True, 'patient': dict(row)})


@app.route('/api/doctor/call', methods=['POST'])
@doctor_required
def doctor_call():
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if there is already a patient in consultation
    cursor.execute("SELECT id FROM appointments WHERE status IN ('In Consultation', 'Calling Now') LIMIT 1")
    if cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'error': 'Please complete or skip the current patient first.'})
    
    # Get the next active patient
    cursor.execute('''
        SELECT id, token FROM appointments 
        WHERE status NOT IN ('Cancelled', 'Completed', 'Skipped', 'Resolved', 'Missed')
        ORDER BY is_priority DESC, position ASC LIMIT 1
    ''')
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return jsonify({'success': False, 'error': 'No patients in the queue.'})
        
    app_id = row['id']
    cursor.execute("UPDATE appointments SET status = 'In Consultation' WHERE id = ?", (app_id,))
    cursor.execute("UPDATE system_state SET value = ? WHERE key = 'now_serving_num'", (row['token'].replace('A-', '').replace('P-', ''),))
    
    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'DOCTOR_CALL', 'Patient called into consultation.')
    ''', (row['token'],))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Patient called.'})


@app.route('/api/doctor/complete', methods=['POST'])
@doctor_required
def doctor_complete():
    data = request.get_json() or {}
    app_id = data.get('id')
    
    if not app_id:
        return jsonify({'success': False, 'error': 'Patient ID required.'}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("UPDATE appointments SET status = 'Completed' WHERE id = ?", (app_id,))
    
    cursor.execute("SELECT token FROM appointments WHERE id = ?", (app_id,))
    token = cursor.fetchone()['token']
    
    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'DOCTOR_COMPLETE', 'Consultation marked as completed.')
    ''', (token,))
    
    recalculate_queue(conn)
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Consultation completed.'})


@app.route('/api/doctor/skip', methods=['POST'])
@doctor_required
def doctor_skip():
    data = request.get_json() or {}
    app_id = data.get('id')
    reason = data.get('reason', 'Missed call')
    
    if not app_id:
        return jsonify({'success': False, 'error': 'Patient ID required.'}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE appointments 
        SET status = 'Skipped', skipped_at = CURRENT_TIMESTAMP, skip_reason = ? 
        WHERE id = ?
    ''', (reason, app_id))
    
    cursor.execute("SELECT token, user_id FROM appointments WHERE id = ?", (app_id,))
    row = cursor.fetchone()
    token = row['token']
    
    cursor.execute('''
        INSERT INTO queue_events (token, action, details)
        VALUES (?, 'DOCTOR_SKIP', ?)
    ''', (token, f"Patient skipped: {reason}"))
    
    if row['user_id']:
        cursor.execute('''
            INSERT INTO notifications (user_id, title, message)
            VALUES (?, 'Missed Appointment', 'The doctor skipped your turn. Please request a reschedule.')
        ''', (row['user_id'],))
    
    recalculate_queue(conn)
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Patient skipped and removed from active queue.'})


# ============================================================================
# Main Entrypoint
# ============================================================================

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    print(f"============================================================")
    print(f"  SmartQueue Python Server running at http://127.0.0.1:{port}")
    print(f"  Serving frontend & REST API with Admin & Photo Uploads")
    print(f"============================================================")
    app.run(host='0.0.0.0', port=port, debug=True)
