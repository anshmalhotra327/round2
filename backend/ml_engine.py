import os
import sqlite3
import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score, accuracy_score

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "parking_intelligence.db")
MODEL_PATH = os.path.join(DATA_DIR, "risk_model.pkl")

# Metro Stations Coordinates
METRO_STATIONS = {
    "Majestic": (12.9756, 77.5729),
    "Hosahalli": (12.9743, 77.5496),
    "Indiranagar": (12.9784, 77.6408),
    "MG Road": (12.9754, 77.6068),
    "Yeshwanthpur": (13.0236, 77.5500)
}

# Day of week mapping
DAY_MAP = {
    'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
    'Friday': 4, 'Saturday': 5, 'Sunday': 6
}

def haversine_distance(lat1, lon1, lat2, lon2):
    phi1 = np.radians(lat1)
    phi2 = np.radians(lat2)
    delta_phi = np.radians(lat2 - lat1)
    delta_lambda = np.radians(lon2 - lon1)
    a = np.sin(delta_phi/2.0)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(delta_lambda/2.0)**2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1-a))
    return 6371000 * c

def train_model():
    print("Training predictive hotspot model...")
    conn = sqlite3.connect(DB_PATH)
    
    # Load positive samples (violations)
    query = """
    SELECT latitude, longitude, hour, day_of_week, 
           dist_to_majestic_metro, dist_to_hosahalli_metro, 
           dist_to_indiranagar_metro, dist_to_mg_road_metro, 
           dist_to_yeshwanthpur_metro 
    FROM violations
    """
    pos_df = pd.read_sql_query(query, conn)
    conn.close()
    
    n_pos = len(pos_df)
    print(f"Loaded {n_pos} positive violation records.")
    
    # Convert day of week to integer
    pos_df['day_num'] = pos_df['day_of_week'].map(DAY_MAP).fillna(0).astype(int)
    pos_df['label'] = 1
    
    # Drop string column
    pos_df = pos_df.drop(columns=['day_of_week'])
    
    # Generate pseudo-negative samples (non-violations)
    print("Generating pseudo-negative samples across Bengaluru...")
    # Bounding box for violations in Bengaluru
    min_lat, max_lat = 12.90, 13.05
    min_lon, max_lon = 77.50, 77.70
    
    neg_lats = np.random.uniform(min_lat, max_lat, n_pos)
    neg_lons = np.random.uniform(min_lon, max_lon, n_pos)
    neg_hours = np.random.randint(0, 24, n_pos)
    neg_days = np.random.randint(0, 7, n_pos)
    
    neg_df = pd.DataFrame({
        'latitude': neg_lats,
        'longitude': neg_lons,
        'hour': neg_hours,
        'day_num': neg_days,
        'label': 0
    })
    
    # Compute distances to metro stations for negative samples
    for name, coords in METRO_STATIONS.items():
        neg_df[f"dist_to_{name.lower().replace(' ', '_')}_metro"] = haversine_distance(
            neg_df['latitude'].values, neg_df['longitude'].values, coords[0], coords[1]
        )
    
    # Align column order
    cols = [
        'latitude', 'longitude', 'hour', 'day_num', 
        'dist_to_majestic_metro', 'dist_to_hosahalli_metro', 
        'dist_to_indiranagar_metro', 'dist_to_mg_road_metro', 
        'dist_to_yeshwanthpur_metro', 'label'
    ]
    
    dataset = pd.concat([pos_df[cols], neg_df[cols]], ignore_index=True)
    
    # Downsample slightly to make training fast and fit in RAM easily (e.g. 100k samples total)
    # 50k positives, 50k negatives is extremely representative and trains in < 5 seconds!
    dataset_sample = dataset.sample(n=100000, random_state=42)
    
    X = dataset_sample.drop(columns=['label'])
    y = dataset_sample['label']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("Fitting Random Forest Classifier...")
    model = RandomForestClassifier(n_estimators=50, max_depth=12, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)
    
    # Evaluate
    train_preds = model.predict_proba(X_train)[:, 1]
    test_preds = model.predict_proba(X_test)[:, 1]
    
    train_auc = roc_auc_score(y_train, train_preds)
    test_auc = roc_auc_score(y_test, test_preds)
    
    print(f"Model trained successfully!")
    print(f"Train ROC-AUC: {train_auc:.4f}")
    print(f"Test ROC-AUC: {test_auc:.4f}")
    
    # Save model and meta
    payload = {
        'model': model,
        'features': X.columns.tolist(),
        'auc': test_auc
    }
    
    joblib.dump(payload, MODEL_PATH)
    print(f"Model saved to {MODEL_PATH}")

# Global model state
_model_payload = None

def load_model():
    global _model_payload
    if _model_payload is None:
        if not os.path.exists(MODEL_PATH):
            train_model()
        _model_payload = joblib.load(MODEL_PATH)
    return _model_payload

def get_risk_prediction(lat, lon, hour, day_name):
    payload = load_model()
    model = payload['model']
    features = payload['features']
    
    day_num = DAY_MAP.get(day_name, 0)
    
    # Compute metro distances
    feat_dict = {
        'latitude': lat,
        'longitude': lon,
        'hour': hour,
        'day_num': day_num
    }
    
    for name, coords in METRO_STATIONS.items():
        key = f"dist_to_{name.lower().replace(' ', '_')}_metro"
        feat_dict[key] = haversine_distance(lat, lon, coords[0], coords[1])
        
    # Order features correctly
    x_input = [feat_dict[f] for f in features]
    x_df = pd.DataFrame([x_input], columns=features)
    
    prob = float(model.predict_proba(x_df)[0, 1])
    
    # Map probability to risk status
    # Since negative samples are randomly distributed, probabilities around 0.5+ are high risk occurrence
    if prob >= 0.70:
        level = "High"
    elif prob >= 0.40:
        level = "Medium"
    else:
        level = "Low"
        
    return {
        'probability': prob,
        'risk_level': level,
        'congestion_risk_score': int(prob * 100)
    }

if __name__ == "__main__":
    train_model()
