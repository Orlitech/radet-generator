import os
import sys
import json
import psycopg2
from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor
from flask import Flask, request, jsonify, send_file, make_response
from flask_cors import CORS
import pandas as pd
from datetime import datetime
import moment  # pip install moment
import io
import traceback
from pathlib import Path

app = Flask(__name__)
CORS(app)
app.config['JSON_SORT_KEYS'] = False

PORT = int(os.environ.get('PORT', 3000))

# ============================================================
# CRITICAL: PATH CONFIGURATION FOR PACKAGED APP
# ============================================================
IS_PACKAGED = getattr(sys, 'frozen', False)
EXECUTABLE_PATH = os.path.dirname(sys.executable) if IS_PACKAGED else os.path.dirname(os.path.abspath(__file__))
SNAPSHOT_PATH = os.path.dirname(os.path.abspath(__file__))

print(f"📦 Packaged mode: {'YES' if IS_PACKAGED else 'NO'}")
print(f"📁 Executable path: {EXECUTABLE_PATH}")
print(f"📁 Snapshot path: {SNAPSHOT_PATH}")

# ============================================================
# FIND FRONTEND FILES (MULTIPLE FALLBACK LOCATIONS)
# ============================================================
possible_frontend_paths = [
    os.path.join(SNAPSHOT_PATH, 'frontend'),
    os.path.join(EXECUTABLE_PATH, 'frontend'),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '../frontend'),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend'),
    os.path.join(os.getcwd(), 'frontend')
]

frontend_path = None
for test_path in possible_frontend_paths:
    indexPath = os.path.join(test_path, 'index.html')
    if os.path.exists(indexPath):
        frontend_path = test_path
        print(f"✅ Frontend found at: {test_path}")
        # Serve static files from this directory
        app.static_folder = frontend_path
        app.static_url_path = ''
        break

if frontend_path:
    print(f"📁 Serving static files from: {frontend_path}")
else:
    print("❌ Could not find frontend files!")

# ============================================================
# DATABASE CONNECTION
# ============================================================
connection_pool = None
db_config = None

# ============================================================
# LOAD CONFIGURATION
# ============================================================
def load_config():
    global db_config
    try:
        possible_config_paths = [
            os.path.join(EXECUTABLE_PATH, 'config.json'),
            os.path.join(SNAPSHOT_PATH, 'config.default.json'),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json'),
            os.path.join(os.getcwd(), 'config.json')
        ]

        for config_path in possible_config_paths:
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    db_config = json.load(f)
                print(f"✅ Config loaded from: {config_path}")
                print(f"📊 Database: {db_config.get('database', {}).get('database')}")
                return True

        print("⚠️ No config file found")
        return False
    except Exception as error:
        print(f"❌ Failed to load config: {str(error)}")
        return False

# ============================================================
# LOAD QUERY
# ============================================================
def load_query():
    try:
        possible_query_paths = [
            os.path.join(EXECUTABLE_PATH, 'query.sql'),
            os.path.join(SNAPSHOT_PATH, 'query.sql'),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), 'query.sql'),
            os.path.join(os.getcwd(), 'query.sql')
        ]

        for query_path in possible_query_paths:
            if os.path.exists(query_path):
                print(f"📁 Using query file: {query_path}")
                with open(query_path, 'r') as f:
                    return f.read()

        print("❌ Query file not found")
        return None
    except Exception as error:
        print(f"❌ Failed to load query: {str(error)}")
        return None

# ============================================================
# CONNECT TO DATABASE
# ============================================================
def connect_to_database():
    global connection_pool
    if not db_config or not db_config.get('database', {}).get('database'):
        print("⚠️ Database not configured")
        return False

    try:
        db = db_config['database']
        connection_pool = pg_pool.SimpleConnectionPool(
            1, 20,
            host=db.get('host'),
            port=db.get('port'),
            database=db.get('database'),
            user=db.get('username'),
            password=db.get('password'),
            sslmode='require' if db.get('ssl') else 'disable',
            connect_timeout=5
        )

        # Test connection
        conn = connection_pool.getconn()
        cursor = conn.cursor()
        cursor.execute('SELECT NOW()')
        cursor.close()
        connection_pool.putconn(conn)
        
        print(f"✅ Database connected successfully to {db.get('database')}")
        return True
    except Exception as error:
        print(f"❌ Database connection failed: {str(error)}")
        connection_pool = None
        return False

