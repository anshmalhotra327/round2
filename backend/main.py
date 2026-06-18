import os
import sqlite3
import json
import random
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

# Import local engines
from ml_engine import get_risk_prediction
from routing_engine import calculate_tsp_route
from ocr_engine import simulate_ocr

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "parking_intelligence.db")

app = FastAPI(title="Smart Parking Enforcement & Traffic Congestion Management API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://round2-one.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Coordinates for major metro stations
METRO_STATIONS = {
    "Majestic": (12.9756, 77.5729),
    "Hosahalli": (12.9743, 77.5496),
    "Indiranagar": (12.9784, 77.6408),
    "MG Road": (12.9754, 77.6068),
    "Yeshwanthpur": (13.0236, 77.5500)
}

# Mock alternative parking lots in Bengaluru near key hotspots
MOCK_PARKING_LOTS = [
    {"name": "Majestic Multi-Level Parking", "latitude": 12.9772, "longitude": 77.5715, "capacity": 350, "available": 124, "rate": "30 INR/hr"},
    {"name": "Shivajinagar BBMP Parking Lot", "latitude": 12.9855, "longitude": 77.5992, "capacity": 200, "available": 45, "rate": "20 INR/hr"},
    {"name": "Malleshwaram 18th Cross Parking", "latitude": 13.0082, "longitude": 77.5684, "capacity": 150, "available": 82, "rate": "20 INR/hr"},
    {"name": "Koramangala 80 Feet Road Parking", "latitude": 12.9348, "longitude": 77.6190, "capacity": 100, "available": 15, "rate": "40 INR/hr"},
    {"name": "Indiranagar Metro Parking Ground", "latitude": 12.9780, "longitude": 77.6415, "capacity": 180, "available": 95, "rate": "30 INR/hr"},
]

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Request schemas
class CitizenReportSubmit(BaseModel):
    latitude: float
    longitude: float
    location: str
    vehicle_type: str
    reported_vehicle_number: str
    violation_details: str

class OfficerViolationSubmit(BaseModel):
    officer_id: str
    latitude: float
    longitude: float
    location: str
    vehicle_number: str
    vehicle_type: str
    violation_type: str
    offence_code: str
    image_name: Optional[str] = "live_scan.jpg"

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# 1. CORE ANALYTICS ENDPOINTS
@app.get("/api/analytics/summary")
def get_analytics_summary():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Total counts
    cursor.execute("SELECT COUNT(*) FROM violations")
    total_violations = cursor.execute("SELECT COUNT(*) FROM violations").fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM violations WHERE validation_status = 'approved'")
    approved_violations = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM violations WHERE validation_status = 'rejected'")
    rejected_violations = cursor.fetchone()[0]
    
    approval_rate = approved_violations / (approved_violations + rejected_violations) if (approved_violations + rejected_violations) > 0 else 0.0
    
    # Active officers
    cursor.execute("SELECT COUNT(*) FROM officers WHERE status = 'Active'")
    active_officers = cursor.fetchone()[0]
    
    # Pending citizen reports
    cursor.execute("SELECT COUNT(*) FROM citizen_reports WHERE status = 'Pending'")
    pending_citizen = cursor.fetchone()[0]
    
    # Violation counts by vehicle type
    cursor.execute("SELECT vehicle_type, COUNT(*) as count FROM violations GROUP BY vehicle_type ORDER BY count DESC LIMIT 5")
    vehicle_distribution = {row['vehicle_type']: row['count'] for row in cursor.fetchall()}
    
    # SCITA sync status
    cursor.execute("SELECT data_sent_to_scita, COUNT(*) FROM violations GROUP BY data_sent_to_scita")
    scita_sync = {str(row[0]): row[1] for row in cursor.fetchall()}
    
    conn.close()
    
    # Hardcoded/Pre-calculated weekly trend for fast loading
    weekly_trend = [
        {"day": "Monday", "violations": 38931},
        {"day": "Tuesday", "violations": 42930},
        {"day": "Wednesday", "violations": 43067},
        {"day": "Thursday", "violations": 41528},
        {"day": "Friday", "violations": 41702},
        {"day": "Saturday", "violations": 43427},
        {"day": "Sunday", "violations": 46865}
    ]
    
    # Hourly distribution in local time (pre-computed summary for quick dashboard chart)
    hourly_distribution = [
        {"hour": "00:00", "violations": 14608}, # Local IST hours mapping (shifted by 5.5h)
        {"hour": "03:00", "violations": 3145},
        {"hour": "06:00", "violations": 219},
        {"hour": "09:00", "violations": 818},
        {"hour": "12:00", "violations": 10713},
        {"hour": "15:00", "violations": 19763},
        {"hour": "18:00", "violations": 22840},
        {"hour": "21:00", "violations": 34085}
    ]
    
    return {
        "total_violations": total_violations,
        "approval_rate": round(approval_rate * 100, 1),
        "active_officers": active_officers,
        "pending_citizen_reports": pending_citizen,
        "vehicle_distribution": vehicle_distribution,
        "scita_sync": scita_sync,
        "weekly_trend": weekly_trend,
        "hourly_distribution": hourly_distribution
    }

@app.get("/api/analytics/stations")
def get_station_analytics():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT police_station, COUNT(*) as total_violations,
           SUM(CASE WHEN validation_status = 'approved' THEN 1 ELSE 0 END) as approved_count,
           SUM(CASE WHEN validation_status = 'rejected' THEN 1 ELSE 0 END) as rejected_count
    FROM violations
    GROUP BY police_station
    ORDER BY total_violations DESC
    LIMIT 15
    """
    cursor.execute(query)
    stations = []
    for row in cursor.fetchall():
        total = row['total_violations']
        app_c = row['approved_count']
        rej_c = row['rejected_count']
        app_rate = round((app_c / (app_c + rej_c)) * 100, 1) if (app_c + rej_c) > 0 else 0.0
        
        # Calculate a mock productivity index
        productivity = round((app_c / 1000) * 8.5, 1)
        
        stations.append({
            "police_station": row['police_station'],
            "total_violations": total,
            "approval_rate": app_rate,
            "productivity_score": productivity
        })
        
    conn.close()
    return stations

# 2. GEOSPATIAL MAP HOTSPOTS
@app.get("/api/map/hotspots")
def get_map_hotspots(
    police_station: Optional[str] = None,
    violation_type: Optional[str] = None,
    vehicle_type: Optional[str] = None
):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Build filter conditions
    conditions = []
    params = []
    
    if police_station and police_station != "All":
        conditions.append("police_station = ?")
        params.append(police_station)
    if violation_type and violation_type != "All":
        conditions.append("violation_type LIKE ?")
        params.append(f"%{violation_type}%")
    if vehicle_type and vehicle_type != "All":
        conditions.append("vehicle_type = ?")
        params.append(vehicle_type)
        
    where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
    
    # To keep payload small and map fast, we group by rounded lat/lon to generate grid hotspots
    query = f"""
    SELECT ROUND(latitude, 3) as lat_grid, ROUND(longitude, 3) as lon_grid, 
           COUNT(*) as count, location, police_station
    FROM violations
    {where_clause}
    GROUP BY lat_grid, lon_grid
    ORDER BY count DESC
    LIMIT 300
    """
    
    cursor.execute(query, params)
    hotspots = []
    for row in cursor.fetchall():
        # Congestion impact score computation
        cnt = row['count']
        # Proximity to metro/junction gives base weights
        base_impact = min(100, int(cnt * 0.15 + random.randint(10, 30)))
        
        hotspots.append({
            "latitude": row['lat_grid'],
            "longitude": row['lon_grid'],
            "count": cnt,
            "location": row['location'],
            "police_station": row['police_station'],
            "congestion_score": base_impact
        })
        
    conn.close()
    return hotspots

# 3. ML PREDICTIVE ENGINE
@app.get("/api/predict")
def get_prediction(latitude: float, longitude: float, hour: int, day: str):
    try:
        res = get_risk_prediction(latitude, longitude, hour, day)
        
        # Generate specific forecast sentences
        prob_percent = int(res['probability'] * 100)
        station_name = "this zone"
        
        # Formulate recommendations based on risk
        if res['risk_level'] == "High":
            recs = [
                "Deploy 2-3 patrol officers immediately.",
                "Recommend towing vehicles parked along the main carriageway.",
                "Activate peak-hour intervention plan."
            ]
        elif res['risk_level'] == "Medium":
            recs = [
                "Increase patrol frequency by 1.5x.",
                "Issue electronic warnings via signage boards.",
                "Alert nearby officers of rising violation probability."
            ]
        else:
            recs = [
                "Standard routine patrol.",
                "Monitor via traffic cameras."
            ]
            
        return {
            "latitude": latitude,
            "longitude": longitude,
            "probability": res['probability'],
            "risk_level": res['risk_level'],
            "congestion_risk_score": res['congestion_risk_score'],
            "forecast_sentence": f"This location has an estimated {prob_percent}% chance of experiencing high parking violation density on {day}s around {hour:02d}:00.",
            "recommendations": recs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/predict/grid")
def get_prediction_grid(hour: int, day: str, police_station: Optional[str] = "All"):
    # Return forecast scores for the top 50 hotspots to save latency
    conn = get_db_connection()
    cursor = conn.cursor()
    
    where = "WHERE police_station = ?" if police_station != "All" else ""
    params = [police_station] if police_station != "All" else []
    
    query = f"""
    SELECT ROUND(latitude, 3) as lat_grid, ROUND(longitude, 3) as lon_grid, 
           COUNT(*) as cnt, location, police_station
    FROM violations
    {where}
    GROUP BY lat_grid, lon_grid
    ORDER BY cnt DESC
    LIMIT 60
    """
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    grid_predictions = []
    for r in rows:
        pred = get_risk_prediction(r['lat_grid'], r['lon_grid'], hour, day)
        grid_predictions.append({
            "latitude": r['lat_grid'],
            "longitude": r['lon_grid'],
            "location": r['location'],
            "police_station": r['police_station'],
            "historical_count": r['cnt'],
            "predicted_risk_score": pred['congestion_risk_score'],
            "risk_level": pred['risk_level']
        })
        
    return grid_predictions

# 4. PATROL ROUTING
@app.get("/api/patrol/route")
def get_patrol_route(police_station: str, officer_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get officer starting location
    cursor.execute("SELECT latitude, longitude, name FROM officers WHERE id = ?", (officer_id,))
    officer_row = cursor.fetchone()
    
    if not officer_row:
        # Default starting location (near police station mean or Majestic)
        start_lat, start_lon = 12.9756, 77.5729
        officer_name = "Officer Dispatch"
    else:
        start_lat = officer_row['latitude']
        start_lon = officer_row['longitude']
        officer_name = officer_row['name']
        
    # Get top 5 violation hotspots in this officer's police station jurisdiction
    query = """
    SELECT ROUND(latitude, 3) as lat_grid, ROUND(longitude, 3) as lon_grid, 
           COUNT(*) as count, location
    FROM violations
    WHERE police_station = ?
    GROUP BY lat_grid, lon_grid
    ORDER BY count DESC
    LIMIT 5
    """
    cursor.execute(query, (police_station,))
    hotspots = []
    for row in cursor.fetchall():
        hotspots.append({
            "latitude": row['lat_grid'],
            "longitude": row['lon_grid'],
            "name": row['location'],
            "count": row['count']
        })
        
    conn.close()
    
    if not hotspots:
        raise HTTPException(status_code=404, detail=f"No hotspots found for police station: {police_station}")
        
    # Run TSP algorithm
    optimized_path = calculate_tsp_route(start_lat, start_lon, hotspots)
    
    # Build response polyline coordinates
    route_coordinates = [[start_lat, start_lon]] + [[h['latitude'], h['longitude']] for h in optimized_path]
    
    # Create recommendations
    recs = f"Optimal route generated for {officer_name} containing {len(optimized_path)} illegal parking choke points."
    
    return {
        "officer_id": officer_id,
        "officer_name": officer_name,
        "police_station": police_station,
        "start_point": [start_lat, start_lon],
        "waypoints": optimized_path,
        "route_coordinates": route_coordinates,
        "recommendation": recs
    }

# 5. REPEAT OFFENDERS
@app.get("/api/repeat-offenders")
def get_repeat_offenders(limit: int = 20):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get vehicles with highest count
    query = """
    SELECT vehicle_number, COUNT(*) as violation_count, vehicle_type,
           SUM(CASE WHEN validation_status = 'approved' THEN 1 ELSE 0 END) as approved_count
    FROM violations
    WHERE vehicle_number != 'FKN00GL0000' AND vehicle_number != 'UNKNOWN'
    GROUP BY vehicle_number
    ORDER BY violation_count DESC
    LIMIT ?
    """
    cursor.execute(query, (limit,))
    offenders = []
    for row in cursor.fetchall():
        cnt = row['violation_count']
        escalation_score = min(100, cnt * 6)
        towing_priority = "HIGH" if escalation_score >= 80 else "MEDIUM" if escalation_score >= 50 else "LOW"
        
        offenders.append({
            "vehicle_number": row['vehicle_number'],
            "vehicle_type": row['vehicle_type'],
            "violation_count": cnt,
            "escalation_score": escalation_score,
            "towing_priority": towing_priority
        })
        
    conn.close()
    return offenders

@app.get("/api/repeat-offenders/{vehicle_number}")
def get_offender_detail(vehicle_number: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT id, created_at_local, location, violation_type, validation_status, police_station
    FROM violations
    WHERE vehicle_number = ? OR updated_vehicle_number = ?
    ORDER BY created_at_local DESC
    """
    cursor.execute(query, (vehicle_number, vehicle_number))
    records = []
    for row in cursor.fetchall():
        records.append({
            "id": row['id'],
            "timestamp": row['created_at_local'],
            "location": row['location'],
            "violation_type": row['violation_type'],
            "status": row['validation_status'],
            "station": row['police_station']
        })
        
    conn.close()
    
    if not records:
        raise HTTPException(status_code=404, detail="Vehicle number not found.")
        
    cnt = len(records)
    escalation_score = min(100, cnt * 6)
    towing_priority = "HIGH" if escalation_score >= 80 else "MEDIUM" if escalation_score >= 50 else "LOW"
    
    return {
        "vehicle_number": vehicle_number,
        "violation_count": cnt,
        "escalation_score": escalation_score,
        "towing_priority": towing_priority,
        "history": records
    }

# 6. METRO MONITORING RADII
@app.get("/api/metro/stats")
def get_metro_zone_stats(radius_meters: float = Query(200.0, description="Radius around station in meters")):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    metro_results = {}
    
    for name, coords in METRO_STATIONS.items():
        # Query pre-computed dist column (converted to meters)
        col_name = f"dist_to_{name.lower().replace(' ', '_')}_metro"
        
        query = f"""
        SELECT COUNT(*) as count,
               SUM(CASE WHEN violation_type LIKE '%WRONG PARKING%' THEN 1 ELSE 0 END) as wrong_parking,
               SUM(CASE WHEN violation_type LIKE '%NO PARKING%' THEN 1 ELSE 0 END) as no_parking,
               SUM(CASE WHEN violation_type LIKE '%FOOTPATH%' THEN 1 ELSE 0 END) as footpath_parking
        FROM violations
        WHERE {col_name} <= ?
        """
        cursor.execute(query, (radius_meters,))
        row = cursor.fetchone()
        
        # Risk assessment based on count inside radius
        count = row['count'] or 0
        risk_score = min(100, int(count * 0.15))
        
        metro_results[name] = {
            "name": name,
            "coordinates": coords,
            "violations_in_radius": count,
            "wrong_parking": row['wrong_parking'] or 0,
            "no_parking": row['no_parking'] or 0,
            "footpath_parking": row['footpath_parking'] or 0,
            "risk_score": risk_score,
            "status": "CRITICAL" if risk_score > 75 else "WARNING" if risk_score > 40 else "NORMAL"
        }
        
    conn.close()
    return list(metro_results.values())

# 7. CITIZEN PORTAL
@app.post("/api/citizen/report")
def submit_citizen_report(report: CitizenReportSubmit):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    report_id = f"FKCIT{random.randint(100000, 999999)}"
    tracking_id = f"TRACK-{random.randint(1000, 9999)}"
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    cursor.execute("""
    INSERT INTO citizen_reports VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        report_id,
        report.latitude,
        report.longitude,
        report.location,
        "citizen_report_upload.jpg", # Mock upload image
        report.vehicle_type,
        report.reported_vehicle_number,
        report.violation_details,
        "Pending",
        now_str,
        tracking_id,
        json.dumps([{"timestamp": now_str, "status": "Pending", "details": "Citizen report filed successfully."}])
    ))
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "report_id": report_id,
        "tracking_id": tracking_id,
        "message": "Report submitted. Bangalore Traffic Police will review it shortly."
    }

@app.get("/api/citizen/report/{tracking_id}")
def get_citizen_report_status(tracking_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM citizen_reports WHERE tracking_id = ?", (tracking_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Tracking ID not found.")
        
    return {
        "id": row['id'],
        "tracking_id": row['tracking_id'],
        "location": row['location'],
        "vehicle_type": row['vehicle_type'],
        "reported_vehicle_number": row['reported_vehicle_number'],
        "violation_details": row['violation_details'],
        "status": row['status'],
        "created_at": row['created_at'],
        "updates": json.loads(row['action_updates'])
    }

@app.get("/api/citizen/reports")
def get_all_citizen_reports():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM citizen_reports ORDER BY created_at DESC")
    reports = []
    for r in cursor.fetchall():
        reports.append({
            "id": r['id'],
            "tracking_id": r['tracking_id'],
            "latitude": r['latitude'],
            "longitude": r['longitude'],
            "location": r['location'],
            "vehicle_type": r['vehicle_type'],
            "reported_vehicle_number": r['reported_vehicle_number'],
            "violation_details": r['violation_details'],
            "status": r['status'],
            "created_at": r['created_at']
        })
    conn.close()
    return reports

# 8. OFFICER PORTAL / MOBILE APP SIMULATION
@app.post("/api/officer/scan-plate")
def scan_plate(image: UploadFile = File(...)):
    # Run OCR simulator on uploaded filename
    ocr_result = simulate_ocr(image.filename)
    return ocr_result

@app.post("/api/officer/submit")
def submit_officer_violation(ticket: OfficerViolationSubmit):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    ticket_id = f"FKID{random.randint(300000, 999999)}"
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    # Store ticket in SQLite violations table
    cursor.execute("""
    INSERT INTO violations (
        id, latitude, longitude, location, vehicle_number, vehicle_type,
        violation_type, offence_code, created_at_local, hour, day_of_week, month,
        device_id, created_by_id, center_code, police_station, data_sent_to_scita,
        junction_name, updated_vehicle_number, updated_vehicle_type, validation_status,
        dist_to_majestic_metro, dist_to_hosahalli_metro, dist_to_indiranagar_metro,
        dist_to_mg_road_metro, dist_to_yeshwanthpur_metro
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ticket_id,
        ticket.latitude,
        ticket.longitude,
        ticket.location,
        ticket.vehicle_number,
        ticket.vehicle_type,
        json.dumps([ticket.violation_type]),
        ticket.offence_code,
        now_str,
        datetime.now().hour,
        datetime.now().strftime('%A'),
        datetime.now().month,
        "FKDEV-MOBILE",
        ticket.officer_id,
        99, # Mock center code
        "Upparpet", # Mock active patrol station
        1, # Sent to SCITA
        "No Junction",
        ticket.vehicle_number,
        ticket.vehicle_type,
        "approved",
        5000.0, 5000.0, 5000.0, 5000.0, 5000.0 # Placeholder distances
    ))
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "ticket_id": ticket_id,
        "message": f"Violation ticket {ticket_id} filed and approved successfully."
    }

