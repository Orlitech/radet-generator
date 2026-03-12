// ============================================================
// RADET Report Generator - Frontend Application
// Version: 3.0.0
// ============================================================

// Global state
const state = {
    dbConnected: false,
    dbConfigured: false,
    currentSection: 'home',
    history: [],
    serverTime: moment().format('YYYY-MM-DD HH:mm:ss'),
    uptime: 0,
    config: null,
    queryCache: null,
    generationInProgress: false,
    toastQueue: []
};

// DOM Elements
const elements = {
    // Loading
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingMessage: document.getElementById('loadingMessage'),
    
    // Navigation
    navLinks: document.querySelectorAll('.nav-link'),
    sections: document.querySelectorAll('.content-section'),
    
    // Status bar
    dbStatus: document.getElementById('dbStatus'),
    statusMessage: document.getElementById('statusMessage'),
    statusDetail: document.getElementById('statusDetail'),
    serverEnvironment: document.getElementById('serverEnvironment'),
    serverTime: document.getElementById('serverTime'),
    
    // Stats
    dateRangeStat: document.getElementById('dateRangeStat'),
    endDateStat: document.getElementById('endDateStat'),
    dbNameStat: document.getElementById('dbNameStat'),
    dbStatusStat: document.getElementById('dbStatusStat'),
    serverUptime: document.getElementById('serverUptime'),
    
    // Date inputs
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    fullRange: document.getElementById('fullRange'),
    
    // Buttons
    generateBtn: document.getElementById('generateBtn'),
    resetBtn: document.getElementById('resetBtn'),
    
    // Progress
    progressSection: document.getElementById('progressSection'),
    progressBar: document.getElementById('progressBar'),
    progressStatus: document.getElementById('progressStatus'),
    progressPercentage: document.getElementById('progressPercentage'),
    progressDetail: document.getElementById('progressDetail'),
    
    // Config form
    configForm: document.getElementById('configForm'),
    dbHost: document.getElementById('dbHost'),
    dbPort: document.getElementById('dbPort'),
    dbName: document.getElementById('dbName'),
    dbUser: document.getElementById('dbUser'),
    dbPassword: document.getElementById('dbPassword'),
    dbSSL: document.getElementById('dbSSL'),
    testConnectionBtn: document.getElementById('testConnectionBtn'),
    saveConfigBtn: document.getElementById('saveConfigBtn'),
    loadConfigBtn: document.getElementById('loadConfigBtn'),
    togglePassword: document.getElementById('togglePassword'),
    connectionResult: document.getElementById('connectionResult'),
    connectionAlert: document.getElementById('connectionAlert'),
    resultMessage: document.getElementById('resultMessage'),
    resultDetails: document.getElementById('resultDetails'),
    resultIcon: document.getElementById('resultIcon'),
    
    // Query section
    queryDisplay: document.getElementById('queryDisplay'),
    refreshQueryBtn: document.getElementById('refreshQueryBtn'),
    copyQueryBtn: document.getElementById('copyQueryBtn'),
    downloadQueryBtn: document.getElementById('downloadQueryBtn'),
    validateQueryBtn: document.getElementById('validateQueryBtn'),
    queryStats: document.getElementById('queryStats'),
    queryStartDate: document.getElementById('queryStartDate'),
    queryEndDate: document.getElementById('queryEndDate'),
    queryComplexity: document.getElementById('queryComplexity'),
    queryLines: document.getElementById('queryLines'),
    
    // History
    historyTableBody: document.getElementById('historyTableBody'),
    
    // Toast container
    toastContainer: document.querySelector('.toast-container')
};

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing RADET Report Generator...');
    
    // Set default end date to today
    setDefaultDates();
    
    // Initialize event listeners
    initEventListeners();
    
    // Check server status
    await checkServerStatus();
    
    // Load configuration status
    await loadConfigStatus();
    
    // Start periodic updates
    startPeriodicUpdates();
    
    // Hide loading overlay after everything loads
    setTimeout(() => {
        hideLoading();
    }, 1000);
});

