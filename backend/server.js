const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const XLSX = require('xlsx');
const moment = require('moment');
const fs = require('fs');

const app = express();
let PORT = process.env.PORT || 3000;

// ============================================================
// CRITICAL: PATH CONFIGURATION FOR PACKAGED APP
// ============================================================
const IS_PACKAGED = !!process.pkg;
const EXECUTABLE_PATH = IS_PACKAGED ? path.dirname(process.execPath) : __dirname;
const SNAPSHOT_PATH = __dirname; // Where embedded files live

console.log('📦 Packaged mode:', IS_PACKAGED ? 'YES' : 'NO');
console.log('📁 Executable path:', EXECUTABLE_PATH);
console.log('📁 Snapshot path:', SNAPSHOT_PATH);

// ============================================================
// FIND FRONTEND FILES (MULTIPLE FALLBACK LOCATIONS)
// ============================================================
const possibleFrontendPaths = [
    // When packaged: embedded in snapshot
    path.join(SNAPSHOT_PATH, 'frontend'),
    // When packaged: next to executable
    path.join(EXECUTABLE_PATH, 'frontend'),
    // Development: standard location
    path.join(__dirname, '../frontend'),
    path.join(__dirname, 'frontend'),
    path.join(process.cwd(), 'frontend')
];

let frontendPath = null;
for (const testPath of possibleFrontendPaths) {
    try {
        const indexPath = path.join(testPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            frontendPath = testPath;
            console.log('✅ Frontend found at:', testPath);
            break;
        }
    } catch (e) {
        // Ignore errors, continue trying
    }
}

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());

// Serve static files if frontend found
if (frontendPath) {
    app.use(express.static(frontendPath));
    console.log('📁 Serving static files from:', frontendPath);
} else {
    console.error('❌ Could not find frontend files!');
}

// ============================================================
// DATABASE CONNECTION
// ============================================================
let pool = null;
let dbConfig = null;

// ============================================================
// LOAD CONFIGURATION
// ============================================================
function loadConfig() {
    try {
        const possibleConfigPaths = [
            // External config next to executable (user editable)
            path.join(EXECUTABLE_PATH, 'config.json'),
            // Embedded default config
            path.join(SNAPSHOT_PATH, 'config.default.json'),
            // Development paths
            path.join(__dirname, 'config.json'),
            path.join(process.cwd(), 'config.json')
        ];

        for (const configPath of possibleConfigPaths) {
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                dbConfig = JSON.parse(configData);
                console.log('✅ Config loaded from:', configPath);
                console.log('📊 Database:', dbConfig.database?.database);
                return true;
            }
        }

        console.log('⚠️ No config file found');
        return false;
    } catch (error) {
        console.error('❌ Failed to load config:', error.message);
        return false;
    }
}

// ============================================================
// LOAD QUERY
// ============================================================
function loadQuery() {
    try {
        const possibleQueryPaths = [
            // External query next to executable (user editable)
            path.join(EXECUTABLE_PATH, 'query.sql'),
            // Embedded query
            path.join(SNAPSHOT_PATH, 'query.sql'),
            // Development paths
            path.join(__dirname, 'query.sql'),
            path.join(process.cwd(), 'query.sql')
        ];

        for (const queryPath of possibleQueryPaths) {
            if (fs.existsSync(queryPath)) {
                console.log('📁 Using query file:', queryPath);
                return fs.readFileSync(queryPath, 'utf8');
            }
        }

        console.error('❌ Query file not found');
        return null;
    } catch (error) {
        console.error('❌ Failed to load query:', error.message);
        return null;
    }
}

// ============================================================
// CONNECT TO DATABASE
// ============================================================
async function connectToDatabase() {
    if (!dbConfig || !dbConfig.database || !dbConfig.database.database) {
        console.log('⚠️ Database not configured');
        return false;
    }

    try {
        pool = new Pool({
            host: dbConfig.database.host,
            port: dbConfig.database.port,
            database: dbConfig.database.database,
            user: dbConfig.database.username,
            password: dbConfig.database.password,
            ssl: dbConfig.database.ssl ? { rejectUnauthorized: false } : false,
            connectionTimeoutMillis: 5000
        });

        // Test connection
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        
        console.log('✅ Database connected successfully to', dbConfig.database.database);
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        pool = null;
        return false;
    }
}

