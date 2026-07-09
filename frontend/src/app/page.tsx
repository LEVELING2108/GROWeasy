'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { 
  UploadCloud, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Download, 
  RefreshCw, 
  FileText, 
  Sparkles, 
  Server, 
  Check, 
  ArrowRight,
  Database,
  LayoutDashboard,
  Users,
  Radio,
  Briefcase,
  X,
  Search,
  CheckSquare,
  Sun,
  Moon
} from 'lucide-react';

interface RawRow {
  [key: string]: string;
}

interface MappedLead {
  created_at: string;
  name: string;
  email: string;
  country_code: string;
  mobile_without_country_code: string;
  company: string;
  city: string;
  state: string;
  country: string;
  lead_owner: string;
  crm_status: 'GOOD_LEAD_FOLLOW_UP' | 'DID_NOT_CONNECT' | 'BAD_LEAD' | 'SALE_DONE';
  crm_note: string;
  data_source: string;
  possession_time: string;
  description: string;
}

interface SkippedLead {
  record: RawRow;
  reason: string;
}

interface ImportSummary {
  totalRecords: number;
  totalImported: number;
  totalSkipped: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const CRM_FIELDS = [
  { key: 'name', label: 'Lead Name', description: 'Full name of the lead' },
  { key: 'email', label: 'Email Address', description: 'Primary email address' },
  { key: 'mobile_without_country_code', label: 'Mobile Number', description: 'Phone number without country code' },
  { key: 'country_code', label: 'Country Code', description: 'Phone country code (e.g. +91)' },
  { key: 'created_at', label: 'Creation Date', description: 'Lead creation timestamp' },
  { key: 'company', label: 'Company Name', description: 'Organization or employer' },
  { key: 'city', label: 'City', description: 'City location' },
  { key: 'state', label: 'State', description: 'State location' },
  { key: 'country', label: 'Country', description: 'Country location' },
  { key: 'lead_owner', label: 'Lead Owner', description: 'CRM owner email or name' },
  { key: 'crm_status', label: 'CRM Status', description: 'Current standing of the lead' },
  { key: 'crm_note', label: 'CRM Notes / Remarks', description: 'Consolidated comments and extra details' },
  { key: 'data_source', label: 'Data Source', description: 'Campaign channel source' },
  { key: 'possession_time', label: 'Possession Time', description: 'Property possession time' },
  { key: 'description', label: 'Description', description: 'General description' }
];

const autoDetectMappings = (headers: string[]) => {
  const detected: { [key: string]: string } = {};
  
  headers.forEach(header => {
    const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Name mapping
    if ((h === 'name' || h === 'fullname' || h === 'leadname' || h === 'customername' || h === 'first_name' || h === 'firstname') && !detected['name']) {
      detected['name'] = header;
    }
    // Email mapping
    else if ((h === 'email' || h === 'emailaddress' || h === 'mail' || h === 'primaryemail') && !detected['email']) {
      detected['email'] = header;
    }
    // Mobile mapping
    else if ((h.includes('phone') || h.includes('mobile') || h.includes('contact') || h.includes('number') || h.includes('tel')) && !h.includes('code') && !detected['mobile_without_country_code']) {
      detected['mobile_without_country_code'] = header;
    }
    // Country code
    else if ((h.includes('countrycode') || h.includes('phonecode') || h.includes('dialcode')) && !detected['country_code']) {
      detected['country_code'] = header;
    }
    // Created at
    else if ((h.includes('date') || h.includes('time') || h.includes('created') || h === 'timestamp') && h !== 'possessiontime' && !detected['created_at']) {
      detected['created_at'] = header;
    }
    // Company
    else if ((h.includes('company') || h.includes('organization') || h === 'org' || h === 'employer') && !detected['company']) {
      detected['company'] = header;
    }
    // Location: City, State, Country
    else if ((h === 'city' || h === 'town' || h === 'location') && !detected['city']) {
      detected['city'] = header;
    }
    else if ((h === 'state' || h === 'region' || h === 'province') && !detected['state']) {
      detected['state'] = header;
    }
    else if ((h === 'country' || h === 'nation') && !detected['country']) {
      detected['country'] = header;
    }
    // Lead Owner
    else if ((h.includes('owner') || h.includes('assignee') || h.includes('agent')) && !detected['lead_owner']) {
      detected['lead_owner'] = header;
    }
    // CRM status
    else if ((h.includes('status') || h.includes('stage') || h.includes('state')) && h !== 'state' && !detected['crm_status']) {
      detected['crm_status'] = header;
    }
    // Notes
    else if ((h.includes('note') || h.includes('remark') || h.includes('comment') || h.includes('feedback')) && !detected['crm_note']) {
      detected['crm_note'] = header;
    }
    // Source
    else if ((h.includes('source') || h.includes('campaign') || h.includes('medium') || h.includes('channel')) && !detected['data_source']) {
      detected['data_source'] = header;
    }
    // Possession
    else if ((h.includes('possession') || h.includes('possessiontime')) && !detected['possession_time']) {
      detected['possession_time'] = header;
    }
    // Description
    else if ((h.includes('desc') || h.includes('details') || h.includes('about')) && !detected['description']) {
      detected['description'] = header;
    }
  });
  
  return detected;
};

export default function CSVImporterPage() {
  // Navigation States
  const [activeTab, setActiveTab] = useState<'sources' | 'leads'>('sources');
  
  // Importer Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2 | 3 | 4>(1); // 1: Upload, 2: Preview, 3: Processing, 4: Complete
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Load theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('groweasy_theme') as 'light' | 'dark';
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('groweasy_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };
  
  // Leads Store
  const [leads, setLeads] = useState<MappedLead[]>([]);
  const [mappings, setMappings] = useState<{ [key: string]: string }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedLead, setSelectedLead] = useState<MappedLead | null>(null);
  const [editingNote, setEditingNote] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState(15);

  // Reset pagination limit when search query or status filter changes
  useEffect(() => {
    setVisibleCount(15);
  }, [searchQuery, statusFilter]);

  // Sync editing note state when selected lead changes
  useEffect(() => {
    if (selectedLead) {
      setEditingNote(selectedLead.crm_note || '');
    } else {
      setEditingNote('');
    }
  }, [selectedLead]);
  
  // File upload states
  const [file, setFile] = useState<File | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Intelligently mapping columns...');
  
  // Backend health status
  const [backendHealth, setBackendHealth] = useState<{ status: string; ai_enabled: boolean; mode: string } | null>(null);
  
  // Processing Results
  const [mappedLeads, setMappedLeads] = useState<MappedLead[]>([]);
  const [skippedLeads, setSkippedLeads] = useState<SkippedLead[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check backend status
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_URL}/api/health`);
        if (res.ok) {
          const data = await res.json();
          setBackendHealth(data);
        } else {
          setBackendHealth({ status: 'offline', ai_enabled: false, mode: 'Offline' });
        }
      } catch (err) {
        setBackendHealth({ status: 'offline', ai_enabled: false, mode: 'Offline' });
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load cached leads from localStorage immediately on mount for instant visual feedback
  useEffect(() => {
    const cached = localStorage.getItem('groweasy_leads');
    if (cached) {
      try {
        setLeads(JSON.parse(cached));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load fresh leads from the backend
  const fetchLeads = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/leads`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.records) {
          setLeads(data.records);
          localStorage.setItem('groweasy_leads', JSON.stringify(data.records));
        }
      }
    } catch (err) {
      console.warn('Backend fetch failed, relying on cached localStorage leads:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Load fresh leads from the backend on mount
  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Sync leads to localStorage whenever state changes
  useEffect(() => {
    if (leads.length > 0) {
      localStorage.setItem('groweasy_leads', JSON.stringify(leads));
    }
  }, [leads]);

  // Handle Drag Over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // Handle Drag Leave
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Parse CSV File
  const parseCSV = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      setErrorMsg('Invalid file format. Please upload a valid .csv file.');
      return;
    }
    setErrorMsg(null);
    setFile(selectedFile);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setErrorMsg('Error parsing CSV. Please check the file formatting.');
          return;
        }
        
        const headers = results.meta.fields || [];
        const rows = results.data as RawRow[];

        setRawHeaders(headers);
        setRawRows(rows);

        // Auto detect mappings
        const initialMappings = autoDetectMappings(headers);
        setMappings(initialMappings);

        setModalStep(2); // Go to Preview
      },
      error: (error) => {
        setErrorMsg(`Failed to parse CSV: ${error.message}`);
      }
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setErrorMsg(null);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      parseCSV(droppedFiles[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      parseCSV(selectedFiles[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Perform AI Import
  const handleConfirmImport = async () => {
    if (!file) return;
    setModalStep(3); // Loading screen
    setErrorMsg(null);
    setProgress(15);
    setLoadingText('Uploading CSV to GrowEasy AI Engine...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('mappings', JSON.stringify(mappings));

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        if (prev === 40) {
          setLoadingText('Detecting raw spreadsheet columns...');
        }
        if (prev === 65) {
          setLoadingText('Gemini AI executing CRM mapping protocols...');
        }
        if (prev === 80) {
          setLoadingText('Formatting results and validating CRM statuses...');
        }
        return prev + 5;
      });
    }, 450);

    try {
      const response = await fetch(`${API_URL}/api/import`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Server returned an error');
      }

      const result = await response.json();

      if (result.success) {
        setMappedLeads(result.records);
        setSkippedLeads(result.skipped);
        setSummary(result.summary);
        
        // Append newly mapped leads to the main dashboard state with de-duplication
        setLeads((prev) => {
          const combined = [...result.records, ...prev];
          const unique: MappedLead[] = [];
          const seen = new Set<string>();
          combined.forEach(l => {
            const emailPart = l.email ? l.email.trim().toLowerCase() : '';
            const phonePart = l.mobile_without_country_code ? l.mobile_without_country_code.trim() : '';
            const key = `${emailPart}_${phonePart}`;
            if (!seen.has(key)) {
              seen.add(key);
              unique.push(l);
            }
          });
          return unique;
        });
        
        setTimeout(() => setModalStep(4), 600); // Complete screen
      } else {
        throw new Error('Import failed unexpectedly.');
      }

    } catch (err: any) {
      clearInterval(progressInterval);
      setErrorMsg(err.message || 'An error occurred connecting to the backend.');
      setModalStep(2); // Fallback to preview
    }
  };

  const handleResetModal = () => {
    setFile(null);
    setRawHeaders([]);
    setRawRows([]);
    setMappings({});
    setMappedLeads([]);
    setSkippedLeads([]);
    setSummary(null);
    setErrorMsg(null);
    setModalStep(1);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    handleResetModal();
  };

  // Download Sample Template CSV
  const downloadSampleTemplate = () => {
    const templateHeaders = [
      'created_at', 'name', 'email', 'country_code', 'mobile_without_country_code', 
      'company', 'city', 'state', 'country', 'lead_owner', 'crm_status', 
      'crm_note', 'data_source', 'possession_time', 'description'
    ];
    const templateRow = [
      '2026-05-13 14:20:48', 'John Doe', 'john.doe@example.com', '+91', '9876543210', 
      'GrowEasy', 'Mumbai', 'Maharashtra', 'India', 'lead_owner@gmail.com', 'GOOD_LEAD_FOLLOW_UP', 
      'Wants to rescheduling demo', 'leads_on_demand', '', 'Lead desc'
    ];
    
    const csvContent = Papa.unparse({
      fields: templateHeaders,
      data: [templateRow]
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'GrowEasy_Lead_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export CSV
  const exportLeadsCSV = () => {
    if (leads.length === 0) return;
    const csvContent = Papa.unparse(leads);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `groweasy_crm_leads_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export JSON
  const exportLeadsJSON = () => {
    if (leads.length === 0) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(leads, null, 2)
    )}`;
    const link = document.createElement('a');
    link.setAttribute('href', jsonString);
    link.setAttribute('download', `groweasy_crm_leads_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter Leads
  const filteredLeads = leads.filter(lead => {
    const search = searchQuery.toLowerCase();
    const matchesSearch = (
      (lead.name || '').toLowerCase().includes(search) ||
      (lead.email || '').toLowerCase().includes(search) ||
      (lead.mobile_without_country_code || '').toLowerCase().includes(search) ||
      (lead.company || '').toLowerCase().includes(search)
    );
    const matchesStatus = statusFilter === 'ALL' || lead.crm_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="dashboard-layout">
      {/* Sidebar - Matching screenshot1 & screenshot3 */}
      <aside className="sidebar">
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div className="sidebar-logo">
            <Radio size={20} className="sidebar-logo-icon" />
            <span>GrowEasy</span>
          </div>
          <button 
            onClick={toggleTheme} 
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.25rem', borderRadius: 'var(--radius-sm)' }}
            title="Toggle Theme"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>

        {/* Profile Card */}
        <div className="profile-card">
          <div className="profile-avatar">VK</div>
          <div className="profile-info">
            <span className="profile-name">VK Test</span>
            <span className="profile-role">Owner</span>
          </div>
        </div>

        {/* Scrollable Navigation Menu Wrapper */}
        <div className="sidebar-menu-wrapper" style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.25rem', marginBottom: '1rem' }}>
          
          {/* Navigation Section */}
          <div className="sidebar-section-title">Main</div>
          <nav className="sidebar-nav">
            <div className="sidebar-link" onClick={() => setActiveTab('sources')}>
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </div>
            <div className="sidebar-link">
              <Radio size={16} />
              <span>Generate Leads</span>
            </div>
            <div 
              className={`sidebar-link ${activeTab === 'leads' ? 'active' : ''}`}
              onClick={() => setActiveTab('leads')}
            >
              <Users size={16} />
              <span>Manage Leads</span>
            </div>
            <div className="sidebar-link">
              <Briefcase size={16} />
              <span>Engage Leads</span>
            </div>
          </nav>

          <div className="sidebar-section-title">Control Center</div>
          <nav className="sidebar-nav">
            <div className="sidebar-link">
              <Users size={16} />
              <span>Team Members</span>
            </div>
            <div 
              className={`sidebar-link ${activeTab === 'sources' ? 'active' : ''}`}
              onClick={() => setActiveTab('sources')}
            >
              <Radio size={16} />
              <span>Lead Sources</span>
            </div>
            <div className="sidebar-link">
              <LayoutDashboard size={16} />
              <span>Ad Accounts</span>
            </div>
            <div className="sidebar-link">
              <Radio size={16} />
              <span>WhatsApp Account</span>
            </div>
            <div className="sidebar-link">
              <Users size={16} />
              <span>Tele Calling</span>
            </div>
            <div className="sidebar-link">
              <Briefcase size={16} />
              <span>CRM Fields</span>
            </div>
            <div className="sidebar-link">
              <Server size={16} />
              <span>API Center</span>
            </div>
          </nav>

        </div>

        <div className="sidebar-footer">
          <div className="sidebar-link">
            <Briefcase size={16} />
            <span>Business Center</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-viewport animate-slide-up">
        
        {/* VIEW 1: LEAD SOURCES (screenshot1) */}
        {activeTab === 'sources' && (
          <div>
            <div className="view-header">
              <h2 className="view-title">Lead Sources</h2>
              <p className="view-subtitle">Connect, manage, and control all your lead channels from one dashboard.</p>
            </div>

            <div className="lead-sources-grid">
              
              {/* CSV Importer Card */}
              <div 
                className="source-card" 
                style={{ cursor: 'pointer', border: '1px solid var(--promo-card-border)', background: 'var(--promo-card-bg)' }}
                onClick={() => setIsModalOpen(true)}
              >
                <div className="source-card-header">
                  <div className="source-card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText className="text-primary" size={20} />
                    Import Leads via CSV
                  </div>
                  <span className="source-badge connected">Standardized</span>
                </div>
                <p className="source-card-desc">
                  Intelligently upload spreadsheets, mapping dynamic raw headers to standard CRM lead attributes using advanced AI models.
                </p>
                <div className="source-card-footer">
                  <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setIsModalOpen(true)}>
                    Import Leads
                  </button>
                </div>
              </div>

              {/* Google Ads Integration Card */}
              <div className="source-card">
                <div className="source-card-header">
                  <div className="source-card-title">Google Ads</div>
                  <span className="source-badge not-connected">Not Connected</span>
                </div>
                <p className="source-card-desc">
                  Synchronize Google Search, Display, and Video Lead Forms directly into your CRM pipeline.
                </p>
                <div className="source-card-footer">
                  <button className="btn btn-secondary" style={{ width: '100%' }}>Connect</button>
                </div>
              </div>

              {/* Facebook Ads Integration Card */}
              <div className="source-card">
                <div className="source-card-header">
                  <div className="source-card-title">Facebook Ads</div>
                  <span className="source-badge not-connected">Not Connected</span>
                </div>
                <p className="source-card-desc">
                  Sync Instant Forms and Lead Ads directly to capture contacts in real-time.
                </p>
                <div className="source-card-footer">
                  <button className="btn btn-secondary" style={{ width: '100%' }}>Connect</button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* VIEW 2: MANAGE LEADS (screenshot3) */}
        {activeTab === 'leads' && (
          <div>
            <div className="view-header" style={{ marginBottom: '1.25rem' }}>
              <h2 className="view-title">Manage Your Leads</h2>
              <p className="view-subtitle">Monitor lead status, assign tasks, and close deals faster.</p>
            </div>

            {/* Premium Interactive Aggregate Metrics Cards (Tab Menu) */}
            <div className="stats-grid" style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
              <div 
                className={`stat-card ${statusFilter === 'ALL' ? 'active' : ''}`} 
                onClick={() => setStatusFilter('ALL')}
                style={{ padding: '0.85rem 1.25rem', background: 'var(--bg-surface)', border: statusFilter === 'ALL' ? '2px solid var(--primary)' : '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', transition: 'all 0.15s ease' }}
              >
                <div className="stat-value" style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>{leads.length}</div>
                <div className="stat-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: '0.15rem' }}>Total Leads</div>
              </div>
              
              <div 
                className={`stat-card ${statusFilter === 'GOOD_LEAD_FOLLOW_UP' ? 'active' : ''}`} 
                onClick={() => setStatusFilter('GOOD_LEAD_FOLLOW_UP')}
                style={{ padding: '0.85rem 1.25rem', background: 'var(--bg-surface)', border: statusFilter === 'GOOD_LEAD_FOLLOW_UP' ? '2px solid var(--success)' : '1px solid var(--border-color)', borderLeft: statusFilter === 'GOOD_LEAD_FOLLOW_UP' ? '6px solid var(--success)' : '3px solid var(--success)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', transition: 'all 0.15s ease' }}
              >
                <div className="stat-value" style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--success)' }}>{leads.filter(l => l.crm_status === 'GOOD_LEAD_FOLLOW_UP').length}</div>
                <div className="stat-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: '0.15rem' }}>Good Leads</div>
              </div>

              <div 
                className={`stat-card ${statusFilter === 'DID_NOT_CONNECT' ? 'active' : ''}`} 
                onClick={() => setStatusFilter('DID_NOT_CONNECT')}
                style={{ padding: '0.85rem 1.25rem', background: 'var(--bg-surface)', border: statusFilter === 'DID_NOT_CONNECT' ? '2px solid var(--text-muted-state)' : '1px solid var(--border-color)', borderLeft: statusFilter === 'DID_NOT_CONNECT' ? '6px solid var(--text-muted-state)' : '3px solid var(--text-muted-state)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', transition: 'all 0.15s ease' }}
              >
                <div className="stat-value" style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-muted-state)' }}>{leads.filter(l => l.crm_status === 'DID_NOT_CONNECT').length}</div>
                <div className="stat-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: '0.15rem' }}>Not Dialed</div>
              </div>

              <div 
                className={`stat-card ${statusFilter === 'BAD_LEAD' ? 'active' : ''}`} 
                onClick={() => setStatusFilter('BAD_LEAD')}
                style={{ padding: '0.85rem 1.25rem', background: 'var(--bg-surface)', border: statusFilter === 'BAD_LEAD' ? '2px solid var(--error-text)' : '1px solid var(--border-color)', borderLeft: statusFilter === 'BAD_LEAD' ? '6px solid var(--error-text)' : '3px solid var(--error-text)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', transition: 'all 0.15s ease' }}
              >
                <div className="stat-value" style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--error-text)' }}>{leads.filter(l => l.crm_status === 'BAD_LEAD').length}</div>
                <div className="stat-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: '0.15rem' }}>Bad Leads</div>
              </div>

              <div 
                className={`stat-card ${statusFilter === 'SALE_DONE' ? 'active' : ''}`} 
                onClick={() => setStatusFilter('SALE_DONE')}
                style={{ padding: '0.85rem 1.25rem', background: 'var(--bg-surface)', border: statusFilter === 'SALE_DONE' ? '2px solid var(--info)' : '1px solid var(--border-color)', borderLeft: statusFilter === 'SALE_DONE' ? '6px solid var(--info)' : '3px solid var(--info)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', transition: 'all 0.15s ease' }}
              >
                <div className="stat-value" style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--info)' }}>{leads.filter(l => l.crm_status === 'SALE_DONE').length}</div>
                <div className="stat-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: '0.15rem' }}>Closed Sales</div>
              </div>
            </div>

            {/* Leads Table Card */}
            <div className="dashboard-table-card">
              <div className="table-card-header">
                <div className="table-card-title">Your Leads</div>
                
                <div className="table-card-controls">
                  
                  {/* Status Filter Dropdown */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color-hover)', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer', height: '32px' }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="GOOD_LEAD_FOLLOW_UP">Good Lead</option>
                    <option value="DID_NOT_CONNECT">Not Dialed</option>
                    <option value="BAD_LEAD">Bad Lead</option>
                    <option value="SALE_DONE">Sale Done</option>
                  </select>
                  <div className="search-input-wrapper">
                    <input 
                      type="text" 
                      className="search-input" 
                      placeholder="Enter email or phone number..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <Search size={14} className="search-icon" />
                  </div>
                  <button 
                    className="btn btn-secondary btn-icon" 
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('ALL');
                      fetchLeads();
                    }} 
                    disabled={isRefreshing}
                    title="Reset & Refresh"
                  >
                    <RefreshCw size={14} className={isRefreshing ? 'animate-spin-one' : ''} />
                  </button>
                  <button className="btn btn-secondary btn-icon" onClick={exportLeadsCSV} title="Export CSV">
                    <Download size={14} />
                  </button>
                  <button className="btn btn-secondary btn-icon" onClick={exportLeadsJSON} title="Export JSON">
                    <Database size={14} />
                  </button>
                </div>
              </div>

              {/* Main Leads Table */}
              <div className="main-leads-table-wrapper">
                <table className="main-leads-table">
                  <thead>
                    <tr>
                      <th>LEAD NAME</th>
                      <th>EMAIL</th>
                      <th>CONTACT</th>
                      <th>DATE CREATED</th>
                      <th>COMPANY</th>
                      <th>STATUS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }}>
                            <FileText size={32} style={{ color: 'var(--text-muted)' }} />
                            <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>No leads imported yet</strong>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '320px', margin: '0 auto', lineHeight: '1.4' }}>
                              Go to <strong>Lead Sources</strong> in the sidebar and upload a CSV file to populate this dashboard.
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                          No leads matched your search query.
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.slice(0, visibleCount).map((lead, idx) => (
                        <tr key={idx}>
                          <td className="lead-name-cell">{lead.name || '—'}</td>
                          <td>{lead.email || '—'}</td>
                          <td>
                            {lead.mobile_without_country_code 
                              ? `${lead.country_code ? lead.country_code : ''}${lead.mobile_without_country_code}` 
                              : '—'}
                          </td>
                          <td>
                            {lead.created_at ? lead.created_at : '—'}
                          </td>
                          <td>{lead.company || '—'}</td>
                          <td>
                            <span className={`status-pill-GrowEasy status-GrowEasy-${
                              lead.crm_status === 'GOOD_LEAD_FOLLOW_UP' ? 'GOOD_LEAD' : lead.crm_status
                            }`}>
                              {lead.crm_status === 'GOOD_LEAD_FOLLOW_UP' ? 'Good Lead' 
                                : lead.crm_status === 'DID_NOT_CONNECT' ? 'Not Dialed'
                                : lead.crm_status === 'BAD_LEAD' ? 'Bad Lead'
                                : lead.crm_status === 'SALE_DONE' ? 'Sale Done' : 'Good Lead'}
                            </span>
                          </td>
                          <td>
                            <button 
                              className="btn-load-more" 
                              style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer' }}
                              onClick={() => setSelectedLead(lead)}
                            >
                              More &gt;
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {filteredLeads.length > visibleCount && (
                <div className="table-load-more-container">
                  <button className="btn-load-more" onClick={() => setVisibleCount(prev => prev + 15)}>
                    Load more
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* --- IMPORT CSV MODAL WINDOW (screenshot1 & 2) --- */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Import Leads via CSV</h3>
                <p className="modal-subtitle">Upload a CSV file to bulk import leads into your system.</p>
              </div>
              <button className="modal-close-btn" onClick={handleCloseModal}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {errorMsg && (
                <div className="badge badge-error" style={{ display: 'flex', width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', textTransform: 'none', letterSpacing: 'normal', fontSize: '0.8rem' }}>
                  <AlertCircle size={14} style={{ marginRight: '0.5rem', flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Step 1: Upload Dropzone (screenshot1) */}
              {modalStep === 1 && (
                <div className="animate-fade-in">
                  <div 
                    className={`modal-dropzone ${isDragging ? 'dragging-active' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={triggerFileSelect}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept=".csv" 
                      style={{ display: 'none' }} 
                    />
                    <div className="modal-dropzone-icon">
                      <UploadCloud size={20} />
                    </div>
                    <h4 className="modal-dropzone-title">Drop your CSV file here</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>or click to browse files</p>
                    
                    <div className="modal-dropzone-hint">
                      Supported file: .csv (max 5MB)
                    </div>

                    <p className="modal-dropzone-requirements">
                      Required headers: created_at, name, email, country_code, mobile_without_country_code, company, city, state, country, lead_owner, crm_status, crm_note. Template includes default + custom CRM fields to reduce upload errors.
                    </p>
                  </div>

                  {/* Template download card */}
                  <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                    <button 
                      className="btn btn-secondary" 
                      onClick={downloadSampleTemplate}
                      style={{ borderRadius: 'var(--radius-md)', fontSize: '0.85rem', padding: '0.55rem 1.25rem', gap: '0.5rem', background: 'var(--success-tint-bg)', color: 'var(--success-text)', borderColor: 'var(--success-tint-border)' }}
                    >
                      <Download size={14} />
                      Download Sample CSV Template
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Preview Table (screenshot2) */}
              {modalStep === 2 && file && (
                <div className="animate-fade-in">
                  {/* File Info Block */}
                  <div className="selected-file-block">
                    <div className="file-block-info">
                      <FileText size={18} className="file-block-icon" />
                      <div>
                        <span className="file-block-name">{file.name}</span>
                        <span className="file-block-size"> ({(file.size / 1024).toFixed(2)} KB)</span>
                      </div>
                    </div>
                    <button className="file-block-remove" onClick={handleResetModal}>
                      <X size={14} />
                    </button>
                  </div>

                  {/* Scrollable Preview Table */}
                  <div className="modal-preview-table-wrapper">
                    <table className="modal-preview-table">
                      <thead>
                        <tr>
                          {rawHeaders.map((header, idx) => (
                            <th key={idx}>{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rawRows.slice(0, 10).map((row, rowIdx) => (
                          <tr key={rowIdx}>
                            {rawHeaders.map((header, colIdx) => (
                              <td key={colIdx}>{row[header] || '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rawRows.length > 10 && (
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
                      Showing first 10 rows of raw preview...
                    </p>
                  )}

                  {/* Column Mapping Section */}
                  <div className="mapping-section">
                    <div className="mapping-section-header">
                      <div className="mapping-section-title">
                        <Sparkles size={16} style={{ color: 'var(--primary)' }} />
                        CRM Schema Field Mapping
                      </div>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setMappings({});
                        }}
                        style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)' }}
                      >
                        Clear Mappings
                      </button>
                    </div>
                    <p className="mapping-section-description">
                      We've automatically matched your CSV headers to our CRM fields. Verify or adjust the selections below to ensure high mapping accuracy.
                    </p>

                    <div className="mapping-grid">
                      {CRM_FIELDS.map((field) => {
                        const isRequired = ['name', 'email', 'mobile_without_country_code'].includes(field.key);
                        const isMapped = !!mappings[field.key];
                        return (
                          <div 
                            key={field.key} 
                            className={`mapping-item ${isMapped ? 'mapped' : ''} ${isRequired ? 'required' : ''}`}
                          >
                            <div className="mapping-label-row">
                              <span className="mapping-label">{field.label}</span>
                              <span className={`mapping-badge ${isRequired ? 'req' : 'opt'}`}>
                                {isRequired ? 'Primary/Required' : 'Optional'}
                              </span>
                            </div>
                            <span className="mapping-desc">{field.description}</span>
                            <select
                              className="mapping-select"
                              value={mappings[field.key] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMappings(prev => ({
                                  ...prev,
                                  [field.key]: val
                                }));
                              }}
                            >
                              <option value="">(Select column or skip)</option>
                              {rawHeaders.map((header, hIdx) => (
                                <option key={hIdx} value={header}>
                                  {header}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: AI Processing with Grid Mesh and Sonar Pulse Animations */}
              {modalStep === 3 && (
                <div className="loading-container animate-fade-in" style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  
                  {/* Premium Scanner Wrap with mesh grid and double sonar pulses */}
                  <div className="ai-grid-bg" style={{ marginBottom: '1.5rem', width: '100%', maxWidth: '420px' }}>
                    <div className="sonar-pulse"></div>
                    <div className="sonar-pulse sonar-pulse-delay"></div>
                    
                    <div className="premium-scanner-box">
                      <div className="scanner-sheet">
                        <div className="scanner-line long"></div>
                        <div className="scanner-line medium"></div>
                        <div className="scanner-line short"></div>
                        <div className="scanner-line medium"></div>
                        <div className="scanner-line long"></div>
                      </div>
                      <div className="scanner-laser"></div>
                    </div>
                    
                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.25rem' }}>AI CRM Mapping Underway</h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>{loadingText}</p>
                  </div>
                  
                  <div className="progress-track" style={{ height: '4px', width: '100%', maxWidth: '420px', marginTop: '0.5rem', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div className="progress-bar" style={{ height: '100%', width: `${progress}%`, background: 'var(--primary)', transition: 'width 0.3s ease' }}></div>
                  </div>
                  
                  {/* Rolling Console Log Animations */}
                  <div style={{ marginTop: '1.5rem', textAlign: 'left', width: '100%', maxWidth: '420px', padding: '0.75rem', background: 'var(--log-box-bg)', border: '1px solid var(--log-box-border)', borderRadius: 'var(--radius-md)' }}>
                    <div className={`mapping-log-item ${progress >= 15 ? 'complete' : ''}`}>
                      {progress >= 15 ? '✓' : '○'} Uploading CSV lead records...
                    </div>
                    <div className={`mapping-log-item ${progress >= 40 ? 'complete' : ''}`}>
                      {progress >= 40 ? '✓' : '○'} Parsing headers & raw columns...
                    </div>
                    <div className={`mapping-log-item ${progress >= 65 ? 'complete' : ''}`}>
                      {progress >= 65 ? '✓' : '○'} Running Gemini AI column extraction...
                    </div>
                    <div className={`mapping-log-item ${progress >= 80 ? 'complete' : ''}`}>
                      {progress >= 80 ? '✓' : '○'} Normalizing states & contact notes...
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Import Complete Summary */}
              {modalStep === 4 && summary && (
                <div className="animate-fade-in" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                  <CheckCircle size={48} className="success-icon-bounce" style={{ marginBottom: '1rem' }} />
                  <h4 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                    AI Import Completed
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                    Standardized data has been successfully imported to your pipeline.
                  </p>

                  <div className="stats-grid" style={{ maxWidth: '440px', margin: '0 auto' }}>
                    <div className="stat-card" style={{ padding: '0.75rem' }}>
                      <div className="stat-value" style={{ fontSize: '1.5rem' }}>{summary.totalImported}</div>
                      <div className="stat-label" style={{ fontSize: '0.7rem' }}>Successfully Mapped</div>
                    </div>
                    <div className="stat-card" style={{ padding: '0.75rem' }}>
                      <div className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--warning)' }}>{summary.totalSkipped}</div>
                      <div className="stat-label" style={{ fontSize: '0.7rem' }}>Skipped Leads</div>
                    </div>
                  </div>

                  {/* Skipped list container - Variable Background */}
                  {skippedLeads.length > 0 && (
                    <div style={{ marginTop: '1rem', textAlign: 'left', background: 'var(--bg-main)', border: '1px solid var(--border-color)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', color: 'var(--warning)' }}>
                      <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Skipped records summary:</strong>
                      <ul style={{ paddingLeft: '1rem' }}>
                        {skippedLeads.slice(0, 3).map((item, idx) => (
                          <li key={idx}>{item.reason} ({item.record.name || item.record.full_name || 'Unnamed'})</li>
                        ))}
                        {skippedLeads.length > 3 && <li>...and {skippedLeads.length - 3} more records</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Modal Actions Footer */}
            <div className="modal-footer">
              {modalStep === 1 && (
                <>
                  <button className="btn btn-cancel" onClick={handleCloseModal}>Cancel</button>
                  <button className="btn btn-confirm" disabled style={{ opacity: 0.5 }}>Upload File</button>
                </>
              )}
              {modalStep === 2 && (
                <>
                  <button className="btn btn-cancel" onClick={handleResetModal}>Cancel</button>
                  <button className="btn btn-confirm" onClick={handleConfirmImport}>Upload File</button>
                </>
              )}
              {modalStep === 3 && (
                <button className="btn btn-cancel" disabled style={{ opacity: 0.5 }}>Uploading...</button>
              )}
              {modalStep === 4 && (
                <button className="btn btn-confirm" onClick={() => {
                  setIsModalOpen(false);
                  setActiveTab('leads'); // Redirect to Leads view
                  handleResetModal();
                }}>
                  Go to Manage Leads
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* --- LEAD DETAILS MODAL CARD --- */}
      {selectedLead && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '550px' }}>
            
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Lead Information</h3>
                <p className="modal-subtitle">Full profile details and CRM history.</p>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedLead(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Header Profile Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                <div className="profile-avatar" style={{ width: '48px', height: '48px', fontSize: '1.2rem', borderRadius: 'var(--radius-md)', background: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                  {selectedLead.name ? selectedLead.name.substring(0, 2).toUpperCase() : 'LD'}
                </div>
                <div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selectedLead.name || 'Unnamed Lead'}</h4>
                  <span className={`status-pill-GrowEasy status-GrowEasy-${
                    selectedLead.crm_status === 'GOOD_LEAD_FOLLOW_UP' ? 'GOOD_LEAD' : selectedLead.crm_status
                  }`} style={{ marginTop: '0.25rem' }}>
                    {selectedLead.crm_status === 'GOOD_LEAD_FOLLOW_UP' ? 'Good Lead' 
                      : selectedLead.crm_status === 'DID_NOT_CONNECT' ? 'Not Dialed'
                      : selectedLead.crm_status === 'BAD_LEAD' ? 'Bad Lead'
                      : selectedLead.crm_status === 'SALE_DONE' ? 'Sale Done' : 'Good Lead'}
                  </span>
                </div>
              </div>

              {/* Attributes Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.8rem' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>Email Address</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: '0.15rem', wordBreak: 'break-all' }}>{selectedLead.email || '—'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>Contact Number</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: '0.15rem' }}>
                    {selectedLead.mobile_without_country_code 
                      ? `${selectedLead.country_code ? selectedLead.country_code : ''} ${selectedLead.mobile_without_country_code}` 
                      : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>Company</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: '0.15rem' }}>{selectedLead.company || '—'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>Date Created</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: '0.15rem' }}>{selectedLead.created_at || '—'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>Lead Owner</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: '0.15rem', wordBreak: 'break-all' }}>{selectedLead.lead_owner || '—'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>Data Source</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: '0.15rem' }}>{selectedLead.data_source || '—'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>Location</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: '0.15rem' }}>
                    {[selectedLead.city, selectedLead.state, selectedLead.country].filter(Boolean).join(', ') || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>Possession Time</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: '0.15rem' }}>{selectedLead.possession_time || '—'}</div>
                </div>
              </div>

              {/* Notes block - Editable Textarea */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>CRM Notes & Remarks</div>
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '0.2rem 0.6rem', fontSize: '0.7rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', height: 'auto', flex: 'none', width: 'auto', background: 'var(--primary)', border: '1px solid var(--primary)', color: '#ffffff' }}
                    onClick={async () => {
                      // Update state leads array
                      setLeads(prev => prev.map(l => {
                        if (l.email === selectedLead.email && l.mobile_without_country_code === selectedLead.mobile_without_country_code) {
                          return { ...l, crm_note: editingNote };
                        }
                        return l;
                      }));
                      
                      // Update current selected modal profile view
                      setSelectedLead(prev => prev ? { ...prev, crm_note: editingNote } : null);

                      // Persist change to backend
                      try {
                        await fetch(`${API_URL}/api/leads/update-note`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            email: selectedLead.email,
                            mobile_without_country_code: selectedLead.mobile_without_country_code,
                            crm_note: editingNote
                          })
                        });
                      } catch (err) {
                        console.error('Failed to sync note to database:', err);
                      }
                    }}
                  >
                    Save Note
                  </button>
                </div>
                <textarea
                  value={editingNote}
                  onChange={(e) => setEditingNote(e.target.value)}
                  placeholder="Edit remarks, secondary emails/phones or follow-up notes here..."
                  style={{ width: '100%', minHeight: '70px', padding: '0.5rem', fontSize: '0.8rem', border: '1px solid var(--border-color-hover)', borderRadius: 'var(--radius-md)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.4', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Description block */}
              {selectedLead.description && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.35rem' }}>Additional Description</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {selectedLead.description}
                  </div>
                </div>
              )}

              {/* CRM Status Dropdown Updater */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Update Lead Status:</div>
                <select 
                  value={selectedLead.crm_status} 
                  onChange={(e) => {
                    const newStatus = e.target.value as MappedLead['crm_status'];
                    
                    // Update state leads array
                    setLeads(prev => prev.map(l => {
                      if (l.email === selectedLead.email && l.mobile_without_country_code === selectedLead.mobile_without_country_code) {
                        return { ...l, crm_status: newStatus };
                      }
                      return l;
                    }));
                    
                    // Update current selected modal profile view
                    setSelectedLead(prev => prev ? { ...prev, crm_status: newStatus } : null);
 
                    // Persist change to backend
                    fetch(`${API_URL}/api/leads/update-status`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        email: selectedLead.email,
                        mobile_without_country_code: selectedLead.mobile_without_country_code,
                        crm_status: newStatus
                      })
                    }).catch(err => console.error('Failed to sync status to database:', err));
                  }}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color-hover)', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  <option value="GOOD_LEAD_FOLLOW_UP">Good Lead (Follow Up)</option>
                  <option value="DID_NOT_CONNECT">Not Dialed / Did Not Connect</option>
                  <option value="BAD_LEAD">Bad Lead</option>
                  <option value="SALE_DONE">Sale Done</option>
                </select>
              </div>

            </div>

            {/* Modal Actions Footer */}
            <div className="modal-footer" style={{ padding: '1.25rem 2rem 1.5rem 2rem', display: 'flex', gap: '1rem' }}>
              <button 
                className="btn" 
                style={{ background: 'var(--error-tint-bg)', border: '1px solid var(--error-tint-border)', color: 'var(--error-text)', fontSize: '0.8rem', padding: '0.45rem 1rem', cursor: 'pointer', borderRadius: 'var(--radius-md)' }}
                onClick={async () => {
                  if (confirm(`Are you sure you want to delete ${selectedLead.name || 'this lead'}?`)) {
                    // Update state leads array
                    setLeads(prev => prev.filter(l => !(
                      l.email === selectedLead.email && l.mobile_without_country_code === selectedLead.mobile_without_country_code
                    )));
                    
                    // Persist delete request to backend
                    try {
                      await fetch(`${API_URL}/api/leads/delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          email: selectedLead.email,
                          mobile_without_country_code: selectedLead.mobile_without_country_code
                        })
                      });
                    } catch (err) {
                      console.error('Failed to delete lead from database:', err);
                    }
                    
                    // Close details modal
                    setSelectedLead(null);
                  }
                }}
              >
                Delete Lead
              </button>
              <button className="btn btn-cancel" onClick={() => setSelectedLead(null)} style={{ margin: 0 }}>Close Details</button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