function setDefaultDates() {
    const today = moment().format('YYYY-MM-DD');
    elements.endDate.value = today;
    elements.endDate.max = today;
    elements.startDate.max = today;
    elements.endDateStat.textContent = moment().format('MMM D, YYYY');
}

function initEventListeners() {
    // Navigation
    elements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.currentTarget.dataset.section;
            navigateToSection(section);
        });
    });
    
    // Date range
    elements.startDate.addEventListener('change', updateDateRange);
    elements.endDate.addEventListener('change', updateDateRange);
    elements.fullRange.addEventListener('change', toggleFullRange);
    
    // Buttons
    elements.generateBtn.addEventListener('click', generateReport);
    elements.resetBtn.addEventListener('click', resetForm);
    
    // Config buttons
    elements.testConnectionBtn.addEventListener('click', testConnection);
    elements.saveConfigBtn.addEventListener('click', saveConfig);
    elements.loadConfigBtn.addEventListener('click', loadConfig);
    elements.togglePassword?.addEventListener('click', togglePasswordVisibility);
    
    // Query buttons
    elements.refreshQueryBtn?.addEventListener('click', loadQueryPreview);
    elements.copyQueryBtn?.addEventListener('click', copyQueryToClipboard);
    elements.downloadQueryBtn?.addEventListener('click', downloadQuery);
    elements.validateQueryBtn?.addEventListener('click', validateQuery);
}

// ============================================================
// NAVIGATION
// ============================================================