# ============================================================
# EXCEL GENERATION FUNCTION
# ============================================================
def generate_excel(rows):
    # Your 81 columns in exact order
    columns = [
        'S/No.',
        'State',
        'L.G.A',
        'LGA Of Residence',
        'Facility Name',
        'DatimId',
        'Patient ID',
        'NDR Patient Identifier',
        'Hospital Number',
        'Unique Id',
        'Household Unique No',
        'OVC Unique ID',
        'Sex',
        'Target group',
        'Current Weight (kg)',
        'Pregnancy Status',
        'Date of Birth (yyyy-mm-dd)',
        'Age',
        'Care Entry Point',
        'Date of Registration',
        'Enrollment Date (yyyy-mm-dd)',
        'ART Start Date (yyyy-mm-dd)',
        'Last Pickup Date (yyyy-mm-dd)',
        'Months of ARV Refill',
        'Regimen Line at ART Start',
        'Regimen at ART Start',
        'Date of Start of Current ART Regimen',
        'Current Regimen Line',
        'Current ART Regimen',
        'Clinical Staging at Last Visit',
        'Date of Last CD4 Count',
        'Last CD4 Count',
        'Date of Viral Load Sample Collection (yyyy-mm-dd)',
        'Date of Current ViralLoad Result Sample (yyyy-mm-dd)',
        'Current Viral Load (c/ml)',
        'Date of Current Viral Load (yyyy-mm-dd)',
        'Viral Load Indication',
        'Viral Load Eligibility Status',
        'Date of Viral Load Eligibility Status',
        'Current ART Status',
        'Date of Current ART Status',
        'Client Verification Outcome',
        'Cause of Death',
        'VA Cause of Death',
        'Previous ART Status',
        'Confirmed Date of Previous ART Status',
        'ART Enrollment Setting',
        'Date of TB Screening (yyyy-mm-dd)',
        'TB Screening Type',
        'CAD Score',
        'TB status',
        'Date of TB Sample Collection (yyyy-mm-dd)',
        'TB Diagnostic Test Type',
        'Date of TB Diagnostic Result Received (yyyy-mm-dd)',
        'TB Diagnostic Result',
        'Date of Additional TB Diagnosis Result using XRAY',
        'Additional TB Diagnosis Result using XRAY',
        'Date of Start of TB Treatment (yyyy-mm-dd)',
        'TB Type (new, relapsed etc)',
        'Date of Completion of TB Treatment (yyyy-mm-dd)',
        'TB Treatment Outcome',
        'Date of TPT Start (yyyy-mm-dd)',
        'TPT Type',
        'TPT Completion date (yyyy-mm-dd)',
        'TPT Completion status',
        'Date of commencement of EAC (yyyy-mm-dd)',
        'Number of EAC Sessions Completed',
        'Date of last EAC Session Completed',
        'Date of Extended EAC Completion (yyyy-mm-dd)',
        'Date of Repeat Viral Load - Post EAC VL Sample collected (yyyy-mm-dd)',
        'Repeat Viral load result (c/ml)- POST EAC',
        'Date of Repeat Viral load result- POST EAC VL',
        'Date of devolvement',
        'Model devolved to',
        'Date of current DSD',
        'Current DSD model',
        'Current DSD Outlet',
        'Date of Return of DSD Client to Facility (yyyy-mm-dd)',
        'Screening for Chronic Conditions',
        'Co-morbidities',
        'Date of Cervical Cancer Screening (yyyy-mm-dd)',
        'Cervical Cancer Screening Type',
        'Cervical Cancer Screening Method',
        'Result of Cervical Cancer Screening',
        'Date of Precancerous Lesions Treatment (yyyy-mm-dd)',
        'Precancerous Lesions Treatment Methods',
        'Date Biometrics Enrolled (yyyy-mm-dd)',
        'Number of Fingers Captured',
        'Date Biometrics Recapture (yyyy-mm-dd)',
        'Number of Fingers Recaptured',
        'Case Manager'
    ]

    # Prepare data
    data = []
    
    if rows and len(rows) > 0:
        for index, row in enumerate(rows):
            row_data = []
            for col_idx, col in enumerate(columns):
                # Handle S/No.
                if col == 'S/No.':
                    row_data.append(index + 1)
                    continue
                
                # Map your query columns to Excel columns
                mapping = {
                    'State': row.get('state'),
                    'L.G.A': row.get('lga'),
                    'LGA Of Residence': row.get('lgaofresidence'),
                    'Facility Name': row.get('facilityname'),
                    'DatimId': row.get('datimid'),
                    'Patient ID': row.get('personuuid') or row.get('uniquepersonuuid'),
                    'NDR Patient Identifier': row.get('ndrpatientidentifier'),
                    'Hospital Number': row.get('hospitalnumber'),
                    'Unique Id': row.get('uniqueid'),
                    'Household Unique No': row.get('householdnumber') or row.get('householduniqueno') or row.get('householduniqueNo'),
                    'OVC Unique ID': row.get('ovcnumber') or row.get('ovcuniqueid') or row.get('ovcUniqueId'),
                    'Sex': row.get('gender'),
                    'Target group': row.get('targetgroup'),
                    'Current Weight (kg)': row.get('currentweight'),
                    'Pregnancy Status': row.get('pregnancystatus'),
                    'Date of Birth (yyyy-mm-dd)': row.get('dateofbirth'),
                    'Age': row.get('age'),
                    'Care Entry Point': row.get('careentry'),
                    'Date of Registration': row.get('dateofregistration'),
                    'Enrollment Date (yyyy-mm-dd)': row.get('dateofenrollment'),
                    'ART Start Date (yyyy-mm-dd)': row.get('artstartdate'),
                    'Last Pickup Date (yyyy-mm-dd)': row.get('lastpickupdate'),
                    'Months of ARV Refill': row.get('monthsofarxrefill') or row.get('monthsofarvrefill'),
                    'Regimen Line at ART Start': row.get('regimenlineatstart'),
                    'Regimen at ART Start': row.get('regimenatstart'),
                    'Date of Start of Current ART Regimen': row.get('dateofcurrentregimen'),
                    'Current Regimen Line': row.get('currentregimenline'),
                    'Current ART Regimen': row.get('currentartregimen'),
                    'Clinical Staging at Last Visit': row.get('currentclinicalstage'),
                    'Date of Last CD4 Count': row.get('dateoflastcd4count'),
                    'Last CD4 Count': row.get('lastcd4count'),
                    'Date of Viral Load Sample Collection (yyyy-mm-dd)': row.get('dateofviralloadsamplecollection'),
                    'Date of Current ViralLoad Result Sample (yyyy-mm-dd)': row.get('dateofcurrentviralloadsample'),
                    'Current Viral Load (c/ml)': row.get('currentviralload'),
                    'Date of Current Viral Load (yyyy-mm-dd)': row.get('dateofcurrentviralload'),
                    'Viral Load Indication': row.get('viralloadindication'),
                    'Viral Load Eligibility Status': row.get('vleligibilitystatus'),
                    'Date of Viral Load Eligibility Status': row.get('dateofvleligibilitystatus'),
                    'Current ART Status': row.get('currentstatus'),
                    'Date of Current ART Status': row.get('currentstatusdate'),
                    'Client Verification Outcome': row.get('clientverificationoutcome'),
                    'Cause of Death': row.get('causeofdeath'),
                    'VA Cause of Death': row.get('vacauseofdeath'),
                    'Previous ART Status': row.get('previousstatus'),
                    'Confirmed Date of Previous ART Status': row.get('previousstatusdate'),
                    'ART Enrollment Setting': row.get('enrollmentsetting'),
                    'Date of TB Screening (yyyy-mm-dd)': row.get('dateoftbscreened'),
                    'TB Screening Type': row.get('tbscreeningtype'),
                    'CAD Score': row.get('cadscore'),
                    'TB status': row.get('tbstatus'),
                    'Date of TB Sample Collection (yyyy-mm-dd)': row.get('dateoftbsamplecollection'),
                    'TB Diagnostic Test Type': row.get('tbdiagnostictesttype'),
                    'Date of TB Diagnostic Result Received (yyyy-mm-dd)': row.get('dateoftbdiagnosticresultreceived'),
                    'TB Diagnostic Result': row.get('tbdiagnosticresult'),
                    'Date of Additional TB Diagnosis Result using XRAY': row.get('datetbscorecad'),
                    'Additional TB Diagnosis Result using XRAY': row.get('resulttbscorecad'),
                    'Date of Start of TB Treatment (yyyy-mm-dd)': row.get('tbtreatmentstartdate'),
                    'TB Type (new, relapsed etc)': row.get('tbtreatementtype'),
                    'Date of Completion of TB Treatment (yyyy-mm-dd)': row.get('tbcompletiondate'),
                    'TB Treatment Outcome': row.get('tbtreatmentoutcome'),
                    'Date of TPT Start (yyyy-mm-dd)': row.get('dateofiptstart'),
                    'TPT Type': row.get('ipttype'),
                    'TPT Completion date (yyyy-mm-dd)': row.get('iptcompletiondate'),
                    'TPT Completion status': row.get('iptcompletionstatus'),
                    'Date of commencement of EAC (yyyy-mm-dd)': row.get('dateofcommencementofeac'),
                    'Number of EAC Sessions Completed': row.get('numberofeacsessioncompleted'),
                    'Date of last EAC Session Completed': row.get('dateoflasteacsessioncompleted'),
                    'Date of Extended EAC Completion (yyyy-mm-dd)': row.get('dateofextendeaccompletion'),
                    'Date of Repeat Viral Load - Post EAC VL Sample collected (yyyy-mm-dd)': row.get('dateofrepeatviralloadeacsamplecollection'),
                    'Repeat Viral load result (c/ml)- POST EAC': row.get('repeatviralloadresult'),
                    'Date of Repeat Viral load result- POST EAC VL': row.get('dateofrepeatviralloadresult'),
                    'Date of devolvement': row.get('dateofdevolvement'),
                    'Model devolved to': row.get('modeldevolvedto'),
                    'Date of current DSD': row.get('dateofcurrentdsd'),
                    'Current DSD model': row.get('currentdsdmodel'),
                    'Current DSD Outlet': row.get('currentdsdoutlet'),
                    'Date of Return of DSD Client to Facility (yyyy-mm-dd)': row.get('datereturntosite'),
                    'Screening for Chronic Conditions': None,
                    'Co-morbidities': None,
                    'Date of Cervical Cancer Screening (yyyy-mm-dd)': row.get('dateofcervicalcancerscreening'),
                    'Cervical Cancer Screening Type': row.get('cervicalcancerscreeningtype'),
                    'Cervical Cancer Screening Method': row.get('cervicalcancerscreeningmethod'),
                    'Result of Cervical Cancer Screening': row.get('resultofcervicalcancerscreening'),
                    'Date of Precancerous Lesions Treatment (yyyy-mm-dd)': row.get('treatmentmethoddate'),
                    'Precancerous Lesions Treatment Methods': row.get('cervicalcancertreatmentscreened'),
                    'Date Biometrics Enrolled (yyyy-mm-dd)': row.get('datebiometricsenrolled'),
                    'Number of Fingers Captured': row.get('numberoffingerscaptured'),
                    'Date Biometrics Recapture (yyyy-mm-dd)': row.get('datebiometricsrecaptured'),
                    'Number of Fingers Recaptured': row.get('numberoffingersrecaptured'),
                    'Case Manager': row.get('casemanager')
                }

                value = mapping.get(col)
                
                # Handle None
                if value is None:
                    row_data.append('')
                else:
                    row_data.append(value)
            
            data.append(row_data)
    else:
        # No data case - add empty row
        data.append([''] * len(columns))

    # Create DataFrame and write to Excel
    df = pd.DataFrame(data, columns=columns)
    
    # Create Excel file in memory
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='RADET Report', index=False)
        
        # Get the workbook and worksheet
        workbook = writer.book
        worksheet = writer.sheets['RADET Report']
        
        # Set column widths
        for i, col in enumerate(columns):
            column_letter = chr(65 + i) if i < 26 else chr(64 + i//26) + chr(65 + i%26)
            worksheet.column_dimensions[column_letter].width = min(40, max(len(col), 10))
        
        # Style headers
        from openpyxl.styles import Font, PatternFill, Alignment
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="2E7D32", end_color="2E7D32", fill_type="solid")
        header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        
        for cell in worksheet[1]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
    
    output.seek(0)
    return output.getvalue()

