import os
import sqlite3
import pandas as pd
import numpy as np
import json

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "parking_intelligence.db")
CSV_PATH = r"c:\ANSH_MALHOTRA\ROUND2\jan to may police violation_anonymized791b166.csv"

# Major Metro Stations in Bengaluru
METRO_STATIONS = {
    "Majestic": (12.9756, 77.5729),
    "Hosahalli": (12.9743, 77.5496),
    "Indiranagar": (12.9784, 77.6408),
    "MG Road": (12.9754, 77.6068),
    "Yeshwanthpur": (13.0236, 77.5500)
}

def haversine_distance(lat1, lon1, lat2, lon2):
    # R = 6371000 # Earth radius in meters
    # Vectorized haversine distance in meters
    phi1 = np.radians(lat1)
    phi2 = np.radians(lat2)
    delta_phi = np.radians(lat2 - lat1)
    delta_lambda = np.radians(lon2 - lon1)
    
    a = np.sin(delta_phi/2.0)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(delta_lambda/2.0)**2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1-a))
    return 6371000 * c

def main():
    print("Starting database initialization...")
    print(f"Connecting to database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Drop existing table if any
    cursor.execute("DROP TABLE IF EXISTS violations")
    cursor.execute("DROP TABLE IF EXISTS officers")
    cursor.execute("DROP TABLE IF EXISTS citizen_reports")
    
    print("Reading CSV data...")
    # Read the CSV file
    df = pd.read_csv(CSV_PATH, low_memory=False)
    print(f"Read {len(df)} rows from CSV.")

    # Clean date time
    print("Parsing datetimes and converting to Asia/Kolkata...")
    df['created_datetime'] = pd.to_datetime(df['created_datetime'], format='mixed')
    df['created_datetime_local'] = df['created_datetime'].dt.tz_convert('Asia/Kolkata')
    
    # Store datetime as string in database
    df['created_at_local'] = df['created_datetime_local'].dt.strftime('%Y-%m-%d %H:%M:%S')
    df['hour'] = df['created_datetime_local'].dt.hour
    df['day_of_week'] = df['created_datetime_local'].dt.day_name()
    df['month'] = df['created_datetime_local'].dt.month
    
    # Fill nulls
    print("Cleaning missing values...")
    df['police_station'] = df['police_station'].fillna("Unknown")
    df['junction_name'] = df['junction_name'].fillna("No Junction")
    df['validation_status'] = df['validation_status'].fillna("approved")
    df['vehicle_type'] = df['vehicle_type'].fillna("UNKNOWN")
    df['updated_vehicle_type'] = df['updated_vehicle_type'].fillna(df['vehicle_type'])
    df['updated_vehicle_number'] = df['updated_vehicle_number'].fillna(df['vehicle_number'])
    df['location'] = df['location'].fillna("Unknown Bengaluru Street")
    df['center_code'] = df['center_code'].fillna(0).astype(int)

    # Compute distances to key metro stations
    print("Computing distances to major Metro Stations...")
    for name, coords in METRO_STATIONS.items():
        df[f"dist_to_{name.lower().replace(' ', '_')}_metro"] = haversine_distance(
            df['latitude'].values, df['longitude'].values, coords[0], coords[1]
        )

    # Convert violation_type and offence_code back to clean strings/JSONs if needed
    df['violation_type'] = df['violation_type'].fillna('["UNKNOWN"]')
    df['offence_code'] = df['offence_code'].fillna('[]')

    # Convert to SQLite
    print("Writing data to SQLite 'violations' table (this may take 10-15 seconds)...")
    # Columns to save
    cols_to_save = [
        'id', 'latitude', 'longitude', 'location', 'vehicle_number', 'vehicle_type',
        'violation_type', 'offence_code', 'created_at_local', 'hour', 'day_of_week', 'month',
        'device_id', 'created_by_id', 'center_code', 'police_station', 'data_sent_to_scita',
        'junction_name', 'updated_vehicle_number', 'updated_vehicle_type', 'validation_status',
        'dist_to_majestic_metro', 'dist_to_hosahalli_metro', 'dist_to_indiranagar_metro',
        'dist_to_mg_road_metro', 'dist_to_yeshwanthpur_metro'
    ]
    df_db = df[cols_to_save]
    df_db.to_sql('violations', conn, if_exists='replace', index=False)
    
    # Create indexes for high-speed queries
    print("Creating database indexes...")
    cursor.execute("CREATE INDEX idx_police_station ON violations(police_station)")
    cursor.execute("CREATE INDEX idx_junction_name ON violations(junction_name)")
    cursor.execute("CREATE INDEX idx_created_at_local ON violations(created_at_local)")
    cursor.execute("CREATE INDEX idx_vehicle_number ON violations(vehicle_number)")
    cursor.execute("CREATE INDEX idx_updated_vehicle_number ON violations(updated_vehicle_number)")
    cursor.execute("CREATE INDEX idx_validation_status ON violations(validation_status)")
    cursor.execute("CREATE INDEX idx_hour_day ON violations(hour, day_of_week)")
    cursor.execute("CREATE INDEX idx_lat_lon ON violations(latitude, longitude)")

    # Create other tables: officers, citizen_reports, patrol_routes
    print("Creating auxiliary tables...")
    
    # Officers table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS officers (
        id TEXT PRIMARY KEY,
        name TEXT,
        badge_number TEXT,
        police_station TEXT,
        status TEXT, -- 'Active', 'Off-duty', 'Dispatched'
        latitude REAL,
        longitude REAL,
        last_active_timestamp TEXT
    )
    """)
    
    # Pre-populate some mock officers based on top police stations
    top_stations = df['police_station'].value_counts().head(10).index.tolist()
    mock_officers = []
    for i, station in enumerate(top_stations):
        # Coordinates near station hotspots
        station_df = df[df['police_station'] == station]
        mean_lat = station_df['latitude'].mean()
        mean_lon = station_df['longitude'].mean()
        mock_officers.append((
            f"FKUSR00{100 + i}",
            f"Officer {i+1} ({station})",
            f"BTP-Badge-{2000 + i}",
            station,
            "Active",
            mean_lat + np.random.uniform(-0.005, 0.005),
            mean_lon + np.random.uniform(-0.005, 0.005),
            "2026-06-18 12:00:00"
        ))
    cursor.executemany("INSERT INTO officers VALUES (?,?,?,?,?,?,?,?)", mock_officers)

    # Citizen Reports table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS citizen_reports (
        id TEXT PRIMARY KEY,
        latitude REAL,
        longitude REAL,
        location TEXT,
        image_url TEXT,
        vehicle_type TEXT,
        reported_vehicle_number TEXT,
        violation_details TEXT,
        status TEXT, -- 'Pending', 'Verified', 'Rejected', 'Officer Dispatched', 'Resolved'
        created_at TEXT,
        tracking_id TEXT,
        action_updates TEXT
    )
    """)

    # Patrol routes table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS patrol_routes (
        id TEXT PRIMARY KEY,
        officer_id TEXT,
        police_station TEXT,
        route_points_json TEXT, -- JSON coordinates list
        status TEXT, -- 'Active', 'Completed'
        created_at TEXT
    )
    """)

    conn.commit()
    conn.close()
    print("Database initialization completed successfully!")

if __name__ == "__main__":
    main()
