import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  MapPin, 
  BrainCircuit, 
  Route, 
  Train, 
  Users, 
  Smartphone, 
  AlertTriangle, 
  FolderSync, 
  Search, 
  Camera, 
  CheckCircle2, 
  ShieldAlert, 
  FileText,
  Clock,
  Compass,
  Zap,
  Map as MapIcon,
  HelpCircle,
  TrendingUp,
  RefreshCw
} from 'lucide-react';

// Import Recharts components
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

// Import React Leaflet
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';

// Leaflet styles override helper component
function ChangeMapView({ center, zoom }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

// Coordinate of Bengaluru Center
const BENGALURU_CENTER = [12.9716, 77.5946];

// Pre-computed Station List for filters
const POLICE_STATIONS = [
  "All", "Upparpet", "Shivajinagar", "Malleshwaram", "HAL Old Airport", 
  "City Market", "Vijayanagara", "Rajajinagar", "Kodigehalli", "Magadi Road", 
  "Jeevanbheemanagar", "K.R. Pura", "Halasuru Gate", "Mahadevapura", "Chikkajala", 
  "HSR Layout", "Bellandur", "High ground", "Byatarayanapura", "Electronic City"
];

const VIOLATION_TYPES = [
  "All", "WRONG PARKING", "NO PARKING", "PARKING IN A MAIN ROAD", 
  "PARKING ON FOOTPATH", "PARKING NEAR ROAD CROSSING", "DEFECTIVE NUMBER PLATE"
];

// Fallback high-fidelity datasets if API fails
const FALLBACK_SUMMARY = {
  total_violations: 298450,
  approval_rate: 69.8,
  active_officers: 14,
  pending_citizen_reports: 3,
  vehicle_distribution: {
    "SCOOTER": 94856,
    "CAR": 88870,
    "MOTOR CYCLE": 40811,
    "PASSENGER AUTO": 37813,
    "MAXI-CAB": 11372
  },
  scita_sync: {
    "True": 255893,
    "False": 42557
  },
  weekly_trend: [
    { day: "Mon", violations: 38931 },
    { day: "Tue", violations: 42930 },
    { day: "Wed", violations: 43067 },
    { day: "Thu", violations: 41528 },
    { day: "Fri", violations: 41702 },
    { day: "Sat", violations: 43427 },
    { day: "Sun", violations: 46865 }
  ],
  hourly_distribution: [
    { hour: "00:00", violations: 14608 },
    { hour: "03:00", violations: 3145 },
    { hour: "06:00", violations: 219 },
    { hour: "09:00", violations: 818 },
    { hour: "12:00", violations: 10713 },
    { hour: "15:00", violations: 19763 },
    { hour: "18:00", violations: 22840 },
    { hour: "21:00", violations: 34085 }
  ]
};

const FALLBACK_STATIONS = [
  { police_station: "Upparpet", total_violations: 34468, approval_rate: 76.2, productivity_score: 293.1 },
  { police_station: "Shivajinagar", total_violations: 28044, approval_rate: 66.1, productivity_score: 238.4 },
  { police_station: "Malleshwaram", total_violations: 22200, approval_rate: 73.3, productivity_score: 188.7 },
  { police_station: "HAL Old Airport", total_violations: 20819, approval_rate: 68.1, productivity_score: 177.0 },
  { police_station: "City Market", total_violations: 17646, approval_rate: 67.5, productivity_score: 150.0 },
  { police_station: "Vijayanagara", total_violations: 14652, approval_rate: 71.2, productivity_score: 124.5 },
  { police_station: "Rajajinagar", total_violations: 10998, approval_rate: 70.8, productivity_score: 93.5 },
  { police_station: "Kodigehalli", total_violations: 10916, approval_rate: 72.4, productivity_score: 92.8 }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [useFallback, setUseFallback] = useState(false);
  const [loading, setLoading] = useState(false);

  // Global Dashboard stats state
  const [summary, setSummary] = useState(FALLBACK_SUMMARY);
  const [stationStats, setStationStats] = useState(FALLBACK_STATIONS);

  // Map Filter State
  const [mapFilters, setMapFilters] = useState({
    policeStation: 'All',
    violationType: 'All',
    vehicleType: 'All'
  });
  const [hotspots, setHotspots] = useState([]);

  // Prediction State
  const [predParams, setPredParams] = useState({
    hour: 17,
    day: 'Friday',
    lat: 12.9756,
    lon: 77.5729,
    searchStation: 'All'
  });
  const [predictionResult, setPredictionResult] = useState(null);
  const [gridForecast, setGridForecast] = useState([]);

  // Patrol State
  const [officers, setOfficers] = useState([]);
  const [selectedOfficer, setSelectedOfficer] = useState('');
  const [selectedStation, setSelectedStation] = useState('Upparpet');
  const [activeRoute, setActiveRoute] = useState(null);

  // Repeat Offenders State
  const [offenderSearch, setOffenderSearch] = useState('');
  const [repeatOffenders, setRepeatOffenders] = useState([]);
  const [selectedOffender, setSelectedOffender] = useState(null);

  // Metro radii state
  const [metroRadius, setMetroRadius] = useState(200);
  const [metroStats, setMetroStats] = useState([]);

  // QC State
  const [qcMetrics, setQcMetrics] = useState({ suspicious_officers: [], qc_alerts: [] });

  // Citizen State
  const [citizenForm, setCitizenForm] = useState({
    latitude: 12.9716,
    longitude: 77.5946,
    location: '',
    vehicle_type: 'CAR',
    reported_vehicle_number: '',
    violation_details: ''
  });
  const [citizenMessage, setCitizenMessage] = useState(null);
  const [trackingIdInput, setTrackingIdInput] = useState('');
  const [trackedReport, setTrackedReport] = useState(null);
  const [allCitizenReports, setAllCitizenReports] = useState([]);

  // Officer Mobile Simulator State
  const [mobileScreen, setMobileScreen] = useState('home'); // home, scan, ticket, sync
  const [scannedPlate, setScannedPlate] = useState(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [officerTicketForm, setOfficerTicketForm] = useState({
    vehicle_number: '',
    vehicle_type: 'CAR',
    violation_type: 'WRONG PARKING',
    offence_code: '[112]',
    location: 'Majestic Metro Access Road, Bengaluru'
  });
  const [mobileTickets, setMobileTickets] = useState([]);

  // API Call helper
  const API_URL = 'http://127.0.0.1:8000';

  useEffect(() => {
    fetchDashboardSummary();
    fetchStationStats();
    fetchHotspots();
    fetchMetroStats();
    fetchRepeatOffenders();
    fetchQcMetrics();
    fetchOfficers();
    fetchCitizenReports();
  }, [useFallback]);

  // Handle map filter trigger
  useEffect(() => {
    fetchHotspots();
  }, [mapFilters, useFallback]);

  // Handle predictions trigger
  useEffect(() => {
    fetchGridForecast();
  }, [predParams.hour, predParams.day, predParams.searchStation, useFallback]);

  // Handle metro radius change trigger
  useEffect(() => {
    fetchMetroStats();
  }, [metroRadius, useFallback]);

  const fetchDashboardSummary = async () => {
    if (useFallback) {
      setSummary(FALLBACK_SUMMARY);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/analytics/summary`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSummary(data);
    } catch {
      setUseFallback(true);
    }
  };

  const fetchStationStats = async () => {
    if (useFallback) {
      setStationStats(FALLBACK_STATIONS);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/analytics/stations`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStationStats(data);
    } catch {
      setUseFallback(true);
    }
  };

  const fetchHotspots = async () => {
    if (useFallback) {
      // Mock coordinates near Majestic and Shivajinagar
      setHotspots([
        { latitude: 12.9756, longitude: 77.5729, count: 2416, location: "Majestic Junction Choke Point", police_station: "Upparpet", congestion_score: 92 },
        { latitude: 12.9855, longitude: 77.5992, count: 1870, location: "Safina Plaza, Shivajinagar", police_station: "Shivajinagar", congestion_score: 85 },
        { latitude: 13.0082, longitude: 77.5684, count: 1350, location: "18th Cross Malleshwaram", police_station: "Malleshwaram", congestion_score: 72 },
        { latitude: 12.9255, longitude: 77.6186, count: 980, location: "Koramangala 2nd Block", police_station: "Madiwala", congestion_score: 65 },
        { latitude: 12.9784, longitude: 77.6408, count: 1120, location: "100 Feet Road Indiranagar", police_station: "Indiranagar", congestion_score: 78 }
      ]);
      return;
    }
    try {
      const qs = new URLSearchParams();
      if (mapFilters.policeStation !== 'All') qs.append('police_station', mapFilters.policeStation);
      if (mapFilters.violationType !== 'All') qs.append('violation_type', mapFilters.violationType);
      if (mapFilters.vehicleType !== 'All') qs.append('vehicle_type', mapFilters.vehicleType);
      
      const res = await fetch(`${API_URL}/api/map/hotspots?${qs.toString()}`);
      const data = await res.json();
      setHotspots(data);
    } catch {
      setUseFallback(true);
    }
  };

  const fetchGridForecast = async () => {
    if (useFallback) {
      setGridForecast([
        { latitude: 12.9756, longitude: 77.5729, location: "Majestic Access Road", police_station: "Upparpet", historical_count: 2416, predicted_risk_score: 91, risk_level: "High" },
        { latitude: 12.9855, longitude: 77.5992, location: "Safina Plaza", police_station: "Shivajinagar", historical_count: 1870, predicted_risk_score: 87, risk_level: "High" },
        { latitude: 13.0082, longitude: 77.5684, location: "18th Cross Malleshwaram", police_station: "Malleshwaram", historical_count: 1350, predicted_risk_score: 68, risk_level: "Medium" }
      ]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/predict/grid?hour=${predParams.hour}&day=${predParams.day}&police_station=${predParams.searchStation}`);
      const data = await res.json();
      setGridForecast(data);
    } catch {
      setUseFallback(true);
    }
  };

  const triggerRiskPredict = async (lat, lon) => {
    setLoading(true);
    if (useFallback) {
      setTimeout(() => {
        const prob = Math.random() * 0.4 + 0.55;
        const score = Math.round(prob * 100);
        setPredictionResult({
          latitude: lat,
          longitude: lon,
          probability: prob,
          risk_level: score > 75 ? "High" : "Medium",
          congestion_risk_score: score,
          forecast_sentence: `This location has an estimated ${score}% chance of experiencing high parking violation density on ${predParams.day}s around ${predParams.hour.toString().padStart(2, '0')}:00.`,
          recommendations: [
            "Deploy 2-3 patrol officers immediately.",
            "Recommend towing vehicles parked along the main carriageway."
          ]
        });
        setLoading(false);
      }, 500);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/predict?latitude=${lat}&longitude=${lon}&hour=${predParams.hour}&day=${predParams.day}`);
      const data = await res.json();
      setPredictionResult(data);
    } catch {
      setUseFallback(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchOfficers = async () => {
    if (useFallback) {
      setOfficers([
        { id: "FKUSR00100", name: "Officer Rajesh K (Upparpet)", badge_number: "BTP-Badge-2000", police_station: "Upparpet", status: "Active", latitude: 12.9740, longitude: 77.5710 },
        { id: "FKUSR00101", name: "Officer Srinivas M (Shivajinagar)", badge_number: "BTP-Badge-2001", police_station: "Shivajinagar", status: "Active", latitude: 12.9840, longitude: 77.5980 }
      ]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/officers`);
      const data = await res.json();
      setOfficers(data);
    } catch {
      setUseFallback(true);
    }
  };

  const triggerPatrolRouting = async () => {
    if (!selectedOfficer) return;
    setLoading(true);
    if (useFallback) {
      setTimeout(() => {
        setActiveRoute({
          officer_id: selectedOfficer,
          officer_name: "Officer Rajesh K",
          police_station: selectedStation,
          start_point: [12.9740, 77.5710],
          waypoints: [
            { latitude: 12.9756, longitude: 77.5729, name: "Majestic Junction Choke Point", count: 2416 },
            { latitude: 12.9780, longitude: 77.5690, name: "KSR Metro Terminal Access", count: 1800 }
          ],
          route_coordinates: [
            [12.9740, 77.5710],
            [12.9756, 77.5729],
            [12.9780, 77.5690]
          ],
          recommendation: "Deploy 1 patrol officer. Optimize route complete."
        });
        setLoading(false);
      }, 500);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/patrol/route?police_station=${selectedStation}&officer_id=${selectedOfficer}`);
      const data = await res.json();
      setActiveRoute(data);
    } catch {
      setUseFallback(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchRepeatOffenders = async () => {
    if (useFallback) {
      setRepeatOffenders([
        { vehicle_number: "FKN00GL4424", vehicle_type: "CAR", violation_count: 55, escalation_score: 95, towing_priority: "HIGH" },
        { vehicle_number: "FKN00GL3514", vehicle_type: "CAR", violation_count: 42, escalation_score: 88, towing_priority: "HIGH" },
        { vehicle_number: "FKN00GL9771", vehicle_type: "SCOOTER", violation_count: 41, escalation_score: 85, towing_priority: "HIGH" },
        { vehicle_number: "FKN00GL17863", vehicle_type: "CAR", violation_count: 41, escalation_score: 85, towing_priority: "HIGH" },
        { vehicle_number: "FKN00GL2906", vehicle_type: "PASSENGER AUTO", violation_count: 35, escalation_score: 75, towing_priority: "MEDIUM" }
      ]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/repeat-offenders`);
      const data = await res.json();
      setRepeatOffenders(data);
    } catch {
      setUseFallback(true);
    }
  };

  const triggerSearchOffender = async () => {
    if (!offenderSearch) return;
    if (useFallback) {
      setSelectedOffender({
        vehicle_number: offenderSearch.toUpperCase(),
        violation_count: 12,
        escalation_score: 72,
        towing_priority: "MEDIUM",
        history: [
          { id: "FKID30298", timestamp: "2026-06-15 10:14:00", location: "Kamaraj Road Crossroads", violation_type: '["WRONG PARKING"]', status: "approved", station: "Shivajinagar" },
          { id: "FKID29103", timestamp: "2026-06-08 17:33:00", location: "Safina Plaza Lane", violation_type: '["NO PARKING"]', status: "approved", station: "Shivajinagar" }
        ]
      });
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/repeat-offenders/${offenderSearch}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelectedOffender(data);
    } catch {
      alert("Offender Vehicle Plate Not Found");
    }
  };

  const fetchMetroStats = async () => {
    if (useFallback) {
      setMetroStats([
        { name: "Majestic", violations_in_radius: 1245, wrong_parking: 650, no_parking: 500, footpath_parking: 95, risk_score: 88, status: "CRITICAL" },
        { name: "Hosahalli", violations_in_radius: 912, wrong_parking: 430, no_parking: 400, footpath_parking: 82, risk_score: 75, status: "WARNING" },
        { name: "Indiranagar", violations_in_radius: 805, wrong_parking: 390, no_parking: 350, footpath_parking: 65, risk_score: 68, status: "WARNING" },
        { name: "MG Road", violations_in_radius: 642, wrong_parking: 280, no_parking: 300, footpath_parking: 62, risk_score: 55, status: "WARNING" },
        { name: "Yeshwanthpur", violations_in_radius: 412, wrong_parking: 200, no_parking: 180, footpath_parking: 32, risk_score: 42, status: "NORMAL" }
      ]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/metro/stats?radius_meters=${metroRadius}`);
      const data = await res.json();
      setMetroStats(data);
    } catch {
      setUseFallback(true);
    }
  };

  const fetchQcMetrics = async () => {
    if (useFallback) {
      setQcMetrics({
        suspicious_officers: [
          { officer_id: "FKUSR00021", total_tickets: 4099, approved: 3200, rejected: 899, rejection_rate: 21.9, quality_status: "WARNING" },
          { officer_id: "FKUSR00332", total_tickets: 3467, approved: 2600, rejected: 867, rejection_rate: 25.0, quality_status: "WARNING" }
        ],
        qc_alerts: [
          { id: "AL-109", title: "Double Ticket Submission Alert", details: "Officer FKUSR00021 submitted 2 tickets for plate FKN00GL4424 within 3 minutes near Safina Plaza.", severity: "Medium" },
          { id: "AL-110", title: "Low Image Resolution", details: "Device FKDEV00082 has uploaded 15 tickets today failing the clarity confidence threshold.", severity: "Low" }
        ]
      });
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/validation/qc`);
      const data = await res.json();
      setQcMetrics(data);
    } catch {
      setUseFallback(true);
    }
  };

  const fetchCitizenReports = async () => {
    if (useFallback) return;
    try {
      const res = await fetch(`${API_URL}/api/citizen/reports`);
      const data = await res.json();
      setAllCitizenReports(data);
    } catch {
      setUseFallback(true);
    }
  };

  // Submit Citizen Report
  const handleCitizenSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (useFallback) {
      setTimeout(() => {
        const randId = `TRACK-${Math.floor(Math.random() * 9000 + 1000)}`;
        setCitizenMessage({ success: true, tracking_id: randId });
        setLoading(false);
      }, 800);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/citizen/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(citizenForm)
      });
      const data = await res.json();
      if (data.success) {
        setCitizenMessage({ success: true, tracking_id: data.tracking_id });
        setCitizenForm({
          latitude: 12.9716,
          longitude: 77.5946,
          location: '',
          vehicle_type: 'CAR',
          reported_vehicle_number: '',
          violation_details: ''
        });
      }
    } catch {
      alert("Submission failed. Please check server.");
    } finally {
      setLoading(false);
    }
  };

  // Track Citizen Report
  const handleTrackReport = async (e) => {
    e.preventDefault();
    if (!trackingIdInput) return;
    if (useFallback) {
      setTrackedReport({
        tracking_id: trackingIdInput,
        location: "Hosahalli Metro Station Access Rd",
        vehicle_type: "CAR",
        reported_vehicle_number: "KA02MB8891",
        violation_details: "Parked on the walking footpath causing block.",
        status: "Officer Dispatched",
        created_at: "2026-06-18 10:24:00",
        updates: [
          { timestamp: "2026-06-18 10:24:00", status: "Pending", details: "Citizen report filed successfully." },
          { timestamp: "2026-06-18 11:15:00", status: "Officer Dispatched", details: "Officer Rajesh K dispatched to the hotspot location." }
        ]
      });
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/citizen/report/${trackingIdInput}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTrackedReport(data);
    } catch {
      alert("Tracking ID not found.");
    }
  };

  // Mobile Simulator Image Upload
  const handleMobileImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setOcrScanning(true);
    if (useFallback) {
      setTimeout(() => {
        setScannedPlate({
          license_plate: "KA03MM8819",
          confidence: 96.8,
          image_quality: { brightness: "Optimal", blur: "No Blur", status: "Pass" },
          auto_fill_data: { vehicle_type: "CAR", violation_type: "WRONG PARKING" }
        });
        setOfficerTicketForm({
          ...officerTicketForm,
          vehicle_number: "KA03MM8819",
          vehicle_type: "CAR",
          violation_type: "WRONG PARKING",
          offence_code: "[112]"
        });
        setOcrScanning(false);
      }, 1500);
      return;
    }
    
    const formData = new FormData();
    formData.append("image", file);
    
    try {
      const res = await fetch(`${API_URL}/api/officer/scan-plate`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setScannedPlate(data);
      setOfficerTicketForm({
        ...officerTicketForm,
        vehicle_number: data.license_plate,
        vehicle_type: data.auto_fill_data.vehicle_type,
        violation_type: data.auto_fill_data.violation_type,
        offence_code: data.auto_fill_data.violation_type === "NO PARKING" ? "[113]" : "[112]"
      });
    } catch {
      alert("OCR scanning failed. Check server connection.");
    } finally {
      setOcrScanning(false);
    }
  };

  // Submit Officer Ticket
  const handleOfficerTicketSubmit = async (e) => {
    e.preventDefault();
    if (useFallback) {
      const newTicket = {
        id: `FKID${Math.floor(Math.random()*900000 + 100000)}`,
        vehicle_number: officerTicketForm.vehicle_number,
        vehicle_type: officerTicketForm.vehicle_type,
        violation_type: officerTicketForm.violation_type,
        location: officerTicketForm.location,
        timestamp: new Date().toLocaleTimeString()
      };
      setMobileTickets([newTicket, ...mobileTickets]);
      setMobileScreen('sync');
      setScannedPlate(null);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/officer/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          officer_id: "FKUSR00100",
          latitude: 12.9756,
          longitude: 77.5729,
          location: officerTicketForm.location,
          vehicle_number: officerTicketForm.vehicle_number,
          vehicle_type: officerTicketForm.vehicle_type,
          violation_type: officerTicketForm.violation_type,
          offence_code: officerTicketForm.offence_code
        })
      });
      const data = await res.json();
      if (data.success) {
        const newTicket = {
          id: data.ticket_id,
          vehicle_number: officerTicketForm.vehicle_number,
          vehicle_type: officerTicketForm.vehicle_type,
          violation_type: officerTicketForm.violation_type,
          location: officerTicketForm.location,
          timestamp: new Date().toLocaleTimeString()
        };
        setMobileTickets([newTicket, ...mobileTickets]);
        setMobileScreen('sync');
        setScannedPlate(null);
        fetchDashboardSummary();
        fetchHotspots();
      }
    } catch {
      alert("Submission failed. Check backend.");
    }
  };

  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <div className="sidebar">
        <div>
          <div className="sidebar-logo">
            <BrainCircuit className="text-[#00b4d8] w-8 h-8 animate-pulse" />
            <div>
              <h1>BTP SmartPark</h1>
              <span className="text-[10px] text-yellow-500 font-bold tracking-wider uppercase">AI Intelligence Core</span>
            </div>
          </div>

          <ul className="sidebar-menu">
            <li className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
              <LayoutDashboard />
              <span>Command Center</span>
            </li>
            <li className={`menu-item ${activeTab === 'heatmap' ? 'active' : ''}`} onClick={() => setActiveTab('heatmap')}>
              <MapPin />
              <span>Violation Heatmap</span>
            </li>
            <li className={`menu-item ${activeTab === 'predictive' ? 'active' : ''}`} onClick={() => setActiveTab('predictive')}>
              <BrainCircuit />
              <span>Predictive AI Engine</span>
            </li>
            <li className={`menu-item ${activeTab === 'routing' ? 'active' : ''}`} onClick={() => setActiveTab('routing')}>
              <Route />
              <span>Patrol Dispatch Routing</span>
            </li>
            <li className={`menu-item ${activeTab === 'metro' ? 'active' : ''}`} onClick={() => setActiveTab('metro')}>
              <Train />
              <span>Metro Radii Monitor</span>
            </li>
            <li className={`menu-item ${activeTab === 'offenders' ? 'active' : ''}`} onClick={() => setActiveTab('offenders')}>
              <Users />
              <span>Repeat Offenders Log</span>
            </li>
            <li className={`menu-item ${activeTab === 'qc' ? 'active' : ''}`} onClick={() => setActiveTab('qc')}>
              <ShieldAlert />
              <span>AI QC & Fraud Layer</span>
            </li>
            <li className={`menu-item ${activeTab === 'mobile' ? 'active' : ''}`} onClick={() => setActiveTab('mobile')}>
              <Smartphone />
              <span>Officer Mobile App Sim</span>
            </li>
            <li className={`menu-item ${activeTab === 'citizen' ? 'active' : ''}`} onClick={() => setActiveTab('citizen')}>
              <FileText />
              <span>Citizen Portal</span>
            </li>
          </ul>
        </div>

        {/* Sync Pipeline and Status Info */}
        <div className="glass-panel p-4 flex flex-col gap-2 mt-4 text-xs border-[rgba(212,175,55,0.2)]">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Data Source:</span>
            <span className={`font-semibold ${useFallback ? 'text-amber-400' : 'text-green-400'}`}>
              {useFallback ? 'Simulation (Fallback)' : 'FastAPI Server'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">SCITA Integration:</span>
            <span className="text-green-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-ping inline-block"></span>
              Active Sync
            </span>
          </div>
          {useFallback && (
            <button 
              className="mt-2 py-1 px-2 bg-blue-500 rounded text-white font-bold hover:bg-blue-600 transition"
              onClick={() => setUseFallback(false)}
            >
              Retry Live API
            </button>
          )}
        </div>
      </div>

      {/* VIEWPORT */}
      <div className="main-viewport">
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="header-container">
              <div className="header-title">
                <h2>Command Center Analytics</h2>
                <p>Bengaluru Traffic Police Real-time Congestion Decision Support</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-xs text-gray-400 uppercase tracking-wider block">Last Updated</span>
                  <span className="text-xs font-semibold text-gray-200">Just Now</span>
                </div>
                <button 
                  onClick={() => { fetchDashboardSummary(); fetchStationStats(); }}
                  className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Metrics cards */}
            <div className="metrics-grid">
              <div className="glass-panel metric-card">
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Total Parking Violations</span>
                  <div className="metric-value">{summary.total_violations.toLocaleString()}</div>
                  <div className="metric-change up">+4.8% <span className="text-[10px] text-gray-500">vs last week</span></div>
                </div>
                <div className="metric-icon-wrapper bg-[rgba(0,180,216,0.1)] text-[#00b4d8]">
                  <MapPin />
                </div>
              </div>

              <div className="glass-panel metric-card">
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Ticket Approval Rate</span>
                  <div className="metric-value">{summary.approval_rate}%</div>
                  <div className="metric-change up">+1.2% <span className="text-[10px] text-gray-500">AI calibration verified</span></div>
                </div>
                <div className="metric-icon-wrapper bg-[rgba(16,185,129,0.1)] text-[#10b981]">
                  <CheckCircle2 />
                </div>
              </div>

              <div className="glass-panel metric-card">
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Active Patrol Officers</span>
                  <div className="metric-value">{summary.active_officers}</div>
                  <div className="metric-change text-gray-300">Active Shift <span className="text-[10px] text-gray-500">across 54 stations</span></div>
                </div>
                <div className="metric-icon-wrapper bg-[rgba(245,158,11,0.1)] text-[#f59e0b]">
                  <Users />
                </div>
              </div>

              <div className="glass-panel metric-card">
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Citizen Submissions</span>
                  <div className="metric-value">{summary.pending_citizen_reports}</div>
                  <div className="metric-change down">{summary.pending_citizen_reports} Urgent <span className="text-[10px] text-gray-500">review queue</span></div>
                </div>
                <div className="metric-icon-wrapper bg-[rgba(239,68,68,0.1)] text-[#ef4444]">
                  <AlertTriangle />
                </div>
              </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Daily Trend Area Chart */}
              <div className="glass-panel h-80">
                <h3 className="text-sm font-semibold mb-4 text-gray-300 uppercase tracking-wider">Weekly Violation Frequency</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <AreaChart data={summary.weekly_trend}>
                    <defs>
                      <linearGradient id="colorViolations" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00b4d8" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#00b4d8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="day" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6' }} />
                    <Area type="monotone" dataKey="violations" stroke="#00b4d8" strokeWidth={2} fillOpacity={1} fill="url(#colorViolations)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Hourly congestion risk chart */}
              <div className="glass-panel h-80">
                <h3 className="text-sm font-semibold mb-4 text-gray-300 uppercase tracking-wider">Hourly Peak Traffic Violations (IST)</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={summary.hourly_distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="hour" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6' }} />
                    <Bar dataKey="violations" fill="#d4af37" radius={[4, 4, 0, 0]}>
                      {summary.hourly_distribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 7 || index === 6 ? '#ef4444' : '#d4af37'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Station Table Breakdown */}
            <div className="glass-panel">
              <h3 className="text-sm font-semibold mb-4 text-gray-300 uppercase tracking-wider">Police Station Enforcement Matrix</h3>
              <div className="overflow-x-auto">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Police Station</th>
                      <th>Total Violations</th>
                      <th>Validation Approval Rate</th>
                      <th>Officer Productivity Score</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stationStats.map((st, i) => (
                      <tr key={i}>
                        <td className="font-semibold">{st.police_station}</td>
                        <td>{st.total_violations.toLocaleString()}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="w-16 bg-gray-700 h-2 rounded-full overflow-hidden block">
                              <span 
                                className="h-full bg-[#10b981] block" 
                                style={{ width: `${st.approval_rate}%` }}
                              ></span>
                            </span>
                            <span>{st.approval_rate}%</span>
                          </div>
                        </td>
                        <td>{st.productivity_score}</td>
                        <td>
                          <span className={`badge ${st.approval_rate > 70 ? 'badge-low' : 'badge-med'}`}>
                            {st.approval_rate > 70 ? 'High Calibre' : 'Needs Calib'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIOLATION HEATMAP */}
        {activeTab === 'heatmap' && (
          <div className="h-full flex flex-col">
            <div className="header-container mb-4">
              <div className="header-title">
                <h2>Enforcement Hotspot & Density Map</h2>
                <p>Live density overlays for targeting traffic patrol units</p>
              </div>
              
              {/* Dynamic Map Filters */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400 uppercase">Police Station</span>
                  <select 
                    value={mapFilters.policeStation}
                    onChange={(e) => setMapFilters({ ...mapFilters, policeStation: e.target.value })}
                    className="custom-select"
                  >
                    {POLICE_STATIONS.map((st, i) => <option key={i} value={st}>{st}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400 uppercase">Violation Type</span>
                  <select 
                    value={mapFilters.violationType}
                    onChange={(e) => setMapFilters({ ...mapFilters, violationType: e.target.value })}
                    className="custom-select"
                  >
                    {VIOLATION_TYPES.map((vt, i) => <option key={i} value={vt}>{vt}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400 uppercase">Vehicle Type</span>
                  <select 
                    value={mapFilters.vehicleType}
                    onChange={(e) => setMapFilters({ ...mapFilters, vehicleType: e.target.value })}
                    className="custom-select"
                  >
                    <option value="All">All Vehicles</option>
                    <option value="CAR">Car</option>
                    <option value="SCOOTER">Scooter</option>
                    <option value="MOTOR CYCLE">Motorcycle</option>
                    <option value="PASSENGER AUTO">Passenger Auto</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Map Frame */}
            <div className="flex-grow min-h-[450px] relative rounded-xl overflow-hidden border border-gray-800 shadow-2xl">
              <MapContainer center={BENGALURU_CENTER} zoom={12} scrollWheelZoom={true}>
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                
                {/* Hotspot Markers */}
                {hotspots.map((pt, i) => {
                  // Determine marker color based on Congestion score
                  const color = pt.congestion_score >= 80 ? '#ef4444' : pt.congestion_score >= 50 ? '#f59e0b' : '#00b4d8';
                  return (
                    <CircleMarker
                      key={i}
                      center={[pt.latitude, pt.longitude]}
                      radius={12 + Math.min(15, pt.count / 200)}
                      fillColor={color}
                      color={color}
                      weight={1}
                      opacity={0.8}
                      fillOpacity={0.3}
                    >
                      <Popup>
                        <div className="p-2">
                          <h4 className="font-bold text-sm text-[#00b4d8] mb-1">{pt.location}</h4>
                          <div className="flex flex-col gap-1 text-xs">
                            <span>Jurisdiction: <strong>{pt.police_station}</strong></span>
                            <span>Historical Violations: <strong>{pt.count}</strong></span>
                            <div className="mt-2 flex items-center justify-between">
                              <span>Congestion Index:</span>
                              <span className="badge badge-high">{pt.congestion_score}/100</span>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>

              {/* Map Floating Legend */}
              <div className="absolute bottom-4 right-4 bg-gray-900 bg-opacity-80 p-3 rounded-lg border border-gray-800 z-[1000] text-xs flex flex-col gap-2">
                <div className="font-bold border-bottom border-gray-700 pb-1">Choke Priority Index</div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#ef4444] inline-block"></span>
                  <span>Critical Risk (&gt;80)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#f59e0b] inline-block"></span>
                  <span>Medium Risk (50-80)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#00b4d8] inline-block"></span>
                  <span>Low Risk (&lt;50)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI PREDICTIVE ENGINE */}
        {activeTab === 'predictive' && (
          <div>
            <div className="header-container">
              <div className="header-title">
                <h2>AI Hotspot Predictive Engine</h2>
                <p>Forecasting illegal parking occurrence probability using historical models</p>
              </div>
            </div>

            {/* Input params */}
            <div className="glass-panel grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Target Hour</label>
                <select
                  value={predParams.hour}
                  onChange={(e) => setPredParams({ ...predParams, hour: parseInt(e.target.value) })}
                  className="custom-select"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{`${i.toString().padStart(2, '0')}:00`}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Target Day</label>
                <select
                  value={predParams.day}
                  onChange={(e) => setPredParams({ ...predParams, day: e.target.value })}
                  className="custom-select"
                >
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => (
                    <option key={i} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Target Police Station</label>
                <select
                  value={predParams.searchStation}
                  onChange={(e) => setPredParams({ ...predParams, searchStation: e.target.value })}
                  className="custom-select"
                >
                  {POLICE_STATIONS.map((st, i) => <option key={i} value={st}>{st}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button 
                  onClick={() => triggerRiskPredict(predParams.lat, predParams.lon)}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <BrainCircuit className="w-4 h-4" /> Run Prediction Model
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Output Forecast Details */}
              <div className="lg:col-span-1 flex flex-col gap-6">
                <div className="glass-panel flex-grow border-l-4 border-yellow-500">
                  <h3 className="text-sm font-semibold mb-4 text-gray-300 uppercase tracking-wider flex items-center gap-2">
                    <Zap className="text-yellow-500 w-4 h-4" /> AI Core Predictions
                  </h3>
                  {predictionResult ? (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-yellow-500">{predictionResult.congestion_risk_score}</span>
                        <span className="text-xs text-gray-400">/ 100 Congestion Risk Score</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span>Risk Designation:</span>
                        <span className={`badge ${predictionResult.risk_level === 'High' ? 'badge-high' : 'badge-med'}`}>
                          {predictionResult.risk_level} Risk
                        </span>
                      </div>

                      <p className="text-sm text-gray-300 italic bg-gray-900 bg-opacity-50 p-3 rounded-lg border border-gray-800">
                        "{predictionResult.forecast_sentence}"
                      </p>

                      <div>
                        <h4 className="text-xs text-gray-400 uppercase font-bold mb-2">Tactical Action Plan:</h4>
                        <ul className="list-disc list-inside text-xs text-gray-300 flex flex-col gap-1">
                          {predictionResult.recommendations.map((rec, idx) => (
                            <li key={idx}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500 text-xs">
                      Select coordinates and run the prediction model above to generate forecasts.
                    </div>
                  )}
                </div>
              </div>

              {/* Grid Forecast Table */}
              <div className="lg:col-span-2 glass-panel">
                <h3 className="text-sm font-semibold mb-4 text-gray-300 uppercase tracking-wider">
                  Forecasted Zone Risk Distribution (Top Hotspots)
                </h3>
                <div className="overflow-y-auto max-h-96">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Location</th>
                        <th>Station</th>
                        <th>Risk Probability</th>
                        <th>Enforcement Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gridForecast.map((gf, i) => (
                        <tr 
                          key={i} 
                          className="cursor-pointer"
                          onClick={() => {
                            setPredParams({ ...predParams, lat: gf.latitude, lon: gf.longitude });
                            triggerRiskPredict(gf.latitude, gf.longitude);
                          }}
                        >
                          <td className="font-semibold text-xs">{gf.location}</td>
                          <td className="text-xs text-gray-400">{gf.police_station}</td>
                          <td>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="w-12 bg-gray-800 h-2 rounded overflow-hidden">
                                <span className={`h-full block ${gf.predicted_risk_score > 75 ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${gf.predicted_risk_score}%` }}></span>
                              </span>
                              <span>{gf.predicted_risk_score}%</span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${gf.risk_level === 'High' ? 'badge-high' : 'badge-med'}`}>
                              {gf.risk_level === 'High' ? 'Dispatch Tow' : 'Increase Patrol'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PATROL ROUTE MONITORING */}
        {activeTab === 'routing' && (
          <div>
            <div className="header-container">
              <div className="header-title">
                <h2>Patrol Dispatch & Routing</h2>
                <p>Geospatial TSP optimization dispatcher for police officers on shift</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Controls */}
              <div className="lg:col-span-1 glass-panel flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Select Police Jurisdiction</label>
                  <select
                    value={selectedStation}
                    onChange={(e) => setSelectedStation(e.target.value)}
                    className="custom-select"
                  >
                    {POLICE_STATIONS.filter(s => s !== 'All').map((st, i) => (
                      <option key={i} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Select On-Duty Officer</label>
                  <select
                    value={selectedOfficer}
                    onChange={(e) => setSelectedOfficer(e.target.value)}
                    className="custom-select"
                  >
                    <option value="">-- Choose Officer --</option>
                    {officers
                      .filter(o => o.police_station === selectedStation)
                      .map((o, i) => (
                        <option key={i} value={o.id}>{o.name} ({o.badge_number})</option>
                    ))}
                  </select>
                </div>

                <button 
                  onClick={triggerPatrolRouting}
                  disabled={!selectedOfficer}
                  className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Route className="w-4 h-4" /> Dispatch Optimal Route
                </button>

                {activeRoute && (
                  <div className="border-t border-gray-800 pt-4 mt-2">
                    <h4 className="text-xs uppercase text-gray-400 font-bold mb-2">Dispatch Details:</h4>
                    <div className="bg-slate-900 bg-opacity-70 p-3 rounded-lg border border-gray-800 text-xs flex flex-col gap-2">
                      <div>Assigned To: <strong>{activeRoute.officer_name}</strong></div>
                      <div>Jurisdiction: <strong>{activeRoute.police_station}</strong></div>
                      <div>Path Points: <strong>{activeRoute.waypoints.length}</strong></div>
                      <div className="text-yellow-500 font-semibold mt-1">
                        "{activeRoute.recommendation}"
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Map Router View */}
              <div className="lg:col-span-2 h-[450px] rounded-xl overflow-hidden border border-gray-800 shadow-2xl relative">
                <MapContainer center={BENGALURU_CENTER} zoom={13}>
                  <TileLayer
                    attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  />
                  
                  {activeRoute && (
                    <>
                      {/* Officer Starting Node */}
                      <CircleMarker
                        center={activeRoute.start_point}
                        radius={10}
                        fillColor="#10b981"
                        color="#10b981"
                        fillOpacity={0.8}
                      >
                        <Popup>
                          <div className="text-xs font-bold text-green-400">Officer Start Node</div>
                        </Popup>
                      </CircleMarker>

                      {/* Hotspots Waypoints */}
                      {activeRoute.waypoints.map((wp, i) => (
                        <CircleMarker
                          key={i}
                          center={[wp.latitude, wp.longitude]}
                          radius={8}
                          fillColor="#ef4444"
                          color="#ef4444"
                          fillOpacity={0.7}
                        >
                          <Popup>
                            <div className="text-xs">
                              <span className="font-bold text-red-400 block">Hotspot #{i+1}</span>
                              {wp.name}
                            </div>
                          </Popup>
                        </CircleMarker>
                      ))}

                      {/* TSP Optimized Route line */}
                      <Polyline
                        positions={activeRoute.route_coordinates}
                        color="#00b4d8"
                        weight={4}
                        dashArray="6, 8"
                        opacity={0.9}
                      />
                      
                      <ChangeMapView center={activeRoute.start_point} zoom={13} />
                    </>
                  )}
                </MapContainer>
              </div>
            </div>
          </div>
        )}

        {/* METRO RADII TAB */}
        {activeTab === 'metro' && (
          <div>
            <div className="header-container">
              <div className="header-title">
                <h2>Metro Zone Congestion Monitor</h2>
                <p>Analyze illegal parking violations and traffic risk indexes within metro radii buffers</p>
              </div>
            </div>

            {/* Slider */}
            <div className="glass-panel flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div className="flex-grow">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 font-bold uppercase">Configure Monitoring Buffer Radius</span>
                  <span className="text-sm font-bold text-yellow-500">{metroRadius} meters</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="500"
                  step="50"
                  value={metroRadius}
                  onChange={(e) => setMetroRadius(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#00b4d8]"
                />
              </div>
            </div>

            {/* Metro Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {metroStats.map((ms, i) => (
                <div key={i} className="glass-panel flex flex-col justify-between border-t-4 border-[#ef4444]">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-lg">{ms.name} Metro</h3>
                      <span className={`badge ${ms.status === 'CRITICAL' ? 'badge-high' : 'badge-med'}`}>
                        {ms.status}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 mb-4">
                      <span className="text-4xl font-extrabold text-white">{ms.violations_in_radius}</span>
                      <span className="text-xs text-gray-400">Violations within {metroRadius}m</span>
                    </div>

                    <div className="flex flex-col gap-2 text-xs border-t border-gray-800 pt-4">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Wrong Parking:</span>
                        <span className="font-semibold">{ms.wrong_parking}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">No Parking:</span>
                        <span className="font-semibold">{ms.no_parking}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Footpath Blockage:</span>
                        <span className="font-semibold text-yellow-500">{ms.footpath_parking}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400">Risk Score:</span>
                      <span className="font-bold">{ms.risk_score}/100</span>
                    </div>
                    <div className="w-full bg-gray-800 h-2 rounded overflow-hidden">
                      <span className={`h-full block ${ms.status === 'CRITICAL' ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${ms.risk_score}%` }}></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REPEAT OFFENDERS TAB */}
        {activeTab === 'offenders' && (
          <div>
            <div className="header-container">
              <div className="header-title">
                <h2>Repeat Offender Log & Tow Database</h2>
                <p>Track chronic violators and automate vehicle towing priorities</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Top Repeat Offenders List */}
              <div className="lg:col-span-1 glass-panel">
                <h3 className="text-sm font-semibold mb-4 text-gray-300 uppercase tracking-wider">Search Violator</h3>
                <div className="flex gap-2 mb-6">
                  <input
                    type="text"
                    placeholder="Enter Vehicle Plate (e.g. FKN00GL4424)"
                    value={offenderSearch}
                    onChange={(e) => setOffenderSearch(e.target.value)}
                    className="custom-input flex-grow text-xs"
                  />
                  <button onClick={triggerSearchOffender} className="btn-primary py-2 px-4">
                    <Search className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Top Recidivist Vehicles</h3>
                <div className="flex flex-col gap-3 overflow-y-auto max-h-96">
                  {repeatOffenders.map((ro, i) => (
                    <div 
                      key={i} 
                      onClick={() => { setOffenderSearch(ro.vehicle_number); triggerSearchOffender(); }}
                      className="p-3 bg-gray-900 bg-opacity-50 hover:bg-slate-800 rounded-lg border border-gray-800 cursor-pointer flex justify-between items-center transition"
                    >
                      <div>
                        <div className="font-mono text-sm font-bold text-[#00b4d8]">{ro.vehicle_number}</div>
                        <div className="text-[10px] text-gray-500 uppercase">{ro.vehicle_type}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-extrabold">{ro.violation_count} Violations</div>
                        <span className="badge badge-high mt-1 text-[9px] px-1 py-0.5">{ro.towing_priority} TOW</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Details Timeline */}
              <div className="lg:col-span-2 glass-panel">
                <h3 className="text-sm font-semibold mb-4 text-gray-300 uppercase tracking-wider">Violator Incident History Profile</h3>
                {selectedOffender ? (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-900 bg-opacity-70 p-4 rounded-xl border border-gray-800 mb-6">
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase">Violator Plate:</span>
                        <h4 className="font-mono text-2xl font-black text-yellow-500">{selectedOffender.vehicle_number}</h4>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase">Escalation Score:</span>
                        <div className="text-lg font-bold text-red-500">{selectedOffender.escalation_score}/100</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase">Towing Action priority:</span>
                        <div><span className="badge badge-high">{selectedOffender.towing_priority} PRIORITY</span></div>
                      </div>
                    </div>

                    <h4 className="text-xs uppercase text-gray-400 font-bold mb-3">Violation Timeline:</h4>
                    <div className="flex flex-col gap-4 max-h-80 overflow-y-auto">
                      {selectedOffender.history.map((hist, i) => (
                        <div key={i} className="flex gap-4 border-l-2 border-slate-700 pl-4 pb-2 position-relative">
                          <div className="flex-grow">
                            <div className="flex justify-between items-start">
                              <span className="text-xs font-semibold text-gray-300">{hist.location}</span>
                              <span className="text-[10px] text-gray-500 font-mono">{hist.timestamp}</span>
                            </div>
                            <div className="text-xs text-[#00b4d8] mt-1">{hist.violation_type}</div>
                            <div className="text-[10px] text-gray-500 mt-0.5">Enforcing Station: {hist.station}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-20 text-gray-500 text-xs">
                    Select or search a recidivist vehicle to view its chronological incident timeline and towing action priority.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI QUALITY CONTROL TAB */}
        {activeTab === 'qc' && (
          <div>
            <div className="header-container">
              <div className="header-title">
                <h2>AI Validation & Quality Control layer</h2>
                <p>Detect fraud patterns, analyze officer approval ratings, and check photo evidence resolution criteria</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Suspicious officers */}
              <div className="lg:col-span-2 glass-panel">
                <h3 className="text-sm font-semibold mb-4 text-gray-300 uppercase tracking-wider">Device & User Rejection Rate Analytics</h3>
                <table className="custom-table text-xs">
                  <thead>
                    <tr>
                      <th>Officer ID</th>
                      <th>Total Submissions</th>
                      <th>Approved</th>
                      <th>Rejected</th>
                      <th>Rejection Rate</th>
                      <th>Status Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qcMetrics.suspicious_officers.map((so, i) => (
                      <tr key={i}>
                        <td className="font-mono font-semibold text-[#00b4d8]">{so.officer_id}</td>
                        <td>{so.total_tickets}</td>
                        <td>{so.approved}</td>
                        <td className="text-red-400">{so.rejected}</td>
                        <td className="font-bold">{so.rejection_rate}%</td>
                        <td>
                          <span className={`badge ${so.rejection_rate > 24 ? 'badge-high' : 'badge-med'}`}>
                            {so.rejection_rate > 24 ? 'Flagged Alert' : 'Standard'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Alert Console */}
              <div className="lg:col-span-1 glass-panel">
                <h3 className="text-sm font-semibold mb-4 text-gray-300 uppercase tracking-wider">AI Fraud Alerts Console</h3>
                <div className="flex flex-col gap-4">
                  {qcMetrics.qc_alerts.map((al, i) => (
                    <div key={i} className="p-4 bg-gray-900 bg-opacity-70 border border-gray-800 rounded-lg flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {al.title}
                        </span>
                        <span className="badge badge-high text-[9px]">{al.severity}</span>
                      </div>
                      <p className="text-[11px] text-gray-400">{al.details}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* OFFICER MOBILE APP SIMULATION */}
        {activeTab === 'mobile' && (
          <div className="flex flex-col lg:flex-row gap-8 items-center justify-center">
            {/* Phone Screen Mockup */}
            <div className="mobile-mockup">
              <div className="mobile-notch"></div>
              <div className="mobile-screen">
                
                {/* Header */}
                <div className="flex justify-between items-center border-b border-gray-800 pb-3 mb-4 mt-2">
                  <span className="text-xs font-bold text-yellow-500">BTP MOBILE v2.4</span>
                  <span className="text-[10px] text-green-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-ping"></span> GPS Locked
                  </span>
                </div>

                {/* Sub-view: Home */}
                {mobileScreen === 'home' && (
                  <div className="flex flex-col gap-4 justify-center items-center flex-grow">
                    <div className="text-center">
                      <Smartphone className="w-16 h-16 text-[#00b4d8] mx-auto mb-4 animate-bounce" />
                      <h4 className="font-bold text-lg">Officer Terminal</h4>
                      <p className="text-xs text-gray-400 mt-1">Badge: BTP-Officer-100</p>
                    </div>

                    <button 
                      onClick={() => setMobileScreen('scan')}
                      className="btn-primary w-full flex items-center justify-center gap-2 py-3 mt-4"
                    >
                      <Camera className="w-5 h-5" /> Scan License Plate
                    </button>
                    <button 
                      onClick={() => setMobileScreen('sync')}
                      className="w-full border border-gray-700 hover:border-blue-500 text-gray-300 py-3 rounded-lg text-xs font-bold"
                    >
                      View Sent Tickets ({mobileTickets.length})
                    </button>
                  </div>
                )}

                {/* Sub-view: Scan OCR */}
                {mobileScreen === 'scan' && (
                  <div className="flex flex-col gap-4 flex-grow">
                    <h4 className="font-bold text-sm text-gray-200">AI Plate OCR Scanner</h4>
                    <p className="text-xs text-gray-400">Capture or upload photo of offending vehicle rear license plate</p>
                    
                    <div className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center bg-gray-900 bg-opacity-50 relative">
                      {ocrScanning ? (
                        <div className="text-xs text-yellow-500 font-bold animate-pulse py-8">
                          AI Core Reading Plate...
                        </div>
                      ) : (
                        <>
                          <Camera className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                          <label className="cursor-pointer text-xs font-bold text-blue-400 hover:text-blue-300">
                            Upload Photo Evidence
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={handleMobileImageUpload} 
                            />
                          </label>
                        </>
                      )}
                    </div>

                    {scannedPlate && (
                      <div className="bg-slate-900 p-3 rounded-lg border border-gray-800 text-xs flex flex-col gap-1">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Extracted Plate:</span>
                          <strong className="text-yellow-500 font-mono">{scannedPlate.license_plate}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">OCR Confidence:</span>
                          <strong className="text-green-400">{scannedPlate.confidence}%</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">QC Status:</span>
                          <strong className="text-green-400">{scannedPlate.image_quality.status}</strong>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 mt-auto">
                      <button 
                        onClick={() => { setScannedPlate(null); setMobileScreen('home'); }}
                        className="flex-grow border border-gray-800 text-xs py-2.5 rounded-lg text-gray-400"
                      >
                        Cancel
                      </button>
                      <button 
                        disabled={!scannedPlate}
                        onClick={() => setMobileScreen('ticket')}
                        className="flex-grow btn-primary text-xs py-2.5 rounded-lg disabled:opacity-50"
                      >
                        Proceed to Form
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub-view: Ticket Form */}
                {mobileScreen === 'ticket' && (
                  <form onSubmit={handleOfficerTicketSubmit} className="flex flex-col gap-3 flex-grow text-xs">
                    <h4 className="font-bold text-sm text-gray-200">Violation Ticket Details</h4>
                    
                    <div className="flex flex-col gap-1">
                      <label className="text-gray-400">Vehicle Number</label>
                      <input 
                        type="text" 
                        value={officerTicketForm.vehicle_number}
                        onChange={(e) => setOfficerTicketForm({ ...officerTicketForm, vehicle_number: e.target.value })}
                        className="custom-input py-1.5 text-xs font-mono"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-gray-400">Vehicle Type</label>
                      <select 
                        value={officerTicketForm.vehicle_type}
                        onChange={(e) => setOfficerTicketForm({ ...officerTicketForm, vehicle_type: e.target.value })}
                        className="custom-select py-1.5 text-xs"
                      >
                        <option value="CAR">Car</option>
                        <option value="SCOOTER">Scooter</option>
                        <option value="MOTOR CYCLE">Motorcycle</option>
                        <option value="PASSENGER AUTO">Passenger Auto</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-gray-400">Violation Type</label>
                      <select 
                        value={officerTicketForm.violation_type}
                        onChange={(e) => setOfficerTicketForm({ ...officerTicketForm, violation_type: e.target.value })}
                        className="custom-select py-1.5 text-xs"
                      >
                        <option value="WRONG PARKING">Wrong Parking</option>
                        <option value="NO PARKING">No Parking</option>
                        <option value="PARKING ON FOOTPATH">Parking on Footpath</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-gray-400">GPS Location</label>
                      <input 
                        type="text" 
                        value={officerTicketForm.location}
                        onChange={(e) => setOfficerTicketForm({ ...officerTicketForm, location: e.target.value })}
                        className="custom-input py-1.5 text-xs"
                        required
                      />
                    </div>

                    <div className="flex gap-2 mt-auto">
                      <button 
                        type="button" 
                        onClick={() => setMobileScreen('scan')}
                        className="flex-grow border border-gray-800 py-2.5 rounded-lg text-gray-400"
                      >
                        Back
                      </button>
                      <button 
                        type="submit"
                        className="flex-grow btn-primary py-2.5 rounded-lg"
                      >
                        Submit Ticket
                      </button>
                    </div>
                  </form>
                )}

                {/* Sub-view: Sync Status */}
                {mobileScreen === 'sync' && (
                  <div className="flex flex-col gap-4 flex-grow text-xs">
                    <div className="text-center">
                      <CheckCircle2 className="w-12 h-12 text-[#10b981] mx-auto mb-2" />
                      <h4 className="font-bold text-sm">Ticket Filed Successfully</h4>
                      <p className="text-[10px] text-gray-400">Data automatically synced to BTP SCITA Central Database</p>
                    </div>

                    <div className="flex-grow overflow-y-auto max-h-56 mt-2 border-t border-gray-800 pt-3">
                      <span className="text-[10px] uppercase font-bold text-gray-500 mb-2 block">Recent Session Submissions:</span>
                      {mobileTickets.map((t, idx) => (
                        <div key={idx} className="p-2 bg-slate-900 border border-gray-800 rounded mb-2 flex justify-between items-center">
                          <div>
                            <strong className="font-mono text-[#00b4d8]">{t.vehicle_number}</strong>
                            <div className="text-[9px] text-gray-500">{t.violation_type}</div>
                          </div>
                          <span className="text-[9px] text-gray-400">{t.timestamp}</span>
                        </div>
                      ))}
                    </div>

                    <button 
                      onClick={() => setMobileScreen('home')}
                      className="btn-primary w-full py-2.5 mt-auto"
                    >
                      Return to Terminal
                    </button>
                  </div>
                )}

              </div>
            </div>

            {/* Instruction Sidebar */}
            <div className="glass-panel max-w-sm">
              <h3 className="font-bold text-lg mb-2">Officer Terminal Simulation</h3>
              <p className="text-xs text-gray-400 mb-4">
                This simulator mirrors the smartphone client-app carried by Bengaluru Traffic Police officers on foot patrol.
              </p>
              <h4 className="text-xs uppercase text-gray-400 font-bold mb-2">Simulation Steps:</h4>
              <ol className="list-decimal list-inside text-xs text-gray-300 flex flex-col gap-3">
                <li>Click <strong>Scan License Plate</strong> on the phone terminal.</li>
                <li>Upload any photo containing a plate number or leave empty to auto-simulate a plate read.</li>
                <li>Review the AI OCR reading confidence and image resolution status tags.</li>
                <li>Submit the ticket to immediately sync it with the BTP Central SCITA pipeline.</li>
              </ol>
            </div>
          </div>
        )}

        {/* CITIZEN PORTAL TAB */}
        {activeTab === 'citizen' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Report Form */}
            <div className="glass-panel">
              <h3 className="font-bold text-lg mb-2">Public Incident Reporting Portal</h3>
              <p className="text-xs text-gray-400 mb-6">
                Bengaluru citizens can report illegal street parking, footpath obstruction, and junction blocks.
              </p>

              {citizenMessage ? (
                <div className="p-4 bg-green-950 bg-opacity-50 border border-[#10b981] rounded-xl text-center flex flex-col gap-2">
                  <CheckCircle2 className="w-12 h-12 text-[#10b981] mx-auto" />
                  <h4 className="font-bold text-sm">Complaint Filed Successfully</h4>
                  <p className="text-xs text-gray-400">
                    Use tracking ID below to check the dispatch and resolution status:
                  </p>
                  <strong className="text-lg font-mono text-yellow-500">{citizenMessage.tracking_id}</strong>
                  <button 
                    onClick={() => setCitizenMessage(null)}
                    className="btn-primary mt-4 py-2 text-xs"
                  >
                    File Another Report
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCitizenSubmit} className="flex flex-col gap-4 text-xs">
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-400">Street / Location Description</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Near Indiranagar Metro Station Gate A, Bengaluru"
                      value={citizenForm.location}
                      onChange={(e) => setCitizenForm({ ...citizenForm, location: e.target.value })}
                      className="custom-input"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-gray-400">Vehicle Type</label>
                      <select 
                        value={citizenForm.vehicle_type}
                        onChange={(e) => setCitizenForm({ ...citizenForm, vehicle_type: e.target.value })}
                        className="custom-select"
                      >
                        <option value="CAR">Car</option>
                        <option value="SCOOTER">Scooter</option>
                        <option value="MOTOR CYCLE">Motorcycle</option>
                        <option value="PASSENGER AUTO">Passenger Auto</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-gray-400">Vehicle Plate (If Visible)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. KA53MB1234"
                        value={citizenForm.reported_vehicle_number}
                        onChange={(e) => setCitizenForm({ ...citizenForm, reported_vehicle_number: e.target.value })}
                        className="custom-input font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-gray-400">Violation Details</label>
                    <textarea 
                      placeholder="e.g. White sedan parked directly blocking the pedestrian walking footpath."
                      value={citizenForm.violation_details}
                      onChange={(e) => setCitizenForm({ ...citizenForm, violation_details: e.target.value })}
                      className="custom-input h-24"
                      required
                    />
                  </div>

                  <div className="border-2 border-dashed border-gray-800 rounded-lg p-6 text-center bg-gray-950">
                    <Camera className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                    <span className="text-[10px] text-gray-500 block">Attach Photo Evidence (JPEG/PNG)</span>
                  </div>

                  <button type="submit" className="btn-primary py-3">
                    Submit Parking Violation Report
                  </button>
                </form>
              )}
            </div>

            {/* Tracking Portal */}
            <div className="flex flex-col gap-6">
              <div className="glass-panel">
                <h3 className="font-bold text-sm mb-2 uppercase tracking-wider text-gray-300">Track Complaint Status</h3>
                <form onSubmit={handleTrackReport} className="flex gap-2 text-xs">
                  <input 
                    type="text" 
                    placeholder="Enter Tracking ID (e.g. TRACK-1024)"
                    value={trackingIdInput}
                    onChange={(e) => setTrackingIdInput(e.target.value)}
                    className="custom-input flex-grow font-mono"
                    required
                  />
                  <button type="submit" className="btn-primary py-2 px-4">Track</button>
                </form>

                {trackedReport && (
                  <div className="mt-6 border-t border-gray-800 pt-4 text-xs flex flex-col gap-3">
                    <div className="flex justify-between items-center bg-gray-900 p-3 rounded-lg">
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase">Complaint Status:</span>
                        <strong className="block text-yellow-500">{trackedReport.status}</strong>
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono">{trackedReport.tracking_id}</span>
                    </div>

                    <div className="flex flex-col gap-1 text-[11px] text-gray-300">
                      <div>Location: <strong>{trackedReport.location}</strong></div>
                      <div>Vehicle: <strong>{trackedReport.reported_vehicle_number} ({trackedReport.vehicle_type})</strong></div>
                      <div className="mt-1 text-gray-400">"{trackedReport.violation_details}"</div>
                    </div>

                    <div className="border-t border-gray-800 pt-3">
                      <span className="font-bold text-gray-400 block mb-2">Activity Log:</span>
                      <div className="flex flex-col gap-3">
                        {trackedReport.updates.map((up, idx) => (
                          <div key={idx} className="flex gap-2 text-[10px]">
                            <Clock className="w-3 h-3 text-[#00b4d8] flex-shrink-0" />
                            <div>
                              <strong className="text-gray-300">{up.status}</strong>
                              <p className="text-gray-500 mt-0.5">{up.details} - <span className="italic">{up.timestamp}</span></p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