function navigateToSection(sectionId) {
    // Update active state
    elements.navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.dataset.section === sectionId) {
            link.classList.add('active');
        }
    });
    
    // Show selected section
    elements.sections.forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${sectionId}Section`).classList.add('active');
    
    // Load section-specific data
    switch(sectionId) {
        case 'query':
            loadQueryPreview();
            break;
        case 'history':
            loadHistory();
            break;
        case 'config':
            loadConfig();
            break;
    }
}

// ============================================================
// API CALLS
// ============================================================

async function checkServerStatus() {
    try {
        const response = await axios.get('/api/health');
        const data = response.data;
        
        // Update status
        state.dbConnected = data.database?.status === 'connected';
        state.dbConfigured = data.database?.configured;
        
        // Update UI
        updateStatusUI(data);
        
        // Update stats
        elements.dbNameStat.textContent = data.database?.configured ? 
            state.config?.database?.database || 'Configured' : 'Not Configured';
        elements.dbStatusStat.textContent = state.dbConnected ? 'Connected' : 'Disconnected';
        
        return data;
    } catch (error) {
        console.error('Health check failed:', error);
        showToast('error', 'Server Connection', 'Failed to connect to server');
        updateStatusUI({ status: 'error' });
        return null;
    }
}

async function loadConfigStatus() {
    try {
        const response = await axios.get('/api/config/status');
        const data = response.data;
        
        if (data.configured) {
            state.config = {
                database: data.database
            };
            elements.dbNameStat.textContent = data.database.name || 'Configured';
            populateConfigForm(data.database);
        }
        
        return data;
    } catch (error) {
        console.error('Failed to load config status:', error);
        return null;
    }
}

async function loadConfig() {
    try {
        showLoading('Loading configuration...');
        
        const response = await axios.get('/api/config/status');
        const data = response.data;
        
        if (data.configured && data.database) {
            populateConfigForm(data.database);
            showToast('success', 'Configuration Loaded', 'Current settings loaded successfully');
        } else {
            showToast('info', 'No Configuration', 'No saved configuration found');
        }
    } catch (error) {
        console.error('Failed to load config:', error);
        showToast('error', 'Load Failed', error.response?.data?.message || 'Could not load configuration');
    } finally {
        hideLoading();
    }
}

async function testConnection() {
    const config = getConfigFromForm();
    
    // Validate required fields
    if (!config.host || !config.database || !config.username) {
        showToast('warning', 'Validation Error', 'Please fill in all required fields');
        return;
    }
    
    try {
        showLoading('Testing connection...');
        elements.connectionResult.style.display = 'none';
        
        const response = await axios.post('/api/config/test', config);
        
        // Show success
        elements.connectionAlert.className = 'alert alert-success';
        elements.resultIcon.className = 'fas fa-check-circle me-2';
        elements.resultMessage.textContent = response.data.message;
        elements.resultDetails.innerHTML = `
            <strong>Server Time:</strong> ${moment(response.data.serverTime).format('YYYY-MM-DD HH:mm:ss')}
        `;
        elements.connectionResult.style.display = 'block';
        
        showToast('success', 'Connection Successful', 'Database connection test passed');
    } catch (error) {
        // Show error
        elements.connectionAlert.className = 'alert alert-danger';
        elements.resultIcon.className = 'fas fa-exclamation-circle me-2';
        elements.resultMessage.textContent = error.response?.data?.message || 'Connection failed';
        elements.resultDetails.innerHTML = '';
        elements.connectionResult.style.display = 'block';
        
        showToast('error', 'Connection Failed', error.response?.data?.message || 'Could not connect to database');
    } finally {
        hideLoading();
    }
}

async function saveConfig() {
    const config = {
        database: getConfigFromForm()
    };
    
    // Validate
    if (!config.database.host || !config.database.database || !config.database.username) {
        showToast('warning', 'Validation Error', 'Please fill in all required fields');
        return;
    }
    
    try {
        showLoading('Saving configuration...');
        
        const response = await axios.post('/api/config/save', config);
        
        state.config = config;
        showToast('success', 'Configuration Saved', response.data.message);
        
        // Update status
        await checkServerStatus();
        
        // Navigate to home
        navigateToSection('home');
    } catch (error) {
        console.error('Save failed:', error);
        showToast('error', 'Save Failed', error.response?.data?.message || 'Could not save configuration');
    } finally {
        hideLoading();
    }
}

async function generateReport() {
    // Check if generation already in progress
    if (state.generationInProgress) {
        showToast('warning', 'Already Generating', 'Please wait for current report to complete');
        return;
    }
    
    // Validate dates
    if (!elements.startDate.value || !elements.endDate.value) {
        showToast('warning', 'Validation Error', 'Please select start and end dates');
        return;
    }
    
    // Check database connection
    if (!state.dbConnected) {
        showToast('error', 'Database Error', 'Database is not connected. Please check configuration.');
        return;
    }
    
    const startDate = elements.startDate.value;
    const endDate = elements.endDate.value;
    
    // Confirm if large range
    const daysDiff = moment(endDate).diff(moment(startDate), 'days');
    if (daysDiff > 365) {
        const confirm = await showConfirm(
            'Large Date Range',
            `You are generating a RADET REPORT.. This may take few seconds. Continue?`
        );
        if (!confirm) return;
    }
    
    try {
        // Show progress
        state.generationInProgress = true;
        elements.generateBtn.disabled = true;
        elements.progressSection.style.display = 'block';
        updateProgress(10, 'Preparing query...', 'Loading SQL query');
        
        // Prepare request
        const requestData = {
            startDate: startDate,
            endDate: endDate
        };
        
        updateProgress(30, 'Executing database query...', 'This may take a moment');
        
        // Make request with progress tracking
        const response = await axios.post('/api/report/generate', requestData, {
            responseType: 'blob',
            onDownloadProgress: (progressEvent) => {
                if (progressEvent.lengthComputable) {
                    const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                    updateProgress(50 + percent * 0.3, 'Downloading report...', `${percent}% complete`);
                }
            }
        });
        
        updateProgress(90, 'Processing Excel file...', 'Formatting columns and applying styles');
        
        // Get filename from headers
        const contentDisposition = response.headers['content-disposition'];
        const filename = contentDisposition
            ? contentDisposition.split('filename=')[1].replace(/"/g, '')
            : `RADET_Report_${moment().format('YYYY-MM-DD_HHmmss')}.xlsx`;
        
        // Create download link
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        
        updateProgress(100, 'Complete!', 'Report generated successfully');
        
        // Get row count from headers
        const rowCount = response.headers['x-row-count'] || 'Unknown';
        const queryTime = response.headers['x-query-time'] || 'Unknown';
        
        // Add to history
        addToHistory({
            timestamp: moment().format(),
            startDate,
            endDate,
            rows: rowCount,
            executionTime: queryTime,
            filename,
            status: 'Success'
        });
        
        showToast('success', 'Success', `Report generated with ${rowCount} rows in ${queryTime}`);
        
        // Hide progress after delay
        setTimeout(() => {
            elements.progressSection.style.display = 'none';
            state.generationInProgress = false;
            elements.generateBtn.disabled = false;
        }, 3000);
        
    } catch (error) {
        console.error('Generation failed:', error);
        
        // Handle error response
        let errorMessage = 'Failed to generate report';
        if (error.response?.data instanceof Blob) {
            // Try to parse error from blob
            const text = await error.response.data.text();
            try {
                const errorData = JSON.parse(text);
                errorMessage = errorData.message || errorMessage;
            } catch {
                errorMessage = text || errorMessage;
            }
        } else {
            errorMessage = error.response?.data?.message || error.message;
        }
        
        updateProgress(0, 'Failed', errorMessage, 'danger');
        showToast('error', 'Generation Failed', errorMessage);
        
        // Reset after error
        setTimeout(() => {
            elements.progressSection.style.display = 'none';
            state.generationInProgress = false;
            elements.generateBtn.disabled = false;
        }, 3000);
    }
}

async function loadQueryPreview() {
    try {
        const startDate = elements.startDate.value || '1990-01-01';
        const endDate = elements.endDate.value || moment().format('YYYY-MM-DD');
        
        const response = await axios.get('/api/query/preview', {
            params: { startDate, endDate }
        });
        
        const data = response.data;
        
        // Display query
        elements.queryDisplay.innerHTML = `<code class="language-sql">${escapeHtml(data.query)}</code>`;
        
        // Update stats
        elements.queryStats.textContent = `${data.fullLength} characters`;
        elements.queryStartDate.textContent = data.startDate;
        elements.queryEndDate.textContent = data.endDate;
        elements.queryLines.textContent = data.query.split('\n').length;
        
        // Calculate complexity (simple heuristic)
        const complexity = calculateQueryComplexity(data.query);
        elements.queryComplexity.textContent = complexity;
        
        // Highlight if syntax highlighter available
        if (window.hljs) {
            hljs.highlightAll();
        }
        
    } catch (error) {
        console.error('Failed to load query preview:', error);
        elements.queryDisplay.innerHTML = `<code class="text-danger">Error: ${error.response?.data?.message || 'Could not load query'}</code>`;
    }
}

async function loadHistory() {
    // Load from localStorage
    const savedHistory = localStorage.getItem('radet_report_history');
    if (savedHistory) {
        try {
            state.history = JSON.parse(savedHistory);
            renderHistory();
        } catch (e) {
            console.error('Failed to parse history:', e);
        }
    }
}

// ============================================================
// UI UPDATE FUNCTIONS
// ============================================================

function updateStatusUI(data) {
    // Update database status
    if (data.database?.status === 'connected') {
        elements.dbStatus.className = 'status-indicator status-connected';
        elements.statusMessage.textContent = 'Database Connected';
        elements.statusDetail.textContent = `Connected to ${data.database.name || 'database'}`;
    } else if (data.database?.configured) {
        elements.dbStatus.className = 'status-indicator status-warning';
        elements.statusMessage.textContent = 'Database Not Connected';
        elements.statusDetail.textContent = 'Configuration found but not connected';
    } else {
        elements.dbStatus.className = 'status-indicator status-disconnected';
        elements.statusMessage.textContent = 'Not Configured';
        elements.statusDetail.textContent = 'Please configure database settings';
    }
    
    // Update server environment
    const env = data.environment || 'Development';
    elements.serverEnvironment.innerHTML = `<i class="fas fa-${env === 'Production' ? 'rocket' : 'code'} me-2"></i>${env}`;
    
    // Update server time
    if (data.timestamp) {
        elements.serverTime.textContent = moment(data.timestamp).format('YYYY-MM-DD HH:mm:ss');
    }
    
    // Update uptime
    if (data.uptime) {
        const hours = Math.floor(data.uptime / 3600);
        const minutes = Math.floor((data.uptime % 3600) / 60);
        elements.serverUptime.textContent = `${hours}h ${minutes}m`;
    }
}

function updateDateRange() {
    const start = elements.startDate.value;
    const end = elements.endDate.value;
    
    if (start && end) {
        elements.dateRangeStat.textContent = moment(start).format('MMM D, YYYY');
        elements.endDateStat.textContent = moment(end).format('MMM D, YYYY');
        
        // Check if using custom range
        const fullRangeChecked = elements.fullRange.checked;
        const today = moment().format('YYYY-MM-DD');
        
        if (start === '1990-01-01' && end === today && !fullRangeChecked) {
            elements.fullRange.checked = true;
        }
    }
}

function toggleFullRange() {
    if (elements.fullRange.checked) {
        elements.startDate.value = '1990-01-01';
        elements.endDate.value = moment().format('YYYY-MM-DD');
        updateDateRange();
    }
}

function updateProgress(percent, status, detail, type = 'primary') {
    elements.progressBar.style.width = `${percent}%`;
    elements.progressBar.className = `progress-bar progress-bar-striped progress-bar-animated bg-${type}`;
    elements.progressStatus.textContent = status;
    elements.progressPercentage.textContent = `${Math.round(percent)}%`;
    elements.progressDetail.textContent = detail;
}

function resetForm() {
    elements.startDate.value = '1990-01-01';
    elements.endDate.value = moment().format('YYYY-MM-DD');
    elements.fullRange.checked = true;
    updateDateRange();
    showToast('info', 'Reset', 'Form has been reset to default values');
}

function populateConfigForm(database) {
    elements.dbHost.value = database.host || '';
    elements.dbPort.value = database.port || '5432';
    elements.dbName.value = database.name || '';
    elements.dbUser.value = database.username || '';
    elements.dbSSL.value = database.ssl ? 'true' : 'false';
}

function getConfigFromForm() {
    return {
        host: elements.dbHost.value,
        port: elements.dbPort.value,
        database: elements.dbName.value,
        username: elements.dbUser.value,
        password: elements.dbPassword.value,
        ssl: elements.dbSSL.value === 'true'
    };
}

function togglePasswordVisibility() {
    const type = elements.dbPassword.type === 'password' ? 'text' : 'password';
    elements.dbPassword.type = type;
    elements.togglePassword.innerHTML = `<i class="fas fa-${type === 'password' ? 'eye' : 'eye-slash'}"></i>`;
}

// ============================================================
// HISTORY FUNCTIONS
// ============================================================

function addToHistory(entry) {
    state.history.unshift(entry);
    
    // Keep only last 50 entries
    if (state.history.length > 50) {
        state.history.pop();
    }
    
    // Save to localStorage
    localStorage.setItem('radet_report_history', JSON.stringify(state.history));
    
    // Render if on history page
    if (document.getElementById('historySection').classList.contains('active')) {
        renderHistory();
    }
}

function renderHistory() {
    if (!elements.historyTableBody) return;
    
    if (state.history.length === 0) {
        elements.historyTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted py-5">
                    <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                    No history available
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    state.history.forEach((entry, index) => {
        html += `
            <tr>
                <td>${moment(entry.timestamp).format('YYYY-MM-DD HH:mm')}</td>
                <td>${entry.startDate}</td>
                <td>${entry.endDate}</td>
                <td>${entry.rows}</td>
                <td>${entry.executionTime}</td>
                <td><small>${entry.filename}</small></td>
                <td><span class="badge bg-success">${entry.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="downloadHistoryEntry('${index}')">
                        <i class="fas fa-download"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    elements.historyTableBody.innerHTML = html;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function showLoading(message = 'Loading...') {
    elements.loadingOverlay.style.display = 'flex';
    elements.loadingMessage.textContent = message;
}

function hideLoading() {
    elements.loadingOverlay.style.display = 'none';
}

function showToast(type, title, message, duration = 5000) {
    const icon = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    }[type] || 'fa-info-circle';
    
    const bgClass = {
        success: 'bg-success',
        error: 'bg-danger',
        warning: 'bg-warning',
        info: 'bg-info'
    }[type] || 'bg-info';
    
    const toastId = `toast-${Date.now()}`;
    
    const toastHtml = `
        <div id="${toastId}" class="toast animate__animated animate__fadeInUp" role="alert" aria-live="assertive" aria-atomic="true" data-bs-autohide="true" data-bs-delay="${duration}">
            <div class="toast-header ${bgClass} text-white">
                <i class="fas ${icon} me-2"></i>
                <strong class="me-auto">${title}</strong>
                <small>just now</small>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `;
    
    elements.toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
    
    // Remove from DOM after hiding
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

function showConfirm(title, message) {
    // Create modal dynamically
    const modalId = `confirmModal-${Date.now()}`;
    
    const modalHtml = `
        <div class="modal fade" id="${modalId}" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="confirmBtn">Continue</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    return new Promise((resolve) => {
        const modalElement = document.getElementById(modalId);
        const modal = new bootstrap.Modal(modalElement);
        
        document.getElementById('confirmBtn').addEventListener('click', () => {
            modal.hide();
            resolve(true);
        });
        
        modalElement.addEventListener('hidden.bs.modal', () => {
            modalElement.remove();
            resolve(false);
        });
        
        modal.show();
    });
}

function validateDates() {
    const start = elements.startDate.value;
    const end = elements.endDate.value;
    
    if (start && end && start > end) {
        elements.startDate.value = end;
        showToast('warning', 'Date Validation', 'Start date cannot be after end date');
    }
    
    updateDateRange();
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function calculateQueryComplexity(query) {
    const features = {
        joins: (query.match(/JOIN/gi) || []).length,
        subqueries: (query.match(/SELECT\s+.*\s+FROM\s*\(/gi) || []).length,
        ctes: (query.match(/WITH\s+\w+\s+AS/gi) || []).length,
        unions: (query.match(/UNION/gi) || []).length,
        windows: (query.match(/OVER\s*\(/gi) || []).length
    };
    
    const total = Object.values(features).reduce((a, b) => a + b, 0);
    
    if (total > 10) return 'Complex';
    if (total > 5) return 'Moderate';
    if (total > 0) return 'Simple';
    return 'Basic';
}

async function copyQueryToClipboard() {
    const text = elements.queryDisplay.textContent;
    try {
        await navigator.clipboard.writeText(text);
        showToast('success', 'Copied!', 'Query copied to clipboard');
    } catch (err) {
        showToast('error', 'Copy Failed', 'Could not copy to clipboard');
    }
}

function downloadQuery() {
    const query = elements.queryDisplay.textContent;
    const blob = new Blob([query], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `query_${moment().format('YYYY-MM-DD_HHmmss')}.sql`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

function validateQuery() {
    const query = elements.queryDisplay.textContent;
    
    // Basic validation checks
    const checks = [
        { pattern: /SELECT\s+/i, message: 'Missing SELECT statement' },
        { pattern: /FROM\s+/i, message: 'Missing FROM clause' },
        { pattern: /;/g, message: 'Multiple statements detected' }
    ];
    
    const errors = [];
    checks.forEach(check => {
        if (!check.pattern.test(query)) {
            errors.push(check.message);
        }
    });
    
    if (errors.length === 0) {
        showToast('success', 'Valid Query', 'SQL syntax appears valid');
    } else {
        showToast('warning', 'Validation Issues', errors.join(', '));
    }
}

function downloadHistoryEntry(index) {
    const entry = state.history[index];
    showToast('info', 'Download', 'This feature will download the original report file');
}

// ============================================================
// PERIODIC UPDATES
// ============================================================

function startPeriodicUpdates() {
    // Update server time every second
    setInterval(() => {
        state.serverTime = moment().format('YYYY-MM-DD HH:mm:ss');
        elements.serverTime.textContent = state.serverTime;
    }, 1000);
    
    // Check server health every 30 seconds
    setInterval(async () => {
        await checkServerStatus();
    }, 30000);
    
    // Update uptime
    setInterval(() => {
        state.uptime++;
        const hours = Math.floor(state.uptime / 3600);
        const minutes = Math.floor((state.uptime % 3600) / 60);
        elements.serverUptime.textContent = `${hours}h ${minutes}m`;
    }, 1000);
}

// ============================================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ============================================================

window.validateDates = validateDates;
window.downloadHistoryEntry = downloadHistoryEntry;