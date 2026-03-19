import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalPage, setAuthModalPage] = useState('login');

  const handleLoginSuccess = (newToken, userData) => {
    setToken(newToken);
    setUser(userData);
    setIsAuthenticated(true);
    localStorage.setItem('token', newToken);
    setShowAuthModal(false);
  };

  return (
    <div className="App">
      <DashboardPages
        token={token}
        user={user}
        setUser={setUser}
        isAuthenticated={isAuthenticated}
        onShowAuth={(page) => { setAuthModalPage(page || 'login'); setShowAuthModal(true); }}
        onLogout={() => {
          setToken(null);
          setUser(null);
          setIsAuthenticated(false);
          localStorage.removeItem('token');
        }}
      />
      {showAuthModal && (
        <AuthModal
          currentPage={authModalPage}
          setCurrentPage={setAuthModalPage}
          onLoginSuccess={handleLoginSuccess}
          onClose={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
}

function AuthModal({ currentPage, setCurrentPage, onLoginSuccess, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-modal-panel" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h1 style={{ textAlign: 'center', marginBottom: '8px' }}>
          <span className="brand-flash">Flash</span><span className="brand-risk">Risk</span>
        </h1>
        {currentPage === 'login' ? (
          <LoginForm onSuccess={onLoginSuccess} onSwitchToSignup={() => setCurrentPage('signup')} />
        ) : (
          <SignupForm onSuccess={onLoginSuccess} onSwitchToLogin={() => setCurrentPage('login')} />
        )}
      </div>
    </div>
  );
}

function LoginForm({ onSuccess, onSwitchToSignup }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      onSuccess(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      
      {error && <div className="error">{error}</div>}

      <div>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
        />
      </div>

      <div>
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>

      <p className="auth-switch">
        Don't have an account?{' '}
        <button type="button" onClick={onSwitchToSignup} className="link-button">
          Sign up
        </button>
      </p>
    </form>
  );
}

function SignupForm({ onSuccess, onSwitchToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [pwTouched, setPwTouched] = useState(false);

  const pwLength = password.length >= 8;
  const pwUpper  = /[A-Z]/.test(password);
  const pwNumber = /[0-9]/.test(password);

  const validate = () => {
    const errs = {};
    if (!firstName.trim()) errs.firstName = 'First name is required';
    if (!lastName.trim())  errs.lastName  = 'Last name is required';
    if (!companyName.trim()) errs.companyName = 'Company name is required';
    if (!email.trim())     errs.email     = 'Email is required';
    if (!password)         errs.password  = 'Password is required';
    else if (!pwLength || !pwUpper || !pwNumber) errs.password = 'Password does not meet requirements';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setLoading(true);
    setError('');
    setFieldErrors({});

    try {
      const response = await fetch('http://localhost:5000/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, companyName, firstName, lastName })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      onSuccess(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create Account</h2>

      {error && <div className="error">{error}</div>}

      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <label>First Name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); setFieldErrors(f => ({ ...f, firstName: '' })); }}
            placeholder="John"
            className={fieldErrors.firstName ? 'input-error' : ''}
          />
          {fieldErrors.firstName && <div className="field-error">{fieldErrors.firstName}</div>}
        </div>
        <div style={{ flex: 1 }}>
          <label>Last Name</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => { setLastName(e.target.value); setFieldErrors(f => ({ ...f, lastName: '' })); }}
            placeholder="Smith"
            className={fieldErrors.lastName ? 'input-error' : ''}
          />
          {fieldErrors.lastName && <div className="field-error">{fieldErrors.lastName}</div>}
        </div>
      </div>

      <div>
        <label>Company Name</label>
        <input
          type="text"
          value={companyName}
          onChange={(e) => { setCompanyName(e.target.value); setFieldErrors(f => ({ ...f, companyName: '' })); }}
          placeholder="Your Company"
          className={fieldErrors.companyName ? 'input-error' : ''}
        />
        {fieldErrors.companyName && <div className="field-error">{fieldErrors.companyName}</div>}
      </div>

      <div>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setFieldErrors(f => ({ ...f, email: '' })); }}
          placeholder="you@company.com"
          className={fieldErrors.email ? 'input-error' : ''}
        />
        {fieldErrors.email && <div className="field-error">{fieldErrors.email}</div>}
      </div>

      <div>
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setFieldErrors(f => ({ ...f, password: '' })); }}
          onFocus={() => setPwTouched(true)}
          placeholder="••••••••"
          className={fieldErrors.password ? 'input-error' : ''}
        />
        {fieldErrors.password && <div className="field-error">{fieldErrors.password}</div>}
        {(pwTouched || password) && (
          <ul className="pw-requirements">
            <li className={pwLength ? 'pw-req-met' : 'pw-req-unmet'}>At least 8 characters</li>
            <li className={pwUpper  ? 'pw-req-met' : 'pw-req-unmet'}>One uppercase letter</li>
            <li className={pwNumber ? 'pw-req-met' : 'pw-req-unmet'}>One number</li>
          </ul>
        )}
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Creating account...' : 'Sign Up'}
      </button>

      <p className="auth-switch">
        Already have an account?{' '}
        <button type="button" onClick={onSwitchToLogin} className="link-button">
          Login
        </button>
      </p>
    </form>
  );
}