# ============================================================
# API ENDPOINTS
# ============================================================

# Health check
@app.route('/api/health', methods=['GET'])
def health_check():
    is_connected = connection_pool is not None
    
    return jsonify({
        'success': True,
        'status': 'online',
        'database': {
            'status': 'connected' if is_connected else 'disconnected',
            'configured': bool(db_config and db_config.get('database', {}).get('database')),
            'name': db_config.get('database', {}).get('database') if db_config else None
        },
        'environment': os.environ.get('FLASK_ENV', 'Development'),
        'timestamp': datetime.now().isoformat(),
        'uptime': None  # Could implement uptime tracking if needed
    })

# Test connection
@app.route('/api/config/test', methods=['POST'])
def test_connection():
    data = request.json
    try:
        conn = psycopg2.connect(
            host=data.get('host'),
            port=data.get('port'),
            database=data.get('database'),
            user=data.get('username'),
            password=data.get('password'),
            connect_timeout=5
        )
        cursor = conn.cursor()
        cursor.execute('SELECT NOW()')
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'message': '✅ Connection successful!'})
    except Exception as error:
        return jsonify({
            'success': False,
            'message': f'❌ Connection failed: {str(error)}'
        }), 500

# Save config
@app.route('/api/config/save', methods=['POST'])
def save_config():
    global db_config
    config = request.json
    
    try:
        config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        
        db_config = config
        connect_to_database()
        
        return jsonify({'success': True, 'message': '✅ Configuration saved!'})
    except Exception as error:
        return jsonify({'success': False, 'message': str(error)}), 500

