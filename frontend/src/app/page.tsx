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
  Database,
  LayoutDashboard,
  Users,
  Radio,
  Briefcase,
  X,
  Search,
  Sun,
  Moon,
  Activity,
  TrendingUp
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
  const [activeTab, setActiveTab] = useState<'sources' | 'analytics' | 'leads' | 'generate' | 'engage' | 'team' | 'ads' | 'whatsapp' | 'telecalling' | 'crmfields' | 'apicenter' | 'business'>('sources');

  // Generator Simulator States
  const [genCampaign, setGenCampaign] = useState('leads_on_demand');
  const [genCount, setGenCount] = useState(5);
  const [genQuality, setGenQuality] = useState('mix');
  const [genLogs, setGenLogs] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Engage Blaster States
  const [engageTemplate, setEngageTemplate] = useState('welcome');
  const [engageSegment, setEngageSegment] = useState('GOOD_LEAD_FOLLOW_UP');
  const [engageLogs, setEngageLogs] = useState<string[]>([]);
  const [isEngaging, setIsEngaging] = useState(false);
  const [engageProgress, setEngageProgress] = useState(0);

  // Team Manager States
  const [agents, setAgents] = useState([
    { id: 1, name: 'Rahul Sharma', email: 'rahul@groweasy.ai', role: 'Sales Team Lead', assigned: 42, status: 'Active' },
    { id: 2, name: 'Anjali Nair', email: 'anjali@groweasy.ai', role: 'Relationship Manager', assigned: 35, status: 'Active' },
    { id: 3, name: 'Sonia Mishra', email: 'sonia@groweasy.ai', role: 'Sales Executive', assigned: 28, status: 'Away' }
  ]);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentEmail, setNewAgentEmail] = useState('');
  const [newAgentRole, setNewAgentRole] = useState('Sales Executive');
  const [roundRobinEnabled, setRoundRobinEnabled] = useState(true);

  // Ad Accounts Connect States
  const [adsMetaConnected, setAdsMetaConnected] = useState(true);
  const [adsGoogleConnected, setAdsGoogleConnected] = useState(false);
  const [adsLinkedInConnected, setAdsLinkedInConnected] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState<string | null>(null);
  const [isConnectingAd, setIsConnectingAd] = useState(false);

  // WhatsApp Config States
  const [waPhoneId, setWaPhoneId] = useState('1092837482937');
  const [waToken, setWaToken] = useState('EAAGzDkZBz123BABcdEFghijKlmno...');
  const [waWabaId, setWaWabaId] = useState('908123746234');
  const [waStatus, setWaStatus] = useState<'connected' | 'checking' | 'disconnected'>('connected');
  const [waPingResult, setWaPingResult] = useState<string | null>(null);

  // Tele Calling States
  const [dialerNumber, setDialerNumber] = useState('');
  const [dialerState, setDialerState] = useState<'idle' | 'calling' | 'connected'>('idle');
  const [dialerTimer, setDialerTimer] = useState(0);
  const [teleLogs, setTeleLogs] = useState([
    { lead: 'Suresh Kumar', phone: '+91 9552284142', duration: '2m 15s', time: '10 mins ago', status: 'Answered' },
    { lead: 'Anjali Nair', phone: '+91 9605918115', duration: '0m 45s', time: '1 hour ago', status: 'Answered' },
    { lead: 'Vijay Patel', phone: '+91 9907320073', duration: '1m 20s', time: '3 hours ago', status: 'Answered' }
  ]);
  const [recordingPlaying, setRecordingPlaying] = useState<number | null>(null);

  // Custom CRM Fields States
  const [customCrmFields, setCustomCrmFields] = useState<Array<{ name: string; label: string; type: string; desc: string }>>([
    { name: 'property_budget', label: 'Budget Requirement', type: 'Number', desc: 'Max budget limit of the buyer in INR' },
    { name: 'preferred_location', label: 'Preferred Location', type: 'String', desc: 'Specific micro-market location preference' }
  ]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('String');
  const [newFieldDesc, setNewFieldDesc] = useState('');

  // API Developer States
  const [developerApiKey, setDeveloperApiKey] = useState('groweasy_live_pk_8a9d12d4809bc48d');
  const [webhookUrl, setWebhookUrl] = useState('https://crm.groweasy.ai/webhooks/meta-leads');
  const [apiDocTab, setApiDocTab] = useState<'curl' | 'node' | 'python'>('curl');

  // Business Center States
  const [businessName, setBusinessName] = useState('GrowEasy Property Developers Ltd');
  const [businessPlan, setBusinessPlan] = useState('Enterprise Pro Tier');

  // Lead Generation Simulator Function
  const handleIngestSimulatedLeads = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenLogs(["Initializing Campaign connection...", `Connecting to channel: ${genCampaign}...`]);

    try {
      const response = await fetch(`${API_URL}/api/leads/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign: genCampaign,
          count: genCount,
          quality: genQuality
        })
      });

      if (!response.ok) throw new Error("Simulator failed to generate leads.");

      const result = await response.json();
      if (result.success && result.records) {
        setLeads(prev => {
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

        setGenLogs(prev => [
          ...prev,
          "Connection established.",
          `Attribution check complete. Found ${result.records.length} new unique leads.`,
          ...result.records.map((r: any) => `✓ Ingested: ${r.name} (${r.email || r.mobile_without_country_code}) -> Mapped to CRM`),
          `🎉 SUCCESS! Simulated ingestion complete. ${result.records.length} leads added to database.`
        ]);
      } else {
        throw new Error("No records generated.");
      }
    } catch (err: any) {
      setGenLogs(prev => [...prev, `❌ ERROR: ${err.message || 'Simulator failed.'}`]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Message Blaster Campaign Simulator
  const handleTriggerMessageBlast = () => {
    if (isEngaging) return;
    setIsEngaging(true);
    setEngageProgress(10);
    
    const targets = leads.filter(l => l.crm_status === engageSegment);
    
    if (targets.length === 0) {
      setEngageLogs([`No leads found in CRM segment: ${engageSegment}. Import or generate leads first!`]);
      setIsEngaging(false);
      return;
    }

    setEngageLogs([`Initializing Blast Campaign using template: "${engageTemplate}"...`, `Found ${targets.length} target leads in segment.`]);

    let idx = 0;
    const interval = setInterval(() => {
      if (idx >= targets.length) {
        clearInterval(interval);
        setEngageProgress(100);
        setEngageLogs(prev => [...prev, `🎉 Campaign blast completed! Sent ${targets.length} notifications.`]);
        setIsEngaging(false);
        return;
      }

      const lead = targets[idx];
      setEngageLogs(prev => [
        ...prev,
        `📲 Sending message to ${lead.name} (${lead.mobile_without_country_code || lead.email}) ... SUCCESS`
      ]);
      setEngageProgress(Math.min(90, Math.round(((idx + 1) / targets.length) * 100)));
      idx++;
    }, 600);
  };

  // Dialer Functions
  const handleDialNumber = (num: string) => {
    setDialerNumber(prev => prev + num);
  };

  const handleStartCall = (phoneNum?: string) => {
    const targetPhone = phoneNum || dialerNumber;
    if (!targetPhone.trim()) return;

    setDialerState('calling');
    setDialerNumber(targetPhone);
    setDialerTimer(0);

    const callTimer = setInterval(() => {
      setDialerTimer(prev => prev + 1);
    }, 1000);

    setTimeout(() => {
      setDialerState('connected');
    }, 2000);

    (window as any)._dialerTimerRef = callTimer;
  };

  const handleHangUp = () => {
    if ((window as any)._dialerTimerRef) {
      clearInterval((window as any)._dialerTimerRef);
      delete (window as any)._dialerTimerRef;
    }
    
    if (dialerState === 'connected' || dialerState === 'calling') {
      const minutes = Math.floor(dialerTimer / 60);
      const seconds = dialerTimer % 60;
      const durationStr = `${minutes}m ${seconds}s`;
      
      setTeleLogs(prev => [
        {
          lead: leads.find(l => l.mobile_without_country_code === dialerNumber || l.email === dialerNumber)?.name || 'Unknown Buyer',
          phone: dialerNumber,
          duration: durationStr,
          time: 'Just now',
          status: dialerState === 'connected' ? 'Answered' : 'No Answer'
        },
        ...prev
      ]);
    }

    setDialerState('idle');
    setDialerNumber('');
    setDialerTimer(0);
  };

  // WhatsApp Ping Test
  const handleTestWhatsAppPing = () => {
    setWaStatus('checking');
    setWaPingResult(null);

    setTimeout(() => {
      setWaStatus('connected');
      setWaPingResult("WhatsApp Cloud API status: ONLINE (Latency: 38ms) - Connection Verified.");
    }, 1500);
  };

  // Connect Ad Account
  const handleSimulateAdConnection = (platform: string) => {
    setShowConnectModal(platform);
    setIsConnectingAd(true);

    setTimeout(() => {
      if (platform === 'google') setAdsGoogleConnected(true);
      else if (platform === 'linkedin') setAdsLinkedInConnected(true);
      setIsConnectingAd(false);
      setShowConnectModal(null);
    }, 2000);
  };

  // Custom CRM Fields
  const handleAddCustomCrmField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim() || !newFieldLabel.trim()) return;

    setCustomCrmFields(prev => [
      ...prev,
      {
        name: newFieldName.toLowerCase().replace(/\s+/g, '_'),
        label: newFieldLabel,
        type: newFieldType,
        desc: newFieldDesc
      }
    ]);

    setNewFieldName('');
    setNewFieldLabel('');
    setNewFieldDesc('');
  };

  // Add Sales Agent
  const handleAddAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim() || !newAgentEmail.trim()) return;

    setAgents(prev => [
      ...prev,
      {
        id: prev.length + 1,
        name: newAgentName,
        email: newAgentEmail,
        role: newAgentRole,
        assigned: 0,
        status: 'Active'
      }
    ]);

    setNewAgentName('');
    setNewAgentEmail('');
  };

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

  // Analytics Dashboard Calculations
  const totalLeads = leads.length;
  const saleDoneCount = leads.filter(l => l.crm_status === 'SALE_DONE').length;
  const goodFollowUpCount = leads.filter(l => l.crm_status === 'GOOD_LEAD_FOLLOW_UP').length;
  const didNotConnectCount = leads.filter(l => l.crm_status === 'DID_NOT_CONNECT').length;
  const badLeadCount = leads.filter(l => l.crm_status === 'BAD_LEAD').length;

  const conversionRate = totalLeads ? Math.round((saleDoneCount / totalLeads) * 100) : 0;
  const goodLeadsRate = totalLeads ? Math.round((goodFollowUpCount / totalLeads) * 100) : 0;
  const badLeadsRate = totalLeads ? Math.round((badLeadCount / totalLeads) * 100) : 0;

  // Source attribution counts
  const sourceAttribution = leads.reduce((acc: { [key: string]: number }, lead) => {
    const src = lead.data_source || 'Unknown';
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {});

  // Sorting sources to show top campaign sources
  const sortedSources = Object.entries(sourceAttribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Contact health calculations
  const bothContact = leads.filter(l => l.email && l.mobile_without_country_code).length;
  const emailOnly = leads.filter(l => l.email && !l.mobile_without_country_code).length;
  const phoneOnly = leads.filter(l => !l.email && l.mobile_without_country_code).length;
  const contactIntegrity = {
    both: totalLeads ? Math.round((bothContact / totalLeads) * 100) : 0,
    emailOnly: totalLeads ? Math.round((emailOnly / totalLeads) * 100) : 0,
    phoneOnly: totalLeads ? Math.round((phoneOnly / totalLeads) * 100) : 0,
  };

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
            <div 
              className={`sidebar-link ${activeTab === 'sources' ? 'active' : ''}`} 
              onClick={() => setActiveTab('sources')}
            >
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </div>
            <div 
              className={`sidebar-link ${activeTab === 'analytics' ? 'active' : ''}`} 
              onClick={() => setActiveTab('analytics')}
            >
              <TrendingUp size={16} />
              <span>Analytics</span>
            </div>
            <div 
              className={`sidebar-link ${activeTab === 'generate' ? 'active' : ''}`}
              onClick={() => setActiveTab('generate')}
            >
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
            <div 
              className={`sidebar-link ${activeTab === 'engage' ? 'active' : ''}`}
              onClick={() => setActiveTab('engage')}
            >
              <Briefcase size={16} />
              <span>Engage Leads</span>
            </div>
          </nav>

          <div className="sidebar-section-title">Control Center</div>
          <nav className="sidebar-nav">
            <div 
              className={`sidebar-link ${activeTab === 'team' ? 'active' : ''}`}
              onClick={() => setActiveTab('team')}
            >
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
            <div 
              className={`sidebar-link ${activeTab === 'ads' ? 'active' : ''}`}
              onClick={() => setActiveTab('ads')}
            >
              <LayoutDashboard size={16} />
              <span>Ad Accounts</span>
            </div>
            <div 
              className={`sidebar-link ${activeTab === 'whatsapp' ? 'active' : ''}`}
              onClick={() => setActiveTab('whatsapp')}
            >
              <Radio size={16} />
              <span>WhatsApp Account</span>
            </div>
            <div 
              className={`sidebar-link ${activeTab === 'telecalling' ? 'active' : ''}`}
              onClick={() => setActiveTab('telecalling')}
            >
              <Users size={16} />
              <span>Tele Calling</span>
            </div>
            <div 
              className={`sidebar-link ${activeTab === 'crmfields' ? 'active' : ''}`}
              onClick={() => setActiveTab('crmfields')}
            >
              <Briefcase size={16} />
              <span>CRM Fields</span>
            </div>
            <div 
              className={`sidebar-link ${activeTab === 'apicenter' ? 'active' : ''}`}
              onClick={() => setActiveTab('apicenter')}
            >
              <Server size={16} />
              <span>API Center</span>
            </div>
          </nav>

        </div>

        <div className="sidebar-footer">
          <div 
            className={`sidebar-link ${activeTab === 'business' ? 'active' : ''}`}
            onClick={() => setActiveTab('business')}
          >
            <Briefcase size={16} />
            <span>Business Center</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-viewport animate-slide-up">
        
        {/* VIEW 0: ANALYTICS DASHBOARD */}
        {activeTab === 'analytics' && (
          <div>
            <div className="view-header" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div>
                  <h2 className="view-title">Dashboard Overview</h2>
                  <p className="view-subtitle">Real-time pipeline analytics, lead conversion metrics, and acquisition health.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => setIsModalOpen(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                  >
                    <UploadCloud size={14} />
                    Import CSV Leads
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    onClick={fetchLeads} 
                    disabled={isRefreshing}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  >
                    <RefreshCw size={14} className={isRefreshing ? 'animate-spin-one' : ''} />
                    Refresh Stats
                  </button>
                </div>
              </div>
            </div>

            {/* Aggregated Stats Cards */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div className="stat-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '4px solid var(--primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total CRM Pipeline</span>
                  <Users size={18} style={{ color: 'var(--primary)' }} />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{totalLeads}</div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Leads imported into local db</span>
              </div>

              <div className="stat-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '4px solid var(--success)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deal Conversion Rate</span>
                  <TrendingUp size={18} style={{ color: 'var(--success)' }} />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--success)' }}>{conversionRate}%</div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{saleDoneCount} leads won & closed</span>
              </div>

              <div className="stat-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '4px solid var(--info)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Good Leads Ratio</span>
                  <Activity size={18} style={{ color: 'var(--info)' }} />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--info)' }}>{goodLeadsRate}%</div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{goodFollowUpCount} active warm/follow-ups</span>
              </div>

              <div className="stat-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '4px solid var(--error)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bad Lead Rate</span>
                  <AlertCircle size={18} style={{ color: 'var(--error)' }} />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--error)' }}>{badLeadsRate}%</div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{badLeadCount} junk or spam leads</span>
              </div>
            </div>

            {/* Analytics Grid */}
            <div className="analytics-grid">
              
              {/* Card 1: Pipeline Stage Breakdown */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">
                  <Activity size={16} style={{ color: 'var(--primary)' }} />
                  Pipeline Stage Breakdown
                </h3>
                <div className="analytics-chart-container">
                  <div className="chart-row">
                    <div className="chart-header">
                      <div className="chart-label">
                        <div className="chart-bullet" style={{ background: 'var(--success)' }}></div>
                        <span>Deals Won (SALE_DONE)</span>
                      </div>
                      <span className="chart-value">{saleDoneCount} ({totalLeads ? Math.round((saleDoneCount/totalLeads)*100) : 0}%)</span>
                    </div>
                    <div className="chart-bar-wrapper">
                      <div className="chart-bar-fill" style={{ width: `${totalLeads ? (saleDoneCount/totalLeads)*100 : 0}%`, background: 'var(--success)' }}></div>
                    </div>
                  </div>

                  <div className="chart-row">
                    <div className="chart-header">
                      <div className="chart-label">
                        <div className="chart-bullet" style={{ background: 'var(--primary)' }}></div>
                        <span>Good Lead Follow Up</span>
                      </div>
                      <span className="chart-value">{goodFollowUpCount} ({totalLeads ? Math.round((goodFollowUpCount/totalLeads)*100) : 0}%)</span>
                    </div>
                    <div className="chart-bar-wrapper">
                      <div className="chart-bar-fill" style={{ width: `${totalLeads ? (goodFollowUpCount/totalLeads)*100 : 0}%`, background: 'var(--primary)' }}></div>
                    </div>
                  </div>

                  <div className="chart-row">
                    <div className="chart-header">
                      <div className="chart-label">
                        <div className="chart-bullet" style={{ background: 'var(--info)' }}></div>
                        <span>Did Not Connect</span>
                      </div>
                      <span className="chart-value">{didNotConnectCount} ({totalLeads ? Math.round((didNotConnectCount/totalLeads)*100) : 0}%)</span>
                    </div>
                    <div className="chart-bar-wrapper">
                      <div className="chart-bar-fill" style={{ width: `${totalLeads ? (didNotConnectCount/totalLeads)*100 : 0}%`, background: 'var(--info)' }}></div>
                    </div>
                  </div>

                  <div className="chart-row">
                    <div className="chart-header">
                      <div className="chart-label">
                        <div className="chart-bullet" style={{ background: 'var(--error)' }}></div>
                        <span>Bad Lead (Junk/Uninterested)</span>
                      </div>
                      <span className="chart-value">{badLeadCount} ({totalLeads ? Math.round((badLeadCount/totalLeads)*100) : 0}%)</span>
                    </div>
                    <div className="chart-bar-wrapper">
                      <div className="chart-bar-fill" style={{ width: `${totalLeads ? (badLeadCount/totalLeads)*100 : 0}%`, background: 'var(--error)' }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Campaign Channel Attribution */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">
                  <Database size={16} style={{ color: 'var(--primary)' }} />
                  Campaign Channel Attribution
                </h3>
                <div className="analytics-chart-container">
                  {totalLeads === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      No campaign data available. Import leads to view.
                    </div>
                  ) : (
                    sortedSources.map(([source, count], idx) => {
                      const colors = ['#f08561', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];
                      const color = colors[idx % colors.length];
                      const percent = Math.round((count / totalLeads) * 100);
                      return (
                        <div className="chart-row" key={source}>
                          <div className="chart-header">
                            <div className="chart-label">
                              <div className="chart-bullet" style={{ background: color }}></div>
                              <span>{source === 'leads_on_demand' ? 'Leads On Demand' : source === 'meridian_tower' ? 'Meridian Tower' : source === 'eden_park' ? 'Eden Park' : source === 'varah_swamy' ? 'Varah Swamy' : source === 'sarjapur_plots' ? 'Sarjapur Plots' : source}</span>
                            </div>
                            <span className="chart-value">{count} ({percent}%)</span>
                          </div>
                          <div className="chart-bar-wrapper">
                            <div className="chart-bar-fill" style={{ width: `${percent}%`, background: color }}></div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Card 3: Lead Contact Health Integrity */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">
                  <CheckCircle size={16} style={{ color: 'var(--primary)' }} />
                  Contact Integrity Rating
                </h3>
                <div className="analytics-chart-container">
                  <div className="chart-row">
                    <div className="chart-header">
                      <div className="chart-label">
                        <div className="chart-bullet" style={{ background: '#10b981' }}></div>
                        <span>Complete Contact (Both Email & Mobile)</span>
                      </div>
                      <span className="chart-value">{bothContact} ({contactIntegrity.both}%)</span>
                    </div>
                    <div className="chart-bar-wrapper">
                      <div className="chart-bar-fill" style={{ width: `${contactIntegrity.both}%`, background: '#10b981' }}></div>
                    </div>
                  </div>

                  <div className="chart-row">
                    <div className="chart-header">
                      <div className="chart-label">
                        <div className="chart-bullet" style={{ background: '#3b82f6' }}></div>
                        <span>Email Address Only</span>
                      </div>
                      <span className="chart-value">{emailOnly} ({contactIntegrity.emailOnly}%)</span>
                    </div>
                    <div className="chart-bar-wrapper">
                      <div className="chart-bar-fill" style={{ width: `${contactIntegrity.emailOnly}%`, background: '#3b82f6' }}></div>
                    </div>
                  </div>

                  <div className="chart-row">
                    <div className="chart-header">
                      <div className="chart-label">
                        <div className="chart-bullet" style={{ background: '#f59e0b' }}></div>
                        <span>Mobile Number Only</span>
                      </div>
                      <span className="chart-value">{phoneOnly} ({contactIntegrity.phoneOnly}%)</span>
                    </div>
                    <div className="chart-bar-wrapper">
                      <div className="chart-bar-fill" style={{ width: `${contactIntegrity.phoneOnly}%`, background: '#f59e0b' }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 4: Recent Pipelines Activity */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">
                  <FileText size={16} style={{ color: 'var(--primary)' }} />
                  Recent Lead Additions
                </h3>
                <div className="activity-list">
                  {leads.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      No recent lead activity.
                    </div>
                  ) : (
                    leads.slice(0, 5).map((lead, idx) => {
                      const statusColors = {
                        GOOD_LEAD_FOLLOW_UP: 'var(--status-good-bg)',
                        SALE_DONE: 'var(--status-sale-bg)',
                        DID_NOT_CONNECT: 'var(--status-not-dialed-bg)',
                        BAD_LEAD: 'var(--status-bad-bg)'
                      };
                      const textColors = {
                        GOOD_LEAD_FOLLOW_UP: 'var(--status-good-text)',
                        SALE_DONE: 'var(--status-sale-text)',
                        DID_NOT_CONNECT: 'var(--status-not-dialed-text)',
                        BAD_LEAD: 'var(--status-bad-text)'
                      };
                      const statusLabel = {
                        GOOD_LEAD_FOLLOW_UP: 'Follow Up',
                        SALE_DONE: 'Deal Closed',
                        DID_NOT_CONNECT: 'No Answer',
                        BAD_LEAD: 'Bad Lead'
                      };

                      return (
                        <div className="activity-item" key={idx}>
                          <div className="activity-info">
                            <span className="activity-name">{lead.name}</span>
                            <span className="activity-meta">
                              {lead.email || 'No Email'} • {lead.mobile_without_country_code ? `${lead.country_code || '+91'} ${lead.mobile_without_country_code}` : 'No Phone'}
                            </span>
                          </div>
                          <div className="activity-badge-row">
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', background: 'var(--border-color)', padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-sm)', fontWeight: 500 }}>
                              {lead.data_source || 'Import'}
                            </span>
                            <span 
                              className="activity-status-badge"
                              style={{ 
                                background: statusColors[lead.crm_status as keyof typeof statusColors] || 'var(--border-color)',
                                color: textColors[lead.crm_status as keyof typeof textColors] || 'var(--text-primary)'
                              }}
                            >
                              {statusLabel[lead.crm_status as keyof typeof statusLabel] || lead.crm_status}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

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

        {/* VIEW 3: GENERATE LEADS SIMULATOR */}
        {activeTab === 'generate' && (
          <div className="animate-fade-in">
            <div className="view-header" style={{ marginBottom: '1.5rem' }}>
              <h2 className="view-title">Lead Ingestion Simulator</h2>
              <p className="view-subtitle">Simulate real-time inbound webhooks from Facebook Lead Ads, Google Form fills, and campaigns.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {/* Generator Settings Card */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">
                  <Radio size={16} style={{ color: 'var(--primary)' }} />
                  Configure Simulated Campaign
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Attribution Data Source</label>
                    <select 
                      value={genCampaign} 
                      onChange={(e) => setGenCampaign(e.target.value)}
                      style={{ padding: '0.55rem', fontSize: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="leads_on_demand">Leads On Demand (Default Campaign)</option>
                      <option value="meridian_tower">Meridian Tower (Real Estate Launch)</option>
                      <option value="eden_park">Eden Park (Villa Plots)</option>
                      <option value="varah_swamy">Varah Swamy Apartments</option>
                      <option value="sarjapur_plots">Sarjapur Road Plots</option>
                      <option value="facebook_ads">Facebook Lead Form Ad</option>
                      <option value="google_ads">Google PPC Search Form</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Number of Leads to Generate</label>
                    <select 
                      value={genCount} 
                      onChange={(e) => setGenCount(parseInt(e.target.value))}
                      style={{ padding: '0.55rem', fontSize: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="1">1 Lead</option>
                      <option value="5">5 Leads</option>
                      <option value="10">10 Leads</option>
                      <option value="20">20 Leads</option>
                      <option value="50">50 Leads (Large Batch)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Lead Interest Profile (Quality)</label>
                    <select 
                      value={genQuality} 
                      onChange={(e) => setGenQuality(e.target.value)}
                      style={{ padding: '0.55rem', fontSize: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="mix">Balanced Mix (Interested, Call Back, Junk)</option>
                      <option value="mostly_interested">High Quality (Mostly interested & closed sales)</option>
                      <option value="mostly_junk">Low Quality (Mostly incorrect contact details & bad status)</option>
                    </select>
                  </div>

                  <button 
                    className="btn btn-primary" 
                    onClick={handleIngestSimulatedLeads}
                    disabled={isGenerating}
                    style={{ marginTop: '0.5rem', width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    {isGenerating ? <Loader2 size={16} className="animate-spin-one" /> : <Radio size={16} />}
                    Trigger Simulated Ingestion
                  </button>
                </div>
              </div>

              {/* Console Log output */}
              <div className="analytics-card" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
                <h3 className="analytics-card-title" style={{ color: '#94a3b8', borderBottomColor: '#1e293b' }}>
                  <Server size={16} style={{ color: '#38bdf8' }} />
                  Simulator Ingestion Log Console
                </h3>
                <div style={{ flexGrow: 1, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#38bdf8', overflowY: 'auto', maxHeight: '280px', display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.5rem' }}>
                  {genLogs.length === 0 ? (
                    <span style={{ color: '#64748b' }}>// Configure campaign options and click trigger to see log output...</span>
                  ) : (
                    genLogs.map((log, idx) => (
                      <div key={idx} style={{ lineHeight: '1.4', color: log.startsWith('✓') ? '#4ade80' : log.startsWith('🎉') ? '#a7f3d0' : log.startsWith('❌') ? '#f87171' : '#38bdf8' }}>{log}</div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: ENGAGE LEADS (Template message blasting) */}
        {activeTab === 'engage' && (
          <div className="animate-fade-in">
            <div className="view-header" style={{ marginBottom: '1.5rem' }}>
              <h2 className="view-title">Outreach Message Blaster</h2>
              <p className="view-subtitle">Bulk dispatch verified WhatsApp Business and email marketing templates to lead segments.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {/* Campaign Configurations */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">
                  <Briefcase size={16} style={{ color: 'var(--primary)' }} />
                  Trigger Template Campaign
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Select Message Template</label>
                    <select 
                      value={engageTemplate} 
                      onChange={(e) => setEngageTemplate(e.target.value)}
                      style={{ padding: '0.55rem', fontSize: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="welcome">Standard Welcome Follow-up (WhatsApp + Email)</option>
                      <option value="discount">Launch Discount Promo: 5% Off Flats (WhatsApp)</option>
                      <option value="reverify">Contact Verification Request: Re-verify phone (Email)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Target Lead Segment</label>
                    <select 
                      value={engageSegment} 
                      onChange={(e) => setEngageSegment(e.target.value)}
                      style={{ padding: '0.55rem', fontSize: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="GOOD_LEAD_FOLLOW_UP">Good Leads / Active Follow-ups</option>
                      <option value="DID_NOT_CONNECT">Not Dialed / No Answer</option>
                      <option value="BAD_LEAD">Bad Leads / Junk</option>
                      <option value="SALE_DONE">Deal Won / Closed Sales</option>
                    </select>
                  </div>

                  {isEngaging && (
                    <div style={{ marginTop: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        <span>Blasting templates in progress...</span>
                        <span>{engageProgress}%</span>
                      </div>
                      <div className="progress-track" style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div className="progress-bar" style={{ height: '100%', width: `${engageProgress}%`, background: 'var(--primary)', transition: 'width 0.3s ease' }}></div>
                      </div>
                    </div>
                  )}

                  <button 
                    className="btn btn-primary" 
                    onClick={handleTriggerMessageBlast}
                    disabled={isEngaging || leads.length === 0}
                    style={{ marginTop: '0.5rem', width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    {isEngaging ? <Loader2 size={16} className="animate-spin-one" /> : <Briefcase size={16} />}
                    Dispatch Campaign Blast
                  </button>
                </div>
              </div>

              {/* Execution console output */}
              <div className="analytics-card" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
                <h3 className="analytics-card-title" style={{ color: '#94a3b8', borderBottomColor: '#1e293b' }}>
                  <Server size={16} style={{ color: '#a7f3d0' }} />
                  Message dispatch execution log
                </h3>
                <div style={{ flexGrow: 1, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#a7f3d0', overflowY: 'auto', maxHeight: '280px', display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.5rem' }}>
                  {engageLogs.length === 0 ? (
                    <span style={{ color: '#64748b' }}>// Blast campaign output logs show here...</span>
                  ) : (
                    engageLogs.map((log, idx) => (
                      <div key={idx} style={{ lineHeight: '1.4', color: log.startsWith('🎉') ? '#4ade80' : log.startsWith('❌') ? '#f87171' : '#a7f3d0' }}>{log}</div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 5: TEAM MEMBERS */}
        {activeTab === 'team' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="view-header">
              <h2 className="view-title">Team Management</h2>
              <p className="view-subtitle">Manage CRM sales agents and configure Round-Robin lead routing filters.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '1.5rem' }}>
              {/* Active Agents list */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">
                  <Users size={16} style={{ color: 'var(--primary)' }} />
                  Active Sales Team Representatives
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {agents.map((agent) => (
                    <div 
                      key={agent.id} 
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-main)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-full)', background: 'var(--primary)', color: 'var(--primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                          {agent.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{agent.name}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{agent.email} • {agent.role}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{agent.assigned}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>leads assigned</span>
                        </div>
                        <span 
                          style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-sm)', fontWeight: 600, background: agent.status === 'Active' ? 'var(--status-good-bg)' : 'var(--status-not-dialed-bg)', color: agent.status === 'Active' ? 'var(--status-good-text)' : 'var(--status-not-dialed-text)' }}
                        >
                          {agent.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Assignment settings & Add member */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Add agent form */}
                <div className="analytics-card">
                  <h3 className="analytics-card-title">Add Team Representative</h3>
                  <form onSubmit={handleAddAgent} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Agent Name</label>
                      <input 
                        type="text" 
                        value={newAgentName} 
                        onChange={(e) => setNewAgentName(e.target.value)} 
                        placeholder="John Doe"
                        required
                        style={{ padding: '0.45rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Agent Email</label>
                      <input 
                        type="email" 
                        value={newAgentEmail} 
                        onChange={(e) => setNewAgentEmail(e.target.value)} 
                        placeholder="john@groweasy.ai"
                        required
                        style={{ padding: '0.45rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Role</label>
                      <select 
                        value={newAgentRole} 
                        onChange={(e) => setNewAgentRole(e.target.value)}
                        style={{ padding: '0.45rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)', cursor: 'pointer' }}
                      >
                        <option value="Sales Executive">Sales Executive</option>
                        <option value="Relationship Manager">Relationship Manager</option>
                        <option value="Support Agent">Support Agent</option>
                      </select>
                    </div>
                    <button className="btn btn-primary" type="submit" style={{ padding: '0.55rem', fontSize: '0.75rem', marginTop: '0.25rem' }}>Add Representative</button>
                  </form>
                </div>

                {/* Auto assignment logic */}
                <div className="analytics-card">
                  <h3 className="analytics-card-title">Routing Config</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Auto-assignment Router</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Round-Robin lead allocations on new imports</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={roundRobinEnabled} 
                      onChange={(e) => setRoundRobinEnabled(e.target.checked)} 
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 6: AD ACCOUNTS */}
        {activeTab === 'ads' && (
          <div className="animate-fade-in">
            <div className="view-header" style={{ marginBottom: '1.5rem' }}>
              <h2 className="view-title">Ad Platforms Integration</h2>
              <p className="view-subtitle">Connect CRM pipelines directly to Meta Lead Ads, Google Search Forms, and external web forms.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
              {/* Meta Card */}
              <div className="analytics-card" style={{ border: adsMetaConnected ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border-color)', background: adsMetaConnected ? 'rgba(16,185,129,0.01)' : 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Meta Ads Integration (Facebook & Instagram)</div>
                  <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-full)', fontWeight: 600, background: adsMetaConnected ? 'var(--status-good-bg)' : 'var(--status-bad-bg)', color: adsMetaConnected ? 'var(--status-good-text)' : 'var(--status-bad-text)' }}>
                    {adsMetaConnected ? 'CONNECTED' : 'NOT CONNECTED'}
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                  Sync lead forms built inside Meta Forms Manager directly into the CRM database using real-time Webhook hooks.
                </p>
                <div style={{ marginTop: 'auto' }}>
                  <button 
                    className={`btn ${adsMetaConnected ? 'btn-secondary' : 'btn-primary'}`} 
                    style={{ width: '100%', padding: '0.55rem', fontSize: '0.75rem' }}
                    onClick={() => adsMetaConnected ? setAdsMetaConnected(false) : setAdsMetaConnected(true)}
                  >
                    {adsMetaConnected ? 'Disconnect Integration' : 'Connect Facebook Ads'}
                  </button>
                </div>
              </div>

              {/* Google Ads Card */}
              <div className="analytics-card" style={{ border: adsGoogleConnected ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border-color)', background: adsGoogleConnected ? 'rgba(16,185,129,0.01)' : 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Google Search Form Ads</div>
                  <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-full)', fontWeight: 600, background: adsGoogleConnected ? 'var(--status-good-bg)' : 'var(--status-bad-bg)', color: adsGoogleConnected ? 'var(--status-good-text)' : 'var(--status-bad-text)' }}>
                    {adsGoogleConnected ? 'CONNECTED' : 'NOT CONNECTED'}
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                  Automatically maps Google Search ad extension lead submissions into unified CRM schemas.
                </p>
                <div style={{ marginTop: 'auto' }}>
                  <button 
                    className={`btn ${adsGoogleConnected ? 'btn-secondary' : 'btn-primary'}`} 
                    style={{ width: '100%', padding: '0.55rem', fontSize: '0.75rem' }}
                    onClick={() => adsGoogleConnected ? setAdsGoogleConnected(false) : handleSimulateAdConnection('google')}
                  >
                    {adsGoogleConnected ? 'Disconnect Integration' : 'Connect Google Ads'}
                  </button>
                </div>
              </div>

              {/* LinkedIn Ads Card */}
              <div className="analytics-card" style={{ border: adsLinkedInConnected ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border-color)', background: adsLinkedInConnected ? 'rgba(16,185,129,0.01)' : 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>LinkedIn Gen Forms</div>
                  <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-full)', fontWeight: 600, background: adsLinkedInConnected ? 'var(--status-good-bg)' : 'var(--status-bad-bg)', color: adsLinkedInConnected ? 'var(--status-good-text)' : 'var(--status-bad-text)' }}>
                    {adsLinkedInConnected ? 'CONNECTED' : 'NOT CONNECTED'}
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                  Sync B2B leads generated from LinkedIn sponsored posts and campaign forms.
                </p>
                <div style={{ marginTop: 'auto' }}>
                  <button 
                    className={`btn ${adsLinkedInConnected ? 'btn-secondary' : 'btn-primary'}`} 
                    style={{ width: '100%', padding: '0.55rem', fontSize: '0.75rem' }}
                    onClick={() => adsLinkedInConnected ? setAdsLinkedInConnected(false) : handleSimulateAdConnection('linkedin')}
                  >
                    {adsLinkedInConnected ? 'Disconnect Integration' : 'Connect LinkedIn Forms'}
                  </button>
                </div>
              </div>
            </div>

            {/* Simulated Connect OAuth Modal */}
            {showConnectModal && (
              <div className="modal-overlay" style={{ zIndex: 1000 }}>
                <div className="modal-container" style={{ maxWidth: '380px', textAlign: 'center', padding: '2rem' }}>
                  <Loader2 size={36} className="animate-spin-one" style={{ color: 'var(--primary)', marginBottom: '1rem', margin: '0 auto' }} />
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.25rem' }}>Simulating {showConnectModal === 'google' ? 'Google' : 'LinkedIn'} OAuth Verification</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Syncing APIs credentials and verifying callbacks...</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 7: WHATSAPP ACCOUNT */}
        {activeTab === 'whatsapp' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="view-header">
              <h2 className="view-title">WhatsApp Business Cloud API</h2>
              <p className="view-subtitle">Connect your Meta WhatsApp Business API tokens to trigger automated notifications on new lead sign-ups.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }}>
              {/* Credentials Configuration */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">WhatsApp Cloud API Config</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>WhatsApp Phone Number ID</label>
                    <input 
                      type="text" 
                      value={waPhoneId} 
                      onChange={(e) => setWaPhoneId(e.target.value)} 
                      style={{ padding: '0.5rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>WhatsApp Business Account ID</label>
                    <input 
                      type="text" 
                      value={waWabaId} 
                      onChange={(e) => setWaWabaId(e.target.value)} 
                      style={{ padding: '0.5rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Cloud API Token</label>
                    <input 
                      type="password" 
                      value={waToken} 
                      onChange={(e) => setWaToken(e.target.value)} 
                      style={{ padding: '0.5rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleTestWhatsAppPing}
                    disabled={waStatus === 'checking'}
                    style={{ padding: '0.6rem', fontSize: '0.75rem', marginTop: '0.25rem' }}
                  >
                    {waStatus === 'checking' ? 'Testing Connection...' : 'Save & Test API Connection'}
                  </button>
                </div>
              </div>

              {/* Status and Verification Panel */}
              <div className="analytics-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 className="analytics-card-title">Integration Status</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: 'var(--radius-full)', background: waStatus === 'connected' ? 'var(--success)' : waStatus === 'checking' ? 'var(--warning)' : 'var(--error)' }}></div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>{waStatus === 'connected' ? 'Verified' : waStatus === 'checking' ? 'Pinging API...' : 'Disconnected'}</span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Verifies configuration pings directly with the Meta Developer API nodes. Enabled notifications dispatch automatically when lead criteria are satisfied.
                </p>
                {waPingResult && (
                  <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--success-text)' }}>
                    {waPingResult}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 8: TELE CALLING OUTBOUND DIALER */}
        {activeTab === 'telecalling' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="view-header">
              <h2 className="view-title">Outbound Dialer & Call Logs</h2>
              <p className="view-subtitle">Simulate client calling dialers, outbound logs, and call recording files.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
              {/* Column 1: Outbound Keypad */}
              <div className="analytics-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 className="analytics-card-title">
                  <Users size={16} style={{ color: 'var(--primary)' }} />
                  Interactive Outbound Dialer
                </h3>
                
                {/* Dialer Screen Display */}
                <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.05em' }}>{dialerNumber || '(Enter Phone Number)'}</div>
                  {dialerState !== 'idle' && (
                    <div style={{ fontSize: '0.7rem', color: dialerState === 'calling' ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
                      {dialerState === 'calling' ? 'Pinging connection...' : `CONNECTED (Call Duration: ${Math.floor(dialerTimer/60)}m ${dialerTimer%60}s)`}
                    </div>
                  )}
                </div>

                {/* Keypad Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', width: '220px', margin: '0 auto' }}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                    <button 
                      key={digit} 
                      className="btn btn-secondary" 
                      onClick={() => handleDialNumber(digit)} 
                      disabled={dialerState !== 'idle'}
                      style={{ height: '40px', padding: 0, fontSize: '1rem', fontWeight: 700, borderRadius: 'var(--radius-full)' }}
                    >
                      {digit}
                    </button>
                  ))}
                </div>

                {/* Dialer Actions */}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                  {dialerState === 'idle' ? (
                    <>
                      <button 
                        className="btn btn-confirm" 
                        onClick={() => handleStartCall()}
                        disabled={!dialerNumber}
                        style={{ background: 'var(--success)', color: 'white', padding: '0.5rem 1.5rem', fontSize: '0.8rem' }}
                      >
                        Start Call
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => setDialerNumber('')}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <button 
                      className="btn btn-cancel" 
                      onClick={handleHangUp}
                      style={{ background: 'var(--error)', color: 'white', padding: '0.5rem 1.5rem', fontSize: '0.8rem' }}
                    >
                      Hang Up Call
                    </button>
                  )}
                </div>
              </div>

              {/* Column 2: Outbound Queue & Logs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Outbound Dialer Queue */}
                <div className="analytics-card">
                  <h3 className="analytics-card-title">Outbound Calling Queue</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '130px', overflowY: 'auto' }}>
                    {leads.filter(l => l.crm_status === 'GOOD_LEAD_FOLLOW_UP' && l.mobile_without_country_code).slice(0, 3).map((lead, idx) => (
                      <div 
                        key={idx} 
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-main)' }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{lead.name}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{lead.country_code || '+91'} {lead.mobile_without_country_code}</span>
                        </div>
                        <button 
                          className="btn btn-primary" 
                          onClick={() => handleStartCall(lead.mobile_without_country_code)}
                          disabled={dialerState !== 'idle'}
                          style={{ padding: '0.3rem 0.75rem', fontSize: '0.7rem' }}
                        >
                          Dial Now
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Call History Logs */}
                <div className="analytics-card">
                  <h3 className="analytics-card-title">Dialer Outbound Log Records</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '180px', overflowY: 'auto' }}>
                    {teleLogs.map((log, idx) => (
                      <div 
                        key={idx} 
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{log.lead}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{log.phone} • {log.duration} • {log.time}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button 
                            className="btn btn-secondary"
                            onClick={() => setRecordingPlaying(recordingPlaying === idx ? null : idx)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <span>{recordingPlaying === idx ? '⏸ Pause' : '▶ Play'} Rec</span>
                          </button>
                          <span 
                            style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: 'var(--radius-sm)', fontWeight: 600, background: log.status === 'Answered' ? 'var(--status-good-bg)' : 'var(--status-bad-bg)', color: log.status === 'Answered' ? 'var(--status-good-text)' : 'var(--status-bad-text)' }}
                          >
                            {log.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 9: CRM FIELD MANAGEMENT */}
        {activeTab === 'crmfields' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="view-header">
              <h2 className="view-title">CRM Schema Configuration</h2>
              <p className="view-subtitle">Review standard system lead headers and configure custom attributes for lead integrations.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
              {/* Field Schema Table */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">
                  <Briefcase size={16} style={{ color: 'var(--primary)' }} />
                  Lead Schema Definitions (15 Standard + Custom)
                </h3>
                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  <table className="main-leads-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>FIELD KEY</th>
                        <th>LABEL NAME</th>
                        <th>DATA TYPE</th>
                        <th>DESCRIPTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CRM_FIELDS.map(f => (
                        <tr key={f.key}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700 }}>{f.key}</td>
                          <td style={{ fontSize: '0.75rem' }}>{f.label}</td>
                          <td><span className="mapping-badge opt" style={{ fontSize: '0.6rem' }}>String</span></td>
                          <td style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{f.description}</td>
                        </tr>
                      ))}
                      {customCrmFields.map(f => (
                        <tr key={f.name} style={{ background: 'rgba(16,185,129,0.02)' }}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--success-text)' }}>{f.name} (custom)</td>
                          <td style={{ fontSize: '0.75rem', fontWeight: 600 }}>{f.label}</td>
                          <td><span className="mapping-badge req" style={{ fontSize: '0.6rem', background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>{f.type}</span></td>
                          <td style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{f.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Custom CRM Field form */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">Create Custom CRM Field</h3>
                <form onSubmit={handleAddCustomCrmField} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Field Key Name</label>
                    <input 
                      type="text" 
                      value={newFieldName} 
                      onChange={(e) => setNewFieldName(e.target.value)} 
                      placeholder="buyer_budget"
                      required
                      style={{ padding: '0.45rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Label Display Name</label>
                    <input 
                      type="text" 
                      value={newFieldLabel} 
                      onChange={(e) => setNewFieldLabel(e.target.value)} 
                      placeholder="Buyer Budget limit"
                      required
                      style={{ padding: '0.45rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Field Type</label>
                    <select 
                      value={newFieldType} 
                      onChange={(e) => setNewFieldType(e.target.value)}
                      style={{ padding: '0.45rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)', cursor: 'pointer' }}
                    >
                      <option value="String">String (Text)</option>
                      <option value="Number">Number (Budget, counts)</option>
                      <option value="Boolean">Boolean (Yes/No flags)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Field Description</label>
                    <textarea 
                      value={newFieldDesc} 
                      onChange={(e) => setNewFieldDesc(e.target.value)} 
                      placeholder="Describe what data this field captures..."
                      rows={2}
                      style={{ padding: '0.45rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)', resize: 'none' }}
                    />
                  </div>
                  <button className="btn btn-primary" type="submit" style={{ padding: '0.55rem', fontSize: '0.75rem', marginTop: '0.25rem' }}>Add CRM Field</button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 10: API CENTER */}
        {activeTab === 'apicenter' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="view-header">
              <h2 className="view-title">Developer API & Webhooks</h2>
              <p className="view-subtitle">Ingest leads programmatically into GROWeasy CRM database using Developer endpoints.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
              {/* Webhook keys & URLs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Bearer Token */}
                <div className="analytics-card">
                  <h3 className="analytics-card-title">Developer API Bearer Key</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="text" 
                        readOnly 
                        value={developerApiKey} 
                        style={{ flexGrow: 1, padding: '0.45rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', outline: 'none' }}
                      />
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => setDeveloperApiKey(`groweasy_live_pk_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 8)}`)}
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.7rem' }}
                      >
                        Regenerate
                      </button>
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Keep this token secret. Used in the `Authorization` header for HTTP calls.</span>
                  </div>
                </div>

                {/* Webhook endpoint URL */}
                <div className="analytics-card">
                  <h3 className="analytics-card-title">Inbound Webhook Config</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>External Catch URL</label>
                      <input 
                        type="text" 
                        value={webhookUrl} 
                        onChange={(e) => setWebhookUrl(e.target.value)} 
                        style={{ padding: '0.45rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none' }}
                      />
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Route leads from third-party systems directly into GROWeasy CRM database.</span>
                  </div>
                </div>
              </div>

              {/* Dev Docs Console */}
              <div className="analytics-card" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
                <h3 className="analytics-card-title" style={{ color: '#94a3b8', borderBottomColor: '#1e293b' }}>
                  <Server size={16} style={{ color: '#38bdf8' }} />
                  Developer API Integration Code Snippets
                </h3>
                
                {/* Doc Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem' }}>
                  <button 
                    onClick={() => setApiDocTab('curl')}
                    style={{ background: apiDocTab === 'curl' ? '#1e293b' : 'transparent', color: apiDocTab === 'curl' ? '#fff' : '#64748b', border: 'none', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    cURL Command
                  </button>
                  <button 
                    onClick={() => setApiDocTab('node')}
                    style={{ background: apiDocTab === 'node' ? '#1e293b' : 'transparent', color: apiDocTab === 'node' ? '#fff' : '#64748b', border: 'none', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Node.js Fetch
                  </button>
                  <button 
                    onClick={() => setApiDocTab('python')}
                    style={{ background: apiDocTab === 'python' ? '#1e293b' : 'transparent', color: apiDocTab === 'python' ? '#fff' : '#64748b', border: 'none', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Python requests
                  </button>
                </div>

                {/* Code Area */}
                <div style={{ flexGrow: 1, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#e2e8f0', overflowY: 'auto', maxHeight: '250px', whiteSpace: 'pre-wrap', padding: '0.5rem' }}>
                  {apiDocTab === 'curl' && `curl -X POST "${API_URL}/api/leads/generate" \\
  -H "Authorization: Bearer ${developerApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "campaign": "leads_on_demand",
    "count": 5,
    "quality": "mostly_interested"
  }'`}
                  {apiDocTab === 'node' && `const url = "${API_URL}/api/leads/generate";
const data = {
  campaign: "leads_on_demand",
  count: 5,
  quality: "mostly_interested"
};

fetch(url, {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${developerApiKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(data)
})
.then(res => res.json())
.then(json => console.log("Leads Ingested:", json.count))
.catch(err => console.error("API Error:", err));`}
                  {apiDocTab === 'python' && `import requests

url = "${API_URL}/api/leads/generate"
headers = {
    "Authorization": "Bearer ${developerApiKey}",
    "Content-Type": "application/json"
}
data = {
    "campaign": "leads_on_demand",
    "count": 5,
    "quality": "mostly_interested"
}

response = requests.post(url, headers=headers, json=data)
print("Response Status:", response.status_code)
print("Leads Count:", response.json().get('count'))`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 11: BUSINESS CENTER */}
        {activeTab === 'business' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="view-header">
              <h2 className="view-title">Business Center Settings</h2>
              <p className="view-subtitle">Review CRM billing workspaces, profile identifiers, and usage metrics.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
              {/* Workspace profile details */}
              <div className="analytics-card">
                <h3 className="analytics-card-title">Business Account Profile</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Company Legal Name</label>
                    <input 
                      type="text" 
                      value={businessName} 
                      onChange={(e) => setBusinessName(e.target.value)} 
                      style={{ padding: '0.5rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)', fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Current Billing Status Plan</label>
                    <input 
                      type="text" 
                      readOnly 
                      value={businessPlan} 
                      style={{ padding: '0.5rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontWeight: 600, outline: 'none' }}
                    />
                  </div>
                </div>
              </div>

              {/* Usage Stats details */}
              <div className="analytics-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 className="analytics-card-title">Enterprise System Usage</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Leads limit:</span>
                    <span style={{ fontWeight: 700 }}>{leads.length} / 10,000</span>
                  </div>
                  <div className="progress-track" style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div className="progress-bar" style={{ height: '100%', width: `${Math.min(100, Math.round((leads.length / 10000) * 100))}%`, background: 'var(--primary)' }}></div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>WhatsApp Messages Sent:</span>
                    <span style={{ fontWeight: 700 }}>142 / 100,000</span>
                  </div>
                  <div className="progress-track" style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div className="progress-bar" style={{ height: '100%', width: '1%', background: 'var(--primary)' }}></div>
                  </div>
                </div>
              </div>
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