// ============================================================
// EXCEL GENERATION FUNCTION
// ============================================================
function generateExcel(rows) {
    // Your 81 columns in exact order
    const columns = [
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
    ];

    // Prepare data
    const data = [columns];    
    // Add data rows
    if (rows && rows.length > 0) {
        rows.forEach((row, index) => {
            const rowData = columns.map((col, colIndex) => {
                // Handle S/No.
                if (col === 'S/No.') {
                    return index + 1;
                }
                
                // Map your query columns to Excel columns based on your actual query output
                const mapping = {
                    'State': row.state,
                    'L.G.A': row.lga,
                    'LGA Of Residence': row.lgaofresidence,
                    'Facility Name': row.facilityname,
                    'DatimId': row.datimid,
                    'Patient ID': row.personuuid || row.uniquepersonuuid,
                    'NDR Patient Identifier': row.ndrpatientidentifier,
                    'Hospital Number': row.hospitalnumber,
                    'Unique Id': row.uniqueid,
                    'Household Unique No': row.householdnumber || row.householduniqueno || row.householduniqueNo,
                    'OVC Unique ID': row.ovcnumber || row.ovcuniqueid || row.ovcUniqueId,
                    'Sex': row.gender,
                    'Target group': row.targetgroup,
                    'Current Weight (kg)': row.currentweight,
                    'Pregnancy Status': row.pregnancystatus,
                    'Date of Birth (yyyy-mm-dd)': row.dateofbirth,
                    'Age': row.age,
                    'Care Entry Point': row.careentry,
                    'Date of Registration': row.dateofregistration,
                    'Enrollment Date (yyyy-mm-dd)': row.dateofenrollment,
                    'ART Start Date (yyyy-mm-dd)': row.artstartdate,
                    'Last Pickup Date (yyyy-mm-dd)': row.lastpickupdate,
                    'Months of ARV Refill': row.monthsofarxrefill || row.monthsofarvrefill,
                    'Regimen Line at ART Start': row.regimenlineatstart,
                    'Regimen at ART Start': row.regimenatstart,
                    'Date of Start of Current ART Regimen': row.dateofcurrentregimen,
                    'Current Regimen Line': row.currentregimenline,
                    'Current ART Regimen': row.currentartregimen,
                    'Clinical Staging at Last Visit': row.currentclinicalstage,
                    'Date of Last CD4 Count': row.dateoflastcd4count,
                    'Last CD4 Count': row.lastcd4count,
                    'Date of Viral Load Sample Collection (yyyy-mm-dd)': row.dateofviralloadsamplecollection,
                    'Date of Current ViralLoad Result Sample (yyyy-mm-dd)': row.dateofcurrentviralloadsample,
                    'Current Viral Load (c/ml)': row.currentviralload,
                    'Date of Current Viral Load (yyyy-mm-dd)': row.dateofcurrentviralload,
                    'Viral Load Indication': row.viralloadindication,
                    'Viral Load Eligibility Status': row.vleligibilitystatus,
                    'Date of Viral Load Eligibility Status': row.dateofvleligibilitystatus,
                    'Current ART Status': row.currentstatus,
                    'Date of Current ART Status': row.currentstatusdate,
                    'Client Verification Outcome': row.clientverificationoutcome,
                    'Cause of Death': row.causeofdeath,
                    'VA Cause of Death': row.vacauseofdeath,
                    'Previous ART Status': row.previousstatus,
                    'Confirmed Date of Previous ART Status': row.previousstatusdate,
                    'ART Enrollment Setting': row.enrollmentsetting,
                    'Date of TB Screening (yyyy-mm-dd)': row.dateoftbscreened,
                    'TB Screening Type': row.tbscreeningtype,
                    'CAD Score': row.cadscore,
                    'TB status': row.tbstatus,
                    'Date of TB Sample Collection (yyyy-mm-dd)': row.dateoftbsamplecollection,
                    'TB Diagnostic Test Type': row.tbdiagnostictesttype,
                    'Date of TB Diagnostic Result Received (yyyy-mm-dd)': row.dateoftbdiagnosticresultreceived,
                    'TB Diagnostic Result': row.tbdiagnosticresult,
                    'Date of Additional TB Diagnosis Result using XRAY': row.datetbscorecad,
                    'Additional TB Diagnosis Result using XRAY': row.resulttbscorecad,
                    'Date of Start of TB Treatment (yyyy-mm-dd)': row.tbtreatmentstartdate,
                    'TB Type (new, relapsed etc)': row.tbtreatementtype,
                    'Date of Completion of TB Treatment (yyyy-mm-dd)': row.tbcompletiondate,
                    'TB Treatment Outcome': row.tbtreatmentoutcome,
                    'Date of TPT Start (yyyy-mm-dd)': row.dateofiptstart,
                    'TPT Type': row.ipttype,
                    'TPT Completion date (yyyy-mm-dd)': row.iptcompletiondate,
                    'TPT Completion status': row.iptcompletionstatus,
                    'Date of commencement of EAC (yyyy-mm-dd)': row.dateofcommencementofeac,
                    'Number of EAC Sessions Completed': row.numberofeacsessioncompleted,
                    'Date of last EAC Session Completed': row.dateoflasteacsessioncompleted,
                    'Date of Extended EAC Completion (yyyy-mm-dd)': row.dateofextendeaccompletion,
                    'Date of Repeat Viral Load - Post EAC VL Sample collected (yyyy-mm-dd)': row.dateofrepeatviralloadeacsamplecollection,
                    'Repeat Viral load result (c/ml)- POST EAC': row.repeatviralloadresult,
                    'Date of Repeat Viral load result- POST EAC VL': row.dateofrepeatviralloadresult,
                    'Date of devolvement': row.dateofdevolvement,
                    'Model devolved to': row.modeldevolvedto,
                    'Date of current DSD': row.dateofcurrentdsd,
                    'Current DSD model': row.currentdsdmodel,
                    'Current DSD Outlet': row.currentdsdoutlet,
                    'Date of Return of DSD Client to Facility (yyyy-mm-dd)': row.datereturntosite,
                    'Screening for Chronic Conditions': null, // Not in query
                    'Co-morbidities': null, // Not in query
                    'Date of Cervical Cancer Screening (yyyy-mm-dd)': row.dateofcervicalcancerscreening,
                    'Cervical Cancer Screening Type': row.cervicalcancerscreeningtype,
                    'Cervical Cancer Screening Method': row.cervicalcancerscreeningmethod,
                    'Result of Cervical Cancer Screening': row.resultofcervicalcancerscreening,
                    'Date of Precancerous Lesions Treatment (yyyy-mm-dd)': row.treatmentmethoddate,
                    'Precancerous Lesions Treatment Methods': row.cervicalcancertreatmentscreened,
                    'Date Biometrics Enrolled (yyyy-mm-dd)': row.datebiometricsenrolled,
                    'Number of Fingers Captured': row.numberoffingerscaptured,
                    'Date Biometrics Recapture (yyyy-mm-dd)': row.datebiometricsrecaptured,
                    'Number of Fingers Recaptured': row.numberoffingersrecaptured,
                    'Case Manager': row.casemanager
                };

                const value = mapping[col];
                
                // Format dates if they're Date objects
                if (value && typeof value === 'object' && value instanceof Date) {
                    return moment(value).format('YYYY-MM-DD');
                }
                
                // Handle null/undefined
                if (value === null || value === undefined) {
                    return '';
                }
                
                return value;
            });
            data.push(rowData);
        });
    } else {
        // No data case - add empty row
        const emptyRow = columns.map(() => '');
        data.push(emptyRow);
    }

    // Create worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    ws['!cols'] = columns.map(col => ({
        wch: Math.min(40, Math.max(col.length, 10))
    }));

    // Style headers
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; C++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
        if (ws[cellRef]) {
            ws[cellRef].s = {
                font: { bold: true, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "2E7D32" } },
                alignment: { horizontal: "center", vertical: "center", wrapText: true }
            };
        }
    }

    XLSX.utils.book_append_sheet(wb, ws, "RADET Report");
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ============================================================
// API ENDPOINTS
// ============================================================