# Get config status
@app.route('/api/config/status', methods=['GET'])
def config_status():
    return jsonify({
        'configured': bool(db_config and db_config.get('database', {}).get('database')),
        'database': db_config.get('database', {}).get('database') if db_config else None,
        'host': db_config.get('database', {}).get('host') if db_config else None
    })

# Preview query
@app.route('/api/query/preview', methods=['GET'])
def preview_query():
    query = load_query()
    if not query:
        return jsonify({'success': False, 'message': 'Query file not found'}), 404
    
    start_date = request.args.get('startDate', '1990-01-01')
    end_date = request.args.get('endDate', datetime.now().strftime('%Y-%m-%d'))
    
    modified_query = query.replace("'1980-01-01'", f"'{start_date}'")
    modified_query = modified_query.replace("CURRENT_DATE", f"'{end_date}'")
    
    return jsonify({'success': True, 'query': modified_query})

# ============================================================
# MAIN REPORT GENERATION
# ============================================================
@app.route('/api/report/generate', methods=['POST'])
def generate_report():
    data = request.json
    start_date = data.get('startDate')
    end_date = data.get('endDate')
    
    # Validate
    if not start_date or not end_date:
        return jsonify({
            'success': False,
            'message': 'Start date and end date are required'
        }), 400

    if not connection_pool:
        return jsonify({
            'success': False,
            'message': 'Database not configured. Please check settings.'
        }), 400

    conn = None
    try:
        # Load and modify query
        query = load_query()
        if not query:
            return jsonify({
                'success': False,
                'message': 'Query file not found'
            }), 404

        # Replace dates
        query = query.replace("'1980-01-01'", f"'{start_date}'")
        query = query.replace("CURRENT_DATE", f"'{end_date}'")

        print(f'Executing query for range: {start_date} to {end_date}')

        # Execute query
        conn = connection_pool.getconn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(query)
        rows = cursor.fetchall()
        cursor.close()
        
        print(f'Query returned {len(rows)} rows')

        # Generate filename
        filename = f"RADET_Report_{datetime.now().strftime('%Y-%m-%d_%H%M%S')}.xlsx"

        # Generate Excel
        buffer = generate_excel(rows)

        # Send file
        response = make_response(send_file(
            io.BytesIO(buffer),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        ))
        
        response.headers['Content-Length'] = len(buffer)
        return response

    except Exception as error:
        print(f'Query execution error: {str(error)}')
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': f'Error: {str(error)}'
        }), 500
    finally:
        if conn:
            connection_pool.putconn(conn)

# Serve index.html for all other routes (for SPA support)
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    if frontend_path and path and os.path.exists(os.path.join(frontend_path, path)):
        return app.send_static_file(path)
    elif frontend_path and os.path.exists(os.path.join(frontend_path, 'index.html')):
        return app.send_static_file('index.html')
    else:
        return jsonify({'error': 'Frontend not found'}), 404

# ============================================================
# START SERVER
# ============================================================
def start_server():
    # Load config
    load_config()
    
    # Connect to database
    connect_to_database()
    
    # Print startup banner
    db_name = db_config.get('database', {}).get('database') if db_config else 'Not configured'
    db_status = '🟢 CONNECTED' if connection_pool else '🔴 DISCONNECTED'
    
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 RADET REPORT GENERATOR (Python)                         ║
║   ════════════════════════════════════════════════════════   ║
║                                                              ║
║   📡 Server:      http://localhost:{PORT}                      ║
║   🔧 Database:    {db_name}         ║
║   📊 Status:      {db_status}                ║
║   📋 Columns:     81 Total                                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    """)

if __name__ == '__main__':
    start_server()
    app.run(host='0.0.0.0', port=PORT, debug=False)