# 9. OFFICERS AND DISPATCH
@app.get("/api/officers")
def get_officers():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM officers")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# 10. ALTERNATIVE PARKING AND TOWING SUGGESTIONS
@app.get("/api/alternative-parking")
def get_alternative_parking(latitude: float, longitude: float):
    # Sort alternative parking spots by distance to coordinate
    results = []
    for lot in MOCK_PARKING_LOTS:
        dist = np.sqrt((lot['latitude'] - latitude)**2 + (lot['longitude'] - longitude)**2) * 111000 # Approximation in meters
        results.append({
            "name": lot['name'],
            "latitude": lot['latitude'],
            "longitude": lot['longitude'],
            "capacity": lot['capacity'],
            "available": lot['available'],
            "rate": lot['rate'],
            "distance_meters": int(dist)
        })
    results.sort(key=lambda x: x['distance_meters'])
    return results[:3]

# 11. AI QUALITY CONTROL & SUSPICIOUS DETECTOR
@app.get("/api/validation/qc")
def get_qc_metrics():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Approval vs rejection by user / device
    cursor.execute("""
    SELECT created_by_id, COUNT(*) as total,
           SUM(CASE WHEN validation_status = 'approved' THEN 1 ELSE 0 END) as approved_count,
           SUM(CASE WHEN validation_status = 'rejected' THEN 1 ELSE 0 END) as rejected_count
    FROM violations
    WHERE created_by_id IS NOT NULL AND created_by_id != 'FKUSR00000'
    GROUP BY created_by_id
    HAVING total > 100
    ORDER BY rejected_count DESC
    LIMIT 10
    """)
    suspicious_users = []
    for row in cursor.fetchall():
        total = row['total']
        app_c = row['approved_count']
        rej_c = row['rejected_count']
        rej_rate = round((rej_c / total) * 100, 1)
        suspicious_users.append({
            "officer_id": row['created_by_id'],
            "total_tickets": total,
            "approved": app_c,
            "rejected": rej_c,
            "rejection_rate": rej_rate,
            "quality_status": "CRITICAL (High Rejection)" if rej_rate > 40 else "WARNING" if rej_rate > 25 else "NORMAL"
        })
        
    conn.close()
    return {
        "suspicious_officers": suspicious_users,
        "qc_alerts": [
            {"id": "AL-109", "title": "Double Ticket Submission Alert", "details": "Officer FKUSR00021 submitted 2 tickets for plate FKN00GL4424 within 3 minutes near Safina Plaza.", "severity": "Medium"},
            {"id": "AL-110", "title": "Low Image Resolution", "details": "Device FKDEV00082 has uploaded 15 tickets today failing the clarity confidence threshold.", "severity": "Low"}
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