// Health check
// Health check - FIXED VERSION
app.get('/api/health', (req, res) => {
    const isConnected = pool !== null;
    
    res.json({
        success: true,
        status: 'online',
        database: {
            status: isConnected ? 'connected' : 'disconnected',
            configured: !!dbConfig?.database?.database,
            name: dbConfig?.database?.database || null
        },
        environment: process.env.NODE_ENV || 'Development',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Test connection
app.post('/api/config/test', async (req, res) => {
    const { host, port, database, username, password } = req.body;
    
    const testPool = new Pool({
        host, port, database,
        user: username,
        password: password,
        connectionTimeoutMillis: 5000
    });

    try {
        const client = await testPool.connect();
        await client.query('SELECT NOW()');
        client.release();
        await testPool.end();
        
        res.json({ success: true, message: '✅ Connection successful!' });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: `❌ Connection failed: ${error.message}` 
        });
    }
});

// Save config
app.post('/api/config/save', async (req, res) => {
    const config = req.body;
    
    try {
        fs.writeFileSync(
            path.join(__dirname, 'config.json'), 
            JSON.stringify(config, null, 2)
        );
        
        dbConfig = config;
        await connectToDatabase();
        
        res.json({ success: true, message: '✅ Configuration saved!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get config status
app.get('/api/config/status', (req, res) => {
    res.json({
        configured: !!(dbConfig?.database?.database),
        database: dbConfig?.database?.database || null,
        host: dbConfig?.database?.host || null
    });
});

// Preview query
app.get('/api/query/preview', (req, res) => {
    const query = loadQuery();
    if (!query) {
        return res.status(404).json({ success: false, message: 'Query file not found' });
    }
    
    const startDate = req.query.startDate || '1990-01-01';
    const endDate = req.query.endDate || moment().format('YYYY-MM-DD');
    
    let modifiedQuery = query.replace(/'1980-01-01'/g, `'${startDate}'`);
    modifiedQuery = modifiedQuery.replace(/CURRENT_DATE/g, `'${endDate}'`);
    
    res.json({ success: true, query: modifiedQuery });
});

// ============================================================
// MAIN REPORT GENERATION
// ============================================================

app.post('/api/report/generate', async (req, res) => {
    const { startDate, endDate } = req.body;
    
    // Validate
    if (!startDate || !endDate) {
        return res.status(400).json({ 
            success: false, 
            message: 'Start date and end date are required' 
        });
    }

    if (!pool) {
        return res.status(400).json({ 
            success: false, 
            message: 'Database not configured. Please check settings.' 
        });
    }

    let client;
    try {
        // Load and modify query
        let query = loadQuery();
        if (!query) {
            return res.status(404).json({ 
                success: false, 
                message: 'Query file not found' 
            });
        }

        // Replace dates
        query = query.replace(/'1980-01-01'/g, `'${startDate}'`);
        query = query.replace(/CURRENT_DATE/g, `'${endDate}'`);

        console.log('Executing query for range:', startDate, 'to', endDate);

        // Execute query
        client = await pool.connect();
        const result = await client.query(query);
        
        console.log(`Query returned ${result.rows.length} rows`);

        // Generate filename
        const filename = `RADET_Report_${moment().format('YYYY-MM-DD_HHmmss')}.xlsx`;

        // Generate Excel
        const buffer = generateExcel(result.rows);

        // Send file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);

    } catch (error) {
        console.error('Query execution error:', error);
        res.status(500).json({ 
            success: false, 
            message: `Error: ${error.message}` 
        });
    } finally {
        if (client) client.release();
    }
});

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
    // Load config
    loadConfig();
    
    // Connect to database
    await connectToDatabase();
    
    // Start listening
    app.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 RADET REPORT GENERATOR                                  ║
║   ════════════════════════════════════════════════════════   ║
║                                                              ║
║   📡 Server:      http://localhost:${PORT}                      ║
║   🔧 Database:    ${dbConfig?.database?.database || 'Not configured'}         ║
║   📊 Status:      ${pool ? '🟢 CONNECTED' : '🔴 DISCONNECTED'}                ║
║   📋 Columns:     81 Total                                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
        `);
    });
}

startServer();