function DashboardPages({ token, user, setUser, isAuthenticated, onShowAuth, onLogout }) {
  const [activeTab, setActiveTab] = useState('assess');
  const [navPage, setNavPage] = useState(null);
  const [address, setAddress] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLimited, setHistoryLimited] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkErrors, setBulkErrors] = useState([]);
  const [bulkFileError, setBulkFileError] = useState(null);
  const [bulkSkipped, setBulkSkipped] = useState([]);
  const [pendingBulkAddresses, setPendingBulkAddresses] = useState(null);
  const [bulkJobId, setBulkJobId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const bulkPollRef = useRef(null);
  const [selectedBulkResult, setSelectedBulkResult] = useState(null);
  const [selectedHistoryResult, setSelectedHistoryResult] = useState(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [credits, setCredits] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showBuyCreditsModal, setShowBuyCreditsModal] = useState(false);
  const [creditPacks, setCreditPacks] = useState([]);
  const [fromDate, setFromDate] = useState('');
  const [fromTime, setFromTime] = useState('');
  const [toDate, setToDate] = useState('');
  const [toTime, setToTime] = useState('');
  const [addressSearch, setAddressSearch] = useState('');
  const [demoResults, setDemoResults] = useState([]);
  const [selectedDemoResult, setSelectedDemoResult] = useState(null);

  useEffect(() => {
    fetch('http://localhost:5000/api/demo')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.demos) setDemoResults(data.demos); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isAuthenticated) setShowProfileMenu(false);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadCredits();
    loadHistory();
    fetch('http://localhost:5000/api/me', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUser(data); })
      .catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'history') {
      loadHistory();
    }
    if (!isAuthenticated) {
      setHistory([]);
      setHistoryLimited(false);
    }
  }, [activeTab, isAuthenticated]);

  const loadCredits = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/credits', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCredits(data.credits);
      }
    } catch (_) {}
  };

  const openBuyCreditsModal = async () => {
    setShowBuyCreditsModal(true);
    if (creditPacks.length === 0) {
      try {
        const res = await fetch('http://localhost:5000/api/credit-packs');
        if (res.ok) { const d = await res.json(); setCreditPacks(d.packs || []); }
      } catch (_) {}
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/assessments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to load history');

      const data = await response.json();
      setHistory(data.assessments);
      setHistoryLimited(data.historyLimited || false);
    } catch (err) {
      setError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAddressChange = async (e) => {
    const value = e.target.value;
    setAddress(value);

    if (value.length >= 2) {
      try {
        const response = await fetch(
          `http://localhost:5000/api/autocomplete?input=${encodeURIComponent(value)}`
        );
        const data = await response.json();
        
        if (data.predictions && data.predictions.length > 0) {
          const suggestions = data.predictions
            .slice(0, 5)
            .map(prediction => prediction.description);
          setSuggestions(suggestions);
        } else {
          setSuggestions([]);
        }
      } catch (err) {
        console.error('Autocomplete error:', err);
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
    }
  };

  const handleSelectSuggestion = (suggestion) => {
    setAddress(suggestion);
    setSuggestions([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmed = address.trim();
    if (trimmed.length < 6 || !/\d/.test(trimmed)) {
      setError('Please enter a valid street address (e.g. 123 Main St, City, ST).');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/assess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ address })
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 402 || errorData.no_credits) {
          openBuyCreditsModal();
          return;
        }
        throw new Error(errorData.error || 'Failed to assess risk');
      }

      const data = await response.json();
      setResult(data);
      setHistory([data, ...history]);
      setAddress('');
      setSuggestions([]);
      loadCredits();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Build datetime bounds -time is optional; blank time = start/end of day
  const fromDateTime = fromDate ? new Date(`${fromDate}T${fromTime || '00:00:00'}`) : null;
  const toDateTime   = toDate   ? new Date(`${toDate}T${toTime   || '23:59:59'}`) : null;

  const filteredHistory = history.filter(item => {
    const date = new Date(item.createdAt);
    if (fromDateTime && !isNaN(date.getTime()) && date < fromDateTime) return false;
    if (toDateTime   && !isNaN(date.getTime()) && date > toDateTime)   return false;
    if (addressSearch.trim()) {
      const q = addressSearch.trim().toLowerCase();
      const submitted = (item.inputAddress || '').toLowerCase();
      const geocoded  = (item.address || '').toLowerCase();
      if (!submitted.includes(q) && !geocoded.includes(q)) return false;
    }
    return true;
  });

  const isFiltered = fromDate || toDate || addressSearch.trim();

  const clearFilter = () => { setFromDate(''); setFromTime(''); setToDate(''); setToTime(''); setAddressSearch(''); };

  const downloadHistory = (format) => {
    const rows = filteredHistory.map(item => ({
      'Submitted Address': item.inputAddress || item.address || '',
      'Geocoded Address': item.address || '',
      'Date Assessed': item.createdAt ? new Date(item.createdAt).toLocaleString() : '',
      'Overall Risk': item.overall?.riskLevel || '',
      'Wildfire Grade': item.natural?.wildfire?.grade || '',
      'Wildfire Rating': item.natural?.wildfire?.rating || '',
      'Flood Grade': item.natural?.flood?.grade || '',
      'Flood Rating': item.natural?.flood?.rating || '',
      'Earthquake Grade': item.natural?.earthquake?.grade || '',
      'Hurricane Grade': item.natural?.hurricane?.grade || '',
      'Tornado Grade': item.natural?.tornado?.grade || '',
      'Hail Grade': item.natural?.hail?.grade || '',
      'Wind Grade': item.natural?.wind?.grade || '',
      'Lightning Grade': item.natural?.lightning?.grade || '',
      'Crime Grade': item.human?.crime?.grade || '',
      'Crime Rating': item.human?.crime?.rating || '',
      'Water Quality (PFAS)': item.human?.waterQuality?.pfas || '',
      'Road Noise': item.human?.noise?.road || '',
      'Fire Response': item.neighborhood?.fireResponse || '',
      'Walkability': item.neighborhood?.walkability || '',
    }));

    if (format === 'csv') {
      const headers = Object.keys(rows[0] || {});
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'risk-assessments.csv'; a.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Assessments');
      XLSX.writeFile(wb, 'risk-assessments.xlsx');
    }
  };

  const parseCSVLine = (line) => {
    const fields = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if (line[i] === ',' && !inQuotes) { fields.push(cur.trim()); cur = ''; }
      else { cur += line[i]; }
    }
    fields.push(cur.trim());
    return fields;
  };

  const parseFileToAddresses = async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const key = Object.keys(rows[0] || {}).find(k => k.toLowerCase() === 'address');
      if (!key) throw new Error('Spreadsheet must have an "address" column');
      return rows.map(r => r[key]).filter(Boolean);
    } else {
      const text = await file.text();
      const lines = text.split('\n');
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
      const addressIndex = headers.findIndex(h => h === 'address');
      if (addressIndex === -1) throw new Error('CSV must have an "address" column');
      return lines.slice(1)
        .filter(l => l.trim())
        .map(l => parseCSVLine(l)[addressIndex]?.trim())
        .filter(Boolean);
    }
  };

  const submitBulkJob = async (addresses) => {
    setBulkLoading(true);
    setBulkProgress({ done: 0, total: 0 });
    setBulkErrors([]);
    setBulkResults([]);
    setBulkFileError(null);
    setBulkJobId(null);
    setBulkSkipped([]);
    setPendingBulkAddresses(null);

    try {
      const response = await fetch('http://localhost:5000/api/bulk/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ addresses })
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 402 || data.no_credits) { openBuyCreditsModal(); setBulkLoading(false); return; }
        throw new Error(data.error || 'Failed to queue bulk job');
      }
      setBulkProgress({ done: 0, total: data.total });
      setBulkJobId(data.jobId);
      if (data.skipped?.addresses?.length > 0) setBulkSkipped(data.skipped.addresses);
    } catch (err) {
      setBulkFileError(err.message);
      setBulkLoading(false);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setBulkFileError(null);
    setPendingBulkAddresses(null);

    try {
      const addresses = await parseFileToAddresses(file);
      if (addresses.length === 0) throw new Error('No addresses found in file');

      const validAddresses = addresses.filter(a => typeof a === 'string' && a.trim().length >= 6 && /\d/.test(a));

      // If file has more addresses than available credits, pause and ask before processing
      if (validAddresses.length > credits) {
        setPendingBulkAddresses(validAddresses);
        return;
      }

      await submitBulkJob(validAddresses);
    } catch (err) {
      setBulkFileError(err.message);
    }
  };

  // Poll for bulk job progress
  useEffect(() => {
    if (!bulkJobId) return;

    const poll = async () => {
      try {
        const response = await fetch(`http://localhost:5000/api/bulk/status/${bulkJobId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        setBulkProgress({ done: data.completed, total: data.total });

        if (data.state === 'completed' || data.state === 'failed') {
          clearInterval(bulkPollRef.current);
          bulkPollRef.current = null;

          // Fetch full results once on completion
          const resResponse = await fetch(`http://localhost:5000/api/bulk/results/${bulkJobId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const resData = await resResponse.json();
          const allResults = resData.results || [];
          const successResults = allResults.filter(r => r.success).map(r => r.data);
          const failedResults = allResults.filter(r => !r.success).map(r => ({ address: r.address, error: r.error }));

          setBulkResults(successResults);
          setBulkErrors(failedResults);
          setBulkLoading(false);
          setHistory(prev => [...successResults, ...prev]);
          loadCredits();
        }
      } catch (err) {
        console.error('Bulk poll error:', err.message);
      }
    };

    poll();
    bulkPollRef.current = setInterval(poll, 500);
    return () => {
      clearInterval(bulkPollRef.current);
      bulkPollRef.current = null;
    };
  }, [bulkJobId]);

  return (
    <div className="App">
      <div className="header">
        <div className="header-left">
          <h1 className={`header-logo${navPage ? ' header-logo--linked' : ''}`} onClick={() => setNavPage(null)} style={{ cursor: navPage ? 'pointer' : 'default' }}>
            <span className="brand-flash">Flash</span><span className="brand-risk">Risk</span>
          </h1>
          <nav className="header-nav">
            <button className={`header-nav-link${!navPage ? ' active' : ''}`} onClick={() => setNavPage(null)}>Dashboard</button>
            <button className={`header-nav-link${navPage === 'about' ? ' active' : ''}`} onClick={() => setNavPage(navPage === 'about' ? null : 'about')}>About</button>
            <button className={`header-nav-link${navPage === 'how-to-use' ? ' active' : ''}`} onClick={() => setNavPage(navPage === 'how-to-use' ? null : 'how-to-use')}>How to Use</button>
            <button className={`header-nav-link${navPage === 'pricing' ? ' active' : ''}`} onClick={() => setNavPage(navPage === 'pricing' ? null : 'pricing')}>Pricing</button>
            <button className={`header-nav-link${navPage === 'faq' ? ' active' : ''}`} onClick={() => setNavPage(navPage === 'faq' ? null : 'faq')}>FAQ</button>
            <button className={`header-nav-link${navPage === 'contact' ? ' active' : ''}`} onClick={() => setNavPage(navPage === 'contact' ? null : 'contact')}>Contact</button>
          </nav>
        </div>
        <div className="user-info">
          {!isAuthenticated ? (
            <div className="header-auth-buttons">
              <button className="header-login-btn" onClick={() => onShowAuth('login')}>Log in</button>
              <button className="header-signup-btn" onClick={() => onShowAuth('signup')}>Sign Up</button>
            </div>
          ) : (
          <div className="profile-wrap">
            {credits !== null && (
              <button className="header-credits-pill" onClick={openBuyCreditsModal}>
                <span className="header-credits-icon">⚡</span>
                <span>{credits} credit{credits !== 1 ? 's' : ''}</span>
              </button>
            )}
            <button className="profile-btn" onClick={() => setShowProfileMenu(v => !v)}>
              <span className="profile-avatar">
                {[user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
              </span>
            </button>
            {showProfileMenu && (
              <>
                <div className="profile-backdrop" onClick={() => setShowProfileMenu(false)} />
                <div className="profile-menu">
                  <div className="profile-menu-header">
                    <div className="profile-menu-avatar">
                      {[user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      {(user?.firstName || user?.lastName) && (
                        <div className="profile-menu-name">{[user.firstName, user.lastName].filter(Boolean).join(' ')}</div>
                      )}
                      <div className="profile-menu-email">{user?.email}</div>
                      {user?.companyName && <div className="profile-menu-company">{user.companyName}</div>}
                    </div>
                  </div>
                  <div className="profile-menu-section">
                    <div className="profile-menu-row">
                      <span className="profile-menu-label">Available Credits</span>
                      <span className="profile-credits-badge">{credits ?? '—'}</span>
                    </div>
                  </div>
                  <button className="profile-upgrade-btn" onClick={() => { setShowProfileMenu(false); openBuyCreditsModal(); }}>
                    Buy credits
                  </button>
                  <div className="profile-menu-divider" />
                  <button className="profile-menu-logout" onClick={onLogout}>Log out</button>
                </div>
              </>
            )}
          </div>
          )}
        </div>
      </div>

      {navPage === 'about' && <AboutPage />}
      {navPage === 'how-to-use' && <HowToUsePage />}
      {navPage === 'pricing' && <PricingPage onShowAuth={onShowAuth} isAuthenticated={isAuthenticated} credits={credits} onBuyCredits={openBuyCreditsModal} onContact={() => setNavPage('contact')} />}
      {navPage === 'faq' && <FaqPage onContact={() => setNavPage('contact')} />}
      {navPage === 'contact' && <ContactPage />}

      {!navPage && <><div className="tabs">
        <button
          className={activeTab === 'assess' ? 'active' : ''}
          onClick={() => setActiveTab('assess')}
        >
          Assess Risk
        </button>
        <button
          className={activeTab === 'bulk' ? 'active' : ''}
          onClick={() => setActiveTab('bulk')}
        >
          Bulk Upload
        </button>
        <button
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setActiveTab('history')}
        >
          History ({history.length})
        </button>
        <button
          className={activeTab === 'demo' ? 'active' : ''}
          onClick={() => setActiveTab('demo')}
        >
          Sample Reports
        </button>
      </div>

      {activeTab === 'assess' && (
        <div className="tab-content">
          {!isAuthenticated ? (
            <div className="tab-gate">
              <div className="tab-gate-icon">🔍</div>
              <h3>Create a free account to get started</h3>
              <p>Sign up and buy credits to run property assessments. One credit covers a full hazard report for any US address, including natural hazards, crime, environmental quality, and neighborhood data.</p>
              <div className="tab-gate-buttons">
                <button className="upgrade-confirm-btn" onClick={() => onShowAuth('signup')}>Create free account</button>
                <button className="link-button" onClick={() => onShowAuth('login')}>Already have an account? Log in →</button>
              </div>
            </div>
          ) : (
          <>
          <form onSubmit={handleSubmit}>
            <div className="autocomplete-container">
              <label>Enter Property Address</label>
              <div className="autocomplete-wrapper">
                <input
                  type="text"
                  value={address}
                  onChange={handleAddressChange}
                  onBlur={() => setTimeout(() => setSuggestions([]), 150)}
                  onKeyDown={(e) => e.key === 'Escape' && setSuggestions([])}
                  placeholder="e.g., 1600 Pennsylvania Ave NW, Washington, DC"
                  required
                  autoComplete="off"
                />
                {suggestions.length > 0 && (
                  <ul className="suggestions-list">
                    {suggestions.map((suggestion, idx) => (
                      <li
                        key={idx}
                        onClick={() => handleSelectSuggestion(suggestion)}
                      >
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <button type="submit" disabled={loading}>
              {loading ? 'Assessing...' : 'Assess Risk'}
            </button>
          </form>

          {error && <div className="error">{error}</div>}

          {result && (
            <div className="results">
              <AssessmentHeader
                r={result}
                onExportCSV={() => exportToCSV([result])}
                onExportXLSX={() => exportToXLSX([result])}
              />
              <AssessmentDetail r={result} />
            </div>
          )}
          </>
          )}
        </div>
      )}

      {activeTab === 'bulk' && (
        <div className="tab-content">
          {!isAuthenticated ? (
            <div className="tab-gate">
              <div className="tab-gate-icon">📋</div>
              <h3>Create a free account to get started</h3>
              <p>Sign up and buy credits to run property assessments. One credit covers a full hazard report for any US address, including natural hazards, crime, environmental quality, and neighborhood data.</p>
              <div className="tab-gate-buttons">
                <button className="upgrade-confirm-btn" onClick={() => onShowAuth('signup')}>Create free account</button>
                <button className="link-button" onClick={() => onShowAuth('login')}>Already have an account? Log in →</button>
              </div>
            </div>
          ) : (<>
          <div className="bulk-header">
            <h2>Bulk Assessment</h2>
            <p>Upload a CSV or Excel file and get structured hazard data for every address. No portal lookups, no manual work. A 500-address file typically completes in 1 to 2 minutes.</p>
          </div>

          <div
            className={`drop-zone${dragOver ? ' drop-zone--active' : ''}${bulkLoading ? ' drop-zone--loading' : ''}`}
            onClick={() => !bulkLoading && fileInputRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files[0]); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => handleFileUpload(e.target.files[0])}
            />
            {bulkLoading ? (
              <div className="drop-zone-content">
                <div className="bulk-progress-wrap">
                  <p className="bulk-progress-label">Processing {bulkProgress.done} of {bulkProgress.total} addresses…</p>
                  <div className="bulk-progress-bar">
                    <div
                      className="bulk-progress-fill"
                      style={{ width: bulkProgress.total ? `${(bulkProgress.done / bulkProgress.total) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="drop-zone-content">
                <div className="drop-zone-icon">📂</div>
                <p className="drop-zone-text">Drag &amp; drop your file here, or <span className="drop-zone-link">browse</span></p>
                <p className="drop-zone-hint">Supports .csv and .xlsx. File must include an "address" column.</p>
              </div>
            )}
          </div>

          {bulkFileError && <div className="error">{bulkFileError}</div>}

          {pendingBulkAddresses && (
            <div className="bulk-capped-warning">
              <strong>Not enough credits.</strong> Your file has {pendingBulkAddresses.length} addresses but you only have {credits} credit{credits !== 1 ? 's' : ''}. Only {credits} will be processed.
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={() => { openBuyCreditsModal(); }}>Buy more credits</button>
                <button className="btn-secondary" onClick={() => submitBulkJob(pendingBulkAddresses)}>Process {credits} now</button>
                <button className="btn-secondary" onClick={() => setPendingBulkAddresses(null)}>Cancel</button>
              </div>
            </div>
          )}

          {bulkSkipped.length > 0 && (
            <div className="bulk-errors">
              <strong>{bulkSkipped.length} address{bulkSkipped.length > 1 ? 'es' : ''} skipped (invalid format — must include a street number):</strong>
              {bulkSkipped.map((a, i) => <p key={i} className="bulk-error-item">{a}</p>)}
            </div>
          )}

          {bulkErrors.length > 0 && (
            <div className="bulk-errors">
              <strong>{bulkErrors.length} address{bulkErrors.length > 1 ? 'es' : ''} failed:</strong>
              {bulkErrors.map((e, i) => <p key={i} className="bulk-error-item">{e.address} — {e.error}</p>)}
            </div>
          )}

          {bulkResults.length > 0 && (
            <div className="bulk-results">
              <div className="bulk-results-header">
                <h3>{bulkResults.length} properties assessed</h3>
                <div className="download-buttons">
                  <button className="download-btn" onClick={() => exportToCSV(bulkResults)}>Download CSV</button>
                  <button className="download-btn" onClick={() => exportToXLSX(bulkResults)}>Download Excel</button>
                </div>
              </div>
              <p className="bulk-results-hint">Click any row to view full assessment details.</p>
              <div className="bulk-table-wrap">
                <table className="bulk-table">
                  <thead>
                    <tr>
                      <th className="bulk-th-address">Address</th>
                      <th className="bulk-th-risk">Overall</th>
                      <th className="bulk-th-hz">Fire</th>
                      <th className="bulk-th-hz">Flood</th>
                      <th className="bulk-th-hz">Quake</th>
                      <th className="bulk-th-hz">Hurricane</th>
                      <th className="bulk-th-hz">Tornado</th>
                      <th className="bulk-th-hz">Hail</th>
                      <th className="bulk-th-hz">Crime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.map((r, idx) => (
                      <tr key={idx} className="bulk-row" onClick={() => setSelectedBulkResult(r)}>
                        <td className="bulk-td-address">
                          <span className="bulk-addr-primary">{r.inputAddress || r.address}</span>
                          {r.inputAddress && <span className="bulk-addr-geo">{r.address}</span>}
                        </td>
                        <td><span className={`risk-badge risk-badge--${(r.overall?.riskLevel||'').toLowerCase()}`}>{r.overall?.riskLevel || '—'}</span></td>
                        <td><HazardGrade grade={r.natural?.wildfire?.grade} /></td>
                        <td><HazardGrade grade={r.natural?.flood?.grade} /></td>
                        <td><HazardGrade grade={r.natural?.earthquake?.grade} /></td>
                        <td><HazardGrade grade={r.natural?.hurricane?.grade} /></td>
                        <td><HazardGrade grade={r.natural?.tornado?.grade} /></td>
                        <td><HazardGrade grade={r.natural?.hail?.grade} /></td>
                        <td><HazardGrade grade={r.human?.crime?.grade} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <AssessmentModal r={selectedBulkResult} onClose={() => setSelectedBulkResult(null)} />
          </>)}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="tab-content">
          {!isAuthenticated ? (
            <div className="tab-gate">
              <div className="tab-gate-icon">📜</div>
              <h3>Create a free account to get started</h3>
              <p>Your assessment history is saved automatically once you have an account. Every address you have run is stored and searchable, and you can pull up the full report for any past assessment at any time.</p>
              <div className="tab-gate-buttons">
                <button className="upgrade-confirm-btn" onClick={() => onShowAuth('signup')}>Create free account</button>
                <button className="link-button" onClick={() => onShowAuth('login')}>Already have an account? Log in →</button>
              </div>
            </div>
          ) : (<>
          <div className="history-header">
            <h2>Assessment History</h2>
            {history.length > 0 && (
              <div className="download-buttons">
                <button className="download-btn" onClick={() => downloadHistory('csv')}>
                  Download CSV{isFiltered ? ' (filtered)' : ''}
                </button>
                <button className="download-btn" onClick={() => downloadHistory('xlsx')}>
                  Download Excel{isFiltered ? ' (filtered)' : ''}
                </button>
              </div>
            )}
          </div>

          {historyLimited && (
            <div className="history-limit-banner">
              <span>Showing last 7 days only.</span>
              <button className="link-button" onClick={openBuyCreditsModal}>
                Buy credits for full history →
              </button>
            </div>
          )}

          {history.length > 0 && (
            <div className="history-filters">
              <div className="filter-group">
                <label>Address</label>
                <input
                  type="text"
                  className="history-address-search"
                  placeholder="Search submitted/geocoded address…"
                  value={addressSearch}
                  onChange={e => setAddressSearch(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <label>From</label>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                <input type="time" value={fromTime} onChange={e => setFromTime(e.target.value)} placeholder="Any time" disabled={!fromDate} />
              </div>
              <div className="filter-group">
                <label>To</label>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                <input type="time" value={toTime} onChange={e => setToTime(e.target.value)} placeholder="Any time" disabled={!toDate} />
              </div>
              {isFiltered && (
                <button className="clear-filter" onClick={clearFilter}>
                  Clear
                </button>
              )}
              <span className="filter-count">
                {isFiltered ? `${filteredHistory.length} of ${history.length} records` : `${history.length} records`}
              </span>
            </div>
          )}

          {historyLoading ? (
            <p>Loading history...</p>
          ) : history.length === 0 ? (
            <p>No assessments yet. Run some assessments to see them here.</p>
          ) : filteredHistory.length === 0 ? (
            <p>No assessments match the current filters.</p>
          ) : (
            <>
              <p className="bulk-results-hint">Click any row to view full assessment details.</p>
              <div className="bulk-table-wrap">
                <table className="bulk-table">
                  <thead>
                    <tr>
                      <th className="bulk-th-address">Address</th>
                      <th className="bulk-th-date">Date</th>
                      <th className="bulk-th-risk">Overall</th>
                      <th className="bulk-th-hz">Fire</th>
                      <th className="bulk-th-hz">Flood</th>
                      <th className="bulk-th-hz">Quake</th>
                      <th className="bulk-th-hz">Hurricane</th>
                      <th className="bulk-th-hz">Tornado</th>
                      <th className="bulk-th-hz">Hail</th>
                      <th className="bulk-th-hz">Crime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((item, idx) => (
                      <tr key={idx} className="bulk-row" onClick={async () => {
                        setHistoryDetailLoading(true);
                        try {
                          const res = await fetch(`http://localhost:5000/api/assessments/${item.id}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                          });
                          if (res.ok) { setSelectedHistoryResult(await res.json()); }
                          else { setSelectedHistoryResult(item); }
                        } catch { setSelectedHistoryResult(item); }
                        finally { setHistoryDetailLoading(false); }
                      }}>
                        <td className="bulk-td-address">
                          <span className="bulk-addr-primary">{item.inputAddress || item.address}</span>
                          {item.inputAddress && <span className="bulk-addr-geo">{item.address}</span>}
                        </td>
                        <td className="bulk-td-date">
                          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                          <span className="bulk-td-time">{new Date(item.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
                        </td>
                        <td><span className={`risk-badge risk-badge--${(item.overall?.riskLevel||'').toLowerCase()}`}>{item.overall?.riskLevel || '—'}</span></td>
                        <td><HazardGrade grade={item.natural?.wildfire?.grade} /></td>
                        <td><HazardGrade grade={item.natural?.flood?.grade} /></td>
                        <td><HazardGrade grade={item.natural?.earthquake?.grade} /></td>
                        <td><HazardGrade grade={item.natural?.hurricane?.grade} /></td>
                        <td><HazardGrade grade={item.natural?.tornado?.grade} /></td>
                        <td><HazardGrade grade={item.natural?.hail?.grade} /></td>
                        <td><HazardGrade grade={item.human?.crime?.grade} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {historyDetailLoading && (
            <div className="modal-overlay"><div className="modal-panel" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:120}}><span className="loading-spinner" />Loading…</div></div>
          )}
          <AssessmentModal r={selectedHistoryResult} onClose={() => setSelectedHistoryResult(null)} />
          </>
          )}
        </div>
      )}

      {activeTab === 'demo' && (
        <div className="tab-content">
          <div className="demo-intro">
            <h3>Sample Reports</h3>
            <p>These are real PropertyLens assessments for addresses across the US covering a range of risk profiles. Click any row to see the full report. <button className="link-button" onClick={() => onShowAuth('signup')}>Create a free account</button> to run your own.</p>
          </div>
          {demoResults.length === 0 ? (
            <p className="no-results">No sample reports available.</p>
          ) : (
            <div className="bulk-table-wrap">
              <table className="bulk-table">
                <thead>
                  <tr>
                    <th className="bulk-th-address">Address</th>
                    <th className="bulk-th-risk">Risk</th>
                    <th className="bulk-th-hz">Fire</th>
                    <th className="bulk-th-hz">Flood</th>
                    <th className="bulk-th-hz">Quake</th>
                    <th className="bulk-th-hz">Hurricane</th>
                    <th className="bulk-th-hz">Tornado</th>
                    <th className="bulk-th-hz">Hail</th>
                    <th className="bulk-th-hz">Crime</th>
                  </tr>
                </thead>
                <tbody>
                  {demoResults.map((r, i) => (
                    <tr key={i} className="bulk-row" style={{ cursor: 'pointer' }} onClick={() => setSelectedDemoResult(r)}>
                      <td className="bulk-td-address">
                        <span className="bulk-addr-primary">{r.address}</span>
                      </td>
                      <td><span className={`risk-badge risk-badge--${(r.overall?.riskLevel||'').toLowerCase()}`}>{r.overall?.riskLevel || '—'}</span></td>
                      <td><HazardGrade grade={r.natural?.wildfire?.grade} /></td>
                      <td><HazardGrade grade={r.natural?.flood?.grade} /></td>
                      <td><HazardGrade grade={r.natural?.earthquake?.grade} /></td>
                      <td><HazardGrade grade={r.natural?.hurricane?.grade} /></td>
                      <td><HazardGrade grade={r.natural?.tornado?.grade} /></td>
                      <td><HazardGrade grade={r.natural?.hail?.grade} /></td>
                      <td><HazardGrade grade={r.human?.crime?.grade} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AssessmentModal r={selectedDemoResult} onClose={() => setSelectedDemoResult(null)} />
        </div>
      )}

      </>}

      {showBuyCreditsModal && (
        <div className="modal-overlay" onClick={() => setShowBuyCreditsModal(false)}>
          <div className="modal-panel upgrade-modal" onClick={e => e.stopPropagation()}>
            <div className="upgrade-modal-header">
              <h2>Buy Credits</h2>
              <button className="modal-close" onClick={() => setShowBuyCreditsModal(false)}>✕</button>
            </div>
            <div className="upgrade-modal-body">
              <p className="credits-modal-balance">Available Credits: <strong>{credits ?? 0}</strong></p>
              <p className="credits-modal-note">Each assessment costs 1 credit ($2.70). Credits never expire.</p>
              <div className="credit-packs-grid">
                {creditPacks.map(pack => (
                  <div key={pack.id} className="credit-pack-card">
                    <div className="credit-pack-label">{pack.label}</div>
                    <div className="credit-pack-credits">{pack.credits} credits</div>
                    <div className="credit-pack-price">${(pack.price_cents / 100).toFixed(2)}</div>
                    <div className="credit-pack-per">${(pack.price_cents / pack.credits / 100).toFixed(2)}/credit</div>
                    <button className="upgrade-confirm-btn" disabled>Buy (coming soon)</button>
                  </div>
                ))}
              </div>
              <p className="upgrade-cancel-note">Stripe checkout coming soon. <a href="mailto:support@flashrisk.io" className="link-button inline-contact-btn">Contact us</a> to purchase credits now.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AboutPage() {
  return (
    <div className="nav-page">
      <div className="nav-page-content">
        <h2>About FlashRisk</h2>
        <p>FlashRisk is a property hazard intelligence tool built for insurers, lenders, real estate professionals, and analysts. Type in any US address and get back letter grades and risk ratings across 20+ hazard categories covering natural hazards, crime, environmental quality, and neighborhood resilience. Results come back in seconds and export to CSV or Excel with one click.</p>

        <div className="about-value-row about-value-row--wide">
          <div className="about-value-card">
            <h3><span className="about-value-icon">🔢</span> 20+ hazards, one report</h3>
            <p>Every assessment covers wildfire, flood, earthquake, hurricane, tornado, hail, wind, lightning, crime, water quality, noise, and more. Each hazard gets a letter grade from A to F and a plain language rating so results are easy to read and compare across properties.</p>
          </div>
          <div className="about-value-card">
            <h3><span className="about-value-icon">⚡</span> One address, everything you need</h3>
            <p>Instead of pulling from multiple platforms and stitching things together manually, one address search covers everything. For portfolios, upload a CSV or Excel file and get enriched results back in minutes. No manual lookups, no data wrangling.</p>
          </div>
          <div className="about-value-card">
            <h3><span className="about-value-icon">🗺️</span> Neighborhood context included</h3>
            <p>Every report includes neighborhood factors like fire protection response, law enforcement, medical response, walkability, public transit, and disaster resilience. Not just the physical hazards but the full picture of what surrounds a property.</p>
          </div>
          <div className="about-value-card">
            <h3><span className="about-value-icon">💰</span> Pay for what you use</h3>
            <p>Prepaid credits, no subscription. Each assessment is $2.70 and credits never expire. No contracts, no minimum seats, no sales process. Create an account, buy credits, and start running assessments in minutes.</p>
          </div>
        </div>

        <div className="about-builder">
          <h3>From the builder</h3>
          <p>I've spent 4+ years as a data engineer in P&amp;C insurance, working across risk, underwriting, and data pipelines. The same problem kept coming up: property-level hazard data existed but underwriters and ops teams had no fast, reliable way to get it into their actual workflows. That gap quietly degraded the data that business and analytics teams depended on.</p>
          <p>FlashRisk is the tool I kept wishing existed. The hazard data is available, the fields are well understood, and the decisions that depend on them are real. What was missing was a clean interface that pulls it all together without the enterprise contract, the IT setup, or the six-figure price tag.</p>
        </div>

      </div>
    </div>
  );
}

function HowToUsePage() {
  return (
    <div className="nav-page">
      <div className="nav-page-content">
        <h2>How to Use FlashRisk</h2>
        <p className="how-to-use-intro">Getting started takes about two minutes. Here is how it works.</p>

        <div className="nav-page-steps">
          <div className="nav-page-step">
            <div className="nav-page-step-num">1</div>
            <div>
              <h3>Create an account and buy credits</h3>
              <p>Sign up for a free account and purchase a credit pack from the Pricing page. Each credit covers one full property assessment. Credits never expire so you can buy in bulk and use them at your own pace.</p>
              <p className="how-to-use-tip">Credit packs start at 10 assessments ($27). Visit the Pricing page or click "Buy credits" in your profile menu to purchase.</p>
            </div>
          </div>

          <div className="nav-page-step">
            <div className="nav-page-step-num">2</div>
            <div>
              <h3>Look up a single address</h3>
              <p>Go to the <strong>Assess Risk</strong> tab, enter any US property address, and hit Assess Risk. Results come back in a few seconds and cover:</p>
              <ul className="how-to-use-list">
                <li><strong>Natural hazards:</strong> wildfire, flood, earthquake, hurricane, tornado, hail, wind, lightning, coastal flooding, landslide, tsunami, and more</li>
                <li><strong>Human factors:</strong> crime by subcategory, fracking earthquake risk, mine subsidence</li>
                <li><strong>Environmental quality:</strong> water quality (PFAS, hardness, arsenic), road noise, rail noise, aviation noise</li>
                <li><strong>Neighborhood:</strong> fire protection response, law enforcement, medical response, walkability, public transit, disaster resilience, and building codes</li>
                <li><strong>Context:</strong> nearby damaging events, FEMA flood zone detail, zones, and points of interest</li>
              </ul>
              <p className="how-to-use-tip">Use a full street address with city and state for the best geocode match. Example: 123 Main St, Austin, TX</p>
            </div>
          </div>

          <div className="nav-page-step">
            <div className="nav-page-step-num">3</div>
            <div>
              <h3>Read the results</h3>
              <p>Each hazard shows a letter grade and a plain language rating. Here is what those mean:</p>
              <ul className="how-to-use-list">
                <li><strong>Grade (A to F):</strong> A is lowest risk, F is highest. Grades are consistent across any US address so you can compare properties directly.</li>
                <li><strong>Rating:</strong> a plain language label like Very Low, Low, Moderate, High, or Very High.</li>
                <li><strong>Percentile:</strong> where this property sits nationally for that hazard. A 99th percentile wildfire score means it is riskier than 99% of US properties.</li>
                <li><strong>Overall Risk:</strong> a summary level of Low, Moderate, or High based on the key natural hazard grades.</li>
              </ul>
            </div>
          </div>

          <div className="nav-page-step">
            <div className="nav-page-step-num">4</div>
            <div>
              <h3>Bulk upload a portfolio</h3>
              <p>Go to the <strong>Bulk Upload</strong> tab to run assessments on a whole list at once. Upload a CSV or Excel file with a column named <strong>address</strong>. Jobs run in the background and results appear as each address is processed. Typically finishes in 1 to 3 minutes depending on how many rows you have.</p>
              <ul className="how-to-use-list">
                <li>Each row uses one credit</li>
                <li>Extra columns in your file are kept in the output</li>
                <li>Download the enriched file as CSV or Excel when done</li>
              </ul>
              <p className="how-to-use-tip">Keep addresses in a single column. Full addresses get the most accurate results. Avoid splitting street, city, and state across separate columns.</p>
            </div>
          </div>

          <div className="nav-page-step">
            <div className="nav-page-step-num">5</div>
            <div>
              <h3>Review history and export</h3>
              <p>Every assessment is saved to your account automatically. The <strong>History</strong> tab shows everything you have run. Click any row to pull up the full report. You can download results as CSV or Excel from the report view.</p>
              <ul className="how-to-use-list">
                <li>Full history is kept for all accounts with no time limit</li>
                <li>Viewing history and downloading past results never uses credits</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CREDIT_PACKS = [
  { label: 'Starter',      credits: 10,  price: 27.00 },
  { label: 'Standard',     credits: 50,  price: 135.00 },
  { label: 'Professional', credits: 200, price: 540.00 },
];

function PricingPage({ onShowAuth, isAuthenticated, credits, onBuyCredits, onContact }) {
  return (
    <div className="nav-page">
      <div className="nav-page-content">
        <h2>Pricing</h2>
        <p>Buy credits and use them whenever you need. No subscription, no monthly reset, no expiration.</p>

        <div className="pricing-what-is-credit">
          <strong>What is a credit?</strong> One credit covers one full property assessment, whether you run it from the single address tab or as a row in a bulk upload. Viewing your history, downloading past results, and browsing demo assessments never costs credits.
        </div>

        <div className="pricing-grid pricing-grid--credits">
          {CREDIT_PACKS.map(pack => (
            <div key={pack.label} className={`pricing-card${pack.label === 'Standard' ? ' pricing-card--featured' : ''}`}>
              <div className="pricing-tier">{pack.label}</div>
              <div className="pricing-price">${pack.price.toFixed(0)}</div>
              <div className="pricing-credits-count">{pack.credits} credits</div>
              <div className="pricing-per-credit">${(pack.price / pack.credits).toFixed(2)} per assessment</div>
              <ul className="pricing-features">
                <li className="feat-yes">20+ hazard grades per property</li>
                <li className="feat-yes">CSV &amp; Excel export</li>
                <li className="feat-yes">Full assessment history</li>
                <li className="feat-yes">Bulk upload (CSV / Excel)</li>
                <li className="feat-yes">Credits never expire</li>
              </ul>
              {isAuthenticated ? (
                <button className={`pricing-cta pricing-cta--${pack.label === 'Standard' ? 'primary' : 'secondary'}`} onClick={onBuyCredits}>Buy {pack.label}</button>
              ) : (
                <button className={`pricing-cta pricing-cta--${pack.label === 'Standard' ? 'primary' : 'secondary'}`} onClick={() => onShowAuth('signup')}>Get started</button>
              )}
            </div>
          ))}
        </div>

        {isAuthenticated && credits != null && (
          <p className="pricing-balance-note">Available Credits: <strong>{credits}</strong></p>
        )}

        <p className="pricing-note">Need higher volume or a custom arrangement? <button className="link-button inline-contact-btn" onClick={onContact}>Get in touch</button></p>
      </div>
    </div>
  );
}

const FAQ_ITEMS = [
  {
    q: 'What does FlashRisk actually return?',
    a: 'Every assessment returns a letter grade (A to F) and a risk rating for 20+ hazard categories. That covers natural hazards like wildfire, flood, earthquake, hurricane, tornado, hail, wind, lightning, and coastal flooding, plus crime by subcategory, water quality, noise levels, fracking risk, mine subsidence, fire protection response, walkability, disaster resilience, building codes, nearby damaging events, FEMA flood zone detail, and points of interest.'
  },
  {
    q: 'Where does the data come from?',
    a: 'FlashRisk sources its property hazard data through PropertyLens, a specialized data provider that aggregates, models, and normalizes hazard information across the US. PropertyLens combines data from multiple public and proprietary sources into a consistent grading model. The grades and ratings you see in FlashRisk reflect that model, not a direct pull from any single government database.'
  },
  {
    q: 'How accurate is the data?',
    a: 'PropertyLens builds and maintains its hazard models using a combination of publicly available data and proprietary modeling. Grades are designed to be consistent and comparable across US addresses. That said, no model is perfect. Results reflect the best available data for a given location and should be used as one input in a broader decision process, not as a sole determinant.'
  },
  {
    q: 'What counts as one assessment?',
    a: 'One address equals one credit. It does not matter whether you run it from the single address tab or as part of a bulk upload. Viewing past results, downloading history, and browsing demo assessments are always free.'
  },
  {
    q: 'Does FlashRisk cover all US addresses?',
    a: 'FlashRisk covers addresses across the contiguous United States. Some hazard categories are inherently regional, like termite risk or volcanic activity, and will only return grades where relevant. If a property falls outside the coverage area for a particular data layer, that field shows N/A.'
  },
  {
    q: 'Can I use FlashRisk for commercial purposes?',
    a: 'Yes. FlashRisk is built for commercial use in insurance, real estate, lending, property management, and related industries. Bulk upload works for production workflows and there are no restrictions on how you use the output.'
  },
  {
    q: 'How do credits work?',
    a: 'Credits are prepaid and never expire. Each assessment costs one credit ($2.70). Buy a pack and use them whenever you need, at whatever pace works for you. There are no subscriptions, monthly resets, or minimum commitments.'
  },
  {
    q: 'How do I buy credits?',
    a: 'Open your profile menu and click "Buy credits" or visit the Pricing page. Stripe checkout is coming soon. If you need credits before that is live, get in touch and we will sort it out.'
  },
  {
    q: 'Is my data private?',
    a: ({ onContact }) => <>Addresses you submit are stored to power your assessment history and are never sold or shared with third parties. <button className="link-button inline-contact-btn" onClick={onContact}>Contact us</button> at any time to request deletion of your data.</>
  },
];

function FaqPage({ onContact }) {
  const [open, setOpen] = React.useState(null);
  return (
    <div className="nav-page">
      <div className="nav-page-content">
        <h2>Frequently Asked Questions</h2>
        <div className="faq-list">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className={`faq-item${open === i ? ' open' : ''}`}>
              <button className="faq-question" onClick={() => setOpen(open === i ? null : i)}>
                <span>{item.q}</span>
                <span className="faq-chevron">{open === i ? '−' : '+'}</span>
              </button>
              {open === i && <div className="faq-answer">{typeof item.a === 'function' ? item.a({ onContact }) : item.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContactPage() {
  return (
    <div className="nav-page">
      <div className="nav-page-content">
        <h2>Contact Us</h2>
        <p>Have a question, found a bug, or want to discuss a use case? We'd love to hear from you.</p>
        <div className="contact-card">
          <div className="contact-row">
            <div className="contact-icon">✉️</div>
            <div>
              <div className="contact-label">Email</div>
              <a className="contact-value" href="mailto:support@flashrisk.com">support@flashrisk.com</a>
            </div>
          </div>
          <div className="contact-divider" />
          <div className="contact-row">
            <div className="contact-icon">⏱️</div>
            <div>
              <div className="contact-label">Response time</div>
              <div className="contact-value">We typically respond within one business day.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Letter grade chip — A=green, B=teal, C=yellow, D=orange, F=red
function HazardGrade({ grade }) {
  if (!grade) return <span className="hazard-grade hazard-grade--none">—</span>;
  const cls = { A: 'a', B: 'b', C: 'c', D: 'd', F: 'f' }[grade] || 'none';
  return <span className={`hazard-grade hazard-grade--${cls}`}>{grade}</span>;
}

function NoData() {
  return <span className="no-data">N/A</span>;
}

function stateFromAddress(address) {
  const m = address?.match(/,\s*([A-Z]{2})\s+\d{5}/);
  return m ? m[1] : null;
}

function PercentileBar({ value, mini, gradeColor }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  if (mini) {
    return (
      <div className="percentile-bar-wrap percentile-bar-wrap--mini">
        <div className="percentile-bar percentile-bar--mini">
          <div className="percentile-fill" style={{ width: `${pct}%`, background: gradeColor || undefined }} />
        </div>
        <span className="percentile-label">{pct}th %ile</span>
      </div>
    );
  }
  return (
    <div className="percentile-bar-wrap">
      <div className="percentile-bar">
        <div className="percentile-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="percentile-label">{pct}th %ile</span>
    </div>
  );
}

const GRADE_COLORS = { A: '#16a34a', B: '#0891b2', C: '#d97706', D: '#ea580c', F: '#dc2626' };

function HazardCard({ label, data, chips }) {
  if (!data?.grade) return null;
  const hasPercentile = data.percentile != null;
  const stat = !hasPercentile && data.annualizedFrequency != null && data.annualizedFrequency > 0
    ? `${(data.annualizedFrequency * 100).toFixed(2)}% annual`
    : null;
  const allChips = [];
  if (data.annualLossGrade) allChips.push(
    <span key="al" className="hc-chip hc-chip--grade">
      <span className="hc-chip-lbl">Annual Loss</span>
      <HazardGrade grade={data.annualLossGrade} />
      <span>{data.annualLossRating}</span>
      {data.annualLossPercentile != null && <PercentileBar value={data.annualLossPercentile} mini gradeColor={GRADE_COLORS[data.annualLossGrade]} />}
    </span>
  );
  if (data.historicLossGrade) allChips.push(
    <span key="hl" className="hc-chip hc-chip--grade">
      <span className="hc-chip-lbl">Historic Loss</span>
      <HazardGrade grade={data.historicLossGrade} />
      <span>{data.historicLossRating}</span>
    </span>
  );
  if (chips) chips.forEach((c, i) => allChips.push(<span key={`x${i}`} className="hc-chip">{c}</span>));
  return (
    <div className="hazard-card" data-grade={(data.grade||'').toLowerCase()}>
      <div className="hazard-card-left">
        <span className="hazard-card-label">{label}</span>
        {data.description && <p className="hazard-card-desc">{data.description}</p>}
        {allChips.length > 0 && <div className="hazard-card-chips">{allChips}</div>}
      </div>
      <div className="hazard-card-right">
        <HazardGrade grade={data.grade} />
        <span className="hazard-card-rating">{data.rating}</span>
        {hasPercentile && <PercentileBar value={data.percentile} />}
        {stat && <span className="hazard-card-stat">{stat}</span>}
      </div>
    </div>
  );
}

function AssessmentDetail({ r }) {
  const nat = r.natural || {};
  const hum = r.human || {};
  const nbr = r.neighborhood || {};
  const events = r.damagingEvents || [];
  const zones = r.zones || {};
  const poi = r.nearestPoi || {};

  const crimeSubcats = [
    ['Aggravated Assault', hum.crime?.subcategories?.aggravatedAssault],
    ['Burglary',           hum.crime?.subcategories?.burglary],
    ['Larceny',            hum.crime?.subcategories?.larceny],
    ['Motor Vehicle Theft',hum.crime?.subcategories?.motorVehicleTheft],
    ['Murder',             hum.crime?.subcategories?.murder],
    ['Rape',               hum.crime?.subcategories?.rape],
    ['Robbery',            hum.crime?.subcategories?.robbery],
  ].filter(([, d]) => d?.grade);

  const hasCrimeHuman = hum.crime?.grade || hum.fracking?.grade || hum.mineSubsidence?.grade;
  const hasEnvironmental = hum.waterQuality?.pfas?.grade || hum.waterQuality?.hardness?.grade || hum.waterQuality?.arsenic?.grade || hum.noise?.road?.grade || hum.noise?.rail?.grade || hum.noise?.aviation?.grade;
  const hasNeighborhood = nbr.fireResponse?.grade || nbr.walkability?.grade || nbr.publicTransit?.grade || nbr.disasterResilience?.grade;
  const hasZones = zones.urbanArea || zones.incorporatedArea || zones.schoolDistrict || zones.plantHardinessZone;
  const hasPoi = poi.fireStations?.length || poi.policeStations?.length || poi.hospitals?.length || poi.airports?.length || poi.ambulanceServices?.length;

  return (
    <>

      {events.length > 0 && (
        <div className="data-section">
          <div className="data-section-header data-section-header--events"><h3>Nearby Damaging Events</h3></div>
          <div className="hazard-list">
            {events.map((e, i) => (
              <div key={i} className="hazard-card hazard-card--flat" style={{gridColumn:'1/-1'}}>
                <div className="hazard-card-left">
                  <div className="event-card-title">
                    <span className="hazard-card-label">{e.name}</span>
                    {e.type && e.type.toLowerCase() !== (e.name||'').toLowerCase() && <span className="hc-event-type">{e.type}</span>}
                  </div>
                  <div className="hazard-card-chips">
                    {e.damageAssessment && <span className="hc-chip hc-chip--damage">{e.damageAssessment}</span>}
                    {e.distanceMiles != null && <span className="hc-chip"><span className="hc-chip-lbl">Distance</span>{e.distanceMiles < 0.01 ? '<0.01' : e.distanceMiles.toFixed(2)} mi</span>}
                    {e.date && <span className="hc-chip"><span className="hc-chip-lbl">Date</span>{e.date}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="data-section">
        <div className="data-section-header data-section-header--natural"><h3>Natural Hazards</h3></div>
        <div className="hazard-list">
          <HazardCard label="Wildfire" data={nat.wildfire} chips={[
            nat.wildfire?.katbaticWindRegion && `Wind Region: ${nat.wildfire.katbaticWindRegion}`,
            nat.wildfire?.fuelLoading && `Fuel: ${nat.wildfire.fuelLoading}`,
            nat.wildfire?.historicPerimeters > 0 && `${nat.wildfire.historicPerimeters} historic perimeter(s)`,
            nat.wildfire?.communityProtectionPlan && `Plan: ${nat.wildfire.communityProtectionPlan}`,
          ].filter(Boolean)} />
          <HazardCard label="FEMA Flood" data={nat.flood} chips={[
            nat.flood?.floodZone && `Zone ${nat.flood.floodZone}${nat.flood.specialFloodHazardArea ? ' (SFHA)' : ''}`,
            nat.flood?.in100YearFloodplain != null && (nat.flood.in100YearFloodplain ? 'In 100-yr floodplain' : 'Not in 100-yr floodplain'),
            nat.flood?.in500YearFloodplain && 'In 500-yr floodplain',
            nat.flood?.baseFloodElevation != null && `BFE: ${nat.flood.baseFloodElevation} ft`,
            nat.flood?.claimsFrequencyGrade && <span key="cf" className="hc-chip hc-chip--grade"><span className="hc-chip-lbl">Claims Freq</span><HazardGrade grade={nat.flood.claimsFrequencyGrade} /><span>{nat.flood.claimsFrequencyRating}</span></span>,
            nat.flood?.claimsCostGrade && <span key="cc" className="hc-chip hc-chip--grade"><span className="hc-chip-lbl">Claims Cost</span><HazardGrade grade={nat.flood.claimsCostGrade} /><span>{nat.flood.claimsCostRating}</span></span>,
          ].filter(Boolean)} />
          <HazardCard label="Riverine Flooding"  data={nat.riverineFlood} />
          <HazardCard label="Coastal Flooding"   data={nat.coastalFlooding} />
          <HazardCard label="Earthquake"         data={nat.earthquake} />
          <HazardCard label="Hurricane"          data={nat.hurricane} />
          <HazardCard label="Tornado"            data={nat.tornado} />
          <HazardCard label="Hail"               data={nat.hail} />
          <HazardCard label="Wind"               data={nat.wind} />
          <HazardCard label="Lightning"          data={nat.lightning} />
          <HazardCard label="Winter Weather"     data={nat.winterWeather} />
          <HazardCard label="Cold Wave"          data={nat.coldWave} />
          <HazardCard label="Snow Load"          data={nat.snowLoad} />
          <HazardCard label="Ice Storm"          data={nat.iceStorm} />
          <HazardCard label="Avalanche"          data={nat.avalanche} />
          <HazardCard label="Ice Dam" data={nat.iceDam} chips={[
            nat.iceDam?.iceLoad != null && `Ice Load: ${nat.iceDam.iceLoad} in`,
            nat.iceDam?.avgGustSpeed != null && `Avg Gust: ${nat.iceDam.avgGustSpeed} mph`,
            nat.iceDam?.avgMinTemp != null && `Avg Min Temp: ${nat.iceDam.avgMinTemp}°F`,
          ].filter(Boolean)} />
          <HazardCard label="Frozen Pipes"       data={nat.frozenPipes} />
          <HazardCard label="Heatwave"           data={nat.heatwave} />
          <HazardCard label="Mold"               data={nat.mold} />
          <HazardCard label="Radon"              data={nat.radon} />
          <HazardCard label="Landslide"          data={nat.landslide} />
          <HazardCard label="Tsunami"            data={nat.tsunami} />
          <HazardCard label="Sinkhole"           data={nat.sinkhole} />
          <HazardCard label="Volcanic Activity"  data={nat.volcanicActivity} />
          <HazardCard label="Termite"            data={nat.termite} />
        </div>
      </div>

      {hasCrimeHuman && (
        <div className="data-section">
          <div className="data-section-header data-section-header--human"><h3>Human Factors</h3></div>
          <div className="hazard-list">
            {hum.crime?.grade && (
              <HazardCard label="Crime" data={{ ...hum.crime, percentile: null }} chips={[
                hum.crime.score != null && `Score: ${hum.crime.score}`,
                ...crimeSubcats.map(([lbl, d]) => (
                  <span key={lbl} className="hc-chip hc-chip--grade">
                    <span className="hc-chip-lbl">{lbl}</span>
                    <HazardGrade grade={d.grade} />
                    <span>{d.rating}</span>
                    {d.score != null && <span className="hc-chip-stat">{d.score}</span>}
                  </span>
                )),
              ].filter(Boolean)} />
            )}
            <HazardCard label="Fracking Earthquake" data={hum.fracking} chips={[hum.fracking?.zone && `Zone: ${hum.fracking.zone}`].filter(Boolean)} />
            <HazardCard label="Mine Subsidence"     data={hum.mineSubsidence} />
          </div>
        </div>
      )}

      {hasEnvironmental && (
        <div className="data-section">
          <div className="data-section-header data-section-header--environmental"><h3>Environmental Quality</h3></div>
          <div className="hazard-list">
            <HazardCard label="Water Quality (PFAS)"   data={hum.waterQuality?.pfas} />
            <HazardCard label="Water Hardness"         data={hum.waterQuality?.hardness} />
            <HazardCard label="Groundwater Arsenic"    data={hum.waterQuality?.arsenic} />
            <HazardCard label="Road Noise"    data={hum.noise?.road}    chips={[hum.noise?.road?.decibels > 0 && `${hum.noise.road.decibels} dB daily`].filter(Boolean)} />
            <HazardCard label="Rail Noise"    data={hum.noise?.rail}    chips={[hum.noise?.rail?.decibels > 0 && `${hum.noise.rail.decibels} dB daily`].filter(Boolean)} />
            <HazardCard label="Aviation Noise" data={hum.noise?.aviation} chips={[hum.noise?.aviation?.decibels > 0 && `${hum.noise.aviation.decibels} dB daily`].filter(Boolean)} />
          </div>
        </div>
      )}

      {hasNeighborhood && (
        <div className="data-section">
          <div className="data-section-header data-section-header--neighborhood"><h3>Neighborhood</h3></div>
          <div className="hazard-list">
            <HazardCard label="Fire Response" data={nbr.fireResponse} chips={[
              nbr.fireResponse?.aaisRating && `AAIS: ${nbr.fireResponse.aaisRating}`,
              ...(nbr.fireResponse?.hydrants?.map(h => `${h.count} hydrants within ${h.radiusMiles?.toFixed(3)} mi`) || []),
            ].filter(Boolean)} />
            <HazardCard label="Law Enforcement"  data={nbr.lawEnforcement} />
            <HazardCard label="Medical Response" data={nbr.medicalResponse} />
            <HazardCard label="Walkability"      data={nbr.walkability} />
            <HazardCard label="Public Transit"   data={nbr.publicTransit} />
            <HazardCard label="Disaster Resilience" data={nbr.disasterResilience} />
            {(nbr.buildingCodes?.ibc || nbr.buildingCodes?.nfipParticipation != null) && (
              <div className="hazard-card" style={{gridColumn:'1/-1'}}>
                <div className="hazard-card-left">
                  <span className="hazard-card-label">Building Codes</span>
                  <div className="hazard-card-chips">
                    {nbr.buildingCodes?.floodCode?.grade && (
                      <span className="hc-chip hc-chip--grade">
                        <span className="hc-chip-lbl">Flood Code</span>
                        <HazardGrade grade={nbr.buildingCodes.floodCode.grade} />
                        <span>{nbr.buildingCodes.floodCode.rating}</span>
                      </span>
                    )}
                    {nbr.buildingCodes?.hurricaneCode?.grade && (
                      <span className="hc-chip hc-chip--grade">
                        <span className="hc-chip-lbl">Hurricane Code</span>
                        <HazardGrade grade={nbr.buildingCodes.hurricaneCode.grade} />
                        <span>{nbr.buildingCodes.hurricaneCode.rating}</span>
                      </span>
                    )}
                    {nbr.buildingCodes.ibc && <span className="hc-chip"><span className="hc-chip-lbl">IBC</span>{nbr.buildingCodes.ibc}</span>}
                    {nbr.buildingCodes.irc && <span className="hc-chip"><span className="hc-chip-lbl">IRC</span>{nbr.buildingCodes.irc}</span>}
                    {nbr.buildingCodes.nfipParticipation != null && <span className="hc-chip"><span className="hc-chip-lbl">NFIP</span>{nbr.buildingCodes.nfipParticipation ? 'Participating' : 'Not participating'}</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {hasZones && (
        <div className="data-section">
          <div className="data-section-header data-section-header--zones"><h3>Location &amp; Zones</h3></div>
          <div className="hazard-list">
            <div className="hazard-card">
              <div className="hazard-card-chips" style={{paddingTop:0}}>
                {zones.incorporatedArea   && <span className="hc-chip"><span className="hc-chip-lbl">Municipality</span>{zones.incorporatedArea}</span>}
                {zones.urbanArea          && <span className="hc-chip"><span className="hc-chip-lbl">Urban Area</span>{zones.urbanArea}</span>}
                {zones.schoolDistrict     && <span className="hc-chip"><span className="hc-chip-lbl">School District</span>{zones.schoolDistrict}</span>}
                {zones.plantHardinessZone && <span className="hc-chip"><span className="hc-chip-lbl">Plant Hardiness</span>Zone {zones.plantHardinessZone}</span>}
                {zones.opportunityZone != null && <span className="hc-chip"><span className="hc-chip-lbl">Opportunity Zone</span>{zones.opportunityZone ? 'Yes' : 'No'}</span>}
                {zones.censusBlockFips    && <span className="hc-chip"><span className="hc-chip-lbl">Census Block</span>{zones.censusBlockFips}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {hasPoi > 0 && (
        <div className="data-section">
          <div className="data-section-header data-section-header--poi"><h3>Nearest Points of Interest</h3></div>
          <div className="hazard-list">
            <div className="hazard-card">
              <div className="hazard-card-chips" style={{paddingTop:0}}>
                {poi.fireStations?.map((s, i)     => <span key={`fs${i}`} className="hc-chip"><span className="hc-chip-lbl">Fire Station</span>{s.name} · {s.distanceMiles?.toFixed(2)} mi</span>)}
                {poi.policeStations?.map((s, i)   => <span key={`ps${i}`} className="hc-chip"><span className="hc-chip-lbl">Police</span>{s.name} · {s.distanceMiles?.toFixed(2)} mi</span>)}
                {poi.hospitals?.map((s, i)        => <span key={`h${i}`}  className="hc-chip"><span className="hc-chip-lbl">Hospital</span>{s.name} · {s.distanceMiles?.toFixed(2)} mi</span>)}
                {poi.ambulanceServices?.map((s, i)=> <span key={`a${i}`}  className="hc-chip"><span className="hc-chip-lbl">Ambulance</span>{s.name} · {s.distanceMiles?.toFixed(2)} mi</span>)}
                {poi.airports?.map((s, i)         => <span key={`ap${i}`} className="hc-chip"><span className="hc-chip-lbl">Airport</span>{s.name} · {s.distanceMiles?.toFixed(2)} mi</span>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AssessmentHeader({ r, onExportCSV, onExportXLSX, onClose }) {
  return (
    <div className="assessment-header">
      <div className="assessment-header-top">
        <div className="assessment-header-address">
          <span className="assessment-header-geocoded">{r.address}</span>
          {r.inputAddress && r.inputAddress !== r.address && (
            <span className="assessment-header-submitted">Submitted as: {r.inputAddress}</span>
          )}
        </div>
        <div className="assessment-header-actions">
          <button className="download-btn" onClick={onExportCSV}>Download CSV</button>
          <button className="download-btn" onClick={onExportXLSX}>Download Excel</button>
          {onClose && <button className="modal-close" onClick={onClose}>✕</button>}
        </div>
      </div>
      <div className="assessment-header-meta">
        {r.latitude != null && (
          <span className="assessment-meta-pill">
            Lat/Long: <strong>{parseFloat(r.latitude).toFixed(5)}, {parseFloat(r.longitude).toFixed(5)}</strong>
          </span>
        )}
        {r.elevation != null && (
          <span className="assessment-meta-pill">Elevation: <strong>{parseFloat(r.elevation).toFixed(1)} ft</strong></span>
        )}
        {r.overall?.riskLevel && (
          <span className="assessment-meta-pill">Overall Risk: <span className={`risk-badge risk-badge--${r.overall.riskLevel.toLowerCase()}`}>{r.overall.riskLevel}</span></span>
        )}
        {r.cached === false && <span className="meta-live-badge">Live</span>}
      </div>
    </div>
  );
}

function AssessmentModal({ r, onClose }) {
  if (!r) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <AssessmentHeader
          r={r}
          onExportCSV={() => exportToCSV([r])}
          onExportXLSX={() => exportToXLSX([r])}
          onClose={onClose}
        />
        <div className="modal-body">
          <AssessmentDetail r={r} />
        </div>
      </div>
    </div>
  );
}

function bulkExportRows(results) {
  const headers = [
    'Submitted Address', 'Geocoded Address', 'Overall Risk',
    'Wildfire Grade', 'Wildfire Rating',
    'Flood Grade', 'Flood Rating',
    'Earthquake Grade', 'Earthquake Rating',
    'Hurricane Grade', 'Tornado Grade', 'Hail Grade',
    'Wind Grade', 'Lightning Grade',
    'Crime Grade', 'Crime Rating',
    'Water Quality (PFAS)', 'Road Noise',
    'Fire Response', 'Walkability'
  ];
  const rows = results.map(r => [
    r.inputAddress || r.address,
    r.address,
    r.overall?.riskLevel || '',
    r.natural?.wildfire?.grade || '',
    r.natural?.wildfire?.rating || '',
    r.natural?.flood?.grade || '',
    r.natural?.flood?.rating || '',
    r.natural?.earthquake?.grade || '',
    r.natural?.earthquake?.rating || '',
    r.natural?.hurricane?.grade || '',
    r.natural?.tornado?.grade || '',
    r.natural?.hail?.grade || '',
    r.natural?.wind?.grade || '',
    r.natural?.lightning?.grade || '',
    r.human?.crime?.grade || '',
    r.human?.crime?.rating || '',
    r.human?.waterQuality?.pfas || '',
    r.human?.noise?.road || '',
    r.neighborhood?.fireResponse || '',
    r.neighborhood?.walkability || ''
  ]);
  return { headers, rows };
}

function exportToCSV(results) {
  const { headers, rows } = bulkExportRows(results);
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
  element.setAttribute('download', 'risk-assessments.csv');
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

function exportToXLSX(results) {
  const { headers, rows } = bulkExportRows(results);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  // Bold header row
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true } };
  }
  // Column widths
  ws['!cols'] = headers.map((_, i) => ({ wch: i < 2 ? 40 : 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Risk Assessments');
  XLSX.writeFile(wb, 'risk-assessments.xlsx');
}

export default App;